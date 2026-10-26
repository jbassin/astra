"""Unit tests for the report data — the full-population split and the
validation gates, on a small synthetic corpus."""

from __future__ import annotations

import math

import pytest
from astra_assay import pricing, report2
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


def test_score_population_splits_ladder_effect_and_ledger(tmp_path) -> None:
    rows = [_damage_row("Firebolt", 1, 7.0), _control_row("Frighten", 1)]
    skipped: list[SkipRecord] = []
    ladder = pricing.fit_ladder(
        [_damage_row(f"s{r}", r, 7.0 * r) for r in range(1, 6)], exclude_singletons=False
    )
    cantrip_ladder = pricing.CantripLadderFit(
        intercept=math.log(2.0), effective_target_coef={}, range_coef={}, n_obs=1, r_squared=1.0
    )
    population = report2.score_population(rows, skipped, tmp_path, ladder, cantrip_ladder)
    assert [(s.name, s.kind) for s in population.scored] == [("Firebolt", "pure-damage")]
    assert population.hostile_effect_names == ["Frighten"]
    assert population.scored_count == 2
    assert population.ledger == {}


def test_v1_prime_groups_by_kind() -> None:
    scored = [
        report2.ScoredRow("A", 3, False, "pure-damage", 20.0, 3.1, 0.1),
        report2.ScoredRow("B", 3, False, "hybrid-damage", 15.0, 2.0, -1.0),
    ]
    results = report2.validate_v1_prime(scored)
    by_subpop = {r.subpop: r for r in results}
    assert by_subpop["pure"].n == 1
    assert by_subpop["hybrid"].n == 1
    assert by_subpop["all-non-cantrip"].n == 2
    assert "control" not in by_subpop


def test_v3_prime_leaves_hostile_effect_spells_ungraded() -> None:
    scored = [
        report2.ScoredRow("Force Barrage", 1, False, "recovered-damage", 10.5, 2.6, 1.6),
        report2.ScoredRow("Disintegrate", 6, False, "pure-damage", 66.0, 11.0, 5.0),
    ]
    checks, share = report2.validate_v3_prime(scored, ["Fear", "Dizzying Colors"])
    by_name = {c.name: c for c in checks}
    assert by_name["Fear"].status == "comparables"
    assert by_name["Fear"].correct_side is None
    assert by_name["Dizzying Colors"].correct_side is None
    assert by_name["Command"].status == "ledgered-expected"
    assert by_name["Force Barrage"].correct_side is True
    assert by_name["Disintegrate"].correct_side is False
    graded = [c for c in checks if c.correct_side is not None]
    assert share == sum(1 for c in graded if c.correct_side) / len(graded)


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
