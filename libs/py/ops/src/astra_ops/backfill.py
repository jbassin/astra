"""heartwood-backfill (the launcher and its loop), heartwood-backfill-reset and
heartwood-requests (moved from the justfile; same steps, children and exit
codes).

**heartwood-backfill [FROM]** replays every pending Astra-world session oldest-first:
PAID and LIVE, hours long. It always runs DETACHED, as the transient user unit
``heartwood-backfill`` (``systemd-run``), which runs the deploy checkout's
``_heartwood-backfill-loop`` (production code at a pushed sha, whichever checkout launched it)
with output appended to ``<data root>/heartwood/backfill.log``. ``FROM`` is the first date
(inclusive); dates the ledger shows as published are skipped, so re-running resumes.

**The loop** (``heartwood-backfill-loop``, inside that unit):

1. touch ``<data root>/heartwood/backfill.lock`` (the watchdog then expects the disarmed
   timers), stop ``linguist-commit.{timer,path}`` (they push the astra-data clone and take
   the git-publish lock) and the 0036 request runner's triggers, then wait up to 30 min for an
   in-flight ``linguist-commit.service`` / ``heartwood-request.service``;
2. list the pending sessions (``astra-heartwood-agent sessions``);
3. per date: ``budget-check`` (stop when the ledger's summed cost reaches the config's
   backfill budget, or any cost is unknown, so the last run may overshoot by its own cost),
   then ``heartwood-agent <date> --no-push`` in-process; any non-zero exit stops the loop;
4. stopped or done: if the clone has unpushed commits, push and redeploy akasha once;
5. always (the bash ``EXIT`` trap): remove the lock, re-arm linguist-commit, re-arm the
   request runner and drain anything Dagster filed meanwhile (``--no-block``).

SIGTERM, SIGHUP or SIGINT (``systemctl --user stop heartwood-backfill``) give the running
child up to 30 s to clean up, then run step 5 and exit 143. A HARD-killed loop (SIGKILL,
reboot) skips step 5: run ``heartwood-backfill-reset``.

Exit codes: 0 done · 1 stopped (budget or an agent failure; the resume command is printed),
already running, or a setup step failed · 143 signalled · 64 bad arguments, or no terminal and
no ``--yes``.

**heartwood-requests** is the host side of Dagster's session_wiki asset: it drains every
pending request under ``heartwood.requests-path`` (``astra-heartwood-agent drain-requests``
runs ``just heartwood-agent <date> --yes`` per request). The systemd user PATH lacks
uv/just/node, so the runner resolves each tool itself; ``JUST`` and ``UV`` hand it ours.
"""

from __future__ import annotations

import os
import signal
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from .context import Ctx, Fail
from .heartwood import heartwood_agent, hw, push_deploy
from .publish import git_c

UNIT = "heartwood-backfill"
LINGUIST_TRIGGERS = ("linguist-commit.timer", "linguist-commit.path")
REQUEST_TRIGGERS = ("heartwood-request.timer", "heartwood-request.path")
#: The services the loop waits out before it starts, and how long (seconds).
IN_FLIGHT = ("linguist-commit.service", "heartwood-request.service")
WAIT_S = 1800
WAIT_STEP_S = 15
BUSY_STATES = frozenset({"active", "activating", "deactivating", "reloading"})
AGENT_EXITS = (
    "1 failed · 2 incomplete · 3 conflict · 4 refused · 6 dirty · 7 validate/snapshot/seed · "
    "8 commit"
)
EXIT_SIGNALLED = 143


def systemctl(*args: str) -> list[str]:
    return ["systemctl", "--user", *args]


def heartwood_dir(ctx: Ctx) -> Path:
    """The justfile's ``heartwood_dir`` (mirrors config heartwood.artifacts-path)."""
    return ctx.data_root / "heartwood"


def caller_path() -> str:
    """$PATH as the caller had it: without the venv bin dir ``uv run`` put first."""
    path = os.environ.get("PATH", "")
    venv = os.environ.get("VIRTUAL_ENV")
    if venv:
        dirs = path.split(":")
        if dirs and dirs[0] == f"{venv}/bin":
            return ":".join(dirs[1:])
    return path


def _running(ctx: Ctx) -> bool:
    return ctx.run(systemctl("is-active", "--quiet", f"{UNIT}.service")) == 0


# --- the launcher ------------------------------------------------------------------------------


