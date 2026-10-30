"""ontology-being accessor — consolidation correctness + canonical-JSON stability."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_config.kdl import KdlDecodeError
from astra_ontology import astra_campaign_slugs, canonical_json, load_being
from astra_ontology_being import CANONICAL_JSON_PATH, load


def test_players_preserve_player_id_and_identity() -> None:
    being = load()
    by_slug = {p.slug: p for p in being.players}
    assert [p.player_id for p in being.players] == [1, 2, 3, 4, 5]  # FKs preserved, in order
    josh = by_slug["josh"]
    assert josh.is_dm and josh.is_admin
    assert josh.color == "rgb(232,184,232)"  # the aether theme.scss color
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


def test_world_field_and_astra_filter() -> None:
    being = load()
    by_slug = {c.slug: c for c in being.campaigns}
    assert being.astra_worlds == ["faerrin", "althane", "ushas"]
    # Each campaign declares its world; the two Tanner-run arcs are outside the Astra.
    assert by_slug["fey-in-the-mists"].world == "finnegan's ring"
    assert by_slug["chuul-hunt"].world == "chuul-hunt"
    assert by_slug["observatory-slipped"].world == "ushas"
    assert by_slug["deep-eyes"].world == "althane"
    assert astra_campaign_slugs(being) == {
        "through-a-song-darkly",
        "a-hunt-of-metal-and-vine",
        "the-first-spark",
        "interred-in-iomenei",
        "fae-and-forest",
        "observatory-slipped",
        "deep-eyes",
        "the-midnight-sun",
        "hildebrandt-heist",
    }


def test_earlier_campaigns_are_appended_and_not_main() -> None:
    # A campaign's list position is its transcript filename prefix, so the earlier
    # campaigns were appended after the existing ones; none of them is `main`.
    slugs = [c.slug for c in load().campaigns]
    assert slugs[-3:] == ["deep-eyes", "the-midnight-sun", "hildebrandt-heist"]
    assert slugs.index("chuul-hunt") == 7
    by_slug = {c.slug: c for c in load().campaigns}
    deep_eyes = by_slug["deep-eyes"]
    assert not deep_eyes.main
    noah = [r.character for r in deep_eyes.roles if r.player == "noah"]
    # Big Fish died before the recordings begin, so Noah's one recorded role is Dawnmonger.
    assert noah == ["Dawnmonger"]
    assert all(not by_slug[s].main for s in slugs[-3:])


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


def test_a_player_without_a_name_fails_naming_the_node(tmp_path: Path) -> None:
    # The old hand walker read a missing `name` as the string "None" and passed it.
    kdl = tmp_path / "being.kdl"
    kdl.write_text('player "ghost" {\n    player-id 9\n    color "red"\n}\nguest-color "x"\n')
    with pytest.raises(KdlDecodeError, match=r'being\.kdl: player "ghost" > name: missing'):
        load_being(kdl)


def test_a_role_without_a_character_fails_naming_the_node(tmp_path: Path) -> None:
    kdl = tmp_path / "being.kdl"
    kdl.write_text(
        'guest-color "x"\ncampaign "c" {\n    name "C"\n    edition "e"\n    world "w"\n'
        '    role player="josh"\n}\n'
    )
    with pytest.raises(KdlDecodeError, match=r'campaign "c" > role: property character='):
        load_being(kdl)
