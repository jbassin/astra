"""heartwood-agent / heartwood-revert / the push-deploy tail replay the old recipes' exact argv
sequence and lock order (0037 ops-1a): host-tooling shared, dropped before waiting for
git-publish, retaken shared, released before the redeploy."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_ops import heartwood
from astra_ops.context import Fail
from astra_ops.testing import Call, Scripted, Step, clone, deploy_call, make_ctx, push_steps, uv

NODE = "/usr/bin/node"


def agent(ctx: object) -> int:
    """``heartwood-agent d`` with no flags, as ``Ctx.sub`` calls it (Fail -> exit code)."""
    from astra_ops.context import Ctx

    assert isinstance(ctx, Ctx)
    return heartwood.heartwood_agent(ctx, "d", dry_run=False, push=True, model_flags=[])


def hw(*args: str) -> list[str]:
    return uv("astra-heartwood-agent", *args)


def paths(repo: str) -> dict[str, str]:
    return {
        "data.content-root": repo,
        "data.akasha-content": f"{repo}/akasha/content",
        "data.akasha-snapshot": f"{repo}/akasha/snapshot",
        "data.heartwood-ledger": f"{repo}/heartwood/agent-runs.jsonl",
        "data.entity-registry": f"{repo}/entity/entity.kdl",
    }


def setup(tmp: Path) -> tuple[str, dict[str, str]]:
    repo = clone(tmp)
    cfg = paths(repo)
    Path(cfg["data.akasha-snapshot"]).mkdir(parents=True)
    Path(cfg["data.akasha-snapshot"], "akasha-snapshot.json").write_text("{}")
    return repo, cfg


def validate(content: str) -> list[str]:
    return [
        NODE,
        "--import",
        "./libs/ts/site-kit/src/nodeTsResolve.mjs",
        "libs/ts/vellum-lang/scripts/validate-corpus.ts",
        "--dir",
        content,
    ]


def agent_head(repo: str, cfg: dict[str, str], *, dry_run: bool = False) -> list[Step]:
    g = ["git", "-C", repo]
    content, ledger, entity = (
        cfg["data.akasha-content"],
        cfg["data.heartwood-ledger"],
        cfg["data.entity-registry"],
    )
    steps: list[Step] = [
        ("lock", "host-tooling", "sh"),
        Call([*g, "status", "--porcelain", "--", content, ledger, entity], out="capture"),
    ]
    if not dry_run:
        steps.append(Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"))
    return steps


def relock() -> list[Step]:
    return [
        ("unlock", "host-tooling"),
        ("lock", "git-publish", "ex"),
        ("lock", "host-tooling", "sh"),
    ]


def test_agent_full_publish(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    repo, cfg = setup(tmp_path)
    g = ["git", "-C", repo]
    content, snapshot = cfg["data.akasha-content"], cfg["data.akasha-snapshot"]
    ledger, entity = cfg["data.heartwood-ledger"], cfg["data.entity-registry"]
    four = [content, snapshot, ledger, entity]
    steps: list[Step] = [
        *agent_head(repo, cfg),
        Call(
            hw("run", "2026-1-2", "--model", "m1", "--sub-model", "m2"),
            stdout="progress\nRUN_DIR=/runs/old\nRUN_DIR=/runs/r1\n",
            out="tee",
        ),
        *relock(),
        Call(hw("publish-sync", "/runs/r1")),
        Call(validate(content)),
        Call(uv("akasha-snapshot")),
        Call(uv("astra-ontology-entity-seed")),
        Call(hw("unresolved-delta", "SNAPSHOT_BEFORE"), rc=1),
        Call([*g, "ls-files", "--error-unmatch", ledger], out="null"),
        Call(hw("ledger-append", "/runs/r1")),
        Call([*g, "add", *four]),
        Call(
            hw("commit-message", "/runs/r1"),
            stdout="feat(akasha): heartwood agent 2026-1-2\n\nbody\n",
            out="file",
        ),
        Call([*g, "commit", "--only", "--no-verify", "-q", "-F", "MSG", "--", *four]),
        Call([*g, "rev-parse", "--short", "HEAD"], stdout="abc1234\n"),
        ("unlock", "host-tooling"),
        *push_steps(repo),
        deploy_call(tmp_path, "akasha-frontend"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    _resolve_tmp_paths(r)
    rc = heartwood.heartwood_agent(
        ctx,
        "2026-1-2",
        dry_run=False,
        push=True,
        model_flags=["--model", "m1", "--sub-model", "m2"],
    )
    assert rc == 0
    r.assert_done()
    io = capsys.readouterr()
    assert "heartwood-agent: committed abc1234 feat(akasha): heartwood agent 2026-1-2" in io.out
    assert "heartwood: akasha-frontend redeployed — edits live" in io.out
    assert "unresolved-delta report failed — not fatal" in io.err


def _resolve_tmp_paths(r: object) -> None:
    """The temp dir is made at run time: patch the placeholders as calls arrive."""
    assert isinstance(r, Scripted)
    original = r.run

    def run(argv, **kw):
        argv = list(argv)
        pending = r.steps[0] if r.steps else None
        if isinstance(pending, Call):
            pending.argv = [_placeholder(a, argv) for a in pending.argv]
        return original(argv, **kw)

    r.run = run  # ty: ignore[invalid-assignment]


def _placeholder(want: str, got: list[str]) -> str:
    for g in got:
        if want == "SNAPSHOT_BEFORE" and g.endswith("/snapshot-before.json"):
            return g
        if want == "MSG" and g.endswith("/msg"):
            return g
    return want


def test_agent_dry_run_takes_no_publish_lock(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo, cfg = setup(tmp_path)
    steps: list[Step] = [
        *agent_head(repo, cfg, dry_run=True),
        Call(hw("run", "d", "--dry-run"), stdout="RUN_DIR=/runs/r\n", out="tee"),
        ("unlock", "host-tooling"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert heartwood.heartwood_agent(ctx, "d", dry_run=True, push=True, model_flags=[]) == 0
    r.assert_done()
    assert "  diff:    /runs/r/diff.patch" in capsys.readouterr().out


def test_agent_no_push_stops_after_commit(tmp_path: Path) -> None:
    repo, cfg = setup(tmp_path)
    g = ["git", "-C", repo]
    four = [
        cfg[k]
        for k in (
            "data.akasha-content",
            "data.akasha-snapshot",
            "data.heartwood-ledger",
            "data.entity-registry",
        )
    ]
    steps: list[Step] = [
        *agent_head(repo, cfg),
        Call(hw("run", "d"), stdout="RUN_DIR=/r\n"),
        *relock(),
        Call(hw("publish-sync", "/r")),
        Call(validate(four[0])),
        Call(uv("akasha-snapshot")),
        Call(uv("astra-ontology-entity-seed")),
        Call(hw("unresolved-delta", "SNAPSHOT_BEFORE")),
        Call([*g, "ls-files", "--error-unmatch", four[2]], rc=1),
        Call(hw("ledger-append", "/r")),
        Call([*g, "add", *four]),
        Call(hw("commit-message", "/r"), stdout="subject\n"),
        Call([*g, "commit", "--only", "--no-verify", "-q", "-F", "MSG", "--", *four]),
        Call([*g, "rev-parse", "--short", "HEAD"], stdout="abc\n"),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    _resolve_tmp_paths(r)
    assert heartwood.heartwood_agent(ctx, "d", dry_run=False, push=False, model_flags=[]) == 0
    r.assert_done()


@pytest.mark.parametrize("rc", [1, 2])
def test_agent_failed_run_publishes_nothing(
    tmp_path: Path, rc: int, capsys: pytest.CaptureFixture[str]
) -> None:
    repo, cfg = setup(tmp_path)
    steps: list[Step] = [
        *agent_head(repo, cfg),
        Call(hw("run", "d"), rc=rc, stdout="RUN_DIR=/r\n"),
        ("unlock", "host-tooling"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert heartwood.heartwood_agent(ctx, "d", dry_run=False, push=True, model_flags=[]) == rc
    r.assert_done()
    assert (
        f"run exited {rc} (1 failed / 2 incomplete) — nothing published; artifacts: /r"
        in capsys.readouterr().err
    )


def test_agent_dirty_corpus_exit_6(tmp_path: Path) -> None:
    repo, cfg = setup(tmp_path)
    head = agent_head(repo, cfg)
    dirty = head[1]
    assert isinstance(dirty, Call)
    dirty.stdout = " M page.vel\n"
    ctx, r = make_ctx(tmp_path, [*head[:2], ("unlock", "host-tooling")], config=cfg)
    assert heartwood.heartwood_agent(ctx, "d", dry_run=False, push=True, model_flags=[]) == 6
    r.assert_done()


def test_agent_publish_sync_conflict_passes_code_through(tmp_path: Path) -> None:
    repo, cfg = setup(tmp_path)
    steps: list[Step] = [
        *agent_head(repo, cfg),
        Call(hw("run", "d"), stdout="RUN_DIR=/r\n"),
        *relock(),
        Call(hw("publish-sync", "/r"), rc=3),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert heartwood.heartwood_agent(ctx, "d", dry_run=False, push=True, model_flags=[]) == 3
    r.assert_done()


def test_agent_validation_failure_prints_restore_exit_7(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo, cfg = setup(tmp_path)
    content = cfg["data.akasha-content"]
    steps: list[Step] = [
        *agent_head(repo, cfg),
        Call(hw("run", "d"), stdout="RUN_DIR=/r\n"),
        *relock(),
        Call(hw("publish-sync", "/r")),
        Call(validate(content), rc=1),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert ctx.sub(agent, ctx) == 7
    r.assert_done()
    err = capsys.readouterr().err
    assert "corpus validation FAILED after publish-sync" in err
    assert f"git -C {repo} clean -fd {content}" in err


def test_agent_git_publish_busy_exit_10(tmp_path: Path) -> None:
    import fcntl

    repo, cfg = setup(tmp_path)
    steps: list[Step] = [
        *agent_head(repo, cfg),
        Call(hw("run", "d"), stdout="RUN_DIR=/r\n"),
        ("unlock", "host-tooling"),
        ("lock", "git-publish", "ex"),
        ("lock-busy", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    ctx.git_publish_lock.parent.mkdir(parents=True)
    with ctx.git_publish_lock.open("w") as held:
        fcntl.flock(held.fileno(), fcntl.LOCK_EX)
        assert ctx.sub(agent, ctx) == 10
    r.assert_done()


def test_agent_node_missing_exit_1(tmp_path: Path) -> None:
    ctx, r = make_ctx(
        tmp_path, [("lock", "host-tooling", "sh"), ("unlock", "host-tooling")], node=None
    )
    assert heartwood.heartwood_agent(ctx, "d", dry_run=False, push=True, model_flags=[]) == 1
    r.assert_done()


def test_find_node_falls_back_to_newest_nvm(tmp_path: Path) -> None:
    ctx, _ = make_ctx(tmp_path, [], node=None)
    for v in ("v9.1.0", "v24.2.0", "v24.10.1"):
        p = tmp_path / "home" / ".nvm" / "versions" / "node" / v / "bin"
        p.mkdir(parents=True)
        (p / "node").write_text("")
    assert heartwood.find_node(ctx) == str(tmp_path / "home/.nvm/versions/node/v24.10.1/bin/node")


def test_parse_agent_flags() -> None:
    assert heartwood.parse_agent_flags(["--dry-run", "--model=a", "--sub-model=b", "--yes"]) == (
        True,
        True,
        ["--model", "a", "--sub-model", "b"],
        True,
    )
    assert heartwood.parse_agent_flags(["--no-push"]) == (False, False, [], False)
    for bad in (["--model="], ["--model", "a"], ["-y"]):
        with pytest.raises(Fail) as exc:
            heartwood.parse_agent_flags(bad)
        assert exc.value.code == 64


# --- push-deploy -----------------------------------------------------------------------------


def test_push_deploy_failed_push_still_redeploys_exit_8(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    steps: list[Step] = [
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
        Call([*g, "fetch", "-q", "origin"], rc=1),
        deploy_call(tmp_path, "akasha-frontend"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert heartwood.push_deploy(ctx) == 8
    r.assert_done()


def test_push_deploy_failed_redeploy_exit_9(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    steps: list[Step] = [*push_steps(repo), deploy_call(tmp_path, "akasha-frontend", rc=7)]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert heartwood.push_deploy(ctx) == 9
    r.assert_done()


# --- heartwood-revert ------------------------------------------------------------------------


def revert_head(repo: str, cfg: dict[str, str], subject_line: str) -> list[Step]:
    g = ["git", "-C", repo]
    four = [
        cfg[k]
        for k in (
            "data.akasha-content",
            "data.akasha-snapshot",
            "data.heartwood-ledger",
            "data.entity-registry",
        )
    ]
    return [
        ("lock", "host-tooling", "sh"),
        Call([*g, "status", "--porcelain", "--", *four], out="capture"),
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
        Call(hw("ledger-revert", "d", "--check")),
        Call([*g, "log", "--format=%H%x09%s", "--", four[2]], stdout=subject_line),
    ]


def test_revert_full(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    repo, cfg = setup(tmp_path)
    g = ["git", "-C", repo]
    four = [
        cfg[k]
        for k in (
            "data.akasha-content",
            "data.akasha-snapshot",
            "data.heartwood-ledger",
            "data.entity-registry",
        )
    ]
    log = (
        "c2\tfeat(akasha): heartwood agent d2\n"
        "c1\tfeat(akasha): heartwood agent d\n"
        "c0\tfeat(akasha): heartwood agent d\n"
    )
    steps: list[Step] = [
        *revert_head(repo, cfg, log),
        Call(
            [*g, "log", "-1", "--format=%h %s", "c1"], stdout="c1 feat(akasha): heartwood agent d\n"
        ),
        *relock(),
        Call([*g, "revert", "--no-commit", "c1"], rc=1),
        Call([*g, "rev-parse", "-q", "--verify", "REVERT_HEAD"], out="null"),
        Call([*g, "checkout", "HEAD", "--", four[2], four[1], four[3]]),
        Call([*g, "diff", "--name-only", "--diff-filter=U"]),
        Call(hw("ledger-revert", "d")),
        Call(uv("akasha-snapshot")),
        Call(uv("astra-ontology-entity-seed")),
        Call(validate(four[0])),
        Call([*g, "add", *four]),
        Call(
            [
                *g,
                "commit",
                "--only",
                "--no-verify",
                "-q",
                "-m",
                "revert(akasha): heartwood agent d",
                "-m",
                "This reverts commit c1.",
                "--",
                *four,
            ]
        ),
        Call([*g, "rev-parse", "--short", "HEAD"], stdout="def\n"),
        ("unlock", "host-tooling"),
        *push_steps(repo),
        deploy_call(tmp_path, "akasha-frontend"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert heartwood.heartwood_revert(ctx, "d") == 0
    r.assert_done()
    out = capsys.readouterr().out
    assert "heartwood-revert: reverting c1 feat(akasha): heartwood agent d" in out
    assert "heartwood-revert: committed def" in out


def test_revert_content_conflict_aborts_exit_8(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo, cfg = setup(tmp_path)
    g = ["git", "-C", repo]
    four = [
        cfg[k]
        for k in (
            "data.akasha-content",
            "data.akasha-snapshot",
            "data.heartwood-ledger",
            "data.entity-registry",
        )
    ]
    steps: list[Step] = [
        *revert_head(repo, cfg, "c1\tfeat(akasha): heartwood agent d\n"),
        Call([*g, "log", "-1", "--format=%h %s", "c1"], stdout="c1 s\n"),
        *relock(),
        Call([*g, "revert", "--no-commit", "c1"], rc=1),
        Call([*g, "rev-parse", "-q", "--verify", "REVERT_HEAD"]),
        Call([*g, "checkout", "HEAD", "--", four[2], four[1], four[3]]),
        Call([*g, "diff", "--name-only", "--diff-filter=U"], stdout="a.vel\nb.vel\n"),
        Call([*g, "revert", "--abort"]),
        ("unlock", "host-tooling"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert heartwood.heartwood_revert(ctx, "d") == 8
    r.assert_done()
    assert "  a.vel\n  b.vel\n" in capsys.readouterr().err


def test_revert_no_commit_found_exit_4(tmp_path: Path) -> None:
    repo, cfg = setup(tmp_path)
    steps: list[Step] = [
        *revert_head(repo, cfg, "c\tfeat(akasha): heartwood agent other\n"),
        ("unlock", "host-tooling"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert heartwood.heartwood_revert(ctx, "d") == 4
    r.assert_done()


def test_revert_not_published_exit_4(tmp_path: Path) -> None:
    repo, cfg = setup(tmp_path)
    head = revert_head(repo, cfg, "")[:4]
    check = head[3]
    assert isinstance(check, Call)
    check.rc = 1
    ctx, r = make_ctx(tmp_path, [*head, ("unlock", "host-tooling")], config=cfg)
    assert heartwood.heartwood_revert(ctx, "d") == 4
    r.assert_done()
