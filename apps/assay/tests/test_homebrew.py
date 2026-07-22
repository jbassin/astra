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
from pathlib import Path

import pytest
from astra_assay import comparables, homebrew, ledger
from astra_assay.extract import ActionBucket, SkipRecord, SpellFeatures, extract_spell

RESULTS_DIR = homebrew.RESULTS_DIR


@pytest.fixture(scope="module")
def seeded_store(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A TEMPORARY canonical store, seeded once per test module run from the
    real vendored baseline — tests must never read/write the real committed
    `apps/assay/homebrew/spells/` store."""
    store_dir = tmp_path_factory.mktemp("homebrew_store") / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    return store_dir


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


def test_build_damage_paren_reversed_shape() -> None:
    """Antimagic Shroud's real shape: "...takes full damage (2d4 force)."
    — dice INSIDE a parenthetical after the word "damage", not the usual
    dice-then-type-then-"damage" order."""
    entries = homebrew._extract_damage_dice(
        "The triggering caster takes full damage (2d4 force) as the shroud detonates."
    )
    assert entries == [("2d4", "force")]


def test_build_damage_paren_multi_component() -> None:
    """Tag's successTiers shape: "damage (2d8 fire + 2d8 mental, rounded
    down)" — two dice components in one parenthetical."""
    entries = homebrew._extract_damage_dice("Half damage (2d8 fire + 2d8 mental, rounded down).")
    assert set(entries) == {("2d8", "fire"), ("2d8", "mental")}


# ---------------------------------------------------------------------------
# Bug fix (orchestrator round 2): self-inflicted damage must not count as
# the spell's output EV — real 5-spell population, real prose.
# ---------------------------------------------------------------------------


def test_self_damage_deal_x_to_yourself_excluded() -> None:
    """Extra Motivation's real shape."""
    self_pairs, output_pairs = homebrew._split_self_and_output_dice(
        "You may choose to also deal 4d6 void damage to yourself "
        "(this damage ignores resistance and immunity)."
    )
    assert self_pairs == [("4d6", "void")]
    assert output_pairs == []


def test_self_damage_you_take_excluded() -> None:
    """Lesser Wish / Take Me Instead's real shape."""
    self_pairs, output_pairs = homebrew._split_self_and_output_dice(
        "On a failure, the corpse is unaffected. You take 2d8 void damage (no save) "
        "from the strain of the attempt."
    )
    assert self_pairs == [("2d8", "void")]
    assert output_pairs == []


def test_self_damage_paragraph_chain_without_repeated_anchor() -> None:
    """Lesser Wish's real telescoped-penalty paragraph: the second sentence
    ("The third, 2d6 mental damage.") never repeats "you take" — the WHOLE
    paragraph containing the anchor is self-damage, not just the anchored
    sentence."""
    text = (
        "Each time you cast this in the same day, the strain builds. The first "
        "casting each day is free. The second casting, you take 1d6 mental damage. "
        "The third, 2d6 mental damage. Each subsequent casting adds 1d6."
    )
    self_pairs, output_pairs = homebrew._split_self_and_output_dice(text)
    assert set(self_pairs) == {("1d6", "mental"), ("2d6", "mental")}
    assert output_pairs == []


def test_self_damage_multi_dice_same_clause_hellforging_shape() -> None:
    """Hellforging's real shape: TWO dice chained by "and" inside one "you
    take" clause, both self-directed."""
    self_pairs, output_pairs = homebrew._split_self_and_output_dice(
        "On a failure, you take 3d10 psychic damage and 2d10 mental damage as "
        "uncontrolled energies surge through you."
    )
    assert set(self_pairs) == {("3d10", "mental"), ("2d10", "mental")}  # psychic -> mental alias
    assert output_pairs == []


def test_self_damage_mixed_spell_keeps_real_output_damage() -> None:
    """Solar Rebuke's real shape (isolated per-tier text, no self-damage
    anchor at all): a spell whose real enemy damage sits in a SEPARATE,
    unanchored paragraph must be untouched — "only the self-directed dice
    must be excluded, not the whole spell." """
    self_pairs, output_pairs = homebrew._split_self_and_output_dice(
        "The creature takes 5d10 vitality damage and is dazzled until the start of your next turn."
    )
    assert self_pairs == []
    assert output_pairs == [("5d10", "vitality")]


