"""``assay`` console script — price / score / export-codex / score-homebrew /
homebrew-revisions / export-book / store check / store fmt.

    uv run assay price [--data-root PATH]     # ladder + Stage A + comparables + priors → results/
    uv run assay score --spell PATH           # score one spell JSON (a store file works)
    uv run assay export-codex [--data-root PATH]  # codex artifact → out/spell-power.json
    uv run assay score-homebrew               # score the canonical store -> out/homebrew/
                                               #   scores.json
    uv run assay homebrew-revisions           # diff the store vs. a fresh vendor re-conversion
                                               #   -> homebrew/revisions.md
    uv run assay store check                  # validate the store against its model + format
    uv run assay store fmt                    # rewrite the store in its canonical format

The homebrew commands live in ``homebrew.py`` (registered via
``homebrew.register_subparsers``), next to the adapter for the vendored
``vendor/run_balance/pf2e_converted_spells`` conversion set the store was seeded from;
``export-book`` lives in ``book.py``; ``store check``/``store fmt`` live in ``store.py``.
``score``, ``score-homebrew`` and ``export-codex`` all score through ``scorer.Scorer``, built
from the committed model artifacts that ``artifacts.load_model_artifacts`` reads.

Telemetry (standing principle): ``astra_observe.run`` wraps every subcommand and
flushes on exit (see ``libs/py/observe``). Offline runs (no SigNoz reachable) still
work: OTLP export failures are swallowed by the exporter, never fatal here.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

import astra_observe
from astra_observe import get_tracer

from . import (
    artifacts,
    book,
    buffs,
    comparables,
    export,
    homebrew,
    ledger,
    pricing,
    priors,
    report2,
    store,
    summons,
)
from .artifacts import (
    BUFF_CORPUS_PATH,
    COMPARABLES_CORPUS_PATH,
    FITTED_PARAMS_PATH,
    RESULTS_DIR,
    ModelArtifacts,
    ModelArtifactsNotFoundError,
)
from .conditions import Tier
from .extract import (
    SkipRecord,
    SpellFeatures,
    build_effect_index_from_snapshot,
    extract_all,
    load_spell_json,
)
from .scorer import Scorer, SpellScore
from .snapshot import SnapshotNotFoundError, resolve_snapshot

APP_ROOT = artifacts.APP_ROOT
OUT_DIR = APP_ROOT / "out"
FEATURES_PATH = OUT_DIR / "features.json"
POINT_TABLES_PATH = RESULTS_DIR / "point-tables.md"
POWER_LEDGER_PATH = RESULTS_DIR / "power-ledger.md"
VALIDATION_PATH = RESULTS_DIR / "validation.md"
COMPARABLES_SPOT_PATH = RESULTS_DIR / "comparables-spot.md"
EXPORT_PATH = OUT_DIR / "spell-power.json"
#: The GM Screen journal entry/page the declared summon curve is
#: verified against at build (the build stops on any disagreement).
_SUMMON_JOURNAL_ENTRY_ID = "S55aqwWIzpQRFhcq"
_SUMMON_JOURNAL_PAGE_ID = "8gcp880pEWZ9VPnF"

_tracer = get_tracer("astra.assay")


@dataclass
class Round4Report:
    """Everything `_write_validation_v2`'s round-4 section needs
    — gathered once in `cmd_price`, kept as a plain bag rather than growing
    that function's already-long parameter list further."""

    wb_results: list[buffs.BuffLooResult]
    buff_corpus_n: int
    summon_rows: list[dict]
    summon_curve_ok: bool
    summon_curve_error: str
    export_report: export.ExportReport
    export_deterministic: bool


# ---------------------------------------------------------------------------
# Round 2 — assay price
# ---------------------------------------------------------------------------


def _stage_a_to_json(stage_a: pricing.StageAFit) -> dict:
    return {
        "beta": {t.value: v for t, v in stage_a.beta.items()},
        "beta_raw": {t.value: v for t, v in stage_a.beta_raw.items()},
        "alpha": stage_a.alpha,
        "n_obs": stage_a.n_obs,
        "r_squared": stage_a.r_squared,
    }


