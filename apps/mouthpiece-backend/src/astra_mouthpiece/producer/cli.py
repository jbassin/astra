"""``astra-mouthpiece-producer`` — the producer's host CLI (0034 D34-2, §5).

    brief <date> [--model ID]     run the producer over one session; writes brief.json /
                                  brief.md / trajectory / warnings / summary into a fresh
                                  run dir. The last stdout line is ``RUN_DIR=<path>``.

PAID (OpenRouter LLM calls), never live: nothing is written under ``episodes/``, nothing
is committed, no TTS. The ``just mouthpiece-*`` recipes wrap these.

Exit codes: 0 ``ok``; 1 ``failed`` or an unexpected error; 2 ``incomplete`` (iteration cap,
brief still usable).

Telemetry exports from the host: ``main`` calls ``init_telemetry`` with
``telemetry.host-otlp-endpoint`` and ``shutdown()`` flushes in ``finally``. ``cli()`` is
the telemetry-free core tests drive.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from astra_config import load_config
from astra_llm.rlm import deno_available
from astra_observe import init_telemetry, shutdown

from .run import RunStatus, run_producer

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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="astra-mouthpiece-producer")
    sub = parser.add_subparsers(required=True)
    brief = sub.add_parser("brief", help="run the producer over one session")
    brief.add_argument("date")
    brief.add_argument("--model", help="override main + sub model for this run")
    brief.set_defaults(func=_cmd_brief)
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
