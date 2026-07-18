# codex (0029) P11 — backlog round: scope (verified) — 2026-07-18

**Provenance:** the 2026-07-18 read-only live-site sweep produced a net-new UX/bug backlog
(`thoughts/shared/research/2026-07-18-codex-0029-ux-backlog-thoughts.md`, commit `8454534`).
Stakeholder directed: scope P11 from that backlog. Five parallel read-only verification agents
checked every load-bearing claim against the real repo + corpus (`apps/codex/data/corpus`,
46,192 entities) and the live server before any decision was asked. All stakeholder decisions
below are RESOLVED (two AskUserQuestion batches, same day). Gate H remains open and becomes the
ONE consolidated **P2–P11** review after this round ships.

**Backlog item numbers below refer to the backlog doc.** This doc supersedes the backlog's fix
sketches wherever verification contradicted them (items 2, 3, 3c, 6, 8, 13b — see §3).

---

## 1. Stakeholder decisions — ALL RESOLVED

- **R1 — round contents: the FULL backlog** (P1 + P2 + P3 tiers) in one round, minus item 3
  (refuted, §3.1) and minus the parts of 13b that verification dissolved (§3.6). One deploy at
  the end; the transform-touching items force a corpus regen + search reindex, so the deploy
  follows the D29-97 staged order (build image FIRST, then wipe→reindex→`just up`).
- **R2 — item 3a (nameless activations): ingest DROP, keep the 6 referenced.** Drop the 1,227
  zero-inbound-crossref paren-named action entities at ingest (P1.5 drop-pass precedent:
  report-accounted, URLs 404). Keep the 6 base-slug entities with 56 inbound crossrefs
  (`action/manipulate` 29, `concentrate` 18, `concentration` 5, `command` 2,
  `concentrate-manipulate` 1, `envision` 1) — no live link breaks.
- **R3 — items 3e/3f/13 (empty categories + lying count): reveal control + nav prune.** Port
  the `/rules` inline "Show N hidden (superseded) →" control to ALL category listings (fixes
  the "N of N shown" denominator lie site-wide); the 10 all-superseded + thin categories leave
  the nav via R5's curation. Pages stay at their URLs.
- **R4 — item 13e (title-into-header): listings + entity/rules pages** (site-wide pattern;
  landing + /search keep the wordmark). Sub-designs pinned at spec: home affordance stays (a
  small mark/glyph before the title or the title links home — the wordmark is currently the
  ONLY home link, `__root.tsx:68-70`); count + FILTERS fold into a slim bar above the table.
- **R5 — item 13f (nav curation): adopt the AoN-mirroring curated set as proposed** (~30
  destinations; exact membership tweakable at spec review): **Player** (class, ancestry,
  heritage, background, feat, archetype, skill, condition, action, trait) · **Spells** (spell,
  ritual) · **Equipment** (equipment, weapon, armor, shield, vehicle) · **GM** (creature,
  creature-family, hazard, warfare-army, kingdom-event, kingdom-structure, curse, disease) ·
  **Setting** (deity, plane, language) · **Rules** (link) · **Sources** (link) · **"All
  categories" → /categories**. Everything else (the class-subsystem long tail — bloodline,
  doctrine, muse, …) demotes to /categories + omnibar + in-context links. Stakeholder
  explicitly OK with link/search-only reachability for the long tail.

## 2. Orchestrator mechanism decisions (verification-forced; flag at spec review)

- **D-17 (item 17, duplicate crossrefs): transform-side post-repoint adjacent dedupe.** Root
  cause (verified against raw snapshots): AoN cites legacy/remaster same-named pairs as TWO
  distinct links (`Deities.aspx?ID=219` + `?ID=377` both "Cosmic Caravan"); codex's deliberate
  legacy→remaster link repointing (P1 S5d / P6 family) lands both on the same `targetId`,
  producing identical adjacent crossrefs. Measured breadth: **200 occurrences / 54 entities**
  (deity-category 15 entities, creature 16, creature-family 10, feat 8, spell 3, deity 2;
  `", "`-separated runs). Since the repointing is by design (remaster-primary), the duplicates
  are a policy artifact → dedupe identical-target+display adjacent runs at transform,
  post-resolution. Render-side adjacent-dedupe as cheap defense-in-depth is optional. Verify
  post-fix: the 54-entity list drops to 0. None of the 7 goldens are affected.
- **D-6 (item 6, "Leads to…" excerpts): the backlog's `data-pagefind-ignore` fix is INERT** —
  codex never runs Pagefind's HTML crawler (`build-search.ts` calls `addCustomRecord` over
  `collectText(entity.body)`; header comment says so explicitly). Correct fix: skip the
  `/ leads to\.\.\.$/i` heading node + its trailing crossref paragraph in the build-search
  node walk. Forces the host-only reindex (~33 s) — riding the round's reindex anyway.
- **D-5 (item 5, owning class in search meta):** `IndexRow` does NOT carry `mastheadExtra`,
  but `build-search.ts` already loads the full entity per row → read the `Class` label from
  `entity.mastheadExtra` into a new `meta.class` inside the existing loop. No schema change;
  needs the reindex. Omnibar + /search render it (item 4's fix renders category/rarity too —
  the omnibar rows ALREADY receive those fields unrendered, `pagefindClient.ts`
  `toDisplayResult`).
