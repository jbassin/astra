# codex 0029 P8 — density/table restyle + UX round (scope, 2026-07-16)

**Provenance:** the 5e.tools vs codex UX comparison
(`2026-07-16-codex-vs-5etools-spell-browse-ux-thoughts.md`) — stakeholder reviewed the analysis
same day and directed a round: adopt 5e.tools' spacing scheme, per-category table columns
everywhere, plus the comparison's ranked recommendations. Gate H continues in parallel; this is
an early-feedback round like P7.

## 1. Items in scope

- **P8-1 Density restyle (site-wide) + table listings.** All four decisions stakeholder-resolved
  2026-07-16 (AskUserQuestion, previews shown):
  - **R1 = FULL TABLE REGISTER** — single-line rows at ~22–26px pitch, smaller condensed type
    for row data, zero inter-row gaps; parchment palette kept; listings become true data tables
    (chosen over "compact book" and "user-toggleable").
  - **R2 = ALIGNED COLUMNS + SORTABLE HEADERS** — real per-category columns; click-to-sort
    column headers REPLACE the Sort `<select>`; the ~73 facet-less categories fall back to
    Name/Lvl/Rarity/Source.
  - **R3 = TRAITS DROPPED FROM ROWS** — traits stay in the filter drawer + entity page/split
    pane only.
  - **R4 = SITE-WIDE** — the density pass also covers detail-pane padding (48px → ~20–24px),
    paragraph rhythm, rules tree, sources, search results. Not listings-only.
- **P8-2 Nav carets.** (a) De-chrome `.codex-nav-caret` — it renders UA default button chrome
  (measured live: `border: 2px outset black`, `background: rgb(239,239,239)`,
  `appearance: auto`; the class only sets padding/font-size). (b) Add the caret affordance to
  ALL dropdown nav items (today Rules' split control is the only visible caret; the other seven
  dropdowns have zero affordance). The split-control semantics of Rules (link + separate
  disclosure button, D29-47/M4) stay.
- **P8-3 Exact-name search boost.** `fireball` on `/search` ranks the spell #10 behind 5 wands
  + 4 runes (measured live post-P7); in the omnibar it's below the 8-item fold. Pagefind title
  weighting is a proven dead end (D29-34 tried+reverted). Fix = client-side post-rank at the
  shared seam: hits whose name exact/prefix-matches the query pin to a group above the category
  groups, in BOTH omnibar and /search. Kills the documented "heal" limitation too.
- **P8-4 Keyboard nav.** `j`/`k` row selection + `Enter` (open full page) in the split-view
  listing; a one-line hint in the listing header (5e.tools masthead-hint pattern: "Ctrl+K to
  search · j/k to browse").
- *(absorbed)* Level sort — superseded by R2's sortable column headers (a `level` SortMode with
  the missing-level-LAST rule already exists in `filterEngine.ts`).

## 2. Out of scope (deliberate)

- **Backrefs ("granted by")** — needs its own mini-scope (which crossref kinds count as grants
  vs mention); transform + corpus regen territory. Next round.
- 5e.tools features assessed and rejected in the comparison doc §10: filter console modal,
  source-pill bar, tri-state exclude filters, CSV/Book View, dice rolling.
- Any corpus/transform change. **P8 is render/client-only — deploy needs `just up` only, no
  `codex-refresh`.**

## 3. Verified against the repo/corpus (2026-07-16, post-P7 corpus 46,192)

- **IndexRow** (`schema/entity.ts:472`) carries `id/name/level/traits/rarity/source/edition/
  superseded` + per-category trimmed `facets` — everything columns need is ALREADY in
  `_index.json`; no emit change.
- **FACET_KEYS** (`schema/facetKeys.ts`): 15/88 categories carry facet keys. Measured value
  shapes for column design (real `_index.json` sampling):
  - spell (2,461): `castTime` mixed forms — numeric `"1"/"2"/"3"`, `"reaction"`, `"free"`,
    `"1 or 2"`, `"1 to 3"`, `"1 minute"`, `"1 day"`; `range` has `""` EMPTIES + long forms
    (`"1,000 feet"`, `"1-mile burst"`) → column renderer needs glyph mapping (1/2/3/reaction/
    free → action glyphs, the `actionGlyph.tsx` component exists) + ft-abbreviation + em-dash
    for empty. `traditions` is an ARRAY — not a column (stays a facet).
  - creature (7,296): `size` already abbreviated (`tiny/sm/med/lg/huge/grg`), `hp`/`ac`
    numeric strings.
  - equipment (7,295): `price` strings (`"1 cp"`, `"100 gp"`, oddballs like `"1 cp per 10"`),
    `bulk` numeric-ish strings.
  - feat (8,484): `actionCost` enum (`1/2/3/free/passive/reaction`), `itemCategory` slugs
    (`ancestry/class/general/skill/...`) → humanize.
