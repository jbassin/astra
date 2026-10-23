"""Unit tests for the D30-35 spell-effect join + rule extraction (spec 0030
round 4) — real corpus fixture provenance for the two mandated cases
(heroism array-selector fanout, mystic-armor predicate gate) plus synthetic
coverage for the evaluator families and the multi-effect merge rules."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_assay import effects

FIXTURES = Path(__file__).parent / "fixtures"


def _load_effect(name: str) -> dict:
    return json.loads((FIXTURES / "spell-effects" / name).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Real-corpus fixtures: heroism (array selector) + mystic armor (predicate).
# ---------------------------------------------------------------------------


def test_heroism_array_selector_fans_out_at_base_rank() -> None:
    """D30-35 mandated fixture: Heroism's single FlatModifier rule carries
    an ARRAY selector (`[attack, saving-throw, skill-check, perception]`) —
    fans out to 4 distinct atoms, each evaluated at the SPELL's base rank
    (3), not the effect item's own `system.level.value`."""
    doc = _load_effect("spell-effect-heroism.json")
    profile = effects.build_effect_profile("Spell Effect: Heroism", doc, base_rank=3)
    assert profile.atoms == {
        "modifier:attack": 1.0,
        "modifier:saving-throw": 1.0,
        "modifier:skill-check": 1.0,
        "modifier:perception": 1.0,
    }
    assert profile.tags == []


def test_heroism_heightened_tiers_at_higher_ranks() -> None:
    doc = _load_effect("spell-effect-heroism.json")
    assert effects.build_effect_profile("x", doc, base_rank=6).atoms["modifier:attack"] == 2.0
    assert effects.build_effect_profile("x", doc, base_rank=9).atoms["modifier:attack"] == 3.0


def test_mystic_armor_predicate_gates_saves_atom_off_at_rank_1() -> None:
    """D30-35 mandated fixture: Mystic Armor's saving-throw `FlatModifier`
    carries a level-family predicate (`gte(parent:level, 4)`) — evaluated at
    the spell's OWN base rank (1), this is False, so there is NO
    saving-throw atom at rank 1 (only the AC atom); at rank 4+ it appears."""
    doc = _load_effect("spell-effect-mystic-armor.json")
    profile = effects.build_effect_profile("Spell Effect: Mystic Armor", doc, base_rank=1)
    assert profile.atoms == {"modifier:ac": 1.0}
    assert "modifier:saving-throw" not in profile.atoms

    profile_r4 = effects.build_effect_profile("x", doc, base_rank=4)
    assert "modifier:saving-throw" in profile_r4.atoms


def test_mystic_armor_untyped_dexterity_cap_rule_becomes_a_tag() -> None:
    doc = _load_effect("spell-effect-mystic-armor.json")
    profile = effects.build_effect_profile("x", doc, base_rank=1)
    assert "rule:DexterityModifierCap" in profile.tags


# ---------------------------------------------------------------------------
# join_effects — the full ref-discovery + merge + profile pipeline.
# ---------------------------------------------------------------------------


def test_join_effects_none_without_a_ref() -> None:
    assert effects.join_effects("<p>no ref here</p>", 3, {"x": {}}) is None


def test_join_effects_none_without_an_index() -> None:
    ref = "@UUID[Compendium.pf2e.spell-effects.Item.Spell Effect: Heroism]"
    assert effects.join_effects(ref, 3, None) is None
    assert effects.join_effects(ref, 3, {}) is None


def test_join_effects_resolves_and_evaluates_at_base_rank() -> None:
    doc = _load_effect("spell-effect-heroism.json")
    index = {"Spell Effect: Heroism": doc}
    desc = "<p>text @UUID[Compendium.pf2e.spell-effects.Item.Spell Effect: Heroism] more</p>"
    profile = effects.join_effects(desc, 3, index)
    assert profile is not None
    assert profile.atoms["modifier:attack"] == 1.0


def test_join_effects_unresolved_ref_flags_a_tag() -> None:
    desc = "@UUID[Compendium.pf2e.spell-effects.Item.Spell Effect: Nonexistent]"
    profile = effects.join_effects(desc, 3, {"Spell Effect: Heroism": {}})
    assert profile is not None
    assert profile.tags == ["effect-ref-unresolved"]


# ---------------------------------------------------------------------------
# Multi-effect merge (D30-35: "base-variant only") — 20 real corpus shapes.
# ---------------------------------------------------------------------------


