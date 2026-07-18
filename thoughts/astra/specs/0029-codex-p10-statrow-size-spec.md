# 0029 codex P10 — statRow collapse + header size chip — NLSpec

**Status:** FINAL (2026-07-18) — adversarially reviewed ×2 (independent lenses: mechanism;
product/runtime). 6 blockers + 8 minors/nits ALL folded below: the trim-vs-masthead-byte-identity
contradiction (155 pairs / 151 real docs measured, incl. 2 committed fixtures), the expected-diff
lists re-derived masthead-aware (spell-heal golden is byte-identical, NOT changing; 6 omitted
fixture entities added), the virt-* fixture restore procedure (regen rm-rf's them; no generator
exists), the `codex-stat-row` class-name collision with the structured statblock, the live-serving
deploy window (corpus + search dirs are live `:ro` bind mounts — stage first, build image BEFORE
touching them), and the ancestry/hazard size-chip exclusion (ancestry size is a player choice —
a bare "Medium" chip would contradict the page's own body text; 81% of hazard sizes are
Foundry default-fill noise).
**Scope doc:** `thoughts/shared/research/2026-07-18-codex-0029-p10-statrow-size-thoughts.md`
(REAL-parser census + surface scout; all pins below are measured, not estimated).
**Provenance:** gate-H stakeholder redirect on `/creature/aso-berang` — "fix 1 and 2"
(stat-line sprawl; size missing from the page). Upstream-data oddities (Watch Over Evil
glyph/bold, "Enimty" typo) are explicitly OUT — faithful-to-source stands.

## 1. Problem

AoN statblock stat lines arrive wrapped in `<row gap="medium">` groups of bold-label
paragraphs. Ingest flattens `<row>`/`<column>`/`<center>` to sequential blocks (D29-2), so
`Str +7 … Cha +5` renders as six stacked one-word paragraphs on every AoN-body creature
(4,714 docs, 100% of creatures — plus 16 more categories). Separately, an entity's size
(`facets.size`) renders nowhere on its page.

## 2. Decisions

