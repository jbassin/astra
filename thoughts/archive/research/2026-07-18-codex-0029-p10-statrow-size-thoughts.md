# codex 0029 P10 — statblock row collapse + header size — scoping (2026-07-18)

**Provenance.** Mid-gate-H the stakeholder pointed at `https://codex.iridi.cc/creature/aso-berang`.
Triage attributed four oddities: (1) stat-line sprawl — `Str +7 … Cha +5` and `AC/Fort/Ref/Will/HP`
render as ~11 stacked one-word paragraphs because ingest flattens AoN `<row>` wrappers
(`aonMarkup.ts:788`, D29-2 "layout, not content"); (2) the creature's size ("Large") appears nowhere
on the page — corpus `traits` are Foundry-derived (`spirit` only), size lives unrendered in
`facets.size`; (3) Watch Over Evil carries a Single-Action glyph + malformed bold spans — verbatim
upstream AoN data, left as-is; (4) "Enimty of Witches" — upstream typo, left as-is. Stakeholder
directed: **fix 1 and 2** (items 3/4 stay faithful-to-source; an override registry is a separate
future decision).

Two recon agents ran before any pin (the P6 proxy-pin lesson): a row census through the REAL parser
(instrumented byte-copy of `aonMarkup.ts`, all 43,684 AoN docs of snapshot 2026-07-17, 0 parse
failures) and a render/schema surface scout. Scratch artifacts:
`…/scratchpad/rowcensus/{aonMarkupInstr.ts,census.ts,masthead.ts,fixtures.ts,full-report.txt}`.

## R1 — row census (REAL-parser numbers, not proxies)

- `<row>` events 87,150 · `<column>` 100,287 · `<center>` 50 (all all-paragraph, none contain
  candidates — centers stay flattened).