def test_extra_motivation_end_to_end_no_longer_quantitative() -> None:
    """A spell whose ONLY dice are self-directed must fall through to
    ledger/effect routing, not score as if the self-cost were output EV —
    Extra Motivation has no other damage/condition content at all, so once
    its self-damage is excluded it's a genuine extraction dead-end
    (SkipRecord), never a quantitative SpellFeatures row."""
    c = homebrew.convert_spell(_vendored("Extra Motivation"))
    result = extract_spell(c.foundry, "extra-motivation.json")
    assert isinstance(result, SkipRecord)
    assert "no-priceable-effect" in result.reason
    assert any("self-directed" in w for w in c.warnings)


def test_solar_rebuke_end_to_end_keeps_real_enemy_damage() -> None:
    """The "mixed" spell: Solar Rebuke's real 5d10 vitality damage to the
    enemy must survive the self-damage-exclusion fix untouched."""
    c = homebrew.convert_spell(_vendored("Solar Rebuke"))
    result = extract_spell(c.foundry, "solar-rebuke.json")
    assert isinstance(result, SpellFeatures)
    assert result.ev == 27.5  # 5d10
    assert not any("self-directed" in w for w in c.warnings)


def test_antimagic_shroud_end_to_end_unaffected_by_self_damage_fix() -> None:
    """Regression guard: Antimagic Shroud's "the first time YOU TAKE damage"
    trigger phrase sits in the same undivided paragraph as its real "2d4
    force" output damage — the paren-damage fix must isolate the real
    damage into its own (anchor-free) `successTiers` candidate before the
    self-damage paragraph scan ever runs, so it must NOT be excluded."""
    c = homebrew.convert_spell(_vendored("Antimagic Shroud"))
    result = extract_spell(c.foundry, "antimagic-shroud.json")
    assert isinstance(result, SpellFeatures)
    assert result.ev == 5.0  # 2d4
    assert not any("self-directed" in w for w in c.warnings)


def test_attraction_end_to_end_recovers_paren_damage() -> None:
    """Attraction's real shape ("full damage (2d6 bludgeoning)") was
    previously missed entirely (no dice found -> ledgered) — the
    paren-damage fix recovers it as real quantitative EV."""
    c = homebrew.convert_spell(_vendored("Attraction"))
    result = extract_spell(c.foundry, "attraction.json")
    assert isinstance(result, SpellFeatures)
    assert result.ev == 7.0  # 2d6


# ---------------------------------------------------------------------------
# Bug fix (orchestrator round 2): roll-on-a-table spells must not sum every
# table entry's dice as if they all applied simultaneously.
# ---------------------------------------------------------------------------


def test_table_roll_anchor_truncates_search_text() -> None:
    text = (
        "For each of the three rays, roll 1d8 on the following table to determine "
        "its effect.\n\n5. Enervation Ray. On a failure, the target takes 6d10 void "
        "damage (12d10 on a critical failure; half on a success)."
    )
    m = homebrew._TABLE_ROLL_ANCHOR_RE.search(text)
    assert m is not None
    truncated = text[: m.start()]
    assert homebrew._extract_damage_dice(truncated) == []


def test_monstrous_copy_eye_stalks_end_to_end_table_dice_excluded() -> None:
    """The task's worst outlier: summed every table entry's dice as one EV
    (88, +10.53 ranks HOT). After the fix it must not price as pure damage
    — its condition content (Fascinated/Frightened/Slowed/Unconscious/
    Grabbed/Petrified, still promoted) routes it instead."""
    c = homebrew.convert_spell(_vendored("Monstrous Copy: Eye Stalks"))
    assert any("table-roll" in w for w in c.warnings)
    result = extract_spell(c.foundry, "eye-stalks.json")
    assert isinstance(result, SpellFeatures)
    assert result.ev == 0.0
    # the table's condition atoms are still real, extracted-normally content
    assert any(ci.condition == "Frightened" for ci in result.condition_instances)
    assert any(ci.condition == "Petrified" for ci in result.condition_instances)