def test_select_effect_name_single_ref_passthrough() -> None:
    sel = effects.select_effect_name(["Spell Effect: Heroism"])
    assert sel.chosen_name == "Spell Effect: Heroism"
    assert sel.dropped_names == []
    assert sel.merge_kind is None


def test_select_effect_name_degree_split_keeps_failure_row() -> None:
    """Bestial Curse's real shape: Critical Failure + Failure, no unqualified
    sibling — keeps the (Failure) row."""
    sel = effects.select_effect_name(
        ["Spell Effect: Bestial Curse (Critical Failure)", "Spell Effect: Bestial Curse (Failure)"]
    )
    assert sel.chosen_name == "Spell Effect: Bestial Curse (Failure)"
    assert sel.merge_kind == "degree-split"


def test_select_effect_name_unqualified_base_wins_over_success_variant() -> None:
    """Draw Ire's real shape: an unqualified base + a "(Success)" bonus —
    the unqualified row is the base/failure-default row."""
    sel = effects.select_effect_name(["Spell Effect: Draw Ire", "Spell Effect: Draw Ire (Success)"])
    assert sel.chosen_name == "Spell Effect: Draw Ire"
    assert sel.dropped_names == ["Spell Effect: Draw Ire (Success)"]
    assert sel.merge_kind == "degree-split"


def test_select_effect_name_duration_variant_excluded() -> None:
    """Tailwind's real shape: base + "(8 hours)" heightened-duration variant
    — the base (shorter-duration) row is kept, per D30-35's explicit
    "heightened-duration variant items excluded from base profiles" rule."""
    sel = effects.select_effect_name(["Spell Effect: Tailwind", "Spell Effect: Tailwind (8 hours)"])
    assert sel.chosen_name == "Spell Effect: Tailwind"
    assert sel.merge_kind == "duration-or-rank-variant"


def test_select_effect_name_immunity_marker_dropped() -> None:
    """Shield's real shape: "Effect: Shield Immunity" + "Spell Effect:
    Shield" — the immunity marker is dropped outright."""
    sel = effects.select_effect_name(["Effect: Shield Immunity", "Spell Effect: Shield"])
    assert sel.chosen_name == "Spell Effect: Shield"
    assert sel.dropped_names == ["Effect: Shield Immunity"]
    assert sel.merge_kind == "immunity-marker"


def test_select_effect_name_choice_fan_no_chosen_name() -> None:
    """Animal Form's real shape: 13 named-form variants, no unqualified
    sibling, no degree label — a genuine choice fan, profile suppressed."""
    names: list[str] = [f"Spell Effect: Animal Form ({shape})" for shape in ("Ape", "Bear", "Cat")]
    sel = effects.select_effect_name(names)
    assert sel.chosen_name is None
    assert sel.merge_kind == "choice-fan"
    assert set(sel.dropped_names) == set(names)


def test_join_effects_choice_fan_produces_a_tag_only_profile() -> None:
    desc = (
        "@UUID[Compendium.pf2e.spell-effects.Item.Spell Effect: Animal Form (Ape)]"
        "@UUID[Compendium.pf2e.spell-effects.Item.Spell Effect: Animal Form (Bear)]"
    )
    profile = effects.join_effects(desc, 2, {"anything": {}})
    assert profile is not None
    assert profile.atoms == {}
    assert "effect-choice-fan" in profile.tags


# ---------------------------------------------------------------------------
# `@item.level`/`@spell.rank` expression evaluation — ternary / closed-form
# arithmetic / runtime-only families (D30-35).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("expr", "rank", "expected"),
    [
        ("ternary(gte(@item.level,9),3,ternary(gte(@item.level,6),2,1))", 3, 1.0),
        ("ternary(gte(@item.level,9),3,ternary(gte(@item.level,6),2,1))", 6, 2.0),
        ("ternary(gte(@item.level,9),3,ternary(gte(@item.level,6),2,1))", 9, 3.0),
        ("2*@item.level", 4, 8.0),
        ("floor(@item.level/3)", 8, 2.0),
        ("ceil((@item.level - 1) / 3 )", 7, 2.0),
        ("clamped(ceil(@item.level / 2), 1, 4)", 20, 4.0),
        (
            "match(when(btwn(@item.level, 2, 3), 1), when(btwn(@item.level, 4, 5), 2), "
            "when(gte(@item.level, 6), 3))",
            5,
            2.0,
        ),
        ("@spell.rank", 5, 5.0),
        (5, 3, 5.0),
        ("79", 1, 79.0),
    ],
)
def test_evaluate_at_base_rank_resolvable_families(
    expr: object, rank: int, expected: float
) -> None:
    value, unresolved = effects.evaluate_at_base_rank(expr, rank)
    assert unresolved is False
    assert value == pytest.approx(expected)


