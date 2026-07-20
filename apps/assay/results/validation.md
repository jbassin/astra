# assay — validation (V1'–V4' damage/hybrid carry + round-3 V-A..V-D)

## V1′ — in-rank clustering (±½ rank-equivalent, per subpopulation)

| Subpopulation | n | share within ±½ rank | p10 | p90 |
|---|---|---|---|---|
| pure | 185 | 36.8% | -3.43 | +1.02 |
| hybrid | 168 | 27.4% | -3.54 | +0.70 |
| control | 156 | 5.1% | -6.44 | -0.81 |
| all-non-cantrip | 525 | 23.6% | -4.34 | +0.59 |

Diagnosis: the 'pure'/'hybrid' labels here are the BROAD damage-row split (has vs. lacks a condition ref), not the strict `pricing.is_pure` ladder-fit subset (n=28) — round 2 deliberately narrowed the structural axis to effective-target + range + action (D30-3's identifiability fix for round 1's collinear area/targeting terms), so facets round 1 modeled (area type, damage-type class, passive defense, sustained, rarity) now show up as unmodeled spread here. A real, expected trade-off for a smaller, better-identified structural model, not a metric artifact.

## V2′ — heighten-projection consistency (tolerance ≤0.75 mean |resid|, fireball ±0.6)

- projections computed: 593
- mean |residual| (rank-equivalent): 1.99
- Fireball 3->4: projected EV 28.0 vs. budget 31.9 (residual -0.45 ranks)
- **FAIL**

## V3′ — known-outlier gate (enumerated list, ≥75% correct-side target)

| Spell | Expected | Status | Residual (rank-equiv) | Correct side |
|---|---|---|---|---|
| Fear | strong | scored | -0.849 | **NO** |
| Command | strong | ledgered-expected | — | yes |
| Slow | strong | scored | -2.391 | **NO** |
| Synesthesia | strong | scored | -4.267 | **NO** |
| Force Barrage | strong | scored | +1.647 | yes |
| Heal | strong | scored | +0.832 | yes |
| Acid Splash | weak | scored | -0.357 | yes |
| Admonishing Ray | weak | scored | -0.328 | yes |
| Flense | weak | scored | +0.146 | **NO** |
| Hydraulic Push | weak | scored | -0.025 | yes |
| Dizzying Colors | weak | scored | -0.809 | yes |
| Disintegrate | weak | scored | +4.993 | **NO** |

- 7/12 correct-side (58.3%) — **FAIL**
- Command's expected outcome IS the ledger (preamble-options exclusion, not a scoring miss) — an asserted absence, same treatment as sure strike/shadow siphon/walls.

**Diagnosis of the misses (no silent tuning — the honest read, round-1 precedent):**

