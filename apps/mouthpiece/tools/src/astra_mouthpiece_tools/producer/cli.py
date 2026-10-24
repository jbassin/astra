"""``astra-mouthpiece-producer`` — the producer's host CLI (0034 D34-2, §5).

    brief <date> [--model ID]     run the producer over one session; writes brief.json /
                                  brief.md / trajectory / warnings / summary into a fresh
                                  run dir. The last stdout line is ``RUN_DIR=<path>``.
    experiment <date> [--arm ID]... [--reuse-brief RUN_DIR]
                                  the 0034 comparison: one brief (or a reused one), the
                                  two-pass script once per ``experiment-models`` arm, and
                                  ``report.md`` against the live script. ``--arm`` (repeat)
                                  picks arms by model id or slug (e.g. ``glm-5.3``).

PAID (OpenRouter LLM calls), never live: nothing is written under ``episodes/``, nothing
is committed, no TTS. The ``just mouthpiece-*`` recipes wrap these.

Exit codes: 0 ``ok``; 1 ``failed`` or an unexpected error; 2 ``incomplete`` (iteration cap,
brief still usable). ``experiment`` exits 1 if the producer failed or every arm failed.

Telemetry exports from the host: ``main`` calls ``init_telemetry`` with
``telemetry.host-otlp-endpoint`` and ``shutdown()`` flushes in ``finally``. ``cli()`` is
the telemetry-free core tests drive.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from astra_config import load_config
from astra_llm.rlm import deno_available
from astra_mouthpiece.producer.run import RunStatus, run_producer
from astra_observe import init_telemetry, shutdown

from .experiment import run_experiment

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_INCOMPLETE = 2

_EXIT: dict[RunStatus, int] = {"ok": EXIT_OK, "failed": EXIT_FAILED, "incomplete": EXIT_INCOMPLETE}


def _cmd_brief(args: argparse.Namespace) -> int:
    if not deno_available():
        print("deno not found — run `just mouthpiece-sandbox-warm` first", file=sys.stderr)
        return EXIT_FAILED
    cfg = load_config().mouthpiece_producer
    if args.model:
        cfg = cfg.model_copy(update={"model": args.model, "sub_model": args.model})
    result = run_producer(args.date, config=cfg)
    s = result.summary
    cost = s["cost_usd"]
    print(
        f"{args.date}: {result.status} — {s['iterations']} iterations, "
        f"cost {'unknown' if cost is None else f'${cost:.4f}'}, counts {s['counts']}"
    )
    if result.error:
        print(f"error: {result.error}", file=sys.stderr)
    print(f"RUN_DIR={result.run_dir}")
    return _EXIT[result.status]


def _cmd_experiment(args: argparse.Namespace) -> int:
    reuse = Path(args.reuse_brief) if args.reuse_brief else None
    if reuse is None and not deno_available():
        print("deno not found — run `just mouthpiece-sandbox-warm` first", file=sys.stderr)
        return EXIT_FAILED
    result = run_experiment(args.date, arms=args.arm or None, reuse_brief=reuse)
    print(result.report)
    print(f"RUN_DIR={result.run_dir}")
    if result.producer_status == "failed" or not any(a.script for a in result.arms):
        return EXIT_FAILED
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="astra-mouthpiece-producer")
    sub = parser.add_subparsers(required=True)
    brief = sub.add_parser("brief", help="run the producer over one session")
    brief.add_argument("date")
    brief.add_argument("--model", help="override main + sub model for this run")
    brief.set_defaults(func=_cmd_brief)
    exp = sub.add_parser("experiment", help="brief + script arms + report for one session")
    exp.add_argument("date")
    exp.add_argument("--arm", action="append", help="model id or slug; repeat for several")
    exp.add_argument("--reuse-brief", help="run dir holding a brief.json to reuse")
    exp.set_defaults(func=_cmd_experiment)
    return parser


def cli(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


def main(argv: Sequence[str] | None = None) -> int:
    init_telemetry("astra.mouthpiece-producer", endpoint=load_config().telemetry.host_otlp_endpoint)
    try:
        return cli(argv)
    finally:
        shutdown()  # console_script exit → flush the run's spans/metrics/logs


if __name__ == "__main__":
    sys.exit(main())
