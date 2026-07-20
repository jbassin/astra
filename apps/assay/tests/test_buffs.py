"""Unit tests for the D30-36 buff-spell comparables engine (spec 0030 round
4) — synthetic profiles/rows (no real corpus reads; real-corpus behavior is
exercised via `test_assay_extract.py`'s promoted-skip routing tests and
manual verification in the build record)."""

from __future__ import annotations

from astra_assay import buffs
from astra_assay.extract import (
    ActionBucket,
    ConditionInstanceOut,
    DamageTypeClass,
    EffectiveTarget,
    EffectProfileOut,
    RangeBucket,
    SpellFeatures,
    StatusModifierOut,
    TargetingClass,
)


def _row(
    name: str,
    *,
    rank: int = 3,
    condition_ref: bool = False,
    condition_instances: list[ConditionInstanceOut] | None = None,
    status_modifiers: list[StatusModifierOut] | None = None,
    effect_profile: EffectProfileOut | None = None,
    file: str | None = None,
) -> SpellFeatures:
    return SpellFeatures(
        name=name,
        source_id=name,
        file=file or f"{name}.json",
        rank=rank,
        is_cantrip=False,
        ev=0.0,
        has_structured_damage=False,
        damage_types=[],
        damage_type_class=DamageTypeClass.COMMON,
        persistent_ev=0.0,
        has_persistent=False,
        splash_ev=0.0,
        has_splash=False,
        apply_mod_flag=False,
        targeting_class=TargetingClass.AUTO_HIT,
        has_attack_trait=False,
        has_save=False,
        save_basic=False,
        save_statistic=None,
        defense_passive=False,
        area_type=None,
        area_value_ft=0.0,
        effective_target=EffectiveTarget.SINGLE,
        target_raw="1 willing creature",
        action_raw="2",
        action_numeric=2.0,
        action_bucket=ActionBucket.TWO,
        action_flagged=False,
        range_raw="touch",
        range_feet=0.0,
        range_bucket=RangeBucket.TOUCH_SELF,
        range_flagged=False,
        condition_ref=condition_ref,
        condition_instances=condition_instances or [],
        status_modifiers=status_modifiers or [],
        confidence="high",
        sustained=False,
        has_duration=True,
        incapacitation=False,
        rarity="common",
        rarity_flag=False,
        traditions=[],
        recovery_path="effect-join" if effect_profile is not None else None,
        is_variant=False,
        variant_label=None,
        parent_name=None,
        heightening_interval=None,
        heightening_delta_ev=None,
        effect_profile=effect_profile,
    )


def test_build_buff_atom_vector_from_effect_profile() -> None:
    profile = EffectProfileOut(
        effect_name="Spell Effect: Heroism", base_rank=3, atoms={"modifier:attack": 1.0}
    )
    row = _row("Heroism", effect_profile=profile)
    atoms = buffs.build_buff_atom_vector(row)
    assert atoms == {"modifier:attack": 1.0}


def test_build_buff_atom_vector_from_status_modifiers() -> None:
    mods = [StatusModifierOut(delta="+1", kind="status", direction="bonus", target_stat="AC")]
    row = _row("Bespoke Buff", status_modifiers=mods)
    atoms = buffs.build_buff_atom_vector(row)
    assert atoms == {"modifier:ac": 1.0}


def test_build_buff_atom_vector_condition_with_tier_still_counts() -> None:
    """Sure Strike's real shape: Concealed/Hidden carry a real tier (T1) —
    still a buff-atom tag, not excluded (D30-36: any condition on an
    already-beneficial-routed row is part of its OWN shape)."""
    ci = ConditionInstanceOut(
        condition="Concealed",
        value=None,
        degree="unconditional",
        duration="minute",
        rule="x",
        tier="T1",
    )
    row = _row("Sure Strike-like", condition_ref=True, condition_instances=[ci])
    atoms = buffs.build_buff_atom_vector(row)
    assert atoms == {"tag:Concealed": 1.0}


def test_build_buff_atom_vector_resistance_choice_of_energy() -> None:
    profile = EffectProfileOut(
        effect_name="Spell Effect: Resist Energy",
        base_rank=2,
        atoms={},
        tags=["resistance-choice-of-energy:resistance"],
        resistance_choice_of_energy=True,
    )
    row = _row("Resist Energy", effect_profile=profile)
    atoms = buffs.build_buff_atom_vector(row)
    assert atoms == {"resistance:choice-of-energy": 1.0}


def test_normalize_modifier_stat_keyword_map() -> None:
    assert buffs._normalize_modifier_stat("attack rolls") == "modifier:attack"
    assert buffs._normalize_modifier_stat("Perception checks") == "modifier:perception"
    assert buffs._normalize_modifier_stat("saving throws") == "modifier:saving-throw"
    assert buffs._normalize_modifier_stat("AC") == "modifier:ac"
    assert buffs._normalize_modifier_stat("all skill checks") == "modifier:skill-check"


def test_is_buff_comparable_candidate_requires_atoms() -> None:
    """A promoted effect-join row whose only content is a tag (no real
    atom) stays in the population but can't be compared."""
    profile = EffectProfileOut(effect_name="x", base_rank=1, atoms={}, tags=["rule:Note"])
    row = _row("Tag Only Buff", effect_profile=profile)
    assert buffs.is_buff_population_row(row) is True  # ledger.classify_row -> beneficial-effect
    assert buffs.is_buff_comparable_candidate(row) is False


def test_build_buff_corpus_excludes_non_beneficial_rows() -> None:
    ci = ConditionInstanceOut(
        condition="Frightened",
        value=1,
        degree="failure",
        duration="round",
        rule="direct",
        tier="T2",
    )
    hostile_row = _row("Hostile", condition_ref=True, condition_instances=[ci])
    profile = EffectProfileOut(effect_name="x", base_rank=1, atoms={"modifier:ac": 1.0})
    buff_row = _row("A Buff", effect_profile=profile)
    corpus = buffs.build_buff_corpus([hostile_row, buff_row])
    assert [p.name for p in corpus] == ["A Buff"]


def test_build_buff_profile_carries_file_for_slug() -> None:
    profile = EffectProfileOut(effect_name="x", base_rank=1, atoms={"modifier:ac": 1.0})
    row = _row("Mystic Armor", effect_profile=profile, file="rank-1/mystic-armor.json")
    p = buffs.build_buff_profile(row)
    assert p.file == "rank-1/mystic-armor.json"
    assert p.ev_band is None  # buffs never carry a damage EV band


def test_validate_w_b_loo_reports_missing_roster_spells() -> None:
    results = buffs.validate_w_b_loo(("Nonexistent Spell",), [])
    assert results[0].note == "not in the buff comparables corpus"
