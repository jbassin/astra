"""``astra-mouthpiece-tierlist`` — the villain and NPC tier-list special (host CLI).

    schema
        print the cast file's JSON schema.
    prepare [--show SLUG] [--latest DATE]
        lay out a fresh run dir under <mouthpiece-producer.artifacts-path>/tierlist-<latest>/
        for the cast-file subagent: overview.md, astra.md, sessions.md, cast.schema.json,
        brief.md (paths filled in) and summary.json. Free. Last stdout line RUN_DIR=<path>.
    validate RUN_DIR
        check RUN_DIR/cast.json (schema, campaign slugs, ties) and write cast.md. Free. Prints
        counts, or each problem by its location; never a name or a quote.
    script RUN_DIR [--model ID]
        write the tier-list script from RUN_DIR's cast file (Pass A tier list + Pass B
        dressing): pass_a.txt, script.json, report.md. PAID (OpenRouter). Pass A runs on
        --model, else mouthpiece.script-model, else mouthpiece.model; Pass B always on
        mouthpiece.model.
    render RUN_DIR
        PAID + LIVE: the shared special render (``special.render_special``).

The cast file is written by a Claude Code subagent from ``brief.md``, not by an LLM loop in
this repo, so there is no paid research step. The episode id is
``000.<show>.<latest>-special-tier-list``.

``prepare`` and ``script`` first refuse (exit 1) when an input is stale (``fresh.py``);
``--allow-stale`` skips the check.

Exit codes: 0 ok; 1 failed, stale or invalid.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

import astra_observe
from astra_config import load_config
from astra_llm import LiteLLMClient, ensure_openrouter_env
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.lint import score_script
from astra_mouthpiece.roster import build_roster_block

from ..producer.experiment import host_shares, script_words
from ..roundtable.astra import build_astra_block
from ..roundtable.cli import main_show
from ..roundtable.fresh import stale_reasons
from ..special import render_special
from .cast import CastFile
from .run import cast_schema, episode_id, prepare_run, validate_cast, write_cast_md
from .script import generate_tierlist_script

#: The public blurb. Spoiler-free on purpose: it names the format, not the rankings.
SYNOPSIS = (
    "A special episode: no session to recap, so it's tier-list time. Two boards, from S tier "
    "down to D: the villains of the Astra by how dangerous they are, then every notable NPC "
    "by how much the hosts love them, from this campaign and the GM's earlier games."
)


def _refuse_stale(args: argparse.Namespace) -> bool:
    """True (and the reasons printed) when the inputs are stale and --allow-stale is off."""
    if args.allow_stale:
        return False
    reasons = stale_reasons()
    for r in reasons:
        print(f"stale input: {r}", file=sys.stderr)
    if reasons:
        print("refusing (pass --allow-stale to run anyway)", file=sys.stderr)
    return bool(reasons)


def _counts(cast: CastFile) -> str:
    both = len({e.name for e in cast.villains} & {e.name for e in cast.npcs})
    moments = sum(len(e.moments) for e in [*cast.villains, *cast.npcs])
    return (
        f"{len(cast.villains)} villains, {len(cast.npcs)} npcs ({both} on both boards), "
        f"{moments} moments, {len(cast.setting)} setting notes"
    )


def _checked_cast(run: Path) -> CastFile | None:
    """The validated cast, with cast.md rewritten; None (problems printed) when invalid."""
    result = validate_cast(run)
    for p in result.problems:
        print(f"invalid: {p}", file=sys.stderr)
    if result.cast is None or result.problems:
        n = len(result.problems)
        print(f"cast.json is not valid: {n} problem{'' if n == 1 else 's'}", file=sys.stderr)
        return None
    write_cast_md(run, result.cast)
    return result.cast


def _cmd_schema(_args: argparse.Namespace) -> int:
    print(cast_schema())
    return 0


def _cmd_prepare(args: argparse.Namespace) -> int:
    if _refuse_stale(args):
        return 1
    show = args.show or main_show()
    run = prepare_run(show, latest=args.latest)
    summary = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    print(f"{show} through {summary['latest']}: {summary['sessions']} sessions; brief.md ready")
    print(f"RUN_DIR={run}")
    return 0


def _cmd_validate(args: argparse.Namespace) -> int:
    run = Path(args.run_dir)
    cast = _checked_cast(run)
    if cast is None:
        return 1
    print(f"cast.json valid: {_counts(cast)}; wrote cast.md")  # counts only, never names
    print(f"RUN_DIR={run}")
    return 0


def _cmd_script(args: argparse.Namespace) -> int:
    if _refuse_stale(args):
        return 1
    run = Path(args.run_dir)
    cast = _checked_cast(run)
    if cast is None:
        return 1
    summary = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    show, latest = summary["show"], summary["latest"]
    astra_md = run / "astra.md"
    astra = astra_md.read_text(encoding="utf-8") if astra_md.is_file() else build_astra_block(show)
    ensure_openrouter_env()
    cfg = load_config()
    dress_model = cfg.mouthpiece.model or cfg.llm.default_model
    model = args.model or cfg.mouthpiece.script_model or dress_model
    client = LiteLLMClient(caller="mouthpiece.tierlist")
    raw, script = generate_tierlist_script(
        client,
        episode_id(show, latest),
        (run / "overview.md").read_text(encoding="utf-8"),
        build_roster_block(show),
        (run / "cast.md").read_text(encoding="utf-8"),
        load_hosts(),
        astra=astra,
        model=model,
        dress_model=dress_model,
    )
    (run / "pass_a.txt").write_text(raw, encoding="utf-8")
    (run / "script.json").write_text(script.model_dump_json(indent=2), encoding="utf-8")
    words = script_words(script)
    shares = ", ".join(f"{k} {v:.0%}" for k, v in host_shares(script).items())
    report = "\n".join(
        [
            f"# Villain and NPC tier list — {show} through {latest}",
            "",
            f"- cast: {_counts(cast)}",
            f"- {len(script.turns)} turns, {words} words (~{words / 170:.0f} min), shares {shares}",
            f"- lint subtotal {score_script(script).mechanical_subtotal}/10 (provisional rubric)",
            f"- script cost ${client.snapshot()['cost_usd']:.4f} (Pass A {model}, "
            f"Pass B {dress_model})",
            "",
        ]
    )
    (run / "report.md").write_text(report, encoding="utf-8")
    print(report)  # stats only: the boards and dialogue stay unread until it airs
    print(f"RUN_DIR={run}")
    return 0


def _cmd_render(args: argparse.Namespace) -> int:
    print(render_special(Path(args.run_dir), SYNOPSIS))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="astra-mouthpiece-tierlist")
    sub = parser.add_subparsers(required=True)
    sub.add_parser("schema", help="print the cast file's JSON schema").set_defaults(
        func=_cmd_schema
    )
    p = sub.add_parser("prepare", help="lay out a run dir for the cast-file subagent")
    p.add_argument("--show", help="campaign slug (default: the main campaign)")
    p.add_argument("--latest", help="last session to include, YYYY-M-D (default: newest)")
    p.add_argument("--allow-stale", action="store_true", help="skip the freshness check")
    p.set_defaults(func=_cmd_prepare)
    v = sub.add_parser("validate", help="check cast.json and write cast.md (counts only)")
    v.add_argument("run_dir")
    v.set_defaults(func=_cmd_validate)
    s = sub.add_parser("script", help="tier-list script from a validated cast file (PAID)")
    s.add_argument("run_dir")
    s.add_argument("--model", help="override the Pass A model for this run")
    s.add_argument("--allow-stale", action="store_true", help="skip the freshness check")
    s.set_defaults(func=_cmd_script)
    r = sub.add_parser("render", help="TTS + assemble + publish trigger (PAID + LIVE)")
    r.add_argument("run_dir")
    r.set_defaults(func=_cmd_render)
    return parser


def cli(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


def main(argv: Sequence[str] | None = None) -> int:
    with astra_observe.run("astra.mouthpiece-tierlist"):
        return cli(argv)


if __name__ == "__main__":
    sys.exit(main())
