"""The astra-data publish chain replays the old recipes' exact argv sequence.

Each test scripts every child process and lock step the command takes, in order; the
scripted runner fails on any other call. The expected argv lists are the ones the bash
recipes ran (the `justfile` before the move), with ``just <sub-recipe>`` hops replaced by the
sub-recipe's own children.
"""

from __future__ import annotations

import fcntl
import json
import subprocess
from pathlib import Path

import pytest
from astra_ops import publish
from astra_ops.publish import AKASHA_SEED_SH, MOUTHPIECE_SEED_SH, deployed_data_sha
from astra_ops.testing import Call, Step, clone, deploy_call, make_ctx, push_steps, uv

# --- _astra-data-push ------------------------------------------------------------------------


def test_push_up_to_date_clone_pushes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    repo = clone(tmp_path)
    ctx, r = make_ctx(tmp_path, push_steps(repo), config={"data.content-root": repo})
    assert publish.astra_data_push(ctx) == 0
    r.assert_done()
    assert capsys.readouterr().out == "astra-data: pushed abc1234\n"


def test_push_rebases_when_origin_moved(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    repo = clone(tmp_path)
    ctx, r = make_ctx(
        tmp_path, push_steps(repo, moved=True, ahead=False), config={"data.content-root": repo}
    )
    assert publish.astra_data_push(ctx) == 0
    r.assert_done()
    assert (
        capsys.readouterr().out
        == "astra-data: rebased onto origin/main\nastra-data: nothing to push\n"
    )


def test_push_failed_rebase_aborts_exit_8(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    steps: list[Step] = [
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
        Call([*g, "fetch", "-q", "origin"]),
        Call([*g, "merge-base", "--is-ancestor", "origin/main", "HEAD"], rc=1),
        Call([*g, "rebase", "-q", "--autostash", "origin/main"], rc=1),
        Call([*g, "rebase", "--abort"]),
    ]
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert publish.astra_data_push(ctx) == 8
    r.assert_done()
    assert "rebase onto origin/main FAILED" in capsys.readouterr().err


@pytest.mark.parametrize(("branch", "fetch_rc"), [("feature", 0), ("main", 1)])
def test_push_refuses_off_main_or_fetch_failure(tmp_path: Path, branch: str, fetch_rc: int) -> None:
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    steps: list[Step] = [Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout=branch + "\n")]
    if branch == "main":
        steps.append(Call([*g, "fetch", "-q", "origin"], rc=fetch_rc))
    ctx, r = make_ctx(tmp_path, steps, config={"data.content-root": repo})
    assert publish.astra_data_push(ctx) == 8
    r.assert_done()


def test_push_missing_clone_exit_8(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [], config={"data.content-root": str(tmp_path / "nope")})
    assert publish.astra_data_push(ctx) == 8
    r.assert_done()


# --- mouthpiece-publish + seeds --------------------------------------------------------------


def test_mouthpiece_publish_passes_flags_through(tmp_path: Path) -> None:
    steps: list[Step] = [
        Call(uv("python", "-m", "astra_mouthpiece.publish", "--allow-shrink"), rc=3)
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert publish.mouthpiece_publish(ctx, ["--allow-shrink"]) == 3
    r.assert_done()


def test_seeds_run_one_alpine_container_each(tmp_path: Path) -> None:
    state = tmp_path / "state"
    mp, ak = f"{state}/audio/mouthpiece", f"{state}/audio/akasha"
    steps: list[Step] = [
        Call(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{mp}:/audio",
                "-v",
                f"{state}/mouthpiece/episodes:/live:ro",
                "alpine",
                "sh",
                "-c",
                MOUTHPIECE_SEED_SH,
                "sh",
                mp,
            ]
        ),
        Call(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{ak}:/audio",
                "-v",
                f"{state}/scribe/data/saved:/live:ro",
                "alpine",
                "sh",
                "-c",
                AKASHA_SEED_SH,
                "sh",
                ak,
            ],
            rc=125,
        ),
    ]
    ctx, r = make_ctx(tmp_path, steps)
    assert publish.mouthpiece_seed(ctx) == 0
    assert publish.akasha_seed(ctx) == 125
    r.assert_done()
    assert Path(mp).is_dir() and Path(ak).is_dir()  # mkdir -p before the bind mount


def test_seed_scripts_match_the_old_recipes() -> None:
    # The old recipes spliced the host dir into the echo; it is now the positional $1.
    assert MOUTHPIECE_SEED_SH == (
        "set -e\n"
        r'find /live -name "*.episode.mp3" -exec sh -c "cp \"\$1\" \"/audio/\$(basename \"\$1\"'
        r' .episode.mp3).mp3\"" _ {} \;'
        "\n"
        'n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n episode(s) into $1"; '
        "ls -1 /audio\n"
    )
    assert AKASHA_SEED_SH == (
        "set -e\n"
        'for d in /live/*/; do f="${d}audio.mp3"; [ -e "$f" ] || continue; '
        'cp "$f" "/audio/$(basename "$d").mp3"; done\n'
        'n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n session(s) into $1"\n'
    )


