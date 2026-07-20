"""Unit tests for round-2 population routing (spec 0030 D30-8) — the
scored-vs-ledgered split and the unpriced-skip sub-classifier."""

from __future__ import annotations

from astra_assay import ledger
from astra_assay.extract import (
    ActionBucket,
    ConditionInstanceOut,
    DamageTypeClass,
    EffectiveTarget,
    RangeBucket,
    SpellFeatures,
    StatusModifierOut,
    TargetingClass,
)


def _base_row(name: str, ev: float) -> SpellFeatures:
    return SpellFeatures(
        name=name,
        source_id=name,
        file=f"{name}.json",
        rank=3,
        is_cantrip=False,
        ev=ev,
        has_structured_damage=ev > 0,
        damage_types=[],
        damage_type_class=DamageTypeClass.COMMON,
        persistent_ev=0.0,
        has_persistent=False,
        splash_ev=0.0,
        has_splash=False,
        apply_mod_flag=False,
        targeting_class=TargetingClass.AOE_SAVE,
        has_attack_trait=False,
        has_save=True,
        save_basic=True,
        save_statistic="fortitude",
        defense_passive=False,
        area_type=None,
        area_value_ft=0.0,
        effective_target=EffectiveTarget.SINGLE,
        action_raw="2",
        action_numeric=2.0,
        action_bucket=ActionBucket.TWO,
        action_flagged=False,
        range_raw="",
        range_feet=0.0,
        range_bucket=RangeBucket.TOUCH_SELF,
        range_flagged=False,
        condition_ref=False,
        condition_instances=[],
        status_modifiers=[],
        confidence="high",
        sustained=False,
        has_duration=False,
        incapacitation=False,
        rarity="common",
        rarity_flag=False,
        traditions=[],
        recovery_path=None,
        is_variant=False,
        variant_label=None,
        parent_name=None,
        heightening_interval=None,
        heightening_delta_ev=None,
    )


def test_classify_row_damage_always_scores_even_low_confidence() -> None:
    row = _base_row("manual-scaling-spell", 7.0).model_copy(update={"confidence": "low"})
    assert ledger.classify_row(row) is None


def test_classify_row_low_confidence_condition_only_is_ledgered() -> None:
    row = _base_row("affliction-spell", 0.0).model_copy(update={"confidence": "low"})
    assert ledger.classify_row(row) == "low-confidence extraction"


def test_classify_row_condition_control_scores() -> None:
    instances = [
        ConditionInstanceOut(
            condition="Frightened",
            value=1,
            degree="failure",
            duration="round",
            rule="direct",
            tier="T2",
        )
    ]
    row = _base_row("fear-like", 0.0).model_copy(
        update={"condition_ref": True, "condition_instances": instances}
    )
    assert ledger.classify_row(row) is None


def test_classify_row_beneficial_effect_ledgered() -> None:
    instances = [
        ConditionInstanceOut(
            condition="Invisible",
            value=None,
            degree="unconditional",
            duration="minute",
            rule="direct",
            tier=None,
        )
    ]
    row = _base_row("buff-spell", 0.0).model_copy(
        update={"condition_ref": True, "condition_instances": instances}
    )
    assert ledger.classify_row(row) == "beneficial-effect"


def test_classify_row_raw_modifier_only() -> None:
    mods = [StatusModifierOut(delta="-1", kind="status", direction="penalty", target_stat="AC")]
    row = _base_row("modifier-spell", 0.0).model_copy(update={"status_modifiers": mods})
    assert (
        ledger.classify_row(row)
        == "raw-modifier-only (not priced — D30-5 restricts severity to condition tiers)"
    )


def test_classify_unpriced_skip_summon() -> None:
    data = {
        "name": "Summon Fiend",
        "system": {"traits": {"value": []}, "description": {"value": ""}},
    }
    assert ledger.classify_unpriced_skip(data, "no-priceable-effect (x)") == "summon"


def test_classify_unpriced_skip_wall() -> None:
    data = {
        "name": "Wall of Ice",
        "system": {"traits": {"value": []}, "description": {"value": ""}},
    }
    assert ledger.classify_unpriced_skip(data, "no-priceable-effect (x)") == "wall/terrain"


def test_classify_unpriced_skip_teleport() -> None:
    data = {
        "name": "Blink Away",
        "system": {"traits": {"value": []}, "description": {"value": "You teleport 30 feet."}},
    }
    assert ledger.classify_unpriced_skip(data, "no-priceable-effect (x)") == "teleport/utility"


def test_classify_unpriced_skip_effect_item() -> None:
    data = {
        "name": "Heroism",
        "system": {
            "traits": {"value": []},
            "description": {"value": "@UUID[Compendium.pf2e.spell-effects.Item.Heroism]"},
        },
    }
    assert ledger.classify_unpriced_skip(data, "no-priceable-effect (x)") == "effect-item payload"


def test_classify_unpriced_skip_long_cast_passthrough() -> None:
    assert ledger.classify_unpriced_skip({}, "long-cast time ('1 minute')") == (
        "long-cast (out of combat-damage scope)"
    )
