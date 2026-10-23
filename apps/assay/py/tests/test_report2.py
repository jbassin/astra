"""Unit tests for round-2 report generation (spec 0030 D30-8/D30-9) — the
full-population scorer end-to-end on a small synthetic corpus."""

from __future__ import annotations

import math

import pytest
from astra_assay import pricing, report2
from astra_assay.conditions import Tier
from astra_assay.extract import (
    ActionBucket,
    ConditionInstanceOut,
    DamageTypeClass,
    EffectiveTarget,
    RangeBucket,
    SkipRecord,
    SpellFeatures,
    TargetingClass,
)


def _damage_row(name: str, rank: int, ev: float) -> SpellFeatures:
    return SpellFeatures(
        name=name,
        source_id=name,
        file=f"{name}.json",
        rank=rank,
        is_cantrip=False,
        ev=ev,
        has_structured_damage=True,
        damage_types=["fire"],
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
        save_statistic="reflex",
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


def _control_row(name: str, rank: int) -> SpellFeatures:
    instances = [
        ConditionInstanceOut(
            condition="Frightened",
            value=2,
            degree="failure",
            duration="round",
            rule="direct",
            tier="T3",
        )
    ]
    return _damage_row(name, rank, 0.0).model_copy(
        update={
            "has_structured_damage": False,
            "condition_ref": True,
            "condition_instances": instances,
        }
    )


def test_score_population_splits_scored_and_ledgered(tmp_path) -> None:
    rows = [_damage_row("Firebolt", 1, 7.0), _control_row("Frighten", 1)]
    skipped: list[SkipRecord] = []
    ladder = pricing.fit_ladder(
        [_damage_row(f"s{r}", r, 7.0 * r) for r in range(1, 6)], exclude_singletons=False
    )
    cantrip_ladder = pricing.CantripLadderFit(
        intercept=math.log(2.0), effective_target_coef={}, range_coef={}, n_obs=1, r_squared=1.0
    )
    stage_a = pricing.StageAFit(
        beta={Tier.T1: 0.0, Tier.T2: 0.2, Tier.T3: 0.15, Tier.T4: pricing.BETA_T4_PRIOR},
        beta_raw={Tier.T1: 0.0, Tier.T2: 0.2, Tier.T3: 0.15, Tier.T4: pricing.BETA_T4_PRIOR},
        alpha=0.0,
        n_obs=10,
        r_squared=0.1,
    )
    population = report2.score_population(rows, skipped, tmp_path, ladder, cantrip_ladder, stage_a)
    assert len(population.scored) == 2
    kinds = {s.name: s.kind for s in population.scored}
    assert kinds["Firebolt"] == "pure-damage"
    assert kinds["Frighten"] == "condition-control"
    assert population.ledger == {}


def test_v1_prime_groups_by_kind() -> None:
    scored = [
        report2.ScoredRow("A", 3, False, "pure-damage", 20.0, 3.1, 0.1),
        report2.ScoredRow("B", 3, False, "condition-control", 5.0, 1.0, -2.0),
    ]
    results = report2.validate_v1_prime(scored)
    by_subpop = {r.subpop: r for r in results}
    assert by_subpop["pure"].n == 1
    assert by_subpop["control"].n == 1
    assert by_subpop["all-non-cantrip"].n == 2


def test_v4_prime_tracks_community_line() -> None:
    ladder = pricing.LadderFit(
        intercept=math.log(7.0),
        slope=1.0,
        effective_target_coef={},
        range_coef={},
        n_obs=10,
        r_squared=1.0,
        excluded_singletons=True,
    )
    rows = report2.validate_v4_prime(ladder)
    assert len(rows) == 10
    for row in rows:
        assert row.delta_pct == pytest.approx(0.0, abs=1e-6)  # budget == community 7x
