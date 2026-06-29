"""The review.kdl store (Phase 4) — parse/serialize + the cross-language contract gate.

The shared fixture round-trips byte-identical here AND in the TS reviewState.test.ts; if
either hand-rolled serializer drifts, one of the two fails (B3).
"""

from __future__ import annotations

from pathlib import Path

from astra_heartwood.review import (
    ConflictResolution,
    Decision,
    RegistryDecision,
    ReviewState,
    parse_review_state,
    serialize_review_state,
)

FIXTURE = Path(__file__).parent / "fixtures" / "review-sample.kdl"


def test_shared_fixture_round_trips_byte_identical() -> None:
    text = FIXTURE.read_text(encoding="utf-8")
    assert serialize_review_state(parse_review_state(text)) == text


def test_parse_reads_every_node() -> None:
    state = parse_review_state(FIXTURE.read_text(encoding="utf-8"))
    assert state.date == "2025-8-28"
    assert len(state.decisions) == 2
    assert state.decisions[0].id == "org-iconoclasm-index"
    assert state.decisions[0].state == "approved"
    assert state.decisions[0].target_path == "Org/Iconoclasm/index"
    assert state.decisions[0].committed_at is None
    assert state.decisions[1].rejection_reason == "not-canon"
    assert state.conflict_resolutions[0].resolution == "accepted"
    assert state.conflict_resolutions[0].claim == 'Iconoclasm functions as an "orphanage".'
    assert state.registry_decisions[0].canonical == "Threshold Authority"


def test_programmatic_round_trip() -> None:
    state = ReviewState(
        date="2099-1-1",
        updated_at="2099-01-01T00:00:00-04:00",
        decisions=[
            Decision(id="a", state="approved", target_path="Org/A/index"),
            Decision(id="b", state="rejected", rejection_reason="hallucinated"),
        ],
        conflict_resolutions=[ConflictResolution(page_id="a", claim="x", resolution="rejected")],
        registry_decisions=[RegistryDecision(canonical="A", state="approved")],
    )
    assert parse_review_state(serialize_review_state(state)) == state