def test_seed_script_runs_under_sh(tmp_path: Path) -> None:
    """The akasha script really flattens `<date>/audio.mp3` (sh stands in for alpine)."""
    live, audio = tmp_path / "live", tmp_path / "audio"
    (live / "2026-1-2").mkdir(parents=True)
    (live / "2026-1-2" / "audio.mp3").write_text("x")
    (live / "no-audio").mkdir()
    audio.mkdir()
    script = AKASHA_SEED_SH.replace("/live", str(live)).replace("/audio/", f"{audio}/")
    out = subprocess.run(
        ["sh", "-c", script, "sh", "HOSTDIR"], capture_output=True, text=True, check=True
    )
    assert (audio / "2026-1-2.mp3").read_text() == "x"
    assert out.stdout.strip() == "seeded 1 session(s) into HOSTDIR"


# --- linguist-commit -------------------------------------------------------------------------


def linguist_config(repo: str) -> dict[str, str]:
    return {
        "data.content-root": repo,
        "data.linguist-transcripts": f"{repo}/linguist/transcripts",
        "data.linguist-data": f"{repo}/linguist/data",
        "data.linguist-timeline": f"{repo}/linguist/timeline",
        "data.mouthpiece-snapshot": f"{repo}/mouthpiece/snapshot",
        "data.akasha-content": f"{repo}/akasha/content",
        "data.akasha-snapshot": f"{repo}/akasha/snapshot",
    }


