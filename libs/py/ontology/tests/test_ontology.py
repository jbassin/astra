"""ontology-being accessor — consolidation correctness + canonical-JSON stability."""

from __future__ import annotations

from astra_ontology import canonical_json, faerrin_campaign_slugs
from astra_ontology_being import CANONICAL_JSON_PATH, load


def test_players_preserve_player_id_and_identity() -> None:
    being = load()
    by_slug = {p.slug: p for p in being.players}
    assert [p.player_id for p in being.players] == [1, 2, 3, 4, 5]  # FKs preserved, in order
    josh = by_slug["josh"]
    assert josh.is_dm and josh.is_admin
    assert josh.color == "rgb(232,184,232)"  # aether theme.scss set (I5)
    assert "jbassin" in josh.aliases and "iiri__" in josh.aliases
    assert by_slug["jorge"].snowflakes == ["712150290169593856", "753011285003730955"]


def test_guest_color_carries_over() -> None:
    assert load().guest_color == "rgb(235,235,236)"


def test_exactly_one_main_campaign() -> None:
    # `main` is the weal-bot active campaign (and the pipeline's main/one-shot flag);
    # it moves between arcs, so pin the invariant (exactly one) rather than the slug.
    being = load()
    assert sum(1 for c in being.campaigns if c.main) == 1


def test_song_darkly_and_double_pc() -> None:
    being = load()
    song = next(c for c in being.campaigns if c.slug == "through-a-song-darkly")
    assert song.edition == "pathfinder_2e"
    jorge_pcs = [r.character for r in song.roles if r.player == "jorge"]
    assert jorge_pcs == ["Argyle", "Arctos"]  # Jorge plays two PCs in this arc
    assert song.world == "faerrin"
    argyle = next(r for r in song.roles if r.character == "Argyle")
    assert argyle.character_class == "champion"
    assert len(argyle.descriptions) == 3


def test_world_field_and_faerrin_filter() -> None:
    being = load()
    by_slug = {c.slug: c for c in being.campaigns}
    # Each campaign declares its world; the two off-world arcs are not faerrin.
    assert by_slug["fey-in-the-mists"].world == "finnegan's ring"
    assert by_slug["observatory-slipped"].world == "sedecium"
    assert faerrin_campaign_slugs(being) == {
        "through-a-song-darkly",
        "a-hunt-of-metal-and-vine",
        "the-first-spark",
        "interred-in-iomenei",
        "fae-and-forest",
    }


def test_gm_is_per_campaign_not_always_josh() -> None:
    being = load()
    fey = next(c for c in being.campaigns if c.slug == "fey-in-the-mists")
    gm = next(r for r in fey.roles if r.character == "Gamemaster")
    assert gm.player == "tanner"  # Tanner GMs this one; Josh plays a PC
    assert any(r.player == "josh" and r.character == "Mango" for r in fey.roles)


def test_host_types_are_distinct_and_populated() -> None:
    being = load()
    hosts = {h.slug: h for h in being.weal_hosts}
    assert hosts["gsr"].name == "Gin Soaked Rag"
    assert hosts["gsr"].color == "#276C4C"
    personas = {p.slug: p for p in being.podcast_personas}
    assert personas["bram"].voice_id == "3jR9BuQAOPMWUjWpi0ll"
    # The two identity kinds never share slugs (distinct node types).
    assert set(hosts) & set(personas) == set()


def test_canonical_json_matches_committed_snapshot() -> None:
    being = load()
    assert canonical_json(being) == CANONICAL_JSON_PATH.read_text(encoding="utf-8")
