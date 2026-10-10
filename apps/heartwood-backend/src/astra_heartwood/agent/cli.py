"""``astra-heartwood-agent`` — the heartwood agent's host CLI (0033 D33-1, §5).

    run <date> [--dry-run] [--model ID] [--sub-model ID]
                                  stage + run one session (never publishes); the last
                                  stdout line is ``RUN_DIR=<path>``. ``--model`` /
                                  ``--sub-model`` override ``heartwood.model`` /
                                  ``sub-model`` for this run only (model comparisons)
    sessions [--from DATE]        pending faerrin dates, oldest first — dates the ledger
                                  shows as published are skipped (D33-12)
    publish-sync <run-dir>        apply an ``ok`` run's change-set to the live corpus
    ledger-append <run-dir>       append the run's publish line to agent-runs.jsonl
    ledger-revert <date> [--check]  append a revert line (``--check``: only verify the
                                  date is currently published)
    budget-check                  may the backfill start another date?
    commit-message <run-dir>      print the session commit message (wrapped at 100)
    unresolved-delta <before>     unresolved-link report: snapshot JSON before → now

The ``just heartwood-*`` recipes compose these (justfile, ``--- heartwood (0033) ---``).

Exit codes (stable — the recipes branch on them):

    0  success (run: ``ok``; budget-check: go on)
    1  run ``failed``, or an unexpected error
    2  run ``incomplete`` (iteration cap) — also argparse's usage-error code
    3  publish-sync conflict: a touched live page changed since the run's baseline;
       nothing was written
    4  refused: the run is not publishable (status not ``ok``, no summary.json), a
       double ledger append, or reverting a date that is not published
    5  budget-check stop: spent >= ``backfill-budget-usd``, or a ledger cost is unknown

Telemetry exports from the host (D33-10): ``main`` calls ``init_telemetry`` with
``telemetry.host-otlp-endpoint`` (the in-cluster default doesn't resolve here) and
``shutdown()`` flushes in ``finally``. ``cli()`` is the telemetry-free core tests drive.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from astra_akasha_backend.corpus import CONTENT_DIR
from astra_akasha_backend.snapshot import SNAPSHOT_PATH
from astra_config import load_config
from astra_linguist.chronicle import date_key
from astra_observe import init_telemetry, shutdown

from . import ledger
from .publish import commit_message, unresolved_delta
from .run import RunResult, run_session
from .sessions import ingestible_dates
from .workspace import PublishConflict, Workspace

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_INCOMPLETE = 2
EXIT_CONFLICT = 3
EXIT_REFUSED = 4
EXIT_BUDGET = 5


def pending_sessions(
    from_date: str | None = None,
    *,
    ledger_path: Path = ledger.LEDGER_PATH,
    dates: list[str] | None = None,
) -> list[str]:
    """Ingestible faerrin dates, oldest first, from ``from_date`` on (inclusive), minus
    the dates the ledger shows as published (latest line a non-reverted publish).

    ``dates`` is the test seam (defaults to ``ingestible_dates()``).
    """
    candidates = dates if dates is not None else ingestible_dates()
    if from_date is not None:
        floor = date_key(from_date)
        candidates = [d for d in candidates if date_key(d) >= floor]
    published = ledger.published_dates(ledger_path)
    return [d for d in candidates if d not in published]


def _fmt_cost(cost: float | None) -> str:
    return f"${cost:.4f}" if cost is not None else "unknown"


def format_summary(result: RunResult) -> str:
    s = result.summary
    main, sub = s["main"], s["sub"]
    counts = s["counts"]
    lines = [
        f"heartwood {s['date']} ({s['campaign']}): {result.status}"
        + (f" — {result.error}" if result.error else ""),
        f"  iterations {s['iterations']}/{s['max_iterations']}"
        f" (parse errors absorbed: {s['parse_errors']})",
        f"  LM calls: main {main['calls']}, sub {sub['calls']}; tokens {s['tokens']:,};"
        f" cost {_fmt_cost(s['cost_usd'])}",
        "  changes: " + ", ".join(f"{k} {'?' if v is None else v}" for k, v in counts.items()),
        f"  run dir: {result.run_dir}",
    ]
    if "diff" in result.artifacts:
        lines.append(f"  diff:    {result.artifacts['diff']}")
    return "\n".join(lines)


def _err(msg: str) -> None:
    print(f"astra-heartwood-agent: {msg}", file=sys.stderr)


# ── subcommands ────────────────────────────────────────────────────────────
def _cmd_run(args: argparse.Namespace) -> int:
    overrides = {
        k: v for k, v in (("model", args.model), ("sub_model", args.sub_model)) if v is not None
    }
    # A per-run copy: summary.json, the run span and the ledger record what actually ran.
    config = load_config().heartwood.model_copy(update=overrides) if overrides else None
    result = run_session(args.date, dry_run=args.dry_run, config=config)
    print(format_summary(result))
    print(f"RUN_DIR={result.run_dir}")  # machine-readable, always the last line
    return result.exit_code


def _cmd_sessions(args: argparse.Namespace) -> int:
    for date in pending_sessions(args.from_date, ledger_path=args.ledger):
        print(date)
    return EXIT_OK


def _cmd_publish_sync(args: argparse.Namespace) -> int:
    run_dir: Path = args.run_dir
    try:
        summary = ledger.read_summary(run_dir)
    except FileNotFoundError:
        _err(f"refused: {run_dir} has no summary.json (not a finished run dir)")
        return EXIT_REFUSED
    status = summary.get("status")
    if status != "ok":
        _err(f"refused: run {run_dir.name} ended {status!r}; only 'ok' runs publish")
        return EXIT_REFUSED
    try:
        cs = Workspace.open(run_dir).publish_sync(args.content_dir)
    except PublishConflict as exc:
        _err(f"publish conflict — {exc}")
        return EXIT_CONFLICT
    moved = ", ".join(f"{m.src} -> {m.dst}" for m in cs.moved) or "-"
    print(
        f"published {summary['date']}/{run_dir.name} into {args.content_dir}: "
        f"created {len(cs.created)}, updated {len(cs.updated)}, moved {len(cs.moved)}, "
        f"deleted {len(cs.deleted)}"
    )
    print(f"  moved: {moved}")
    return EXIT_OK


def _cmd_ledger_append(args: argparse.Namespace) -> int:
    try:
        entry = ledger.append_publish(args.run_dir, args.ledger)
    except (ledger.LedgerError, FileNotFoundError) as exc:
        _err(f"refused: {exc}")
        return EXIT_REFUSED
    cost = _fmt_cost(entry["cost_usd"])
    print(f"ledger: published {entry['date']} ({entry['run_id']}, cost {cost})")
    return EXIT_OK


def _cmd_ledger_revert(args: argparse.Namespace) -> int:
    if args.check:
        if ledger.is_published(args.date, args.ledger):
            print(f"ledger: {args.date} is published")
            return EXIT_OK
        _err(f"refused: {args.date} is not currently published (nothing to revert)")
        return EXIT_REFUSED
    try:
        entry = ledger.append_revert(args.date, args.ledger)
    except ledger.LedgerError as exc:
        _err(f"refused: {exc}")
        return EXIT_REFUSED
    print(f"ledger: reverted {entry['date']} ({entry['run_id']})")
    return EXIT_OK


def _cmd_budget_check(args: argparse.Namespace) -> int:
    budget = args.budget if args.budget is not None else load_config().heartwood.backfill_budget_usd
    reason = ledger.budget_stop_reason(budget, args.ledger)
    if reason is not None:
        _err(f"budget stop: {reason}")
        return EXIT_BUDGET
    print(f"budget: spent ${ledger.spent_usd(args.ledger):.2f} of ${budget:.2f}")
    return EXIT_OK


def _cmd_commit_message(args: argparse.Namespace) -> int:
    sys.stdout.write(commit_message(args.run_dir))
    return EXIT_OK


def _cmd_unresolved_delta(args: argparse.Namespace) -> int:
    print(unresolved_delta(args.before, args.after))
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="astra-heartwood-agent", description="The heartwood akasha-wiki agent (0033)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def ledger_opt(p: argparse.ArgumentParser) -> None:
        p.add_argument("--ledger", type=Path, default=ledger.LEDGER_PATH, help=argparse.SUPPRESS)

    run = sub.add_parser("run", help="stage + run the agent over one session (never publishes)")
    run.add_argument("date", help="session date, e.g. 2025-8-28")
    run.add_argument("--dry-run", action="store_true", help="record the run as a dry run")
    run.add_argument("--model", default=None, help="override heartwood.model for this run")
    run.add_argument("--sub-model", default=None, help="override heartwood.sub-model for this run")
    run.set_defaults(func=_cmd_run)

    sessions = sub.add_parser("sessions", help="pending sessions (ledger-skipped), oldest first")
    sessions.add_argument("--from", dest="from_date", default=None, help="first date (inclusive)")
    ledger_opt(sessions)
    sessions.set_defaults(func=_cmd_sessions)

    publish = sub.add_parser("publish-sync", help="apply an ok run's change-set to the live corpus")
    publish.add_argument("run_dir", type=Path)
    publish.add_argument("--content-dir", type=Path, default=CONTENT_DIR, help=argparse.SUPPRESS)
    publish.set_defaults(func=_cmd_publish_sync)

    append = sub.add_parser("ledger-append", help="append the run's publish line to the ledger")
    append.add_argument("run_dir", type=Path)
    ledger_opt(append)
    append.set_defaults(func=_cmd_ledger_append)

    revert = sub.add_parser("ledger-revert", help="append a revert line for a published date")
    revert.add_argument("date")
    revert.add_argument("--check", action="store_true", help="only verify it is published")
    ledger_opt(revert)
    revert.set_defaults(func=_cmd_ledger_revert)

    budget = sub.add_parser("budget-check", help="exit 5 if the backfill must stop on budget")
    budget.add_argument("--budget", type=float, default=None, help=argparse.SUPPRESS)
    ledger_opt(budget)
    budget.set_defaults(func=_cmd_budget_check)

    msg = sub.add_parser("commit-message", help="print the session commit message")
    msg.add_argument("run_dir", type=Path)
    msg.set_defaults(func=_cmd_commit_message)

    delta = sub.add_parser("unresolved-delta", help="unresolved links: before snapshot → now")
    delta.add_argument("before", type=Path)
    delta.add_argument("--after", type=Path, default=SNAPSHOT_PATH, help=argparse.SUPPRESS)
    delta.set_defaults(func=_cmd_unresolved_delta)
    return parser


def cli(argv: Sequence[str] | None = None) -> int:
    """Parse + dispatch without telemetry (the test entry point)."""
    args = build_parser().parse_args(argv)
    return args.func(args)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    init_telemetry("astra.heartwood", endpoint=load_config().telemetry.host_otlp_endpoint)
    try:
        return args.func(args)
    finally:
        shutdown()  # console_script exit → flush the run's spans/metrics/logs


if __name__ == "__main__":
    sys.exit(main())
