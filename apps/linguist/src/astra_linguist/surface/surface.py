"""Run the live correction surfacer on one session → reviewable candidates.

    uv run python -m astra_linguist.surface.surface --session apps/linguist/data/2026-6-8.json
    uv run python -m astra_linguist.surface.surface --session <f> --out cands.json --mode full

The Phase-1 phonetic filter (`find_known`, pure) pre-flags OOV spans; the compiled dspy
judge (`make_dspy_complete_fn`) classifies each `confirm | new | reject` with the
deterministic guardrails + haiku→sonnet escalation, and the surviving candidates are
written enriched with their speaker + line text for review. This is a **live** run — it
spends Claude tokens and needs the SOPS key + network (never CI). The filter→judge
orchestration + the I/O are unit-tested with a stub `CompleteFn`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Literal, cast

from astra_observe import init_telemetry

from ..models import Transcript
from .judge import Candidate, CompleteFn, Flagged, judge_session
from .known import find_known
from .lexicon import Lexicon, build_lexicon

Mode = Literal["hybrid", "full"]


def load_session(path: Path | str) -> Transcript:
    """Load a formatted session JSON (`data/{date}.json`) into a `Transcript`."""
    return Transcript.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))


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
    flagged = list({(c.line_ref, c.span) for c in find_known(transcript, lex)})
    spans = [Flagged(line_ref=line_ref, span=span) for line_ref, span in flagged]
    return judge_session(transcript, spans, lex, complete_fn=complete_fn, mode=mode)


def candidates_payload(
    candidates: list[Candidate], transcript: Transcript, *, date: str, flagged: int, lex_terms: int
) -> dict[str, Any]:
    """A reviewable record: each candidate enriched with its speaker + line text."""
    rows = []
    for c in candidates:
        line = transcript.script[c.line_ref]
        rows.append(
            {
                "line_ref": c.line_ref,
                "speaker": line.user.name,
                "span": c.span,
                "verdict": c.verdict,
                "suggested_canonical": c.suggested_canonical,
                "confidence": round(c.confidence, 3),
                "reason": c.reason,
                "line_text": line.text,
            }
        )
    rows.sort(key=lambda r: (int(r["line_ref"]), str(r["span"])))
    by_verdict: dict[str, int] = {}
    for c in candidates:
        by_verdict[c.verdict] = by_verdict.get(c.verdict, 0) + 1
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
    lex = build_lexicon()
    flagged = list({(c.line_ref, c.span) for c in find_known(transcript, lex)})
    print(f"{args.session.name}: {len(transcript.script)} lines, {len(flagged)} pre-flagged spans")
    if not flagged:
        print("nothing to judge — no OOV mistranscriptions flagged.")
        return 0

    from .judge import make_dspy_complete_fn  # lazy: pulls dspy + resolves the key

    print(f"judging (compiled dspy judge, {args.mode})…")
    candidates = surface_session(
        transcript, lex, complete_fn=make_dspy_complete_fn(), mode=cast(Mode, args.mode)
    )

    out = args.out or args.session.with_suffix(".candidates.json")
    payload = candidates_payload(
        candidates,
        transcript,
        date=args.session.stem,
        flagged=len(flagged),
        lex_terms=len(lex.entries),
    )
    write_candidates(payload, out)
    print(f"{len(candidates)} candidate(s) {payload['counts']} → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
