"""``astra-mouthpiece-roundtable`` — the prediction-roundtable special (host CLI).

    dossier [--show SLUG] [--latest DATE]
        survey the campaign (default: the main show through its newest session) into a
        mystery file in a fresh run dir under
        artifacts/mouthpiece-experiments/roundtable-<latest>/. PAID (OpenRouter).
        Last stdout line RUN_DIR=<path>.
    script RUN_DIR [--model ID]
        write the roundtable script from RUN_DIR's dossier (Pass A roundtable + Pass B
        dressing): pass_a.txt, script.json, report.md. PAID (OpenRouter).
    render RUN_DIR
        PAID + LIVE: copy the script into ``episodes/<id>/``, synthesize it with the
        configured TTS provider, assemble ``<id>.episode.mp3``, and touch ``.last-rendered``
        so the linguist-commit path unit publishes it to the mouthpiece site.

The episode id uses the recap form (``…<latest>-recap-of-<first>``) so the catalog sorts
it right after its last session and every session-scoped reader skips it.

Exit codes: 0 ok; 1 failed; 2 dossier incomplete (iteration cap, still usable).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from astra_config import load_config
from astra_llm import ensure_openrouter_env
from astra_llm.rlm import deno_available
from astra_observe import init_telemetry, shutdown
from astra_ontology_being import BEING_KDL_PATH, load_being

from ..hosts import load_hosts
from ..inputs import episodes_root
from ..lint import score_script
from ..models import Script
from ..producer.experiment import MeteredClient, host_shares, script_words
from ..producer.tools import permitted_dates
from ..roster import build_roster_block
from .agent import cutoff_after, run_dossier
from .script import generate_roundtable_script

_EXIT = {"ok": 0, "failed": 1, "incomplete": 2}

#: The public blurb. Spoiler-free on purpose: it names the format, not the theories.
SYNOPSIS = (
    "A special episode: no session to recap, so the hosts finally sit down for the theory "
    "episode. Breadcrumbs from every season, the mysteries closest to the party, and three "
    "locked-in predictions each to check back on."
)


def main_show() -> str:
    return next(c.slug for c in load_being(BEING_KDL_PATH).campaigns if c.main)


def episode_id(show: str, latest: str) -> str:
    first = permitted_dates(cutoff_after(latest), show)[0]
    return f"000.{show}.{latest}-recap-of-{first}"


def _cmd_dossier(args: argparse.Namespace) -> int:
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
    run = Path(args.run_dir)
    summary = json.loads((run / "summary.json").read_text(encoding="utf-8"))
    block = (run / "dossier.md").read_text(encoding="utf-8")
    overview = (run / "overview.md").read_text(encoding="utf-8")
    show, latest = summary["show"], summary["latest"]
    ensure_openrouter_env()
    model = args.model or load_config().mouthpiece.model
    client = MeteredClient()
    raw, script = generate_roundtable_script(
        client,
        episode_id(show, latest),
        overview,
        build_roster_block(show),
        block,
        load_hosts(),
        model=model,
    )
    (run / "pass_a.txt").write_text(raw, encoding="utf-8")
    (run / "script.json").write_text(script.model_dump_json(indent=2), encoding="utf-8")
    words = script_words(script)
    shares = ", ".join(f"{k} {v:.0%}" for k, v in host_shares(script).items())
    report = "\n".join(
        [
            f"# Prediction roundtable — {show} through {latest}",
            "",
            f"- {len(script.turns)} turns, {words} words (~{words / 170:.0f} min), shares {shares}",
            f"- lint subtotal {score_script(script).mechanical_subtotal}/10 (provisional rubric)",
            f"- script cost ${client.snapshot()['cost_usd']:.4f} ({model})",
            f"- dossier cost ${summary.get('cost_usd') or 0:.4f}",
            "",
        ]
    )
    (run / "report.md").write_text(report, encoding="utf-8")
    print(report)  # stats only: the title and dialogue stay unread until it airs
    print(f"RUN_DIR={run}")
    return 0


def _cmd_render(args: argparse.Namespace) -> int:
    # The Dagster module owns the provider/voice resolution; reuse it rather than fork it.
    from ..assemble import assemble_episode
    from ..assets import _atomic_write, _provider, _voices
    from ..tts.synth import synthesize_script

    run = Path(args.run_dir)
    script = Script.model_validate_json((run / "script.json").read_text(encoding="utf-8"))
    sid = script.session_id
    out = episodes_root() / sid
    out.mkdir(parents=True, exist_ok=True)
    _atomic_write(out / "script.json", script.model_dump_json(indent=2))
    # Not a SessionDigest (no clean pass, no stats): the catalog reads only these two keys,
    # the same shape as the earlier recap capstones.
    _atomic_write(out / "digest.json", json.dumps({"session_id": sid, "synopsis": SYNOPSIS}))
    manifest = synthesize_script(
        script, provider=_provider(), voices=_voices(load_hosts()), out_dir=out
    )
    _atomic_write(out / "manifest.json", manifest.model_dump_json(indent=2))
    episode, _transcript = assemble_episode(manifest, script, out_dir=out)
    _atomic_write(episodes_root() / ".last-rendered", sid)
    print(f"rendered {episode} ({len(manifest.clips)} clips, {manifest.mode})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="astra-mouthpiece-roundtable")
    sub = parser.add_subparsers(required=True)
    d = sub.add_parser("dossier", help="survey the campaign into a mystery file")
    d.add_argument("--show", help="campaign slug (default: the main campaign)")
    d.add_argument("--latest", help="last session to include, YYYY-M-D (default: newest)")
    d.set_defaults(func=_cmd_dossier)
    s = sub.add_parser("script", help="roundtable script from a dossier run")
    s.add_argument("run_dir")
    s.add_argument("--model", help="override mouthpiece.model for this run")
    s.set_defaults(func=_cmd_script)
    r = sub.add_parser("render", help="TTS + assemble + publish trigger (PAID + LIVE)")
    r.add_argument("run_dir")
    r.set_defaults(func=_cmd_render)
    return parser


def cli(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


def main(argv: Sequence[str] | None = None) -> int:
    init_telemetry(
        "astra.mouthpiece-roundtable", endpoint=load_config().telemetry.host_otlp_endpoint
    )
    try:
        return cli(argv)
    finally:
        shutdown()


if __name__ == "__main__":
    sys.exit(main())
