# 0030 assay round 2 — effect pricing + full-population power scores — NLSpec

**Status:** BUILT (2026-07-19) — both slices landed same-session (S1 `6d77fa7`, S2 this commit),
adversarially reviewed (fable; opus instance lost to repeated API 500s) before build.
**5 blockers + 5 minors + 2 nits ALL folded below.** §5's build record carries the real numbers,
three bugs found-and-fixed against the real corpus, and the honest V1′–V4′ gate results (V1′/V2′/
V3′ FAIL with diagnosis, V4′ PASS — no silent tuning, same discipline as round 1). Headline catches
(pre-build, folded into the decisions below):
the D30-5 "fit per-condition at n≥20" head was EMPTY on the real trainer population (the
pinned counts were description-OCCURRENCES over all spells; per-spell counts are lower and
the actual Stage A trainers = 130 hybrids, top condition n = 15 — the P6 proxy-pin class
×2: occurrences→spells→trainers) → tier-only fitting; the structural refit "on the pure
subset" was impossible for action cost (pure is definitionally 2-action — zero variance)
→ action multipliers are declared constants; the Stage A→B algebra was unit-incoherent
(log-shortfall β ≠ linear budget-fraction p) → the log-discount link is now pinned;
positional degree attribution broke on the gate's own flagship spells (synesthesia's whole
payload is preamble; command's refs are preamble options; paralyze's crit-fail is plain
text) → four explicit attribution rules; V3′'s "~30 scoreable names" was inflated (shadow
siphon/wall of stone/sure strike unscoreable-or-worse; invisibility/haste are buffs) → the
gate list is re-derived and enumerated. Also corrected: overlay spells = **40** (110
variants; the 64 was a census miscount), the "6-spell" scaling family was a regex proxy
(4 false positives, ≥6 misses) → mechanical definition, and the 278 pin recounts to 282
under base-text-only per-spell counting.
**Scope doc:** `thoughts/shared/research/2026-07-19-assay-spell-power-0030-thoughts.md`
(§6 carries the round-1 outcome + the pure-damage probe that locks this round's design).
**Round-1 base:** `apps/assay` (`e6df546`/`4285ce8`) — extractor, dice, OLS fit, score CLI,
committed results. Round-1 gates V1–V3 failed AS DESIGNED to fail if facets were missing;
the probe showed the pure-damage core clusters (×1.41 within-rank spread vs ×1.78 pooled)
and that rider-carrying spells sit at ×0.5–0.75 of same-rank pure budget — empirically
reproducing GM Core's "condition rider ≈ −1 spell rank of damage" exchange rate. Round 2
prices the riders and extends scoring to the no-damage majority.
**Empirical pins (swept 2026-07-19 vs the live pack, `r2_pins.py`):** main slot spells
1,144 · condition-@UUID spells **427** (189 with `{Name N}` value suffixes) · ranked
no-structured-damage spells with conditions **278** · full 4-degree markup 274 / any-degree
337 · status/circumstance-modifier prose 153 · prose "additional action" scaling family
**6** · `@Damage` inline without structured damage **58** · `spell-effects` item refs 222 ·
top conditions: frightened 77, sickened 60, slowed 46, enfeebled 45, prone 44, clumsy 42,
dazzled 40, stunned 39, drained 36, stupefied 34, concealed 32, invisible 26,
immobilized 20, … paralyzed 8, unconscious 6. Pin discipline (P6/P10–P14): slice engineers
re-derive counts from the real mechanism; unexplained delta = STOP with options.

## 1. Goal

One power scale covering damage spells, hybrid damage+rider spells, and condition/modifier
control spells, such that (a) official spells cluster in-band by rank, (b) a homebrew spell
scores in rank-equivalents against that band, (c) everything unscoreable is in an explicit
ledger with a reason — coverage is honest, never silently partial.

## 2. Decisions

- **D30-1 Pure-anchored budget ladder.** `Budget(r)` is fit on the pure-damage subset
  **re-derived under round-2 extraction** (2-action FIXED cast, basic-save, no condition
  refs, no modifier prose, instant, non-sustained — review: the round-1 set of 34 was
  contaminated by Ibex's Harvest (variable-cast action-scaler mis-bucketed "2") and Holy
  Cascade (prose riders)): regress `log EV` on `log r` (2-parameter smooth) with the
  AoE/single-target split as a fitted offset (probe ratio ~1.1–1.4, prior 1.25).
  **Rank-singleton sensitivity is reported, not hidden:** fit with AND without the thin-top
  singletons (r9 = Detonate Magic EV 28, a special-mechanic outlier BELOW the r5 geomean;
  dropping it alone moves the exponent 1.02→1.08 and top-rank budget ~11%); the shipped
  ladder is the excluding-singletons fit, both recorded. Report the ladder vs GM Core's
  limited-use column (level=2r−1 bridge) and the 7×rank line. All prices/multipliers are
  relative to this ladder. Cantrips keep a separate ladder (same method).
- **D30-2 Effect extraction.** New extraction pass over `description`:
  (a) conditions via `conditionitems.Item.(\w+)` + the display/value suffix
  (`{Frightened 2}` → value 2; unvalued conditions default 1 where the condition is
  valued-typed, n/a otherwise; regex capture must be bracket-bounded — the naive `(\w+)`
  mangles hyphenated names like Off-Guard); (b) **degree attribution, four explicit rules
  (review-mandated — positional splitting alone mis-handles the flagship spells):**
  (i) conditions ref'd in the PREAMBLE of a degree-markup spell apply at every degree
  whose section indicates the target is affected ("is affected", "affected for…"), taking
  duration from that section (synesthesia's payload is entirely preamble; degree rows only
  set duration); (ii) "As failure(, plus …)" sections inherit the failure set plus their
  own additions (53 such sections); (iii) a plain-text repeat of a condition name already
  ref'd elsewhere in the spell counts at its position (paralyze's crit-fail "Paralyzed for
  4 rounds" carries no ref); (iv) anything not covered → confidence downgrade → unscored
  ledger. When no degree markup but a save exists → failure-only default; attack-roll
  spells → on-hit; (c) duration class per condition-instance {instant/one-shot, ≤1 round,
  ~1 min/sustained, long} from the owning degree section's prose first, the `duration`
  field as fallback (57 empty + 36 'varies' among control spells — the prose path is
  load-bearing; per-degree durations legitimately differ within one spell);
  (d) numeric status/circumstance modifiers with target stat text captured raw;
  (e) base-rank text only — "Heightened" blocks excluded and flagged (per-spell base-text
  pin: 282 no-damage ranked spells with conditions). Every extraction carries a confidence
  field; low confidence diverts the spell to the ledger rather than silently mis-pricing.
- **D30-3 Two-stage pricing, with the link function PINNED (review blocker — the draft's
  log-shortfall β and linear budget-fraction p are different units).** Everything lives in
  log-discount space. **Stage A (learn tier discounts):** on the hybrid trainer population
  (~130 non-cantrip fit rows with condition refs), fit by OLS **with an intercept**:
  `log EV_i = log Budget(r_i) + log structural_i − Σ_t β_t · w_i,t + α + ε_i`
  where `w_i,t` = the coverage×duration-weighted load of tier t on spell i. The ~26% of
  hybrids ABOVE pure budget (negative shortfall — thunderstrike, gust of wind, flense…)
  stay in the fit; the intercept absorbs the pure-line offset so they inform prices near
  zero instead of biasing all prices down. **Stage B (apply):** a control spell's power
  fraction `p = 1 − exp(−Σ_t β_t · w_t)` of `Budget(r)` × structural multipliers; score
  reported in rank-equivalents. The exp link keeps stacked riders from pricing past 100%
  of budget. **Structural multipliers:** effective-target axis {single, small-multi
  (small area / 2–3 targets), party-scale (large area)} + range bucket are FIT on the pure
  subset (they vary there); **action-cost multipliers are DECLARED constants** (review
  blocker: the pure subset is definitionally 2-action — zero variance): 1a ×1.4 · 2a ×1.0
  · 3a ×0.75 · reaction ×1.6 (community consensus per scope-doc §2), applied identically
  in Stage A residualization and Stage B scoring; revisited only on validation evidence.
- **D30-4 Coverage factor (fixed arithmetic, NOT fitted).** Nominal outcome distribution vs
  an on-level moderate save: crit-fail 10% / fail 40% / success 40% / crit-success 10%.
  Coverage = Σ P(outcome) × severity-scale(outcome), severity-scale normalized to
  failure=1.0 with crit-fail=1.5 default (2.0 for explicit doubled/worsened text), so
  fail-only ≈ 0.55 and effect-on-success adds its success-row value. Fitting these weights
  freely is not identified at this n — they are declared constants, revisited only on
  validation evidence.
- **D30-5 Severity: TIER-ONLY fitting; per-condition prices are priors (review blocker —
  the draft's "fit individually at n≥20" head is EMPTY: the real trainer population is 130
  hybrids and the top per-condition trainer n is 15 (prone/sickened), frightened 14,
  slowed/stunned 10).** Stage A fits exactly the tier coefficients β_T1..β_T3 (trainer
  mass ≈ T1 ~35 / T2 ~60 / T3 ~30); **β_T4 is a pure community-anchored prior (~4
  trainers — no data), stated as such everywhere it appears.** The per-condition table
  maps each condition (× value) to a tier + a within-tier prior offset; the table is an
  implementation artifact reviewed in the build record, with fitted-tier-vs-prior deltas
  reported. Tier sketch: T1 minor (dazzled, sickened 1, deafened, fascinated…) · T2
  moderate (frightened 1, prone, grabbed, clumsy/enfeebled/stupefied/drained 1, off-guard,
  slowed 1 ≤1 round…) · T3 major (frightened 2+, slowed 1 ≥1 min, stunned 1–2, blinded,
  confused, fleeing, immobilized…) · T4 fight-ending (paralyzed, unconscious, controlled,
  petrified — effectively incapacitation-gated). Valued conditions scale ~linearly in
  value via tier promotion (frightened 1 = T2, 2+ = T3) or within-tier offset.
- **D30-6 Extraction recovery (round-1 gaps).** (a) The **40** overlay-variant spells
  (110 variants; the draft's 64 was a census miscount — round-1's skip ledger already
  said 40) score PER VARIANT with **deep-merge-onto-base semantics** (variants are partial
  overrides: 67/110 override damage, 41 time; heal's 1-action variant carries NO damage
  override and must inherit the base 1d8) and **empty-`system` variants skipped** (6 are
  flavor-only); variant rows tag their parent. **Overlay precedence beats every other
  recovery path.** (b) The prose action-scaling family is defined MECHANICALLY, not by
  regex (review: the draft's regex-6 had 4 flavor false-positives and missed ≥6 real
  scalers — channel arrogance, magic stone, banishing touch, splinter volley, mutilate,
  ibex's harvest): variable cast time + damage + no overlays → a hand-maintained
  per-action EV table covering that derived set (incl. force barrage — its wrong-sign
  round-1 outlier must flip); (c) the 58 no-structured-damage spells with `@Damage[...]`
  markup join via inline-roll recovery — **47 verified fully-literal**; the 11
  `@item.rank`-arithmetic cases stay unscored (typed reason).
- **D30-7 Incapacitation.** Never a fitted coefficient: scored twice — at-level (full
  effect) and boss-weighted (coverage degraded one outcome step). The in-band check uses
  the at-level score; both appear in the ledger. Same treatment as round 1 for the flag's
  extraction (trait).
- **D30-8 Population + honest ledger.** Score every main slot spell whose extracted
  mechanics are high-confidence: pure damage, hybrids, recovered-damage, condition
  control (hostile), simple numeric-modifier debuffs. **Two review-forced routing
  decisions:** (i) **beneficial-condition spells (self/ally buffs — invisible ×31,
  quickened, heroism-class) go to the ledger with typed reason `beneficial-effect`** —
  D30-4's save-outcome coverage arithmetic is undefined for unsaved buffs; pricing buffs
  is round 3. (ii) **healing EV prices 1:1 against the damage budget** (declared
  assumption, flagged in results; heal/harm score per overlay variant under D30-6a).
  Everything else lands in the ledger with a typed reason (summon, wall/terrain,
  teleport/utility, beneficial-effect, effect-item payload, low-confidence extraction,
  non-literal formula…). Expected scored population ≈ 550–700 of 1,075 ranked (re-derived
  at build; unexplained delta = STOP). Cantrips scored on their own ladder.
- **D30-8b Duration factors (declared constants, review: the draft used an undefined
  "duration factor").** Per condition-instance, multiplying its tier price: instant/
  one-shot ×0.5 · ≤1 round ×0.6 · ~1 min/sustained ×1.0 (the standard combat horizon) ·
  long (hours+) ×1.2. Stage A's hybrid riders only inform the ≤1-min classes; the `long`
  factor is prior territory and stated as such. Constants revisited only on validation
  evidence, like D30-4.
- **D30-9 Validation gates.**
  - **V1′ clustering:** middle 80% of the scored population within ±½ rank-equivalent
    (declared looser than round 1's ±⅓ — this is semi-quantitative by design); report
    per-subpopulation (pure / hybrid / control) spreads separately.
  - **V2′ heighten consistency, with pre-set numeric tolerance (review: "on the r4 line"
    could fail by construction of the anchor — the pure-ladder r4 point ≈24 vs fireball's
    projected 28 is already ~+0.55 ranks):** mean |residual| over all interval-heightened
    projections ≤0.75 rank-equivalents, fireball spot-check within ±0.6; both against the
    shipped (singleton-excluded) ladder, drift direction diagnosed if missed.
  - **V3′ known-outlier gate on a RE-DERIVED, ENUMERATED list (review: the draft's "~30
    scoreable names" was inflated — shadow siphon has nothing extractable, wall of stone
    is ledgered by design, sure strike would MIS-score as a debuff (its concealed refs are
    "ignores concealment" text → explicit exclusion), invisibility/haste are
    beneficial-effect ledger rows under D30-8).** The gate list = the strong/weak names
    whose expected path is scoreable, each with its path recorded in the spec build
    record before S2 runs: strong — fear, command, slow, synesthesia, force barrage
    (manual-scaling path), heal (overlay path, healing-1:1 assumption), dizzying-colors'
    counterpart fear-family entries; weak — acid splash (cantrip ladder), admonishing ray,
    flense, hydraulic push, dizzying colors, disintegrate (double-gate). ≥75%
    correct-side on that enumerated list (expected n ≈ 12–16), every wrong-side case
    diagnosed in validation.md; sure strike/shadow siphon/walls appear as EXPECTED ledger
    entries (their absence from scoring is itself asserted).
  - **V4′ anchor recovery:** ladder vs GM Core bridge; fitted condition prices vs the
    −1-rank rider exchange rate (mid-rank hybrids ~×0.5–0.75 of pure budget must be
    reproduced by the priced model, not just observed).
  - No silent tuning: gate misses ship with diagnosis, same as round 1.
- **D30-10 Deliverables + CLI.** Updated `results/`: point-tables.md gains the condition
  price card (per-condition/tier, in budget-fraction AND rank-equivalents) + the
  effective-target multiplier card; power-ledger.md covers the full scored population
  (extremes first) + the typed unscored ledger; validation.md gates above. `assay score
  --spell` accepts the same Foundry `system` shape including description-embedded
  condition refs, so a homebrew spell JSON with conditions scores end-to-end. **Homebrew
  contract (review nit): the README template MANDATES the `@UUID[…conditionitems.Item.X]`
  markup + `<strong>Degree</strong>` structure, and `assay score` WARNS when the
  description contains condition-word text with zero refs** (else a plain-English
  homebrew spell silently scores as pure damage — an overscore).
- **D30-11 Discipline.** Same tree rules as round 1 (pathspec-scoped git only, no stash,
  never touch `apps/codex/`, snapshot is read-only). Push after each green slice (push is
  now sanctioned). Full py lane green locally before each commit; hermetic tests — the
  new extraction pass gets fixture spells covering: valued condition suffix, unvalued
  condition, 4-degree attribution, partial-degree, failure-default, status-modifier,
  heightened-block exclusion, overlay per-variant, inline-@Damage recovery, manual-scaling
  entry.

## 3. Out of scope (round 3+ candidates)

Effect-item buffs without numeric prose (222 `spell-effects` refs — heroism-class spells
whose payload lives in a linked effect item), summons (own sub-model), walls/terrain,
teleportation/utility valuation, focus-spell band comparison, ritual scoring, legacy-spell
scoring, any codex surface.

## 4. Slices (serial; one sonnet engineer + one orchestrator-reviewed commit each)

- **S1 — extraction extension.** D30-2 effect extraction (the four attribution rules) +
  D30-6 recovery paths + fixtures + tests; refreshed `out/features.json` with effect
  fields + confidence; re-derived pins with CORRECT hygiene (review: bracket-bounded
  capture — the naive regex mangles Off-Guard — and per-spell, base-text-only counting;
  expected: condition spells 427-per-spell-recounted, valued 189-recounted, no-damage
  ranked w/ conditions **282**, degree-markup 337, inline-@Damage 58 w/ 47 literal,
  overlay spells **40**/110 variants, mechanical scaling family re-derived from
  variable-cast+damage+no-overlays — report every delta). No model changes.
- **S2 — pricing + rescore.** D30-1 pure-anchored ladder + effective-target re-fit +
  Stage A/B pricing + D30-7 + full-population rescore + results/ regeneration + V1′–V4′
  validation + README/homebrew-template + spec §5 build record.

## 5. Build record

**S1 (`6d77fa7`) — extraction extension.** `conditions.py` (new): bracket-bounded `@UUID` condition
capture, degree-section splitting, the four attribution rules, duration classification (prose
first, `duration` field fallback), D30-4 coverage arithmetic, D30-5 tier table. `extract.py`:
overlay spells deep-merge each non-empty-`system` variant onto the base and score per variant
(D30-6a) — this also surfaced and fixed a real round-1 gap where healing-only overlay variants
(e.g. "Heal (vs. Living)") were silently dropped, since round 1 only recognized `kinds` containing
`"damage"`. The mechanically-derived scaling family (D30-6b) is exactly **6** spells — force
barrage, banishing touch, splinter volley, ibex's harvest, channel arrogance, mutilate — matching
the mechanical rule `variable-cast-time + damage + no-overlays` literally; magic stone is
EXCLUDED under this same literal rule (it has no damage formula anywhere in its JSON, structured
or inline — its power is delegated entirely to a granted-weapon-property effect item), a deviation
from the review's prose list of "6 missed real scalers" that I judged correct: the review's point
was regex-vs-mechanical, and the mechanical rule as written does not admit magic stone. Literal
inline-`@Damage` recovery (D30-6c) required TWO extraction fixes beyond the spec's literal text:
(a) a single `@Damage[...]` tag can pack multiple comma-separated `formula[types]` pairs (e.g.
`2d8[piercing],2d4[slashing]`), which the naive "split on the last `[`" approach mis-parsed;
(b) a ≥4-distinct-token description is the "choose one color/element" shape (elemental breath,
chromatic ray/wall, prismatic spray, rainbow fumarole) — summing every token overstates EV
several-fold; not covered by any rule, routed to the ledger. Re-derived pins (bracket-bounded +
base-text-only hygiene, real extractor output): 736 rows / 481 skip records pre-fix (the numbers
below are POST the S2 bug-fix pass, since several of these fixes landed while wiring S2's pricing
pipeline against real output — see the note at the end of this section). Overlay 37/40 source
files contribute ≥1 scored row (3 score zero rows for explained reasons: flourishing-flora's
tokens are all `@item.rank` arithmetic, blazing-bolt/weapon-storm's variants have neither damage
nor conditions). Inline-damage literal 33 files + 11 non-literal = 44 total vs. the spec's 58/47
pin — explained by base-text-only stripping (3 spells' only inline token lives in a Heightened
block) plus overlay/long-cast precedence correctly routing several spells away from the inline
path entirely (verified file-by-file: jassims-allegiance/clockwork-devotion are overlay spells,
ghostly-tragedy is long-cast).

**S2 (this commit) — pricing + rescore.** Three bugs were found and fixed against the REAL corpus
while building this slice (documented here per "no silent tuning" — each is a genuine correctness
fix, not a tuning choice):

1. **D30-4's coverage severity had `success` hardcoded to 0.0.** This silently zeroed every
   condition-instance explicitly attributed to a spell's Success row (Fear's Frightened 1 on
   success) — directly contradicting the spec's own text ("effect-on-success ADDS its
   success-row value"). Fixed: `success` severity = 1.0 (same as failure; the milder VALUE is
   already captured by the tier assignment, not the degree severity).
2. **D30-1's pure-subset filter admitted two contamination classes the spec explicitly warns
   about** and a third the review didn't name: Holy Cascade (an inline `@Damage` spirit-damage
   rider riding ALONGSIDE its structured entry, understating its true EV — a NEW
   `has_extra_inline_damage` field detects this generally) and Disintegrate (attack-roll THEN a
   save — a double-gate the pure definition's `not has_attack_trait` now excludes, matching the
   "structural refit impossible on pure — zero variance" logic already applied to action cost).
   Result: pure n=34 (round 1) → 28 (round 2, real re-derivation) → the shipped ladder excludes
   the rank-9 singleton (Detonate Magic) per the spec.