# ---------------------------------------------------------------------------
# Question 3: healing rows mirror the official pipeline's own treatment
# (scored 1:1 against the SAME damage ladder, D30-8(ii)) — this module adds
# an `isHealing` triage field on top, without changing the scoring math.
# ---------------------------------------------------------------------------


def test_healing_draught_scores_like_damage_but_flagged(seeded_store: Path) -> None:
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    results = homebrew.score_all(store_dir=seeded_store)
    by_name = {r["name"]: r for r in results}
    r = by_name["Healing Draught"]
    assert r["isHealing"] is True
    assert r["kind"] == "quantitative"  # unchanged from the official export.py contract
    assert r["ev"] == 57.0  # 6d8+30, unchanged — the scoring math is NOT touched


def test_non_healing_quantitative_row_flagged_false(seeded_store: Path) -> None:
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    results = homebrew.score_all(store_dir=seeded_store)
    by_name = {r["name"]: r for r in results}
    assert by_name["Falling Star"]["isHealing"] is False


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


def test_score_all_176_without_crash_and_routes_everything(seeded_store: Path) -> None:
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    results = homebrew.score_all(store_dir=seeded_store)
    assert len(results) == 176
    valid_top = {"quantitative", "hybrid", "comparables", "buff", "ledger"}
    for r in results:
        top = str(r["routing"]).split(":", 1)[0]
        assert top in valid_top
        assert isinstance(r["warnings"], list)


def test_scores_json_is_valid_json_after_cli_write(seeded_store: Path) -> None:
    """`score_all`'s output round-trips through `json.dumps` cleanly (the
    same serialization `cmd_score_homebrew` writes to `out/homebrew/scores.json`)."""
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    results = homebrew.score_all(store_dir=seeded_store)
    text = json.dumps(results, indent=2, sort_keys=True)
    round_tripped = json.loads(text)
    assert len(round_tripped) == len(results)


# ---------------------------------------------------------------------------
# Round 3: the canonical, committed, hand-editable store — seeding,
# round-trip fidelity, and the revisions (diff) report.
# ---------------------------------------------------------------------------


