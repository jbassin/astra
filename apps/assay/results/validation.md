# assay — round-1 validation (V1–V4)

## V1 — in-rank clustering

Target: the middle 80% of fit-population spells within ±⅓ rank-equivalent of budget.

- n = 264
- share within ±⅓ rank: **20.5%**
- p10 / p90 rank-equivalent residual: -2.26 / +2.15
- **FAIL** (target ≥80% within ±⅓ rank)

## V2 — heighten-projection consistency (held out of the fit)

- projections computed: 568
- mean |residual| (rank-equivalent): 2.35
- Fireball rank 3→4: projected EV 28.0 (8d6=28 expected) vs. fitted rank-4 budget 21.0 (residual +1.88 ranks)

## V3 — known-outlier sanity

Non-cantrip rows: residual in rank-equivalents. Cantrip rows (Electric Arc,
Acid Splash — no rank ladder to divide by): raw log(EV) residual, sign only.

| Spell | Expected | Found | Residual | Correct side |
|---|---|---|---|---|
| Force Barrage | strong | True | -0.907 | **NO** |
| Fireball | strong | True | +0.381 | yes |
| Admonishing Ray | weak | True | -0.043 | yes |
| Disintegrate | weak | True | +0.959 | **NO** |
| Hydraulic Push | weak | True | +0.825 | **NO** |
| Electric Arc | strong | True | +0.071 | yes |
| Acid Splash | weak | True | -0.390 | yes |

**FAIL**

## V4 — anchor recovery (fitted ladder vs. community 7×rank / GM Core)

| Rank | Fitted EV | Community 7×rank | Δ vs community | GM Core anchor |
|---|---|---|---|---|
| 1 | 8.09 | 7 | +15.5% | 7 |
| 2 | 12.90 | 14 | -7.9% | — |
| 3 | 21.57 | 21 | +2.7% | 21 |
| 4 | 24.33 | 28 | -13.1% | — |
| 5 | 29.30 | 35 | -16.3% | — |
| 6 | 37.20 | 42 | -11.4% | — |
| 7 | 45.85 | 49 | -6.4% | — |
| 8 | 44.09 | 56 | -21.3% | — |
| 9 | 50.74 | 63 | -19.5% | — |
| 10 | 80.83 | 70 | +15.5% | — |

## Skip ledger summary

Total skipped (all main-slot spells, any reason): 858

| Reason | Count |
|---|---|
| no-damage-kind-entry | 812 |
| overlay-variant | 40 |
| no-plain-damage-entry (persistent/splash only) | 5 |
| long-cast time ('30 minutes') | 1 |

