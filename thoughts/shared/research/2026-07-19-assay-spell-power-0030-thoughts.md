# assay (0030) — quantitative spell power scoring for PF2e homebrew — scoping + round-1 design

**Status:** ROUND 1 BUILT (2026-07-19, `e6df546` S1 extractor · `4285ce8` S2 fit/CLI/results) —
gates V1–V3 FAILED as fitted, then the post-hoc pure-damage probe (§6) decomposed the failure
into a VALIDATION of the method: the pure-damage core clusters and recovers the official
curves; the residual spread is unpriced rider severity — exactly round 2's scope. Stakeholder decisions R1–R4 resolved
2026-07-19 (batched): **R1** slot spells only (focus/rituals out of the calibration band) ·
**R2** hybrid method — fit interpretable weights, then round into a human-usable point table ·
**R3** durable standalone experiment dir in-repo (`apps/assay`, uv lane) · **R4** round 1
calibrates on the damage axes where extraction is reliable; condition/effect pricing is round 2.
**Provenance:** stakeholder designs homebrew spells; 5e's loose math tolerated eyeballing,
PF2e's tight math doesn't. Goal: a power score such that same-rank official spells cluster,
so a homebrew spell can be checked "in band" before play.
**Empirical basis:** two parallel research agents 2026-07-19 — a full census of the Foundry
snapshot spell packs (read-only, real counts below) and a sourced review of official/community
balance frameworks. No published quantitative PF2e spell-scoring model was found; this appears
novel.

## 1. Data reality (census, pf2e-8.3.0 snapshot)

Source of truth: `apps/codex/data/snapshots/foundry/pf2e-8.3.0/packs/pf2e/spells/`
(gitignored, main-tree only; read via the codex data-path config, never a hardcoded path).
The codex emitted corpus is display-shaped (facets are strings, no damage/heightening);
Foundry `system` is strictly richer mechanically → **assay reads the Foundry snapshot**.

- **Population:** main slot spells **1,144** (69 cantrips + 1,075 ranked; rank via
  `system.level.value`, cantrips via the `cantrip` trait — `level` is always 1 for them) ·
  focus 508 (`focus` trait / empty traditions) · rituals 150 (`system.ritual` present).
  One folder/level mismatch (`rank-2/funeral-flames.json`, level=1): trust `level.value`.
- **Structured coverage (main):** damage ≥1 entry 329 (357 `NdM`, 18 flat, 5 `NdM+K`;
  types incl. 29 untyped) · defense 495 (will 189 / fort 155 / reflex 144; `basic` explicit —
  145 true; 9 use `defense.passive` ac/fort-dc) · attack spells = the **`attack` trait**
  (52; no structured field; 8 mixed attack+defense) · area typed+numeric 285
  (burst 144 / emanation 61 / cone 33 / line 21 / …) · heightening 383
  (interval 270 — 196 of them every-rank; fixed 107; **degenerate `type:null` ×6 and
  `fixed`+empty-levels ×2 — treat as absent**) · sustained 166 · incapacitation trait 59 ·
  subtle 20.
- **Extractor traps (all census-verified, with example files):**
  1. Damage dicts keyed by random Foundry IDs, not `"0"` (237/380 entries) — iterate
     `.values()`.
  2. `kinds` distinguishes damage vs healing **within one entry** (`["damage","healing"]`
     on heal/harm/cloak-of-light/field-of-life/summon-healing-servitor) — branch, never
     sum all formulas as damage.
  3. **`system.overlays` variant-cast data on 64 spells** (heal, harm, ignition,
     prismatic-spray, …): the base `damage` field is only ONE variant. Round 1 EXCLUDES
     overlay spells from the fit and lists them in the report (the heal/harm family would
     otherwise score wrong).
  4. Variable cast times: `"1 to 3"` ×17, `"2 or 3"` ×5, `"1 or 2"`, malformed
     `"2 to 2 rounds"` ×3. Normalize to a canonical action count for scoring (see §3).
  5. Range strings defeating `\d+ feet`: `"1,000 feet"` (comma), bare `"120"`, `varies`,
     `"your Speed"`, `planetary` ×7, `touch` 189, empty 294.
  6. Flat formulas (24, mostly per-tick thresholds: execute "70") + one `"@item.rank"`
     formula (focus, out of scope) + `applyMod` ×3.
  7. `category`: persistent 17, splash 3 — separate coefficients, not plain damage.
