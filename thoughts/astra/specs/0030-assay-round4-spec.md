# 0030 assay round 4 — buff + summon coverage, and the codex surface — NLSpec

**Status:** FINAL (2026-07-20) — adversarially reviewed; **5 blockers + 9 minors/nits ALL
folded below.** Foundations VERIFIED by the review: the spell-effects join premise is exact
(222 ref-bearing main-list spells, 263/263 refs resolve by item name, 0 unresolved); the
summon journal curve is byte-for-byte the declared table (gm-screen.json, entry
`S55aqwWIzpQRFhcq`, page `8gcp880pEWZ9VPnF` "Summon Trait"); slug mapping is TOTAL (all
1,144 pack basenames → plain codex slugs, zero collisions). Headline blocker catches:
(1) the draft's buff population excluded nearly all real buffs INCLUDING HEROISM (only
19/81 round-3-beneficial rows carry join atoms; the mass = 89 effect-ref-bearing
SkipRecords never extracted + the 65 raw-modifier-only rows — heroism routes there);
(2) the W-B roster named two spells that don't exist in the pack (stoneskin/false life →
Mountain Resilience/False Vitality); (3) the export schema couldn't render the surface's
promises (no rank/ev/budget, hybrid representation undefined); (4) comparable targets had
no id data path (28 variant-label profiles; 34 multi-row slugs, collapse undefined);
(5) empty-profile comparables degrade to an alphabetical junk top-5 at similarity 0.0 that
the surface would print. Also folded: the evaluator family widened (only 32/79 exprs are
ternary; +8 closed-form arithmetic among joined effects; 11 runtime-only stay flagged);
`@item.level` semantics = **the SPELL's base rank, never the effect item's own level field**
(29/263 joined pairs disagree — stale/heightened-variant levels); 198/333 FlatModifiers
carry predicates (mystic armor's saves atom is level-gated OFF at base rank — predicate-
blind extraction lies); array selectors fan out (71/333); ONE valueless FlatModifier
(pin: 253 int + 79 str + 1 null = 333); multi-effect merge rule; summons n=14 with
phantasmal minion needing kind-precedence and the round-3 `_SUMMON_TRAIT_RE` being dead
code (`^summon\s` can never match the bare trait "summon"); "remaster docs only" must read
"non-@legacy corpus docs" (389 never-remastered pack spells are visible-by-default codex
pages and MUST get entries); raw ledger reasons are internal jargon → typed reason codes +
a curated codex copy map (the P13 formatFacetValue lesson); "image unchanged" was FALSE
(new server code ⇒ image rebuild), bind-source pre-create as uid 1000, artifact reload
folded into `codex-refresh`; the assay loader must NOT mirror corpusFs's fixture fallback;
the block rides an optional data field (goldens byte-identical untouched) and DOES appear
in the `?entry=` preview pane (accepted, recorded).

**Stakeholder scope (R4, resolved 2026-07-19): BOTH tracks in one round.** Prior context:
rounds 1–3 (`0030-assay-round{2,3}-spec.md`, scope doc §6/§7); the generative effect-value
fit stays tombstoned. **Empirical pins:** spell-effects pack 510 items; rule keys
FlatModifier 333 (253 int / 79 str-expr / 1 null) · ChoiceSet 131 · BattleForm 97 ·
DamageDice 97 · Resistance 89 · GrantItem 45 · TempHP 35; 20 spells ref >1 effect;
summon-trait main-list spells **14** (13/14 match en-dash-tolerant base-level prose; miss =
Phantasmal Minion, fixed-creature, currently a scored row); buff-population components:
round-3 beneficial 81 (19 atom-bearing) + raw-modifier-only 65 (heroism, protection here)
+ ref-bearing skips 89 (43 atom-bearing; 8 hostile-shaped: blood vendetta, bone flense,
fungal infestation…). Re-derive at build; unexplained delta = STOP with options.

## 1. Goal

(A) Buff spells become comparables citizens with machine-extracted atoms (no pricing —
the tombstone stands); summons get a quantitative band check. (B) codex spell pages
(non-@legacy docs with pack counterparts — the 1,144 main list) surface the assay verdict
fail-soft, labeled experimental. After R4 every pack main-list spell's codex page shows
something truthful; corpus-only docs (superseded legacy, focus-under-spell/) correctly
show nothing.

## 2. Decisions — Track A (assay; owns `apps/assay/**` + `uv.lock`)

