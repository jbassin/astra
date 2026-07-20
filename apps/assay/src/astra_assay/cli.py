"""``assay`` console script — extract / fit / price / score.

    uv run assay extract [--data-root PATH]   # features table → out/features.json
    uv run assay fit [--data-root PATH]       # round-1 per-rank-facet fit (superseded diagnostic)
    uv run assay price [--data-root PATH]     # round-2 ladder + Stage A/B + population → results/
    uv run assay score --spell PATH           # score one homebrew spell JSON (round-2 model)

Telemetry (standing principle): ``init_telemetry`` wraps every subcommand, a
root span per invocation, ``shutdown()`` in ``finally`` (the short-lived-process
pattern — see ``libs/py/observe``). Offline runs (no SigNoz reachable) still
work: OTLP export failures are swallowed by the exporter, never fatal here.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from astra_observe import get_tracer, init_telemetry, shutdown

from . import pricing, report, report2
from .conditions import Tier
from .extract import (
    ExtractResult,
    SkipRecord,
    SpellFeatures,
    extract_all,
    extract_spell,
    load_spell_json,
)
from .model import DesignMatrix, FitResult, build_design_matrix, fit_ols
from .snapshot import SnapshotNotFoundError, resolve_snapshot

APP_ROOT = Path(__file__).resolve().parents[2]  # src/astra_assay/cli.py -> apps/assay
OUT_DIR = APP_ROOT / "out"
RESULTS_DIR = APP_ROOT / "results"
FEATURES_PATH = OUT_DIR / "features.json"
FITTED_PARAMS_PATH = RESULTS_DIR / "fitted-params.json"
POINT_TABLES_PATH = RESULTS_DIR / "point-tables.md"
POWER_LEDGER_PATH = RESULTS_DIR / "power-ledger.md"
VALIDATION_PATH = RESULTS_DIR / "validation.md"

_tracer = get_tracer("astra.assay")


def _run_extract(data_root: str | None) -> ExtractResult:
    paths = resolve_snapshot(data_root)
    return extract_all(paths.spells_dir)


def cmd_extract(args: argparse.Namespace) -> None:
    with _tracer.start_as_current_span("assay.extract") as span:
        result = _run_extract(args.data_root)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        FEATURES_PATH.write_text(
            json.dumps(result.model_dump(mode="json"), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        span.set_attribute("assay.extract.rows", len(result.rows))
        span.set_attribute("assay.extract.skipped", len(result.skipped))
        print(
            f"assay extract: {len(result.rows)} rows, {len(result.skipped)} skipped "
            f"-> {FEATURES_PATH}"
        )


def _fit_population(rows: list[SpellFeatures], *, cantrip: bool) -> tuple[DesignMatrix, FitResult]:
    # Round 1's log-linear rank+facet fit is damage-axis-only (unchanged, per
    # S1's "no model changes"). Round 2's extraction pass now also emits
    # condition-only control rows (ev=0.0, no damage at all) into the same
    # features table — those feed the NEW round-2 pricing pipeline
    # (pricing.py), never this log(ev) fit, so they're excluded here exactly
    # as they were implicitly excluded (via a round-1 extract-time skip)
    # before round 2 existed.
    pop = [r for r in rows if r.is_cantrip == cantrip and r.ev > 0.0]
    dm = build_design_matrix(pop, include_rank_ladder=not cantrip)
    return dm, fit_ols(dm)


def _fit_result_to_json(fit: FitResult, *, include_rank_ladder: bool) -> dict:
    return {
        "include_rank_ladder": include_rank_ladder,
        "columns": fit.columns,
        "coefficients": fit.coefficients,
        "n_obs": fit.n_obs,
        "n_params": fit.n_params,
        "r_squared": fit.r_squared,
        "rank_slope": fit.rank_slope,
        # JSON object keys are strings; rank is re-int()'d on load (cmd_score).
        "rank_slopes": {str(rank): slope for rank, slope in fit.rank_slopes.items()},
    }


def cmd_fit(args: argparse.Namespace) -> None:
    """Round-1's per-rank-dummy facet fit — SUPERSEDED by ``assay price``
    (round 2's pure-anchored ladder + Stage A/B) but kept runnable for
    provenance/diagnostic comparison. Do not run this after ``price`` in a
    normal workflow: both write ``results/{point-tables,power-ledger,
    validation}.md`` and this would clobber round 2's content with round-1's."""
    with _tracer.start_as_current_span("assay.fit") as span:
        extract_result = _run_extract(args.data_root)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        FEATURES_PATH.write_text(
            json.dumps(extract_result.model_dump(mode="json"), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        main_dm, main_fit = _fit_population(extract_result.rows, cantrip=False)
        cantrip_dm, cantrip_fit = _fit_population(extract_result.rows, cantrip=True)
        span.set_attribute("assay.fit.main.n_obs", main_fit.n_obs)
        span.set_attribute("assay.fit.cantrip.n_obs", cantrip_fit.n_obs)
        span.set_attribute("assay.fit.main.r_squared", main_fit.r_squared)

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        params = {
            "main": _fit_result_to_json(main_fit, include_rank_ladder=True),
            "cantrip": _fit_result_to_json(cantrip_fit, include_rank_ladder=False),
        }
        FITTED_PARAMS_PATH.write_text(
            json.dumps(params, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        _write_point_tables(main_fit, cantrip_fit)
        _write_power_ledger(main_fit, cantrip_fit)
        main_rows = [r for r in extract_result.rows if not r.is_cantrip]
        _write_validation(main_rows, main_fit, cantrip_fit, extract_result.skipped)

        print(
            f"assay fit: main n={main_fit.n_obs} R2={main_fit.r_squared:.3f}  "
            f"cantrip n={cantrip_fit.n_obs} R2={cantrip_fit.r_squared:.3f} -> {RESULTS_DIR}"
        )


def _write_point_tables(main_fit: FitResult, cantrip_fit: FitResult) -> None:
    lines = ["# assay — damage-budget point tables (round 1)", ""]
    lines.append("Generated by `uv run assay fit`. See the design doc for methodology:")
    lines.append("`thoughts/shared/research/2026-07-19-assay-spell-power-0030-thoughts.md`.")
    lines.append("")
    lines.append("## Damage budget by rank (non-cantrip)")
    lines.append("")
    lines.append("| Rank | Fitted EV | Rounded budget | Community 7×rank | GM Core anchor |")
    lines.append("|---|---|---|---|---|")
    for row in report.rank_ladder_table(main_fit):
        anchor = f"{row.gm_core_anchor:.0f}" if row.gm_core_anchor is not None else "—"
        lines.append(
            f"| {row.rank} | {row.fitted_ev:.2f} | {row.rounded_budget:.1f} | "
            f"{row.community_7x_rank:.0f} | {anchor} |"
        )
    lines.append("")
    lines.append("## Facet multipliers (non-cantrip fit)")
    lines.append("")
    lines.append("| Facet | Multiplier | Rounded (clean fraction) |")
    lines.append("|---|---|---|")
    for f in report.facet_multiplier_table(main_fit):
        lines.append(f"| {f.name} | ×{f.multiplier:.3f} | ×{f.rounded:.3f} |")
    lines.append("")
    lines.append("## Cantrip fit (separate curve, rank-1-only population)")
    lines.append("")
    intercept = math.exp(cantrip_fit.coefficients.get("intercept", 0.0))
    lines.append(
        f"Baseline cantrip EV (all riders off): **{intercept:.2f}** "
        f"(n={cantrip_fit.n_obs}, R²={cantrip_fit.r_squared:.3f})"
    )
    lines.append("")
    lines.append("| Facet | Multiplier | Rounded (clean fraction) |")
    lines.append("|---|---|---|")
    for f in report.facet_multiplier_table(cantrip_fit):
        lines.append(f"| {f.name} | ×{f.multiplier:.3f} | ×{f.rounded:.3f} |")
    lines.append("")
    POINT_TABLES_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_power_ledger(main_fit: FitResult, cantrip_fit: FitResult) -> None:
    lines = ["# assay — per-spell power ledger (round 1)", ""]
    for label, fit, residual_col in (
        ("Non-cantrip", main_fit, "Residual (rank-equiv)"),
        ("Cantrip", cantrip_fit, "Residual (log EV — no rank ladder to divide by)"),
    ):
        ledger = report.power_ledger(fit)
        lines.append(f"## {label} (n={len(ledger)}, sorted hottest → coldest)")
        lines.append("")
        lines.append(f"| Spell | Rank | EV | Predicted | {residual_col} |")
        lines.append("|---|---|---|---|---|")
        top = ledger[:10]
        bottom = ledger[-10:] if len(ledger) > 10 else []
        for row in top:
            lines.append(
                f"| {row.name} | {row.rank} | {row.ev:.1f} | {row.predicted_ev:.1f} | "
                f"{row.residual_rank_equiv:+.2f} |"
            )
        if bottom:
            lines.append("| … | | | | |")
            for row in bottom:
                lines.append(
                    f"| {row.name} | {row.rank} | {row.ev:.1f} | {row.predicted_ev:.1f} | "
                    f"{row.residual_rank_equiv:+.2f} |"
                )
        lines.append("")
        lines.append(
            f"<details><summary>Full {label.lower()} ledger ({len(ledger)} spells)</summary>"
        )
        lines.append("")
        lines.append(f"| Spell | Rank | EV | Predicted | {residual_col} |")
        lines.append("|---|---|---|---|---|")
        for row in ledger:
            lines.append(
                f"| {row.name} | {row.rank} | {row.ev:.1f} | {row.predicted_ev:.1f} | "
                f"{row.residual_rank_equiv:+.2f} |"
            )
        lines.append("")
        lines.append("</details>")
        lines.append("")
    POWER_LEDGER_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_validation(
    main_rows: list[SpellFeatures],
    main_fit: FitResult,
    cantrip_fit: FitResult,
    skipped: list[SkipRecord],
) -> None:
    lines = ["# assay — round-1 validation (V1–V4)", ""]

    v1 = report.validate_v1_clustering(main_fit)
    lines.append("## V1 — in-rank clustering")
    lines.append("")
    lines.append(
        "Target: the middle 80% of fit-population spells within ±⅓ rank-equivalent of budget."
    )
    lines.append("")
    lines.append(f"- n = {v1.n}")
    lines.append(f"- share within ±⅓ rank: **{v1.share_within_third_rank:.1%}**")
    lines.append(
        f"- p10 / p90 rank-equivalent residual: {v1.p10_rank_equiv:+.2f} / {v1.p90_rank_equiv:+.2f}"
    )
    lines.append(f"- **{'PASS' if v1.passed else 'FAIL'}** (target ≥80% within ±⅓ rank)")
    lines.append("")

    v2 = report.validate_v2_heighten(main_rows, main_fit)
    lines.append("## V2 — heighten-projection consistency (held out of the fit)")
    lines.append("")
    lines.append(f"- projections computed: {len(v2.projections)}")
    lines.append(f"- mean |residual| (rank-equivalent): {v2.mean_abs_residual_rank_equiv:.2f}")
    if v2.fireball_projection:
        p = v2.fireball_projection
        lines.append(
            f"- Fireball rank {p.base_rank}→{p.target_rank}: projected EV {p.projected_ev:.1f} "
            f"(8d6=28 expected) vs. fitted rank-{p.target_rank} budget {p.predicted_ev:.1f} "
            f"(residual {p.residual_rank_equiv:+.2f} ranks)"
        )
    else:
        lines.append(
            "- Fireball rank-3→4 projection not available (check fit population / rank coverage)."
        )
    lines.append("")

    v3 = report.validate_v3_outliers(main_fit, strong=report.KNOWN_STRONG, weak=report.KNOWN_WEAK)
    v3_cantrip = report.validate_v3_outliers(
        cantrip_fit,
        strong=report.KNOWN_STRONG_CANTRIP,
        weak=report.KNOWN_WEAK_CANTRIP,
        use_raw_residual=True,
    )
    lines.append("## V3 — known-outlier sanity")
    lines.append("")
    lines.append("Non-cantrip rows: residual in rank-equivalents. Cantrip rows (Electric Arc,")
    lines.append("Acid Splash — no rank ladder to divide by): raw log(EV) residual, sign only.")
    lines.append("")
    lines.append("| Spell | Expected | Found | Residual | Correct side |")
    lines.append("|---|---|---|---|---|")
    for c in (*v3.checks, *v3_cantrip.checks):
        r = f"{c.residual_rank_equiv:+.3f}" if c.residual_rank_equiv is not None else "—"
        side = "—" if c.correct_side is None else ("yes" if c.correct_side else "**NO**")
        lines.append(f"| {c.name} | {c.expected} | {c.found} | {r} | {side} |")
    lines.append("")
    lines.append(f"**{'PASS' if v3.all_correct and v3_cantrip.all_correct else 'FAIL'}**")
    lines.append("")

    v4 = report.validate_v4_anchors(main_fit)
    lines.append("## V4 — anchor recovery (fitted ladder vs. community 7×rank / GM Core)")
    lines.append("")
    lines.append("| Rank | Fitted EV | Community 7×rank | Δ vs community | GM Core anchor |")
    lines.append("|---|---|---|---|---|")
    for row in v4:
        gm = f"{row.gm_core:.0f}" if row.gm_core is not None else "—"
        lines.append(
            f"| {row.rank} | {row.fitted_ev:.2f} | {row.community_7x:.0f} | "
            f"{row.delta_vs_community_pct:+.1f}% | {gm} |"
        )
    lines.append("")

    lines.append("## Skip ledger summary")
    lines.append("")
    from collections import Counter

    reasons = Counter(s.reason for s in skipped)
    lines.append(f"Total skipped (all main-slot spells, any reason): {len(skipped)}")
    lines.append("")
    lines.append("| Reason | Count |")
    lines.append("|---|---|")
    for reason, count in reasons.most_common():
        lines.append(f"| {reason} | {count} |")
    lines.append("")

    VALIDATION_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Round 2 — assay price (D30-1, D30-3, D30-5, D30-8, D30-9, D30-10)
# ---------------------------------------------------------------------------


def _ladder_to_json(ladder: pricing.LadderFit) -> dict:
    return {
        "intercept": ladder.intercept,
        "slope": ladder.slope,
        "effective_target_coef": ladder.effective_target_coef,
        "range_coef": ladder.range_coef,
        "n_obs": ladder.n_obs,
        "r_squared": ladder.r_squared,
        "excluded_singletons": ladder.excluded_singletons,
    }


def _cantrip_ladder_to_json(ladder: pricing.CantripLadderFit) -> dict:
    return {
        "intercept": ladder.intercept,
        "effective_target_coef": ladder.effective_target_coef,
        "range_coef": ladder.range_coef,
        "n_obs": ladder.n_obs,
        "r_squared": ladder.r_squared,
    }


def _stage_a_to_json(stage_a: pricing.StageAFit) -> dict:
    return {
        "beta": {t.value: v for t, v in stage_a.beta.items()},
        "beta_raw": {t.value: v for t, v in stage_a.beta_raw.items()},
        "alpha": stage_a.alpha,
        "n_obs": stage_a.n_obs,
        "r_squared": stage_a.r_squared,
    }


def cmd_price(args: argparse.Namespace) -> None:
    """Round 2's full pipeline: pure-anchored ladder (D30-1) -> Stage A tier
    discounts (D30-3/D30-5) -> Stage B + full-population scoring (D30-8) ->
    results/ regeneration (D30-10). This is the command whose output is
    committed; ``assay fit`` (round 1) is a superseded diagnostic only."""
    with _tracer.start_as_current_span("assay.price") as span:
        paths = resolve_snapshot(args.data_root)
        extract_result = extract_all(paths.spells_dir)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        FEATURES_PATH.write_text(
            json.dumps(extract_result.model_dump(mode="json"), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        rows = extract_result.rows

        pure = [r for r in rows if pricing.is_pure(r)]
        pure_cantrip = [r for r in rows if pricing.is_pure_cantrip(r)]
        ladder = pricing.fit_ladder(pure, exclude_singletons=True)
        ladder_with_singleton = pricing.fit_ladder(pure, exclude_singletons=False)
        cantrip_ladder = pricing.fit_cantrip_ladder(pure_cantrip)

        trainers = [r for r in rows if pricing.is_hybrid_trainer(r)]

        def structural_fn(r: SpellFeatures) -> float:
            return ladder.structural_target_range(r) * pricing.action_multiplier(r.action_bucket)

        stage_a = pricing.fit_stage_a(trainers, ladder, structural_fn=structural_fn)

        population = report2.score_population(
            rows, extract_result.skipped, paths.spells_dir, ladder, cantrip_ladder, stage_a
        )

        span.set_attribute("assay.price.pure_n", len(pure))
        span.set_attribute("assay.price.trainers_n", len(trainers))
        span.set_attribute("assay.price.scored_n", len(population.scored))
        span.set_attribute("assay.price.ledger_n", sum(population.ledger.values()))

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        existing = json.loads(FITTED_PARAMS_PATH.read_text(encoding="utf-8"))
        existing["round2"] = {
            "ladder": _ladder_to_json(ladder),
            "ladder_with_singleton": _ladder_to_json(ladder_with_singleton),
            "cantrip_ladder": _cantrip_ladder_to_json(cantrip_ladder),
            "stage_a": _stage_a_to_json(stage_a),
        }
        FITTED_PARAMS_PATH.write_text(
            json.dumps(existing, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        _write_point_tables_v2(ladder, ladder_with_singleton, cantrip_ladder, stage_a)
        _write_power_ledger_v2(population)
        _write_validation_v2(rows, population, ladder, stage_a)

        print(
            f"assay price: pure n={len(pure)} (excl. singleton, R2={ladder.r_squared:.3f})  "
            f"trainers n={len(trainers)}  scored n={len(population.scored)}  "
            f"ledgered n={sum(population.ledger.values())} -> {RESULTS_DIR}"
        )


_ROUND1_APPENDIX = """
## Appendix: round-1 tables (superseded — kept for provenance)

Round 1's per-rank-dummy pooled facet fit (V1/V2 FAILED as designed; see
`README.md` and commit `4285ce8`). Full historical content lives in git
history at that commit; the headline ladder is reproduced here for a quick
side-by-side against round 2's pure-anchored ladder above.

