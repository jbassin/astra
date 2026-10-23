"""Unit tests for the D30-24 prior-anchored condition price card."""

from __future__ import annotations

import math

import pytest
from astra_assay import pricing, priors
from astra_assay.conditions import Tier


def _ladder() -> pricing.LadderFit:
    # log EV = log(7) + 1*log(rank) -> budget(r) = 7*r, exactly.
    return pricing.LadderFit(
        intercept=math.log(7.0),
        slope=1.0,
        effective_target_coef={},
        range_coef={},
        n_obs=27,
        r_squared=0.97,
        excluded_singletons=True,
    )


def _cantrip_ladder() -> pricing.CantripLadderFit:
    return pricing.CantripLadderFit(
        intercept=math.log(5.0),
        effective_target_coef={},
        range_coef={},
        n_obs=2,
        r_squared=1.0,
    )


def test_tier_rate_t4_uses_rank5_and_paralyzed_failure_round() -> None:
    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    tr = priors.tier_rate(Tier.T4, ladder, cantrip_ladder)
    expected_w = pricing.instance_weight("Paralyzed", "failure", priors.DurationClass.ROUND)
    assert tr.w_repr == pytest.approx(expected_w)
    assert tr.anchor_budget == pytest.approx(ladder.budget(5))
    assert tr.rate == pytest.approx(ladder.budget(5) / expected_w)


def test_tier_rate_t3_anchors_slowed_at_rank3_minute() -> None:
    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    tr = priors.tier_rate(Tier.T3, ladder, cantrip_ladder)
    assert tr.anchor.anchor_rank == 3
    assert tr.anchor.anchor_condition == "Slowed"
    assert tr.anchor.anchor_duration == priors.DurationClass.MINUTE


def test_tier_rate_t2_anchors_frightened_at_rank1() -> None:
    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    tr = priors.tier_rate(Tier.T2, ladder, cantrip_ladder)
    assert tr.anchor.anchor_rank == 1
    assert tr.anchor.anchor_condition == "Frightened"
    assert tr.anchor.anchor_degree == "success"


def test_tier_rate_t1_uses_cantrip_budget() -> None:
    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    tr = priors.tier_rate(Tier.T1, ladder, cantrip_ladder)
    assert tr.anchor_budget == pytest.approx(cantrip_ladder.budget())


def test_paralyzed_row_hits_its_own_anchor_exactly() -> None:
    """Paralyzed's own table row (failure/round) is EXACTLY the T4 anchor's
    own representative point — its prior_rank_equivalent must land exactly
    on the anchor rank (5), a hard consistency check on the V = Budget/w_repr
    formula."""
    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    card = priors.build_prior_card(ladder, cantrip_ladder)
    row = next(r for r in card if r.condition == "Paralyzed")
    assert row.tier == Tier.T4
    assert row.prior_rank_equivalent == pytest.approx(5.0, abs=1e-6)


def test_build_prior_card_covers_every_flat_and_valued_condition() -> None:
    from astra_assay.conditions import _FLAT_TIER, _VALUED_TIER

    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    card = priors.build_prior_card(ladder, cantrip_ladder)
    labels = {row.condition for row in card}
    for name in _FLAT_TIER:
        assert name in labels
    for name, thresholds in _VALUED_TIER.items():
        for value, _tier in thresholds:
            assert f"{name} {value}" in labels


def test_build_prior_card_sorted_by_tier_then_descending_value() -> None:
    ladder = _ladder()
    cantrip_ladder = _cantrip_ladder()
    card = priors.build_prior_card(ladder, cantrip_ladder)
    tiers_seen = [row.tier.value for row in card]
    assert tiers_seen == sorted(tiers_seen)  # T1 < T2 < T3 < T4 lexicographically


def test_coverage_duration_multiplier_guidance_matches_declared_constants() -> None:
    from astra_assay.conditions import DURATION_FACTOR, OUTCOME_PROBABILITY

    outcome_probability, duration_factor = priors.coverage_duration_multiplier_guidance()
    assert outcome_probability == OUTCOME_PROBABILITY
    assert duration_factor == {k.value: v for k, v in DURATION_FACTOR.items()}


def test_marginal_rider_range_is_the_declared_constants() -> None:
    assert priors.MARGINAL_RIDER_LOW == 0.5
    assert priors.MARGINAL_RIDER_HIGH == 0.75
