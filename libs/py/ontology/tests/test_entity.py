"""Entity registry tests (heartwood Phase 1, Deliverable C) — seeding + KDL round-trip.

Hermetic: fixtures for the three seed sources (akasha pages, defs, being), no file IO.
"""

from __future__ import annotations

from astra_ontology import (
    Being,
    Campaign,
    Entity,
    Role,
    merge_seed,
    parse_entities,
    seed_entities,
    serialize_entities,
)


def _being() -> Being:
    return Being(
        players=[],
        guest_color="",
        weal_hosts=[],
        podcast_personas=[],
        campaigns=[
            Campaign(
                slug="faerrin-arc",
                name="Faerrin Arc",
                edition="pf2e",
                main=True,
                world="faerrin",
                roles=[
                    Role(player="josh", character="Gamemaster"),  # skipped (GM)
                    Role(player="jorge", character="Ichel"),  # a PC that collides with an NPC
                    Role(player="noah", character="Mango"),
                ],
            ),
            Campaign(
                slug="off-world",
                name="Off World",
                edition="pf2e",
                main=False,
                world="sedecium",  # not faerrin → its PCs are NOT seeded
                roles=[Role(player="josh", character="Foral")],
            ),
        ],
    )


_PAGES = [
    {"path": "Divinity/The Watcher", "frontmatter": {"aliases": ["Watcher"]}},
    {"path": "Geography/Calaria/index", "frontmatter": {"aliases": []}},  # /index → "Calaria"
    {"path": "Org/Radiant Arms/People/Ichel", "frontmatter": {"aliases": []}},  # person
    {"path": "Org/Radiant Arms/index", "frontmatter": {"aliases": []}},  # org (no People)
    {"path": "Phenomena/The Slip", "frontmatter": {"aliases": []}},
    {"path": "Rules/Combat", "frontmatter": {"aliases": []}},  # NOT seeded
    {"path": "Timeline", "frontmatter": {"aliases": []}},  # NOT seeded
    {"path": "index", "frontmatter": {"aliases": []}},  # root index, NOT seeded
]

_DEFS = {"Ichel": ["Y'shell", "Eshell"], "Foobar": ["Foobaz"]}


def _seed() -> list[Entity]:
    return seed_entities({"pages": _PAGES}, _DEFS, _being())


def test_kind_mapping_and_index_stripping() -> None:
    by_name = {e.canonical: e for e in _seed()}
    assert by_name["The Watcher"].kind == "deity"
    assert by_name["The Watcher"].aliases == ["Watcher"]
    assert by_name["Calaria"].kind == "place"  # `.../index` named its folder
    assert by_name["Calaria"].page == "Geography/Calaria/index"
    assert by_name["Radiant Arms"].kind == "org"  # Org/<X>/index, no People → org
    assert by_name["Ichel"].kind == "person"  # Org/.../People/<Y>
    assert by_name["The Slip"].kind == "phenomenon"


def test_non_noun_folders_are_skipped() -> None:
    names = {e.canonical for e in _seed()}
    assert "Combat" not in names  # Rules/*
    assert "Timeline" not in names
    assert "index" not in names


def test_cross_source_unify_and_pc_boundary() -> None:
    by_name = {e.canonical: e for e in _seed()}
    ichel = by_name["Ichel"]
    # akasha page + defs variants + the PC marker all collapse onto one entity by fold.
    assert ichel.kind == "person"
    assert ichel.page == "Org/Radiant Arms/People/Ichel"  # page+kind from akasha
    assert "Y'shell" in ichel.aliases and "Eshell" in ichel.aliases  # defs variants
    assert set(ichel.sources) == {"akasha", "defs", "being"}
    assert ichel.being == "jorge"  # PC boundary marker preserved through the merge
    # Mango is a faerrin PC with no akasha/defs counterpart → person, being set, no page.
    assert by_name["Mango"].being == "noah" and by_name["Mango"].page is None
    # Foral plays in a non-faerrin world → not seeded as a PC.
    assert "Foral" not in by_name


def test_defs_only_entity_is_unclassified() -> None:
    foobar = next(e for e in _seed() if e.canonical == "Foobar")
    assert foobar.kind is None and foobar.page is None
    assert foobar.aliases == ["Foobaz"] and foobar.sources == ["defs"]


def test_serialize_parse_round_trip(tmp_path) -> None:
    entities = _seed()
    text = serialize_entities(entities)
    path = tmp_path / "entity.kdl"
    path.write_text(text, encoding="utf-8")
    reparsed = parse_entities(path)
    assert serialize_entities(reparsed) == text  # byte-stable
    assert {e.canonical for e in reparsed} == {e.canonical for e in entities}


def test_serialize_is_deterministic_and_sorted() -> None:
    text = serialize_entities(_seed())
    headers = [ln for ln in text.splitlines() if ln.startswith("entity ")]
    canon = [h.split('"')[1] for h in headers]
    assert canon == sorted(canon, key=lambda c: (c.casefold(), c))


def test_reseed_merge_preserves_manual_curation() -> None:
    fresh = _seed()
    # A maintainer hand-classified the defs-only "Foobar" and marked it manual.
    curated = [
        Entity(
            canonical="Foobar",
            kind="item",
            page="Misc/Foobar",
            aliases=["Foobaz", "HandAdded"],
            sources=["defs", "manual"],
        ),
        # A wholly hand-added entity with no seed counterpart.
        Entity(canonical="Lorekeeper", kind="person", sources=["manual"]),
    ]
    merged = {e.canonical: e for e in merge_seed(fresh, curated)}
    foobar = merged["Foobar"]
    assert foobar.kind == "item" and foobar.page == "Misc/Foobar"  # manual identity wins
    assert "HandAdded" in foobar.aliases and "Foobaz" in foobar.aliases  # union with fresh
    assert merged["Lorekeeper"].kind == "person"  # hand-added entity survives a re-seed
