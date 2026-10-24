"""``astra-ops`` — the host ops CLI behind the justfile's ops recipes (0037 ops-1a, ops-1b).

    astra-ops [PATH OPTIONS] COMMAND [ARGS]

    linguist-commit [--yes]             LIVE: commit + push the pipeline's output, redeploy
    astra-data-push [--yes]             LIVE: fetch, rebase if needed, push the astra-data clone
    mouthpiece-publish [FLAGS...]       regenerate the episode catalog snapshot (writes only)
    mouthpiece-seed [--yes]             LIVE: copy episode mp3s into the served audio dir
    akasha-seed [--yes]                 LIVE: copy session mp3s into the served audio dir
    heartwood-agent DATE [FLAGS]        PAID + LIVE: run + publish one session
    heartwood-push-deploy [--yes]       LIVE: push the clone, redeploy akasha-frontend
    heartwood-revert DATE [--yes]       LIVE: undo one published session
    signoz-rules-check                  compare the live SigNoz alert rules with git (read-only)
    signoz-rules-apply [--yes]          plan (default) or apply deploy/signoz/rules to SigNoz
    host-metrics                        write the host probes' Prometheus textfile
    heartwood-backfill [FROM] [--yes]   PAID + LIVE: replay pending sessions, detached
    heartwood-backfill-loop [FROM] [--yes]   PAID + LIVE: the backfill's body (its unit runs it)
    heartwood-backfill-reset            re-arm the bots after a hard-killed backfill
    heartwood-requests [--yes]          PAID + LIVE: drain Dagster's session_wiki requests
    craig-sync                          copy new Craig zips from the Drive mount into incoming
    units-install [GROUP...]            link + enable the systemd user units (no group = all)
    alert-sudoers-install               one-time ROOT step: the watchdog's sudoers drop-ins
    portal-module-install               build the Foundry module and drop it into Foundry
    pipeline-terminate RUN_ID [--yes]   LIVE: stop a Dagster run and its run container

PATH OPTIONS (``--data-root``, ``--uv``, ``--mouthpiece-episodes``, ``--akasha-audio``,
``--deploy-root``, ``--just``, ``--craig-drop-dir``) default exactly as the justfile's
variables do; the ``just`` wrappers pass the justfile's values.

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
from astra_ontology_config import load as load_config

from . import backfill, craig, heartwood, host, host_metrics, pipeline, publish, signoz
from .context import Ctx, Fail

log = get_logger("astra.ops")

DEFAULT_DATA_ROOT = "/ruby/data/astra-state"
DEFAULT_UV_BIN = "/home/jbassin/.local/bin/uv"
DEFAULT_DEPLOY_ROOT = "/ruby/data/astra-deploy"
DEFAULT_CRAIG_DROP_DIR = "/ruby/data/home/drive/Craig"

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
    "heartwood-backfill": "this is PAID (OpenRouter LLM calls for every pending session, hours "
    "long) and LIVE (commits, pushes and redeploys akasha).",
    "heartwood-backfill-loop": "this is PAID (OpenRouter LLM calls for every pending session) "
    "and LIVE (commits, pushes and redeploys akasha).",
    "heartwood-requests": "this is PAID (one heartwood agent run per pending request) and LIVE "
    "(each publishes, pushes and redeploys akasha).",
    "pipeline-terminate": "this is LIVE: it terminates the Dagster run and stops its container "
    "(a paid step in it is lost; re-execute from failure to resume).",
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
    p.add_argument("--deploy-root", default=_env_default("ASTRA_DEPLOY_ROOT", DEFAULT_DEPLOY_ROOT))
    p.add_argument("--just", default="just", help="the just binary the wrappers run under")
    p.add_argument(
        "--craig-drop-dir", default=_env_default("CRAIG_DROP_DIR", DEFAULT_CRAIG_DROP_DIR)
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
        deploy_root=Path(ns.deploy_root),
        just_bin=ns.just,
        craig_drop_dir=Path(ns.craig_drop_dir),
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


def _bare(command: str, fn: Callable[[Ctx], int]) -> Callable[[Ctx, list[str]], int]:
    """Commands that take no arguments and ask nothing (``_no_args`` checks)."""

    def run(ctx: Ctx, args: list[str]) -> int:
        _no_args(command, args)
        return fn(ctx)

    return run


def _from_and_yes(command: str, args: list[str]) -> tuple[str, bool]:
    """``[FROM] [--yes]``: an optional first date (empty = from the first session)."""
    rest = [a for a in args if a != "--yes"]
    if len(rest) > 1 or any(a.startswith("-") for a in rest):
        Ctx.err(f"{command}: usage: {command} [FROM] [--yes]")
        raise Fail(64)
    return (rest[0] if rest else ""), len(rest) < len(args)


def _backfill(command: str, fn: Callable[[Ctx, str], int]) -> Callable[[Ctx, list[str]], int]:
    def run(ctx: Ctx, args: list[str]) -> int:
        from_date, yes = _from_and_yes(command, args)
        ctx.confirm(command, LIVE[command], yes=yes)
        return fn(ctx, from_date)

    return run


def _units_install(ctx: Ctx, args: list[str]) -> int:
    return host.units_install(ctx, args)


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


def _pipeline_terminate(ctx: Ctx, args: list[str]) -> int:
    if not args or args[0].startswith("-"):
        Ctx.err("pipeline-terminate: usage: pipeline-terminate RUN_ID [--yes]")
        return 64
    yes = _only_yes("pipeline-terminate", args[1:])
    ctx.confirm("pipeline-terminate", LIVE["pipeline-terminate"], yes=yes)
    return pipeline.pipeline_terminate(ctx, args[0])


def _no_args(command: str, args: list[str]) -> None:
    if args:
        Ctx.err(f"{command}: takes no arguments (got {' '.join(args)})")
        raise Fail(64)


def _signoz_api() -> signoz.Api | None:
    """The SigNoz API from ``ops.signoz-url`` and ``ops.signoz-api-key``; None when the key
    is unset, which the rules commands report as exit 3. The key is a ``SecretRef``, which
    only the typed config carries, so this reads it directly."""
    ops = load_config().ops
    key = ops.signoz_api_key.optional() if ops.signoz_api_key is not None else None
    if not key:
        return None
    return signoz.Api(signoz.urllib_transport(ops.signoz_url, key))


NO_KEY = (
    "SigNoz API key unset: add signoz_api_key (a SigNoz service-account key) to "
    "deploy/sops/secrets.enc.yaml, or set $SIGNOZ_API_KEY"
)


#: Swapped in tests for a fake API.
signoz_api: Callable[[], signoz.Api | None] = _signoz_api


def _rules_dir(ctx: Ctx) -> Path:
    return ctx.repo_root / "deploy" / "signoz" / "rules"


def _signoz_rules_check(ctx: Ctx, args: list[str]) -> int:
    _no_args("signoz-rules-check", args)
    api = signoz_api()
    if api is None:
        # Not configured yet is a warning, not drift: the key comes later (the just recipe
        # turns exit 3 into 0, and the watchdog skips the check).
        Ctx.err(f"WARN: signoz-rules-check: {NO_KEY}; nothing compared")
        return signoz.EXIT_NO_KEY
    return signoz.check(api, _rules_dir(ctx))


def _signoz_rules_apply(ctx: Ctx, args: list[str]) -> int:
    yes = False
    for a in args:
        if a == "--yes":
            yes = True
        elif a != "--dry-run":
            Ctx.err(f"signoz-rules-apply: unknown argument '{a}' (flags: --dry-run, --yes)")
            return 64
    api = signoz_api()
    if api is None:
        Ctx.err(f"signoz-rules-apply: {NO_KEY}")
        return signoz.EXIT_NO_KEY
    return signoz.apply(api, _rules_dir(ctx), yes=yes)


def host_metrics_targets(ctx: Ctx) -> host_metrics.Targets:
    textfile, data_path, episodes = ctx.config(
        "ops.metrics-textfile", "scribe.data-path", "mouthpiece.episodes-path"
    )
    return host_metrics.Targets(
        textfile=Path(textfile),
        caddyfile=ctx.repo_root / "sites.caddyfile",
        datasets={
            "transcript": (Path(data_path) / "saved", "*/script.json"),
            "episode": (Path(episodes), "*/*.episode.mp3"),
        },
    )


def _host_metrics(ctx: Ctx, args: list[str]) -> int:
    _no_args("host-metrics", args)
    return host_metrics.host_metrics(host_metrics_targets(ctx))


COMMANDS: dict[str, Callable[[Ctx, list[str]], int]] = {
    "linguist-commit": _simple("linguist-commit", publish.linguist_commit),
    "astra-data-push": _simple("astra-data-push", publish.astra_data_push),
    "mouthpiece-publish": _mouthpiece_publish,
    "mouthpiece-seed": _simple("mouthpiece-seed", publish.mouthpiece_seed),
    "akasha-seed": _simple("akasha-seed", publish.akasha_seed),
    "heartwood-agent": _heartwood_agent,
    "heartwood-push-deploy": _simple("heartwood-push-deploy", heartwood.push_deploy),
    "heartwood-revert": _heartwood_revert,
    "signoz-rules-check": _signoz_rules_check,
    "signoz-rules-apply": _signoz_rules_apply,
    "host-metrics": _host_metrics,
    "heartwood-backfill": _backfill("heartwood-backfill", backfill.heartwood_backfill),
    "heartwood-backfill-loop": _backfill("heartwood-backfill-loop", backfill.backfill_loop),
    "heartwood-backfill-reset": _bare("heartwood-backfill-reset", backfill.backfill_reset),
    "heartwood-requests": _simple("heartwood-requests", backfill.heartwood_requests),
    "craig-sync": _bare("craig-sync", craig.craig_sync),
    "units-install": _units_install,
    "alert-sudoers-install": _bare("alert-sudoers-install", host.alert_sudoers_install),
    "portal-module-install": _bare("portal-module-install", host.portal_module_install),
    "pipeline-terminate": _pipeline_terminate,
}

#: Commands that ask before they run (``--yes`` skips the question).
CONFIRMED = frozenset({*LIVE, "heartwood-agent"})


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