def heartwood_backfill(ctx: Ctx, from_date: str) -> int:
    """Launch the loop detached (module docstring). Confirmation happens in the CLI; the
    loop gets ``--yes`` because it has no terminal."""
    log = heartwood_dir(ctx) / "backfill.log"
    heartwood_dir(ctx).mkdir(parents=True, exist_ok=True)
    if _running(ctx):
        ctx.err(f"heartwood-backfill: already running — tail -f {log}")
        return 1
    ctx.run(systemctl("reset-failed", f"{UNIT}.service"), stderr_null=True)
    # The user manager's PATH lacks nvm's node and ~/.deno/bin: hand the unit ours.
    env_args = [
        f"--setenv=PATH={ctx.home}/.deno/bin:{caller_path()}",
        f"--setenv=HOME={ctx.home}",
    ]
    if os.environ.get("SSH_AUTH_SOCK"):
        env_args.append(f"--setenv=SSH_AUTH_SOCK={os.environ['SSH_AUTH_SOCK']}")
    ctx.check(
        [
            "systemd-run", "--user", f"--unit={UNIT}", "--collect",
            f"--working-directory={ctx.deploy_root}", *env_args,
            "-p", f"StandardOutput=append:{log}", "-p", f"StandardError=append:{log}",
            ctx.just_bin, "-f", f"{ctx.deploy_root}/justfile", "_heartwood-backfill-loop",
            from_date, "--yes",
        ]
    )  # fmt: skip
    ctx.out(f"heartwood-backfill: launched detached — tail -f {log}")
    ctx.out(f"  stop: systemctl --user stop {UNIT}   (hard-killed? just heartwood-backfill-reset)")
    return 0


# --- the loop ----------------------------------------------------------------------------------


class Signalled(KeyboardInterrupt):
    """SIGTERM or SIGHUP, raised like Ctrl-C so the running child gets its grace period."""


@contextmanager
def _signals_stop() -> Iterator[None]:
    def handler(_signum: int, _frame: object) -> None:
        raise Signalled

    old = {s: signal.signal(s, handler) for s in (signal.SIGTERM, signal.SIGHUP)}
    try:
        yield
    finally:
        for s, h in old.items():
            signal.signal(s, h)


def _rearm(ctx: Ctx, lock: Path) -> None:
    """The bash EXIT trap: drop the watchdog lock, re-arm both bots, drain new requests."""
    lock.unlink(missing_ok=True)
    if ctx.run(systemctl("start", *LINGUIST_TRIGGERS)) == 0:
        ctx.out("heartwood-backfill: linguist-commit timer + path re-armed")
    else:
        ctx.err("heartwood-backfill: re-arm FAILED — run: just heartwood-backfill-reset")
    _rearm_requests(
        ctx, "heartwood-backfill: heartwood-request re-arm skipped (units not installed?)"
    )
    ctx.out(f"=== heartwood backfill end {ctx.now()}")


def _rearm_requests(ctx: Ctx, skipped: str) -> None:
    """Re-arm the 0036 request runner and drain anything filed meanwhile (no-block: a
    drained request can run for an hour)."""
    if (
        ctx.run(systemctl("start", *REQUEST_TRIGGERS), stderr_null=True) != 0
        or ctx.run(systemctl("start", "--no-block", "heartwood-request.service"), stderr_null=True)
        != 0
    ):
        ctx.err(skipped)


def backfill_loop(ctx: Ctx, from_date: str) -> int:
    """The backfill's body (module docstring); returns the exit code."""
    ctx.prepend_path(ctx.home / ".deno" / "bin")
    lock = heartwood_dir(ctx) / "backfill.lock"
    ctx.out(f"=== heartwood backfill start {ctx.now()} (from: {from_date or 'the first session'})")
    heartwood_dir(ctx).mkdir(parents=True, exist_ok=True)
    lock.touch()  # before the stop, so the watchdog never sees a disarmed timer
    try:
        with _signals_stop():
            return _loop_body(ctx, from_date)
    except KeyboardInterrupt:  # Ctrl-C, SIGTERM, SIGHUP: the bash `trap 'exit 143'`
        return EXIT_SIGNALLED
    except Fail as exc:
        return exc.code
    finally:
        _rearm(ctx, lock)


def _disarm(ctx: Ctx) -> None:
    if ctx.run(systemctl("stop", *LINGUIST_TRIGGERS)) != 0:
        ctx.err("heartwood-backfill: could not stop linguist-commit units")
        raise Fail(1)
    # The 0036 request runner too: stop its triggers, then wait out an in-flight run (it may
    # be publishing a date this loop would otherwise run again).
    ctx.run(systemctl("stop", *REQUEST_TRIGGERS), stderr_null=True)
    for svc in IN_FLIGHT:
        waited = 0
        while (state := ctx.output(systemctl("is-active", svc))) in BUSY_STATES:
            if waited >= WAIT_S:
                ctx.err(f"heartwood-backfill: {svc} still {state} after 30 min — aborting")
                raise Fail(1)
            ctx.out(f"heartwood-backfill: waiting for {svc} ({state})…")
            ctx.sleep(WAIT_STEP_S)
            waited += WAIT_STEP_S


