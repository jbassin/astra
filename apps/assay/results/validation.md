# assay — round-2 validation (V1'–V4')

## V1′ — in-rank clustering (±½ rank-equivalent, per subpopulation)

| Subpopulation | n | share within ±½ rank | p10 | p90 |
|---|---|---|---|---|
| pure | 188 | 36.2% | -3.53 | +1.02 |
| hybrid | 165 | 27.9% | -3.30 | +0.70 |
| control | 184 | 8.2% | -6.01 | -0.61 |
| all-non-cantrip | 553 | 23.7% | -4.27 | +0.56 |

Diagnosis: the 'pure'/'hybrid' labels here are the BROAD damage-row split (has vs. lacks a condition ref), not the strict `pricing.is_pure` ladder-fit subset (n=28) — round 2 deliberately narrowed the structural axis to effective-target + range + action (D30-3's identifiability fix for round 1's collinear area/targeting terms), so facets round 1 modeled (area type, damage-type class, passive defense, sustained, rarity) now show up as unmodeled spread here. A real, expected trade-off for a smaller, better-identified structural model, not a metric artifact.

## V2′ — heighten-projection consistency (tolerance ≤0.75 mean |resid|, fireball ±0.6)

- projections computed: 593
- mean |residual| (rank-equivalent): 1.99
- Fireball 3->4: projected EV 28.0 vs. budget 31.9 (residual -0.45 ranks)
- **FAIL**

## V3′ — known-outlier gate (enumerated list, ≥75% correct-side target)

| Spell | Expected | Status | Residual (rank-equiv) | Correct side |
|---|---|---|---|---|
| Fear | strong | scored | -0.824 | **NO** |
| Command | strong | ledgered-expected | — | yes |
| Slow | strong | scored | -2.285 | **NO** |
| Synesthesia | strong | scored | -4.054 | **NO** |
| Force Barrage | strong | scored | +1.647 | yes |
| Heal | strong | scored | +0.832 | yes |
| Acid Splash | weak | scored | -0.357 | yes |
| Admonishing Ray | weak | scored | -0.328 | yes |
| Flense | weak | scored | +0.146 | **NO** |
| Hydraulic Push | weak | scored | -0.025 | yes |
| Dizzying Colors | weak | scored | -0.811 | yes |
| Disintegrate | weak | scored | +4.993 | **NO** |

- 7/12 correct-side (58.3%) — **FAIL**
- Command's expected outcome IS the ledger (preamble-options exclusion, not a scoring miss) — an asserted absence, same treatment as sure strike/shadow siphon/walls.

**Diagnosis of the misses (no silent tuning — the honest read, round-1 precedent):**

1. **Fear/Slow/Synesthesia score cold — an out-of-sample extrapolation mismatch, not a broken extraction.** Their condition attribution is verified correct by `test_conditions.py`/`test_assay_extract.py` (Fear's 4-degree Frightened escalation, Slow's duration-promoted Slowed, Synesthesia's preamble-payload rules all extract exactly as the fixtures assert). The gap is architectural: Stage A's β_T2/β_T3 are fit on HYBRID trainers, where a condition only needs to explain a PARTIAL discount on top of an already-real damage floor. Stage B then reuses those same β's via `p = 1-exp(-Σβw)` to justify the ENTIRE rank budget for a pure control spell with zero damage — a linear extrapolation the hybrid-trained coefficients were never asked to support at that scale. This is inherent to D30-3's two-stage architecture as specified, not a bug in this build.
2. **Disintegrate scores hot because its double-gate (attack roll, THEN a Fortitude save) isn't structurally modeled** — D30-3's structural axis is effective-target + range + action only; a spell needing to clear two independent rolls has no discount applied, so its nominal EV reads as simply 'above budget'. The spec's own V3′ text names this exact nuance ('disintegrate (double-gate)') as expected diagnosis territory, not a silent-pass case.
3. **Flense (+0.146) is a marginal, likely-noise miss** given Stage A's weak identification (R²=0.053 on n=133) — its residual sits close to zero, well inside the kind of spread V1′ already reports as real heterogeneity.

## V4′ — anchor recovery

| Rank | Budget | Community 7×rank | Δ vs community | GM Core anchor |
|---|---|---|---|---|
| 1 | 6.04 | 7 | -13.8% | 7 |
| 2 | 12.84 | 14 | -8.3% | — |
| 3 | 19.98 | 21 | -4.9% | 21 |
| 4 | 27.33 | 28 | -2.4% | — |
| 5 | 34.84 | 35 | -0.4% | — |
| 6 | 42.50 | 42 | +1.2% | — |
| 7 | 50.27 | 49 | +2.6% | — |
| 8 | 58.14 | 56 | +3.8% | — |
| 9 | 66.09 | 63 | +4.9% | — |
| 10 | 74.13 | 70 | +5.9% | — |

Fitted condition-price reproduction of the -1-rank rider exchange rate: see the Stage A residual spread in `power-ledger.md`'s hybrid rows and the condition price card in `point-tables.md` — mid-tier (T2/T3) budget fractions land in the 0.39-0.20 β range, consistent with the ~0.5-0.75-of-budget mid-rank hybrid observation (see the S2 build record for the numeric walk-through).

## Ledger summary

Scored: 629 — Ledgered: 586

