"""heartwood-agent, heartwood-revert and their shared push + redeploy tail (moved from the
justfile, 0037 ops-1a; same steps, argv, lock order and exit codes).

Every git step runs in the astra-data clone (config ``data.content-root``), which holds the
wiki content, its snapshot, the ledger and the entity registry — never the code repo.

**heartwood-agent** runs the agent over ONE session and publishes its edits with no human
review (0033 §5) — PAID (OpenRouter) and LIVE (pushes and redeploys akasha):

- ``heartwood-agent <date>``: run, publish, commit, push, redeploy;
- ``--dry-run``: run and write artifacts only (still PAID); prints the diff and summary paths;
- ``--no-push``: commit locally, no push or redeploy (the backfill);
- ``--model=<id>`` / ``--sub-model=<id>``: override heartwood.model / sub-model for this run.

Steps: (0) refuse unless the wiki content, the ledger and the entity registry are clean in the
clone and its HEAD is on main; (1) ``astra-heartwood-agent run`` stages and runs (artifacts
under ``<heartwood.artifacts-path>/<date>/<run-id>/``); (2) publish-sync applies the change-set
to the live corpus (aborts, writing nothing, if a touched page changed live); (3) whole-corpus
validation; (4) akasha-snapshot, then reseed entity.kdl from the new snapshot, then the
unresolved-link delta (reported only); a 3/4 failure prints the exact restore command;
(5) ledger-append plus a path-scoped ``commit --only`` of content, snapshot, ledger and
entity.kdl; (6) ``push_deploy``.

Exit codes (``astra_heartwood.requests.EXIT_MEANINGS`` mirrors them): 0 ok · 1 run failed
(or declined at the prompt) · 2 run incomplete (iteration cap) · 3 publish conflict ·
4 publish refused · 6 dirty corpus/ledger/registry or not on main · 7 validate/snapshot/seed
failed (restore printed) · 8 commit/rebase/push failed · 9 redeploy failed · 10 git-publish or
host-tooling lock busy for 30 min, nothing written · 64 bad flag, or no terminal and no --yes.

**heartwood-revert** undoes ONE published session — LIVE. ``git revert --no-commit`` of the
session's latest ``feat(akasha): heartwood agent <date>`` commit; the ledger, snapshot and
registry are restored from HEAD (they conflict on any non-latest revert) and regenerated; a
``reverted`` ledger line is appended; the corpus is validated; ``revert(akasha): heartwood
agent <date>`` is committed (``--only``), pushed and redeployed. A content conflict (a later
session edited the same lines) aborts the revert untouched. Exit codes: 4 not published / no
commit found · 6 dirty tree or not on main · 7 snapshot/seed/validate failed ·
8 revert/commit/push failed · 9 redeploy failed · 10 a lock busy for 30 min.

**Locks.** Both commands hold the host-tooling lock SHARED through every venv step, so a deploy
never re-syncs the venv under them (deploy.sh step 3b takes it exclusively). Lock order:
git-publish first, then host-tooling; never wait for git-publish while holding host-tooling
(linguist-commit holds git-publish while its deploy wants host-tooling). So each command drops
host-tooling, takes git-publish, then takes host-tooling again, and releases host-tooling
before the redeploy (whose deploy.sh would otherwise wait on its own caller).
"""

from __future__ import annotations

import re
import shutil
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .context import Ctx, Fail, Lock, deploy
from .publish import astra_data_push, git_c

HEARTWOOD_KEYS = (
    "data.content-root",
    "data.akasha-content",
    "data.akasha-snapshot",
    "data.heartwood-ledger",
    "data.entity-registry",
)

AGENT_FLAGS_HELP = "use --dry-run / --no-push / --model=<id> / --sub-model=<id> / --yes"


def _node_version_key(path: Path) -> list[tuple[int, int | str]]:
    """``sort -V`` order for ``~/.nvm/versions/node/v<x.y.z>/bin/node``."""
    parts = re.split(r"(\d+)", path.parts[-3] if len(path.parts) >= 3 else str(path))
    return [(0, int(p)) if p.isdigit() else (1, p) for p in parts if p]


def find_node(ctx: Ctx) -> str | None:
    """node on PATH, else the newest nvm install (a systemd unit's PATH has no nvm). Same
    order as ``astra_heartwood.agent.validate.find_node``."""
    found = ctx.which("node")
    if found:
        return found
    installs = sorted(ctx.home.glob(".nvm/versions/node/v*/bin/node"), key=_node_version_key)
    return str(installs[-1]) if installs else None


