# 0029 codex P10 — statRow collapse + header size chip — NLSpec

**Status:** DRAFT (2026-07-18) — pending adversarial review.
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
- **D29-92 — stripMasthead is statRow-aware; masthead output byte-identical.** 17,471
  candidate rows sit fully inside the masthead-consumed run (10,710 docs; creature
  unaffected; 0 partially consumed). The strip walk, on encountering a statRow while still
  consuming: if EVERY cell qualifies as a masthead pair and the walk would consume all of
  them, consume the cells exactly as it consumes bold-first paragraphs today; otherwise
  stop BEFORE the statRow (whole row stays in body — expected 0 occurrences,
  report-counted). Gate: `mastheadExtra` for the affected population is byte-identical
  pre/post (proven on the fixture corpus + a live pinned set, §5-C).
- **D29-93 — node shape + schema bump.** `{ kind: "statRow", cells: InlineNode[][] }`,
  Zod-pinned `cells.length ≥ 2`, every cell non-empty. Block tier (three unions + export
  block in `src/schema/nodes.ts`; heed the no-broad-`z.ZodType` warning).
  `CORPUS_SCHEMA_VERSION` 3→4 with doc comment (precedent `b174b15`, `238b2f4`). The
  committed fetch-pin `corpus-manifest.json` does NOT change (no re-fetch; shape-only
  re-transform off existing snapshots). Corpus totals must be UNCHANGED: 46,192 entities,
  88 categories, per-category counts identical (reshaping, never adding/dropping).
- **D29-94 — total consumer ripple.** Compile-forced: `collectNodeText` (cells joined with
  a single space, one trailing newline — statblock text stays in Pagefind fragments and
  meta descriptions), `patchNode`/`reconcileNode` (map cells through
  `patchInline`/`reconcileInline`). Hand-fixed silent set: `walkEmbedTargets` recurses
  cells (embed/crossref prefetch); `extract-fixture.ts collectKinds` recurses cells +
  `ALL_NODE_KINDS` gains `statRow` (coverage matrix will auto-select a carrier entity).
  Renderer `nodes.tsx`: `statRow` case renders `<div class="codex-stat-row">` with one
  `<span class="codex-stat-cell">` per cell; CSS = flex row, `flex-wrap: wrap`, medium
  column-gap / small row-gap (mirrors AoN `gap="medium"`; wraps on mobile — no horizontal
  scroll). `BLOCK_KINDS` set updated. aonMarkup.ts file-header mapping doc updated
  (D29-2 verbatim-flatten note amended to reference D29-91).
- **D29-95 — header size chip.** `entityPage.tsx` meta row renders
  `<span class="codex-entity-size">` with the human label from `SIZE_LABELS` (exported
  from `src/domain/browse/facetDefs.ts` — reuse, never a third map) whenever
  `facets.size` is present (creature/hazard/vehicle/ancestry — 7,574 entities; absent
  facet → no element, never an empty span). Position: immediately BEFORE the rarity span
  (AoN trait-strip order reads Rare · Large · traits; ours reads pills → edition →
  size → rarity → citation — size and rarity adjacent). Styled as a plain chip like
  `codex-rarity` (size is a facet, not a trait — never a linked TraitPill). The browse
  split-view drawer inherits via `EntityRenderPane` (verify, no extra work).
- **D29-96 — regen surface.** Fixture regen (`extract-fixture`) — expected shape changes:
  `fixtures/entities/creature/{adamantine-dragon-adult,grick,grick-2}.json`,
  `spell/{heal,heal@legacy,magic-missile,force-barrage}.json`, `source/core-rulebook.json`
  (+ whatever entity the coverage matrix selects as the statRow carrier). P9's
  `ritual/virt-001..090` fixture rows MUST survive regen (interaction-guard dependency).
  Unit fixture `tests/fixtures/aon/list-continuation-sup.json` parse-shape assertions
  update; `column-heavy.json` + `rules-section.json` are load-bearing NEGATIVE fixtures —
  their parses must be byte-identical (assert explicitly in S1). Goldens: regen all 7;
  expected diffs ONLY in `creature-dragon.html` (stat lines) + `spell-heal.html`
  (masthead-adjacent rows) + the two creature goldens' size chips;
  `creature-dragon-spellcaster.html` diff = size chip only (Foundry body, no AoN rows) —
  any OTHER golden diff is a stop-and-look.