- **Round-2 hooks proven:** conditions are prose-only BUT every checked condition spell
  carries `@UUID[Compendium.pf2e.conditionitems.Item.<Name>]` refs in `description`
  (regexable, sometimes with `{Frightened 2}` value suffix); 4-degree success markup
  regexable on 274/1,144 (24%); `@Damage[...]` inline rolls in 136 descriptions (244/326
  instances literal dice) cover damage the structured field misses.

## 2. Balance anchors (sourced; full citations in the research agent report, linked below)

- **No official spell-building table exists.** The load-bearing official numbers are
  creature-level-indexed: GM Core *Building Creatures* Damage-Dealing Abilities
  (AoN Rules #2874/#2910). **The rank↔level bridge:** top castable rank r ↔ creature level
  2r−1, and the limited-use Area Damage column reproduces real spell damage exactly
  (L1 2d6 = breathe fire R1; L5 6d6 = fireball R3) — the corpus and the creature rules
  share one curve; the fit should recover it.
- **Community damage baseline:** 2-action AoE basic-save ≈ **2d6 per rank (avg ≈ 7×rank)**;
  single-target ≈ +25–35%; auto-hit (force barrage) ≈ half budget priced for reliability;
  cantrips scale per 2 character levels (≈ 40–50% of a top slot) — **separate curve, fit
  separately**.
- **The one official rider price:** "another significant effect, like applying a condition
  → damage of 2 or more creature levels lower" ≈ **−1 spell rank of damage budget**
  (round-2's exchange-rate anchor).
- **Action economy (community consensus):** 1a ≈ ×1.4 premium per effect, 2a = 1.0 baseline,
  3a ≈ ×0.75 (must beat 1.5× a 2-action spell, rarely does), reaction ≈ ×1.6,
  sustained = −⅓ turn/round tax.
- **System math the model must respect:** ±1 to DC/bonus ≈ 10 percentage points of outcome
  shift (±10 crit bands); basic-save EV vs on-level moderate save ≈ 0.6× listed damage;
  spell attacks get no item bonus (systematic accuracy drift vs martials);
  **incapacitation** ≈ effective-rank −2 vs the targets that matter; counteract value is a
  step function of rank (crit ≤ r+3 / success ≤ r+1).
- **Calibration outlier lists** (community consensus, for residual validation):
  strong — fear, heal, command, slow, fireball-as-benchmark, haste, synesthesia,
  shadow siphon, force barrage, electric arc, sure strike, invisibility, wall of stone…;
  weak — acid splash, daze, admonishing ray, flense, hydraulic push, dizzying colors,
  disintegrate (double-gated), legacy polar ray… (~20 each with ranks in the agent report).
- Remaster note: schools removed (never a facet); rename alias table exists
  (force barrage←magic missile etc.); codex's superseded machinery already models
  legacy/remaster — assay round 1 uses the Foundry pack (remaster) only.

## 3. Round-1 model (locked design)

**Fit population:** main slot spells, non-cantrip, with ≥1 structured damage entry whose
`kinds` includes `"damage"`, **excluding** the 64 overlay-variant spells and `@item.rank`
formulas → ≈300 spells. Cantrips with damage (~20+) get a parallel independent fit.

**Response:** `log(EV)` where EV = summed average of the spell's damage entries at its
**native rank** (NdM → N·(M+1)/2 + K; flat = value; persistent/splash entries carried as
separate features, not summed into the main EV; multi-entry spells sum their plain-damage
entries — cataclysm's 6 entries are one EV).

**Predictors:**
- **Rank fixed effects μ_1..μ_10** (no functional form imposed — the budget curve is read
  off the fitted ladder; expect ≈ log(7·rank) if the community baseline holds).
- Targeting class (categorical): AoE-save / single-target-save / attack-roll (`attack`
  trait) / auto-hit (no defense, no attack trait).
- `basic` save flag (non-basic damage spells carry degree-text riders — expect a discount).
- Action cost, normalized: 1 / 2 / 3 / reaction; variable "1 to 3"→2, "2 or 3"→2,
  "1 or 2"→1.5 equivalent (recorded per spell in the features table).
- Area magnitude (log feet, 0 for none) + area type.
- Range bucket: touch/self / ≤30 / ≤60 / ≤120 / >120 / planetary-unlimited.
- Rider proxies (booleans, round-1 coarse): has-condition-@UUID-ref in description ·
  persistent entry present · sustained · non-instant duration · incapacitation · defense
  is passive-AC.
- Damage type class: commonly-resisted (fire/cold/acid/…) vs rarely-resisted
  (force/spirit/mental/vitality/void/untyped).
- Rarity as a flag (uncommon/rare are access-gated, not power-gated — report the fitted
  coefficient, expect ≈0; do NOT bake rarity into the point table unless the data insists).

**Fit:** ordinary least squares on the log-linear design (pure numpy lstsq; no sklearn).
~25 parameters on ~300 rows.

**Outputs (the hybrid deliverable):**
1. **Damage-budget-by-rank table** — exp(μ_r), rounded to dice-friendly averages.
2. **Facet multiplier table** — exponentiated coefficients rounded to clean fractions
   (×1.25, ×0.75, …): the human-usable point card for designing a spell.
3. **Per-spell power ledger** — every fit spell with EV, predicted budget, and residual in
   **rank-equivalents** (residual ÷ the local rank-ladder slope): "+0.8 ranks hot" is the
   working currency.

**Validation gates (the round-1 hypothesis tests):**
- **V1 clustering:** in-rank residual spread; target = the middle 80% of spells within
  roughly ±⅓ rank-equivalent of budget. If this fails, the facet set is wrong — stop and
  re-design, don't tune silently.
- **V2 heighten consistency (held out of the fit):** project interval-heightened spells to
  +1..+3 ranks and score against the fitted budget at those ranks — fireball at 8d6 must
  sit near the rank-4 line. Systematic drift = the μ ladder is mis-shaped.
- **V3 known-outlier sanity:** the community strong/weak names that ARE damage spells
  (force barrage, electric arc vs acid splash, admonishing ray, disintegrate's double-gate
  discount) must land on the right side of zero residual. A model that calls acid splash
  strong is wrong regardless of R².
- **V4 anchor recovery:** fitted μ ladder vs GM Core's converted limited-use column and the
  7×rank community line — report the comparison explicitly.

## 4. Home + implementation shape

- **`apps/assay`** — new uv workspace member (auto-joins via the root `apps/*` glob; member
  dir created WITH its `pyproject.toml` — the empty-member uv gotcha). Python ≥3.12, ruff +
  ty + pytest green; numpy as the only new dependency. Telemetry per the standing principle:
  `init_telemetry` at CLI entry + `shutdown()` in try/finally (the short-lived-proc pattern
  from the telemetry coverage pass).
- Reads the snapshot read-only via the codex data-path from config (config-single-source;
  no hardcoded absolute paths). Fails soft with a clear message when the snapshot is absent
  (fixture-less checkouts): tests are hermetic on a small committed fixture set
  (~10 hand-picked spell JSONs covering every §1 trap).
- CLI: `uv run assay extract` (features table) · `uv run assay fit` (params + tables) ·
  `uv run assay score [--spell <file>]` (score one homebrew spell JSON against the fitted
  model — the actual point of the tool). Generated outputs land in `apps/assay/out/`
  (gitignored); the fitted params + rounded point tables are committed as small JSON/MD.
- **Round 2 (scoped, not started):** condition extraction via the `conditionitems` @UUID
  hook + per-condition severity pricing (slowed/stunned/frightened exchange rates, the GM
  Core −1-rank rider anchor), degree-of-success coverage multiplier, `@Damage` inline-roll
  recovery, focus-spell band comparison. Round 3+ candidates: a codex surface.

## 5. Session discipline (this round)

Another engineer is mid-P14-S2 in this same main tree: **all git operations are
pathspec-scoped to `apps/assay`, `uv.lock`, and this doc — never bare `git add -A`/bare
`git commit`, never `git stash`** (the index carries the other session's staged work).
linguist-commit timer is already stopped (P14 session owns restarting it). Commit the
CI-green slice; **do not push** (origin sits behind the other session's unpushed S1 —
pushing would publish their in-progress round).

## 6. Round-1 outcome (2026-07-19) — the honest fail, then the probe that explains it

**Build:** `apps/assay` landed green both commits (`e6df546`, `4285ce8`); full py lane clean
repo-wide; real fit executed (fit population 264 non-cantrip + 22 cantrip; skip ledger:
812 no-damage-kind, 40 overlay-variant, 5 no-plain-damage, 1 long-cast). Committed results
in `apps/assay/results/` (fitted-params.json, point-tables.md, power-ledger.md,
validation.md). Engineer followed the no-silent-tuning rule: gates reported failing as-is.

**As-fitted gate results:** V1 FAIL (20.5% within ±⅓ rank vs ≥80% target; raw within-rank
log-EV sd ≈0.43 — real heterogeneity, not a metric artifact); V2 FAIL (heighten projections
mean |resid| 2.35 ranks — the μ ladder undershoots mid-ranks); V3 MIXED (fireball/acid
splash/admonishing ray/electric arc correct-side; force barrage/disintegrate/hydraulic push
wrong-side); V4 informational (μ ladder hits GM Core near-exactly at r1/r3, drifts −13..−21%
r4–r9, r10 cell n=3). Also: the full-model single-target coefficient came out ×0.50 vs AoE —
inverting the known +25–35% premium — an identification artifact (targeting class entangled
with area_type + log-area terms).

**The probe (orchestrator, scratchpad `pure_probe.py` over `out/features.json`):** split the
264 into **pure damage** (2-action, basic save, no condition refs, instant, non-sustained,
no persistent/incap/passive) = **34 spells**, vs the **rider family** = 230. Findings:

1. **Purity is rare** — only 13% of "damage spells" are damage-only. V1 was testing hybrids
   with boolean rider proxies; the spread IS rider-severity variance.
2. **The pure core clusters:** pooled within-rank log-sd 0.34 (×1.41) vs 0.58 (×1.78) for
   the rider family; pure-AoE r1–r3 sd 0.07–0.33. Hot/cold names are sane: lightning bolt
   ×1.45 / cone of cold ×1.44 / fireball ×1.17 hot (the community's efficient-damage picks);
   Ibex's Harvest ×0.50 / Holy Cascade ×0.52 cold (both carry prose riders the pure filter
   can't see — supporting, not refuting).
3. **ST premium recovered on the pure subset:** ST/AoE geo-mean ratio 1.04–1.89 by rank
   (mostly ~1.1–1.4) — the full-model inversion was collinearity, as suspected.
4. **THE headline: the official rider price falls out of the data.** Rider-family spells
   deal ×0.43–0.81 of same-rank pure budget (mid-ranks ~0.5–0.75) ≈ one rank of damage
   budget down — empirically reproducing GM Core's "condition rider → −2 creature levels"
   ≈ −1 spell rank exchange rate. The corpus obeys the rule; per-spell deviation from it is
   precisely the rider-severity signal round 2 must price.
5. **Extraction gap class 3 (new):** prose-only action-scaling — force barrage's "+1 shard
   per action" lives nowhere structured; its base entry captures only the 1-shard cast.
   Distinct from overlays and heightening; V3's wrong-signed outlier exposed it.

**Round-2 design implications (locked by this evidence):**
- **Anchor the budget ladder on the pure subset** (smoothed — pool thin top ranks), not on
  the pooled fit; price everything else as deviation from it.
- **Rider severity extraction** = the round-2 core: `conditionitems` @UUID refs + value
  suffixes (`{Frightened 2}`), degree-of-success coverage (effect-on-success multiplier),
  duration class, incapacitation — priced against the empirical −1-rank exchange rate.
- **Fix identification:** collapse area_type/log-area/targeting into one effective-target
  axis before refitting multipliers.
- **Recover the prose action-scaling family** (force barrage class) + overlay variants
  (heal/harm) via per-variant scoring.