- **D30-35 Join + rule extraction.** Name→item index over the pack ("Spell Effect: X",
  colon-tolerant bracket-bounded refs). Per effect: FlatModifier atoms — **fan out array
  selectors; evaluate `@item.level` expressions at the SPELL'S BASE RANK (never the
  effect item's level field); expression evaluator covers the ternary family AND the
  closed-form arithmetic family (`2*@item.level`, `ceil(...)`, `clamped(...)`,
  `match/when/btwn`) — runtime-only shapes (`@actor.*`, `@item.badge`, mustache flags,
  `rulesSelections`) flag the atom `expr-unresolved`; predicates: level-family predicates
  (`parent:level` gte/lte) evaluate at base rank (mystic armor has NO saves atom at rank
  1), all other predicates tag the atom `conditional` (present in profile as a tag, not a
  valued atom); the one valueless FlatModifier handled** — plus TempHP, typed Resistance/
  Weakness (mustache-typed resistance = a `choice-of-energy` representation, not a
  concrete type), BaseSpeed, structured duration. Non-atom rule keys → profile TAGS;
  BattleForm spells tagged `battle-form`, modifier profile suppressed (recorded
  sub-model gap). **Multi-effect merge:** base-variant effect only (heightened-duration
  variant items — "(8 hours)"/"(24 hours)"-class — excluded from base profiles);
  degree-split effect pairs keep the failure-row effect; choice-form fans (Animal Form
  ×13) → tags.
- **D30-36 Buff population (CONSTRUCTIVE — the draft's "round-3 beneficial" missed the
  mass).** Population = (round-3 beneficial rows) ∪ (raw-modifier-only rows passing the
  D30-22 beneficial test — heroism, protection) ∪ (**effect-ref-bearing SkipRecords
  PROMOTED to fully-extracted rows** and routed through D30-22 — the 89, of which 8
  hostile-shaped must land hostile; promotion changes the round-3 splits, so W-D
  reconciles against RE-DERIVED splits with every delta enumerated). Profiles: modifier
  atoms by selector class (AC/saves/attack/skills/speeds/perception), TempHP band,
  beneficial conditions, resistance (typed or choice-of-energy), tags, duration class,
  structural coordinates. Comparables: beneficial-vs-beneficial ONLY (population
  firewall). Prior-card buff section: pack-curve anchors (heroism +1/+2/+3 @ r3/6/9 —
  noting base-rank profiles carry +1 and the heightened tiers live in the CARD only,
  by design; the AC line; resistance-per-rank family), labeled priors.
- **D30-37 Summon band check.** Population = summon-TRAIT spells (fix the dead
  `_SUMMON_TRAIT_RE` — trait-list membership, not `^summon\s` name prefix), n=14 pinned.
  Base max-level from prose (en-dash U+2013 tolerant); the declared curve
  (r1→−1, r2→1, r3→2, r4→3, r5→5, r6→7, r7→9, r8→11, r9→13, r10→15) verified at build
  against the named journal page (STOP on disagreement). **Kind precedence:** a scored
  damage row wins `kind:"quantitative"`; summon band then rides as an additional field
  (Phantasmal Minion), not a competing kind. Nonstandard summons enumerated.
- **D30-38 Export artifact** (`assay export-codex` →
  `apps/codex/data/assay/spell-power.json`, deterministic: sorted keys, comparables in
  engine `(-similarity, name)` order, no timestamps, `schemaVersion: 1`). Entries keyed
  by codex id (`spell/<slug>`), **non-@legacy docs with pack counterparts** (never
  `remaster==true` filtering — 389 never-remastered spells are visible codex pages and
  get entries). **Schema (the cross-track CONTRACT — complete enough to render
  everything D30-40 promises):**
  `{ kind: "quantitative"|"comparables"|"buff-comparables"|"ledger", rank: number,
  population: "hostile"|"beneficial"|"summon"|null, verdict?: string,
  residualRanks?: number, ev?: number, budget?: number, rankRange?: [number, number],
  comparables?: [{id: "spell/<slug>", name, rank}], summonBand?: {baseLevel, curveLevel,
  delta}, reasonCode?: string (typed enum, NOT prose), variants?: [{label, kind, …same
  fields}] }`. **Hybrids: `kind:"quantitative"` MAY carry `comparables` — Track B renders
  both.** **Variant collapse (34 multi-row slugs):** one entry per slug; primary = the
  base/2-action variant (its fields at top level), others under `variants[]`.
  **Comparable targets: `ComparableProfile` gains `file`→slug (Track A regenerates the
  committed comparables corpus — schema change flagged); comparables DEDUPE by slug
  before top-5 truncation.** **Similarity floor: below 0.1 OR zero shared non-tier
  atoms → `kind:"ledger"`, `reasonCode:"no-comparable-profile"` — BOTH engines (the
  hostile engine has the same latent alphabetical-junk bug; fix it there too).**
  Export report enumerates unmatched ids (expect 0) + entry counts by kind reconciled
  against re-derived splits.

