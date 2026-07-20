"""Round-2 results generation (spec 0030 D30-9, D30-10) — full-population
scoring, the condition price card, and the V1'-V4' validation gates, all
computed against the real extracted corpus (no asserted numbers).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

from . import comparables as comparables_mod
from . import ledger as ledger_mod
from . import pricing
from .conditions import Tier, within_tier_offset
from .extract import SkipRecord, SpellFeatures

# ---------------------------------------------------------------------------
# Full-population scoring
# ---------------------------------------------------------------------------


@dataclass
class ScoredRow:
    name: str
    rank: int
    is_cantrip: bool
    kind: str  # pure-damage | hybrid-damage | recovered-damage | healing | condition-control
    ev_or_score: float
    rank_equivalent: float | None
    residual_rank_equiv: float | None
    boss_weighted_score: float | None = None
    boss_weighted_rank_equivalent: float | None = None
    is_incapacitation: bool = False


@dataclass
class Population:
    scored: list[ScoredRow]
    ledger: dict[str, int]  # typed reason -> count
    ledger_examples: dict[str, list[str]]  # typed reason -> a few example names


def _damage_row_kind(row: SpellFeatures) -> str:
    if row.is_healing:
        return "healing"
    if row.recovery_path is not None:
        return "recovered-damage"
    if row.condition_ref:
        return "hybrid-damage"
    return "pure-damage"


def score_population(
    rows: list[SpellFeatures],
    skipped: list[SkipRecord],
    spells_dir: Path,
    ladder: pricing.LadderFit,
    cantrip_ladder: pricing.CantripLadderFit,
    stage_a: pricing.StageAFit,
) -> Population:
    scored: list[ScoredRow] = []
    ledger_counts: dict[str, int] = {}
    ledger_examples: dict[str, list[str]] = {}

    def _bump(reason: str, name: str) -> None:
        ledger_counts[reason] = ledger_counts.get(reason, 0) + 1
        ex = ledger_examples.setdefault(reason, [])
        if len(ex) < 8:
            ex.append(name)

    for row in rows:
        reason = ledger_mod.classify_row(row)
        if reason is not None:
            _bump(reason, row.name)
            continue

        cantrip = row.is_cantrip
        has_damage = row.ev > 0.0
        if has_damage:
            structural = (
                cantrip_ladder.structural_target_range(row)
                if cantrip
                else ladder.structural_target_range(row)
            ) * pricing.action_multiplier(row.action_bucket)
            normalized_ev = row.ev / structural if structural else row.ev
            if cantrip:
                budget = cantrip_ladder.budget() * structural
                rank_equiv = None  # cantrips scale by character level, not spell rank
                residual = math.log(row.ev) - math.log(budget) if budget > 0 else None
            else:
                budget = ladder.budget(row.rank) * structural
                rank_equiv = pricing.rank_equivalent(normalized_ev, ladder)
                residual = rank_equiv - row.rank if not math.isnan(rank_equiv) else None
            scored.append(
                ScoredRow(
                    name=row.name,
                    rank=row.rank,
                    is_cantrip=cantrip,
                    kind=_damage_row_kind(row),
                    ev_or_score=row.ev,
                    rank_equivalent=rank_equiv,
                    residual_rank_equiv=residual,
                )
            )
            continue

        # condition-only control spell (Stage B)
        active_ladder = cantrip_ladder if cantrip else ladder
        score = pricing.score_condition_control(row, active_ladder, stage_a)
        if cantrip:
            rank_equiv = None
            budget = cantrip_ladder.budget()
            residual = math.log(score) - math.log(budget) if score > 0 and budget > 0 else None
        else:
            rank_equiv = pricing.rank_equivalent(score, ladder) if score > 0 else float("nan")
            residual = (
                rank_equiv - row.rank
                if rank_equiv is not None and not math.isnan(rank_equiv)
                else None
            )
        boss_score = None
        boss_rank_equiv = None
        if row.incapacitation and not cantrip:
            boss_score = pricing.score_condition_control(
                row, active_ladder, stage_a, boss_weighted=True
            )
            boss_rank_equiv = (
                pricing.rank_equivalent(boss_score, ladder) if boss_score > 0 else None
            )
        scored.append(
            ScoredRow(
                name=row.name,
                rank=row.rank,
                is_cantrip=cantrip,
                kind="condition-control",
                ev_or_score=score,
                rank_equivalent=rank_equiv,
                residual_rank_equiv=residual,
                boss_weighted_score=boss_score,
                boss_weighted_rank_equivalent=boss_rank_equiv,
                is_incapacitation=row.incapacitation,
            )
        )

    skip_reasons = ledger_mod.classify_skips(skipped, spells_dir)
    for s in skipped:
        reason = skip_reasons.get(f"{s.file}::{s.name}", s.reason)
        _bump(reason, s.name)

    return Population(scored=scored, ledger=ledger_counts, ledger_examples=ledger_examples)


# ---------------------------------------------------------------------------
# Condition price card (D30-10)
# ---------------------------------------------------------------------------


@dataclass
class ConditionPriceRow:
    condition: str
    tier: Tier
    within_tier_offset: float
    sample_weight_failure_only_round: float  # a representative w at failure-only, ~round duration
    budget_fraction: float  # p at that representative w
    rank_equivalent_at_rank5: float  # that p * Budget(5), reported as a rank-5 anchor example


def condition_price_card(
    stage_a: pricing.StageAFit, ladder: pricing.LadderFit
) -> list[ConditionPriceRow]:
    from .conditions import _FLAT_TIER, _VALUED_TIER, DurationClass  # noqa: PLC0415

    rows: list[ConditionPriceRow] = []
    seen: set[str] = set()
    for name, tier in _FLAT_TIER.items():
        seen.add(name)
        w = pricing.instance_weight(name, "failure", DurationClass.ROUND)
        p = 1.0 - math.exp(-stage_a.beta[tier] * w)
        rows.append(
            ConditionPriceRow(
                condition=name,
                tier=tier,
                within_tier_offset=within_tier_offset(name),
                sample_weight_failure_only_round=w,
                budget_fraction=p,
                rank_equivalent_at_rank5=p * ladder.budget(5),
            )
        )
    for name, thresholds in _VALUED_TIER.items():
        for value, tier in thresholds:
            label = f"{name} {value}"
            seen.add(label)
            w = pricing.instance_weight(name, "failure", DurationClass.ROUND)
            p = 1.0 - math.exp(-stage_a.beta[tier] * w)
            rows.append(
                ConditionPriceRow(
                    condition=label,
                    tier=tier,
                    within_tier_offset=within_tier_offset(name),
                    sample_weight_failure_only_round=w,
                    budget_fraction=p,
                    rank_equivalent_at_rank5=p * ladder.budget(5),
                )
            )
    return sorted(rows, key=lambda r: (r.tier.value, -r.budget_fraction))


# ---------------------------------------------------------------------------
# Validation gates V1'-V4'
# ---------------------------------------------------------------------------


@dataclass
class V1PrimeResult:
    subpop: str
    n: int
    share_within_half_rank: float
    p10: float
    p90: float


def validate_v1_prime(scored: list[ScoredRow]) -> list[V1PrimeResult]:
    out = []
    groups = {
        "pure": [s for s in scored if s.kind == "pure-damage" and not s.is_cantrip],
        "hybrid": [
            s
            for s in scored
            if s.kind in ("hybrid-damage", "recovered-damage") and not s.is_cantrip
        ],
        "control": [s for s in scored if s.kind == "condition-control" and not s.is_cantrip],
        "all-non-cantrip": [
            s for s in scored if not s.is_cantrip and s.residual_rank_equiv is not None
        ],
    }
    for label, rows in groups.items():
        vals = sorted(r.residual_rank_equiv for r in rows if r.residual_rank_equiv is not None)
        n = len(vals)
        if n == 0:
            out.append(V1PrimeResult(label, 0, float("nan"), 0.0, 0.0))
            continue
        p10 = vals[max(0, int(0.10 * n))]
        p90 = vals[min(n - 1, int(0.90 * n))]
        within = sum(1 for v in vals if abs(v) <= 0.5) / n
        out.append(V1PrimeResult(label, n, within, p10, p90))
    return out


@dataclass
class V2PrimeProjection:
    name: str
    base_rank: int
    target_rank: int
    projected_ev: float
    predicted_ev: float
    residual_rank_equiv: float


def validate_v2_prime(
    rows: list[SpellFeatures], ladder: pricing.LadderFit
) -> tuple[list[V2PrimeProjection], float, V2PrimeProjection | None]:
    projections: list[V2PrimeProjection] = []
    for row in rows:
        if row.heightening_interval is None or row.heightening_delta_ev is None:
            continue
        if row.is_cantrip or row.is_variant:
            continue
        structural = ladder.structural_target_range(row) * pricing.action_multiplier(
            row.action_bucket
        )
        for k in (1, 2, 3):
            target_rank = row.rank + k * row.heightening_interval
            if target_rank > 10:
                continue
            projected_ev = row.ev + k * row.heightening_delta_ev
            if projected_ev <= 0:
                continue
            predicted = ladder.budget(target_rank) * structural
            residual_rank_equiv = (
                pricing.rank_equivalent(projected_ev / structural, ladder) - target_rank
            )
            projections.append(
                V2PrimeProjection(
                    row.name, row.rank, target_rank, projected_ev, predicted, residual_rank_equiv
                )
            )
    mean_abs = (
        sum(abs(p.residual_rank_equiv) for p in projections) / len(projections)
        if projections
        else float("nan")
    )
    fireball = next((p for p in projections if p.name == "Fireball" and p.target_rank == 4), None)
    return projections, mean_abs, fireball


@dataclass
class V3PrimeCheck:
    name: str
    expected: str
    status: str  # "scored" | "ledgered-expected" | "ledgered-unexpected"
    residual_rank_equiv: float | None
    correct_side: bool


V3_STRONG = ("Fear", "Command", "Slow", "Synesthesia", "Force Barrage", "Heal")
V3_WEAK = (
    "Acid Splash",
    "Admonishing Ray",
    "Flense",
    "Hydraulic Push",
    "Dizzying Colors",
    "Disintegrate",
)
#: Command's expected outcome IS the ledger (preamble-options exclusion, the
#: review's flagship negative case) — an asserted absence, like sure
#: strike/shadow siphon/walls (V3' spec text).
V3_EXPECTED_LEDGERED = frozenset({"Command"})


def validate_v3_prime(scored: list[ScoredRow]) -> tuple[list[V3PrimeCheck], float]:
    checks: list[V3PrimeCheck] = []
    for name in V3_STRONG:
        matches = [s for s in scored if s.name.split(" (")[0] == name]
        if not matches:
            expected_ledgered = name in V3_EXPECTED_LEDGERED
            checks.append(
                V3PrimeCheck(
                    name,
                    "strong",
                    "ledgered-expected" if expected_ledgered else "ledgered-unexpected",
                    None,
                    expected_ledgered,
                )
            )
            continue
        best = max(
            matches,
            key=lambda s: s.residual_rank_equiv if s.residual_rank_equiv is not None else -999,
        )
        r = best.residual_rank_equiv
        correct = (r is not None and r > 0) if r is not None else False
        checks.append(V3PrimeCheck(name, "strong", "scored", r, correct))
    for name in V3_WEAK:
        matches = [s for s in scored if s.name.split(" (")[0] == name]
        if not matches:
            checks.append(V3PrimeCheck(name, "weak", "ledgered-unexpected", None, False))
            continue
        best = min(
            matches,
            key=lambda s: s.residual_rank_equiv if s.residual_rank_equiv is not None else 999,
        )
        r = best.residual_rank_equiv
        correct = (r is not None and r < 0) if r is not None else False
        checks.append(V3PrimeCheck(name, "weak", "scored", r, correct))

    n_evaluable = len(checks)
    n_correct = sum(1 for c in checks if c.correct_side)
    share = n_correct / n_evaluable if n_evaluable else float("nan")
    return checks, share


@dataclass
class V4PrimeRow:
    rank: int
    budget: float
    community_7x: float
    gm_core: float | None
    delta_pct: float


GM_CORE_ANCHORS = {1: 7.0, 3: 21.0}


def validate_v4_prime(ladder: pricing.LadderFit) -> list[V4PrimeRow]:
    out = []
    for r in range(1, 11):
        b = ladder.budget(r)
        community = 7.0 * r
        delta = (b - community) / community * 100 if community else 0.0
        out.append(V4PrimeRow(r, b, community, GM_CORE_ANCHORS.get(r), delta))
    return out


# ---------------------------------------------------------------------------
# Round 3 — V-A comparables leave-one-out gate (spec 0030 D30-25)
# ---------------------------------------------------------------------------

#: The V-A enumerated roster (spec D30-25's own list, official spell names).
ROSTER_V_A: tuple[str, ...] = (
    "Fear",
    "Slow",
    "Synesthesia",
    "Paralyze",
    "Confusion",
    "Blindness",
    "Overwhelming Presence",
    "Synaptic Pulse",
    "Dizzying Colors",
    "Stupefy",
)


@dataclass
class VALooResult:
    name: str
    own_rank: int | None
    neighbor_ranks: list[int] = field(default_factory=list)
    neighbor_names: list[str] = field(default_factory=list)
    median_neighbor_rank: float | None = None
    within_one: bool = False
    note: str = ""


def validate_v_a_loo(
    roster: tuple[str, ...], corpus: list[comparables_mod.ComparableProfile]
) -> tuple[list[VALooResult], float]:
    """D30-25 V-A: for each roster spell, its OWN corpus row is excluded
    (leave-one-out) before computing its top-5 comparables; PASS iff the
    top-5's median rank sits within ±1 of the spell's own rank. Target:
    ≥70% of the roster passes."""
    by_name = {p.name: p for p in corpus}
    results: list[VALooResult] = []
    for name in roster:
        target = by_name.get(name)
        if target is None:
            results.append(VALooResult(name, None, note="not found in the comparables corpus"))
            continue
        res = comparables_mod.comparables_for(target, corpus, k=5, exclude_name=name)
        if not res.matches:
            results.append(VALooResult(name, target.rank, note="no comparables returned"))
            continue
        within = abs(res.rank_median - target.rank) <= 1.0
        results.append(
            VALooResult(
                name=name,
                own_rank=target.rank,
                neighbor_ranks=[m.rank for m in res.matches],
                neighbor_names=[m.name for m in res.matches],
                median_neighbor_rank=res.rank_median,
                within_one=within,
            )
        )
    n_pass = sum(1 for r in results if r.within_one)
    share = n_pass / len(results) if results else float("nan")
    return results, share