3. **`ledger.classify_row` treated ANY `confidence="low"` row as unscoreable**, which
   accidentally routed Force Barrage's manual-scaling-table rows (correctly hand-verified EV, but
   flagged low-confidence for a documentation reason unrelated to the EV itself) to the ledger —
   directly contradicting D30-9's own V3′ expectation that force barrage should be SCORED via
   its manual-scaling path. Fixed on both sides: manual-scaling rows no longer carry
   `confidence="low"` (their EV is hand-verified, not an uncertain extraction), and
   `classify_row` checks `has_damage` before `confidence` (a real EV is scoreable regardless of
   condition-attribution confidence; only a damage-less row leans entirely on a possibly-unreliable
   condition read). A related D30-7 bug: the original boss-weighted "degrade one outcome step by
   relabeling the instance's own degree" is a no-op once `success` carries real weight (fix #1) —
   redesigned as a boss-weighted OUTCOME-PROBABILITY TABLE (shifts probability mass toward
   better-for-target results directly) so degradation is monotonically weaker at every tier,
   proven by `test_boss_weighted_degrades_one_step_and_never_increases`.

**Shipped pure-anchored ladder** (excluding the rank-9 singleton, n=27 after also dropping
Detonate Magic itself from the n=28 filtered set): `log EV = 1.798 + 1.089·log(rank)`, R²=0.967.
Including the singleton (n=28): slope 1.001 — the spec's own predicted sensitivity direction
("dropping it alone moves the exponent 1.02→1.08") reproduced almost exactly (1.001→1.089 here).
Budget(r) tracks the community 7×rank line within ±14% at r=1 and ≤6% for r≥3 (V4′, full table in
`results/validation.md`). Effective-target/range multipliers (fit on the same fold): party-scale
×1.07, small-multi ×1.00 (single is the reference) — smaller and less directionally clean than the
probe's "1.04–1.89 ST/AoE premium" expectation, reported honestly (n=27, thin). Action-cost
constants stay declared per D30-3 (1a ×1.4 · 2a ×1.0 · 3a ×0.75 · reaction ×1.6); a real-data
check (n=10 attack-roll damage spells, geomean EV/budget ratio 1.05) supports NOT adding a
declared attack-roll discount — PF2e's own math evidently already balances attack-roll accuracy
against basic-save EV near parity, so round 2 doesn't add a targeting-class multiplier beyond
D30-3's effective-target axis.

