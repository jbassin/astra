"""Hybrid deliverable (design doc §3 "Outputs") — point tables, ledger, validation.

Three human-usable outputs from a fitted model:

1. **Damage-budget-by-rank table** — ``exp(μ_r)`` rounded to a dice-friendly
   average (nearest half).
2. **Facet multiplier table** — ``exp(coef)`` rounded to a clean fraction
   (nearest eighth) — the point card for designing a homebrew spell.
3. **Per-spell power ledger** — every fit spell's EV, predicted budget, and
   residual in rank-equivalents (residual ÷ the fitted ladder's average
   per-rank slope).

Plus the four V1–V4 validation gates (design doc §3), each computed against
the real fit — not asserted, reported with real numbers.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .extract import SpellFeatures
from .model import FitResult, predict_log_ev

#: Community anchor: 2-action AoE basic-save ≈ 2d6/rank (avg ≈ 7×rank) — §2.
COMMUNITY_RANK_MULTIPLIER = 7.0

#: GM Core Building Creatures Damage-Dealing Abilities pins (§2), converted via
#: the rank↔creature-level bridge (top castable rank r ↔ level 2r−1): level-1
#: limited-use average (2d6=7) and level-5 limited-use average (6d6=21).
GM_CORE_ANCHORS = {1: 7.0, 3: 21.0}

#: §3 V3 — community strong/weak outlier names that ARE damage spells in the
#: main-slot corpus, checked against fit-population residual sign.
KNOWN_STRONG = ("Force Barrage", "Fireball")
KNOWN_WEAK = ("Admonishing Ray", "Disintegrate", "Hydraulic Push")
KNOWN_STRONG_CANTRIP = ("Electric Arc",)
KNOWN_WEAK_CANTRIP = ("Acid Splash",)


def round_half(x: float) -> float:
    return round(x * 2) / 2


def round_clean_fraction(x: float) -> float:
    """Nearest eighth — reads as a "clean" multiplier (×1.25, ×0.75, …)."""
    return round(x * 8) / 8


@dataclass
class RankLadderRow:
    rank: int
    fitted_ev: float
    rounded_budget: float
    community_7x_rank: float
    gm_core_anchor: float | None


def rank_ladder_table(fit: FitResult) -> list[RankLadderRow]:
    rows = []
    for name, coef in sorted(fit.coefficients.items()):
        if not name.startswith("rank=r"):
            continue
        rank = int(name.removeprefix("rank=r"))
        fitted_ev = math.exp(coef)
        rows.append(
            RankLadderRow(
                rank=rank,
                fitted_ev=fitted_ev,
                rounded_budget=round_half(fitted_ev),
                community_7x_rank=COMMUNITY_RANK_MULTIPLIER * rank,
                gm_core_anchor=GM_CORE_ANCHORS.get(rank),
            )
        )
    return sorted(rows, key=lambda r: r.rank)


@dataclass
class FacetRow:
    name: str
    multiplier: float
    rounded: float


def facet_multiplier_table(fit: FitResult) -> list[FacetRow]:
    rows = []
    for name, coef in fit.coefficients.items():
        if name.startswith("rank=r") or name == "intercept":
            continue
        mult = math.exp(coef)
        rows.append(FacetRow(name=name, multiplier=mult, rounded=round_clean_fraction(mult)))
    return sorted(rows, key=lambda r: r.name)


@dataclass
class LedgerRow:
    name: str
    rank: int
    ev: float
    predicted_ev: float
    residual_log: float
    residual_rank_equiv: float


def rank_equivalent_residuals(fit: FitResult) -> dict[str, float]:
    """Residual ÷ the LOCAL rank-ladder slope at that spell's own rank (design doc
    §3) — falls back to the global average slope for a rank with no local slope
    (e.g. the cantrip fit has no ladder at all), or 0.0 if neither is available."""
    out: dict[str, float] = {}
    for name, r in fit.residuals.items():
        rank = fit.spell_rank.get(name)
        slope = fit.rank_slopes.get(rank) if rank is not None else None
        if not slope:
            slope = fit.rank_slope
        out[name] = r / slope if slope else 0.0
    return out


def power_ledger(fit: FitResult) -> list[LedgerRow]:
    """Sorted hottest->coldest. When the fit has no rank ladder (the cantrip fit,
    where ``rank_slopes`` is empty and the global ``rank_slope`` is 0 — there's
    nothing to divide by), ``residual_rank_equiv`` falls back to the raw
    log(EV) residual instead of a meaningless constant 0.0 for every row."""
    req = (
        fit.residuals
        if not fit.rank_slopes and not fit.rank_slope
        else rank_equivalent_residuals(fit)
    )
    rows = [
        LedgerRow(
            name=name,
            rank=fit.spell_rank[name],
            ev=math.exp(fit.actual[name]),
            predicted_ev=math.exp(fit.fitted[name]),
            residual_log=fit.residuals[name],
            residual_rank_equiv=req[name],
        )
        for name in fit.residuals
    ]
    return sorted(rows, key=lambda r: r.residual_rank_equiv, reverse=True)


# ---------------------------------------------------------------------------
# Validation gates V1-V4
# ---------------------------------------------------------------------------


@dataclass
class V1Result:
    n: int
    share_within_third_rank: float
    p10_rank_equiv: float
    p90_rank_equiv: float
    passed: bool  # ≥0.80 of the middle 80% within ±1/3 rank, per the design doc target


def validate_v1_clustering(fit: FitResult) -> V1Result:
    req = rank_equivalent_residuals(fit)
    values = sorted(req.values())
    n = len(values)
    if n == 0:
        return V1Result(
            n=0,
            share_within_third_rank=float("nan"),
            p10_rank_equiv=0,
            p90_rank_equiv=0,
            passed=False,
        )
    p10 = values[max(0, int(0.10 * n))]
    p90 = values[min(n - 1, int(0.90 * n))]
    within = sum(1 for v in values if abs(v) <= 1 / 3) / n
    return V1Result(
        n=n,
        share_within_third_rank=within,
        p10_rank_equiv=p10,
        p90_rank_equiv=p90,
        passed=within >= 0.80,
    )


@dataclass
class V2Projection:
    name: str
    base_rank: int
    target_rank: int
    projected_ev: float
    predicted_ev: float
    residual_rank_equiv: float


@dataclass
class V2Result:
    projections: list[V2Projection]
    mean_abs_residual_rank_equiv: float
    fireball_projection: V2Projection | None


def validate_v2_heighten(
    rows: list[SpellFeatures], fit: FitResult, *, max_rank: int = 10
) -> V2Result:
    projections: list[V2Projection] = []
    rank_present = {int(c.removeprefix("rank=r")) for c in fit.columns if c.startswith("rank=r")}
    for row in rows:
        if row.heightening_interval is None or row.heightening_delta_ev is None:
            continue
        for k in (1, 2, 3):
            target_rank = row.rank + k * row.heightening_interval
            if target_rank > max_rank or target_rank not in rank_present:
                continue
            projected_ev = row.ev + k * row.heightening_delta_ev
            if projected_ev <= 0:
                continue
            projected_row = row.model_copy(update={"rank": target_rank})
            predicted_log = predict_log_ev(projected_row, fit, include_rank_ladder=True)
            residual = math.log(projected_ev) - predicted_log
            local_slope = fit.rank_slopes.get(target_rank) or fit.rank_slope
            residual_rank_equiv = residual / local_slope if local_slope else 0.0
            projections.append(
                V2Projection(
                    name=row.name,
                    base_rank=row.rank,
                    target_rank=target_rank,
                    projected_ev=projected_ev,
                    predicted_ev=math.exp(predicted_log),
                    residual_rank_equiv=residual_rank_equiv,
                )
            )
    mean_abs = (
        sum(abs(p.residual_rank_equiv) for p in projections) / len(projections)
        if projections
        else float("nan")
    )
    fireball = next((p for p in projections if p.name == "Fireball" and p.target_rank == 4), None)
    return V2Result(
        projections=projections, mean_abs_residual_rank_equiv=mean_abs, fireball_projection=fireball
    )


@dataclass
class V3Check:
    name: str
    expected: str  # "strong" | "weak"
    found: bool
    residual_rank_equiv: float | None
    correct_side: bool | None


@dataclass
class V3Result:
    checks: list[V3Check]
    all_correct: bool


def validate_v3_outliers(
    fit: FitResult,
    *,
    strong: tuple[str, ...],
    weak: tuple[str, ...],
    use_raw_residual: bool = False,
) -> V3Result:
    """``use_raw_residual=True`` for a fit with no rank ladder (the cantrip fit) —
    ``rank_equivalent_residuals`` divides by a rank slope that doesn't exist there
    (always 0), so the sign check must fall back to the raw log-EV residual."""
    req = fit.residuals if use_raw_residual else rank_equivalent_residuals(fit)
    checks: list[V3Check] = []
    for name in strong:
        found = name in req
        r = req.get(name)
        checks.append(
            V3Check(
                name=name,
                expected="strong",
                found=found,
                residual_rank_equiv=r,
                correct_side=(r > 0) if r is not None else None,
            )
        )
    for name in weak:
        found = name in req
        r = req.get(name)
        checks.append(
            V3Check(
                name=name,
                expected="weak",
                found=found,
                residual_rank_equiv=r,
                correct_side=(r < 0) if r is not None else None,
            )
        )
    all_correct = all(c.correct_side for c in checks if c.correct_side is not None) and any(
        c.found for c in checks
    )
    return V3Result(checks=checks, all_correct=all_correct)


@dataclass
class V4Row:
    rank: int
    fitted_ev: float
    community_7x: float
    gm_core: float | None
    delta_vs_community_pct: float


def validate_v4_anchors(fit: FitResult) -> list[V4Row]:
    rows = []
    for r in rank_ladder_table(fit):
        delta_pct = (
            (r.fitted_ev - r.community_7x_rank) / r.community_7x_rank * 100
            if r.community_7x_rank
            else 0.0
        )
        rows.append(
            V4Row(
                rank=r.rank,
                fitted_ev=r.fitted_ev,
                community_7x=r.community_7x_rank,
                gm_core=r.gm_core_anchor,
                delta_vs_community_pct=delta_pct,
            )
        )
    return rows
