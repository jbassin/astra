# 0029 P8 — density/table restyle + UX round (spec)

**Status:** DRAFT (pending adversarial review)
**Scope doc:** `thoughts/shared/research/2026-07-16-codex-0029-p8-density-thoughts.md` (R1–R4
stakeholder-resolved 2026-07-16; provenance = the 5e.tools UX comparison).
**Change class:** render/client-only. No transform, no corpus regen, no Pagefind reindex.
Deploy = `just up` only.

## 1. Goal

Adopt 5e.tools' spacing scheme site-wide (R1 full table register, R4 site-wide) and convert
every category listing into an aligned, sortable, per-category-columned table (R2, R3 traits
out of rows); fix the nav-caret UA chrome and give every dropdown an affordance; pin
exact-name search matches above category groups; add j/k/Enter keyboard browsing + a hint
line.

## 2. Decisions

### D29-77 — density tokens, site-wide (R1 + R4)

One place: `src/styles/globals.css` gains a `--density-*` token block; surfaces consume
tokens, never magic numbers. Targets (desktop):

- **Listing rows:** single line, **~24px pitch** (row box ≈ 23px + 1px hairline; 0 gap).
  Row data type **13px** condensed (`--font-condensed` stack, matching the statblock
  mechanical voice); row NAME stays the serif link voice at **14px** so rows remain
  codex-flavored (5e.tools' rhythm, not its Arial).
- **Detail pane / entity page:** padding 48px → **24px**; paragraph margins 12px → **6px**;
  `article` line-height 28.8px → **24px** (1.5 at 16px). Entity-page body font 18px → **16px**.
- **Secondary surfaces (same tokens):** search results list, rules tree rows, sources index
  rows, attached-sidebar cards, facet drawer option rows (0.15–0.25rem vertical pad), landing
  tiles UNTOUCHED (marketing surface, not a data surface).
- **Header/masthead:** header vertical padding 20px → **10px** (77px → ~56px); listing title
  block + controls row consolidated to one line each; total lead-in above the first row must
  land **≤ 300px** (measured 440px today, 5e.tools ≈ 250px).
- Mobile keeps the same tokens; the row grammar change is what saves mobile (see D29-78).

### D29-78 — per-category table columns + sortable headers (R2)

New `src/domain/browse/columnDefs.ts` — the single column-model authority:

```
interface ColumnDef {
  key: string;                       // "level" | "castTime" | "hp" | ...
  label: string;                     // "Lvl", "Cast", "HP", ...
  source: "core" | "facet";          // core = IndexRow field, facet = row.facets[key]
  render: (row: IndexRow) => ReactNode; // glyphs/abbrev/em-dash for missing
  sortable: boolean;
  comparator?: "text" | "numeric";   // numeric: parse leading number; missing LAST
  mobile?: boolean;                  // survives the ≤640px collapse
}
columnsFor(category: string): readonly ColumnDef[]
```

- **Column sets** (from the scope doc's measured shapes):
  - spell: Name · Lvl · Cast · Range · Source — Cast renders `1/2/3/reaction/free` as action
    glyphs (`actionGlyph.tsx`), `"1 or 2"/"1 to 3"` as glyph–glyph ranges, time strings
    (`"1 minute"`…) as condensed text truncated w/ `title`; Range abbreviates `feet → ft`,
    `""`/absent → `—`.
  - creature & hazard & vehicle: Name · Lvl · Size · HP · AC · Source (size uppercased
    abbr; hazard/vehicle facet gaps render `—`).
  - equipment/weapon/armor/shield: Name · Lvl · Price · Bulk · Source.
  - feat & creature-ability: Name · Lvl · Actions · Type · Source (Type = humanized
    `itemCategory`).
  - **fallback (every other category):** Name · Lvl · Rarity · Source.
  - Every set ends with the edition icon as a fixed narrow cell (not a labeled column).
- **Missing values:** `—` (em-dash), never blank; sorting puts missing LAST (extends the
  existing M7/M8 rule).
- **Sortable headers replace the Sort `<select>`.** Click cycles asc → desc → (back to
  name-asc default). Name + Lvl sortable everywhere; facet columns sortable when
  `comparator` defined (HP/AC numeric; Price parses to cp; Bulk numeric w/ `L=0.1`;
  Cast/Actions by action-count bucket; Type/Size/Rarity text). Sort state lives in the URL —
  extend the existing `?sort=` param to `name|-name|level|-level|<facetKey>|-<facetKey>`;
  unknown/inapplicable values fall back to `name` silently (forever-decode discipline).
  `SortMode` in `filterEngine.ts` widens accordingly; `sortRows` gains a comparator arg fed
  from columnDefs.
- **Mobile ≤ 640px: only `mobile: true` columns render — Name · Lvl · Source (+ icon).**
  No horizontal scroll, ever.
- **Alphabet jump strip + letter section headers are REMOVED from listings** (a sorted table
  interleaved with 26 headers isn't a table; quick-filter + sort own that job now). The
  count line ("N of M shown") stays.
- Table semantics: real `<table>`/`<thead>`/`<th scope=col>`/`aria-sort`, or CSS-grid rows
  with equivalent ARIA — implementer's choice, but header cells must be buttons with
  `aria-sort` and rows must remain anchor-wrapped (the `?entry=` split-view click model is
  untouched).
- `contain-intrinsic-size` re-pinned to the new row height (P4.5 scroll-jump lesson).

### D29-79 — traits leave the rows (R3)

Row markup drops trait pills entirely. Traits remain: drawer facet (unchanged), entity
page/split pane (unchanged). `TraitPill` keeps its non-row users.

### D29-80 — nav carets

- `.codex-nav-caret` de-chromed: `appearance: none; border: none; background: none;
  font: inherit; color: inherit; cursor: pointer;` (root cause: UA default chrome, measured
  `2px outset black` + gray fill).
- Every dropdown trigger in `HeaderNav.tsx` gains the same `▾` affordance (aria-hidden span,
  same size/voice as Rules'). Rules keeps its split-control semantics (D29-47/M4) — after
  this change it visually matches the others, its behavior stays two-tab-stop.

### D29-81 — exact-name search boost

At the `pagefindClient.ts` shaping seam (shared by Omnibar + SearchPage + HeroSearch):
after fragments load, partition hits into **name-match** (case/diacritic-insensitive:
exact `name === query`, then `name.startsWith(query)`) and the rest; render the name-match
partition as a pinned **"Name matches"** group ABOVE category groups (omnibar) / at the top
of results (SearchPage), exact before prefix, ties by level-then-name. Match against the
displayed name (`meta.title`/`SearchDisplayResult.name`). Cap the pinned group at 8; the
same hits are NOT repeated in their category groups below (dedupe by id). Acceptance
queries: `fireball` → spell Fireball #1; `heal` → spell Heal #1 (kills the documented P3
limitation); `wand of smoldering fireballs` → that wand #1.

### D29-82 — split-view keyboard nav + hint

- On split-view listings (desktop): `j`/`k` move a roving row selection (visually the
  existing selected-row treatment; scrolls into view), `Enter` navigates to the full entity
  page, `o` (or plain click) sets `?entry=`. **Moving the selection also updates `?entry=`**
  (matches 5e.tools: selection IS preview). Keys are inert while any input/select/dialog has
  focus (the quick-filter guard) and on mobile.
- Hint line, small condensed voice, right of the count line: `Ctrl+K search · j/k browse ·
  enter open` — desktop only, one line, no dismiss state.

## 3. Slices

- **S1 — columns + sort + BrowseListing table (the big slice).** `columnDefs.ts` (+ unit
  tests incl. every-category-has-columns totality + fallback), `filterEngine.ts` SortMode
  widening + comparator sort (missing-last tests), BrowseListing row grammar → table register
  w/ sortable headers, strip/section-header removal, `?sort=` URL codec extension w/
  forever-decode, `contain-intrinsic-size` re-pin, mobile column collapse. Rows-per-screen
  proof on /spell and /feat (≥ 24 rows at 1600×900).
- **S2 — site-wide density + secondary surfaces + carets.** D29-77 token block; entity
  page/split pane, search results, rules tree, sources, drawer, header lead-in; D29-80 both
  caret changes; goldens re-verified (expected ZERO delta — CSS-only for entity pages; if
  EntityPage markup moves, regen + flag).
- **S3 — search boost + keyboard + hint.** D29-81 at pagefindClient seam w/ tests (fireball/
  heal/exact-wand + dedupe); D29-82 keys + hint + input-focus guard + Escape ordering vs
  omnibar singleton.
- **S4 — sweep + deploy.** Full codex suite, both CI lanes, hydration-zero pass on the
  reworked routes, weights capture (row DOM shrinks — expect flat-or-smaller), lead-in ≤
  300px measured, telemetry spot-check, README render section, `just up` + edge verify
  (three-prong real-corpus + spot URLs + a sorted-column URL), spec build record, RESUME +
  memory updates. Screenshot set to the stakeholder (density is his call to eyeball early).

## 4. Acceptance gates

- **A.** Every category listing renders its columnDefs set; totality test (88 categories →
  columns, fallback included); missing facet values render `—`.
- **B.** /spell at 1600×900 shows **≥ 24 rows**; lead-in ≤ 300px; zero horizontal scroll at
  390px w/ Name·Lvl·Source only.
- **C.** Sorting: every sortable header cycles asc/desc, missing-last holds, `?sort=` URLs
  round-trip + SSR to the same order (loaderDeps proven), unknown `?sort=` falls back
  silently.
- **D.** Search: `fireball`/`heal` name-pinned #1 in omnibar AND /search; pinned hits not
  duplicated below; zero regression on non-name queries ("gambling lore satinder" still
  returns Satinder Morne).
- **E.** Keyboard: j/k/Enter per D29-82 incl. input-focus guard; hint renders desktop-only.
- **F.** Nav: caret chrome-free (computed border none) on all eight dropdown triggers; Rules
  split semantics intact (two tab stops).
- **G.** Both CI lanes green; goldens byte-stable (or regen'd + flagged if EntityPage markup
  changed); zero hydration errors across the spot-set; weights recorded.
- **H.** Stakeholder eyeball of the new register (folds into the running gate H).

## 5. Non-goals / risks

- No transform/emit/index changes; no drawer/facet-logic changes; no mobile nav rework.
- Backrefs explicitly deferred (own scope).
- Risk: two visual registers (sourcebook pane vs data-table list) on one page — mitigated by
  keeping name-serif + parchment tokens in rows; stakeholder sees S1/S2 screenshots early.
- Risk: `?sort=` × `?entry=` × facet params interaction — S1 must thread sort through
  `filterStateToSearch` (the P4.5 entry-resync bug class).
- Risk: j/k scroll-into-view vs `content-visibility` row estimation — verify on feat (8,484
  rows).