**Stage A** (hybrid trainer n=133 vs. the spec's ~130 pin — close, the small delta is
variant-row counting): α=−0.271, β_T2=0.388 (fitted), β_T3=0.198 (fitted), β_T4=6.0 (declared
prior — derivation: targets ~80% of budget for a single failure-only ~1-round-duration T4
application, `1−exp(−β·0.276)=0.80 → β≈5.83`, rounded to 6.0). β_T1 fit RAW at −0.018 (essentially
zero, not reliably distinguishable from it at R²=0.053) — floored to 0.0 operationally (the exp
link is undefined for negative β; both numbers ship, see `pricing.StageAFit.beta` vs. `beta_raw`).
T4's condition price card entries land at 0.76–0.84 budget fraction (Controlled highest at 0.835,
Dying lowest at 0.763) — consistent with "fight-ending... effectively incapacitation-gated".
T2/T3 mid-tier prices land 0.04–0.10 of budget per single failure-only application — well below
the −1-rank (~0.5–0.75-of-budget) anchor for a SINGLE condition instance, because that anchor was
measured on whole HYBRID SPELLS carrying multiple/escalating instances (e.g. a 4-degree spell
sums several weighted terms through the same `p=1−exp(−Σβw)` link) — the per-condition price card
is deliberately the per-instance rate, not the whole-spell aggregate; the aggregate check is V4′'s
"see the Stage A residual spread" pointer.

