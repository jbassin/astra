"""Committed entity.kdl gate — it parses, round-trips byte-identically, and matches a
fresh seed of the committed sources (the drift check, modulo curated fields)."""

from __future__ import annotations

from astra_ontology import serialize_entities
from astra_ontology_entity import ENTITY_KDL_PATH, load_entities, resolve
from astra_ontology_entity.seed import build_registry


def test_entity_kdl_round_trips() -> None:
    entities = load_entities()
    assert len(entities) > 200  # the full seeded registry (akasha ∪ defs ∪ PCs)
    assert serialize_entities(entities) == ENTITY_KDL_PATH.read_text(encoding="utf-8")


def test_entity_kdl_is_not_stale() -> None:
    """A fresh seed of the committed sources must equal the committed file (no drift)."""
    _, text = build_registry()
    assert text == ENTITY_KDL_PATH.read_text(encoding="utf-8")


def test_acceptance_ichel_is_a_linked_person() -> None:
    by_name = {e.canonical: e for e in load_entities()}
    ichel = by_name["Ichel"]
    assert ichel.kind == "person"
    assert ichel.page == "Org/Radiant Arms/People/Ichel"
    assert "Y'shell" in ichel.aliases  # the defs variant that powers resolve("Y'shael")


def test_acceptance_resolve_yshael_to_ichel() -> None:
    """The Phase-1 acceptance case (§8.4): a never-listed garble resolves via phonetics."""
    r = resolve("Y'shael")
    assert r.status == "resolved"
    assert r.entity is not None and r.entity.canonical == "Ichel"
    assert r.entity.kind == "person" and r.entity.page == "Org/Radiant Arms/People/Ichel"


def test_acceptance_exact_and_unknown() -> None:
    assert resolve("Calaria").confidence == 1.0  # an exact registry name
    assert resolve("Zzyzxqphlumph").status == "unknown"  # an invented name
