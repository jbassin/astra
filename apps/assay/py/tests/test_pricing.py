"""Unit tests for the pricing pipeline — ladder fit mechanics and tier-weight computation,
independent of the real corpus (a small synthetic pure/hybrid population).
"""

from __future__ import annotations

import math

import pytest
from astra_assay import pricing
from astra_assay.conditions import DurationClass, Tier
from astra_assay.extract import (
    ActionBucket,
    ConditionInstanceOut,
    DamageTypeClass,
    EffectiveTarget,
    RangeBucket,
    SpellFeatures,
    TargetingClass,
)


def _row(
    name: str,
    rank: int,
    ev: float,
    *,
    conditions: list[ConditionInstanceOut] | None = None,
    action_bucket: ActionBucket = ActionBucket.TWO,
    has_attack_trait: bool = False,
    effective_target: EffectiveTarget = EffectiveTarget.SINGLE,
    range_bucket: RangeBucket = RangeBucket.TOUCH_SELF,
    is_cantrip: bool = False,
) -> SpellFeatures:
    return SpellFeatures(
        name=name,
        source_id=name,
        file=f"{name}.json",
        rank=rank,
        is_cantrip=is_cantrip,
        ev=ev,
        has_structured_damage=ev > 0,
        damage_types=["fire"] if ev > 0 else [],
        damage_type_class=DamageTypeClass.COMMON,
        persistent_ev=0.0,
        has_persistent=False,
        splash_ev=0.0,
        has_splash=False,
        apply_mod_flag=False,
        targeting_class=TargetingClass.ATTACK_ROLL if has_attack_trait else TargetingClass.AOE_SAVE,
        has_attack_trait=has_attack_trait,
        has_save=not has_attack_trait,
        save_basic=not has_attack_trait,
        save_statistic="fortitude" if not has_attack_trait else None,
        defense_passive=False,
        area_type=None,
        area_value_ft=0.0,
        effective_target=effective_target,
        action_raw=action_bucket.value,
        action_numeric=None
        if action_bucket == ActionBucket.REACTION
        else float(action_bucket.value),
        action_bucket=action_bucket,
        action_flagged=False,
        range_raw="",
        range_feet=0.0,
        range_bucket=range_bucket,
        range_flagged=False,
        condition_ref=bool(conditions),
        condition_instances=conditions or [],
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


def test_is_pure_requires_every_flag() -> None:
    pure = _row("pure-spell", 3, 20.0)
    assert pricing.is_pure(pure)
    attack = _row("attack-spell", 3, 20.0, has_attack_trait=True)
    assert not pricing.is_pure(attack)  # double-gate exclusion


def test_fit_ladder_recovers_known_power_law() -> None:
    """A noiseless log(EV) = a + b*log(rank) population recovers a, b exactly."""
    a, b = 1.5, 1.0
    rows = [_row(f"s{r}", r, math.exp(a + b * math.log(r))) for r in range(1, 8)]
    ladder = pricing.fit_ladder(rows, exclude_singletons=False)
    assert ladder.slope == pytest.approx(b, abs=1e-8)
    assert ladder.intercept == pytest.approx(a, abs=1e-8)
    assert ladder.budget(4) == pytest.approx(math.exp(a + b * math.log(4)), abs=1e-6)


def test_fit_ladder_excludes_named_singleton() -> None:
    rows = [_row(f"s{r}", r, 10.0 * r) for r in range(1, 6)]
    rows.append(_row("Detonate Magic", 9, 1000.0))  # a wild outlier at r9
    excl = pricing.fit_ladder(rows, exclude_singletons=True)
    incl = pricing.fit_ladder(rows, exclude_singletons=False)
    assert excl.n_obs == 5
    assert incl.n_obs == 6
    assert excl.slope != incl.slope


def test_rank_equivalent_inverts_budget() -> None:
    ladder = pricing.LadderFit(
        intercept=math.log(7.0),
        slope=1.0,
        effective_target_coef={},
        range_coef={},
        n_obs=10,
        r_squared=1.0,
        excluded_singletons=True,
    )
    assert pricing.rank_equivalent(ladder.budget(4), ladder) == pytest.approx(4.0, abs=1e-6)


def test_instance_weight_duration_and_offset() -> None:
    round_w = pricing.instance_weight("Paralyzed", "failure", DurationClass.ROUND)
    instant_w = pricing.instance_weight("Paralyzed", "failure", DurationClass.INSTANT)
    minute_w = pricing.instance_weight("Paralyzed", "failure", DurationClass.MINUTE)
    assert instant_w < round_w < minute_w  # duration factors are monotone


def test_instance_weight_success_degree_is_nonzero() -> None:
    """An instance explicitly attributed to "success" (a real,
    if milder-valued, outcome) must carry nonzero weight — round 1's bug had
    this hardcoded to 0, silently erasing spells like Fear's success-row
    Frightened 1."""
    w = pricing.instance_weight("Frightened", "success", DurationClass.ROUND)
    assert w > 0.0


def test_boss_weighted_degrades_one_step_and_never_increases() -> None:
    instances = [
        ConditionInstanceOut(
            condition="Paralyzed",
            value=None,
            degree="failure",
            duration="round",
            rule="direct",
            tier="T4",
        )
    ]
    row = _row("incap-spell", 5, 0.0, conditions=instances)
    at_level = pricing.tier_weights(row)[Tier.T4]
    boss = pricing.tier_weights(row, boss_weighted=True)[Tier.T4]
    assert boss < at_level  # degraded one outcome step is strictly weaker


def test_action_multiplier_declared_constants() -> None:
    assert pricing.action_multiplier(ActionBucket.ONE) == 1.4
    assert pricing.action_multiplier(ActionBucket.TWO) == 1.0
    assert pricing.action_multiplier(ActionBucket.THREE) == 0.75
    assert pricing.action_multiplier(ActionBucket.REACTION) == 1.6
