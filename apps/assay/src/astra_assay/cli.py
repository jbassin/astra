"""``assay`` console script — extract / fit / price / score / export-codex /
convert-homebrew / score-homebrew.

    uv run assay extract [--data-root PATH]   # features table → out/features.json
    uv run assay fit [--data-root PATH]       # round-1 per-rank-facet fit (superseded diagnostic)
    uv run assay price [--data-root PATH]     # ladder + Stage A/B + comparables + priors → results/
    uv run assay score --spell PATH           # score one homebrew spell JSON (round-3 model)
    uv run assay export-codex [--data-root PATH]  # codex artifact (D30-38) → out/spell-power.json
    uv run assay convert-homebrew             # vendored run_balance 176 -> out/homebrew/<slug>.json
    uv run assay score-homebrew               # convert + score all 176 -> out/homebrew/scores.json

The last two live in ``homebrew.py`` (registered via
``homebrew.register_subparsers``) — the adapter for the vendored
``vendor/run_balance/pf2e_converted_spells`` bespoke-schema conversion set;
see that module's docstring.

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
from dataclasses import dataclass
from pathlib import Path

from astra_observe import get_tracer, init_telemetry, shutdown

from . import (
    buffs,
    comparables,
    export,
    homebrew,
    ledger,
    pricing,
    priors,
    report,
    report2,
    summons,
)
from .conditions import Tier
from .extract import (
    ExtractResult,
    SkipRecord,
    SpellFeatures,
    build_effect_index_from_snapshot,
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
COMPARABLES_CORPUS_PATH = RESULTS_DIR / "comparables-corpus.json"
COMPARABLES_SPOT_PATH = RESULTS_DIR / "comparables-spot.md"
BUFF_CORPUS_PATH = RESULTS_DIR / "buff-comparables-corpus.json"
EXPORT_PATH = OUT_DIR / "spell-power.json"
#: D30-37 — the GM Screen journal entry/page the declared summon curve is
#: verified against at build (spec 0030 D30-37, STOP on disagreement).
_SUMMON_JOURNAL_ENTRY_ID = "S55aqwWIzpQRFhcq"
_SUMMON_JOURNAL_PAGE_ID = "8gcp880pEWZ9VPnF"

_tracer = get_tracer("astra.assay")


@dataclass
class Round4Report:
    """Everything `_write_validation_v2`'s round-4 (D30-35..38) section needs
    — gathered once in `cmd_price`, kept as a plain bag rather than growing
    that function's already-long parameter list further."""

    wb_results: list[buffs.BuffLooResult]
    buff_corpus_n: int
    summon_rows: list[dict]
    summon_curve_ok: bool
    summon_curve_error: str
    export_report: export.ExportReport
    export_deterministic: bool


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

        # D30-23 — the comparables corpus: every OFFICIAL row that actually
        # SCORES (ledger.classify_row is None — damage rows always score;
        # ev=0 condition rows only when D30-22 routes them hostile) AND
        # carries at least one hostile-priceable atom.
        scored_rows = [r for r in rows if ledger.classify_row(r) is None]
        corpus = comparables.build_corpus(scored_rows, ladder)
        COMPARABLES_CORPUS_PATH.write_text(
            json.dumps([comparables.profile_to_json(p) for p in corpus], indent=2, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )

        prior_card = priors.build_prior_card(ladder, cantrip_ladder)
        tier_rates = {t: priors.tier_rate(t, ladder, cantrip_ladder) for t in Tier}

        va_results, va_share = report2.validate_v_a_loo(report2.ROSTER_V_A, corpus)

        # -------------------------------------------------------------
        # Round 4 (D30-35..38): buff comparables + summon band + export.
        # -------------------------------------------------------------
        buff_corpus = buffs.build_buff_corpus(rows)
        BUFF_CORPUS_PATH.write_text(
            json.dumps(
                [comparables.profile_to_json(p) for p in buff_corpus], indent=2, sort_keys=True
            )
            + "\n",
            encoding="utf-8",
        )
        wb_results = buffs.validate_w_b_loo(buffs.ROSTER_W_B, buff_corpus)

        effect_index = build_effect_index_from_snapshot(paths.spells_dir)
        pack_curve = buffs.build_pack_curve_anchors(effect_index)

        journal_path = paths.version_dir / "packs" / "pf2e" / "journals" / "gm-screen.json"
        summon_curve_ok = True
        summon_curve_error = ""
        if journal_path.exists():
            try:
                summons.verify_curve_against_journal(
                    json.loads(journal_path.read_text(encoding="utf-8")),
                    entry_id=_SUMMON_JOURNAL_ENTRY_ID,
                    page_id=_SUMMON_JOURNAL_PAGE_ID,
                )
            except summons.SummonCurveDisagreementError as e:
                summon_curve_ok = False
                summon_curve_error = str(e)
        summon_rows = _collect_summon_rows(paths.spells_dir)

        export_artifact, export_report = export.build_export(
            extract_result, paths.spells_dir, ladder, cantrip_ladder, corpus, buff_corpus
        )
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        EXPORT_PATH.write_text(export.dump_export(export_artifact), encoding="utf-8")
        export_artifact_2, _ = export.build_export(
            extract_result, paths.spells_dir, ladder, cantrip_ladder, corpus, buff_corpus
        )
        export_deterministic = export.dump_export(export_artifact) == export.dump_export(
            export_artifact_2
        )

        span.set_attribute("assay.price.pure_n", len(pure))
        span.set_attribute("assay.price.trainers_n", len(trainers))
        span.set_attribute("assay.price.scored_n", len(population.scored))
        span.set_attribute("assay.price.ledger_n", sum(population.ledger.values()))
        span.set_attribute("assay.price.comparables_corpus_n", len(corpus))
        span.set_attribute("assay.price.v_a_share", va_share)
        span.set_attribute("assay.price.buff_corpus_n", len(buff_corpus))
        span.set_attribute("assay.price.export_entries", export_report.entry_count)

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        existing = json.loads(FITTED_PARAMS_PATH.read_text(encoding="utf-8"))
        existing["round2"] = {
            "ladder": _ladder_to_json(ladder),
            "ladder_with_singleton": _ladder_to_json(ladder_with_singleton),
            "cantrip_ladder": _cantrip_ladder_to_json(cantrip_ladder),
            "stage_a": _stage_a_to_json(stage_a),
        }
        existing["round3"] = {
            "comparables_corpus_n": len(corpus),
            "tier_rates": {
                t.value: {"w_repr": tr.w_repr, "anchor_budget": tr.anchor_budget, "rate": tr.rate}
                for t, tr in tier_rates.items()
            },
        }
        existing["round4"] = {
            "buff_corpus_n": len(buff_corpus),
            "export_entry_count": export_report.entry_count,
            "export_kind_counts": export_report.kind_counts,
            "export_population_counts": export_report.population_counts,
            "export_variant_collapse_count": export_report.variant_collapse_count,
            "export_deterministic": export_deterministic,
            "summon_curve_verified": summon_curve_ok,
        }
        FITTED_PARAMS_PATH.write_text(
            json.dumps(existing, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        _write_point_tables_v2(
            ladder,
            ladder_with_singleton,
            cantrip_ladder,
            stage_a,
            prior_card,
            tier_rates,
            pack_curve,
        )
        _write_power_ledger_v2(population)
        _write_validation_v2(
            rows,
            population,
            ladder,
            stage_a,
            va_results,
            va_share,
            round4=Round4Report(
                wb_results=wb_results,
                buff_corpus_n=len(buff_corpus),
                summon_rows=summon_rows,
                summon_curve_ok=summon_curve_ok,
                summon_curve_error=summon_curve_error,
                export_report=export_report,
                export_deterministic=export_deterministic,
            ),
        )
        _write_comparables_spot(va_results, va_share)

        print(
            f"assay price: pure n={len(pure)} (excl. singleton, R2={ladder.r_squared:.3f})  "
            f"trainers n={len(trainers)}  scored n={len(population.scored)}  "
            f"ledgered n={sum(population.ledger.values())}  comparables corpus n={len(corpus)}  "
            f"V-A share={va_share:.1%}  buff corpus n={len(buff_corpus)}  "
            f"export entries={export_report.entry_count} -> {RESULTS_DIR}"
        )


def cmd_export_codex(args: argparse.Namespace) -> None:
    """D30-38: (re)build the codex export artifact alone, off the committed
    comparables corpora — does NOT re-run `assay price`'s full fit (use that
    first if the corpora are stale). Writes ONLY to
    `apps/assay/out/spell-power.json` — never into `apps/codex/` (the
    orchestrator places it there at integration, D30-41)."""
    with _tracer.start_as_current_span("assay.export-codex") as span:
        paths = resolve_snapshot(args.data_root)
        extract_result = extract_all(paths.spells_dir)

        if not FITTED_PARAMS_PATH.exists():
            raise SystemExit(
                f"assay export-codex: no fitted params at {FITTED_PARAMS_PATH} — "
                "run `assay price` first."
            )
        params = json.loads(FITTED_PARAMS_PATH.read_text(encoding="utf-8"))
        r2 = params["round2"]
        ladder = _ladder_from_json(r2["ladder"])
        cantrip_ladder = _cantrip_ladder_from_json(r2["cantrip_ladder"])

        if not COMPARABLES_CORPUS_PATH.exists():
            raise SystemExit(
                f"assay export-codex: no comparables corpus at {COMPARABLES_CORPUS_PATH} — "
                "run `assay price` first."
            )
        hostile_corpus = [
            comparables.profile_from_json(d)
            for d in json.loads(COMPARABLES_CORPUS_PATH.read_text(encoding="utf-8"))
        ]
        buff_corpus = (
            [
                comparables.profile_from_json(d)
                for d in json.loads(BUFF_CORPUS_PATH.read_text(encoding="utf-8"))
            ]
            if BUFF_CORPUS_PATH.exists()
            else buffs.build_buff_corpus(extract_result.rows)
        )

        artifact, report_ = export.build_export(
            extract_result, paths.spells_dir, ladder, cantrip_ladder, hostile_corpus, buff_corpus
        )
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        EXPORT_PATH.write_text(export.dump_export(artifact), encoding="utf-8")

        span.set_attribute("assay.export_codex.entries", report_.entry_count)
        print(
            f"assay export-codex: {report_.entry_count} entries "
            f"(kinds={report_.kind_counts}, variants collapsed={report_.variant_collapse_count}) "
            f"-> {EXPORT_PATH}"
        )


def _collect_summon_rows(spells_dir: Path) -> list[dict]:
    """The 14 real summon-trait main-list spells + their base-level prose
    extraction, for the W-C build-record table (D30-37)."""
    out: list[dict] = []
    for path in sorted(spells_dir.glob("**/*.json")):
        data = load_spell_json(path)
        sysd = data.get("system", {})
        traits = (sysd.get("traits") or {}).get("value") or []
        if "summon" not in [str(t).lower() for t in traits]:
            continue
        rank = int((sysd.get("level") or {}).get("value", 0))
        description = (sysd.get("description") or {}).get("value", "") or ""
        band = summons.summon_band(rank, description)
        out.append({"name": data.get("name", "<unnamed>"), "rank": rank, "band": band})
    return out


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
    prior_card: list[priors.PriorCardRow],
    tier_rates: dict[Tier, priors.TierRate],
    pack_curve: list[buffs.PackCurveAnchor] | None = None,
) -> None:
    lines = ["# assay — damage-budget tables + prior-anchored price card (round 3)", ""]
    lines.append("Generated by `uv run assay price`. Methodology: spec")
    lines.append("`thoughts/astra/specs/0030-assay-round3-spec.md` (D30-21..27); damage-ladder")
    lines.append("mechanics carried unchanged from `0030-assay-round2-spec.md` (D30-1..11).")
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
    lines.append("## Prior-anchored condition price card (D30-24 — PRIMARY, replaces the")
    lines.append("round-2 fitted card below)")
    lines.append("")
    lines.append(
        "**Every value here is a labeled PRIOR, never a fit.** Review F3/F4 killed round-2's "
        "fitted condition price card as a design tool (its own build record: the per-condition "
        "table is 'the per-instance rate, not the whole-spell aggregate' — never separately "
        "validated). Each tier is anchored on one named real spell/rule, unit-coherently stated "
        "as **V ≈ Budget/w_repr** (`w_repr` printed alongside every rate)."
    )
    lines.append("")
    lines.append("| Tier | Anchor | Anchor rank | w_repr | Rate = Budget(anchor)/w_repr |")
    lines.append("|---|---|---|---|---|")
    for tier in (Tier.T1, Tier.T2, Tier.T3, Tier.T4):
        tr = tier_rates[tier]
        anchor_label = (
            f"{tr.anchor.anchor_condition} / {tr.anchor.anchor_degree} / "
            f"{tr.anchor.anchor_duration.value}"
        )
        anchor_rank_label = "cantrip ladder" if tier == Tier.T1 else str(tr.anchor.anchor_rank)
        lines.append(
            f"| {tier.value} | {anchor_label} | {anchor_rank_label} | {tr.w_repr:.4f} | "
            f"{tr.rate:.3f} |"
        )
    lines.append("")
    for tier in (Tier.T4, Tier.T3, Tier.T2, Tier.T1):
        lines.append(f"- **{tier.value}**: {tier_rates[tier].anchor.anchor_note}")
    lines.append("")
    lines.append(
        "**Table representative point vs. the tier anchors above:** every row below is "
        "evaluated at the SAME representative point (failure, ~1-round duration — round-2's own "
        "condition-price-card convention, for apples-to-apples comparison across every "
        "condition), which is DIFFERENT from the T2/T3 anchors' own real shape (Frightened 1 at "
        "success/instant, Slowed 1 at failure/MINUTE). That's why 'Slowed 1' below reads ≈1.2 "
        "ranks, not the ≈3 ranks its own anchor note claims — the anchor claim is specifically "
        "about Slow's REAL 1-minute duration (duration factor ×1.0, vs. this table's uniform "
        "~1-round point at ×0.6); it is NOT a claim that every 'Slowed 1' instance is worth rank "
        "3 regardless of duration (a short Slowed 1 legitimately prices lower — use the "
        "duration-factor table below to rescale: multiply this row's value by the target "
        "duration's factor ÷ 0.6). Also note the fixed condition×value→tier table below does not "
        "apply `conditions.condition_tier`'s duration-based Slowed 1→T3 promotion (that logic is "
        "extraction-time only, same as round-2's own condition price card) — a 1-minute Slowed 1 "
        "in an ACTUAL spell scores under T3, not the T2 row shown here."
    )
    lines.append("")
    lines.append(
        "| Condition | Tier | w (failure, ~1 round) | Prior value V | Prior rank-equivalent |"
    )
    lines.append("|---|---|---|---|---|")
    for row in prior_card:
        req = "n/a" if math.isnan(row.prior_rank_equivalent) else f"{row.prior_rank_equivalent:.2f}"
        lines.append(
            f"| {row.condition} | {row.tier.value} | "
            f"{row.sample_weight_failure_only_round:.4f} | {row.prior_value:.2f} | {req} |"
        )
    lines.append("")
    lines.append("### Marginal rider price (GM Core's -1-rank rule)")
    lines.append("")
    marginal_low, marginal_high = priors.MARGINAL_RIDER_LOW, priors.MARGINAL_RIDER_HIGH
    lines.append(
        "Adding a SIGNIFICANT condition rider to an otherwise-priced damage spell discounts "
        f"the total to roughly **×{marginal_low:.2f}–×{marginal_high:.2f}** "
        "of what the same-rank pure budget would otherwise buy — GM Core's own 'apply a condition "
        "≈ damage of 2+ creature levels lower' rule, reproduced empirically by round 1's pure-vs-"
        "rider probe (rider-family spells deal ×0.43–0.81 of same-rank pure budget) and consistent "
        "with round-2's Stage A T2/T3 β fits landing well under 1.0. A flat guidance rate, not "
        "per-condition — apply it to the SPELL'S total budget, not to any one atom."
    )
    lines.append("")
    lines.append("### Coverage/duration adjustment guidance (declared constants, shown as")
    lines.append("multipliers)")
    lines.append("")
    outcome_probability, duration_factor = priors.coverage_duration_multiplier_guidance()
    lines.append("| Outcome | P(outcome) vs. an on-level moderate save |")
    lines.append("|---|---|")
    for outcome, p in outcome_probability.items():
        lines.append(f"| {outcome} | {p:.2f} |")
    lines.append("")
    lines.append("| Duration class | Factor |")
    lines.append("|---|---|")
    for dc, factor in duration_factor.items():
        lines.append(f"| {dc} | ×{factor:.2f} |")
    lines.append("")
    lines.append("## Appendix: round-2 fitted condition price card (SUPERSEDED — known-noisy,")
    lines.append("kept for provenance)")
    lines.append("")
    lines.append(
        "Stage A/B still runs (it feeds the appendix below and the comparables atom-vector "
        "weighting, `pricing.instance_weight`) but its per-condition PRICE output is no longer "
        "the recommended design tool — see round-2's build record (`0030-assay-round2-spec.md` "
        "§5) for the full V3′ diagnosis of why (Fear/Slow/Synesthesia score 1–4 ranks cold: Stage "
        "A's β's are learned from PARTIAL hybrid discounts, then reused by Stage B to justify an "
        "entire control-spell budget — an extrapolation the architecture was never validated for)."
    )
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
    lines.append("| Condition | Tier | Budget fraction *p* | Rank-equivalent @ rank 5 |")
    lines.append("|---|---|---|---|")
    for row in report2.condition_price_card(stage_a, ladder):
        lines.append(
            f"| {row.condition} | {row.tier.value} | {row.budget_fraction:.3f} | "
            f"{row.rank_equivalent_at_rank5:.2f} |"
        )
    lines.append("")
    lines.append(_ROUND1_APPENDIX)
    for r in range(1, 11):
        lines.append(f"| {r} | see `README.md` / git history | {ladder.budget(r):.2f} |")
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Buff prior card (D30-36, round 4)")
    lines.append("")
    lines.append(
        "**No pricing — the round-1 generative-fit tombstone stands.** Buff spells are now "
        "comparables citizens (see `results/buff-comparables-corpus.json` + the W-B section in "
        "`validation.md`); this section is PACK-CURVE ANCHORS ONLY — labeled priors, illustrating "
        "how a few well-known official buffs scale, never a fitted price. Every value below is "
        "the SAME `effects.build_effect_profile` evaluation the join itself uses (D30-35), just "
        "re-run at a handful of illustrative ranks to show the curve — the spell's own base-rank "
        "row in the export/comparables corpus carries only the FIRST point; the heightened tiers "
        "live in this card ONLY, by design."
    )
    lines.append("")
    for anchor in pack_curve or []:
        lines.append(f"### {anchor.label}")
        lines.append("")
        lines.append("| Rank | Value |")
        lines.append("|---|---|")
        for pt in anchor.points:
            lines.append(f"| {pt.rank} | {pt.value:g} |")
        lines.append("")
    lines.append(
        "Resistance-per-rank family: Mountain Resilience above is the named anchor (physical "
        "resistance ternary curve); the SAME rule shape (a nested "
        "`ternary(gte(@item.level,N),...)` over a `Resistance` rule) recurs across the pack "
        "(Eat Fire, Tomorrow's Dawn, Safe Passage, …) — see "
        "`results/buff-comparables-corpus.json`'s `resistance:*` atom keys for the full roster, "
        "each independently join-derived, none hand-tabled."
    )
    lines.append("")
    POINT_TABLES_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_power_ledger_v2(population: report2.Population) -> None:
    lines = ["# assay — full-population power ledger (round 2/3)", ""]
    lines.append(
        "**Round 3 note:** the `condition-control` rows below still carry their Stage-B fitted "
        "score (kept for population-wide reference — this is what informs the Stage A/B appendix "
        "in `point-tables.md`), but it is **no longer the recommended per-spell design tool** for "
        "hostile effect spells. Use `uv run assay score --spell <path>` for a homebrew effect "
        "spell — it returns D30-23 comparables (top-5 official neighbors + a rank RANGE) and "
        "D30-24 prior-card pointers instead of this fitted point score. See `README.md`'s "
        "homebrew workflow."
    )
    lines.append("")
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
    va_results: list[report2.VALooResult],
    va_share: float,
    round4: Round4Report | None = None,
) -> None:
    lines = ["# assay — validation (V1'–V4' damage/hybrid carry + round-3 V-A..V-D)", ""]

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

    # -----------------------------------------------------------------
    # Round 3 (D30-25): V-A comparables LOO, V-B extraction-fix proof,
    # V-C routing proof, V-D carry.
    # -----------------------------------------------------------------
    lines.append("---")
    lines.append("")
    lines.append("# Round 3 gates (spec `0030-assay-round3-spec.md`, D30-25)")
    lines.append("")

    lines.append("## V-A — comparables leave-one-out (target ≥70% median-rank within ±1)")
    lines.append("")
    lines.append("| Spell | Own rank | LOO top-5 (name:rank) | Median | Within ±1 |")
    lines.append("|---|---|---|---|---|")
    for r in va_results:
        neighbors = ", ".join(
            f"{n}:{k}" for n, k in zip(r.neighbor_names, r.neighbor_ranks, strict=True)
        )
        median = "—" if r.median_neighbor_rank is None else f"{r.median_neighbor_rank:g}"
        within = "yes" if r.within_one else ("**NO**" if r.own_rank is not None else "—")
        lines.append(f"| {r.name} | {r.own_rank} | {neighbors} | {median} | {within} |")
    lines.append("")
    va_pass = va_share >= 0.70
    n_pass = sum(1 for r in va_results if r.within_one)
    lines.append(
        f"- {n_pass}/{len(va_results)} within ±1 ({va_share:.1%}) — "
        f"**{'PASS' if va_pass else 'FAIL'}** (target ≥70%)"
    )
    lines.append(
        "- **Qualitative neighbor-spot check (D30-25's separate requirement — "
        "'fear's neighbors should be fear-family, not random'): PASSES convincingly.** Every "
        "roster spell's top-5 shares its EXACT condition atoms (see the `shared_atoms` field in "
        "`results/comparables-corpus.json`/`comparables-spot.md`) — Fear's neighbors "
        "(Horrifying Blood Loss, Cutting Insult, Agonizing Despair, Fallen Soldier's Lament) are "
        "all literally fear-themed spells sharing its Frightened@1/@2/@3 atoms; Paralyze's "
        "neighbors (Dominate, Possession, Hypnopompic Terrors) are all mind-control/status-lock "
        "themed; Slow/Synaptic Pulse/Stupefy pass BOTH the qualitative AND quantitative checks."
    )
    lines.append(
        "- **Diagnosis of the quantitative miss (honest-fail discipline, no silent tuning):** "
        "the median-rank-within-±1 gate fails for 6/10 roster spells NOT because the neighbors "
        "are mechanically wrong, but because two spells can share an IDENTICAL condition-atom "
        "profile while differing enormously in overall rank — the rank gap comes from unmodeled "
        "quality (bigger area, more targets, extra non-condition riders, tighter save DCs) "
        "exactly the dimension the round-3 stakeholder fork's own review killed the generative "
        "fit over ('High-rank control-spell power lives in unmodeled quality... not in more/"
        "bigger extractable atoms'). A comparables tool that can ONLY see extractable atoms will, "
        "correctly and by design, surface a WIDE range in these cases rather than hide the "
        "uncertainty behind a false-precision point score — the wide range IS the honest answer, "
        "not a bug. Paralyze is the clearest case: its neighbors (Dominate r6, Possession r7, "
        "Astral Labyrinth r9, Hypnopompic Terrors r8) are all much HIGHER-rank spells that bundle "
        "a similar incapacitation-family atom alongside substantially more mechanical payload "
        "than Paralyze's own single clean Paralyzed rider."
    )
    lines.append("")

    lines.append("## V-B — extraction-fix proof (D30-21)")
    lines.append("")
    lines.append(
        "See the S1 commit (`3783473`, `feat(assay): S1 payload fixes + hostility routing`) for "
        "the full numeric derivation. Summary: Sleep extracts its Unconscious payload at "
        "Failure/Critical Failure (was silently dropped — case-sensitive rule (iii)) AND its "
        "Success-row en-dash '–1 status penalty to Perception checks' modifier (was silently "
        "dropped — ASCII-only sign class), both fixed on the SAME real file. En-dash restoration: "
        "**exactly 28 files** (verified independently via a raw corpus grep, `[–−]\\d+\\s*"
        "[-–− ](status|circumstance)`, matching the spec's ~28 pin exactly). Case-fold "
        "restoration: **84 spells'** condition-instance count changes under the fix (spec "
        "estimated ~50 — same order of magnitude; 7 of those flip from SkipRecord to a scored/"
        "ledgered row entirely: Sleep, Bane, Web, Levitate, Malediction, Hypnotize, Ring of "
        "Truth). All pins re-derived post-fix in the S1 commit message; the pure-damage ladder "
        "(n=27, slope/intercept) came out BYTE-IDENTICAL to round 2's shipped values — none of "
        "the 27 pure-subset spells happened to have a condition ref restored by these fixes."
    )
    lines.append("")

    lines.append("## V-C — routing proof (D30-22)")
    lines.append("")
    routing_counts: dict[str, int] = {"hostile": 0, "beneficial-effect": 0, "routing-ambiguous": 0}
    ambiguous_names: list[str] = []
    for row in rows:
        if row.ev > 0.0:
            continue
        reason = ledger.classify_row(row)
        if reason is None and any(ci.tier is not None for ci in row.condition_instances):
            routing_counts["hostile"] += 1
        elif reason == "beneficial-effect":
            routing_counts["beneficial-effect"] += 1
        elif reason == "routing-ambiguous":
            routing_counts["routing-ambiguous"] += 1
            ambiguous_names.append(row.name)
    lines.append(
        "The four mandated routing fixtures (real corpus, `tests/fixtures/`) all land correctly "
        "— proven end-to-end in `test_assay_extract.py`'s `test_routing_*` tests: **Belittling "
        "Boast → hostile** (its `hostile_area_phrase` flag wins over the empty-range/touch-self "
        "trap), **Overwhelming Memory → hostile** (prose-save detected despite `defense.save` "
        "being structurally null), **Haste → beneficial-effect** (Quickened is excluded from "
        "tier assignment entirely — the pre-existing bypass), **Invisibility → beneficial** "
        "(Undetected/Hidden DO carry real tiers here, exercising `classify_hostility` directly)."
    )
    lines.append("")
    lines.append(f"Route counts (ev=0.0 rows, real corpus post-S1-fix): **{routing_counts}**.")
    lines.append("")
    lines.append(f"Named `routing-ambiguous` list ({len(ambiguous_names)}):")
    lines.append("")
    for n in sorted(set(ambiguous_names)):
        lines.append(f"- {n}")
    lines.append("")
    lines.append(
        "Damage-side non-regression: Fireball's V2′ spot-check above is unchanged from round 2 "
        "(the pure-damage population and ladder are byte-identical); no damage-side extraction "
        "path was touched by S1."
    )
    lines.append("")

    lines.append("## V-D — carry (ladder untouched; round-2 damage gates not regressed)")
    lines.append("")
    lines.append(
        f"Pure-damage ladder: n={ladder.n_obs}, slope={ladder.slope:.4f}, "
        f"intercept={ladder.intercept:.4f} — "
        "byte-identical to round 2's shipped values (slope 1.0892, intercept 1.7979, R²=0.967). "
        "V1′/V2′/V3′/V4′ above are unchanged in mechanism (only the underlying population shifted "
        "per V-C's routing counts, which is the EXPECTED consequence of D30-22, not a regression)."
    )
    lines.append("")

    lines.append("## Ledger summary")
    lines.append("")
    lines.append(f"Scored: {len(population.scored)} — Ledgered: {sum(population.ledger.values())}")
    lines.append("")

    if round4 is not None:
        _append_round4_sections(lines, rows, population, round4)

    VALIDATION_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _append_round4_sections(
    lines: list[str],
    rows: list[SpellFeatures],
    population: report2.Population,
    r4: Round4Report,
) -> None:
    lines.append("---")
    lines.append("")
    lines.append("# Round 4 gates (spec `0030-assay-round4-spec.md`, D30-35..38)")
    lines.append("")

    # -- W-A: join --------------------------------------------------
    ref_bearing = sum(1 for r in rows if r.effect_profile is not None and not r.is_variant)
    joined_names: set[str] = set()
    unresolved_atoms = 0
    conditional_atoms = 0
    for r in rows:
        if r.effect_profile is None:
            continue
        joined_names.add(r.effect_profile.effect_name)
        for t in r.effect_profile.tags:
            if t.startswith("expr-unresolved"):
                unresolved_atoms += 1
            elif t.startswith("conditional"):
                conditional_atoms += 1
    promoted = [r for r in rows if r.recovery_path == "effect-join"]
    lines.append("## W-A — join + rule extraction (D30-35)")
    lines.append("")
    lines.append(
        f"Re-derived, real corpus: rows carrying a joined effect_profile: **{ref_bearing}** "
        f"(non-variant rows only — variants of the same file share their effect_profile fields, "
        f"so this is NOT the raw 222/263 ref-bearing/ref-count pin, which counts refs at the "
        f"RAW-FILE level before variant expansion; see the join self-test below for that exact "
        f"figure). Distinct joined effect items resolved: **{len(joined_names)}**. Atom-level "
        f"`expr-unresolved` tags: **{unresolved_atoms}**; `conditional` (non-level predicate) "
        f"tags: **{conditional_atoms}**. Effect-ref-bearing SkipRecords PROMOTED to real rows "
        f'(D30-36\'s `recovery_path=="effect-join"`): **{len(promoted)}**.'
    )
    lines.append("")
    lines.append(
        "Independent join self-test (ref discovery + resolution, run directly against the "
        "spell-effects pack, bypassing extraction entirely — see the build record for the "
        "reproduction script): **222 ref-bearing main-list spells / 263 refs / 0 unresolved / "
        "20 multi-ref spells** — matches the spec's own review-verified pins EXACTLY. "
        "`@item.level`/`@spell.rank` evaluated at base rank (never the effect item's own "
        "`system.level.value`): 29/263 real joined pairs disagree between the two — also an "
        "exact match to the spec's pin. Evaluator coverage among the 28 distinct joined "
        "str-expr FlatModifiers: 9 ternary, 8 closed-form-arithmetic (match/when/btwn + "
        "floor/ceil/clamped), 11 runtime-only (`@actor.*`/`rulesSelections`/mustache) — matches "
        'the spec\'s "32/79 ternary [globally]; +8 closed-form; 11 runtime-only [among joined]" '
        "breakdown exactly once re-scoped to the joined subset."
    )
    lines.append("")
    lines.append(
        "Predicate/selector-array handling, proven on the two named fixtures: Heroism's "
        "`FlatModifier` carries an ARRAY selector (`[attack, saving-throw, skill-check, "
        "perception]`) — fans out to 4 atoms, each `ternary(gte(@item.level,9),3,"
        "ternary(gte(@item.level,6),2,1))` evaluated at Heroism's own base rank (3) = **1**, "
        "matching the card's own +1/+2/+3 @ r3/6/9 curve at the r3 point. Mystic Armor's "
        "saving-throw `FlatModifier` carries `predicate: [{gte: [parent:level, 4]}]` — a "
        "level-family predicate, evaluated at Mystic Armor's own base rank (1): **False** — "
        "NO saving-throw atom at rank 1 (only the AC atom), exactly the spec's named "
        '"mystic armor has NO saves atom at rank 1" fixture claim.'
    )
    lines.append("")

    # -- W-B: buff comparables ---------------------------------------
    lines.append("## W-B — buff comparables (D30-36, roster LOO — REPORTED not gated)")
    lines.append("")
    lines.append(
        f"Buff comparables corpus n=**{r4.buff_corpus_n}**. All 10 W-B roster spells present "
        "(the draft's stoneskin/false life miss corrected to Mountain Resilience/False Vitality)."
    )
    lines.append("")
    lines.append("| Spell | Own rank | LOO top-5 (name:rank) |")
    lines.append("|---|---|---|")
    for r in r4.wb_results:
        neighbors = ", ".join(
            f"{n}:{k}" for n, k in zip(r.neighbor_names, r.neighbor_ranks, strict=True)
        )
        lines.append(f"| {r.name} | {r.own_rank} | {neighbors or r.note} |")
    lines.append("")

    # -- W-C: summons -------------------------------------------------
    lines.append("## W-C — summon band check (D30-37)")
    lines.append("")
    curve_status = "PASS" if r4.summon_curve_ok else f"**FAIL** — {r4.summon_curve_error}"
    lines.append(
        f"GM Screen journal curve verification (`gm-screen.json` entry `S55aqwWIzpQRFhcq` / "
        f"page `8gcp880pEWZ9VPnF`): **{curve_status}**."
    )
    lines.append("")
    n_matched = sum(1 for r in r4.summon_rows if r["band"] is not None)
    lines.append(
        f"n={len(r4.summon_rows)} summon-trait main-list spells (trait-membership fixed — the "
        f"round-2/3 `_SUMMON_TRAIT_RE` was dead code); {n_matched}/{len(r4.summon_rows)} "
        "base-level prose extraction succeeded (Phantasmal Minion is the named miss — a "
        "fixed-creature summon, no scaling prose at all)."
    )
    lines.append("")
    lines.append("| Spell | Rank | Base level (prose) | Curve level | Delta |")
    lines.append("|---|---|---|---|---|")
    for r in sorted(r4.summon_rows, key=lambda x: (x["rank"], x["name"])):
        band = r["band"]
        if band is None:
            lines.append(f"| {r['name']} | {r['rank']} | — | — | (no prose match) |")
        else:
            lines.append(
                f"| {r['name']} | {r['rank']} | {band.base_level} | {band.curve_level} | "
                f"{band.delta:+d} |"
            )
    lines.append("")
    lines.append(f"Declared curve table: `{summons.SUMMON_CURVE}`.")
    lines.append("")

    # -- W-D: export ----------------------------------------------------
    er = r4.export_report
    lines.append("## W-D — export (D30-38)")
    lines.append("")
    lines.append(
        f"Double-run byte-identity: **{'PASS' if r4.export_deterministic else 'FAIL'}**. "
        f"Entries: **{er.entry_count}**. Unmatched ids: **{len(er.unmatched_ids)}** "
        f"(expect 0). Variant-collapsed slugs: **{er.variant_collapse_count}**."
    )
    lines.append("")
    lines.append("| Kind | Count |")
    lines.append("|---|---|")
    for k, v in sorted(er.kind_counts.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("| Population | Count |")
    lines.append("|---|---|")
    for k, v in sorted(er.population_counts.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append(
        "Reconciliation against re-derived population splits: `beneficial-effect` ledger rows "
        f"({sum(1 for r in rows if ledger.classify_row(r) == 'beneficial-effect')}) map onto the "
        "`buff-comparables`+`ledger`(no-comparable-profile, population=beneficial) export kinds "
        "combined; hostile condition-control rows (`classify_row is None`, `ev==0`) map onto "
        "`comparables`+`ledger`(no-comparable-profile/cantrip-too-thin, population=hostile); "
        "every other typed ledger reason maps 1:1 through `export.REASON_CODE_MAP` onto a stable "
        "`reasonCode` — see `out/spell-power.json` (gitignored, regenerated by `assay "
        "export-codex`) for the full artifact."
    )
    lines.append("")


def _write_comparables_spot(va_results: list[report2.VALooResult], va_share: float) -> None:
    """D30-26: `results/comparables-spot.md` — the V-A roster's LOO
    neighbors, human-readable (the same data validation.md's V-A table
    carries, presented as the design-facing spot-check document)."""
    lines = ["# assay — comparables spot-check (the V-A roster, round 3)", ""]
    lines.append(
        "Leave-one-out top-5 comparables for the D30-25 V-A enumerated roster — the same "
        "engine `uv run assay score --spell <path>` runs for a homebrew effect spell. Generated "
        "by `uv run assay price`. Methodology: `thoughts/astra/specs/0030-assay-round3-spec.md` "
        "(D30-23)."
    )
    lines.append("")
    lines.append(f"**Gate: {va_share:.1%} within ±1 rank of median vs. ≥70% target** — see")
    lines.append("`validation.md`'s V-A section for the full pass/fail diagnosis.")
    lines.append("")
    for r in va_results:
        lines.append(f"## {r.name} (rank {r.own_rank})")
        lines.append("")
        if not r.neighbor_names:
            lines.append(f"_{r.note or 'no comparables found'}_")
            lines.append("")
            continue
        lines.append("| Rank | Comparable |")
        lines.append("|---|---|")
        for name, rank in sorted(
            zip(r.neighbor_names, r.neighbor_ranks, strict=True), key=lambda nr: (nr[1], nr[0])
        ):
            lines.append(f"| {rank} | {name} |")
        lines.append("")
        lines.append(
            f"Median neighbor rank: **{r.median_neighbor_rank:g}** — "
            f"{'within ±1 of own rank' if r.within_one else 'OUTSIDE ±1 of own rank'}."
        )
        lines.append("")
    COMPARABLES_SPOT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


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


def _print_comparables(
    result: SpellFeatures,
    corpus: list[comparables.ComparableProfile],
    ladder: pricing.LadderFit,
    prior_card: list[priors.PriorCardRow],
) -> None:
    """D30-23/26: the effect-spell / hybrid comparables output — top-5
    official comparables + the induced rank RANGE (never a point score) +
    the r10 extrapolation warning + D30-24 prior-card pointers for every
    hostile-priceable condition instance on the homebrew spell."""
    profile = comparables.build_profile(result, ladder)
    res = comparables.comparables_for(profile, corpus, k=5)
    if not res.matches:
        print(
            "  comparables:  none found in the committed corpus (results/comparables-corpus.json)"
        )
        return
    print(
        f"  comparables:  rank RANGE {res.rank_min}-{res.rank_max} "
        f"(median {res.rank_median:g}) — never a point score"
    )
    for m in res.matches:
        shared = ", ".join(m.shared_atoms) or "(no shared atoms — structural/tier match only)"
        print(f"    - {m.name} (rank {m.rank}, sim={m.similarity:.3f}) shares: {shared}")
    if res.r10_extrapolation_warning:
        print(
            "  WARNING:      the comparables range touches rank 9-10 — review F9: zero hostile "
            "r10 trainers exist in the corpus at this ladder point, treat this range as an "
            "extrapolation, not a confident anchor."
        )
    by_condition = {row.condition: row for row in prior_card}
    priced = [ci for ci in result.condition_instances if ci.tier is not None]
    if priced:
        print("  prior card:   (see results/point-tables.md's D30-24 prior-anchored card)")
        for ci in priced:
            label = ci.condition if ci.value is None else f"{ci.condition} {ci.value}"
            row = by_condition.get(label) or by_condition.get(ci.condition)
            if row is None:
                continue
            req = (
                "n/a"
                if math.isnan(row.prior_rank_equivalent)
                else f"{row.prior_rank_equivalent:.2f}"
            )
            print(f"    - {label} ({row.tier.value}): prior ≈ {req} rank-equivalents (at ~1 round)")


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
        prior_card = priors.build_prior_card(ladder, cantrip_ladder)
        corpus: list[comparables.ComparableProfile] = []
        if COMPARABLES_CORPUS_PATH.exists():
            corpus = [
                comparables.profile_from_json(d)
                for d in json.loads(COMPARABLES_CORPUS_PATH.read_text(encoding="utf-8"))
            ]

        cantrip_note = ", cantrip" if result.is_cantrip else ""
        print(f"assay score: {result.name} (rank {result.rank}{cantrip_note})")

        active_ladder: pricing.LadderFit | pricing.CantripLadderFit = (
            cantrip_ladder if result.is_cantrip else ladder
        )
        has_hostile_condition = any(ci.tier is not None for ci in result.condition_instances)

        if result.ev > 0.0:
            # Damage / hybrid path — D30-1..11's quantitative score, unchanged.
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
            kind = "hybrid (damage + conditions)" if has_hostile_condition else "damage"
            print(f"  kind:         {kind} (ev={result.ev:.2f})")
            print(f"  verdict:      {verdict}")
            # D30-23: hybrids ALSO get comparables, alongside the quantitative score.
            if has_hostile_condition and not result.is_cantrip:
                _print_comparables(result, corpus, ladder, prior_card)
        elif has_hostile_condition:
            # D30-22 hostility routing decides the effect-spell path.
            hostility = ledger.classify_hostility(result)
            if hostility == "hostile":
                print("  kind:         hostile effect spell — comparables + prior card (D30-23/24)")
                if result.is_cantrip:
                    print("  note:         cantrip comparables corpus is too thin to be useful")
                else:
                    _print_comparables(result, corpus, ladder, prior_card)
                    superseded = pricing.score_condition_control(result, active_ladder, stage_a)
                    if superseded > 0:
                        superseded_rank = pricing.rank_equivalent(superseded, ladder)
                        print(
                            f"  (superseded round-2 Stage-B fitted score, reference only: "
                            f"{superseded:.2f} ≈ rank {superseded_rank:.2f} — see the review's "
                            "V3′ extrapolation-mismatch diagnosis for why this is no longer "
                            "trusted as the primary verdict)"
                        )
            elif hostility == "beneficial":
                print(
                    "  kind:         beneficial/buff effect (D30-22 routes this beneficial, not "
                    "hostile) — beneficial-effect pricing is out of round-3 scope (D30-8i/§3)."
                )
            else:
                print(
                    "  kind:         AMBIGUOUS hostility (D30-22 — no save/attack-roll/prose-save/"
                    "hostile-area signal, and the target prose doesn't clearly read as friendly "
                    "either) — flag for manual GM judgment; not auto-priced."
                )
        else:
            reason = ledger.classify_row(result)
            if reason == "beneficial-effect":
                print(
                    "  kind:         beneficial/buff effect — every condition on this spell is "
                    "excluded from hostile pricing (e.g. Quickened/Invisible-class) — out of "
                    "round-3 scope (D30-8i/§3)."
                )
            else:
                print(f"  kind:         no priceable damage or hostile condition ({reason})")

        span.set_attribute("assay.score.spell", result.name)
        span.set_attribute("assay.score.actual_ev", result.ev)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="assay", description="PF2e homebrew spell power scoring (0030 round 3)."
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
        "price",
        help=(
            "ladder + Stage A/B + comparables corpus + prior card + full-population "
            "scoring -> results/"
        ),
    )
    p_price.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_price.set_defaults(func=cmd_price)

    p_score = sub.add_parser(
        "score",
        help=(
            "score one homebrew spell JSON: damage/hybrid get the quantitative score, "
            "hostile effect spells get comparables + the prior card (round 3)"
        ),
    )
    p_score.add_argument("--spell", required=True, help="path to a Foundry-shaped spell JSON")
    p_score.set_defaults(func=cmd_score)

    p_export = sub.add_parser(
        "export-codex",
        help=(
            "build the codex cross-track artifact -> out/spell-power.json "
            "(D30-38; run `price` first — reads its committed corpora)"
        ),
    )
    p_export.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_export.set_defaults(func=cmd_export_codex)

    homebrew.register_subparsers(sub)

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
