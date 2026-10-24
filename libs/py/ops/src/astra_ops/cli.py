"""``astra-ops`` — the host ops CLI behind the justfile's data-publishing recipes (0037 ops-1a).

    astra-ops [PATH OPTIONS] COMMAND [ARGS]

    linguist-commit [--yes]             LIVE: commit + push the pipeline's output, redeploy
    astra-data-push [--yes]             LIVE: fetch, rebase if needed, push the astra-data clone
    mouthpiece-publish [FLAGS...]       regenerate the episode catalog snapshot (writes only)
    mouthpiece-seed [--yes]             LIVE: copy episode mp3s into the served audio dir
    akasha-seed [--yes]                 LIVE: copy session mp3s into the served audio dir
    heartwood-agent DATE [FLAGS]        PAID + LIVE: run + publish one session
    heartwood-push-deploy [--yes]       LIVE: push the clone, redeploy akasha-frontend
    heartwood-revert DATE [--yes]       LIVE: undo one published session

PATH OPTIONS (``--data-root``, ``--uv``, ``--mouthpiece-episodes``, ``--akasha-audio``) default
exactly as the justfile's variables do; the ``just`` wrappers pass the justfile's values.

Confirmation: every paid or live command asks first, like just's ``[confirm]``, and only y or
yes proceeds (else exit 1). ``--yes`` skips the question; the systemd units and the heartwood
request runner pass it. With no terminal and no ``--yes`` a command refuses with exit 64.
Commands run from the checkout this package lives in (the old recipes' ``cd`` into the
justfile's directory), and they call each other in-process rather than through ``just``.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

import astra_observe
from astra_config import find_repo_root
from astra_observe import get_logger, get_tracer

from . import heartwood, publish
from .context import Ctx, Fail

log = get_logger("astra.ops")

DEFAULT_DATA_ROOT = "/ruby/data/astra-state"
DEFAULT_UV_BIN = "/home/jbassin/.local/bin/uv"

#: What each confirmation names (the start of the question; "Type y to continue:" follows).
LIVE = {
    "linguist-commit": "this is LIVE: it commits and pushes the astra-data clone and redeploys "
    "akasha-frontend / mouthpiece-frontend for what changed.",
    "astra-data-push": "this is LIVE: it pushes the astra-data clone's local commits to origin.",
    "mouthpiece-seed": "this is LIVE: it copies episode mp3s into the audio dir "
    "mouthpiece-frontend serves.",
    "akasha-seed": "this is LIVE: it copies session mp3s into the audio dir akasha-frontend "
    "serves, overwriting.",
    "heartwood-push-deploy": "this is LIVE: it pushes the astra-data clone and redeploys "
    "akasha-frontend.",
    "heartwood-revert": "this is LIVE: it reverts the session's wiki commit, pushes and "
    "redeploys akasha-frontend.",
}
AGENT_PAID_LIVE = (
    "this is PAID (OpenRouter LLM calls) and LIVE (publishes, pushes and redeploys akasha)."
)
AGENT_PAID_DRY = "this is PAID (OpenRouter LLM calls); --dry-run publishes nothing."
AGENT_PAID_NO_PUSH = "this is PAID (OpenRouter LLM calls) and commits to the astra-data clone."


def _env_default(var: str, default: str) -> str:
    """The justfile's ``env_var_or_default``: an unset OR empty variable takes the default."""
    return os.environ.get(var) or default


def build_parser() -> argparse.ArgumentParser:
    data_root = _env_default("ASTRA_DATA_ROOT", DEFAULT_DATA_ROOT)
    p = argparse.ArgumentParser(
        prog="astra-ops",
        description="astra host ops: the data-publishing commands behind the just recipes.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--data-root", default=data_root, help="default: $ASTRA_DATA_ROOT or %(default)s"
    )
    p.add_argument("--uv", default=_env_default("UV_BIN", DEFAULT_UV_BIN), help="uv binary")
    p.add_argument(
        "--mouthpiece-episodes",
        default=_env_default("MOUTHPIECE_EPISODES", f"{data_root}/mouthpiece/episodes"),
    )
    p.add_argument(
        "--akasha-audio",
        default=_env_default("AKASHA_AUDIO_LIVE", f"{data_root}/scribe/data/saved"),
    )
    p.add_argument("command", choices=sorted(COMMANDS))
    p.add_argument("args", nargs=argparse.REMAINDER)
    return p


