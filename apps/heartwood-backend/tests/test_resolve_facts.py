"""Resolution mapping (Phase-2 spec §8, S4) — real registry (committed entity.kdl, no network).

Mirrors the Phase-1 acceptance case: the garbled `Y'shael` resolves to `Ichel`; an invented
name is `unknown` and carries candidate canonicals (never force-linked); schema round-trips.
"""

from __future__ import annotations

from astra_heartwood.models import NounFact, ResolvedFact, SessionFacts
from astra_heartwood.resolve_facts import resolve_fact


def test_resolves_garbled_name_to_canonical_entity() -> None:
    rf = resolve_fact(NounFact(subject="Y'shael", kind_hint="person", claim="Y'shael is a healer."))
    assert rf.status == "resolved"
    assert rf.entity is not None
    assert rf.entity.canonical == "Ichel"
    assert rf.claim == "Y'shael is a healer."


def test_unknown_subject_is_flagged_not_linked() -> None:
    rf = resolve_fact(NounFact(subject="Zzyxqq the Unheard", claim="An invented nobody."))
    assert rf.status in {"unknown", "ambiguous"}
    assert rf.entity is None
    # candidates carry canonical names for the human; never silently force-linked
    assert all(isinstance(c[0], str) for c in rf.candidates)


def test_session_facts_round_trips() -> None:
    rf = resolve_fact(NounFact(subject="Ichel", kind_hint="person", claim="Ichel leads the Scale."))
    sf = SessionFacts(date="2099-1-1", show="through-a-song-darkly", world="faerrin", facts=[rf])
    again = SessionFacts.model_validate_json(sf.model_dump_json())
    assert again == sf
    assert again.facts[0].entity is not None
    assert isinstance(again.facts[0], ResolvedFact)
