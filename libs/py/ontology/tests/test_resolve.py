"""Resolution engine tests (heartwood Phase 1, Deliverable D) — fixtures, no IO."""

from __future__ import annotations

from astra_ontology import Entity, Resolver


def _resolver() -> Resolver:
    return Resolver(
        [
            Entity(
                canonical="Ichel",
                kind="person",
                page="Org/Radiant Arms/People/Ichel",
                aliases=["Y'shell", "Eshell"],
                sources=["akasha", "defs"],
            ),
            Entity(
                canonical="Calaria",
                kind="place",
                page="Geography/Calaria/index",
                sources=["akasha"],
            ),
            Entity(canonical="Galaria", kind="place", sources=["defs"]),  # a near-twin of Calaria
            Entity(canonical="Mango", kind="person", being="noah", sources=["being"]),  # a PC
        ]
    )


def test_exact_match_is_confidence_one() -> None:
    r = _resolver().resolve("Calaria")
    assert r.status == "resolved" and r.confidence == 1.0
    assert r.entity is not None and r.entity.canonical == "Calaria"


def test_alias_exact_match_resolves_to_owner() -> None:
    r = _resolver().resolve("Eshell")  # a listed alias of Ichel
    assert r.status == "resolved" and r.entity is not None and r.entity.canonical == "Ichel"
    assert r.confidence == 1.0


def test_fuzzy_resolves_via_alias_phonetics() -> None:
    # The acceptance shape: "Y'shael" is NOT a listed alias, so this exercises nearest()
    # over the alias "Y'shell" → Ichel.
    r = _resolver().resolve("Y'shael")
    assert r.status == "resolved"
    assert r.entity is not None and r.entity.canonical == "Ichel"
    assert 0.6 <= r.confidence < 1.0


def test_invented_name_is_unknown_with_context() -> None:
    r = _resolver().resolve("Xqzzthwump")
    assert r.status == "unknown" and r.entity is None
    # top-k candidates still returned for context (a likely new entity)
    assert isinstance(r.candidates, list)


def test_pc_boundary_marker_is_carried() -> None:
    r = _resolver().resolve("Mango")
    assert r.status == "resolved" and r.entity is not None
    assert r.entity.being == "noah"  # the consumer skips writing PCs to the wiki


def _twins() -> Resolver:
    # Two near-twins of "Theren", one a person and one a place — a fuzzy tie.
    return Resolver(
        [
            Entity(canonical="Theron", kind="person", sources=["akasha"]),
            Entity(canonical="Theran", kind="place", sources=["akasha"]),
        ]
    )


def test_two_close_candidates_are_ambiguous() -> None:
    r = _twins().resolve("Theren")
    assert r.status == "ambiguous" and r.entity is None
    assert len(r.candidates) == 2  # both surfaced for the reviewer


def test_kind_hint_breaks_a_fuzzy_tie() -> None:
    r = _twins().resolve("Theren", kind_hint="person")
    assert r.status == "resolved" and r.entity is not None
    assert r.entity.canonical == "Theron" and r.entity.kind == "person"