def make_ctx(ns: argparse.Namespace) -> Ctx:
    return Ctx(
        repo_root=find_repo_root(),
        data_root=Path(ns.data_root),
        uv_bin=ns.uv,
        mouthpiece_episodes=Path(ns.mouthpiece_episodes),
        akasha_audio_live=Path(ns.akasha_audio),
    )


# --- commands: each takes (ctx, args) and returns the exit code -----------------------------


def _only_yes(command: str, args: list[str]) -> bool:
    """Commands whose only flag is ``--yes``."""
    yes = False
    for a in args:
        if a == "--yes":
            yes = True
        else:
            Ctx.err(f"{command}: unknown argument '{a}' (the only flag is --yes)")
            raise Fail(64)
    return yes


def _simple(command: str, fn: Callable[[Ctx], int]) -> Callable[[Ctx, list[str]], int]:
    def run(ctx: Ctx, args: list[str]) -> int:
        ctx.confirm(command, LIVE[command], yes=_only_yes(command, args))
        return fn(ctx)

    return run


def _mouthpiece_publish(ctx: Ctx, args: list[str]) -> int:
    return publish.mouthpiece_publish(ctx, args)


def _heartwood_agent(ctx: Ctx, args: list[str]) -> int:
    if not args or args[0].startswith("-"):
        Ctx.err(
            f"heartwood-agent: usage: heartwood-agent DATE [FLAGS] ({heartwood.AGENT_FLAGS_HELP})"
        )
        return 64
    date, flags = args[0], args[1:]
    dry_run, push, model_flags, yes = heartwood.parse_agent_flags(flags)
    what = AGENT_PAID_DRY if dry_run else AGENT_PAID_LIVE if push else AGENT_PAID_NO_PUSH
    ctx.confirm("heartwood-agent", what, yes=yes)
    return heartwood.heartwood_agent(ctx, date, dry_run=dry_run, push=push, model_flags=model_flags)


def _heartwood_revert(ctx: Ctx, args: list[str]) -> int:
    if not args or args[0].startswith("-"):
        Ctx.err("heartwood-revert: usage: heartwood-revert DATE [--yes]")
        return 64
    yes = _only_yes("heartwood-revert", args[1:])
    ctx.confirm("heartwood-revert", LIVE["heartwood-revert"], yes=yes)
    return heartwood.heartwood_revert(ctx, args[0])


COMMANDS: dict[str, Callable[[Ctx, list[str]], int]] = {
    "linguist-commit": _simple("linguist-commit", publish.linguist_commit),
    "astra-data-push": _simple("astra-data-push", publish.astra_data_push),
    "mouthpiece-publish": _mouthpiece_publish,
    "mouthpiece-seed": _simple("mouthpiece-seed", publish.mouthpiece_seed),
    "akasha-seed": _simple("akasha-seed", publish.akasha_seed),
    "heartwood-agent": _heartwood_agent,
    "heartwood-push-deploy": _simple("heartwood-push-deploy", heartwood.push_deploy),
    "heartwood-revert": _heartwood_revert,
}


def dispatch(ctx: Ctx, command: str, args: list[str]) -> int:
    """Run one command; ``Fail`` becomes its exit code (the test entry point)."""
    try:
        return COMMANDS[command](ctx, args)
    except Fail as exc:
        return exc.code


def main(argv: Sequence[str] | None = None) -> int:
    ns = build_parser().parse_args(argv)
    ctx = make_ctx(ns)
    os.chdir(ctx.repo_root)
    with astra_observe.run("astra.ops"):
        with get_tracer("astra.ops").start_as_current_span(f"ops.{ns.command}") as span:
            log.info("astra-ops %s start", ns.command)
            rc = dispatch(ctx, ns.command, list(ns.args))
            span.set_attribute("ops.exit_code", rc)
            log.info("astra-ops %s exit %d", ns.command, rc)
        return rc


if __name__ == "__main__":
    sys.exit(main())