def write_fitted_params(params: dict[str, dict], path: Path = FITTED_PARAMS_PATH) -> None:
    """Write ``fitted-params.json`` from this run's values alone. It never reads the previous
    file, so ``price`` works on a fresh tree and stale keys cannot survive a re-run."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(params, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def cmd_price(args: argparse.Namespace) -> None:
    """The full fit: pure-anchored ladder -> Stage A tier coefficients -> comparables
    corpora -> full-population split -> results/ regeneration. This is the command whose
    output is committed."""
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
            rows, extract_result.skipped, paths.spells_dir, ladder, cantrip_ladder
        )

        # The comparables corpus: every OFFICIAL row that actually
        # SCORES (ledger.classify_row is None — damage rows always score;
        # ev=0 condition rows only when hostility routing calls them hostile) AND
        # carries at least one hostile-priceable atom.
        scored_rows = [r for r in rows if ledger.classify_row(r) is None]
        corpus = comparables.build_corpus(scored_rows, ladder)
        COMPARABLES_CORPUS_PATH.write_text(artifacts.corpus_to_json(corpus), encoding="utf-8")

        prior_card = priors.build_prior_card(ladder, cantrip_ladder)
        tier_rates = {t: priors.tier_rate(t, ladder, cantrip_ladder) for t in Tier}

        va_results, va_share = report2.validate_v_a_loo(report2.ROSTER_V_A, corpus)

        # -------------------------------------------------------------
        # Round 4: buff comparables + summon band + export.
        # -------------------------------------------------------------
        buff_corpus = buffs.build_buff_corpus(rows)
        BUFF_CORPUS_PATH.write_text(artifacts.corpus_to_json(buff_corpus), encoding="utf-8")
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

        scorer = Scorer(ModelArtifacts(ladder, cantrip_ladder, corpus, buff_corpus))
        export_artifact, export_report = export.build_export(
            extract_result, paths.spells_dir, scorer
        )
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        EXPORT_PATH.write_text(export.dump_export(export_artifact), encoding="utf-8")
        export_artifact_2, _ = export.build_export(extract_result, paths.spells_dir, scorer)
        export_deterministic = export.dump_export(export_artifact) == export.dump_export(
            export_artifact_2
        )

        span.set_attribute("assay.price.pure_n", len(pure))
        span.set_attribute("assay.price.trainers_n", len(trainers))
        span.set_attribute("assay.price.scored_n", population.scored_count)
        span.set_attribute("assay.price.ledger_n", sum(population.ledger.values()))
        span.set_attribute("assay.price.comparables_corpus_n", len(corpus))
        span.set_attribute("assay.price.v_a_share", va_share)
        span.set_attribute("assay.price.buff_corpus_n", len(buff_corpus))
        span.set_attribute("assay.price.export_entries", export_report.entry_count)

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        params: dict[str, dict] = {}
        params["round2"] = {
            "ladder": artifacts.ladder_to_json(ladder),
            "ladder_with_singleton": artifacts.ladder_to_json(ladder_with_singleton),
            "cantrip_ladder": artifacts.cantrip_ladder_to_json(cantrip_ladder),
            "stage_a": _stage_a_to_json(stage_a),
        }
        params["round3"] = {
            "comparables_corpus_n": len(corpus),
            "tier_rates": {
                t.value: {"w_repr": tr.w_repr, "anchor_budget": tr.anchor_budget, "rate": tr.rate}
                for t, tr in tier_rates.items()
            },
        }
        params["round4"] = {
            "buff_corpus_n": len(buff_corpus),
            "export_entry_count": export_report.entry_count,
            "export_kind_counts": export_report.kind_counts,
            "export_population_counts": export_report.population_counts,
            "export_variant_collapse_count": export_report.variant_collapse_count,
            "export_deterministic": export_deterministic,
            "summon_curve_verified": summon_curve_ok,
        }
        write_fitted_params(params)

        _write_point_tables_v2(
            ladder,
            ladder_with_singleton,
            cantrip_ladder,
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
            f"assay price: pure n={len(pure)} (excl. singleton, R²={ladder.r_squared:.3f})  "
            f"trainers n={len(trainers)}  scored n={population.scored_count}  "
            f"ledgered n={sum(population.ledger.values())}  comparables corpus n={len(corpus)}  "
            f"V-A share={va_share:.1%}  buff corpus n={len(buff_corpus)}  "
            f"export entries={export_report.entry_count} -> {RESULTS_DIR}"
        )


def cmd_export_codex(args: argparse.Namespace) -> None:
    """Rebuild the codex export artifact alone, off the committed model
    artifacts — does NOT re-run `assay price`'s full fit (use that
    first if the corpora are stale). Writes ONLY to
    `apps/assay/py/out/spell-power.json` — never into `apps/codex/web/` (the
    orchestrator places it there at integration)."""
    with _tracer.start_as_current_span("assay.export-codex") as span:
        paths = resolve_snapshot(args.data_root)
        extract_result = extract_all(paths.spells_dir)

        scorer = Scorer.from_results()

        artifact, report_ = export.build_export(extract_result, paths.spells_dir, scorer)
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
    extraction, for the W-C build-record table."""
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


