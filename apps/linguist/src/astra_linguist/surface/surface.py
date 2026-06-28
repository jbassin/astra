"""Run the live correction surfacer on one session → reviewable candidates.

    uv run python -m astra_linguist.surface.surface --session apps/linguist/data/2026-6-8.json
    uv run python -m astra_linguist.surface.surface --session <f> --out cands.json --mode full

The Phase-1 phonetic filter (`find_known`, pure) pre-flags OOV spans; the compiled dspy
judge (`make_dspy_complete_fn`, GLM 5.2) classifies each `confirm | new | reject` with the
deterministic guardrails + escalation (inert while judge == escalate), and the surviving
candidates are written enriched with their speaker + line text for review. This is a
**live** run — it spends LLM tokens and needs the SOPS key + network (never CI). The filter→judge
orchestration + the I/O are unit-tested with a stub `CompleteFn`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Literal, cast

from astra_lexicon import DEFS_PATH, Lexicon, build_lexicon
from astra_observe import init_telemetry

from ..models import Transcript
from .judge import Candidate, CompleteFn, Flagged, judge_session
from .known import find_known

Mode = Literal["hybrid", "full"]


def load_session(path: Path | str) -> Transcript:
    """Load a formatted session JSON (`data/{date}.json`) into a `Transcript`."""
    return Transcript.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))


def find_flagged(transcript: Transcript, lex: Lexicon) -> list[Flagged]:
    """The Phase-1 filter's flags, deduped to `Flagged` spans (one per line+span)."""
    pairs = {(c.line_ref, c.span) for c in find_known(transcript, lex)}
    return [Flagged(line_ref=line_ref, span=span) for line_ref, span in pairs]


def surface_session(
    transcript: Transcript,
    lex: Lexicon,
    *,
    complete_fn: CompleteFn,
    mode: Mode = "hybrid",
) -> list[Candidate]:
    """Phase-1 filter → Phase-2 judge (guardrails + escalation) → correction candidates.

    `find_known` flags OOV spans near a canonical; each becomes a `Flagged` span the judge
    classifies. Pure except for `complete_fn` (the injected judge); tests pass a stub.
    """
    return judge_session(
        transcript, find_flagged(transcript, lex), lex, complete_fn=complete_fn, mode=mode
    )


def surface_session_payload(
    transcript: Transcript,
    lex: Lexicon,
    *,
    complete_fn: CompleteFn,
    date: str,
    mode: Mode = "hybrid",
) -> dict[str, Any]:
    """The full surfacer for one session → a reviewable candidates payload (shared by the CLI
    and the `correction_candidates` Dagster asset). Skips the judge entirely when nothing is
    flagged (no LLM spend). Computes `find_known` once."""
    flagged = find_flagged(transcript, lex)
    candidates = (
        judge_session(transcript, flagged, lex, complete_fn=complete_fn, mode=mode)
        if flagged
        else []
    )
    return candidates_payload(
        candidates, transcript, date=date, flagged=len(flagged), lex_terms=len(lex.entries)
    )


def dedupe_candidate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse to one row per `(verdict, span-fold, canonical)` — the actionable unit.

    A garble flagged on many lines is one correction (a `defs.yaml` entry is a global
    regex), so the reviewer decides it once. Keeps the highest-confidence/richest-context
    occurrence + `count` + all `line_refs`; preserves any review `decision` (accept wins).
    """
    from astra_lexicon import fold_for_match

    groups: dict[tuple[str, str, Any], list[dict[str, Any]]] = {}
    for r in rows:
        key = (str(r["verdict"]), fold_for_match(str(r["span"])), r.get("suggested_canonical"))
        groups.setdefault(key, []).append(r)
    out: list[dict[str, Any]] = []
    for group in groups.values():
        rep = dict(max(group, key=lambda r: (float(r["confidence"]), len(str(r["line_text"])))))
        rep["count"] = len(group)
        rep["line_refs"] = sorted({int(r["line_ref"]) for r in group})
        decisions = {r.get("decision") for r in group if r.get("decision")}
        if "accept" in decisions:
            rep["decision"] = "accept"
        elif decisions:
            rep["decision"] = next(iter(decisions))
        out.append(rep)
    out.sort(key=lambda r: (str(r["verdict"]), -int(r["count"]), str(r["span"]).lower()))
    return out


def candidates_payload(
    candidates: list[Candidate], transcript: Transcript, *, date: str, flagged: int, lex_terms: int
) -> dict[str, Any]:
    """A reviewable record: one row per unique correction, enriched with speaker + line text."""
    rows = [
        {
            "line_ref": c.line_ref,
            "speaker": transcript.script[c.line_ref].user.name,
            "span": c.span,
            "verdict": c.verdict,
            "suggested_canonical": c.suggested_canonical,
            "confidence": round(c.confidence, 3),
            "reason": c.reason,
            "line_text": transcript.script[c.line_ref].text,
        }
        for c in candidates
    ]
    rows = dedupe_candidate_rows(rows)
    by_verdict: dict[str, int] = {}
    for r in rows:
        by_verdict[str(r["verdict"])] = by_verdict.get(str(r["verdict"]), 0) + 1
    return {
        "session": date,
        "lexicon_terms": lex_terms,
        "flagged_spans": flagged,
        "counts": by_verdict,
        "candidates": rows,
    }


def write_candidates(payload: dict[str, Any], path: Path | str) -> None:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_candidates(path: Path | str) -> dict[str, Any]:
    """Load a surfacer `{date}.candidates.json` payload (for the review TUI)."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Run the live correction surfacer on a session.")
    ap.add_argument("--session", type=Path, required=True, help="path to a data/{date}.json")
    ap.add_argument("--out", type=Path, default=None, help="default: <session>.candidates.json")
    ap.add_argument("--mode", default="hybrid", choices=["hybrid", "full"])
    args = ap.parse_args(argv)

    init_telemetry("astra.linguist.surface")

    transcript = load_session(args.session)
    lex = build_lexicon(DEFS_PATH)
    flagged = find_flagged(transcript, lex)
    print(f"{args.session.name}: {len(transcript.script)} lines, {len(flagged)} pre-flagged spans")
    if not flagged:
        print("nothing to judge — no OOV mistranscriptions flagged.")
        return 0

    from .judge import make_dspy_complete_fn  # lazy: pulls dspy + resolves the key

    print(f"judging (compiled dspy judge, {args.mode})…")
    payload = surface_session_payload(
        transcript,
        lex,
        complete_fn=make_dspy_complete_fn(),
        date=args.session.stem,
        mode=cast(Mode, args.mode),
    )

    out = args.out or args.session.with_suffix(".candidates.json")
    write_candidates(payload, out)
    print(f"{sum(payload['counts'].values())} candidate(s) {payload['counts']} → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