def lc_head(repo: str) -> list[Step]:
    return [
        ("lock", "git-publish", "ex"),
        Call(["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
    ]


def seed_call(tmp: Path, which: str) -> Call:
    audio = f"{tmp}/state/audio/{which}"
    live = (
        f"{tmp}/state/mouthpiece/episodes"
        if which == "mouthpiece"
        else f"{tmp}/state/scribe/data/saved"
    )
    script = MOUTHPIECE_SEED_SH if which == "mouthpiece" else AKASHA_SEED_SH
    return Call(
        [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{audio}:/audio",
            "-v",
            f"{live}:/live:ro",
            "alpine",
            "sh",
            "-c",
            script,
            "sh",
            audio,
        ]
    )


def test_linguist_commit_full_run(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """New linguist files + a changed snapshot: both commits, push, both seeds + redeploys."""
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    lp = [f"{repo}/linguist/transcripts", f"{repo}/linguist/data", f"{repo}/linguist/timeline"]
    snap = f"{repo}/mouthpiece/snapshot/episodes-index.json"
    steps: list[Step] = [
        *lc_head(repo),
        Call([*g, "add", *lp]),
        Call([*g, "diff", "--cached", "--quiet", "--", *lp], rc=1),
        Call(
            [*g, "diff", "--cached", "--name-only", "--no-renames", "--", *lp],
            stdout="a.json\nb.json\n",
        ),
        Call(
            [*g, "diff", "--cached", "--name-only", "--no-renames", "-z", "--", *lp],
            stdout=b"a.json\0b.json\0",
        ),
        Call(
            [
                *g,
                "commit",
                "--no-verify",
                "-q",
                "--only",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
                "-m",
                "chore(content): add 2 linguist transcript/data file(s)",
                "-m",
                "Pipeline-generated source-of-record, committed by the linguist-commit timer.",
            ],
            stdin=b"a.json\0b.json\0",
        ),
        Call(uv("python", "-m", "astra_mouthpiece.publish")),
        Call([*g, "add", snap]),
        Call([*g, "diff", "--cached", "--quiet", "--", snap], rc=1),
        Call(
            [
                *g,
                "commit",
                "--no-verify",
                "-q",
                "--only",
                "-m",
                "chore(content): refresh the mouthpiece episode catalog",
                "-m",
                "Regenerated from the live corpus by the linguist-commit timer.",
                "--",
                snap,
            ]
        ),
        *push_steps(repo),
        seed_call(tmp_path, "akasha"),
        deploy_call(tmp_path, "--skip-failed", "akasha-frontend"),
        seed_call(tmp_path, "mouthpiece"),
        deploy_call(tmp_path, "--skip-failed", "mouthpiece-frontend"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.linguist_commit(ctx) == 0
    r.assert_done()
    out = capsys.readouterr().out
    assert "linguist-commit: committed 2 file(s)" in out
    assert "linguist-commit: akasha-frontend redeployed" in out
    assert "linguist-commit: mouthpiece-frontend redeployed" in out


def test_linguist_commit_nothing_new_checks_staleness(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """No new files, publish fails (non-fatal); akasha is stale against history.jsonl and its
    build already failed (exit 11, no page); mouthpiece has no deploy record (unchanged)."""
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    lp = [f"{repo}/linguist/transcripts", f"{repo}/linguist/data", f"{repo}/linguist/timeline"]
    baked = [
        f"{repo}/linguist/data",
        f"{repo}/linguist/timeline",
        f"{repo}/akasha/content",
        f"{repo}/akasha/snapshot",
    ]
    hist = tmp_path / "state" / "deploy" / "history.jsonl"
    hist.parent.mkdir(parents=True)
    hist.write_text(
        json.dumps(
            {"mode": "deploy", "result": "ok", "data_sha": "d1", "services": ["akasha-frontend"]}
        )
        + "\n"
    )
    steps: list[Step] = [
        *lc_head(repo),
        Call([*g, "add", *lp]),
        Call([*g, "diff", "--cached", "--quiet", "--", *lp]),
        Call(uv("python", "-m", "astra_mouthpiece.publish"), rc=1),
        *push_steps(repo, ahead=False),
        Call([*g, "diff", "--quiet", "d1", "HEAD", "--", *baked], rc=1),
        seed_call(tmp_path, "akasha"),
        deploy_call(tmp_path, "--skip-failed", "akasha-frontend", rc=11),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.linguist_commit(ctx) == 0
    r.assert_done()
    err = capsys.readouterr().err
    assert "mouthpiece-publish FAILED" in err
    assert "akasha-frontend not rebuilt" in err


def test_linguist_commit_push_failure_still_redeploys_then_exits_1(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    lp = [f"{repo}/linguist/transcripts", f"{repo}/linguist/data", f"{repo}/linguist/timeline"]
    snap = f"{repo}/mouthpiece/snapshot/episodes-index.json"
    steps: list[Step] = [
        *lc_head(repo),
        Call([*g, "add", *lp]),
        Call([*g, "diff", "--cached", "--quiet", "--", *lp]),
        Call(uv("python", "-m", "astra_mouthpiece.publish")),
        Call([*g, "add", snap]),
        Call([*g, "diff", "--cached", "--quiet", "--", snap]),
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n"),
        Call([*g, "fetch", "-q", "origin"], rc=128),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.linguist_commit(ctx) == 1
    r.assert_done()


def test_linguist_commit_redeploy_failure_exits_1(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    g = ["git", "-C", repo]
    lp = [f"{repo}/linguist/transcripts", f"{repo}/linguist/data", f"{repo}/linguist/timeline"]
    steps: list[Step] = [
        *lc_head(repo),
        Call([*g, "add", *lp]),
        Call([*g, "diff", "--cached", "--quiet", "--", *lp], rc=1),
        Call([*g, "diff", "--cached", "--name-only", "--no-renames", "--", *lp], stdout="a\n"),
        Call(
            [*g, "diff", "--cached", "--name-only", "--no-renames", "-z", "--", *lp], stdout=b"a\0"
        ),
        Call(
            [
                *g,
                "commit",
                "--no-verify",
                "-q",
                "--only",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
                "-m",
                "chore(content): add 1 linguist transcript/data file(s)",
                "-m",
                "Pipeline-generated source-of-record, committed by the linguist-commit timer.",
            ]
        ),
        Call(uv("python", "-m", "astra_mouthpiece.publish"), rc=1),
        *push_steps(repo),
        seed_call(tmp_path, "akasha"),
        deploy_call(tmp_path, "--skip-failed", "akasha-frontend", rc=7),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.linguist_commit(ctx) == 1
    r.assert_done()


def test_linguist_commit_failing_git_add_exits_with_gits_code(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    lp = [f"{repo}/linguist/transcripts", f"{repo}/linguist/data", f"{repo}/linguist/timeline"]
    steps: list[Step] = [
        *lc_head(repo),
        Call(["git", "-C", repo, "add", *lp], rc=128),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.Ctx.sub(publish.linguist_commit, ctx) == 128
    r.assert_done()


def test_linguist_commit_lock_busy_runs_nothing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = clone(tmp_path)
    ctx, r = make_ctx(tmp_path, [("lock", "git-publish", "ex"), ("lock-busy", "git-publish")])
    ctx.config_reader = lambda keys: [linguist_config(repo)[k] for k in keys]
    ctx.git_publish_lock.parent.mkdir(parents=True)
    with ctx.git_publish_lock.open("w") as held:
        fcntl.flock(held.fileno(), fcntl.LOCK_EX)
        assert publish.linguist_commit(ctx) == 1
    r.assert_done()
    assert "git-publish lock busy for 30 min" in capsys.readouterr().err


def test_linguist_commit_off_main_refuses(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    steps: list[Step] = [
        ("lock", "git-publish", "ex"),
        Call(["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD"], stdout="other\n"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=linguist_config(repo))
    assert publish.linguist_commit(ctx) == 1
    r.assert_done()


def test_linguist_commit_against_a_real_clone(tmp_path: Path) -> None:
    """git really runs (commit --only from a NUL pathspec on stdin, push to a bare origin);
    uv, docker and deploy.sh are scripted."""
    origin = tmp_path / "origin.git"
    repo = tmp_path / "state" / "astra-data"
    env = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "init.defaultBranch=main"]
    subprocess.run(["git", *env, "init", "-q", "--bare", str(origin)], check=True)
    subprocess.run(
        ["git", *env, "clone", "-q", str(origin), str(repo)], check=True, capture_output=True
    )
    for k, v in (("user.name", "t"), ("user.email", "t@t")):
        subprocess.run(["git", "-C", str(repo), "config", k, v], check=True)
    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "-b", "main"], check=True)
    (repo / "seed").write_text("x")
    subprocess.run(["git", "-C", str(repo), "add", "seed"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "seed"], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "push", "-q", "origin", "main"], check=True, capture_output=True
    )
    cfg = linguist_config(str(repo))
    for key in ("data.linguist-transcripts", "data.linguist-data", "data.linguist-timeline"):
        Path(cfg[key]).mkdir(parents=True)
    Path(cfg["data.linguist-data"], "new.json").write_text("{}")
    (repo / "unrelated").write_text("staged elsewhere")
    subprocess.run(["git", "-C", str(repo), "add", "unrelated"], check=True)
    Path(cfg["data.mouthpiece-snapshot"]).mkdir(parents=True)
    Path(cfg["data.mouthpiece-snapshot"], "episodes-index.json").write_text("[]")
    steps: list[Step] = [
        ("lock", "git-publish", "ex"),
        Call(uv("python", "-m", "astra_mouthpiece.publish")),
        seed_call(tmp_path, "akasha"),
        deploy_call(tmp_path, "--skip-failed", "akasha-frontend"),
        seed_call(tmp_path, "mouthpiece"),
        deploy_call(tmp_path, "--skip-failed", "mouthpiece-frontend"),
        ("unlock", "git-publish"),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg, passthrough=frozenset({"git"}))
    assert publish.linguist_commit(ctx) == 0
    r.assert_done()
    log = subprocess.run(
        ["git", "--git-dir", str(origin), "log", "--format=%s", "main"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.splitlines()
    assert log == [
        "chore(content): refresh the mouthpiece episode catalog",
        "chore(content): add 1 linguist transcript/data file(s)",
        "seed",
    ]
    staged = subprocess.run(
        ["git", "-C", str(repo), "diff", "--cached", "--name-only"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    assert staged == ["unrelated"]  # --only kept the other staged change out of both commits


# --- history.jsonl selection (the jq pipeline) ------------------------------------------------


def test_deployed_data_sha_selection(tmp_path: Path) -> None:
    hist = tmp_path / "history.jsonl"
    lines = [
        {"mode": "deploy", "result": "ok", "data_sha": "a", "services": "all"},
        "not json",
        [1, 2],
        {"mode": "dry-run", "result": "ok", "data_sha": "x", "services": "all"},
        {"mode": "deploy", "result": "failed", "data_sha": "x", "services": "all"},
        {"mode": "deploy", "result": "unhealthy", "data_sha": "b", "services": ["akasha-frontend"]},
        {"mode": "deploy", "result": "ok", "data_sha": "", "services": "all"},
        {"mode": "deploy", "result": "ok", "data_sha": "c", "services": ["codex"]},
    ]
    hist.write_text("\n".join(x if isinstance(x, str) else json.dumps(x) for x in lines) + "\n")
    assert deployed_data_sha(hist, "akasha-frontend") == "b"
    assert deployed_data_sha(hist, "mouthpiece-frontend") == "a"
    assert deployed_data_sha(hist, "codex") == "c"
    assert deployed_data_sha(tmp_path / "missing", "codex") == ""


def test_deployed_data_sha_jq_quirks(tmp_path: Path) -> None:
    hist = tmp_path / "history.jsonl"
    hist.write_text(
        json.dumps({"mode": "deploy", "result": "ok", "services": "all"})
        + "\n"
        + json.dumps({"mode": "deploy", "result": "ok", "data_sha": "z", "services": None})
        + "\n"
        + json.dumps({"mode": "deploy", "result": "ok", "data_sha": "after", "services": "all"})
        + "\n"
    )
    # Checked against jq: the first line prints "null"; the second is a jq error ("Cannot
    # iterate over null") that skips only that line, so the last line wins.
    assert deployed_data_sha(hist, "akasha-frontend") == "after"
    hist.write_text(json.dumps({"mode": "deploy", "result": "ok", "services": "all"}) + "\n")
    assert deployed_data_sha(hist, "akasha-frontend") == "null"
