"""entity.kdl gate over the checked-in fixture (fixtures/astra-data/entity/entity.kdl; the
root conftest points data.content-root there): it parses, round-trips byte-identically,
and matches a fresh seed of the fixture snapshot + defs + roster (the drift check, modulo
curated fields).

The real registry lives in the astra-data repo. Its drift gate runs where it is written:
`just heartwood-agent` and `heartwood-revert` reseed it from the new snapshot before every
commit there. A defs.kdl or being.kdl change in this repo leaves the real registry stale
until the next heartwood run or a manual `uv run astra-ontology-entity-seed` (then commit
in the clone); `astra-ontology-entity-seed --check` reports the drift. When the fixture
snapshot, defs.kdl or being.kdl change, regenerate the fixture with
`ASTRA_CONTENT_ROOT=fixtures/astra-data uv run astra-ontology-entity-seed`.
"""

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


def test_defs_variants_merge_into_a_linked_page() -> None:
    """A wiki page and its defs.kdl corrections seed ONE linked entity."""
    by_name = {e.canonical: e for e in load_entities()}
    whiskers = by_name["Mr. Whiskers"]
    assert whiskers.kind == "person"
    assert whiskers.page == "Org/Amber Call/People/Mr. Whiskers"
    assert "Whiskers" in whiskers.aliases  # a defs variant
    assert set(whiskers.sources) >= {"akasha", "defs"}


def test_acceptance_resolve_yshael_to_ichel() -> None:
    """The Phase-1 acceptance case (§8.4): a never-listed garble resolves via phonetics
    (Ichel's page is not in the fixture wiki, so here it resolves to the defs entity)."""
    r = resolve("Y'shael")
    assert r.status == "resolved"
    assert r.entity is not None and r.entity.canonical == "Ichel"
    assert r.entity.kind is None and r.entity.page is None  # defs-only in the fixture


def test_acceptance_exact_and_unknown() -> None:
    assert resolve("Calaria").confidence == 1.0  # an exact registry name
    assert resolve("Zzyzxqphlumph").status == "unknown"  # an invented name