## 3. Decisions — Track B (codex; owns `apps/codex/**` + `deploy/docker-compose.yml`)

- **D30-39 Loader.** Request-time server-only read of `data/assay/spell-power.json`
  (the P13 `bookToProductLine` pattern: try/catch, module-scope warn-once, fail-soft
  null). **NO fixture fallback** (absent → absent — never mirror corpusFs's
  fixture-corpus fallback; ssrSmoke/CI stay presence-agnostic). Cache-on-success
  per-process (the corpusFs convention) — artifact regeneration therefore requires a
  container restart: **fold into `just codex-refresh`** (which already restarts for
  exactly this reason).
- **D30-40 The Assay block.** Renders wherever the spell `EntityPage` renders — full
  page AND the `?entry=` split-view preview pane (accepted, recorded) — via an OPTIONAL
  field on `EntityPageData`: absent ⇒ render nothing ⇒ goldens/fixtures byte-identical
  untouched. Content per kind: quantitative — "Power: in band / +N.N ranks hot/cold"
  + "EV X vs budget Y at rank R" (all fields from the entry); comparables/buff — linked
  similar spells + "(ranks N–M)"; a "(includes rank 9–10 neighbors — thin data)" note
  when any comparable rank ≥9 (the r10 warning, surfaced); summonBand — the band line;
  ledger — **curated `reasonCode`→copy map (never raw internal strings — the P13
  formatFacetValue lesson)**, unknown codes fall back to a generic honest sentence.
  Hybrids render score AND comparables. Variants render as sub-lines. Header "Assay
  (experimental)". Static SSR, no new hydration, popover contract untouched, no new
  route family.
- **D30-41 Deploy (integration-phase, orchestrator).** Compose: third identical-path
  `:ro` bind `apps/codex/data/assay` (D29-53 convention). **The codex IMAGE MUST BE
  REBUILT** (new server code — never an artifact-only deploy). Order: pre-create
  `apps/codex/data/assay` uid-1000 → `assay export-codex` places the artifact → local
  smoke → **explicit at-the-moment stakeholder flag** → `docker compose build` +
  codex-scoped `just up` → W-F. Gate-H register addition recorded.

## 4. Validation gates

- **W-A (join):** ref/resolution counts re-derived (222/263/0 expected); evaluator
  coverage (evaluated vs `expr-unresolved`, named leftovers); predicate/selector-array
  handling proven on mystic armor + heroism fixtures.
- **W-B (buff comparables):** LOO on the REMASTER-NAMED roster — heroism, mystic armor,
  invisibility, haste, resist energy, sure strike, mountain resilience, false vitality,
  blur, protection (all present post-D30-36) — qualitative neighbor-spots recorded;
  ±1 median-rank rate REPORTED, not gated (the round-3 V-A lesson).
- **W-C (summons):** journal agreement; 13/14 prose extraction + phantasmal minion via
  kind-precedence; curve table published.
- **W-D (export):** double-run byte-identity; unmatched ids = 0; entry counts by kind
  reconcile against RE-DERIVED population splits (deltas from round-3 enumerated —
  promotion changes them by design).
- **W-E (codex, PRE-INTEGRATION):** artifact-absent byte-identity proven BEFORE the real
  artifact lands in the tree (after placement the main tree is never artifact-absent
  again); fixture-artifact render test per kind incl. hybrid, variants, r10 note,
  unknown reasonCode fallback; ssrSmoke against a REBUILT dist (P12); both CI lanes.
- **W-F (live, post-flag):** fireball quantitative block · heroism buff-comparables
  block · an unscored page's curated reason — through the edge; SigNoz 0 ERROR (1h).
- Honest-fail discipline carried.

## 5. Slices (PARALLEL tracks, disjoint ownership; orchestrator integrates)

- **Track A (py): S-A** `feat(assay): S-A effect join + buff profiles + summon bands +
  export-codex` — D30-35..38 + fixtures/tests (heroism join + array-selector fanout,
  mystic-armor predicate gate, expr-unresolved case, multi-effect merge, promoted-skip
  routing incl. a hostile-shaped one, summon fixture, export determinism + variant
  collapse + similarity floor) + re-derived pins.
- **Track B (ts): S-B** `feat(codex): assay block — artifact loader + spell-page render
  (D30-39,40)` — loader (no fixture fallback) + optional-field block + fixture artifact
  covering every kind/edge + compose bind edit + codex-refresh fold + tests. Builds
  against the D30-38 schema fixture, NOT Track A's output.
- **Integration (orchestrator):** W-E byte-identity FIRST, then export + place + smoke +
  the D30-41 flagged deploy + W-F; build record §6.
- Git: pathspec-scoped per ownership; no stash; push after green slices; timer check
  before commit windows.

## 6. Build record

(lands at build.)
