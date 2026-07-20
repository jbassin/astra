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

Route counts (ev=0.0 rows, real corpus post-S1-fix): **{'hostile': 158, 'beneficial-effect': 185, 'routing-ambiguous': 35}**.

Named `routing-ambiguous` list (35):

- Animate Rope
- Beseech Arcanotheign
- Bind Undead
- Chameleon Coat
- Cloud Dragon's Cloak
- Confetti Cloud (variant 1)
- Confetti Cloud (variant 2)
- Confetti Cloud (variant 3)
- Domora's Defense
- Faerie Fire
- Figment
- Forbidding Ward
- Forceful Hand
- Gray Shadow
- Helpful Reload
- Helpful Wood Spirits
- Holy Host
- Invoke True Name
- Knock
- Light
- Martyr's Intervention
- Mist
- Momentary Recovery
- Organsight
- Prismatic Wall
- Protect Companion
- Quicken Time
- Raise Dead
- Soothing Blossoms
- Stabilize
- Summon Warden of the Wild
- Tangling Creepers
- The Four Hunters
- Thundering Dominance
- Unholy Army

Damage-side non-regression: Fireball's V2′ spot-check above is unchanged from round 2 (the pure-damage population and ladder are byte-identical); no damage-side extraction path was touched by S1.

## V-D — carry (ladder untouched; round-2 damage gates not regressed)

Pure-damage ladder: n=27, slope=1.0892, intercept=1.7979 — byte-identical to round 2's shipped values (slope 1.0892, intercept 1.7979, R²=0.967). V1′/V2′/V3′/V4′ above are unchanged in mechanism (only the underlying population shifted per V-C's routing counts, which is the EXPECTED consequence of D30-22, not a regression).

## Ledger summary

Scored: 558 — Ledgered: 657

---

# Round 4 gates (spec `0030-assay-round4-spec.md`, D30-35..38)

## W-A — join + rule extraction (D30-35)

Re-derived, real corpus: rows carrying a joined effect_profile: **206** (non-variant rows only — variants of the same file share their effect_profile fields, so this is NOT the raw 222/263 ref-bearing/ref-count pin, which counts refs at the RAW-FILE level before variant expansion; see the join self-test below for that exact figure). Distinct joined effect items resolved: **209**. Atom-level `expr-unresolved` tags: **29**; `conditional` (non-level predicate) tags: **134**. Effect-ref-bearing SkipRecords PROMOTED to real rows (D30-36's `recovery_path=="effect-join"`): **77**.

Independent join self-test (ref discovery + resolution, run directly against the spell-effects pack, bypassing extraction entirely — see the build record for the reproduction script): **222 ref-bearing main-list spells / 263 refs / 0 unresolved / 20 multi-ref spells** — matches the spec's own review-verified pins EXACTLY. `@item.level`/`@spell.rank` evaluated at base rank (never the effect item's own `system.level.value`): 29/263 real joined pairs disagree between the two — also an exact match to the spec's pin. Evaluator coverage among the 28 distinct joined str-expr FlatModifiers: 9 ternary, 8 closed-form-arithmetic (match/when/btwn + floor/ceil/clamped), 11 runtime-only (`@actor.*`/`rulesSelections`/mustache) — matches the spec's "32/79 ternary [globally]; +8 closed-form; 11 runtime-only [among joined]" breakdown exactly once re-scoped to the joined subset.

Predicate/selector-array handling, proven on the two named fixtures: Heroism's `FlatModifier` carries an ARRAY selector (`[attack, saving-throw, skill-check, perception]`) — fans out to 4 atoms, each `ternary(gte(@item.level,9),3,ternary(gte(@item.level,6),2,1))` evaluated at Heroism's own base rank (3) = **1**, matching the card's own +1/+2/+3 @ r3/6/9 curve at the r3 point. Mystic Armor's saving-throw `FlatModifier` carries `predicate: [{gte: [parent:level, 4]}]` — a level-family predicate, evaluated at Mystic Armor's own base rank (1): **False** — NO saving-throw atom at rank 1 (only the AC atom), exactly the spec's named "mystic armor has NO saves atom at rank 1" fixture claim.

## W-B — buff comparables (D30-36, roster LOO — REPORTED not gated)

