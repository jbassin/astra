"""Tests for the session surfacer runner (`surface.py`) — hermetic, stub judge.

The live path (`make_dspy_complete_fn`) is exercised only in a real run; here a stub
`CompleteFn` verifies the filter→judge→candidates orchestration + the I/O payload.
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_linguist.models import FormattedLine, Speaker, Transcript
from astra_linguist.surface.judge import Candidate, CompleteArgs, ScanResult
from astra_linguist.surface.lexicon import build_lexicon_from
from astra_linguist.surface.surface import (
    candidates_payload,
    dedupe_candidate_rows,
    load_session,
    surface_session,
    write_candidates,
)


def _line(text: str, name: str = "Josh") -> FormattedLine:
    return FormattedLine(
        start="00:00:00", second=0.0, text=text, user=Speaker(name=name, color="--x"), duration=1.0
    )


def _transcript(*texts: str) -> Transcript:
    return Transcript(date="2026-6-8", audio="a", script=[_line(t) for t in texts])


def test_surface_session_filters_then_judges() -> None:
    lex = build_lexicon_from(["Calaria"])
    transcript = _transcript("We finally traveled to Galaria this evening.")

    seen: list[str] = []

    def stub(args: CompleteArgs) -> ScanResult:
        seen.append(args.user)  # the rendered window contains the flagged span
        return ScanResult(
            candidates=[
                Candidate(
                    line_ref=0,
                    span="Galaria",
                    verdict="confirm",
                    suggested_canonical="Calaria",
                    confidence=0.9,
                    reason="phonetic + context",
                )
            ]
        )

    cands = surface_session(transcript, lex, complete_fn=stub, mode="full")
    assert seen and "Galaria" in seen[0]  # filter pre-flagged it into the judged window
    assert [(c.span, c.verdict, c.suggested_canonical) for c in cands] == [
        ("Galaria", "confirm", "Calaria")
    ]


def test_surface_session_no_flags_skips_judge() -> None:
    lex = build_lexicon_from(["Calaria"])
    transcript = _transcript("we walked to the store and bought some bread")

    def stub(args: CompleteArgs) -> ScanResult:  # must never be called
        raise AssertionError("judge called with no flagged spans")

    assert surface_session(transcript, lex, complete_fn=stub, mode="hybrid") == []


def test_candidates_payload_and_io_round_trip(tmp_path: Path) -> None:
    transcript = _transcript("a trip to Galaria")
    cands = [
        Candidate(
            line_ref=0,
            span="Galaria",
            verdict="confirm",
            suggested_canonical="Calaria",
            confidence=0.91,
            reason="x",
        )
    ]
    payload = candidates_payload(cands, transcript, date="2026-6-8", flagged=1, lex_terms=1)
    assert payload["session"] == "2026-6-8"
    assert payload["counts"] == {"confirm": 1}
    row = payload["candidates"][0]
    assert row["speaker"] == "Josh" and row["line_text"] == "a trip to Galaria"

    out = tmp_path / "cands.json"
    write_candidates(payload, out)
    assert json.loads(out.read_text())["candidates"][0]["suggested_canonical"] == "Calaria"


def test_dedupe_candidate_rows_collapses_by_correction() -> None:
    def row(line_ref, span, verdict, canon, conf, line_text="ctx", decision=None):
        r = {
            "line_ref": line_ref,
            "speaker": "Josh",
            "span": span,
            "verdict": verdict,
            "suggested_canonical": canon,
            "confidence": conf,
            "reason": "x",
            "line_text": line_text,
        }
        if decision:
            r["decision"] = decision
        return r

    rows = [
        row(10, "Galaria", "confirm", "Calaria", 0.8),
        row(
            42, "galaria", "confirm", "Calaria", 0.9, line_text="richer context here"
        ),  # dup (folds same)
        row(7, "Galaria", "confirm", "Calaria", 0.7, decision="accept"),  # dup w/ a decision
        row(99, "Thessian", "new", None, 0.6),
    ]
    out = dedupe_candidate_rows(rows)
    assert len(out) == 2  # one confirm correction (3 occurrences) + one new
    conf = next(r for r in out if r["verdict"] == "confirm")
    assert conf["count"] == 3 and conf["line_refs"] == [7, 10, 42]
    # representative is the highest-confidence occurrence (0.9, span 'galaria')
    assert conf["confidence"] == 0.9 and conf["span"] == "galaria"
    assert conf["line_text"] == "richer context here"
    assert conf["decision"] == "accept"  # a decision anywhere in the group is preserved


def test_load_session_round_trips(tmp_path: Path) -> None:
    transcript = _transcript("a trip to Galaria")
    p = tmp_path / "2026-6-8.json"
    p.write_text(transcript.model_dump_json(), encoding="utf-8")
    assert load_session(p).script[0].text == "a trip to Galaria"