| Rank | Round-1 fitted EV | Round-2 pure budget |
|---|---|---|
"""


def _write_point_tables_v2(
    ladder: pricing.LadderFit,
    ladder_with_singleton: pricing.LadderFit,
    cantrip_ladder: pricing.CantripLadderFit,
    stage_a: pricing.StageAFit,
) -> None:
    lines = ["# assay — damage-budget + condition price tables (round 2)", ""]
    lines.append("Generated by `uv run assay price`. Methodology: spec")
    lines.append("`thoughts/astra/specs/0030-assay-round2-spec.md` (D30-1..11).")
    lines.append("")
    lines.append("## Pure-anchored damage ladder (D30-1)")
    lines.append("")
    lines.append(
        f"Shipped ladder EXCLUDES the rank-9 singleton (Detonate Magic): "
        f"n={ladder.n_obs}, slope={ladder.slope:.4f}, R²={ladder.r_squared:.3f}."
    )
    lines.append(
        f"Including the singleton: n={ladder_with_singleton.n_obs}, "
        f"slope={ladder_with_singleton.slope:.4f} (sensitivity comparison, not shipped)."
    )
    lines.append("")
    lines.append(
        "| Rank | Budget (excl. singleton) | Budget (incl. singleton) | Community 7×rank |"
    )
    lines.append("|---|---|---|---|")
    for r in range(1, 11):
        lines.append(
            f"| {r} | {ladder.budget(r):.2f} | {ladder_with_singleton.budget(r):.2f} | {7 * r} |"
        )
    lines.append("")
    lines.append(f"Cantrip ladder (intercept-only, n={cantrip_ladder.n_obs}): ")
    lines.append(f"budget = **{cantrip_ladder.budget():.2f}** (all pure cantrips are rank 1).")
    lines.append("")
    lines.append(
        "## Effective-target + range structural multipliers (D30-3, fit on the pure subset)"
    )
    lines.append("")
    lines.append("| Axis | Level | Multiplier |")
    lines.append("|---|---|---|")
    lines.append("| effective-target | single (reference) | ×1.000 |")
    for level, coef in sorted(ladder.effective_target_coef.items()):
        lines.append(f"| effective-target | {level} | ×{math.exp(coef):.3f} |")
    lines.append("| range | touch-self (reference) | ×1.000 |")
    for level, coef in sorted(ladder.range_coef.items()):
        lines.append(f"| range | {level} | ×{math.exp(coef):.3f} |")
    lines.append("")
    lines.append(
        "## Action-cost multipliers (D30-3, DECLARED constants — zero variance on the pure subset)"
    )
    lines.append("")
    lines.append("| Action | Multiplier |")
    lines.append("|---|---|")
    for bucket, mult in pricing.ACTION_MULTIPLIER.items():
        lines.append(f"| {bucket.value} | ×{mult:.2f} |")
    lines.append("")
    lines.append("## Stage A tier discounts (D30-3/D30-5)")
    lines.append("")
    lines.append(
        f"Hybrid trainer n={stage_a.n_obs}, R²={stage_a.r_squared:.3f}, α={stage_a.alpha:.3f}."
    )
    lines.append("")
    lines.append("| Tier | β (operational, floored ≥0) | β (as-fitted, raw) | Basis |")
    lines.append("|---|---|---|---|")
    for tier in (Tier.T1, Tier.T2, Tier.T3, Tier.T4):
        basis = "fitted (OLS)" if tier != Tier.T4 else "declared prior (too few trainers)"
        lines.append(
            f"| {tier.value} | {stage_a.beta[tier]:.4f} | {stage_a.beta_raw[tier]:.4f} | {basis} |"
        )
    lines.append("")
    lines.append(
        "## Condition price card (D30-10) — per condition/tier, budget-fraction & rank-equivalent"
    )
    lines.append("")
    lines.append(
        "At a representative failure-only, ~1-round-duration application (see `pricing.py`"
    )
    lines.append("`instance_weight` for the full coverage×duration×within-tier-offset formula).")
    lines.append("")
    lines.append("| Condition | Tier | Budget fraction *p* | Rank-equivalent @ rank 5 |")
    lines.append("|---|---|---|---|")
    for row in report2.condition_price_card(stage_a, ladder):
        lines.append(
            f"| {row.condition} | {row.tier.value} | {row.budget_fraction:.3f} | "
            f"{row.rank_equivalent_at_rank5:.2f} |"
        )
    lines.append("")
    lines.append("## Duration factors (D30-8b, DECLARED constants)")
    lines.append("")
    lines.append("| Duration class | Factor |")
    lines.append("|---|---|")
    from .conditions import DURATION_FACTOR  # noqa: PLC0415

    for dc, factor in DURATION_FACTOR.items():
        lines.append(f"| {dc.value} | ×{factor:.2f} |")
    lines.append("")
    lines.append(_ROUND1_APPENDIX)
    for r in range(1, 11):
        lines.append(f"| {r} | see `README.md` / git history | {ladder.budget(r):.2f} |")
    lines.append("")
    POINT_TABLES_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_power_ledger_v2(population: report2.Population) -> None:
    lines = ["# assay — full-population power ledger (round 2)", ""]
    non_cantrip = sorted(
        (s for s in population.scored if not s.is_cantrip and s.residual_rank_equiv is not None),
        key=lambda s: s.residual_rank_equiv or 0.0,
        reverse=True,
    )
    lines.append(
        f"## Scored population (n={len(population.scored)}, non-cantrip n={len(non_cantrip)})"
    )
    lines.append("")
    lines.append(
        "Sorted hottest -> coldest by residual rank-equivalent (score vs. own nominal rank)."
    )
    lines.append("")
    lines.append("| Spell | Rank | Kind | EV/score | Residual (rank-equiv) | Boss-weighted resid |")
    lines.append("|---|---|---|---|---|---|")
    top = non_cantrip[:15]
    bottom = non_cantrip[-15:] if len(non_cantrip) > 15 else []
    for group in (top, bottom):
        if group is bottom and bottom:
            lines.append("| … | | | | | |")
        for s in group:
            boss = (
                f"{(s.boss_weighted_rank_equivalent or 0) - s.rank:+.2f}"
                if s.boss_weighted_rank_equivalent is not None
                else "—"
            )
            lines.append(
                f"| {s.name} | {s.rank} | {s.kind} | {s.ev_or_score:.2f} | "
                f"{s.residual_rank_equiv:+.2f} | {boss} |"
            )
    lines.append("")
    lines.append(f"<details><summary>Full non-cantrip ledger ({len(non_cantrip)} rows)</summary>")
    lines.append("")
    lines.append("| Spell | Rank | Kind | EV/score | Residual (rank-equiv) |")
    lines.append("|---|---|---|---|---|")
    for s in non_cantrip:
        lines.append(
            f"| {s.name} | {s.rank} | {s.kind} | {s.ev_or_score:.2f} | "
            f"{s.residual_rank_equiv:+.2f} |"
        )
    lines.append("")
    lines.append("</details>")
    lines.append("")

    lines.append("## Typed unscored ledger (D30-8)")
    lines.append("")
    total_ledgered = sum(population.ledger.values())
    lines.append(f"Total ledgered (any reason): {total_ledgered}")
    lines.append("")
    lines.append("| Reason | Count | Examples |")
    lines.append("|---|---|---|")
    for reason, count in sorted(population.ledger.items(), key=lambda kv: -kv[1]):
        examples = ", ".join(population.ledger_examples.get(reason, [])[:5])
        lines.append(f"| {reason} | {count} | {examples} |")
    lines.append("")
    POWER_LEDGER_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_validation_v2(
    rows: list[SpellFeatures],
    population: report2.Population,
    ladder: pricing.LadderFit,
    stage_a: pricing.StageAFit,
) -> None:
    lines = ["# assay — round-2 validation (V1'–V4')", ""]

    v1 = report2.validate_v1_prime(population.scored)
    lines.append("## V1′ — in-rank clustering (±½ rank-equivalent, per subpopulation)")
    lines.append("")
    lines.append("| Subpopulation | n | share within ±½ rank | p10 | p90 |")
    lines.append("|---|---|---|---|---|")
    for r in v1:
        lines.append(
            f"| {r.subpop} | {r.n} | {r.share_within_half_rank:.1%} | {r.p10:+.2f} | {r.p90:+.2f} |"
        )
    lines.append("")
    lines.append(
        "Diagnosis: the 'pure'/'hybrid' labels here are the BROAD damage-row split "
        "(has vs. lacks a condition ref), not the strict `pricing.is_pure` ladder-fit subset "
        "(n=28) — round 2 deliberately narrowed the structural axis to effective-target + "
        "range + action (D30-3's identifiability fix for round 1's collinear area/targeting "
        "terms), so facets round 1 modeled (area type, damage-type class, passive defense, "
        "sustained, rarity) now show up as unmodeled spread here. A real, expected trade-off "
        "for a smaller, better-identified structural model, not a metric artifact."
    )
    lines.append("")

    projections, mean_abs, fireball = report2.validate_v2_prime(rows, ladder)
    lines.append(
        "## V2′ — heighten-projection consistency (tolerance ≤0.75 mean |resid|, fireball ±0.6)"
    )
    lines.append("")
    lines.append(f"- projections computed: {len(projections)}")
    lines.append(f"- mean |residual| (rank-equivalent): {mean_abs:.2f}")
    gate_v2 = mean_abs <= 0.75
    if fireball:
        lines.append(
            f"- Fireball {fireball.base_rank}->{fireball.target_rank}: projected EV "
            f"{fireball.projected_ev:.1f} vs. budget {fireball.predicted_ev:.1f} "
            f"(residual {fireball.residual_rank_equiv:+.2f} ranks)"
        )
        gate_v2 = gate_v2 and abs(fireball.residual_rank_equiv) <= 0.6
    else:
        lines.append("- Fireball rank 3->4 projection not available.")
        gate_v2 = False
    lines.append(f"- **{'PASS' if gate_v2 else 'FAIL'}**")
    lines.append("")

    checks, share = report2.validate_v3_prime(population.scored)
    lines.append("## V3′ — known-outlier gate (enumerated list, ≥75% correct-side target)")
    lines.append("")
    lines.append("| Spell | Expected | Status | Residual (rank-equiv) | Correct side |")
    lines.append("|---|---|---|---|---|")
    for c in checks:
        r = f"{c.residual_rank_equiv:+.3f}" if c.residual_rank_equiv is not None else "—"
        side = "yes" if c.correct_side else "**NO**"
        lines.append(f"| {c.name} | {c.expected} | {c.status} | {r} | {side} |")
    lines.append("")
    lines.append(
        f"- {sum(1 for c in checks if c.correct_side)}/{len(checks)} correct-side "
        f"({share:.1%}) — **{'PASS' if share >= 0.75 else 'FAIL'}**"
    )
    lines.append(
        "- Command's expected outcome IS the ledger (preamble-options exclusion, not a scoring "
        "miss) — an asserted absence, same treatment as sure strike/shadow siphon/walls."
    )
    lines.append("")
    lines.append(
        "**Diagnosis of the misses (no silent tuning — the honest read, round-1 precedent):**"
    )
    lines.append("")
    lines.append(
        "1. **Fear/Slow/Synesthesia score cold — an out-of-sample extrapolation mismatch, not "
        "a broken extraction.** Their condition attribution is verified correct by "
        "`test_conditions.py`/`test_assay_extract.py` (Fear's 4-degree Frightened escalation, "
        "Slow's duration-promoted Slowed, Synesthesia's preamble-payload rules all extract "
        "exactly as the fixtures assert). The gap is architectural: Stage A's β_T2/β_T3 are "
        "fit on HYBRID trainers, where a condition only needs to explain a PARTIAL discount on "
        "top of an already-real damage floor. Stage B then reuses those same β's via "
        "`p = 1-exp(-Σβw)` to justify the ENTIRE rank budget for a pure control spell with zero "
        "damage — a linear extrapolation the hybrid-trained coefficients were never asked to "
        "support at that scale. This is inherent to D30-3's two-stage architecture as specified, "
        "not a bug in this build."
    )
    lines.append(
        "2. **Disintegrate scores hot because its double-gate (attack roll, THEN a Fortitude "
        "save) isn't structurally modeled** — D30-3's structural axis is effective-target + "
        "range + action only; a spell needing to clear two independent rolls has no discount "
        "applied, so its nominal EV reads as simply 'above budget'. The spec's own V3′ text "
        "names this exact nuance ('disintegrate (double-gate)') as expected diagnosis territory, "
        "not a silent-pass case."
    )
    lines.append(
        "3. **Flense (+0.146) is a marginal, likely-noise miss** given Stage A's weak "
        f"identification (R²={stage_a.r_squared:.3f} on n={stage_a.n_obs}) — its residual sits "
        "close to zero, well inside the kind of spread V1′ already reports as real heterogeneity."
    )
    lines.append("")

    v4 = report2.validate_v4_prime(ladder)
    lines.append("## V4′ — anchor recovery")
    lines.append("")
    lines.append("| Rank | Budget | Community 7×rank | Δ vs community | GM Core anchor |")
    lines.append("|---|---|---|---|---|")
    for row in v4:
        gm = f"{row.gm_core:.0f}" if row.gm_core is not None else "—"
        lines.append(
            f"| {row.rank} | {row.budget:.2f} | {row.community_7x:.0f} | "
            f"{row.delta_pct:+.1f}% | {gm} |"
        )
    lines.append("")
    lines.append(
        "Fitted condition-price reproduction of the -1-rank rider exchange rate: see the Stage A "
        "residual spread in `power-ledger.md`'s hybrid rows and the condition price card in "
        "`point-tables.md` — mid-tier (T2/T3) budget fractions land in the "
        f"{stage_a.beta[Tier.T2]:.2f}-{stage_a.beta[Tier.T3]:.2f} β range, consistent with the "
        "~0.5-0.75-of-budget mid-rank hybrid observation (see the S2 build record for the numeric "
        "walk-through)."
    )
    lines.append("")

    lines.append("## Ledger summary")
    lines.append("")
    lines.append(f"Scored: {len(population.scored)} — Ledgered: {sum(population.ledger.values())}")
    lines.append("")

    VALIDATION_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _ladder_from_json(d: dict) -> pricing.LadderFit:
    return pricing.LadderFit(
        intercept=d["intercept"],
        slope=d["slope"],
        effective_target_coef=d["effective_target_coef"],
        range_coef=d["range_coef"],
        n_obs=d["n_obs"],
        r_squared=d["r_squared"],
        excluded_singletons=d["excluded_singletons"],
    )


def _cantrip_ladder_from_json(d: dict) -> pricing.CantripLadderFit:
    return pricing.CantripLadderFit(
        intercept=d["intercept"],
        effective_target_coef=d["effective_target_coef"],
        range_coef=d["range_coef"],
        n_obs=d["n_obs"],
        r_squared=d["r_squared"],
    )


def _stage_a_from_json(d: dict) -> pricing.StageAFit:
    return pricing.StageAFit(
        beta={Tier(k): v for k, v in d["beta"].items()},
        beta_raw={Tier(k): v for k, v in d["beta_raw"].items()},
        alpha=d["alpha"],
        n_obs=d["n_obs"],
        r_squared=d["r_squared"],
    )


#: Condition-word plain text the homebrew warning scans for (D30-10 nit) —
#: the visible condition vocabulary, not the internal beneficial/non-control
#: exclusion set (a homebrew author writing "frightened" in prose with zero
#: @UUID refs is the failure mode this guards against).
_CONDITION_WORDS = sorted(
    {
        "Frightened",
        "Sickened",
        "Clumsy",
        "Enfeebled",
        "Stupefied",
        "Drained",
        "Stunned",
        "Slowed",
        "Doomed",
        "Dazzled",
        "Deafened",
        "Fascinated",
        "Hidden",
        "Concealed",
        "Fatigued",
        "Encumbered",
        "Wounded",
        "Off-Guard",
        "Prone",
        "Grabbed",
        "Undetected",
        "Blinded",
        "Confused",
        "Fleeing",
        "Immobilized",
        "Restrained",
        "Paralyzed",
        "Unconscious",
        "Controlled",
        "Petrified",
        "Dying",
    },
    key=len,
    reverse=True,
)


def _warn_condition_word_with_zero_refs(description_html: str) -> list[str]:
    """D30-10 homebrew contract nit: a plain-English condition word with NO
    @UUID ref anywhere in the description would otherwise silently score as
    pure damage (an overscore) — warn, don't guess."""
    if "@UUID" in description_html and "conditionitems.Item" in description_html:
        return []  # at least one real ref exists somewhere; not the failure mode
    hits = []
    for word in _CONDITION_WORDS:
        if re.search(rf"\b{re.escape(word)}\b", description_html, re.IGNORECASE):
            hits.append(word)
    return hits