def validate_argv(node: str, content: str) -> list[str]:
    return [
        node,
        "--import",
        "./libs/ts/vellum-lang/node_modules/tsx/dist/loader.mjs",
        "libs/ts/vellum-lang/scripts/validate-corpus.ts",
        "--dir",
        content,
    ]


def hw(ctx: Ctx, *args: str) -> list[str]:
    return ctx.uv_run("astra-heartwood-agent", *args)


def _read_paths(ctx: Ctx) -> list[str]:
    try:
        return ctx.config(*HEARTWOOD_KEYS)
    except Exception as exc:  # any config failure: the same refusal
        ctx.err(f"heartwood: could not read data paths from config ({exc})")
        raise Fail(1) from exc


def _relock_for_publish(ctx: Ctx, ht: Lock, gp: Lock, command: str, nothing: str) -> None:
    """Drop host-tooling, wait for git-publish, retake host-tooling shared (the lock order)."""
    ht.release()
    if not gp.acquire():
        ctx.err(f"{command}: git-publish lock busy for 30 min — {nothing}")
        raise Fail(10)
    if not ht.acquire():
        ctx.err(f"{command}: host-tooling lock busy for 30 min — {nothing}")
        raise Fail(10)


@dataclass(frozen=True)
class Wiki:
    """The astra-data clone and the four wiki datasets in it (config.kdl, absolute paths; git
    accepts them as pathspecs). Every git call targets the clone."""

    repo: str
    content: str
    snapshot: str
    ledger: str
    entity: str

    @property
    def git(self) -> list[str]:
        return git_c(self.repo)

    @property
    def four(self) -> list[str]:
        return [self.content, self.snapshot, self.ledger, self.entity]

    @property
    def restore(self) -> str:
        """The command that puts the corpus back after an unvalidated publish."""
        r = self.repo
        return (
            f"git -C {r} checkout -- {self.content} {self.snapshot} {self.entity} && "
            f"git -C {r} clean -fd {self.content}"
        )


def _preflight(ctx: Ctx, command: str, missing_suffix: str) -> tuple[str, Wiki]:
    """node, then the config paths, then the clone; the same order and messages as before."""
    node = find_node(ctx)
    if not node:
        ctx.err("heartwood: node not found (PATH or ~/.nvm) — nothing done")
        raise Fail(1)
    wiki = Wiki(*_read_paths(ctx))
    if not Path(wiki.repo, ".git").is_dir():
        ctx.err(f"{command}: the astra-data clone {wiki.repo} is missing{missing_suffix}")
        raise Fail(6)
    return node, wiki


def _on_main(ctx: Ctx, wiki: Wiki) -> bool:
    return ctx.output([*wiki.git, "rev-parse", "--abbrev-ref", "HEAD"]) == "main"


def _regenerate(ctx: Ctx, node: str, wiki: Wiki, fail: Callable[[str, int], Fail]) -> None:
    """Snapshot + registry reseed + validation, in the given order."""
    steps = {
        "corpus validation": validate_argv(node, wiki.content),
        "akasha-snapshot": ctx.uv_run("akasha-snapshot"),
        "entity registry seed": ctx.uv_run("astra-ontology-entity-seed"),
    }
    for what, argv in steps.items():
        if ctx.run(argv) != 0:
            raise fail(what, 7)


# --- push + redeploy -------------------------------------------------------------------------


def push_deploy(ctx: Ctx) -> int:
    """The shared tail: push the astra-data clone, then rebuild and redeploy akasha-frontend
    (deploy.sh bakes the clone's committed HEAD). A failed push still redeploys, then exits 8;
    9 = redeploy failed. Rerunning retries both."""
    push_rc = ctx.sub(astra_data_push, ctx)
    if ctx.sub(deploy, ctx, "akasha-frontend") == 0:
        ctx.out("heartwood: akasha-frontend redeployed — edits live")
    else:
        ctx.err("heartwood: akasha redeploy FAILED (rerun: just deploy akasha-frontend)")
        return 9
    if push_rc != 0:
        ctx.err("heartwood: astra-data push FAILED — rerun: just _heartwood-push-deploy")
        return 8
    return 0


# --- heartwood-agent -------------------------------------------------------------------------