- **Strict collapse candidates** (all children paragraphs AND no wrapper tag opened inside the
  row's own scope): **48,208** across **18,514 docs / 17 categories**. Creature 4,714 (100%),
  equipment 8,183, spell 2,439, weapon 614 (100%), ritual 201 (100%), …
- **⭐ The definitional trap:** 14,869 further rows are all-paragraph only *post-flatten* — their
  paragraphs were spliced out of nested `<column>`s (every deity page = 717, rules 3,184,
  equipment 5,498, creature outer frames 4,544, …). A post-hoc `children.every(paragraph)` check
  would collapse whole deity/class/ancestry pages into one giant row. **Candidacy must be decided
  tag-aware during parse** (flag set when any wrapper opens inside the row's scope).
- Cells per candidate: 1→26,819 · 2→9,934 · 3→1,728 · 4→3,930 · 5→969 · 6→4,828. Single-cell rows
  ("Bulk L", "HP 260") render identically either way.
- Cell text lengths (101,404 cells): ≤40 chars 99,578; **>200 chars: 10 rows corpus-wide** (max
  324 — Shoony creatures carry a prose ability inside the saves row; ritual-154 Shadow Double;
  equipment-3989/-3669). Accepted as cells; no length guard needed.
- Nesting: candidates never nest inside each other (by construction); 22,855 empty rows flatten to
  nothing today (keep).
- Cells carry trailing whitespace ("AC 32 ") — builder must trim at cell boundaries.
- Aso Berang (creature-2766): all three statblock rows classify as candidates; its outer page row
  correctly stays flattened.

## R2 — ⭐ the stripMasthead interaction

`join.ts` pipes `parseAonMarkdown` → `stripMasthead`, whose walk consumes leading bold-first
paragraphs into `mastheadExtra` pairs. **17,471 candidate rows (36%) sit fully inside the
masthead-consumed run, across 10,710 docs** (equipment 6,304, spell 2,139, item-bonus 989, … —
creature NOT affected; 0 rows partially consumed). If collapse runs first and the strip is not
statRow-aware, those pairs vanish and 10,710 docs change shape. Resolution → spec D29-92:
stripMasthead unwraps a leading statRow into its cells (byte-identical mastheadExtra), with a
conservative whole-row-or-nothing rule for the (0 measured) partial case.

## R3 — schema/render surface (scout)

- Schema: `src/schema/nodes.ts`, one Zod discriminated union, 18 kinds (7 block + 11 inline).
  Adding a kind = `CORPUS_SCHEMA_VERSION` 3→4 (`src/ingest/emit.ts:180`; precedent v1→2 `b174b15`,
  v2→3 `238b2f4`). Don't confuse the emitted `data/corpus/manifest.json` (schemaVersion 3) with the
  committed fetch-pin `corpus-manifest.json` (schemaVersion 1) — only the former bumps.
- Kind-switching consumers: compile-time-total (tsc forces the case): `text.ts:61 collectNodeText`
  (feeds meta description AND Pagefind body text), `join.ts:1235 patchNode`, `drop.ts:93
  reconcileNode`. **Silently-open (must be fixed by hand):** `nodes.tsx:452 walkEmbedTargets`
  (embed prefetch would skip statRow cells), `extract-fixture.ts:327 collectKinds` (coverage
  matrix). `journals.ts:280 flattenCellText` is Foundry-journal-only — statRow can't occur, safe.
- Renderer: `nodes.tsx:268` switch with ErrorChip default; totality tripwire =
  `totality.test.tsx` over all 88 fixture categories.
- Goldens: **7** byte-exact files (P7 added creature-dragon-spellcaster). Regen via
  `scripts/regen-goldens.ts` (nodeTsResolve hook can't follow `@/*` aliases — standing gotcha).
- Fixture ripple: candidates exist in fixture raw docs for creature-dragon-adamantine, grick ×2,
  heal ×2, magic-missile, force-barrage, core-rulebook → those `fixtures/entities/**` JSONs change
  shape; goldens `creature-dragon.html` + `spell-heal.html` change; `creature-dragon-spellcaster`
  likely NOT (Foundry-derived body). Unit fixture `tests/fixtures/aon/list-continuation-sup.json`
  contains 3 candidates; `column-heavy.json`/`rules-section.json` are nested-only — load-bearing
  NEGATIVE fixtures (must not change). **Fixture regen must preserve P9's `ritual/virt-001..090`
  rows** or the interaction guard fails (`TOTAL_ROWS <= 60` check).
- No test hard-pins entity counts (46,192 is comment-only); `codex-refresh` refuses on a dirty
  tree. A shape-only change needs NO re-fetch: `pnpm --filter @astra/codex transform` off existing
  snapshots, then host-only `just codex-search-index` (rm-rf first; ~3.8 GB RSS).

## R4 — size facet census + header surface (scout)

- `facets.size` values are exactly the Foundry 6-slug set — `med` 4,115 · `lg` 1,502 · `sm` 689 ·
  `grg` 508 · `huge` 495 · `tiny` 265 = 7,574 entities in 4 categories (creature 6,249, hazard
  1,181, vehicle 94, ancestry 50). No outliers.
- Label map exists: `src/domain/browse/facetDefs.ts:147 SIZE_LABELS` ("lg"→"Large") — reuse
  (export), don't write a third (listing columns render "LG" via `columnDefs.tsx:301 renderSize`,
  a deliberate table-density convention; the header wants the human label).
- Header: `entityPage.tsx:53-77` — meta row order: trait pills → edition pill → rarity `span` →
  citation → AoN link. Rarity's plain `span` is the precedent for size (size is a facet, not a
  trait — never a linked TraitPill). `EntityRenderPane` reuses `EntityPage` → the browse drawer
  gets the pill for free. P9 guards (row-height drift, interaction) provably don't touch the
  entity header.
- On an AoN-body creature the structured statblock is D29-72-suppressed (`body.length === 0` gate)
  — the header is the only surface where size can appear for the common case.

## Decisions (all resolved in-session — stakeholder directive was "fix 1 and 2"; the rest are
technical calls mirroring current behavior / AoN, recorded in the spec as D29-91..97)

- R-a: fix shape = **ingest-side** new block kind (render-side can't recover row grouping after
  flatten). → D29-91.
- R-b: single-cell candidate rows stay paragraphs (identical render; 26,819 fewer reshapes). → D29-91.
- R-c: stripMasthead becomes statRow-aware; masthead output byte-identical. → D29-92.
- R-d: size renders as a plain header chip labeled via SIZE_LABELS, all 4 size-bearing categories,
  positioned with rarity (AoN order Rare · Large · traits). → D29-95.
- R-e: items 3/4 from triage (upstream glyph/bold/typo) stay verbatim — no override registry this
  round.

Spec: `thoughts/astra/specs/0029-codex-p10-statrow-size-spec.md`.
