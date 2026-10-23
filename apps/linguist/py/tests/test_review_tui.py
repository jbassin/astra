"""Tests for the mined-negative triage TUI's pure helpers (gate J).

The keypress loop is interactive-only (needs a TTY, never in CI); these cover the testable
core: keypress→label, span highlighting, and that edits round-trip through the artifact.
"""

from __future__ import annotations

from pathlib import Path

from astra_linguist.surface.goldset import MinedRecord, load_mined_artifact, write_mined_artifact
from astra_linguist.surface.review_tui import (
    apply_action,
    apply_candidate_action,
    highlight_span,
    render_candidate,
    render_record,
)
from astra_linguist.surface.surface import load_candidates, write_candidates


def _cand(verdict: str = "confirm") -> dict:
    return {
        "line_ref": 412,
        "speaker": "Josh",
        "span": "Galaria",
        "verdict": verdict,
        "suggested_canonical": "Calaria" if verdict == "confirm" else None,
        "confidence": 0.88,
        "reason": "phonetic + context",
        "line_text": "we traveled to Galaria this evening",
    }


def _rec(label: str = "skip") -> MinedRecord:
    return MinedRecord(
        date="2024-10-21",
        line_ref=847,
        span="Filksnake",
        speaker="Josh",
        line_text="Some noise is made by the count, Mr. Filksnake, as you traipse the forest.",
        auto_label=label,
        canonical=None,
        top_canonical="Vilksnake",
        top_score=0.93,
        recurrence=1,
        reason="ambiguous single-token near-miss",
    )


def test_apply_action_confirm_adopts_nearest_canonical() -> None:
    rec = _rec()
    assert apply_action(rec, "c") is True
    assert rec.auto_label == "confirm"
    assert rec.canonical == "Vilksnake"
    assert rec.reason == "hand-reviewed: confirm"


def test_apply_action_reject_new_skip_clear_canonical() -> None:
    for key, label in (("r", "reject"), ("n", "new"), ("s", "skip")):
        rec = _rec("confirm")
        rec.canonical = "Vilksnake"
        assert apply_action(rec, key) is True
        assert rec.auto_label == label
        assert rec.canonical is None


def test_apply_action_ignores_non_action_keys() -> None:
    rec = _rec()
    assert apply_action(rec, "k") is False
    assert apply_action(rec, "x") is False
    assert rec.auto_label == "skip"  # unchanged


def test_highlight_span_marks_and_windows() -> None:
    out = highlight_span("a b Filksnake c d", "Filksnake")
    assert "\033[7mFilksnake\033[0m" in out  # reverse-highlighted
    # a long line is windowed around the span with ellipses
    long = "x" * 200 + " Filksnake " + "y" * 200
    windowed = highlight_span(long, "Filksnake", width=40)
    assert windowed.startswith("…") and windowed.endswith("…\033[0m")
    assert "Filksnake" in windowed


def test_render_record_includes_key_facts() -> None:
    view = render_record(_rec(), 4, 10)
    assert "5 / 10" in view  # 1-based position
    assert "Filksnake" in view and "Vilksnake" in view
    assert "[c]" in view and "[r]" in view  # action keys shown


# ── surfacer-candidate review ───────────────────────────────────────────────
def test_apply_candidate_action_accept_reject() -> None:
    row = _cand()
    assert apply_candidate_action(row, "a") is True
    assert row["decision"] == "accept"
    assert apply_candidate_action(row, "r") is True
    assert row["decision"] == "reject"
    assert apply_candidate_action(row, "k") is False  # non-action key, decision unchanged
    assert row["decision"] == "reject"


def test_render_candidate_shows_verdict_and_canonical() -> None:
    view = render_candidate(_cand(), 2, 9)
    assert "3 / 9" in view
    assert "Galaria" in view and "Calaria" in view  # span + suggested canonical
    assert "[a]ccept" in view and "[r]eject" in view


def test_candidate_decisions_round_trip(tmp_path: Path) -> None:
    payload = {"session": "2026-6-8", "candidates": [_cand("confirm"), _cand("reject")]}
    apply_candidate_action(payload["candidates"][0], "a")  # accept the first
    path = tmp_path / "2026-6-8.candidates.json"
    write_candidates(payload, path)
    back = load_candidates(path)
    assert back["candidates"][0]["decision"] == "accept"
    assert "decision" not in back["candidates"][1]  # untouched stays pending


def test_edits_round_trip_through_artifact(tmp_path: Path) -> None:
    records = [_rec(), _rec("reject")]
    apply_action(records[0], "c")  # promote first to confirm
    path = tmp_path / "gold" / "mined.json"
    write_mined_artifact(records, path)
    back = load_mined_artifact(path)
    promoted = next(r for r in back if r.auto_label == "confirm")
    assert promoted.canonical == "Vilksnake"