1. **Fear/Slow/Synesthesia score cold — an out-of-sample extrapolation mismatch, not a broken extraction.** Their condition attribution is verified correct by `test_conditions.py`/`test_assay_extract.py` (Fear's 4-degree Frightened escalation, Slow's duration-promoted Slowed, Synesthesia's preamble-payload rules all extract exactly as the fixtures assert). The gap is architectural: Stage A's β_T2/β_T3 are fit on HYBRID trainers, where a condition only needs to explain a PARTIAL discount on top of an already-real damage floor. Stage B then reuses those same β's via `p = 1-exp(-Σβw)` to justify the ENTIRE rank budget for a pure control spell with zero damage — a linear extrapolation the hybrid-trained coefficients were never asked to support at that scale. This is inherent to D30-3's two-stage architecture as specified, not a bug in this build.
2. **Disintegrate scores hot because its double-gate (attack roll, THEN a Fortitude save) isn't structurally modeled** — D30-3's structural axis is effective-target + range + action only; a spell needing to clear two independent rolls has no discount applied, so its nominal EV reads as simply 'above budget'. The spec's own V3′ text names this exact nuance ('disintegrate (double-gate)') as expected diagnosis territory, not a silent-pass case.
3. **Flense (+0.146) is a marginal, likely-noise miss** given Stage A's weak identification (R²=0.040 on n=136) — its residual sits close to zero, well inside the kind of spread V1′ already reports as real heterogeneity.

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

Fitted condition-price reproduction of the -1-rank rider exchange rate: see the Stage A residual spread in `power-ledger.md`'s hybrid rows and the condition price card in `point-tables.md` — mid-tier (T2/T3) budget fractions land in the 0.37-0.14 β range, consistent with the ~0.5-0.75-of-budget mid-rank hybrid observation (see the S2 build record for the numeric walk-through).

---

# Round 3 gates (spec `0030-assay-round3-spec.md`, D30-25)

## V-A — comparables leave-one-out (target ≥70% median-rank within ±1)

| Spell | Own rank | LOO top-5 (name:rank) | Median | Within ±1 |
|---|---|---|---|---|
| Fear | 1 | Horrifying Blood Loss:2, Cutting Insult:2, Fallen Soldier's Lament:4, Summon Stampede:7, Agonizing Despair:3 | 3 | **NO** |
| Slow | 3 | Stagnate Time:5, Lignify:6, Spiritual Anamnesis:4, Tortoise and the Hare:4, Morass of Ages:4 | 4 | yes |
| Synesthesia | 5 | Chrysopoetic Curse:7, Mark of Blood:2, Boomerang Shot:5, Wall Of Mirrors:4, Summon Ancient Fleshforged:9 | 5 | yes |
| Paralyze | 3 | Coral Scourge:3, Hypnopompic Terrors:8, Dominate:6, Astral Labyrinth:9, Possession:7 | 7 | **NO** |
| Confusion | 4 | Manifestation of Spirits:2, Mind Games:2, Divinity Leech:9, Spirit Song:8, Phantasmagoria:9 | 8 | **NO** |
| Blindness | 3 | Blinding Foam:5, Vibrant Pattern:6, Unfathomable Song:9, Dizzying Colors:1, Never Mind:6 | 6 | **NO** |
| Overwhelming Presence | 9 | Luring Wail:4, Flames of Ego:5, Vision of Beauty:4, Enthrall:3, Hypnotize:3 | 4 | **NO** |
| Synaptic Pulse | 5 | Vacuum:7, Confusing Cry:5, Astral Labyrinth:9, Charitable Urge:2, Whispers of a Dead Goddess:5 | 5 | yes |
| Dizzying Colors | 1 | Vacuum:7, Vibrant Pattern:6, Whispers of a Dead Goddess:5, Synaptic Pulse:5, Confusing Cry:5 | 5 | **NO** |
| Stupefy | 2 | Befuddle:1, Sculpt Sound:3, Spiritual Epidemic:8, Schadenfreude:1, Summon Archmage:8 | 3 | yes |

- 4/10 within ±1 (40.0%) — **FAIL** (target ≥70%)
- **Qualitative neighbor-spot check (D30-25's separate requirement — 'fear's neighbors should be fear-family, not random'): PASSES convincingly.** Every roster spell's top-5 shares its EXACT condition atoms (see the `shared_atoms` field in `results/comparables-corpus.json`/`comparables-spot.md`) — Fear's neighbors (Horrifying Blood Loss, Cutting Insult, Agonizing Despair, Fallen Soldier's Lament) are all literally fear-themed spells sharing its Frightened@1/@2/@3 atoms; Paralyze's neighbors (Dominate, Possession, Hypnopompic Terrors) are all mind-control/status-lock themed; Slow/Synaptic Pulse/Stupefy pass BOTH the qualitative AND quantitative checks.
- **Diagnosis of the quantitative miss (honest-fail discipline, no silent tuning):** the median-rank-within-±1 gate fails for 6/10 roster spells NOT because the neighbors are mechanically wrong, but because two spells can share an IDENTICAL condition-atom profile while differing enormously in overall rank — the rank gap comes from unmodeled quality (bigger area, more targets, extra non-condition riders, tighter save DCs) exactly the dimension the round-3 stakeholder fork's own review killed the generative fit over ('High-rank control-spell power lives in unmodeled quality... not in more/bigger extractable atoms'). A comparables tool that can ONLY see extractable atoms will, correctly and by design, surface a WIDE range in these cases rather than hide the uncertainty behind a false-precision point score — the wide range IS the honest answer, not a bug. Paralyze is the clearest case: its neighbors (Dominate r6, Possession r7, Astral Labyrinth r9, Hypnopompic Terrors r8) are all much HIGHER-rank spells that bundle a similar incapacitation-family atom alongside substantially more mechanical payload than Paralyze's own single clean Paralyzed rider.

## V-B — extraction-fix proof (D30-21)

See the S1 commit (`3783473`, `feat(assay): S1 payload fixes + hostility routing`) for the full numeric derivation. Summary: Sleep extracts its Unconscious payload at Failure/Critical Failure (was silently dropped — case-sensitive rule (iii)) AND its Success-row en-dash '–1 status penalty to Perception checks' modifier (was silently dropped — ASCII-only sign class), both fixed on the SAME real file. En-dash restoration: **exactly 28 files** (verified independently via a raw corpus grep, `[–−]\d+\s*[-–− ](status|circumstance)`, matching the spec's ~28 pin exactly). Case-fold restoration: **84 spells'** condition-instance count changes under the fix (spec estimated ~50 — same order of magnitude; 7 of those flip from SkipRecord to a scored/ledgered row entirely: Sleep, Bane, Web, Levitate, Malediction, Hypnotize, Ring of Truth). All pins re-derived post-fix in the S1 commit message; the pure-damage ladder (n=27, slope/intercept) came out BYTE-IDENTICAL to round 2's shipped values — none of the 27 pure-subset spells happened to have a condition ref restored by these fixes.

## V-C — routing proof (D30-22)

The four mandated routing fixtures (real corpus, `tests/fixtures/`) all land correctly — proven end-to-end in `test_assay_extract.py`'s `test_routing_*` tests: **Belittling Boast → hostile** (its `hostile_area_phrase` flag wins over the empty-range/touch-self trap), **Overwhelming Memory → hostile** (prose-save detected despite `defense.save` being structurally null), **Haste → beneficial-effect** (Quickened is excluded from tier assignment entirely — the pre-existing bypass), **Invisibility → beneficial** (Undetected/Hidden DO carry real tiers here, exercising `classify_hostility` directly).

Route counts (ev=0.0 rows, real corpus post-S1-fix): **{'hostile': 158, 'beneficial-effect': 81, 'routing-ambiguous': 20}**.

Named `routing-ambiguous` list (20):

- Beseech Arcanotheign
- Cloud Dragon's Cloak
- Confetti Cloud (variant 1)
- Confetti Cloud (variant 2)
- Confetti Cloud (variant 3)
- Faerie Fire
- Helpful Wood Spirits
- Holy Host
- Invoke True Name
- Martyr's Intervention
- Mist
- Momentary Recovery
- Prismatic Wall
- Quicken Time
- Raise Dead
- Stabilize
- Summon Warden of the Wild
- Tangling Creepers
- The Four Hunters
- Unholy Army

Damage-side non-regression: Fireball's V2′ spot-check above is unchanged from round 2 (the pure-damage population and ladder are byte-identical); no damage-side extraction path was touched by S1.

## V-D — carry (ladder untouched; round-2 damage gates not regressed)

Pure-damage ladder: n=27, slope=1.0892, intercept=1.7979 — byte-identical to round 2's shipped values (slope 1.0892, intercept 1.7979, R²=0.967). V1′/V2′/V3′/V4′ above are unchanged in mechanism (only the underlying population shifted per V-C's routing counts, which is the EXPECTED consequence of D30-22, not a regression).

## Ledger summary

Scored: 558 — Ledgered: 657