def parse_agent_flags(flags: list[str]) -> tuple[bool, bool, list[str], bool]:
    """``(dry_run, push, model_flags, yes)``; an unknown flag raises ``Fail(64)``."""
    dry_run, push, yes = False, True, False
    model_flags: list[str] = []
    for f in flags:
        if f == "--dry-run":
            dry_run = True
        elif f == "--no-push":
            push = False
        elif f == "--yes":
            yes = True
        elif f.startswith("--model=") and len(f) > len("--model="):
            model_flags += ["--model", f.removeprefix("--model=")]
        elif f.startswith("--sub-model=") and len(f) > len("--sub-model="):
            model_flags += ["--sub-model", f.removeprefix("--sub-model=")]
        else:
            Ctx.err(f"heartwood-agent: unknown flag '{f}' ({AGENT_FLAGS_HELP})")
            raise Fail(64)
    return dry_run, push, model_flags, yes


def heartwood_agent(
    ctx: Ctx, date: str, *, dry_run: bool, push: bool, model_flags: list[str]
) -> int:
    """Run and publish one session (module docstring); returns the exit code. Confirmation
    happens in the CLI."""
    ctx.prepend_path(ctx.home / ".deno" / "bin")  # dspy launches bare `deno`
    ht = ctx.lock("host-tooling", shared=True)
    gp = ctx.lock("git-publish")
    tmp = Path(tempfile.mkdtemp())
    try:
        if not ht.acquire():
            ctx.err(
                "heartwood-agent: host-tooling lock busy for 30 min (a deploy is syncing the "
                "venv) — nothing written"
            )
            return 10
        node, wiki = _preflight(ctx, "heartwood", " — nothing done")
        _agent_refuse_dirty(ctx, wiki, dry_run=dry_run)
        _copy(ctx, Path(wiki.snapshot) / "akasha-snapshot.json", tmp / "snapshot-before.json")
        run_dir = _agent_run(ctx, date, tmp, dry_run=dry_run, model_flags=model_flags)
        if dry_run:
            ctx.out("heartwood-agent: dry run — nothing published.")
            ctx.out(f"  diff:    {run_dir}/diff.patch")
            ctx.out(f"  summary: {run_dir}/summary.json")
            return 0
        # One git publisher at a time: from publish-sync through push + redeploy, so
        # linguist-commit never builds akasha from unvalidated content.
        _relock_for_publish(ctx, ht, gp, "heartwood-agent", "nothing written; re-run the date")
        _agent_publish(ctx, node, wiki, run_dir, tmp)
        _agent_commit(ctx, wiki, run_dir, tmp)
        # (6) push + redeploy (the backfill passes --no-push and does this once at the end).
        if not push:
            ctx.out("heartwood-agent: --no-push — committed locally only")
            return 0
        ht.release()  # the redeploy below may re-sync the venv
        return push_deploy(ctx)
    except Fail as exc:
        return exc.code
    finally:
        ht.release()
        gp.release()
        shutil.rmtree(tmp, ignore_errors=True)


def _agent_refuse_dirty(ctx: Ctx, wiki: Wiki, *, dry_run: bool) -> None:
    """(0) a dirty corpus would be staged into the run and then committed under its name."""
    dirty = ctx.capture(
        [*wiki.git, "status", "--porcelain", "--", wiki.content, wiki.ledger, wiki.entity]
    )
    if dirty:
        ctx.err(
            f"heartwood-agent: refusing — uncommitted changes under {wiki.content} / "
            f"{wiki.ledger} / {wiki.entity}:"
        )
        ctx.err(dirty)
        raise Fail(6)
    if not dry_run and not _on_main(ctx, wiki):
        ctx.err(
            f"heartwood-agent: refusing — {wiki.repo} is not on main (publishes push origin main)"
        )
        raise Fail(6)


def _agent_run(ctx: Ctx, date: str, tmp: Path, *, dry_run: bool, model_flags: list[str]) -> str:
    """(1) stage + run, tee'd; returns the run dir (the CLI's last ``RUN_DIR=`` line)."""
    run_flags = [*model_flags, *(["--dry-run"] if dry_run else [])]
    rc = ctx.run(hw(ctx, "run", date, *run_flags), out="tee", out_path=tmp / "run.out")
    run_out = (tmp / "run.out").read_text(encoding="utf-8", errors="surrogateescape")
    prefix = "RUN_DIR="
    run_dirs = [line[len(prefix) :] for line in run_out.split("\n") if line.startswith(prefix)]
    run_dir = run_dirs[-1] if run_dirs else ""
    if rc != 0:
        where = f"; artifacts: {run_dir}" if run_dir else ""
        ctx.err(
            f"heartwood-agent: run exited {rc} (1 failed / 2 incomplete) — nothing published{where}"
        )
        raise Fail(rc)
    if not run_dir:
        ctx.err("heartwood-agent: run printed no RUN_DIR line")
        raise Fail(1)
    return run_dir


