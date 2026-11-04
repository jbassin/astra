"""``astra-mouthpiece-roundtable`` — the prediction-roundtable special (host CLI).

    schema
        print the dossier's JSON schema.
    prepare [--show SLUG] [--latest DATE] [--previous EPISODE_ID]
        lay out a fresh run dir under <mouthpiece-producer.artifacts-path>/roundtable-<latest>/
        for the dossier subagent: overview.md, astra.md, sessions.md, dossier.schema.json,
        brief.md (paths filled in) and summary.json; with --previous, also previous.txt (that
        published roundtable's transcript), which makes the run a follow-up. Free. Last
        stdout line RUN_DIR=<path>.
    validate RUN_DIR
        check RUN_DIR/dossier.json (schema, clue sources and ids, mystery numbers, hosts) and
        write dossier.md. Free. Prints counts, or each problem by its location; never content.
    dossier [--show SLUG] [--latest DATE]
        survey the campaign (default: the main show through its newest session) into a
        mystery file in a fresh run dir under
        <mouthpiece-producer.artifacts-path>/roundtable-<latest>/. PAID (OpenRouter).
        Last stdout line RUN_DIR=<path>.
    script RUN_DIR [--model ID]
        write the roundtable script from RUN_DIR's dossier (Pass A roundtable + Pass B
        dressing): pass_a.txt, script.json, report.md. PAID (OpenRouter). Pass A runs on
        --model, else mouthpiece.script-model (Kimi, as for the recaps), else
        mouthpiece.model; Pass B always on mouthpiece.model.
    render RUN_DIR
        PAID + LIVE: copy the script into ``episodes/<id>/``, synthesize it with the
        configured TTS provider, assemble ``<id>.episode.mp3``, and touch ``.last-rendered``
        so the linguist-commit path unit publishes it to the mouthpiece site.

The episode id is ``000.<show>.<latest>-special-roundtable``: it sorts right after its last
session. The two roundtables published before that form keep their recap-form ids.
``render`` stores ``kind: "special"`` in the script and digest; that is what every
session-scoped reader skips on.

``prepare``, ``dossier`` and ``script`` first refuse (exit 1) when an input is stale
(``fresh.py``): the astra-data clone has local changes or is not at origin/main, or this
checkout does not contain origin/main. ``--allow-stale`` skips the check.

Exit codes: 0 ok; 1 failed, stale or invalid; 2 dossier incomplete (iteration cap, still
usable).
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
from astra_llm.rlm import deno_available
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.inputs import episodes_root
from astra_mouthpiece.lint import score_script
from astra_mouthpiece.roster import build_roster_block
from astra_ontology_being import BEING_KDL_PATH, load_being

from ..producer.experiment import host_shares, script_words
from ..special import render_special
from .agent import run_dossier
from .astra import build_astra_block
from .dossier import Dossier
from .fresh import stale_reasons
from .run import (
    counts,
    dossier_schema,
    load_previous,
    prepare_run,
    validate_dossier,
    write_dossier_md,
)
from .script import generate_roundtable_script

_EXIT = {"ok": 0, "failed": 1, "incomplete": 2}

#: The public blurb. Spoiler-free on purpose: it names the format, not the theories.
SYNOPSIS = (
    "A special episode: no session to recap, so it's theory time. The deepest mysteries of "
    "the Astra, breadcrumbs from every season and the GM's earlier games, and three "
    "locked-in predictions each to check back on."
)
#: The follow-up's blurb, equally spoiler-free.
FOLLOWUP_SYNOPSIS = (
    "A special episode: the theory roundtable is back. The hosts answer for their last "
    "predictions, dig into the Astra's deepest mysteries with everything that has happened "
    "since, and lock in three new predictions each."
)


def main_show() -> str:
    return next(c.slug for c in load_being(BEING_KDL_PATH).campaigns if c.main)


def episode_id(show: str, latest: str) -> str:
    """The special's id: sorts right after its last session, with its own token."""
    return f"000.{show}.{latest}-special-roundtable"


def _summary(run: Path) -> dict[str, object]:
    return json.loads((run / "summary.json").read_text(encoding="utf-8"))


def _checked_dossier(run: Path) -> Dossier | None:
    """The validated dossier, with dossier.md rewritten; None (problems printed) when invalid."""
    result = validate_dossier(run)
    for p in result.problems:
        print(f"invalid: {p}", file=sys.stderr)
    if result.dossier is None or result.problems:
        n = len(result.problems)
        print(f"dossier.json is not valid: {n} problem{'' if n == 1 else 's'}", file=sys.stderr)
        return None
    write_dossier_md(run, result.dossier)
    return result.dossier


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


def _cmd_schema(_args: argparse.Namespace) -> int:
    print(dossier_schema())
    return 0


def _cmd_prepare(args: argparse.Namespace) -> int:
    if _refuse_stale(args):
        return 1
    show = args.show or main_show()
    previous = load_previous(episodes_root(), args.previous) if args.previous else None
    run = prepare_run(show, latest=args.latest, previous=previous)
    summary = _summary(run)
    kind = "follow-up" if previous is not None else "first roundtable"
    sessions = summary["sessions"]
    print(f"{show} through {summary['latest']}: {sessions} sessions, {kind}; brief.md ready")
    print(f"RUN_DIR={run}")
    return 0