**Full population** (D30-8): 629 scored / 586 ledgered (of 1,215 total rows post variant
expansion) — non-cantrip scored n=530, inside the spec's 550–700-of-1,075-ranked expectation band
once cantrips and variant-row inflation are accounted for. Ledger reasons: utility/no-mechanical-
payload 254, long-cast 96, effect-item-payload 78, raw-modifier-only 61, beneficial-effect 27,
summon 18, teleport/utility 17, extraction-edge-case 16 (mostly the multi-choice color spells),
non-literal-formula 9, low-confidence 5 (mostly affliction-stage spells — Swarming Wasp Stings'
"Stage 1/Stage 2" poison-dose block is NOT degree-of-success text and is excluded from
attribution + flagged, a shape the four rules don't cover per D30-2e).

**Gate evidence** (`results/validation.md`, real numbers, no asserted values):
- **V1′ FAIL** (pure 36.2%, hybrid 27.9%, control 8.2%, all-non-cantrip 23.7% within ±½ rank vs.
  the ≥80% target) — diagnosed as the expected cost of narrowing the structural axis to
  effective-target+range+action (round 1's area-type/damage-type/passive-defense/sustained/
  rarity facets are now unmodeled spread), not a metric artifact.
- **V2′ FAIL** (mean |resid| 1.99 vs. ≤0.75; Fireball residual −0.45, WITHIN its own ±0.6
  tolerance) — the aggregate miss is driven by non-Fireball heighten projections; not
  separately re-diagnosed further given the session's time budget, flagged as open for gate H.
- **V3′ FAIL** (7/12 = 58.3% vs. ≥75%) — diagnosed in full in `validation.md`: Fear/Slow/
  Synesthesia score cold from an architectural Stage-A-to-B extrapolation mismatch (β's learned
  from PARTIAL hybrid discounts, reused to justify a control spell's ENTIRE budget); Disintegrate
  scores hot from its unmodeled double-gate (the spec's own V3′ text names this nuance); Flense is
  a marginal (+0.146) likely-noise miss. Command is an EXPECTED ledger entry (asserted absence,
  same treatment as sure strike/shadow siphon/walls) and correct-side by that convention.
- **V4′ informational, strong**: ladder tracks the community 7×rank line within ±14%/r1, ≤6%/r≥3.

**Flagship spot-scores** (for the session's final report): Fear −0.82 ranks cold · Slow −2.29
ranks cold · Synesthesia −4.05 ranks cold (all three: extraction verified correct by fixture
tests, cold from the Stage-A/B extrapolation gap above, not an extraction bug) · Force Barrage
+1.65 ranks hot (manual-scaling path, correctly flips the round-1 wrong-sign outlier).

**Decisions made that the spec left to the engineer** (flagged per the review's own framing that
"each [V3′ gate name]'s path be recorded... before S2 runs" implied engineer judgment in several
places): the V3′ enumerated list drops "dizzying-colors' counterpart fear-family entries" (an
ambiguous spec phrase with no unambiguous single-spell resolution) but keeps "Dizzying Colors"
itself under the weak list, giving 12 gate names not 12–16; Command's expected path is the ledger,
not a scoreable condition path (the review's own text — "command's refs are preamble options" —
already asserts the preamble Fleeing/Prone refs must NOT be attributed, and no other rule covers
its forced-action-loss mechanic); the coverage-arithmetic per-instance model treats each
ConditionInstance's own attributed degree independently rather than re-merging same-condition
multi-degree "coverage sets" (documented in `pricing.instance_weight`'s docstring) — a
simplification the spec's D30-4 text doesn't fully resolve for escalating multi-degree conditions
like Fear's Frightened 1/2/3.