def _agent_publish(ctx: Ctx, node: str, wiki: Wiki, run_dir: str, tmp: Path) -> None:
    """(2) publish-sync, (3) validation, (4) snapshot, reseed + unresolved-link delta."""
    rc = ctx.run(hw(ctx, "publish-sync", run_dir))
    if rc != 0:
        ctx.err(
            f"heartwood-agent: publish-sync exited {rc} — the live corpus is untouched; "
            "re-run the date"
        )
        raise Fail(rc)

    def fail_restore(what: str, code: int) -> Fail:
        ctx.err(
            f"heartwood-agent: {what} FAILED after publish-sync — {wiki.content} holds the "
            "run's unvalidated edits."
        )
        ctx.err(f"  inspect, then restore with:  {wiki.restore}")
        return Fail(code)

    _regenerate(ctx, node, wiki, fail_restore)
    if ctx.run(hw(ctx, "unresolved-delta", str(tmp / "snapshot-before.json"))) != 0:
        ctx.err("heartwood-agent: (unresolved-delta report failed — not fatal)")


def _agent_commit(ctx: Ctx, wiki: Wiki, run_dir: str, tmp: Path) -> None:
    """(5) ledger line + path-scoped commit. --only: anything else staged stays out of it."""
    git = wiki.git
    tracked = ctx.run(
        [*git, "ls-files", "--error-unmatch", wiki.ledger], out="null", stderr_null=True
    )
    undo_ledger = (
        f"git -C {wiki.repo} checkout -- {wiki.ledger}" if tracked == 0 else f"rm -f {wiki.ledger}"
    )

    def fail_commit(what: str) -> Fail:
        ctx.err(f"heartwood-agent: {what} FAILED — published but uncommitted. Restore with:")
        ctx.err(
            f"  git -C {wiki.repo} reset -q -- {' '.join(wiki.four)} && {wiki.restore} && "
            f"{undo_ledger}"
        )
        return Fail(8)

    msg = tmp / "msg"
    if ctx.run(hw(ctx, "ledger-append", run_dir)) != 0:
        raise fail_commit("ledger-append")
    if ctx.run([*git, "add", *wiki.four]) != 0:
        raise fail_commit("git add")
    if ctx.run(hw(ctx, "commit-message", run_dir), out="file", out_path=msg) != 0:
        raise fail_commit("commit-message")
    commit = [*git, "commit", "--only", "--no-verify", "-q", "-F", str(msg), "--", *wiki.four]
    if ctx.run(commit) != 0:
        raise fail_commit("git commit")
    short = ctx.output([*git, "rev-parse", "--short", "HEAD"])
    ctx.out(f"heartwood-agent: committed {short} {_first_line(msg)}")


def _copy(ctx: Ctx, src: Path, dst: Path) -> None:
    """``cp src dst`` under ``set -e``: a failure stops the command with exit 1."""
    try:
        shutil.copyfile(src, dst)
    except OSError as exc:
        ctx.err(f"cp: cannot copy '{src}': {exc.strerror}")
        raise Fail(1) from exc


def _first_line(path: Path) -> str:
    """``$(head -n 1 file)``."""
    try:
        text = path.read_text(encoding="utf-8", errors="surrogateescape")
    except OSError:
        return ""
    return text.split("\n", 1)[0]


# --- heartwood-revert ------------------------------------------------------------------------


