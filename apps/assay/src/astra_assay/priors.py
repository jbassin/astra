"""The prior-anchored condition price card (spec 0030 D30-24) — replaces
every FITTED per-condition price with a labeled PRIOR.

Review F3/F4 killed round 2's Stage-B condition price card as a primary
tool: its per-condition entries were the hybrid-trained β's applied to a
single instance, useful as an internal Stage-A/B diagnostic but never
validated as a standalone design price (round-2's own build record already
flags this — the per-condition table is "the per-instance rate, not the
whole-spell aggregate"). D30-24 replaces it with explicit, unit-coherent
PRIORS anchored on four named real spells/rules, never fitted:

- **T4** (Paralyzed/failure/round — the same representative point round-2's
  β_T4 prior itself used): "a T4 fight-ender on failure ≈ a full
  SAME-RANK slot" — a PROPORTIONAL claim (scales with whatever rank you
  design at), reported at a representative rank for readability.
- **T3** (Slowed 1/failure/minute — Slow's own real extracted shape):
  "slowed 1 for 1 minute ≈ a full rank-3 slot" (the community "slow is
  best-in-class" consensus) — anchored at the FIXED rank 3.
- **T2** (Frightened 1/success/instant — Fear's own real extracted shape,
  its `duration.value` is "varies" with no per-degree prose, which
  `conditions.classify_duration` falls back to INSTANT): "frightened 1
  with effect-on-success ≈ the rank-1 Fear benchmark" — anchored at rank 1.
- **T1** ("cantrip-adjacent" — no fixed spell-rank anchor at all; anchored
  on the cantrip ladder's own budget instead of the main ladder).

**The formula, unit-coherent (D30-24's own text): V ≈ Budget/w_repr, with
w_repr printed alongside every rate.** For tier T with anchor rank R_T and
representative weight w_repr_T (the named anchor condition's own real
coverage×duration shape, via `pricing.instance_weight` — the SAME weight
function Stage A/B used, reused here as a prior calibration point instead
of a fitted one):

    RATE_T = Budget(R_T) / w_repr_T          (T1 uses the cantrip budget)
    V(condition, value) = RATE_T × instance_weight(condition, "failure",
                                                     DurationClass.ROUND)

reported both as a raw currency value and as its rank-equivalent (via the
MAIN ladder's `pricing.rank_equivalent`) for a single portable number a
homebrew designer can compare against any spell's own rank — the failure/
round representative point matches round-2's own price-card convention
(`sample_weight_failure_only_round`), so this table is drop-in comparable.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import pricing
from .conditions import (  # module-private tier tables, source of truth
    _FLAT_TIER,
    _VALUED_TIER,
    DurationClass,
    Tier,
)


#: D30-24 declared anchors — see the module docstring for the derivation of
#: each. `anchor_rank=0` is T1's "no fixed rank, cantrip-adjacent" case.
@dataclass(frozen=True)
class TierAnchor:
    tier: Tier
    anchor_rank: int
    anchor_condition: str
    anchor_degree: str
    anchor_duration: DurationClass
    anchor_note: str
    proportional: bool  # True = "scales with whatever rank you design at" (T4)


TIER_ANCHORS: dict[Tier, TierAnchor] = {
    Tier.T4: TierAnchor(
        Tier.T4,
        5,
        "Paralyzed",
        "failure",
        DurationClass.ROUND,
        "a T4 fight-ender on failure ≈ a full SAME-RANK slot (proportional — "
        "reported at rank 5 as a representative point, matching round-2's own "
        "β_T4 prior derivation's calibration shape)",
        proportional=True,
    ),
    Tier.T3: TierAnchor(
        Tier.T3,
        3,
        "Slowed",
        "failure",
        DurationClass.MINUTE,
        "slowed 1 for 1 minute ≈ a full rank-3 slot (Slow's own real extracted "
        "shape — the community 'slow is best-in-class' consensus)",
        proportional=False,
    ),
    Tier.T2: TierAnchor(
        Tier.T2,
        1,
        "Frightened",
        "success",
        DurationClass.INSTANT,
        "frightened 1 with effect-on-success ≈ the rank-1 Fear benchmark "
        "(Fear's own real extracted shape — duration.value='varies' with no "
        "per-degree prose falls back to INSTANT)",
        proportional=False,
    ),
    Tier.T1: TierAnchor(
        Tier.T1,
        0,
        "Dazzled",
        "failure",
        DurationClass.ROUND,
        "T1 minors ≈ cantrip-adjacent (anchored on the cantrip ladder's own "
        "budget, not a main-ladder rank)",
        proportional=False,
    ),
}

#: D30-24's marginal-rider guidance — GM Core's -1-rank rule, the round-1
#: probe's empirical range. A flat, non-per-condition statement (adding a
#: significant condition rider to an otherwise-priced damage spell).
MARGINAL_RIDER_LOW = 0.5
MARGINAL_RIDER_HIGH = 0.75


@dataclass(frozen=True)
class TierRate:
    tier: Tier
    anchor: TierAnchor
    w_repr: float
    anchor_budget: float
    rate: float  # Budget(anchor)/w_repr — the "V ≈ Budget/w_repr" rate


def tier_rate(
    tier: Tier, ladder: pricing.LadderFit, cantrip_ladder: pricing.CantripLadderFit
) -> TierRate:
    anchor = TIER_ANCHORS[tier]
    w_repr = pricing.instance_weight(
        anchor.anchor_condition, anchor.anchor_degree, anchor.anchor_duration
    )
    anchor_budget = (
        cantrip_ladder.budget() if tier == Tier.T1 else ladder.budget(anchor.anchor_rank)
    )
    return TierRate(
        tier=tier,
        anchor=anchor,
        w_repr=w_repr,
        anchor_budget=anchor_budget,
        rate=anchor_budget / w_repr,
    )


@dataclass(frozen=True)
class PriorCardRow:
    condition: str
    tier: Tier
    sample_weight_failure_only_round: float
    prior_value: float
    prior_rank_equivalent: float


def build_prior_card(
    ladder: pricing.LadderFit, cantrip_ladder: pricing.CantripLadderFit
) -> list[PriorCardRow]:
    rates = {t: tier_rate(t, ladder, cantrip_ladder) for t in Tier}
    rows: list[PriorCardRow] = []

    def _row(condition: str, value: int | None, tier: Tier) -> PriorCardRow:
        # `instance_weight` already folds in `within_tier_offset` internally —
        # do not re-apply it here (that would double-count the offset).
        w = pricing.instance_weight(condition, "failure", DurationClass.ROUND)
        rate = rates[tier].rate
        v = rate * w
        return PriorCardRow(
            condition=condition if value is None else f"{condition} {value}",
            tier=tier,
            sample_weight_failure_only_round=w,
            prior_value=v,
            prior_rank_equivalent=pricing.rank_equivalent(v, ladder) if v > 0 else float("nan"),
        )

    for name, tier in _FLAT_TIER.items():
        rows.append(_row(name, None, tier))
    for name, thresholds in _VALUED_TIER.items():
        for value, tier in thresholds:
            rows.append(_row(name, value, tier))

    return sorted(rows, key=lambda r: (r.tier.value, -r.prior_value))


def coverage_duration_multiplier_guidance() -> tuple[dict[str, float], dict[str, float]]:
    """D30-24's "coverage/duration adjustment guidance" — the SAME declared
    constants D30-4/8b already use, surfaced here as design-time multiplier
    tables rather than internal fit machinery."""
    from .conditions import DURATION_FACTOR, OUTCOME_PROBABILITY  # noqa: PLC0415

    return dict(OUTCOME_PROBABILITY), {k.value: v for k, v in DURATION_FACTOR.items()}