- **D-3c (facet leaks):** the "Item Category" leak is NOT mastheadExtra — it's
  `GenericFacetLine` dumping `entity.facets` (`facetHeader.tsx:335-364`). Fix = add
  `"itemCategory"` to the existing `SPILLOVER_FACET_KEYS` render-side exclusion
  (`facetHeader.tsx:321`); measured breadth 1,594 entities (class-feature 594, deity 475,
  action 404, familiar-ability 73, creature-ability 48). Cannot affect equipment categories
  (they route to the bespoke `EquipmentFacetHeader`). `valued` (condition, 42/98): it's real
  data (value-bearing vs flat conditions) — render only when `true` as "Valued" (drop the
  bare `Valued: false`), don't blanket-suppress. This one seam also fixes the popover leak
  (13c family) since `EntityRenderPane` is shared. No OTHER internal-taxonomy keys leak
  (scanned all generic-group facet keys).
- **D-15 (item 15, ToC/anchors): SSR heading ids + ToC island.** Render-time slugger (net-new
  small pure fn, GitHub-slugger-style with `-2`/`-3` collision suffixes — class pages repeat
  section titles) applied at the `case "heading"` branch (`nodes.tsx:365-374`) AND the other
  heading emitters (`entityPage.tsx:71,133`, `AttachedSidebars.tsx:56,64`). No schema change
  (`HeadingNode` stays id-less; ids derived at render). ToC = client island scanning the
  rendered headings post-hydration, mounted for long pages (threshold at spec); rules pages
  can extend `RulesLayout`'s existing left rail. Golden impact: exactly one
  (`class-investigator.html`, 44 headings, <1 KB growth).
- **D-19 (nav label names):** `humanizeSlug` is punctuation-blind; the corpus already has the
  right names (`category-page/hunters-edge.json` → "Hunter's Edge"). Fix = a small override
  map for the nav/listing top-level categories (only `hunters-edge` confirmed wrong among the
  88; 14 more mismatches exist but in AoN glossary category-pages, not nav categories). Same
  string drives the listing h1 (`BrowseListing.tsx:701`) — both fixed at once.
- **D-13a (popovers):** interaction is hand-rolled (only `@floating-ui/dom` positioning; no
  `useHover`/`safePolygon`). Fix: `pointer-events: auto` on the active popover + a manual
  hover bridge (mouseenter/leave bound on the panel too, close-timer cancel on re-entry).
  Zero existing test coverage — add at least a smoke test.
- **D-13c (compact popover): server-emitted summary fragment.** The popover fetches the SSR
  page and clones the whole `.popover-hint` article — there is no render-from-nodes path. Fix
  = move `.popover-hint` onto a purpose-built compact block (small title + type chip + first
  paragraphs; no pointer box, no internal pairs) emitted alongside the full page.
- **D-14 (pointer boxes):** no ingest change — add `remasteredAs`/`legacyOf` ids to the
  `entityPageData.ts` embeds prefetch, pass `ctx` into `EditionBanner`, render
  `name (source.book)` with raw-id fail-soft. Goldens `spell-heal.html` +
  `class-investigator.html` regen.
- **D-16 (trait dead-ends):** lowest-risk affordance = a `/search?traits=<trait>` link on
  trait pages (codec already supports it, zero new aggregation); richer per-category links
  need a new trait→categories memo over the already-cached `_index` rows — spec may include
  it if cheap.

## 3. Corrections to the backlog (verification findings)

1. **Item 3 REFUTED — out of the round.** Foundry-body statblocks have grouped one-line
   ability/save rows since P2 (`statblock.tsx` `AbilityModsRow`/`AcSavesRow`, present at
   `031a7fb`); the cited `/creature/aapoph-granitescale` is actually an AoN-body page already
   collapsed by P10 on live (Playwright-confirmed). No work exists here.
2. **All absolute corpus counts in the backlog's action section were 2× inflated** — the
   sweep's counter walked `_index.json` rows as extra entities. Real: **1,233 of 4,025**
   nameless activations (~31% proportion was right); **12** template-glyph names (not 24).
3. **Item 1 CONFIRMED with live proof** (Level th = 19px with 16px padding → ~3px content
   box; edition-icon column content box ≈ 0.125px). Fix seam: `columnDefs.tsx` widths
   `"Nch"` → `"calc(Nch + 1rem)"` (border-box stays; no CSS change). Extend
   `scripts/rowHeightDriftGuard.ts` (CI job `codex-row-height-drift-guard`) to assert
   `td.scrollWidth <= td.clientWidth` across mounted `codex-listing-col-*` cells.
4. **Item 2 re-rooted:** no literal 617px constant — it's `.wrap-wide`'s 72rem prose cap
   (globals.css:807, reused by the listing route) composed with the 58/42 grid; measured
   617.109px identical at 1300/1920/2560px viewports. The table already fills its pane
   (`width:100%`) and Name is already the fluid remainder column. Fix = a wider/uncapped
   browse-shell container variant, NOT column work. Invariants to keep:
   `NARROW_CONTAINER_WIDTH_PX` (600) and gate-B "full column set at 1600px" (widening only
   helps both).