@pytest.mark.parametrize(
    "expr",
    [
        "@actor.level",
        "@item.badge.value",
        "@item.origin.system.attributes.shield.ac",
        "@item.flags.system.rulesSelections.outcome",
        "{item|flags.system.rulesSelections.enlarge.damage}",
        "@weapon.system.damage.dice",
    ],
)
def test_evaluate_at_base_rank_runtime_only_flags_unresolved(expr: str) -> None:
    value, unresolved = effects.evaluate_at_base_rank(expr, 5)
    assert value is None
    assert unresolved is True


def test_evaluate_at_base_rank_none_value_is_absent_not_unresolved() -> None:
    """The one valueless real FlatModifier — `None` is a genuine absence,
    not a failed evaluation."""
    value, unresolved = effects.evaluate_at_base_rank(None, 5)
    assert value is None
    assert unresolved is False


def test_evaluate_at_base_rank_never_executes_arbitrary_code() -> None:
    """A malicious/malformed expr (dunder access, import) must flag
    unresolved rather than raise or execute — `assay score` runs this on
    arbitrary homebrew-authored spell JSON."""
    value, unresolved = effects.evaluate_at_base_rank("().__class__.__base__", 5)
    assert value is None
    assert unresolved is True


# ---------------------------------------------------------------------------
# Predicate evaluation — level-family resolved, everything else conditional.
# ---------------------------------------------------------------------------


def test_evaluate_predicate_empty_is_trivially_true() -> None:
    assert effects.evaluate_predicate(None, 5) == (True, True)
    assert effects.evaluate_predicate([], 5) == (True, True)


def test_evaluate_predicate_level_family_gte() -> None:
    assert effects.evaluate_predicate([{"gte": ["parent:level", 4]}], 1) == (False, True)
    assert effects.evaluate_predicate([{"gte": ["parent:level", 4]}], 4) == (True, True)


def test_evaluate_predicate_non_level_family_is_conditional() -> None:
    passes, is_level_family = effects.evaluate_predicate(
        ["self:condition:persistent-damage:bleed"], 5
    )
    assert passes is None
    assert is_level_family is False


def test_evaluate_predicate_compound_or_is_conditional() -> None:
    passes, is_level_family = effects.evaluate_predicate(
        [{"or": ["melting-heart-first:copper-core", "melting-heart-second:copper-core"]}], 5
    )
    assert passes is None
    assert is_level_family is False


# ---------------------------------------------------------------------------
# Resistance/Weakness typed vs. mustache choice-of-energy; array type fanout.
# ---------------------------------------------------------------------------


def test_resistance_typed_value() -> None:
    doc = {"system": {"rules": [{"key": "Resistance", "type": "fire", "value": 10}]}}
    profile = effects.build_effect_profile("x", doc, 5)
    assert profile.atoms == {"resistance:fire": 10.0}
    assert profile.resistance_choice_of_energy is False


def test_resistance_mustache_type_is_choice_of_energy_not_an_atom() -> None:
    doc = {
        "system": {
            "rules": [
                {
                    "key": "Resistance",
                    "type": "{item|flags.system.rulesSelections.chromaticArmorFirst}",
                    "value": 5,
                }
            ]
        }
    }
    profile = effects.build_effect_profile("x", doc, 5)
    assert profile.atoms == {}
    assert profile.resistance_choice_of_energy is True


def test_resistance_array_type_fans_out() -> None:
    doc = {
        "system": {
            "rules": [{"key": "Resistance", "type": ["bludgeoning", "piercing"], "value": 2}]
        }
    }
    profile = effects.build_effect_profile("x", doc, 5)
    assert profile.atoms == {"resistance:bludgeoning": 2.0, "resistance:piercing": 2.0}


# ---------------------------------------------------------------------------
# BattleForm — whole profile suppressed, tagged.
# ---------------------------------------------------------------------------


def test_battle_form_suppresses_atoms() -> None:
    doc = {
        "system": {
            "rules": [
                {"key": "BattleForm", "value": {}},
                {"key": "FlatModifier", "selector": "ac", "value": 5},
            ]
        }
    }
    profile = effects.build_effect_profile("x", doc, 5)
    assert profile.atoms == {}
    assert profile.tags == ["battle-form"]