- **D29-91 — statRow at ingest, tag-aware candidacy.** A `<row>` collapses to a new block
  node `statRow` iff, decided DURING parse: (a) no wrapper tag (`row`/`column`/`center`)
  opened anywhere inside the row's own scope (the census trap: 14,869 all-paragraph-
  post-flatten rows — deity/class/ancestry page layouts — must NOT collapse); (b) every
  parsed child is a `paragraph`; (c) ≥ 2 children. Single-cell candidates (26,819) keep
  today's paragraph output (identical render, report-counted). Empty rows keep flattening
  to nothing. `column`/`center` keep flattening unconditionally. Cell inline runs are
  whitespace-trimmed at cell boundaries only (census: trailing "AC 32 "). Nested rows: a
  candidate by construction contains no wrapper, so collapse is bottom-up-safe; an outer
  row containing a statRow child fails (a) and stays on the flatten path.
  Expected population: **48,208 candidates − 26,819 single-cell = 21,389 statRows** across
  ≤ 18,514 docs / 17 categories (S1 records the exact transform-reported numbers).
  Implementation notes (review-verified): the candidacy flag is a per-row-invocation counter
  sampled around the recursive `parseSequence` call (any wrapper open at any depth inside
  sets it — the census's instrumented-recorder pattern is working prior art). Trim semantics:
  drop boundary text nodes that trim to empty, then `trimStart`/`trimEnd` the surviving edge
  text nodes; a cell can never trim to fully empty (`inlineIsMeaningful` filters all-whitespace
  paragraphs upstream), so the Zod non-empty pin is satisfiable. Measured cell composition:
  multi-cell candidate cells corpus-wide contain ONLY `text` (148,862) + `crossref` (1,967)
  inlines — no embeds/glyphs today.
- **D29-92 — stripMasthead is statRow-aware; masthead output byte-identical MODULO
  cell-boundary trimming.** 17,471 candidate rows sit fully inside the masthead-consumed run
  (10,710 docs; creature unaffected; 0 partially consumed). The strip walk, on encountering
  a statRow while still consuming: if EVERY cell qualifies as a masthead pair and the walk
  would consume all of them, consume the cells exactly as it consumes bold-first paragraphs
  today; otherwise stop BEFORE the statRow (whole row stays in body — expected 0
  occurrences, report-counted). **Review-measured amendment:** today's masthead pair trims
  the label but NOT the value run (`aonMarkup.ts:1288`), and **155 cells across 151 docs**
  (ritual 99, shield 28, spell 21, equipment 2, siege-weapon 1) carry trailing-whitespace
  value tails that land in `mastheadExtra` — D29-91's trim therefore changes those pairs'
  bytes. Accepted: render-invisible (HTML collapses whitespace). Gate C is
  byte-identical-modulo-trim; the trimmed-pair population is report-counted (expected pin:
  155 pairs / 151 docs). Two committed fixtures are in the affected set —
  `ritual/shadow-double.json` + `ritual/simulacrum.json` — include shadow-double in the
  fixture-level masthead compare so the relaxed gate is exercised non-vacuously.
- **D29-93 — node shape + schema bump.** `{ kind: "statRow", cells: InlineNode[][] }`,
  Zod-pinned `cells.length ≥ 2`, every cell non-empty. Block tier (three unions + export
  block in `src/schema/nodes.ts`; heed the no-broad-`z.ZodType` warning).
  `CORPUS_SCHEMA_VERSION` 3→4 with doc comment (precedent `b174b15`, `238b2f4`). The
  committed fetch-pin `corpus-manifest.json` does NOT change (no re-fetch; shape-only
  re-transform off existing snapshots). Corpus totals must be UNCHANGED: 46,192 entities,
  88 categories, per-category counts identical (reshaping, never adding/dropping).
- **D29-94 — total consumer ripple.** Compile-forced: `collectNodeText` (cells joined with
  a single space, NO trailing newline — no existing case emits newlines and both callers
  whitespace-collapse; Pagefind text is provably byte-stable since `collectText` joins
  top-level nodes with `" "` and collapses `\s+`), `patchNode`/`reconcileNode` (map cells
  through `patchInline`/`reconcileInline`). Hand-fixed silent set: `walkEmbedTargets`
  recurses cells (embed/crossref prefetch); `extract-fixture.ts collectKinds` recurses
  cells + `ALL_NODE_KINDS` gains `statRow` (coverage matrix will auto-select a carrier
  entity). Meta descriptions: `firstParagraphSummary` stays paragraph-first (prose beats
  "Price 250 gp" — an accepted improvement for the non-masthead categories whose lead
  block collapses, e.g. vehicle/siege-weapon/warfare-army; report-count affected docs) but
  gains a fallback: if NO paragraph exists in the body, use the first statRow's joined
  text (never emit an empty description where one existed).
  Renderer `nodes.tsx`: **class names `codex-stat-line` / `codex-stat-line-cell` — NOT
  `codex-stat-row`, which is ALREADY TAKEN** by the structured statblock's Row component
  (`statblock.tsx:24`, styled at `globals.css:609`, live on every Foundry-only
  creature/hazard page — a collision would restyle pages this round doesn't touch).
  Mirror the existing `.codex-entity-meta-row` flex idiom (`globals.css:509`): flex row,
  `flex-wrap: wrap`, medium column-gap / small row-gap (AoN `gap="medium"`; wraps on
  mobile — no horizontal scroll). Cells get `white-space: pre-line` (ingest preserves
  `<br/>` as literal `\n`; paragraph text relies on the same rule) and the row gets the
  same block margin paragraphs get (the `--density-content-margin` rule is `p`-scoped —
  give the row its own equivalent). Guard the div-in-span hydration class: any cell whose
  inlines would block-render (per `embedRendersAsBlock`, the P3 paragraph guard) renders
  that cell as a `<div>` — 0 occurrences today (cells are text+crossref only), the guard
  is future-proofing against re-snapshot drift. Cell `<strong>` renders as plain bold
  (matches today's paragraphs; the amber label grammar stays statblock-only — recorded,
  accepted). `BLOCK_KINDS` set updated; kind-count comments (nodes.ts "18 kinds",
  extract-fixture "18-member") → 19/8-block. aonMarkup.ts file-header mapping doc updated
  (D29-2 verbatim-flatten note amended to reference D29-91). Schema placement: the new
  statRow schema must sit after the eager `InlineNodeSchema` (same ordering constraint as
  `LocalizedBoilerplateNodeSchema`, nodes.ts:291-296).
- **D29-95 — header size chip, CREATURE + VEHICLE ONLY.** `entityPage.tsx` meta row renders
  `<span class="codex-entity-size">` with the human label from `SIZE_LABELS` (exported
  from `src/domain/browse/facetDefs.ts` — reuse, never a third map; import direction
  verified clean, no cycle) when `facets.size` is present AND the category is in the
  inclusion list `{creature, vehicle}` (6,343 entities). **Review-driven exclusions:**
  ancestry OUT — `facets.size` is Foundry's single default token size but ancestry size is
  a player CHOICE (measured: automaton/fleshwarp facet `med` vs their own body text
  "Medium or Small"; awakened-animal `med` vs "Tiny or Small or Medium or Large") — a bare
  chip would contradict the page; a body-derived multi-size label is a separate future
  decision. Hazard OUT — 81% are `med` (the default-fill signature) and AoN hazard
  statblocks display no size line; a "Medium" chip on a haunt reads as fabricated. Absent
  facet or excluded category → no element, never an empty span. Position: immediately
  BEFORE the rarity span (size · rarity adjacent, echoing AoN's Rare · Large · traits
  strip). Styled as a plain chip like `codex-rarity` (size is a facet, not a trait —
  never a linked TraitPill). The browse split-view drawer inherits via `EntityRenderPane`
  (verify, no extra work).
- **D29-96 — regen surface (lists re-derived masthead-aware by review — the draft's lists
  were candidacy-proxy-derived, wrong in both directions).** Fixture regen
  (`extract-fixture`) — measured expected shape changes:
  `fixtures/entities/creature/{adamantine-dragon-adult,grick,grick-2,ixamè}.json`,
  `animal-companion/ape.json`, `kingdom-structure/rubble.json`,
  `siege-weapon/door-ram.json`, `vehicle/armored-sleigh.json`,
  `warfare-army/infantry-army.json`, plus `ritual/{shadow-double,simulacrum}.json`
  mastheadExtra trim deltas (D29-92), plus whatever entity the coverage matrix selects as
  the statRow carrier. **NOT changing (fully masthead-consumed or single-cell —
  the draft wrongly pinned these):** `spell/{heal,heal@legacy,magic-missile,
  force-barrage}.json`, `source/core-rulebook.json`, `weapon/chakri`.
  **virt-* restore procedure (the regen tool `rm -rf`s `fixtures/entities/**` and NO
  generator for the 90 hand-committed P9 rows exists):** post-regen, restore
  `ritual/virt-001..090.json` from git AND re-splice their 90 IndexRows into the
  regenerated `ritual/_index.json` + set ritual's count in the fixture manifest
  accordingly (a bare `git checkout` of `_index.json`/`manifest.json` is WRONG — those
  files legitimately change: reshaped ritual entities, manifest schemaVersion 4). Then
  prove `virtualizationInteractionGuard` still passes.
  Unit fixture `tests/fixtures/aon/list-continuation-sup.json` parse-shape assertions
  update; `column-heavy.json` + `rules-section.json` are load-bearing NEGATIVE fixtures —
  their parses must be byte-identical (assert explicitly in S1). Known count-pin ripple:
  `transform.test.ts:344` `schemaVersion === 3` → 4; committed
  `fixtures/entities/manifest.json` stamps 3 → 4. Goldens: regen all 7; expected diffs
  ONLY `creature-dragon.html` (stat rows + size chip) and
  `creature-dragon-spellcaster.html` (size chip ONLY — Foundry body, no AoN rows); the
  other 5 goldens INCLUDING `spell-heal.html` must be byte-identical — any other golden
  diff is a stop-and-look.
- **D29-97 — deploy + live verification, STAGED (review-resequenced).** `data/corpus` AND
  `data/search` are identical-path `:ro` bind mounts into the RUNNING container
  (docker-compose.yml:299-300); `emit.ts` wipes its outDir and `codex-search-index`
  rm-rf's `data/search` — the draft's sequence would have served statRow ErrorChips on
  ~18.5k live pages (old renderer, new corpus) plus a missing search bundle for the whole
  reindex + image build. Order is therefore: (a) S1's real-corpus transform + determinism
  (2 independent runs, byte-compare) run into SCRATCH outDirs — the live `data/corpus` is
  NOT touched before S2's deploy moment; (b) at deploy: `docker compose build` the new
  image FIRST; (c) then one in-place transform (single wipe) → `just codex-search-index`
  (host-only ~3.8 GB RSS) → immediate `just up` (recreate `astra-codex` — restart is
  mandatory anyway, corpusFs caches categories per-process). Accepted residual window:
  the transform+reindex minutes between (c)'s wipe and the container recreate — old
  renderer over new corpus degrades to visible-but-non-crashing ErrorChips (renderer
  totality) and search 404s fail soft (P3's per-request fail-soft). Record the measured
  window in the build record. Live gates in §5.

## 3. Scope

**In:** the two changes above + their test/fixture/golden/search-index/deploy ripple.
**Out (explicit):** upstream-data overrides (glyph/bold/typo); `column`/`center`
preservation; any listing/browse change (listing Size column already exists); Foundry-HTML
bodies (no row concept); the backrefs round; masthead RENDERING changes (output
byte-identical modulo the D29-92 trim); ancestry/hazard size chips (D29-95 exclusions —
ancestry multi-size labeling is a possible future decision).

## 4. Slices

- **S1 — ingest + schema + consumers (engineer 1; CI-GREEN standalone — review-verified:
  totality iterates the COMMITTED fixtures, which carry no statRow until S2's regen; the
  corpus reader accepts any positive schemaVersion; goldens untouched).** nodes.ts kind +
  bump + count-comment updates; aonMarkup.ts collapse (tag-aware flag) + doc-header
  amendment; stripMasthead statRow-awareness (D29-92 semantics);
  patchNode/reconcileNode/collectNodeText(+firstParagraphSummary fallback)/
  walkEmbedTargets/collectKinds + `ALL_NODE_KINDS`; `transform.test.ts` schemaVersion pin
  → 4; aonMarkup unit-test updates + new candidacy tests (nested-wrapper row does NOT
  collapse; single-cell does NOT; boundary-trim semantics; masthead unwrap equality
  modulo-trim on fixture docs incl. shadow-double; `column-heavy.json` +
  `rules-section.json` parses byte-identical). Real-corpus transform + determinism 2× run
  into SCRATCH outDirs only (D29-97a — the live `data/corpus` is NOT rewritten in S1);
  record report counters + totals-unchanged proof from scratch. NO fixture regen, NO
  renderer, NO goldens in S1.
- **S2 — renderer + size chip + fixture/golden regen + sweep + deploy (engineer 2, after
  S1; CI-green).** nodes.tsx statRow case (`codex-stat-line` classes, block-cell guard) +
  CSS; entityPage size chip + SIZE_LABELS export + tests (creature/vehicle render the
  label; ancestry/hazard/absent-facet render NOTHING; drawer inherits); fixture regen +
  the D29-96 virt-* restore procedure + interaction-guard proof; goldens regen +
  hand-check against D29-96's measured expected-diff list; full member suite + both CI
  lanes local; deploy per D29-97 (build image first, then wipe→reindex→`just up`); live
  gates §5; spec build record + memory + RESUME updates.

## 5. Acceptance gates

- **A (determinism):** 2 independent transforms byte-identical; corpus totals exactly
  unchanged (46,192 / 88 / per-category counts vs the pre-change manifest).
- **B (hermetic):** full codex member suite green (totality across 88 categories incl.
  the new kind; goldens byte-exact post-regen; negative fixtures byte-identical);
  both CI lanes reproduced locally; P9 interaction + row-height guards still pass.
- **C (masthead invariant):** `mastheadExtra` byte-identical-MODULO-cell-boundary-trim
  pre/post, proven programmatically over the fixture corpus (incl. `ritual/shadow-double`,
  a measured trim-affected doc) with the trimmed-pair counter ≈ 155/151 recorded; live
  spot-set: `spell/heal`, one equipment page from the census masthead population, one
  item-bonus page. Negative set (deity/rules/class — 0 candidates in census): compare the
  `<article class="codex-entity-page">…</article>` REGION only (raw full-page byte-equality
  is unhittable — content-hashed asset URLs change with any client-bundle rebuild; use
  curl + `grep -a` extraction per the standing SSR gotcha, or offline
  renderToStaticMarkup at old-vs-new HEAD), PLUS corpus-JSON equality for those
  categories out of the S1 scratch transform. (Capture pre-change region HTML at HEAD
  before S2 deploys.)
- **D (the point):** live `/creature/aso-berang` renders `Str +7 Dex +5 Con +5 Int +3
  Wis +7 Cha +5` as ONE wrapping line and `AC 32 Fort +25 Ref +25 Will +27` as one line
  ("HP 260" stays its own line — single-cell); header shows "Large"; screenshot delivered.
  Risk case `creature/shoony-tiller` (324-char cell) eyeballed — readable, no layout
  break. Mobile viewport (390px): stat rows wrap, no horizontal scroll.
- **E (search):** index rebuilt; a statblock-text query (e.g. "spectral flame aso") still
  hits `/creature/aso-berang`; excerpt renders sanely.
- **F (size chip breadth):** live spot: one vehicle (`vehicle/adaptable-paddleboat`,
  "Large") renders its size; one hazard, one ancestry, and one spell render NO size
  element (exclusion list + absent facet both proven).
- **G (telemetry):** no new services/spans required (render-only); confirm zero new ERROR
  logs for `astra.codex` post-deploy in SigNoz.

## 6. Build record

(To be filled per slice — commits, gate evidence, report counters, deviations.)
