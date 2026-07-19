"""Fit smoke test — a noiseless synthetic full factorial recovers its own known
coefficients exactly (up to floating-point epsilon), and a fitted model's
predictions round-trip back to the training data (the "score round-trip").
"""

from __future__ import annotations

import math

import pytest
from astra_assay.extract import (
    ActionBucket,
    DamageTypeClass,
    RangeBucket,
    SpellFeatures,
    TargetingClass,
)
from astra_assay.model import build_design_matrix, fit_ols, predict_log_ev

RANK_COEF = {r: math.log(7 * r) for r in range(1, 6)}
TARGETING_OFFSET = {
    TargetingClass.AOE_SAVE: 0.0,
    TargetingClass.SINGLE_TARGET_SAVE: math.log(1.3),
    TargetingClass.ATTACK_ROLL: math.log(1.1),
    TargetingClass.AUTO_HIT: math.log(0.5),
}
ACTION_OFFSET = {
    ActionBucket.TWO: 0.0,
    ActionBucket.ONE: math.log(1.4),
    ActionBucket.ONE_HALF: math.log(1.2),
    ActionBucket.THREE: math.log(0.75),
    ActionBucket.REACTION: math.log(1.6),
}


def _make_row(
    rank: int, tc: TargetingClass, ab: ActionBucket, ev: float, *, name: str
) -> SpellFeatures:
    return SpellFeatures(
        name=name,
        source_id=name,
        file=f"{name}.json",
        rank=rank,
        is_cantrip=False,
        ev=ev,
        damage_types=["fire"],
        damage_type_class=DamageTypeClass.COMMON,
        persistent_ev=0.0,
        has_persistent=False,
        splash_ev=0.0,
        has_splash=False,
        apply_mod_flag=False,
        targeting_class=tc,
        has_attack_trait=tc == TargetingClass.ATTACK_ROLL,
        has_save=tc in (TargetingClass.AOE_SAVE, TargetingClass.SINGLE_TARGET_SAVE),
        save_basic=False,
        save_statistic=None,
        defense_passive=False,
        area_type=None,
        area_value_ft=0.0,
        action_raw=ab.value,
        action_numeric=None
        if ab == ActionBucket.REACTION
        else float(ab.value)
        if ab != ActionBucket.ONE_HALF
        else 1.5,
        action_bucket=ab,
        action_flagged=False,
        range_raw="",
        range_feet=0.0,
        range_bucket=RangeBucket.TOUCH_SELF,
        range_flagged=False,
        condition_ref=False,
        sustained=False,
        has_duration=False,
        incapacitation=False,
        rarity="common",
        rarity_flag=False,
        traditions=[],
        heightening_interval=None,
        heightening_delta_ev=None,
    )


def _synthetic_rows() -> list[SpellFeatures]:
    rows = []
    i = 0
    for rank in RANK_COEF:
        for tc in TARGETING_OFFSET:
            for ab in ACTION_OFFSET:
                true_log_ev = RANK_COEF[rank] + TARGETING_OFFSET[tc] + ACTION_OFFSET[ab]
                ev = math.exp(true_log_ev)
                rows.append(_make_row(rank, tc, ab, ev, name=f"synthetic-{i}"))
                i += 1
    return rows


def test_fit_recovers_known_coefficients() -> None:
    rows = _synthetic_rows()
    dm = build_design_matrix(rows, include_rank_ladder=True)
    fit = fit_ols(dm)

    assert fit.n_obs == len(rows)
    assert fit.r_squared == pytest.approx(1.0, abs=1e-9)

    for rank, expected in RANK_COEF.items():
        assert fit.coefficients[f"rank=r{rank}"] == pytest.approx(expected, abs=1e-8)

    for tc, expected in TARGETING_OFFSET.items():
        if tc == TargetingClass.AOE_SAVE:
            continue  # reference level, dropped
        assert fit.coefficients[f"targeting={tc.value}"] == pytest.approx(expected, abs=1e-8)

    for ab, expected in ACTION_OFFSET.items():
        if ab == ActionBucket.TWO:
            continue  # reference level, dropped
        assert fit.coefficients[f"action={ab.value}"] == pytest.approx(expected, abs=1e-8)


def test_score_round_trip_zero_residual() -> None:
    """A spell IN the (noiseless) fit population scores back to ~zero residual —
    the extract -> fit -> predict pipeline is internally consistent."""
    rows = _synthetic_rows()
    dm = build_design_matrix(rows, include_rank_ladder=True)
    fit = fit_ols(dm)

    probe = rows[17]
    predicted_log_ev = predict_log_ev(probe, fit, include_rank_ladder=True)
    assert predicted_log_ev == pytest.approx(math.log(probe.ev), abs=1e-8)
    assert fit.residuals[probe.name] == pytest.approx(0.0, abs=1e-8)


def test_cantrip_fit_uses_intercept_not_rank_ladder() -> None:
    rows = [
        _make_row(1, TargetingClass.AOE_SAVE, ActionBucket.TWO, 10.0, name="a"),
        _make_row(1, TargetingClass.ATTACK_ROLL, ActionBucket.TWO, 8.0, name="b"),
        _make_row(1, TargetingClass.AOE_SAVE, ActionBucket.ONE, 12.0, name="c"),
    ]
    dm = build_design_matrix(rows, include_rank_ladder=False)
    assert "intercept" in dm.columns
    assert not any(c.startswith("rank=r") for c in dm.columns)
    fit = fit_ols(dm)
    assert fit.n_obs == 3