def _pending(ctx: Ctx, from_date: str) -> list[str]:
    done = ctx.runner.run(
        hw(ctx, "sessions", *(["--from", from_date] if from_date else [])), out="capture"
    )
    if done.returncode != 0:
        ctx.err("heartwood-backfill: listing sessions FAILED")
        raise Fail(1)
    text = done.stdout.decode("utf-8", "surrogateescape")
    return [d for d in text.split("\n") if d]


def _loop_body(ctx: Ctx, from_date: str) -> int:
    _disarm(ctx)
    todo = _pending(ctx, from_date)
    ctx.out(f"heartwood-backfill: {len(todo)} pending session(s): {' '.join(todo)}")
    published, stop, rerun = 0, "", ""
    try:
        for d in todo:
            if ctx.run(hw(ctx, "budget-check")) != 0:
                stop, rerun = "budget", d
                break
            ctx.out(f"--- {ctx.now()} {d}")
            rc = ctx.sub(_agent_no_push, ctx, d)
            if rc != 0:
                stop, rerun = f"heartwood-agent {d} exited {rc} ({AGENT_EXITS})", d
                break
            published += 1
    except Exception:
        # A crash mid-loop still publishes what earlier dates committed (then the caller
        # re-arms, as after a normal stop). A stop signal (KeyboardInterrupt) does not push,
        # like the bash `trap 'exit 143'`: a stopping unit has no time for a redeploy.
        ctx.err(
            f"heartwood-backfill: unexpected error after {published} session(s) — pushing "
            "what is committed"
        )
        _push_if_ahead(ctx)
        raise
    ctx.out(f"heartwood-backfill: published {published} session(s) this run")
    _push_if_ahead(ctx)
    if stop:
        ctx.out(f"heartwood-backfill: STOPPED — {stop}")
        ctx.out(f"heartwood-backfill: resume with: just heartwood-backfill {rerun}")
        return 1
    ctx.out("heartwood-backfill: complete")
    return 0


def _agent_no_push(ctx: Ctx, date: str) -> int:
    """``just heartwood-agent <date> --no-push --yes``, in-process."""
    return heartwood_agent(ctx, date, dry_run=False, push=False, model_flags=[])


def _push_if_ahead(ctx: Ctx) -> None:
    """Push and redeploy once if the astra-data clone has unpushed commits (never the code
    repo). An unreadable clone path reads as nothing to push (the bash ran ``git -C ""``,
    which is the current directory: the code checkout)."""
    try:
        (repo,) = ctx.config("data.content-root")
    except Exception:  # noqa: BLE001 -- any config failure: nothing to push
        ctx.err("heartwood-backfill: could not read data.content-root — not pushing")
        return
    ahead = ctx.output([*git_c(repo), "rev-list", "origin/main..HEAD"], stderr_null=True)
    if ahead and ctx.sub(push_deploy, ctx) != 0:
        ctx.err("heartwood-backfill: push/redeploy FAILED — rerun: just _heartwood-push-deploy")


# --- reset -------------------------------------------------------------------------------------


def backfill_reset(ctx: Ctx) -> int:
    """Recover from a HARD-killed backfill (its re-arm never ran): re-arm linguist-commit,
    remove the watchdog lock, re-arm the request runner. Refuses while the backfill runs."""
    if _running(ctx):
        ctx.err("heartwood-backfill-reset: the backfill is still running — stop it first:")
        ctx.err(f"  systemctl --user stop {UNIT}   (its EXIT trap re-arms + unlocks)")
        return 1
    ctx.run(systemctl("reset-failed", f"{UNIT}.service"), stderr_null=True)
    ctx.check(systemctl("start", *LINGUIST_TRIGGERS))
    (heartwood_dir(ctx) / "backfill.lock").unlink(missing_ok=True)
    _rearm_requests(
        ctx, "heartwood-backfill-reset: heartwood-request units not installed — skipped"
    )
    timer = ctx.output(systemctl("is-active", "linguist-commit.timer"))
    path = ctx.output(systemctl("is-active", "linguist-commit.path"))
    ctx.out(f"heartwood-backfill-reset: linguist-commit.timer {timer}, .path {path}; lock removed")
    return 0


# --- the request runner ------------------------------------------------------------------------


def heartwood_requests(ctx: Ctx) -> int:
    """Drain the pending session_wiki requests (module docstring). Confirmation happens in
    the CLI; heartwood-request.service passes --yes."""
    env = {"JUST": ctx.just_bin, "UV": ctx.uv_bin}
    return ctx.run(hw(ctx, "drain-requests"), env=env)