5. **Item 3b:** exact seam `aonFacets.ts:362` (`src.name` verbatim, never parsed) — AoN
   pre-resolves glyph templates in `markdown` but not `name`. Resolve the two glyph forms
   (`<%TRAITS%N%%>x<%END>` → x; `<%ACTION.TYPES#N%%>` → count phrase) before `required()`.
   Slug churn is safe: zero inbound crossrefs to the 12; the link table re-resolves by
   normalized AoN url on regen.
6. **Item 13b mostly dissolved:** the popover already uses the shared `--color-elevated`
   token (same surface as the Filters dialog + nav dropdown). Only real inconsistency: the
   popover border is `--color-rule` (translucent) vs the dialog's `--color-gold-frame`
   (solid) — unify the border token; no background change. (A sitewide `--color-elevated`
   retune would be a separate stakeholder call — not in this round.)
7. **Item 8 re-rooted:** the Source list IS sorted — alphabetically by FULL book title while
   displaying abbreviations (`scalarOptionCounts` sorts on `row.source.book`; `labelOf`
   abbreviates for display), which is why it looks arbitrary. Fix: sort by the displayed
   label (or count-desc — pick at spec).
8. **Item 13d scroll-region list corrected:** the listing pane is NOT an inner scroll region
   (P9 windows via the document scrollbar — `:root` theming covers it); the split-view
   `.codex-entry-pane` (`max-height: calc(100vh - 2rem); overflow-y:auto`) IS one and was
   missing from the backlog's list. Regions: `:root`, `.codex-facet-options`,
   `.codex-trait-chips`, `.codex-nav-panel`, `.popover-inner`, `.codex-entry-pane`.
9. **Confirmed-exact (no correction):** 3e's 10 all-superseded categories and 3f's 8 thin
   categories match the corpus row-for-row; item 10's 384px = `.codex-nav-panel`
   `max-height: 24rem`; item 12's gap is a missing zero-match guard in `RulesBookSection`
   (one-line, `RulesTree.tsx:94-170`); items 7/9 confirmed at `FacetPanel.tsx` +
   `globals.css:1061-1139` (224px windows, no type-ahead); item 20's 404 fix needs no
   route plumbing (`useRouterState` pathname → `/search?q=<slug>`).

## 4. Round shape (spec inputs)

**Transform/ingest lane** (forces corpus regen + host-only search reindex + staged deploy):
3a drop (1,227, report-accounted, drop-pass precedent) · 3b name-glyph resolution (12) ·
D-17 adjacent-crossref dedupe (200/54 → 0) · D-5 `meta.class` · D-6 leads-to exclusion.
Determinism 2×; totals move 46,192 → 44,965 (−1,227) — manifest, category counts, fixture
and report pins all move; virt-* fixtures follow the restore-from-git + re-splice procedure
(P10 §6; they have NO generator).

**Render/CSS lane:** item 1 column padding + drift-guard extension · item 2 browse-shell
container · D-3c facet-leak suppression (+valued) · D-13a popover interaction · D-13c compact
popover fragment · 13b border token · 13d scrollbar theming (6 regions; doubles as the
scroll-affordance fix for items 7/10/13a) · item 12 zero-match guard · items 4/5 render of
already-carried meta · items 7 (type-ahead inputs) · 8 (sort key) · 9 (rarity tier order) ·
10 (`min(70vh, …)`) · D-14 pointer-box names · D-15 heading ids + ToC · D-16 trait links ·
D-19 name overrides · item 20 404 search link.

**Nav/IA lane:** R5 curated set (rewrite the three 88/88 conformance assertions → "curated ⊆
88 + remainder in /categories") · R3 listing reveal control (seam:
`BrowseListing.tsx:698-714` header, predicate `filterEngine.ts:176-177`, mirror
`rules.tsx:52-96`) · R4 title-into-header (`__root.tsx:67-78` header; listing header slims;
entity h1 relocates; keep a home link).

**Known test/golden impact:** nav conformance test (3 assertions) · `BrowseListing.test.tsx`
count-line asserts gain reveal-state coverage · goldens: `class-investigator.html` (heading
ids + D-14) + `spell-heal.html` (D-14) only · drift-guard script gains cell-fit asserts ·
new popover smoke test · `build-search.test.ts` fixture asserts (D-5/D-6) · ssrSmoke +
`corpusFs.test.ts` hardcoded 88s unchanged (category COUNT stays 88 — the drop removes
entities, not categories; only nav membership shrinks).

**Pre-existing residue riding along (NOT P11's):** 7 ssrSmoke fails on main; the
`codex-virtualization-interaction-guard` CI-env flake (passes locally).

**Deferred/out:** backrefs round (unchanged) · item 3 (refuted) · sitewide `--color-elevated`
retune · upstream-verbatim overrides registry (P10 carry).

**After the round:** gate H = the ONE consolidated **P2–P11** stakeholder review on live.