- **Sort engine**: `SortMode = "name" | "level"` + `sortRows` with the adversarial M7/M8
  missing-level-LAST + name tie-break rule — extend, don't replace.
- **Search seam**: `pagefindClient.ts` owns `SearchDisplayResult` + `CategoryGroup` — the one
  shared shaping point for Omnibar + SearchPage; the boost lands there.
- **Nav**: `HeaderNav.tsx` — `RulesNavItem` split control (line 203), plain dropdown items via
  `NavPanel`/`useDropdown`; adding a caret `<span>` to the trigger buttons is local. Ctrl+K
  singleton + Escape handling already proven (P4.5 S2).
- **Goldens**: the 7 committed goldens render ENTITY PAGES (`regen-goldens.ts` →
  `EntityPage`) — listing-row changes don't touch them; pane-padding/paragraph changes are
  CSS-only (goldens are markup). Expected golden delta: ZERO unless EntityPage markup changes.
- **Perf**: listings already render full DOM behind `content-visibility` +
  `contain-intrinsic-size` (P4.5: 640px cards). Single-line rows shrink DOM per row;
  `contain-intrinsic-size` must be re-pinned to the new row height or scroll anchoring breaks
  (the P4.5 scroll-jump lesson). Largest listing = feat 8,484 rows.
- **Edition icons** (this session, `e0267e0`): already square glyphs sized in `em` — they drop
  into a table cell unchanged.

## 4. Design pins for the spec

- **Column sets** (facet-backed, from FACET_KEYS + measured shapes):
  - spell: Name · Lvl · Cast (glyphs) · Range (abbrev) · Source · edition-icon
  - creature: Name · Lvl · Size · HP · AC · Source · icon
  - hazard: Name · Lvl · Size · HP · AC · Source · icon (hazard = no perception, verified P3)
  - equipment/weapon/armor/shield: Name · Lvl · Price · Bulk · Source · icon
  - feat + creature-ability: Name · Lvl · Actions (glyphs) · Type (humanized itemCategory) ·
    Source · icon
  - vehicle: Name · Lvl · Size · HP · AC · Source · icon
  - fallback (all other categories): Name · Lvl · Rarity · Source · icon
- **Mobile (≤ ~640px): columns collapse to Name · Lvl · Source.** The comparison's clearest
  finding was 5e.tools' 7-column mobile squish being its worst surface — codex must keep its
  mobile win. No horizontal scroll.
- Sortable headers: Name + Lvl everywhere; numeric facet columns (HP/AC/Price/Bulk) sortable
  where present; missing-value-LAST inherited from the existing rule. Sort state stays in the
  URL (the existing `?sort=` param model).
- Alphabet jump strip + letter section headers: **drop under the table register** (a sorted
  table with 26 interleaved section headers isn't a table; the strip's job is done by column
  sort + the name quick-filter). Row count line stays.
- Split-view/row-click mechanics (P4.5 loaders, `?entry=`), facet drawer, active pills, URL
  codec: all UNTOUCHED — this round changes row/page GEOMETRY and adds sort/keyboard/search
  affordances only.

## 5. Risks / open watch-items

- Density is the stakeholder's own call against his own P4.5 parchment brief — the two
  registers (sourcebook voice vs data table) now share a page; S-slice screenshots go to him
  early rather than at gate only.
- `castTime` long-tail strings (`"1 minute"`, `"until full tribute is paid"`?) must truncate
  gracefully in a fixed column.
- j/k must not fight the quick-filter input focus (only active when no input focused).
- The hint line + column headers add fixed chrome above the rows — keep lead-in ≤ current
  (comparison measured codex lead-in 1.75× 5e.tools').

**Next:** spec `thoughts/astra/specs/0029-codex-p8-density-tables-spec.md` (D29-77..82),
adversarial review ×2, build in 4 slices (S1 columns+sort+BrowseListing · S2 site-wide density
CSS + secondary surfaces + nav carets · S3 search boost + keyboard + hint · S4 sweep/deploy).