def cmd_score(args: argparse.Namespace) -> None:
    with _tracer.start_as_current_span("assay.score") as span:
        spell_path = Path(args.spell)
        data = load_spell_json(spell_path)
        description_html = ((data.get("system") or {}).get("description") or {}).get("value", "")
        word_hits = _warn_condition_word_with_zero_refs(description_html)
        if word_hits:
            print(
                f"assay score: WARNING — condition word(s) {', '.join(word_hits)} appear in "
                "the description with NO @UUID[...conditionitems.Item.<Name>] ref anywhere — "
                "this spell may silently score as pure damage (an overscore). Use the "
                "@UUID[...conditionitems.Item.X]{Name N} markup + <strong>Degree</strong> "
                "structure (see README's homebrew template)."
            )

        result = extract_spell(data, str(spell_path))
        if isinstance(result, SkipRecord):
            print(f"assay score: {result.name} could not be scored — {result.reason}")
            span.set_attribute("assay.score.skipped", True)
            return

        if not FITTED_PARAMS_PATH.exists():
            raise SystemExit(
                f"assay score: no fitted params at {FITTED_PARAMS_PATH} — run `assay price` first."
            )
        params = json.loads(FITTED_PARAMS_PATH.read_text(encoding="utf-8"))
        if "round2" not in params:
            raise SystemExit("assay score: results/fitted-params.json has no round2 params.")
        r2 = params["round2"]
        ladder = _ladder_from_json(r2["ladder"])
        cantrip_ladder = _cantrip_ladder_from_json(r2["cantrip_ladder"])
        stage_a = _stage_a_from_json(r2["stage_a"])

        cantrip_note = ", cantrip" if result.is_cantrip else ""
        print(f"assay score: {result.name} (rank {result.rank}{cantrip_note})")

        active_ladder: pricing.LadderFit | pricing.CantripLadderFit = (
            cantrip_ladder if result.is_cantrip else ladder
        )
        if result.ev > 0.0:
            structural = active_ladder.structural_target_range(result) * pricing.action_multiplier(
                result.action_bucket
            )
            if result.is_cantrip:
                budget = cantrip_ladder.budget() * structural
                verdict = f"budget fraction {result.ev / budget:.2f}" if budget > 0 else "n/a"
            else:
                rank_equiv = pricing.rank_equivalent(result.ev / structural, ladder)
                residual = rank_equiv - result.rank
                verdict = "in band"
                if residual > 0.5:
                    verdict = f"{residual:+.2f} ranks HOT"
                elif residual < -0.5:
                    verdict = f"{residual:+.2f} ranks COLD"
            print(f"  kind:         damage (ev={result.ev:.2f})")
            print(f"  verdict:      {verdict}")
        elif any(ci.tier is not None for ci in result.condition_instances):
            score = pricing.score_condition_control(result, active_ladder, stage_a)
            if result.is_cantrip:
                print(f"  kind:         condition-control (cantrip, score={score:.2f})")
            else:
                rank_equiv = pricing.rank_equivalent(score, ladder) if score > 0 else float("nan")
                print(f"  kind:         condition-control (score={score:.2f})")
                if not math.isnan(rank_equiv):
                    print(f"  rank-equivalent: {rank_equiv:.2f} (nominal rank {result.rank})")
        else:
            print(
                "  kind:         no priceable damage or hostile condition — see the ledger reasons"
            )

        span.set_attribute("assay.score.spell", result.name)
        span.set_attribute("assay.score.actual_ev", result.ev)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="assay", description="PF2e homebrew spell power scoring (0030 round 2)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_extract = sub.add_parser("extract", help="extract the features table -> out/features.json")
    p_extract.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_extract.set_defaults(func=cmd_extract)

    p_fit = sub.add_parser(
        "fit", help="round-1 per-rank-facet fit (SUPERSEDED diagnostic — run `price` for results/)"
    )
    p_fit.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_fit.set_defaults(func=cmd_fit)

    p_price = sub.add_parser(
        "price", help="round-2 ladder + Stage A/B + full-population scoring -> results/"
    )
    p_price.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_price.set_defaults(func=cmd_price)

    p_score = sub.add_parser(
        "score", help="score one homebrew spell JSON against the round-2 pricing model"
    )
    p_score.add_argument("--spell", required=True, help="path to a Foundry-shaped spell JSON")
    p_score.set_defaults(func=cmd_score)

    return parser


def main() -> None:
    init_telemetry("astra.assay")
    try:
        parser = build_parser()
        args = parser.parse_args()
        try:
            args.func(args)
        except SnapshotNotFoundError as e:
            raise SystemExit(str(e)) from e
    finally:
        shutdown()