def _cmd_validate(args: argparse.Namespace) -> int:
    run = Path(args.run_dir)
    dossier = _checked_dossier(run)
    if dossier is None:
        return 1
    print(f"dossier.json valid: {counts(dossier)}; wrote dossier.md")  # counts only
    print(f"RUN_DIR={run}")
    return 0


def _cmd_dossier(args: argparse.Namespace) -> int:
    if _refuse_stale(args):
        return 1
    if not deno_available():
        print("deno not found — run `just mouthpiece-sandbox-warm` first", file=sys.stderr)
        return 1
    result = run_dossier(args.show or main_show(), latest=args.latest)
    s = result.summary
    cost = s["cost_usd"]
    print(
        f"{s['show']} through {s['latest']}: {result.status} — {s['iterations']} iterations, "
        f"{s['seconds']} s, {s['mysteries']} mysteries, cost "
        f"{'unknown' if cost is None else f'${cost:.4f}'}"
    )
    if s["error"]:
        print(f"error: {s['error']}", file=sys.stderr)
    print(f"RUN_DIR={result.run_dir}")
    return _EXIT[result.status]


def _cmd_script(args: argparse.Namespace) -> int:
    if _refuse_stale(args):
        return 1
    run = Path(args.run_dir)
    # A prepared (subagent) run is checked again; an agent-loop run's dossier.md is used as is.
    if (run / "brief.md").is_file() and _checked_dossier(run) is None:
        return 1
    summary = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    followup = "previous" in summary
    block = (run / "dossier.md").read_text(encoding="utf-8")
    overview = (run / "overview.md").read_text(encoding="utf-8")
    show, latest = summary["show"], summary["latest"]
    astra_md = run / "astra.md"
    astra = astra_md.read_text(encoding="utf-8") if astra_md.is_file() else build_astra_block(show)
    ensure_openrouter_env()
    cfg = load_config()
    dress_model = cfg.mouthpiece.model or cfg.llm.default_model
    model = args.model or cfg.mouthpiece.script_model or dress_model
    client = LiteLLMClient(caller="mouthpiece.roundtable")
    raw, script = generate_roundtable_script(
        client,
        episode_id(show, latest),
        overview,
        build_roster_block(show),
        block,
        load_hosts(),
        astra=astra,
        followup=followup,
        model=model,
        dress_model=dress_model,
    )
    (run / "pass_a.txt").write_text(raw, encoding="utf-8")
    (run / "script.json").write_text(script.model_dump_json(indent=2), encoding="utf-8")
    words = script_words(script)
    shares = ", ".join(f"{k} {v:.0%}" for k, v in host_shares(script).items())
    report = "\n".join(
        [
            f"# Prediction roundtable — {show} through {latest}"
            + (" (follow-up)" if followup else ""),
            "",
            f"- {len(script.turns)} turns, {words} words (~{words / 170:.0f} min), shares {shares}",
            f"- lint subtotal {score_script(script).mechanical_subtotal}/10 (provisional rubric)",
            f"- script cost ${client.snapshot()['cost_usd']:.4f} (Pass A {model}, "
            f"Pass B {dress_model})",
            f"- dossier cost ${summary.get('cost_usd') or 0:.4f}",
            "",
        ]
    )
    (run / "report.md").write_text(report, encoding="utf-8")
    print(report)  # stats only: the title and dialogue stay unread until it airs
    print(f"RUN_DIR={run}")
    return 0


def _cmd_render(args: argparse.Namespace) -> int:
    run = Path(args.run_dir)
    summary_path = run / "summary.json"
    followup = summary_path.is_file() and "previous" in _summary(run)
    print(render_special(run, FOLLOWUP_SYNOPSIS if followup else SYNOPSIS))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="astra-mouthpiece-roundtable")
    sub = parser.add_subparsers(required=True)
    sub.add_parser("schema", help="print the dossier's JSON schema").set_defaults(func=_cmd_schema)
    p = sub.add_parser("prepare", help="lay out a run dir for the dossier subagent")
    p.add_argument("--show", help="campaign slug (default: the main campaign)")
    p.add_argument("--latest", help="last session to include, YYYY-M-D (default: newest)")
    p.add_argument("--previous", help="published episode id of the last roundtable (follow-up)")
    p.add_argument("--allow-stale", action="store_true", help="skip the freshness check")
    p.set_defaults(func=_cmd_prepare)
    v = sub.add_parser("validate", help="check dossier.json and write dossier.md (counts only)")
    v.add_argument("run_dir")
    v.set_defaults(func=_cmd_validate)
    d = sub.add_parser("dossier", help="survey the campaign into a mystery file (agent loop)")
    d.add_argument("--show", help="campaign slug (default: the main campaign)")
    d.add_argument("--latest", help="last session to include, YYYY-M-D (default: newest)")
    d.add_argument("--allow-stale", action="store_true", help="skip the freshness check")
    d.set_defaults(func=_cmd_dossier)
    s = sub.add_parser("script", help="roundtable script from a dossier run")
    s.add_argument("run_dir")
    s.add_argument("--model", help="override mouthpiece.model for this run")
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
    with astra_observe.run("astra.mouthpiece-roundtable"):
        return cli(argv)


if __name__ == "__main__":
    sys.exit(main())
