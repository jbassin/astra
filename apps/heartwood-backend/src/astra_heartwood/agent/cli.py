"""``astra-heartwood-agent`` — the heartwood agent's host CLI (0033 D33-1, §5).

    astra-heartwood-agent run <date> [--dry-run]   stage + run one session; exit 0 ok,
                                                   2 incomplete, 1 failed
    astra-heartwood-agent sessions [--from DATE]   ingestible faerrin dates, oldest first

``run`` never publishes — publishing is the separate ``publish-sync`` step, which lands
in S4 together with ``ledger-append``. Until then ``run`` without ``--dry-run`` behaves
like a dry run and says so.

Telemetry exports from the host (D33-10): ``init_telemetry`` uses
``telemetry.host-otlp-endpoint`` (the in-cluster default doesn't resolve here) and
``shutdown()`` flushes in ``finally``.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from astra_config import load_config
from astra_linguist.chronicle import date_key
from astra_observe import init_telemetry, shutdown

from .run import RunResult, run_session
from .sessions import ingestible_dates


def pending_sessions(from_date: str | None = None) -> list[str]:
    """Ingestible faerrin dates, oldest first, from ``from_date`` on (inclusive).

    S4 seam: the backfill also skips dates whose latest ledger line is a non-reverted
    publish (D33-12) — that filter is applied here once ``ledger.py`` exists.
    """
    dates = ingestible_dates()
    if from_date is not None:
        floor = date_key(from_date)
        dates = [d for d in dates if date_key(d) >= floor]
    return dates


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


def _cmd_run(args: argparse.Namespace) -> int:
    result = run_session(args.date, dry_run=args.dry_run)
    print(format_summary(result))
    if not args.dry_run:
        print("  publish: not wired yet (publish-sync lands in 0033 S4) — nothing was published")
    return result.exit_code


def _cmd_sessions(args: argparse.Namespace) -> int:
    for date in pending_sessions(args.from_date):
        print(date)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="astra-heartwood-agent", description="The heartwood akasha-wiki agent (0033)."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="stage + run the agent over one session")
    run.add_argument("date", help="session date, e.g. 2025-8-28")
    run.add_argument(
        "--dry-run", action="store_true", help="stage + run + artifacts only (never publish)"
    )
    run.set_defaults(func=_cmd_run)
    sessions = sub.add_parser("sessions", help="list ingestible sessions, oldest first")
    sessions.add_argument("--from", dest="from_date", default=None, help="first date (inclusive)")
    sessions.set_defaults(func=_cmd_sessions)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    init_telemetry("astra.heartwood", endpoint=load_config().telemetry.host_otlp_endpoint)
    try:
        return args.func(args)
    finally:
        shutdown()  # console_script exit → flush the run's spans/metrics/logs


if __name__ == "__main__":
    sys.exit(main())