Buff comparables corpus n=**145**. All 10 W-B roster spells present (the draft's stoneskin/false life miss corrected to Mountain Resilience/False Vitality).

| Spell | Own rank | LOO top-5 (name:rank) |
|---|---|---|
| Heroism | 3 | Levitate:3, Musical Shift:8, Prismatic Shield:9, Time Sense:1, Guidance:1 |
| Mystic Armor | 1 | Shielded Arm:1, Benediction:1, Circle of Protection:3, Protection:1, Aerial Form:4 |
| Invisibility | 2 | Invisible Item:1, Empty Pack:2, Flashy Disappearance:1, Carryall:1, Disappearance:8 |
| Haste | 3 | Loose Time's Arrow:2, Winning Streak:4, Summon Deific Herald:8, Musical Shift:8, Aerial Form:4 |
| Resist Energy | 2 | Elemental Absorption:3, Divine Vessel:7, Aerial Form:4, Angel Form:7, Animal Form:2 |
| Sure Strike | 1 | Illusory Shroud:2, Blur:2, Ethereal Jaunt:7, Whirling Scarves:3, Dismantle:2 |
| Mountain Resilience | 4 | Ferrous Form:8, Hidebound:2, Vapor Form:4, Aerial Form:4, Angel Form:7 |
| False Vitality | 2 | Divine Vessel:7, Endure:1, Zealous Conviction:6, Aerial Form:4, Angel Form:7 |
| Blur | 2 | Ethereal Jaunt:7, Whirling Scarves:3, Elemental Sense:4, Illusory Shroud:2, Sure Strike:1 |
| Protection | 1 | Daemon Form:6, Dawnflower's Light:4, Hidden Mind:8, Spirit Sense:2, Spirit Ward:1 |

## W-C — summon band check (D30-37)

GM Screen journal curve verification (`gm-screen.json` entry `S55aqwWIzpQRFhcq` / page `8gcp880pEWZ9VPnF`): **PASS**.

n=14 summon-trait main-list spells (trait-membership fixed — the round-2/3 `_SUMMON_TRAIT_RE` was dead code); 13/14 base-level prose extraction succeeded (Phantasmal Minion is the named miss — a fixed-creature summon, no scaling prose at all).

| Spell | Rank | Base level (prose) | Curve level | Delta |
|---|---|---|---|---|
| Phantasmal Minion | 1 | — | — | (no prose match) |
| Summon Animal | 1 | -1 | -1 | +0 |
| Summon Construct | 1 | -1 | -1 | +0 |
| Summon Fey | 1 | -1 | -1 | +0 |
| Summon Lesser Servitor | 1 | -1 | -1 | +0 |
| Summon Plant or Fungus | 1 | -1 | -1 | +0 |
| Summon Undead | 1 | -1 | -1 | +0 |
| Summon Elemental | 2 | 1 | 1 | +0 |
| Summon Celestial | 5 | 5 | 5 | +0 |
| Summon Dragon | 5 | 5 | 5 | +0 |
| Summon Entity | 5 | 5 | 5 | +0 |
| Summon Fiend | 5 | 5 | 5 | +0 |
| Summon Giant | 5 | 5 | 5 | +0 |
| Summon Monitor | 5 | 5 | 5 | +0 |

Declared curve table: `{1: -1, 2: 1, 3: 2, 4: 3, 5: 5, 6: 7, 7: 9, 8: 11, 9: 13, 10: 15}`.

## W-D — export (D30-38)

Double-run byte-identity: **PASS**. Entries: **1144**. Unmatched ids: **0** (expect 0). Variant-collapsed slugs: **34**.

| Kind | Count |
|---|---|
| ledger | 524 |
| quantitative | 349 |
| comparables | 148 |
| buff-comparables | 123 |

| Population | Count |
|---|---|
| null | 652 |
| hostile | 296 |
| beneficial | 183 |
| summon | 13 |

Reconciliation against re-derived population splits: `beneficial-effect` ledger rows (185) map onto the `buff-comparables`+`ledger`(no-comparable-profile, population=beneficial) export kinds combined; hostile condition-control rows (`classify_row is None`, `ev==0`) map onto `comparables`+`ledger`(no-comparable-profile/cantrip-too-thin, population=hostile); every other typed ledger reason maps 1:1 through `export.REASON_CODE_MAP` onto a stable `reasonCode` — see `out/spell-power.json` (gitignored, regenerated by `assay export-codex`) for the full artifact.

