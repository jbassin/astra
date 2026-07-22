"""Unit tests for the homebrew adapter (``homebrew.py``) — the vendored
``run_balance`` 176-spell bespoke-schema conversion set onto the Foundry
``system`` shape ``extract_spell``/``assay score`` reads.

No test here touches the Foundry snapshot: the vendored spell set
(``vendor/run_balance/pf2e_converted_spells/all_spells_pf2e.json``) is a
committed input (not the gitignored codex snapshot), and the ladder/corpora
tests read are the committed ``results/*.json`` fit artifacts (reproducible
via ``uv run assay price``, never regenerated here).
"""

from __future__ import annotations

import json

from astra_assay import comparables, homebrew, ledger
from astra_assay.extract import ActionBucket, SpellFeatures, extract_spell

RESULTS_DIR = homebrew.RESULTS_DIR


def _spell(**overrides: object) -> dict:
    """A minimal bespoke-schema spell dict (`plan.md`'s "Output JSON
    schema") with sane defaults, overridable per test."""
    base: dict[str, object] = {
        "name": "Test Spell",
        "rank": 3,
        "traits": ["concentrate", "manipulate"],
        "traditions": ["arcane"],
        "cast": {"actions": 2, "time": None, "components": ["verbal", "somatic"]},
        "cost": None,
        "range": "60 feet",
        "targets": "1 creature",
        "area": None,
        "defense": None,
        "duration": "instantaneous",
        "description": "You do a thing.",
        "successTiers": None,
        "heightened": [],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Damage-dice parsing (incl. en-dash)
# ---------------------------------------------------------------------------


def test_extract_damage_dice_basic() -> None:
    pairs = homebrew._extract_damage_dice("The shard deals 10d6 vitality damage to the area.")
    assert pairs == [("10d6", "vitality")]


def test_extract_damage_dice_untyped_defaults() -> None:
    pairs = homebrew._extract_damage_dice("The target takes 3d6 damage.")
    assert pairs == [("3d6", "untyped")]


def test_extract_damage_dice_flat_modifier() -> None:
    pairs = homebrew._extract_damage_dice("You deal 1d8+4 piercing damage.")
    assert pairs == [("1d8+4", "piercing")]


def test_extract_damage_dice_en_dash_minus() -> None:
    """D30-21b's own en-dash trap, recurring here: the vendor prose is
    copy-edited with real en-dashes/unicode minus, not ASCII hyphen-minus."""
    pairs = homebrew._extract_damage_dice("The target takes 2d6–2 cold damage.")
    assert pairs == [("2d6-2", "cold")]
    pairs2 = homebrew._extract_damage_dice("The target takes 2d6−2 cold damage.")
    assert pairs2 == [("2d6-2", "cold")]


def test_extract_damage_dice_multiple_components() -> None:
    """Real vendor shape (Planar Pyre/Tag/Oblivion): each dice+type pair
    repeats its own trailing "damage" word, not a single shared one."""
    pairs = homebrew._extract_damage_dice("3d8 fire damage and 3d8 piercing damage")
    assert set(pairs) == {("3d8", "fire"), ("3d8", "piercing")}


def test_extract_damage_dice_type_alias() -> None:
    pairs = homebrew._extract_damage_dice("The target takes 4d6 psychic damage.")
    assert pairs == [("4d6", "mental")]


def test_build_damage_prefers_failure_tier_for_save_spell() -> None:
    """A basic-save spell's structured formula is the FAILURE-tier (full)
    amount — success/crit are derived by the game engine from the `basic`
    flag, never separate entries (matches `fireball.json`'s real shape)."""
    spell = _spell(
        defense="basic Reflex",
        description="A blast of force. 10d6 force damage on a hit.",
        successTiers={
            "criticalSuccess": "The creature is unaffected.",
            "success": "The creature takes half damage.",
            "failure": "The creature takes 6d6 force damage.",
            "criticalFailure": "The creature takes double damage.",
        },
    )
    entries, is_healing, _warnings = homebrew._build_damage(spell)
    assert not is_healing
    assert entries == {
        "0": {
            "applyMod": False,
            "category": None,
            "formula": "6d6",
            "kinds": ["damage"],
            "materials": [],
            "type": "force",
        }
    }


def test_build_damage_falls_back_to_description_when_success_tiers_have_no_dice() -> None:
    """Falling Star's real shape: `successTiers` is prose-only
    ("half"/"full"/"double damage", no dice at all) — the dice ONLY live in
    the lead-in narrative."""
    spell = _spell(
        defense="basic Reflex",
        description="The shard deals 10d6 vitality damage to creatures in the area.",
        successTiers={
            "criticalSuccess": "The creature is unaffected.",
            "success": "The creature takes half damage.",
            "failure": "The creature takes full damage.",
            "criticalFailure": "The creature takes double damage.",
        },
    )
    entries, is_healing, _warnings = homebrew._build_damage(spell)
    assert not is_healing
    assert entries["0"]["formula"] == "10d6"
    assert entries["0"]["type"] == "vitality"


def test_build_damage_attack_roll_uses_success_tier() -> None:
    spell = _spell(
        defense="spell attack roll",
        description="Make a ranged spell attack roll.",
        successTiers={
            "criticalSuccess": "The target takes 6d6 bludgeoning damage.",
            "success": "The target takes 3d6 bludgeoning damage.",
            "failure": None,
            "criticalFailure": None,
        },
    )
    entries, _is_healing, _warnings = homebrew._build_damage(spell)
    assert entries["0"]["formula"] == "3d6"
    assert entries["0"]["type"] == "bludgeoning"


def test_build_damage_healing_recovery() -> None:
    spell = _spell(
        defense=None,
        description=(
            "Any creature that drinks the potion regains 6d8+30 HP and is cured of diseases."
        ),
    )
    entries, is_healing, _warnings = homebrew._build_damage(spell)
    assert is_healing
    assert entries["0"]["formula"] == "6d8+30"
    assert entries["0"]["kinds"] == ["healing"]


def test_build_damage_none_found() -> None:
    spell = _spell(description="Nothing damaging happens.")
    entries, is_healing, _warnings = homebrew._build_damage(spell)
    assert entries == {}
    assert not is_healing


# ---------------------------------------------------------------------------
# Condition promotion
# ---------------------------------------------------------------------------


def test_promote_conditions_valued() -> None:
    text, promoted = homebrew.promote_conditions("The target is frightened 2 and shaken.")
    assert "@UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 2}" in text
    assert "Frightened 2" in promoted


def test_promote_conditions_valued_unvalued_default() -> None:
    """A bare valued-condition mention (no trailing number) still gets
    tagged — README's contract: defaults to value 1 downstream."""
    text, promoted = homebrew.promote_conditions("The target is sickened.")
    assert "@UUID[Compendium.pf2e.conditionitems.Item.Sickened]{Sickened}" in text
    assert promoted == ["Sickened"]


def test_promote_conditions_flat() -> None:
    text, _promoted = homebrew.promote_conditions("The target becomes off-guard.")
    assert "@UUID[Compendium.pf2e.conditionitems.Item.Off-Guard]{Off-Guard}" in text


def test_promote_conditions_case_insensitive() -> None:
    text, _promoted = homebrew.promote_conditions("the creature is BLINDED for 1 minute.")
    assert "@UUID[Compendium.pf2e.conditionitems.Item.Blinded]{Blinded}" in text


def test_promote_conditions_negation_left_untouched() -> None:
    """A negated mention ("is not Blinded") must NOT be tagged — tagging it
    would fabricate a real ConditionInstance the extractor treats as
    applying (the live Glitterdust bug this guards against)."""
    text, promoted = homebrew.promote_conditions(
        "The creature is coated but is not blinded by the glitter."
    )
    assert "@UUID" not in text
    assert promoted == []
    assert "not blinded" in text.lower()


def test_promote_conditions_legacy_flat_footed_alias() -> None:
    """The vendor set is nominally Remaster terminology but 1/176 spells
    (Reset) slipped the legacy 'flat-footed' term in anyway."""
    text, promoted = homebrew.promote_conditions("the target becomes flat-footed.")
    assert "@UUID[Compendium.pf2e.conditionitems.Item.Off-Guard]{Off-Guard}" in text
    assert promoted == ["Off-Guard"]


def test_promote_conditions_does_not_double_tag() -> None:
    """Text that already carries a real tag (a defensive edge case — this
    module never actually feeds already-tagged text back through, but the
    `(?<!Item\\.)` guard must hold regardless) is left alone."""
    text, promoted = homebrew.promote_conditions(
        "@UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 2}"
    )
    assert text == "@UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 2}"
    assert promoted == []


# ---------------------------------------------------------------------------
# Defense normalization — the 21 distinct raw values observed across the 176
# real vendored spells (incl. `None`).
# ---------------------------------------------------------------------------


def test_map_defense_none() -> None:
    result, add_attack, warnings = homebrew._map_defense(None)
    assert result is None
    assert not add_attack
    assert warnings == []


def test_map_defense_plain_will() -> None:
    result, add_attack, warnings = homebrew._map_defense("Will")
    assert result == {"save": {"basic": False, "statistic": "will"}}
    assert not add_attack
    assert warnings == []


def test_map_defense_plain_fortitude() -> None:
    result, _add_attack, _warnings = homebrew._map_defense("Fortitude")
    assert result == {"save": {"basic": False, "statistic": "fortitude"}}


def test_map_defense_basic_reflex() -> None:
    result, _add_attack, warnings = homebrew._map_defense("basic Reflex")
    assert result == {"save": {"basic": True, "statistic": "reflex"}}
    assert warnings == []


def test_map_defense_will_save_suffix() -> None:
    result, _add_attack, _warnings = homebrew._map_defense("Will save")
    assert result == {"save": {"basic": False, "statistic": "will"}}


def test_map_defense_basic_fortitude() -> None:
    result, _add_attack, _warnings = homebrew._map_defense("basic Fortitude")
    assert result == {"save": {"basic": True, "statistic": "fortitude"}}


def test_map_defense_spell_attack_roll() -> None:
    result, add_attack, warnings = homebrew._map_defense("spell attack roll")
    assert result is None
    assert add_attack
    assert warnings == []


def test_map_defense_reflex_save() -> None:
    result, _add_attack, _warnings = homebrew._map_defense("Reflex save")
    assert result == {"save": {"basic": False, "statistic": "reflex"}}


def test_map_defense_will_save_enemies_only_flags_qualifier() -> None:
    result, add_attack, warnings = homebrew._map_defense("Will save (enemies only)")
    assert result == {"save": {"basic": False, "statistic": "will"}}
    assert not add_attack
    assert any("qualifiers" in w for w in warnings)


def test_map_defense_double_gate_attack_then_save() -> None:
    result, add_attack, warnings = homebrew._map_defense("spell attack roll, then Fortitude")
    assert result is None  # attack-roll wins the base shape
    assert add_attack
    assert any("qualifiers" in w for w in warnings)


def test_map_defense_conditional_trigger_text_flagged() -> None:
    result, _add_attack, warnings = homebrew._map_defense(
        "basic Fortitude save (when charge detonates)"
    )
    assert result == {"save": {"basic": True, "statistic": "fortitude"}}
    assert any("qualifiers" in w for w in warnings)


def test_map_defense_multi_save_collapses_to_first() -> None:
    result, _add_attack, warnings = homebrew._map_defense(
        "Reflex save (initial); Fortitude save (while within the portal)"
    )
    assert result == {"save": {"basic": False, "statistic": "reflex"}}
    assert any("qualifiers" in w for w in warnings)


def test_map_defense_multi_mode_picks_first_and_warns() -> None:
    result, _add_attack, warnings = homebrew._map_defense(
        "basic Reflex (Control mode) or spell attack roll (Attack/Defend modes)"
    )
    assert result == {"save": {"basic": True, "statistic": "reflex"}}
    assert any("qualifiers" in w for w in warnings)


def test_map_defense_unrecognized_text_warns() -> None:
    result, add_attack, warnings = homebrew._map_defense("a mysterious force")
    assert result is None
    assert not add_attack
    assert warnings and "no recognized" in warnings[0]


# ---------------------------------------------------------------------------
# Cast / reaction / cantrip / ritual mapping
# ---------------------------------------------------------------------------


def test_map_cast_actions_only() -> None:
    raw_time, warnings = homebrew._map_cast({"actions": 2, "time": None})
    assert raw_time == "2"
    assert warnings == []


def test_map_cast_reaction() -> None:
    raw_time, warnings = homebrew._map_cast({"actions": None, "time": "reaction"})
    assert raw_time == "reaction"
    assert warnings == []


def test_map_cast_reaction_wins_over_actions() -> None:
    raw_time, _warnings = homebrew._map_cast({"actions": 1, "time": "reaction"})
    assert raw_time == "reaction"


def test_map_cast_recognized_long_cast() -> None:
    raw_time, warnings = homebrew._map_cast({"actions": None, "time": "10 minutes"})
    assert raw_time == "10 minutes"
    assert warnings == []


def test_map_cast_ritual_time_flagged() -> None:
    raw_time, warnings = homebrew._map_cast(
        {"actions": None, "time": "1 day (ritual, 16 casters required)"}
    )
    assert raw_time == "1 day (ritual, 16 casters required)"
    assert warnings  # not a recognized action-time bucket, but never dropped


def test_map_cast_both_null_defaults() -> None:
    raw_time, warnings = homebrew._map_cast({"actions": None, "time": None})
    assert raw_time == "2"
    assert warnings


def test_convert_spell_cantrip_maps_level_one_and_trait() -> None:
    spell = _spell(name="Test Cantrip", rank="cantrip", defense=None)
    c = homebrew.convert_spell(spell)
    assert c.foundry["system"]["level"]["value"] == 1
    assert "cantrip" in c.foundry["system"]["traits"]["value"]


def test_convert_spell_reaction_flows_through_extraction() -> None:
    spell = _spell(
        cast={"actions": 1, "time": "reaction", "components": []},
        defense=None,
        description="You unleash 2d6 force damage at the triggering creature.",
    )
    c = homebrew.convert_spell(spell)
    assert c.foundry["system"]["time"]["value"] == "reaction"
    result = extract_spell(c.foundry, "test.json")
    assert isinstance(result, SpellFeatures)
    assert result.action_bucket == ActionBucket.REACTION


# ---------------------------------------------------------------------------
# Attack-roll trait auto-add
# ---------------------------------------------------------------------------


def test_convert_spell_adds_missing_attack_trait_and_warns() -> None:
    spell = _spell(defense="spell attack roll", traits=["concentrate"])
    c = homebrew.convert_spell(spell)
    assert "attack" in c.foundry["system"]["traits"]["value"]
    assert c.foundry["system"]["defense"] is None
    assert any("attack" in w and "added it" in w for w in c.warnings)


# ---------------------------------------------------------------------------
# Area / range mapping
# ---------------------------------------------------------------------------


def test_map_area_burst() -> None:
    area, warnings = homebrew._map_area("30-foot burst")
    assert area == {"type": "burst", "value": 30}
    assert warnings == []


def test_map_area_unparseable_warns() -> None:
    area, warnings = homebrew._map_area("a straight wall up to 60 feet long")
    assert area is None
    assert warnings


def test_map_range_self_and_touch() -> None:
    value, warnings = homebrew._map_range("self")
    assert value == "self"
    assert warnings == []
    value2, warnings2 = homebrew._map_range("touch")
    assert value2 == "touch"
    assert warnings2 == []


def test_map_range_unrecognized_shape_warns() -> None:
    value, warnings = homebrew._map_range("melee")
    assert value == "melee"
    assert warnings


# ---------------------------------------------------------------------------
# Heightening
# ---------------------------------------------------------------------------


def test_map_heightening_pure_interval_damage_bump() -> None:
    base_damage = {"0": {"formula": "10d6", "type": "vitality"}}
    structured, appendix, warnings = homebrew._map_heightening(
        [{"trigger": "+1", "text": "The damage increases by 2d6."}], base_damage
    )
    assert structured == {"type": "interval", "interval": 1, "damage": {"0": "2d6"}}
    assert appendix.startswith("<hr />")
    assert "Heightened (+1)" in appendix
    assert warnings == []


def test_map_heightening_non_damage_text_appendix_only() -> None:
    structured, appendix, warnings = homebrew._map_heightening(
        [{"trigger": "+2", "text": "The cone increases by 15 feet."}], {}
    )
    assert structured is None
    assert "Heightened (+2)" in appendix
    assert warnings and "not a pure damage bump" in warnings[0]


def test_map_heightening_fixed_rank_non_damage() -> None:
    structured, appendix, warnings = homebrew._map_heightening(
        [{"trigger": "3rd", "text": "You can target one additional creature."}], {}
    )
    assert structured == {"type": "fixed", "levels": {"3": {}}}
    assert "Heightened (3rd)" in appendix
    assert warnings


def test_map_heightening_empty() -> None:
    structured, appendix, warnings = homebrew._map_heightening([], {})
    assert structured is None
    assert appendix == ""
    assert warnings == []


# ---------------------------------------------------------------------------
# End-to-end: real vendored fixtures (Falling Star, Glitterdust — the task's
# mandated spot-checks) through the SAME `extract_spell` the official corpus
# uses.
# ---------------------------------------------------------------------------


def _vendored(name: str) -> dict:
    spells = homebrew.load_vendored_spells()
    return next(s for s in spells if s["name"] == name)


def test_convert_falling_star_end_to_end() -> None:
    """Rank 5, 10d6 area, basic Reflex, +2d6/rank heighten — the task's
    quantitative spot-check spell."""
    c = homebrew.convert_spell(_vendored("Falling Star"))
    result = extract_spell(c.foundry, "falling-star.json")
    assert isinstance(result, SpellFeatures)
    assert result.rank == 5
    assert result.ev == 35.0  # 10d6
    assert result.has_save
    assert result.save_basic
    assert result.save_statistic == "reflex"
    assert result.damage_types == ["vitality"]
    assert result.heightening_interval == 1
    assert result.heightening_delta_ev == 7.0  # 2d6
    assert not c.warnings


def test_score_falling_star_routes_quantitative_in_band() -> None:
    """The task's numeric spot-check: EV 35 ≈ 7×rank (the community anchor),
    routed through the real committed ladder fit."""
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return  # no committed fit artifact in this checkout — skip gracefully
    ladder, cantrip_ladder, hostile_corpus, buff_corpus = homebrew._load_ladder_and_corpora()
    c = homebrew.convert_spell(_vendored("Falling Star"))
    result = extract_spell(c.foundry, "falling-star.json")
    assert isinstance(result, SpellFeatures)
    from astra_assay import export as export_mod

    entry = export_mod.build_entry_for_row(
        result,
        ladder=ladder,
        cantrip_ladder=cantrip_ladder,
        hostile_corpus=hostile_corpus,
        buff_corpus=buff_corpus,
        is_summon_trait=False,
        raw_description=c.foundry["system"]["description"]["value"],
    )
    assert entry["kind"] == "quantitative"
    assert entry["ev"] == 35.0
    # community anchor: 7 * rank == EV, exactly.
    assert 7 * result.rank == entry["ev"]
    # the ladder's own residual is within roughly a rank of budget (never a
    # hard "in band" assertion — the ladder's structural multipliers give
    # some spread, see results/validation.md's V1' tolerance).
    assert abs(entry["residualRanks"]) < 1.0


def test_convert_glitterdust_routes_hostile_with_condition_atoms() -> None:
    """The task's condition spot-check spell: must extract real Blinded
    condition instances (not silently score condition-free) and route
    hostile."""
    c = homebrew.convert_spell(_vendored("Glitterdust"))
    result = extract_spell(c.foundry, "glitterdust.json")
    assert isinstance(result, SpellFeatures)
    assert result.ev == 0.0
    assert result.condition_ref
    assert any(ci.tier is not None for ci in result.condition_instances)
    assert any(ci.condition == "Blinded" for ci in result.condition_instances)
    assert ledger.classify_hostility(result) == "hostile"
    assert ledger.classify_row(result) is None  # scoreable, not ledgered


def test_score_glitterdust_returns_usable_comparables() -> None:
    """Same spell, scored against the real committed comparables corpus —
    must NOT degrade to a condition-free/no-comparable-profile ledger row."""
    if not homebrew.COMPARABLES_CORPUS_PATH.exists() or not homebrew.FITTED_PARAMS_PATH.exists():
        return
    ladder, cantrip_ladder, hostile_corpus, buff_corpus = homebrew._load_ladder_and_corpora()
    c = homebrew.convert_spell(_vendored("Glitterdust"))
    result = extract_spell(c.foundry, "glitterdust.json")
    assert isinstance(result, SpellFeatures)

    profile = comparables.build_profile(result, ladder)
    res = comparables.comparables_for(profile, hostile_corpus, k=5)
    assert res.matches, "Glitterdust must find real comparables — its Blinded atom is real"
    assert res.rank_min <= res.rank_median <= res.rank_max


# ---------------------------------------------------------------------------
# Full-population smoke test — mirrors the task's validation loop items 1/2
# (all 176 convert + score without crashing).
# ---------------------------------------------------------------------------


def test_convert_all_176_without_crash() -> None:
    converted = homebrew.convert_all()
    assert len(converted) == 176
    names = {c.name for c in converted}
    assert len(names) == 176  # no duplicate names
    for c in converted:
        assert c.foundry["type"] == "spell"
        assert c.foundry["system"]["level"]["value"] >= 1
        # every warning is a non-empty, informative string — never a silent drop.
        for w in c.warnings:
            assert isinstance(w, str) and w


def test_score_all_176_without_crash_and_routes_everything() -> None:
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    results = homebrew.score_all()
    assert len(results) == 176
    valid_top = {"quantitative", "hybrid", "comparables", "buff", "ledger"}
    for r in results:
        top = str(r["routing"]).split(":", 1)[0]
        assert top in valid_top
        assert isinstance(r["warnings"], list)


def test_scores_json_is_valid_json_after_cli_write(tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """`score_all`'s output round-trips through `json.dumps` cleanly (the
    same serialization `cmd_score_homebrew` writes to `out/homebrew/scores.json`)."""
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    results = homebrew.score_all()
    text = json.dumps(results, indent=2, sort_keys=True)
    round_tripped = json.loads(text)
    assert len(round_tripped) == len(results)