def heartwood_revert(ctx: Ctx, date: str) -> int:
    """Undo one published session (module docstring); returns the exit code. Confirmation
    happens in the CLI."""
    ctx.prepend_path(ctx.home / ".deno" / "bin")
    ht = ctx.lock("host-tooling", shared=True)
    gp = ctx.lock("git-publish")
    try:
        if not ht.acquire():
            ctx.err("heartwood-revert: host-tooling lock busy for 30 min — nothing changed")
            return 10
        node, wiki = _preflight(ctx, "heartwood-revert", "")
        commit = _revert_find_commit(ctx, wiki, date)
        undo = (
            f"git -C {wiki.repo} revert --abort  (if that refuses: git -C {wiki.repo} reset "
            f"--merge HEAD && git -C {wiki.repo} clean -fd {wiki.content})"
        )
        # One git publisher at a time: from the revert's index changes through push + redeploy.
        _relock_for_publish(ctx, ht, gp, "heartwood-revert", "nothing changed")
        _revert_apply(ctx, wiki, commit, undo)

        def fail(what: str, code: int) -> Fail:
            ctx.err(f"heartwood-revert: {what} FAILED — restore with: {undo}")
            return Fail(code)

        if ctx.run(hw(ctx, "ledger-revert", date)) != 0:
            raise fail("ledger-revert", 8)
        _regenerate_for_revert(ctx, node, wiki, fail)
        if ctx.run([*wiki.git, "add", *wiki.four]) != 0:
            raise fail("git add", 8)
        message = [
            "-m", f"revert(akasha): heartwood agent {date}",
            "-m", f"This reverts commit {commit}.",
        ]  # fmt: skip
        argv = [*wiki.git, "commit", "--only", "--no-verify", "-q", *message, "--", *wiki.four]
        if ctx.run(argv) != 0:
            raise fail("git commit", 8)
        short = ctx.output([*wiki.git, "rev-parse", "--short", "HEAD"])
        ctx.out(f"heartwood-revert: committed {short}")
        ht.release()  # before the redeploy
        return push_deploy(ctx)
    except Fail as exc:
        return exc.code
    finally:
        ht.release()
        gp.release()


def _regenerate_for_revert(
    ctx: Ctx, node: str, wiki: Wiki, fail: Callable[[str, int], Fail]
) -> None:
    """The revert's order: snapshot, registry reseed, then validation."""
    steps = {
        "akasha-snapshot": ctx.uv_run("akasha-snapshot"),
        "entity registry seed": ctx.uv_run("astra-ontology-entity-seed"),
        "corpus validation": validate_argv(node, wiki.content),
    }
    for what, argv in steps.items():
        if ctx.run(argv) != 0:
            raise fail(what, 7)


def _revert_find_commit(ctx: Ctx, wiki: Wiki, date: str) -> str:
    """Refuse a dirty tree or a clone off main; find the session's latest publish commit."""
    git = wiki.git
    dirty = ctx.capture([*git, "status", "--porcelain", "--", *wiki.four])
    if dirty:
        ctx.err("heartwood-revert: refusing — uncommitted changes:")
        ctx.err(dirty)
        raise Fail(6)
    if not _on_main(ctx, wiki):
        ctx.err(f"heartwood-revert: refusing — {wiki.repo} is not on main")
        raise Fail(6)
    if ctx.run(hw(ctx, "ledger-revert", date, "--check")) != 0:
        raise Fail(4)
    subject = f"feat(akasha): heartwood agent {date}"
    log = ctx.capture([*git, "log", "--format=%H%x09%s", "--", wiki.ledger])
    commit = next(
        (
            f[0]
            for f in (line.split("\t") for line in log.split("\n"))
            if len(f) > 1 and f[1] == subject
        ),
        "",
    )
    if not commit:
        ctx.err(f"heartwood-revert: no commit titled '{subject}' in {wiki.repo}")
        raise Fail(4)
    shown = ctx.output([*git, "log", "-1", "--format=%h %s", commit])
    ctx.out(f"heartwood-revert: reverting {shown}")
    return commit


def _revert_apply(ctx: Ctx, wiki: Wiki, commit: str, undo: str) -> None:
    """``git revert --no-commit``; restore the regenerated files; abort on content conflicts."""
    git = wiki.git
    rc = ctx.run([*git, "revert", "--no-commit", commit])
    if rc != 0 and ctx.run([*git, "rev-parse", "-q", "--verify", "REVERT_HEAD"], out="null") != 0:
        ctx.err(f"heartwood-revert: git revert failed before applying anything (exit {rc})")
        raise Fail(8)
    # The ledger, snapshot + registry are regenerated afterwards, so their conflicts don't matter.
    ctx.check([*git, "checkout", "HEAD", "--", wiki.ledger, wiki.snapshot, wiki.entity])
    unmerged = ctx.capture([*git, "diff", "--name-only", "--diff-filter=U"])
    if unmerged:
        ctx.err("heartwood-revert: content conflicts with later edits — aborting, nothing changed:")
        for line in unmerged.split("\n"):
            ctx.err(f"  {line}")
        if ctx.run([*git, "revert", "--abort"]) != 0:
            ctx.err(f"  abort failed — run: {undo}")
        raise Fail(8)