def test_seed_refuses_to_overwrite_without_force(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    report1 = homebrew.seed_homebrew(store_dir=store_dir)
    assert len(report1.seeded) == 176
    assert report1.skipped_existing == []

    # Simulate a hand edit on one file, then re-seed without --force.
    one = next(store_dir.glob("*.json"))
    original_text = one.read_text(encoding="utf-8")
    hand_edited = original_text.replace('"rules": []', '"rules": ["hand-edited-marker"]')
    assert hand_edited != original_text
    one.write_text(hand_edited, encoding="utf-8")

    report2 = homebrew.seed_homebrew(store_dir=store_dir)
    assert report2.seeded == []
    assert len(report2.skipped_existing) == 176
    # the hand edit must survive an unforced re-seed untouched.
    assert one.read_text(encoding="utf-8") == hand_edited


def test_seed_force_overwrites_existing_files(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    one = next(store_dir.glob("*.json"))
    one.write_text('{"name": "clobber me"}', encoding="utf-8")

    report = homebrew.seed_homebrew(store_dir=store_dir, force=True)
    assert len(report.seeded) == 176
    assert report.skipped_existing == []
    # every file, including the hand-edited one, is back to the fresh bake.
    assert '"clobber me"' not in one.read_text(encoding="utf-8")


def test_seed_writes_provenance_flags(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    doc = json.loads((store_dir / "falling-star.json").read_text(encoding="utf-8"))
    seeded_from = doc["flags"]["assay"]["seededFrom"]
    assert seeded_from["repo"] == "run_balance"
    assert seeded_from["commit"] == "efc8e310210a2577411c62ee95f09a58ef79f164"
    assert seeded_from["convertedName"] == "Falling Star"
    assert seeded_from["originalName"]
    assert isinstance(doc["flags"]["assay"]["adapterWarnings"], list)


def test_seeded_doc_round_trips_through_extract_spell_identically(tmp_path: Path) -> None:
    """The `flags` block a seeded doc carries must be inert to extraction —
    a store doc and the plain in-memory `convert_spell` output (no flags at
    all) must produce byte-identical `SpellFeatures`."""
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    seeded_doc = json.loads((store_dir / "falling-star.json").read_text(encoding="utf-8"))
    assert "flags" in seeded_doc  # sanity: the thing we're testing tolerance of is present

    baseline = homebrew.convert_spell(_vendored("Falling Star")).foundry
    result_seeded = extract_spell(seeded_doc, "falling-star.json")
    result_baseline = extract_spell(baseline, "falling-star.json")
    assert isinstance(result_seeded, SpellFeatures)
    assert isinstance(result_baseline, SpellFeatures)
    assert result_seeded.model_dump() == result_baseline.model_dump()


def test_flags_pass_through_extraction_harmlessly() -> None:
    """A generic sanity check independent of the store: `extract_spell`
    never reads `data["flags"]` at all — any flags shape is inert."""
    spell = _spell(
        defense="basic Reflex",
        description="You deal 3d6 fire damage in a burst.",
        area="20-foot burst",
    )
    c = homebrew.convert_spell(spell)
    plain = c.foundry
    flagged = dict(plain)
    flagged["flags"] = {"assay": {"seededFrom": {"repo": "run_balance", "commit": "deadbeef"}}}
    r_plain = extract_spell(plain, "x.json")
    r_flagged = extract_spell(flagged, "x.json")
    assert isinstance(r_plain, SpellFeatures)
    assert isinstance(r_flagged, SpellFeatures)
    assert r_plain.model_dump() == r_flagged.model_dump()


def test_score_all_reads_the_store_not_the_vendor_file(tmp_path: Path) -> None:
    """`score_all` must not silently fall back to converting the vendor
    file — an empty/missing store is a hard error."""
    if not homebrew.FITTED_PARAMS_PATH.exists():
        return
    empty_store = tmp_path / "spells"
    empty_store.mkdir()
    with pytest.raises(SystemExit):
        homebrew.score_all(store_dir=empty_store)


def test_revisions_reports_zero_on_a_fresh_seed(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    report = homebrew.homebrew_revisions(store_dir=store_dir)
    assert report.store_count == 176
    assert report.baseline_count == 176
    assert report.deviations == []
    assert report.missing_from_store == []
    assert report.extra_in_store == []


def test_revisions_reports_a_synthetic_edit(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    path = store_dir / "falling-star.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["system"]["damage"]["0"]["formula"] = "12d6"  # a hand edit: buff the damage
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    report = homebrew.homebrew_revisions(store_dir=store_dir)
    assert len(report.deviations) == 1
    dev = report.deviations[0]
    assert dev.slug == "falling-star"
    assert any("damage" in f for f in dev.fields)


def test_revisions_reports_missing_and_extra(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    (store_dir / "falling-star.json").unlink()
    (store_dir / "not-a-real-baseline-spell.json").write_text(
        json.dumps({"name": "Ghost Spell", "system": {}, "type": "spell"}), encoding="utf-8"
    )

    report = homebrew.homebrew_revisions(store_dir=store_dir)
    assert "falling-star" in report.missing_from_store
    assert "not-a-real-baseline-spell" in report.extra_in_store
    assert report.deviations == []  # the 174 untouched spells still match exactly


def test_write_revisions_md_is_readable(tmp_path: Path) -> None:
    store_dir = tmp_path / "spells"
    homebrew.seed_homebrew(store_dir=store_dir)
    report = homebrew.homebrew_revisions(store_dir=store_dir)
    out_path = tmp_path / "revisions.md"
    homebrew._write_revisions_md(report, out_path)
    text = out_path.read_text(encoding="utf-8")
    assert "0 deviations" in text or "**0" in text
    assert "_none_" in text