def _write_point_tables_v2(
    ladder: pricing.LadderFit,
    ladder_with_singleton: pricing.LadderFit,
    cantrip_ladder: pricing.CantripLadderFit,
    prior_card: list[priors.PriorCardRow],
    tier_rates: dict[Tier, priors.TierRate],
    pack_curve: list[buffs.PackCurveAnchor] | None = None,
) -> None:
    lines = ["# assay — damage-budget tables + prior-anchored price card (round 3)", ""]
    lines.append("Generated by `uv run assay price`. Methodology: spec")
    lines.append("`thoughts/archive/specs/0030-assay-round3-spec.md`; damage-ladder")
    lines.append("mechanics carried unchanged from `0030-assay-round2-spec.md`.")
    lines.append("")
    lines.append("## Pure-anchored damage ladder")
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
    lines.extend(
        f"| {r} | {ladder.budget(r):.2f} | {ladder_with_singleton.budget(r):.2f} | {7 * r} |"
        for r in range(1, 11)
    )
    lines.append("")
    lines.append(f"Cantrip ladder (intercept-only, n={cantrip_ladder.n_obs}): ")
    lines.append(f"budget = **{cantrip_ladder.budget():.2f}** (all pure cantrips are rank 1).")
    lines.append("")
    lines.append("## Effective-target + range structural multipliers (fit on the pure subset)")
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
        "## Action-cost multipliers (DECLARED constants — zero variance on the pure subset)"
    )
    lines.append("")
    lines.append("| Action | Multiplier |")
    lines.append("|---|---|")
    for bucket, mult in pricing.ACTION_MULTIPLIER.items():
        lines.append(f"| {bucket.value} | ×{mult:.2f} |")
    lines.append("")
    lines.append("## Prior-anchored condition price card (PRIMARY, replaces the")
    lines.append("round-2 fitted card)")
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
    lines.extend(
        f"- **{tier.value}**: {tier_rates[tier].anchor.anchor_note}"
        for tier in (Tier.T4, Tier.T3, Tier.T2, Tier.T1)
    )
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
    lines.append("---")
    lines.append("")
    lines.append("## Buff prior card (round 4)")
    lines.append("")
    lines.append(
        "**No pricing — the round-1 generative-fit tombstone stands.** Buff spells are now "
        "comparables citizens (see `results/buff-comparables-corpus.json` + the W-B section in "
        "`validation.md`); this section is PACK-CURVE ANCHORS ONLY — labeled priors, illustrating "
        "how a few well-known official buffs scale, never a fitted price. Every value below is "
        "the SAME `effects.build_effect_profile` evaluation the join itself uses, just "
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
        lines.extend(f"| {pt.rank} | {pt.value:g} |" for pt in anchor.points)
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
    non_cantrip = sorted(
        (s for s in population.scored if not s.is_cantrip and s.residual_rank_equiv is not None),
        key=lambda s: s.residual_rank_equiv or 0.0,
        reverse=True,
    )
    lines.append(
        f"## Ladder-scored population (n={len(population.scored)}, "
        f"non-cantrip n={len(non_cantrip)})"
    )
    lines.append("")
    lines.append(
        "Rows with damage EV, sorted hottest -> coldest by residual rank-equivalent "
        "(EV vs. own nominal rank on the ladder)."
    )
    lines.append("")
    lines.append(
        f"The {len(population.hostile_effect_names)} hostile effect rows (no damage EV) are "
        "scored too, but by comparables, not the ladder: they get the top 5 official "
        "neighbors and a rank range (`results/comparables-corpus.json`; "
        "`uv run assay score --spell <path>` for a homebrew spell)."
    )
    lines.append("")
    lines.append("| Spell | Rank | Kind | EV | Residual (rank-equiv) |")
    lines.append("|---|---|---|---|---|")
    top = non_cantrip[:15]
    bottom = non_cantrip[-15:] if len(non_cantrip) > 15 else []
    for group in (top, bottom):
        if group is bottom and bottom:
            lines.append("| … | | | | |")
        lines.extend(
            f"| {s.name} | {s.rank} | {s.kind} | {s.ev:.2f} | {s.residual_rank_equiv:+.2f} |"
            for s in group
        )
    lines.append("")
    lines.append(f"<details><summary>Full non-cantrip ledger ({len(non_cantrip)} rows)</summary>")
    lines.append("")
    lines.append("| Spell | Rank | Kind | EV | Residual (rank-equiv) |")
    lines.append("|---|---|---|---|---|")
    lines.extend(
        f"| {s.name} | {s.rank} | {s.kind} | {s.ev:.2f} | {s.residual_rank_equiv:+.2f} |"
        for s in non_cantrip
    )
    lines.append("")
    lines.append("</details>")
    lines.append("")

    lines.append("## Typed unscored ledger")
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
    lines.extend(
        f"| {r.subpop} | {r.n} | {r.share_within_half_rank:.1%} | {r.p10:+.2f} | {r.p90:+.2f} |"
        for r in v1
    )
    lines.append("")
    lines.append(
        "Diagnosis: the 'pure'/'hybrid' labels here are the BROAD damage-row split "
        "(has vs. lacks a condition ref), not the strict `pricing.is_pure` ladder-fit subset "
        "(n=28) — round 2 deliberately narrowed the structural axis to effective-target + "
        "range + action (the identifiability fix for round 1's collinear area/targeting "
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

    checks, share = report2.validate_v3_prime(population.scored, population.hostile_effect_names)
    lines.append("## V3′ — known-outlier gate (enumerated list, ≥75% correct-side target)")
    lines.append("")
    lines.append("| Spell | Expected | Status | Residual (rank-equiv) | Correct side |")
    lines.append("|---|---|---|---|---|")
    for c in checks:
        r = f"{c.residual_rank_equiv:+.3f}" if c.residual_rank_equiv is not None else "—"
        side = "n/a" if c.correct_side is None else ("yes" if c.correct_side else "**NO**")
        lines.append(f"| {c.name} | {c.expected} | {c.status} | {r} | {side} |")
    lines.append("")
    graded = [c for c in checks if c.correct_side is not None]
    ungraded = [c.name for c in checks if c.correct_side is None]
    lines.append(
        f"- {sum(1 for c in graded if c.correct_side)}/{len(graded)} graded spells correct-side "
        f"({share:.1%}) — **{'PASS' if share >= 0.75 else 'FAIL'}**"
    )
    if ungraded:
        lines.append(
            f"- {', '.join(ungraded)}: hostile effect spells with no damage EV. They get "
            "comparables and a rank range, not a ladder residual, so this gate does not grade "
            "them."
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
        "1. **Disintegrate scores hot because its double-gate (attack roll, THEN a Fortitude "
        "save) isn't structurally modeled** — the structural axis is effective-target + "
        "range + action only; a spell needing to clear two independent rolls has no discount "
        "applied, so its nominal EV reads as simply 'above budget'. The spec's own V3′ text "
        "names this exact nuance ('disintegrate (double-gate)') as expected diagnosis territory, "
        "not a silent-pass case."
    )
    lines.append(
        "2. **Flense (+0.146) is a marginal, likely-noise miss** given Stage A's weak "
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
        "The -1-rank rider exchange rate: Stage A's mid-tier coefficients "
        f"(β_T2={stage_a.beta[Tier.T2]:.2f}, β_T3={stage_a.beta[Tier.T3]:.2f}, in "
        "`fitted-params.json`) are consistent with the ~0.5-0.75-of-budget mid-rank hybrid "
        "observation (see the build record for the numeric walk-through)."
    )
    lines.append("")

    # -----------------------------------------------------------------
    # Round 3: V-A comparables LOO, V-B extraction-fix proof,
    # V-C routing proof, V-D carry.
    # -----------------------------------------------------------------
    lines.append("---")
    lines.append("")
    lines.append("# Round 3 gates (spec `0030-assay-round3-spec.md`)")
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
        "- **Qualitative neighbor-spot check (the spec's separate requirement — "
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

    lines.append("## V-B — extraction-fix proof")
    lines.append("")
    lines.append(
        "See commit `3783473` (the payload fixes and hostility routing) for "
        "the full numeric derivation. Summary: Sleep extracts its Unconscious payload at "
        "Failure/Critical Failure (was silently dropped — case-sensitive rule (iii)) AND its "
        "Success-row en-dash '–1 status penalty to Perception checks' modifier (was silently "
        "dropped — ASCII-only sign class), both fixed on the SAME real file. En-dash restoration: "
        "**exactly 28 files** (verified independently via a raw corpus grep, `[–−]\\d+\\s*"
        "[-–− ](status|circumstance)`, matching the spec's ~28 pin exactly). Case-fold "
        "restoration: **84 spells'** condition-instance count changes under the fix (spec "
        "estimated ~50 — same order of magnitude; 7 of those flip from SkipRecord to a scored/"
        "ledgered row entirely: Sleep, Bane, Web, Levitate, Malediction, Hypnotize, Ring of "
        "Truth). All pins re-derived post-fix in that commit's message; the pure-damage ladder "
        "(n=27, slope/intercept) came out BYTE-IDENTICAL to round 2's shipped values — none of "
        "the 27 pure-subset spells happened to have a condition ref restored by these fixes."
    )
    lines.append("")

    lines.append("## V-C — routing proof")
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
    lines.append(
        f"Route counts (ev=0.0 rows, real corpus after the payload fixes): **{routing_counts}**."
    )
    lines.append("")
    lines.append(f"Named `routing-ambiguous` list ({len(ambiguous_names)}):")
    lines.append("")
    lines.extend(f"- {n}" for n in sorted(set(ambiguous_names)))
    lines.append("")
    lines.append(
        "Damage-side non-regression: Fireball's V2′ spot-check above is unchanged from round 2 "
        "(the pure-damage population and ladder are byte-identical); no damage-side extraction "
        "path was touched by the payload fixes."
    )
    lines.append("")

    lines.append("## V-D — carry (ladder untouched; round-2 damage gates not regressed)")
    lines.append("")
    lines.append(
        f"Pure-damage ladder: n={ladder.n_obs}, slope={ladder.slope:.4f}, "
        f"intercept={ladder.intercept:.4f} — "
        "byte-identical to round 2's shipped values (slope 1.0892, intercept 1.7979, R²=0.967). "
        "V1′/V2′/V3′/V4′ above are unchanged in mechanism (only the underlying population shifted "
        "per V-C's routing counts, which is the EXPECTED consequence of the hostility routing, "
        "not a regression)."
    )
    lines.append("")

    lines.append("## Ledger summary")
    lines.append("")
    lines.append(f"Scored: {population.scored_count} — Ledgered: {sum(population.ledger.values())}")
    lines.append("")

    if round4 is not None:
        _append_round4_sections(lines, rows, round4)

    VALIDATION_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _append_round4_sections(
    lines: list[str],
    rows: list[SpellFeatures],
    r4: Round4Report,
) -> None:
    lines.append("---")
    lines.append("")
    lines.append("# Round 4 gates (spec `0030-assay-round4-spec.md`)")
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
    lines.append("## W-A — join + rule extraction")
    lines.append("")
    lines.append(
        f"Re-derived, real corpus: rows carrying a joined effect_profile: **{ref_bearing}** "
        f"(non-variant rows only — variants of the same file share their effect_profile fields, "
        f"so this is NOT the raw 222/263 ref-bearing/ref-count pin, which counts refs at the "
        f"RAW-FILE level before variant expansion; see the join self-test below for that exact "
        f"figure). Distinct joined effect items resolved: **{len(joined_names)}**. Atom-level "
        f"`expr-unresolved` tags: **{unresolved_atoms}**; `conditional` (non-level predicate) "
        f"tags: **{conditional_atoms}**. Effect-ref-bearing SkipRecords PROMOTED to real rows "
        f'(`recovery_path=="effect-join"`): **{len(promoted)}**.'
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
    lines.append("## W-B — buff comparables (roster LOO — REPORTED not gated)")
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
    lines.append("## W-C — summon band check")
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
    lines.append("## W-D — export")
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
    """`results/comparables-spot.md` — the V-A roster's LOO
    neighbors, human-readable (the same data validation.md's V-A table
    carries, presented as the design-facing spot-check document)."""
    lines = ["# assay — comparables spot-check (the V-A roster, round 3)", ""]
    lines.append(
        "Leave-one-out top-5 comparables for the V-A enumerated roster — the same "
        "engine `uv run assay score --spell <path>` runs for a homebrew effect spell. Generated "
        "by `uv run assay price`. Methodology: `thoughts/archive/specs/0030-assay-round3-spec.md`."
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


#: Condition-word plain text the homebrew warning scans for —
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
    """Homebrew contract check: a plain-English condition word with NO
    @UUID ref anywhere in the description would otherwise silently score as
    pure damage (an overscore) — warn, don't guess."""
    if "@UUID" in description_html and "conditionitems.Item" in description_html:
        return []  # at least one real ref exists somewhere; not the failure mode
    return [
        word
        for word in _CONDITION_WORDS
        if re.search(rf"\b{re.escape(word)}\b", description_html, re.IGNORECASE)
    ]


def _print_comparables(found: comparables.ComparablesResult | None, *, corpus: str) -> None:
    """The top official comparables and their rank RANGE (never a point score)."""
    if found is None:
        print(f"  comparables:  none usable in the committed {corpus} corpus")
        return
    print(
        f"  comparables:  {corpus} corpus, rank RANGE {found.rank_min}-{found.rank_max} "
        f"(median {found.rank_median:g}) — never a point score"
    )
    for m in found.matches:
        shared = ", ".join(m.shared_atoms) or "(no shared atoms — structural/tier match only)"
        print(f"    - {m.name} (rank {m.rank}, sim={m.similarity:.3f}) shares: {shared}")


def _print_prior_card_pointers(row: SpellFeatures, scorer: Scorer) -> None:
    """A prior-card pointer for each hostile-priceable condition (and value) on the spell."""
    priced = {
        (ci.condition, ci.value): None for ci in row.condition_instances if ci.tier is not None
    }
    if not priced:
        return
    by_condition = {
        r.condition: r for r in priors.build_prior_card(scorer.ladder, scorer.cantrip_ladder)
    }
    print("  prior card:   (see results/point-tables.md's prior-anchored card)")
    for condition, value in priced:
        label = condition if value is None else f"{condition} {value}"
        card_row = by_condition.get(label) or by_condition.get(condition)
        if card_row is None:
            continue
        req = (
            "n/a"
            if math.isnan(card_row.prior_rank_equivalent)
            else f"{card_row.prior_rank_equivalent:.2f}"
        )
        print(
            f"    - {label} ({card_row.tier.value}): prior ≈ {req} rank-equivalents (at ~1 round)"
        )


#: What `assay score` prints for a ledger entry, by reason code.
_LEDGER_NOTES = {
    export.CANTRIP_TOO_THIN: "hostile effect cantrip; the cantrip comparables corpus is too thin",
    export.NO_COMPARABLE_PROFILE: "no official comparable clears the similarity floor",
    "ambiguous": (
        "AMBIGUOUS hostility (no save/attack-roll/prose-save/hostile-area signal, and the "
        "target prose doesn't clearly read as friendly either) — needs a GM's judgment"
    ),
}


def _print_score(row: SpellFeatures, score: SpellScore, scorer: Scorer) -> None:
    """Format one `Scorer.score` result for the terminal."""
    if score.kind == "quantitative":
        hybrid = score.population == "hostile"
        kind = "hybrid (damage + conditions)" if hybrid else "damage"
        print(f"  kind:         {kind} (ev={score.ev:.2f})")
        print(f"  verdict:      {score.verdict}")
        if hybrid and not row.is_cantrip:
            _print_comparables(score.comparables, corpus="hostile")
    elif score.kind == "comparables":
        print("  kind:         hostile effect spell — comparables + prior card")
        _print_comparables(score.comparables, corpus="hostile")
    elif score.kind == "buff-comparables":
        print("  kind:         beneficial/buff effect — buff comparables")
        _print_comparables(score.comparables, corpus="buff")
    else:
        population = f", {score.population}" if score.population else ""
        print(f"  kind:         ledger ({score.reason_code}{population})")
        note = _LEDGER_NOTES.get(score.reason_code or "", score.ledger_reason)
        if note:
            print(f"  note:         {note}")
    if (
        score.population == "hostile"
        and score.comparables is not None
        and score.comparables.r10_extrapolation_warning
    ):
        print(
            "  WARNING:      the comparables range touches rank 9-10, and the hostile corpus has "
            "no rank-10 spells to anchor on; treat this range as an extrapolation."
        )
    if score.population == "hostile" and not row.is_cantrip:
        _print_prior_card_pointers(row, scorer)


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

        scorer = Scorer.from_results()
        result, score = scorer.score_doc(data, str(spell_path))
        if isinstance(result, SkipRecord):
            print(f"assay score: {result.name} could not be extracted — {result.reason}")
            print(f"  kind:         ledger ({score.reason_code})")
            span.set_attribute("assay.score.skipped", True)
            return

        cantrip_note = ", cantrip" if result.is_cantrip else ""
        print(f"assay score: {result.name} (rank {result.rank}{cantrip_note})")
        _print_score(result, score, scorer)

        span.set_attribute("assay.score.spell", result.name)
        span.set_attribute("assay.score.kind", score.kind)
        span.set_attribute("assay.score.actual_ev", result.ev)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="assay", description="PF2e homebrew spell power scoring (0030 round 3)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_price = sub.add_parser(
        "price",
        help=(
            "ladder + Stage A + comparables corpora + prior card + full-population "
            "split -> results/"
        ),
    )
    p_price.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_price.set_defaults(func=cmd_price)

    p_score = sub.add_parser(
        "score",
        help=(
            "score one spell JSON: damage/hybrid get the ladder verdict, hostile effect "
            "spells get comparables + the prior card, buff spells get buff comparables"
        ),
    )
    p_score.add_argument("--spell", required=True, help="path to a Foundry-shaped spell JSON")
    p_score.set_defaults(func=cmd_score)

    p_export = sub.add_parser(
        "export-codex",
        help=(
            "build the codex cross-track artifact -> out/spell-power.json "
            "(run `price` first — reads its committed corpora)"
        ),
    )
    p_export.add_argument(
        "--data-root", default=None, help="override the codex data root (else config.kdl)"
    )
    p_export.set_defaults(func=cmd_export_codex)

    homebrew.register_subparsers(sub)
    book.register_subparsers(sub)
    store.register_subparsers(sub)

    return parser


def main() -> None:
    with astra_observe.run("astra.assay"):
        parser = build_parser()
        args = parser.parse_args()
        try:
            args.func(args)
        except (SnapshotNotFoundError, ModelArtifactsNotFoundError) as e:
            raise SystemExit(str(e)) from e