- **D29-97 — deploy + live verification.** Host: `pnpm --filter @astra/codex transform`
  (no fetch) → determinism (2 independent runs, byte-compare) → `just codex-search-index`
  (rm-rf'd outDir, host-only ~3.8 GB RSS) → `just up` (rebuild + restart `astra-codex`) —
  container restart is mandatory (corpusFs caches per-process). Live gates in §5.

## 3. Scope

**In:** the two changes above + their test/fixture/golden/search-index/deploy ripple.
**Out (explicit):** upstream-data overrides (glyph/bold/typo); `column`/`center`
preservation; any listing/browse change (listing Size column already exists); Foundry-HTML
bodies (no row concept); the backrefs round; masthead RENDERING changes (output must be
byte-identical).

## 4. Slices

- **S1 — ingest + schema + corpus (engineer 1).** nodes.ts kind + bump; aonMarkup.ts
  collapse (tag-aware flag) + doc-header amendment; stripMasthead statRow-awareness;
  patchNode/reconcileNode/collectNodeText/walkEmbedTargets/collectKinds;
  extract-fixture + fixture regen (virt-* preserved; negative fixtures asserted);
  aonMarkup unit-test updates + new candidacy tests (nested-wrapper row does NOT
  collapse; single-cell does NOT; trailing-space trim; masthead unwrap byte-equality on
  fixture docs); transform on the real corpus + record report counters + totals-unchanged
  proof; determinism 2×. NO renderer work (statRow renders as ErrorChip until S2 — do not
  regen goldens in S1; totality on the regenerated fixture will fail → S1 runs the test
  suite EXCLUDING goldens/totality and records that, or lands fixture regen at the end of
  S2 — engineer's call, but the two slices land as separate commits with S2 immediately
  following, CI-green only at S2. If a one-commit-green bar is preferred, fold S1+S2 into
  one commit — record the choice.)
- **S2 — renderer + size chip + goldens + sweep + deploy (engineer 2, after S1).**
  nodes.tsx statRow case + CSS; entityPage size chip + SIZE_LABELS export + tests
  (size-bearing categories render the label; absent facet renders nothing; drawer
  inherits); goldens regen + hand-check against D29-96's expected-diff list; full member
  test suite + both CI lanes local; search-index rebuild; deploy per D29-97; live gates
  §5; spec build record + memory + RESUME updates.

## 5. Acceptance gates

- **A (determinism):** 2 independent transforms byte-identical; corpus totals exactly
  unchanged (46,192 / 88 / per-category counts vs the pre-change manifest).
- **B (hermetic):** full codex member suite green (totality across 88 categories incl.
  the new kind; goldens byte-exact post-regen; negative fixtures byte-identical);
  both CI lanes reproduced locally; P9 interaction + row-height guards still pass.
- **C (masthead invariant):** `mastheadExtra` byte-identical pre/post for the fixture
  corpus (programmatic compare) AND live spot-set: `spell/heal`, one equipment page from
  the census masthead population, one item-bonus page. Deity/rules/class negative:
  `deity/…` + `rules/…` + `class/…` page HTML byte-identical pre/post except (for pages
  with `facets.size`) the size chip. (Capture pre-change HTML at HEAD before S1 merges.)
- **D (the point):** live `/creature/aso-berang` renders `Str +7 Dex +5 Con +5 Int +3
  Wis +7 Cha +5` as ONE wrapping line and `AC 32 Fort +25 Ref +25 Will +27` as one line
  ("HP 260" stays its own line — single-cell); header shows "Large"; screenshot delivered.
  Risk case `creature/shoony-tiller` (324-char cell) eyeballed — readable, no layout
  break. Mobile viewport (390px): stat rows wrap, no horizontal scroll.
- **E (search):** index rebuilt; a statblock-text query (e.g. "spectral flame aso") still
  hits `/creature/aso-berang`; excerpt renders sanely.
- **F (size chip breadth):** live spot: one hazard, one vehicle, one ancestry render their
  size; one spell renders NO size element (absent facet).
- **G (telemetry):** no new services/spans required (render-only); confirm zero new ERROR
  logs for `astra.codex` post-deploy in SigNoz.

## 6. Build record

(To be filled per slice — commits, gate evidence, report counters, deviations.)
