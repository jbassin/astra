"""The log-linear rank+facet budget fit (design doc §3) — pure numpy OLS.

Response: ``log(EV)``. Predictors: a full-rank dummy per spell rank (no global
intercept — the rank dummies themselves are the "intercept per rank", so the
fitted ladder is read directly off the coefficients, no functional form
imposed) plus reference-cell (drop-one) dummies for every other categorical
facet, plus numeric/boolean riders. Cantrip fits use the same builder with
``include_rank_ladder=False`` (a single global intercept instead — cantrips are
all rank 1, so a rank ladder is meaningless; see the design doc's "separate
curve" instruction).

numpy is intentionally isolated to this module (repo convention for a new,
unstubbed-preview-``ty`` dependency) — no other assay module imports it.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from math import log

import numpy as np

from .extract import SpellFeatures

#: Reference (dropped/baseline) level for each drop-one categorical predictor —
#: the coefficient table reads as "vs. this baseline".
REFERENCE_TARGETING_CLASS = "aoe-save"
REFERENCE_ACTION_BUCKET = "2"
REFERENCE_AREA_TYPE = "none"
REFERENCE_RANGE_BUCKET = "touch-self"
REFERENCE_DAMAGE_TYPE_CLASS = "common"

#: area.type values collapsed into "other" — square/cube are too rare (≤3 rows
#: each in the fit population) to carry their own coefficient without a singular
#: design matrix; recorded here rather than silently dropped.
_COMMON_AREA_TYPES = frozenset({"burst", "emanation", "cone", "line", "cylinder"})


@dataclass
class DesignMatrix:
    x: np.ndarray
    y: np.ndarray
    columns: list[str]
    spell_names: list[str]
    spell_ranks: list[int]


@dataclass
class FitResult:
    coefficients: dict[str, float]
    columns: list[str]
    residuals: dict[str, float]  # spell name -> log-scale residual (actual - predicted)
    fitted: dict[str, float]  # spell name -> predicted log(EV)
    actual: dict[str, float]  # spell name -> actual log(EV)
    spell_rank: dict[str, int]
    r_squared: float
    n_obs: int
    n_params: int
    #: average per-rank Δlog(EV) across the whole ladder — a fallback divisor when a
    #: spell's own rank has no local slope (e.g. the cantrip fit, which has no ladder).
    rank_slope: float = field(default=0.0)
    #: LOCAL per-rank Δlog(EV) — rank -> slope, centered on that rank (average of the
    #: deltas to its neighbors; a one-sided delta at the ladder's ends). This is what
    #: the design doc means by "the local rank-ladder slope" for rank-equivalents —
    #: a single global average badly distorts the ends of a sub-linear-in-log ladder.
    rank_slopes: dict[int, float] = field(default_factory=dict)


def _area_bucket(area_type: str | None) -> str:
    if area_type is None:
        return "none"
    return area_type if area_type in _COMMON_AREA_TYPES else "other"


def _onehot(
    values: Sequence[str], prefix: str, reference: str | None
) -> tuple[list[str], list[list[float]]]:
    """Drop-one (reference-cell) one-hot columns; ``reference=None`` keeps every level."""
    levels = sorted(set(values))
    kept = [lv for lv in levels if lv != reference] if reference is not None else levels
    names = [f"{prefix}={lv}" for lv in kept]
    cols = [[1.0 if v == lv else 0.0 for v in values] for lv in kept]
    return names, cols


def build_design_matrix(rows: list[SpellFeatures], *, include_rank_ladder: bool) -> DesignMatrix:
    """Assemble the log-linear design matrix for the given fit population."""
    y = np.array([log(r.ev) for r in rows], dtype=float)
    spell_names = [r.name for r in rows]
    spell_ranks = [r.rank for r in rows]

    columns: list[str] = []
    col_vectors: list[list[float]] = []

    if include_rank_ladder:
        rank_names, rank_cols = _onehot([f"r{r.rank}" for r in rows], "rank", reference=None)
        columns += rank_names
        col_vectors += rank_cols
    else:
        columns.append("intercept")
        col_vectors.append([1.0] * len(rows))

    tgt_names, tgt_cols = _onehot(
        [r.targeting_class.value for r in rows], "targeting", REFERENCE_TARGETING_CLASS
    )
    columns += tgt_names
    col_vectors += tgt_cols

    action_names, action_cols = _onehot(
        [r.action_bucket.value for r in rows], "action", REFERENCE_ACTION_BUCKET
    )
    columns += action_names
    col_vectors += action_cols

    columns.append("log_area_ft")
    col_vectors.append([log(r.area_value_ft + 1.0) for r in rows])  # +1 so area=0 -> log=0

    area_names, area_cols = _onehot(
        [_area_bucket(r.area_type) for r in rows], "area_type", REFERENCE_AREA_TYPE
    )
    columns += area_names
    col_vectors += area_cols

    range_names, range_cols = _onehot(
        [r.range_bucket.value for r in rows], "range", REFERENCE_RANGE_BUCKET
    )
    columns += range_names
    col_vectors += range_cols

    dtype_names, dtype_cols = _onehot(
        [r.damage_type_class.value for r in rows], "damage_type", REFERENCE_DAMAGE_TYPE_CLASS
    )
    columns += dtype_names
    col_vectors += dtype_cols

    for name, getter in (
        ("basic_save", lambda r: r.save_basic),
        ("condition_ref", lambda r: r.condition_ref),
        ("has_persistent", lambda r: r.has_persistent),
        ("sustained", lambda r: r.sustained),
        ("has_duration", lambda r: r.has_duration),
        ("incapacitation", lambda r: r.incapacitation),
        ("defense_passive", lambda r: r.defense_passive),
        ("rarity_flag", lambda r: r.rarity_flag),
    ):
        columns.append(name)
        col_vectors.append([1.0 if getter(r) else 0.0 for r in rows])

    x = np.array(col_vectors, dtype=float).T
    return DesignMatrix(x=x, y=y, columns=columns, spell_names=spell_names, spell_ranks=spell_ranks)


def fit_ols(dm: DesignMatrix) -> FitResult:
    """Ordinary least squares via ``numpy.linalg.lstsq`` — no sklearn, per the design doc."""
    beta, _residuals, _rank, _sv = np.linalg.lstsq(dm.x, dm.y, rcond=None)
    fitted = dm.x @ beta
    resid = dm.y - fitted

    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((dm.y - dm.y.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")

    coefficients = dict(zip(dm.columns, (float(b) for b in beta), strict=True))

    # rank_slope / rank_slopes: Δ log(EV) per +1 rank across adjacent fitted rank
    # dummies (only meaningful when a rank ladder was fit) — the "rank-equivalent"
    # divisor. The ladder is NOT log-linear (community anchor is 7×rank, i.e. linear
    # in raw EV), so a single global average badly distorts the ends of the ladder —
    # each rank gets its own LOCAL slope (centered on its neighbors), per the design
    # doc's "residual ÷ the local rank-ladder slope".
    rank_coefs = {
        int(name.removeprefix("rank=r")): coefficients[name]
        for name in dm.columns
        if name.startswith("rank=r")
    }
    rank_slope = 0.0
    rank_slopes: dict[int, float] = {}
    if len(rank_coefs) >= 2:
        ranks_sorted = sorted(rank_coefs)
        deltas = [
            rank_coefs[b] - rank_coefs[a]
            for a, b in zip(ranks_sorted[:-1], ranks_sorted[1:], strict=True)
        ]
        rank_slope = sum(deltas) / len(deltas)
        for i, r in enumerate(ranks_sorted):
            if i == 0:
                rank_slopes[r] = deltas[0]
            elif i == len(ranks_sorted) - 1:
                rank_slopes[r] = deltas[-1]
            else:
                rank_slopes[r] = (deltas[i - 1] + deltas[i]) / 2

    return FitResult(
        coefficients=coefficients,
        columns=dm.columns,
        residuals=dict(zip(dm.spell_names, (float(v) for v in resid), strict=True)),
        fitted=dict(zip(dm.spell_names, (float(v) for v in fitted), strict=True)),
        actual=dict(zip(dm.spell_names, (float(v) for v in dm.y), strict=True)),
        spell_rank=dict(zip(dm.spell_names, dm.spell_ranks, strict=True)),
        r_squared=r_squared,
        n_obs=dm.x.shape[0],
        n_params=dm.x.shape[1],
        rank_slope=rank_slope,
        rank_slopes=rank_slopes,
    )


def predict_log_ev(features: SpellFeatures, fit: FitResult, *, include_rank_ladder: bool) -> float:
    """Score one spell's features against a fitted model → predicted log(EV)."""
    total = 0.0
    if include_rank_ladder:
        total += fit.coefficients.get(f"rank=r{features.rank}", 0.0)
    else:
        total += fit.coefficients.get("intercept", 0.0)

    tgt = features.targeting_class.value
    if tgt != REFERENCE_TARGETING_CLASS:
        total += fit.coefficients.get(f"targeting={tgt}", 0.0)

    action = features.action_bucket.value
    if action != REFERENCE_ACTION_BUCKET:
        total += fit.coefficients.get(f"action={action}", 0.0)

    total += fit.coefficients.get("log_area_ft", 0.0) * log(features.area_value_ft + 1.0)

    area = _area_bucket(features.area_type)
    if area != REFERENCE_AREA_TYPE:
        total += fit.coefficients.get(f"area_type={area}", 0.0)

    rng = features.range_bucket.value
    if rng != REFERENCE_RANGE_BUCKET:
        total += fit.coefficients.get(f"range={rng}", 0.0)

    dtype = features.damage_type_class.value
    if dtype != REFERENCE_DAMAGE_TYPE_CLASS:
        total += fit.coefficients.get(f"damage_type={dtype}", 0.0)

    for name, flag in (
        ("basic_save", features.save_basic),
        ("condition_ref", features.condition_ref),
        ("has_persistent", features.has_persistent),
        ("sustained", features.sustained),
        ("has_duration", features.has_duration),
        ("incapacitation", features.incapacitation),
        ("defense_passive", features.defense_passive),
        ("rarity_flag", features.rarity_flag),
    ):
        if flag:
            total += fit.coefficients.get(name, 0.0)

    return total
