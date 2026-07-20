"""Round-2 pricing (spec 0030 D30-1, D30-3, D30-4, D30-7, D30-8, D30-8b) —
the pure-anchored budget ladder, the two-stage tier-discount fit, and the
full-population scorer + typed ledger.

Everything downstream of the pure ladder is expressed in **log-discount
space** (D30-3, review-pinned): Stage A learns tier coefficients β_T1..β_T3
by OLS on the hybrid trainer population; β_T4 is a declared community-
anchored prior (too few trainers to fit, D30-5); Stage B applies
``p = 1 - exp(-Σ β_t · w_t)`` as a power FRACTION of the pure budget, so
stacked riders can approach but never price past 100% of budget.

numpy stays isolated to this module and ``model.py`` (repo convention).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .conditions import DURATION_FACTOR, DurationClass, Tier, within_tier_offset
from .extract import ActionBucket, EffectiveTarget, SpellFeatures

# ---------------------------------------------------------------------------
# D30-3 — declared action-cost constants (the pure subset is definitionally
# 2-action, so this axis has zero variance there and can't be fit).
# ---------------------------------------------------------------------------

ACTION_MULTIPLIER: dict[ActionBucket, float] = {
    ActionBucket.ONE: 1.4,
    ActionBucket.ONE_HALF: 1.2,  # interpolated between 1a/2a — not spec-pinned, documented
    ActionBucket.TWO: 1.0,
    ActionBucket.THREE: 0.75,
    ActionBucket.REACTION: 1.6,
}


def action_multiplier(bucket: ActionBucket) -> float:
    return ACTION_MULTIPLIER.get(bucket, 1.0)


# ---------------------------------------------------------------------------
# D30-1 — the pure-damage subset (re-derived under round-2 extraction)
# ---------------------------------------------------------------------------


def is_pure(row: SpellFeatures) -> bool:
    """2-action FIXED cast, basic-save, no condition refs, instant
    (no `duration` field at all), non-sustained, no persistent/splash/
    incapacitation/passive-defense, real structured damage only (no
    recovered/inline/variant contamination), and — the round-2 fix over
    round 1's contaminated 34 — no ADDITIONAL inline-@Damage rider riding
    alongside the structured entry (Holy Cascade's hidden anti-unholy spirit
    damage) and no attack-roll gate stacked on top of the save (Disintegrate's
    double-gate, which the V3' weak-outlier check separately validates)."""
    return (
        not row.is_cantrip
        and row.action_bucket == ActionBucket.TWO
        and not row.action_flagged
        and row.has_save
        and row.save_basic
        and not row.has_attack_trait
        and not row.condition_ref
        and not row.has_persistent
        and not row.has_splash
        and not row.incapacitation
        and not row.defense_passive
        and not row.sustained
        and not row.has_duration
        and row.has_structured_damage
        and row.recovery_path is None
        and not row.is_variant
        and not row.has_extra_inline_damage
        and row.confidence == "high"
    )


def is_pure_cantrip(row: SpellFeatures) -> bool:
    return (
        row.is_cantrip
        and row.action_bucket == ActionBucket.TWO
        and not row.action_flagged
        and row.has_save
        and row.save_basic
        and not row.has_attack_trait
        and not row.condition_ref
        and not row.has_persistent
        and not row.has_splash
        and not row.defense_passive
        and not row.sustained
        and not row.has_duration
        and row.has_structured_damage
        and row.recovery_path is None
        and not row.is_variant
        and not row.has_extra_inline_damage
        and row.confidence == "high"
    )


def is_hybrid_trainer(row: SpellFeatures) -> bool:
    """Stage A's fit population (D30-3): real structured damage AND at least
    one hostile-priceable (tier != None) condition instance, high confidence,
    non-cantrip."""
    return (
        not row.is_cantrip
        and row.has_structured_damage
        and row.ev > 0.0
        and row.condition_ref
        and row.confidence == "high"
        and any(ci.tier is not None for ci in row.condition_instances)
    )


#: The rank-9 thin-top singleton (Detonate Magic, EV 28 — a special-mechanic
#: outlier BELOW the r5 geomean per the spec's sensitivity note).
SINGLETON_NAMES = frozenset({"Detonate Magic"})


def _effective_target_of(row: SpellFeatures) -> EffectiveTarget:
    return row.effective_target


def _range_bucket_key(row: SpellFeatures) -> str:
    return row.range_bucket.value


@dataclass
class LadderFit:
    """log(EV) = intercept + slope*log(rank) + Σ effective-target dummies +
    Σ range dummies (single/touch-self are the reference cells) — one
    combined OLS regression on the pure subset (D30-1's ladder AND D30-3's
    effective-target/range structural multipliers share this one fit, per
    round 1's "collapse into one effective-target axis" finding)."""

    intercept: float
    slope: float
    effective_target_coef: dict[str, float]
    range_coef: dict[str, float]
    n_obs: int
    r_squared: float
    excluded_singletons: bool

    def budget(self, rank: int) -> float:
        return math.exp(self.intercept + self.slope * math.log(rank))

    def structural_target_range(self, row: SpellFeatures) -> float:
        m = 1.0
        et = _effective_target_of(row).value
        if et in self.effective_target_coef:
            m *= math.exp(self.effective_target_coef[et])
        rb = _range_bucket_key(row)
        if rb in self.range_coef:
            m *= math.exp(self.range_coef[rb])
        return m


_REF_EFFECTIVE_TARGET = EffectiveTarget.SINGLE.value
_REF_RANGE = "touch-self"


def fit_ladder(pure_rows: list[SpellFeatures], *, exclude_singletons: bool) -> LadderFit:
    rows = [r for r in pure_rows if not (exclude_singletons and r.name in SINGLETON_NAMES)]
    et_levels = sorted({_effective_target_of(r).value for r in rows} - {_REF_EFFECTIVE_TARGET})
    range_levels = sorted({_range_bucket_key(r) for r in rows} - {_REF_RANGE})

    columns = [
        "intercept",
        "log_rank",
        *[f"et={v}" for v in et_levels],
        *[f"range={v}" for v in range_levels],
    ]
    x_rows = []
    y_rows = []
    for r in rows:
        row_vec = [1.0, math.log(r.rank)]
        row_vec += [1.0 if _effective_target_of(r).value == v else 0.0 for v in et_levels]
        row_vec += [1.0 if _range_bucket_key(r) == v else 0.0 for v in range_levels]
        x_rows.append(row_vec)
        y_rows.append(math.log(r.ev))

    x = np.array(x_rows, dtype=float)
    y = np.array(y_rows, dtype=float)
    beta, _res, _rank, _sv = np.linalg.lstsq(x, y, rcond=None)
    fitted = x @ beta
    resid = y - fitted
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")

    coef = dict(zip(columns, (float(b) for b in beta), strict=True))
    et_coef = {v: coef[f"et={v}"] for v in et_levels}
    range_coef = {v: coef[f"range={v}"] for v in range_levels}

    return LadderFit(
        intercept=coef["intercept"],
        slope=coef["log_rank"],
        effective_target_coef=et_coef,
        range_coef=range_coef,
        n_obs=len(rows),
        r_squared=r_squared,
        excluded_singletons=exclude_singletons,
    )


@dataclass
class CantripLadderFit:
    intercept: float
    effective_target_coef: dict[str, float]
    range_coef: dict[str, float]
    n_obs: int
    r_squared: float

    def budget(self) -> float:
        return math.exp(self.intercept)

    def structural_target_range(self, row: SpellFeatures) -> float:
        m = 1.0
        et = _effective_target_of(row).value
        if et in self.effective_target_coef:
            m *= math.exp(self.effective_target_coef[et])
        rb = _range_bucket_key(row)
        if rb in self.range_coef:
            m *= math.exp(self.range_coef[rb])
        return m


def fit_cantrip_ladder(pure_cantrip_rows: list[SpellFeatures]) -> CantripLadderFit:
    """Cantrips keep a separate ladder, "same method" per D30-1 — but the
    real pure-cantrip population is only 2 rows (Electric Arc, Frostbite),
    too thin to also carry effective-target/range dummies (a 3-parameter
    design on 2 rows is a saturated, not-fit system). Intercept-only: the
    mean log(EV) across the pure cantrip rows, structural multipliers from
    the SAME coefficients as the main ladder (no separate cantrip-only
    estimate is identifiable at this n)."""
    rows = pure_cantrip_rows
    y = np.array([math.log(r.ev) for r in rows], dtype=float)
    intercept = float(y.mean()) if len(rows) else 0.0
    resid = y - intercept
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return CantripLadderFit(
        intercept=intercept,
        effective_target_coef={},
        range_coef={},
        n_obs=len(rows),
        r_squared=r_squared,
    )


def rank_equivalent(ev: float, ladder: LadderFit) -> float:
    """Invert the power-law ladder: EV -> a fractional rank whose budget()
    equals EV (the "rank-equivalents" reporting currency, D30-9)."""
    if ev <= 0 or ladder.slope == 0:
        return float("nan")
    return math.exp((math.log(ev) - ladder.intercept) / ladder.slope)


# ---------------------------------------------------------------------------
# D30-4 — coverage arithmetic applied per condition-instance (not per-spell
# cross-degree merging — see the S2 build-record note on this simplification).
# ---------------------------------------------------------------------------

_DEGREE_PROBABILITY = {
    "critical-failure": 0.10,
    "failure": 0.40,
    "success": 0.40,
    "critical-success": 0.10,
    "on-hit": 1.0,  # the attack roll's own accuracy is priced elsewhere
    "unconditional": 1.0,
}
#: D30-4: "fail-only ≈ 0.55 and effect-on-success ADDS its success-row
#: value" — an instance explicitly attributed to "success" (fear's Frightened
#: 1, a real if milder-VALUED outcome — the milder value is captured by the
#: tier assignment, not here) is a genuine hit, not a zero: severity=1.0, the
#: same as failure. critical-success keeps 0.0 because no spell in the corpus
#: ever attributes an instance there in practice (a fully-negated result).
_DEGREE_SEVERITY = {
    "critical-failure": 1.5,
    "failure": 1.0,
    "success": 1.0,
    "critical-success": 0.0,
    "on-hit": 1.0,
    "unconditional": 1.0,
}
#: D30-7 boss-weighted: "coverage degraded one outcome step" — a boss's
#: better saves shift the WHOLE outcome distribution toward
#: better-for-the-target results (not a relabeling of any one instance's own
#: attributed degree, which — now that "success" carries real weight, see
#: `_DEGREE_SEVERITY` above — would be a no-op for a failure-attributed
#: instance and perversely INCREASE weight for a critical-failure-attributed
#: one). Roughly one outcome-band's probability mass moves crit-fail->fail->
#: success->crit-success; on-hit/unconditional are untouched (a documented
#: simplification — boss AC isn't priced here). Never a fitted coefficient.
_DEGREE_PROBABILITY_BOSS = {
    "critical-failure": 0.05,
    "failure": 0.25,
    "success": 0.45,
    "critical-success": 0.25,
    "on-hit": 1.0,
    "unconditional": 1.0,
}


def instance_weight(
    condition: str, degree: str, duration: DurationClass, *, boss_weighted: bool = False
) -> float:
    """One condition-instance's contribution to its tier's Σw (D30-4 coverage
    x D30-8b duration x D30-5 within-tier offset). Each ConditionInstance
    already carries its own attributed degree, so this treats every instance
    as an independent weighted line rather than re-merging same-condition
    multi-degree coverage sets — a documented simplification (see the S2
    build record)."""
    prob_table = _DEGREE_PROBABILITY_BOSS if boss_weighted else _DEGREE_PROBABILITY
    p = prob_table.get(degree, 0.0)
    sev = _DEGREE_SEVERITY.get(degree, 1.0)
    dur = DURATION_FACTOR[duration]
    offset = within_tier_offset(condition)
    return p * sev * dur * offset


# ---------------------------------------------------------------------------
# D30-5 — tier severity: β_T1..T3 fitted (Stage A), β_T4 a declared prior.
# ---------------------------------------------------------------------------

#: β_T4 prior derivation (no data — ~6 trainers is too thin, D30-5): targets
#: ~80% of budget for a SINGLE failure-only, ~1-round-duration T4 application
#: (w = 0.40 * 1.0 * 0.6 * 1.15(Paralyzed's within-tier offset) ≈ 0.276) —
#: 1 - exp(-β * 0.276) = 0.80 -> β ≈ 5.83, rounded to a clean 6.0. This
#: matches "fight-ending... effectively incapacitation-gated" (T4 conditions
#: remove a creature from combat almost entirely once they land).
BETA_T4_PRIOR = 6.0


@dataclass
class StageAFit:
    #: Operational tier coefficients — floored at 0 (see ``beta_raw`` for the
    #: as-fitted values). A negative β is a domain violation for the exp link
    #: (p = 1-exp(-Σβw) would go negative, not a valid power fraction), so a
    #: below-zero fit is reported honestly but clamped for scoring — the same
    #: boundary-constrained-estimation move as flooring a fitted variance at
    #: zero, not silent tuning (both numbers ship in the build record).
    beta: dict[Tier, float]
    #: As-fitted, unclamped — what the OLS regression actually returned.
    beta_raw: dict[Tier, float]
    alpha: float
    n_obs: int
    r_squared: float
    residuals: dict[str, float] = field(default_factory=dict)


def tier_weights(row: SpellFeatures, *, boss_weighted: bool = False) -> dict[Tier, float]:
    w: dict[Tier, float] = {Tier.T1: 0.0, Tier.T2: 0.0, Tier.T3: 0.0, Tier.T4: 0.0}
    for ci in row.condition_instances:
        if ci.tier is None:
            continue
        tier = Tier(ci.tier)
        duration = DurationClass(ci.duration)
        w[tier] += instance_weight(ci.condition, ci.degree, duration, boss_weighted=boss_weighted)
    return w


def fit_stage_a(trainers: list[SpellFeatures], ladder: LadderFit, *, structural_fn) -> StageAFit:
    """Stage A (D30-3): OLS WITH an intercept, in log-discount space, on the
    hybrid trainer population. ``z_i = log EV_i - log Budget(r_i) -
    log structural_i = α - Σ_t β_t w_i,t + ε_i`` — fit z on (w_T1,w_T2,w_T3)
    with an intercept; β_t = -(fitted coefficient on w_t). T4 is excluded
    from the design (declared prior, not fit — too few trainers, D30-5)."""
    tiers = (Tier.T1, Tier.T2, Tier.T3)
    x_rows = []
    z_rows = []
    names = []
    for r in trainers:
        budget = ladder.budget(r.rank)
        structural = structural_fn(r)
        w = tier_weights(r)
        z = math.log(r.ev) - math.log(budget) - math.log(structural)
        x_rows.append([1.0, *[w[t] for t in tiers]])
        z_rows.append(z)
        names.append(r.name)

    x = np.array(x_rows, dtype=float)
    z = np.array(z_rows, dtype=float)
    coef, _res, _rk, _sv = np.linalg.lstsq(x, z, rcond=None)
    fitted = x @ coef
    resid = z - fitted
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((z - z.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")

    alpha = float(coef[0])
    beta_raw = {t: -float(coef[i + 1]) for i, t in enumerate(tiers)}
    beta_raw[Tier.T4] = BETA_T4_PRIOR
    beta = {t: max(0.0, v) for t, v in beta_raw.items()}

    return StageAFit(
        beta=beta,
        beta_raw=beta_raw,
        alpha=alpha,
        n_obs=len(trainers),
        r_squared=r_squared,
        residuals=dict(zip(names, (float(v) for v in resid), strict=True)),
    )


def stage_b_power_fraction(
    row: SpellFeatures, stage_a: StageAFit, *, boss_weighted: bool = False
) -> float:
    """p = 1 - exp(-Σ_t β_t · w_t) — the exp link keeps stacked riders from
    pricing past 100% of budget (D30-3)."""
    w = tier_weights(row, boss_weighted=boss_weighted)
    total = sum(stage_a.beta[t] * w[t] for t in w)
    return 1.0 - math.exp(-total)


def score_condition_control(
    row: SpellFeatures,
    ladder: LadderFit | CantripLadderFit,
    stage_a: StageAFit,
    *,
    boss_weighted: bool = False,
) -> float:
    """A condition-only control spell's score (Stage B applied): p * Budget *
    structural (target/range/action)."""
    p = stage_b_power_fraction(row, stage_a, boss_weighted=boss_weighted)
    budget = ladder.budget(row.rank) if isinstance(ladder, LadderFit) else ladder.budget()
    structural = ladder.structural_target_range(row) * action_multiplier(row.action_bucket)
    return p * budget * structural


def score_damage_row(row: SpellFeatures, ladder: LadderFit | CantripLadderFit) -> float:
    """A pure/hybrid/recovered-damage row's own EV is the score directly (its
    rank-equivalent is read off the ladder against its OWN structural
    multipliers) — Stage A already validates that a hybrid's EV naturally
    discounts below pure budget by the priced tier weight; this is not
    double-applied here."""
    return row.ev
