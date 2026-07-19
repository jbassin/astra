# 0029 codex P12 — bespoke class page (5e.tools model) — NLSpec

**Status:** FINAL (2026-07-19) — adversarially reviewed ×2 (opus; independent lenses:
transform/mechanism, product/runtime). **4 blockers + 9 minors/nits ALL folded below.**
The reviews' headline catches: the draft's "0 superseded subclass docs" pin was FALSE —
the real count is **108**, because the REMASTERED subclass options were absorbed into
`class-feature/` by CATEGORY_EQUIVALENCE (ten categories are 100% legacy husks; the draft's
exclude-at-emit rule would have emptied ~7 classes' subclass sections) → the current-edition
UNION mechanism in D29-115; `grantedFeatures`/`subclassOptions` cannot be built at extract
(subclass docs don't exist yet; the 17 null-outs are only knowable post-drop) → the
`augmentClassStats` post-drop pass in D29-114; the cited "emit-Zod referential validation"
precedent does not exist (emit is shape-only) — validation lives in the augment pass;
`EntityPage`'s header is inline monolithic markup, so "reuse without forking" was
unsatisfiable as written → the header-extraction step in D29-119, which also protects the
popover contract (1,066 class-feature docs crossref `class/*`; a popover on a fetched class
page returns EMPTY if `.popover-hint` is missing); the D29-117/119 embed-prefetch
contradiction (inlined feature bodies' own embeds were never collected); the forgotten
`loaderDeps` (the codified P4.5 lesson); gate F ignored the P9 router-dehydration ×2; the
"28 vs 27 keyAbility" discrepancy was a scope-doc arithmetic phantom (it is exactly 27).
**Scope doc:** `thoughts/shared/research/2026-07-19-codex-0029-p12-class-page-thoughts.md`
(R1–R4 stakeholder-RESOLVED: class only · subclass pills → inline render · full feature
prose inline · `/class` becomes the bespoke surface with a narrow class-list rail; mobile
fallback sanctioned). Deploy explicitly sanctioned in advance.
**Empirical basis:** pins generated from the REAL raw snapshots
(`data/snapshots/foundry/pf2e-8.3.0`, `aon/2026-07-17`), the REAL corpus (44,808), and
literal code-path emulation of `uuidResolve`/`categoryMap`/`join`/`drop` — then
independently re-measured by both reviewers. Population-pin discipline (P6/P10/P11): hard
pins are measured; **derive-at-build** items are re-derived by the slice engineer from the
real mechanism — on an unexplained delta, STOP with options.

## 1. Problem

Class pages render through the generic prose pipeline: the only structured facets are
`hp`/`keyAbility`, the level progression exists only as a text-cell AoN table, granted
features are unlinked-by-level, subclass options are invisible from the class page
(verified: NO machine linkage — empty traits/facets, no AoN `class` field, zero class-body
crossrefs into subclass categories), and `/class` browse is a generic 42%-pane split view.
The raw Foundry class packs carry the complete structured model (granted-feature grants by
level, five cadence arrays, all proficiency ranks) — dropped today. 5e.tools' class page
(verified live on a local serve) is the model: progression table with anchor-linked
features, Core Traits box, level-ordered feature stream, subclass toggles, narrow
class-list rail.

## 2. Decisions

### Transform lane

- **D29-113 — scalar class stats at extract.** New `class` branch beside `extractStats`
  (`src/ingest/foundryEntities.ts` — verified: `extractStats` is called in
  `assembleFoundryEntity`, is generic over category (not Actor-scoped), and
  `mergeJoined` spreads the Foundry entity so `stats` survives the AoN merge): emit
  `stats: {kind: "class", …}` with the SCALAR model only (grantedFeatures/subclassOptions
  are D29-114/115's post-drop pass): `keyAbility: string[]` (**psychic is `[]` —
  measured, the only one; schema allows empty; UI renders "Chosen at 1st level"**), `hp`,
  `perception: rank`, `savingThrows: {fortitude, reflex, will}`,
  `attacks: {simple, martial, advanced, unarmed, other?: {name, rank}}` — **`other` is a
  fixed 5th key on ALL 27 raw docs, empty (`{name:"", rank:0}`) on 24; gate emission on
  non-empty `other.name`; gunslinger's is ONE comma-joined entry
  (`"Simple Firearms, Martial Firearms"`, rank 2), not two** —
  `defenses: {unarmored, light, medium, heavy}`,
  `trainedSkills: {value: string[], additional: number}`, `spellcasting: boolean`
  (raw 0/1), `featLevels: {classFeat, ancestryFeat, skillFeat, generalFeat,
  skillIncrease}` (five `number[]` verbatim — **do NOT assume standard cadences:
  investigator/rogue skill arrays are dense 2–20/1–20; swashbuckler's is an irregular
  13-entry set — measured**). Ranks stay numeric 0–4; display mapping is render-side.
  Facets (`hp`, `keyAbility`) unchanged (listing/index untouched). `schemaVersion` 4 →
  **5**. **Pins (review-verified):** 27 raw packs, zero missing fields / non-numeric
  ranks; **exactly 27 corpus class docs carry `facets.keyAbility` and will carry stats**
  (49 = 27 + 20 `@legacy` + 2 miscategorized; the draft's "28" was an arithmetic
  phantom — nothing to reconcile).
- **D29-114 — grantedFeatures + subclassOptions via a NEW post-drop `augmentClassStats`
  pass.** A transform pass over the FINAL kept entity set (the drop/dedupe/sidebarAttach
  precedent in `transform.ts` — NOT extract-time: subclass AoN-only entities are built in
  `runJoin`, and droppedness is unknowable at extract). For each stats-bearing class:
  `grantedFeatures: [{level, name, targetId: string | null}]` from `system.items`,
  uuid-resolved through the EXISTING `uuidResolve`/`categoryMap` seam (all 520 uuids are
  `Compendium.pf2e.classfeatures.Item.<name>`-shaped — measured), then
  **targetId = resolved id if ∈ the final kept-id set, else `null`** — this is also the
  referential validation (emit-Zod is SHAPE-only; no existing pass walks class stats;
  the reviewers verified this nulling reproduces the pins exactly). Sorted (level, name);
  deterministic. **Pins (both reviewers reproduced independently): 520 grants; 503
  resolve to kept docs with non-empty bodies; 17 null** (D29-14 unjoined-residue drops,
  root-caused: cleric First…Final Doctrine ×6, kineticist Gate's Threshold ×3, oracle ×3,
  inventor ×2, psychic ×1, sorcerer Bloodline Spells, thaumaturge Exploit Vulnerability;
  0 renamed/suffixed). The 17 MUST still appear in the progression table (cleric's level
  1 is wrong otherwise) as plain non-link text and are omitted from the feature stream.
  **Do NOT name-match rescue** — verified trap: `action/exploit-vulnerability` is a
  DIFFERENT Foundry doc.
- **D29-115 — subclass options: curated category map + the CURRENT-EDITION UNION.**
  The curated `classSlug → subclassCategory[]` map lives in the transform, but the
  emitted options are NOT the raw category listing — **measured reality (review): the 26
  mapped categories carry 108 superseded docs; ten categories (doctrine, muse, racket,
  research-field, style, conscious-mind, subconscious-mind, cause, arcane-thesis,
  implement) are 100% superseded because their REMASTERED versions were absorbed into
  `class-feature/` (D29-16 CATEGORY_EQUIVALENCE; e.g. `doctrine/warpriest` →
  `remasteredAs: ["class-feature/warpriest"]`).** Mechanism, uniform across both shapes:
  `currentOptions(category) = docs with remasteredAs == ∅  ∪  dedup(remasteredAs targets
  of the category's superseded docs)` — for living categories the union is a no-op; for
  absorbed categories it follows the pointers into `class-feature/`. Emit
  `stats.subclassOptions: [{category, targetId, name, superseded: false}]` for the
  current set PLUS the legacy husks as `{…, superseded: true}` (for the site-convention
  reveal). `category` = the MAP's category label (the pill-row label) even when
  `targetId` points into `class-feature/`. Validated in the augment pass: every mapped
  category exists non-empty; no category claimed twice; every targetId ∈ kept set.
  The map (category→class attribution VERIFIED per-doc): alchemist→research-field ·
  animist→apparition · barbarian→instinct · bard→muse · champion→cause,tenet ·
  cleric→doctrine · druid→druidic-order · exemplar→epithet · gunslinger→way ·
  inventor→innovation · investigator→methodology · kineticist→element · monk→style ·
  oracle→mystery · psychic→conscious-mind,subconscious-mind · ranger→hunters-edge ·
  rogue→racket · sorcerer→bloodline · summoner→eidolon · thaumaturge→implement ·
  witch→lesson,patron · wizard→arcane-school,arcane-thesis ·
  **commander/fighter/guardian/magus/swashbuckler→[]** (verified: no standalone options
  category; magus hybrid-studies / exemplar ikons / animist practices are absorbed into
  `class-feature` and NOT resurrected this round). **Excluded (verified):**
  `draconic-exemplar` (44 docs, one AoN url == `bloodline/draconic`'s — a nested
  sub-choice, not a tab), `hellknight-order` (archetype), `deviant-ability-classification`
  (cross-class). Raw-category census pinned (instinct 15, bloodline 28, doctrine 2,
  muse 4, racket 4, hunters-edge 4, methodology 9, research-field 4, way 5, style 5,
  conscious-mind 6, subconscious-mind 4, lesson 13, patron 11, mystery 12, innovation 7,
  cause 6, tenet 2, arcane-school 9, arcane-thesis 5, implement 9, element 6,
  apparition 1, eidolon 13, epithet 1, druidic-order 13); **per-class current/legacy
  option counts are derive-at-build** (spot expectations: barbarian 9 current + 6 legacy;
  sorcerer 18 current + 10 legacy; cleric current = exactly the two remaster targets of
  its two legacy doctrines). STOP on: a superseded husk with 0 or 2+ remaster targets, a
  target outside `class-feature/` + the mapped category, or any count that surprises.
- **D29-116 — corpus delta discipline.** The transform re-run must change ONLY: the 27
  stats-bearing class docs, `manifest.json` (schemaVersion 5), `report.md` counters
  (`classStatsEmitted` 27, `grantedFeaturesResolved` 503 / `Unresolved` 17,
  `subclassOptionsEmitted` derive-at-build). Every other doc byte-identical;
  **no reindex at deploy — review-verified: `statsText` is gated to creature/hazard
  (`build-search.ts:142-145`), `toIndexRow` excludes `stats`, so class search rows AND
  `class/_index.json` are byte-stable.** Derive-at-build: scratch-outDir diff proving
  the delta set; STOP if wider. Corpus total stays 44,808 / 88 categories.
  **schemaVersion ripple (enumerated — review):** `transform.test.ts:167` + `:345` pin
  `toBe(4)` → 5; `extract-fixture.ts:872` stamps `CORPUS_SCHEMA_VERSION` into fixtures →
  fixture manifests regen.

### Server / route lane

- **D29-117 — class page projection.** New `resolveClassPageData` beside
  `resolveEntityPageData`: entity + (when `stats.kind === "class"`) the resolved
  granted-feature docs **projected slim (`{id, name, level, body}` — keeps the P9
  dehydration blob down)** + the URL-selected subclass docs ONLY (sorcerer has 18+
  options; unselected pills fetch on demand via the existing `memoizedEntity` client
  seam — review-verified usable, returns full `EntityPageData`, mildly wasteful,
  accepted) + the rail rows (class `_index.json`) + `attachedSidebars` as today.
  **Embed prefetch scope (review blocker fixed): collect embed targets from the class
  body AND every granted-feature body AND the SSR-selected subclass bodies** — one map,
  the existing `EMBED_INLINE_CAP=100` (measured: 59/1500 class-feature docs carry
  embeds, worst-case well under cap; derive-at-build the real max across the 27 and
  STOP if any class exceeds the cap). Without this, an inlined feature's embed (e.g.
  fighter's Reactive Strike → `action/reactive-strike`) silently renders fail-soft
  plain text.
- **D29-118 — routes: `/class` + `/class/{slug}` bespoke; fail-soft = generic page in
  the same shell.** New static file-routes `routes/class/index.tsx` +
  `routes/class/$slug.tsx` (static-over-dynamic precedence review-verified against the
  installed TanStack 1.170/1.168 — the `/rules` precedent; **`routeTree.gen.ts` is
  COMMITTED: regen + commit rides S2, the standing flap gotcha applies**). Both render
  the **ClassBrowse shell**: narrow class-list rail + main pane. Main pane = `ClassPage`
  when `stats.kind === "class"`, else the EXISTING generic `EntityRenderPane` (the 20
  `@legacy` + 2 miscategorized docs render generic INSIDE the shell — no dead ends).
  Bare `/class` = rail + intro/empty pane. Rail rows = non-superseded stats-bearing
  classes (**exactly 27** measured) + the site-convention `?superseded=1` reveal for the
  20 legacy rows (render-time filter over ≤49 rows — review-confirmed the P11
  `hiddenCount` loader plumbing does NOT apply here; no virtualization). magus +
  summoner are single-row `edition:"legacy"` non-superseded (measured) — they carry
  stats, get the bespoke page, edition pill renders as usual. **`loaderDeps` is
  REQUIRED on both routes (the codified P4.5 lesson the draft forgot):**
  `$slug` → `({search}) => ({subclass: search.subclass, superseded: search.superseded})`;
  `index` → `superseded`. Both routes define `head` (`Classes · codex` /
  `${name} · codex` per the generic route's pattern). The generic `$category` routes
  keep serving the other 87 categories; class-listing pin re-points are expected ≈nil
  (review: the only "class" token in browse tests is an unrelated feat itemCategory
  map) — derive-at-build grep anyway. Landing tile + nav `/class` hrefs keep working
  (they assert presence only — verified).

### Render lane

- **D29-119 — ClassPage composition (order is the contract) + the header extraction.**
  **Step 0 (required — review blocker): extract the header block of `EntityPage`
  (`entityPage.tsx:106-141` title row/meta row/edition banner, incl. the
  `codex-entity-name-standalone` + sr-only h1 + `popover-hint` classes) into an exported
  `EntityHeader` component used by BOTH `EntityPage` and `ClassPage`** — the popover
  contract depends on it: `Popover` returns an EMPTY panel if a fetched page lacks
  `.popover-hint`, and 1,066 class-feature docs crossref `class/*`. ClassPage's root
  must be an `<article class="codex-entity-page codex-class-page" data-category="class">`
  (the ToC scanner keys on `.codex-entity-page`). Then, in order: (1) **Core Traits
  box** — key ability (`[]` → "Chosen at 1st level"), HP/level, perception, saves,
  attacks (incl. non-empty `other`), defenses, trained skills, spellcaster; ranks as
  Trained/Expert/Master/Legendary/Untrained. (2) **Progression table** rows 1–20:
  features cell = granted features at that level (anchor links to the stream; the 17
  `targetId:null` stubs as plain text) + cadence entries from `featLevels` (lowercase
  "class feat", "skill increase", …; empty level → em-dash). NO extra resource columns
  (recorded trade-off). (3) **Subclass section** (when `subclassOptions` non-empty): one
  pill row PER category (champion/psychic/witch/wizard get two labeled rows),
  multi-toggle; current options by default, legacy husks appear under `?superseded=1`
  with the Legacy edition icon; selected docs render inline below as full prose
  (`renderNodes` on the fetched body); `?subclass=` CSV of targetId slugs via the
  EXISTING `splitCsv`/`joinCsv` codec (review: exported, no reserved-param collision);
  SSR renders URL-selected (D29-117), client toggles fetch via `memoizedEntity`.
  (4) **Feature stream**: `Level N: Name` headings, each resolved feature's slim body
  inlined via `renderNodes` (embeds resolve through the D29-117 map; depth-1 + cycle
  guards as today). (5) **AoN prose body** under a "Description" heading — full
  `entity.body` minus the ONE duplicate progression table, suppressed by the structural
  predicate: a `table` node whose header row is exactly ["Your Level", "Class
  Features"] (**measured: occurs exactly once in ALL 27 stats-bearing classes — 0 with
  0 or 2+; note the cell text lives under the `content` key**). (6) Attached sidebars
  as today. **Heading-id/anchor mechanism (review-corrected):** ONE
  `createHeadingIdAssigner` per page; ClassPage pre-assigns the section + stream heading
  ids IN RENDER ORDER (Core Traits, Progression, Subclasses, each `Level N: Name`,
  Description) from the SAME assigner that then threads through every `renderNodes`
  call (feature bodies, subclass bodies, description) — table anchor hrefs use the
  pre-assigned ids; the assigner's dedup suffixes make body-heading collisions
  impossible by construction. **ToC (review-corrected): `TableOfContents` is a passive
  one-shot post-mount DOM scan of `h2..h6[id]` under `.codex-entity-page` — it takes NO
  props.** Sections must therefore be real `h2[id]` elements. SSR-selected subclass
  headings appear; **headings added by client-side pill toggles do NOT (one-shot scan) —
  ACCEPTED, recorded** (the section itself is always in the ToC).
- **D29-120 — hydration + goldens discipline.** All new components SSR-clean; the
  `nodes.tsx` nesting guards apply verbatim (inlined bodies render at block level,
  never inside `<p>`). **Goldens: the header extraction (D29-119 step 0) touches
  `EntityPage` — the `class/investigator@legacy` golden (and possibly all 7) may
  legitimately change shape; regen via `scripts/regen-goldens.ts` + hand-review every
  diff + record (the draft's "expected byte-identical" claim is WITHDRAWN; byte-identity
  is the ideal outcome of a pure extraction, verify it).** Fixture additions (S1):
  fighter (clean 16/16), cleric (stub-bearing — **the fixture must OMIT
  first-doctrine et al. so they stay Foundry-only-and-dropped, reproducing the null
  case — review subtlety**), witch (two-category pills + absorbed-remaster targets) +
  their granted-feature docs + ≥1 subclass doc each (incl. one legacy husk + its
  remaster target) + `_index` regen via `extract-fixture` (its curated seed list
  already pulls witch — mechanically supported). Hermeticity bar: no test requires the
  real corpus.

## 3. Scope

**In:** everything above + tests/fixtures/goldens + README + deploy.
**Out (explicit):** other categories (ancestry etc. are fast-follows); resurrecting
absorbed subclass categories as standalone docs; `draconic-exemplar` presentation;
recategorizing the 2 miscategorized `class/` docs (P13 candidate — reachable, off the
rail); progression resource columns; search-index changes; live-ToC updates on
client-side pill toggles (accepted); the P11 gate-H flags (separate);
archetype/hellknight/deviant surfacing.

## 4. Slices (serial; one sonnet engineer + one orchestrator-reviewed commit each)

- **S1 — transform (D29-113..116).** Scalar stats branch + `augmentClassStats`
  post-drop pass (grants nulling + subclass union + validations) + schemaVersion 5
  (incl. the two `transform.test.ts` pins + fixture stamp) + report counters + fixture
  additions per D29-120; scratch-outDir transform + delta-set proof + determinism ×2;
  record final pins in §6 (STOP on unexplained delta).
- **S2 — server + routes (D29-117..118).** `resolveClassPageData` + server fn + route
  files (with `loaderDeps` + `head`) + shell/fail-soft dispatch + rail + route-precedence
  test + `routeTree.gen.ts` regen/commit + listing-pin grep. ssrSmoke additions:
  `/class`, `/class/fighter` (bespoke pending S3 — assert shell + data presence),
  `/class/investigator@legacy` (generic-in-shell).
- **S3 — ClassPage render (D29-119..120).** `EntityHeader` extraction FIRST (golden
  regen + hand-review), then Core Traits, progression table, subclass pills +
  on-demand fetch + superseded reveal, feature stream, description suppression, ToC
  wiring, rail styling + mobile fallback; Playwright spot-checks desktop + 390px (DOM
  textContent asserts, never curl|grep — the SSR `<!-- -->` gotcha).
- **S4 — sweep + deploy.** Full codex member suite + both CI lanes local; gates A–G;
  staged deploy per D29-116 (build image FIRST → one in-place transform → NO reindex →
  `just up`; record the window); live verification; build record + memory + RESUME.

## 5. Acceptance gates

- **A (determinism + delta):** scratch transforms ×2 byte-identical; delta set == the 27
  class docs + manifest + report only; totals 44,808 / 88 unchanged; grants 503/17 (the
  exact 7-class stub list); subclass validations pass; per-class option counts recorded
  (spot: barbarian 9+6, sorcerer 18+10, cleric current == its 2 remaster targets);
  class search rows + `_index.json` byte-stable (the no-reindex proof).
- **B (hermetic):** full codex suite green on fixtures alone; both CI lanes local;
  goldens regen'd + every diff hand-reviewed (byte-identity = the ideal, not an
  assumption); route-precedence test; the cleric-stub fixture exercises `targetId:null`;
  pre-existing residue rides (7 ssrSmoke fails on main; virtualization-guard flake).
- **C (structural truth, live vs raw):** /class/fighter progression row-for-row matches
  the raw pack (16 features at pinned levels; skill feats 2–20 evens; Advanced Trained
  in attacks); /class/cleric level 1 shows Deity + Doctrine + First Doctrine (plain
  text, no dead link); /class/psychic shows "Chosen at 1st level";
  /class/investigator shows the DENSE skill cadence; /class/alchemist attacks include
  "Alchemical Bombs"; exactly one "Your Level" table suppressed from every Description.
- **D (subclasses):** /class/barbarian shows 9 instinct pills (15 with `?superseded=1`);
  /class/cleric shows Cloistered Cleric + Warpriest as CURRENT pills (the
  absorbed-remaster case); /class/witch shows TWO labeled rows; /class/sorcerer shows
  18 bloodline pills and NO draconic-exemplar row; /class/fighter shows NO subclass
  section; toggling renders prose inline + updates `?subclass=` + survives reload/SSR
  (loaderDeps proven: an in-app `?subclass=` change re-runs the loader); popover on a
  class crossref FROM a feature page shows a titled panel (the `.popover-hint` proof).
- **E (rail + fail-soft):** rail exactly 27; `?superseded=1` reveals the 20 legacy rows;
  investigator@legacy renders generic INSIDE the shell; /class/draconic-connections
  reachable-but-unlisted; magus/summoner bespoke with edition pill; table anchors
  scroll; exactly one h1; ToC lists sections + Level-N features.
- **F (weights + mobile):** /class/summoner (heaviest) decoded/gz recorded; **budget
  acknowledges the router-dehydration ×2 (P9): wire ≈ 2× loader payload; the slim
  feature projection (D29-117) is the mitigation; acceptance = recorded + proportionate
  (≲ P3's accepted listing weights), no windowing this round**; 390px: no h-scroll,
  rail fallback usable; zero hydration errors on checked routes.
- **G (telemetry + deploy):** `astra.codex` spans on the new routes; zero new ERROR
  post-deploy; deploy window recorded; no reindex dependency introduced.
- **H:** rides the ONE consolidated stakeholder review (now P2–P12).

## 6. Build record

(To be filled per slice.)
