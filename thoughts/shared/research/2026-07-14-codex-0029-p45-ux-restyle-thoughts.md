# codex 0029 — P4.5 UX rework + bespoke restyle — scoping (2026-07-14)

**Status:** SCOPED — all stakeholder decisions below RESOLVED same day; ▶ next `octo:spec` P4.5.
**Provenance:** this phase IS the output of acceptance H (the consolidated P2+P3+P4 stakeholder
review). The stakeholder reviewed the built site and redirected on five fronts rather than
signing off. H re-runs against the reworked UI at P4.5 exit; P5 (deploy) stays gated behind it.

**Companion docs (committed alongside, same date):**
- `2026-07-14-codex-0029-p45-ui-map.md` — the verified current-implementation map (agent-gathered,
  line numbers best-effort; re-confirm exact lines when citing in the spec).
- `2026-07-14-codex-0029-p45-style-tokens.md` — the design-token + component extraction from the
  36 sourcebook reference pages (`/home/jbassin/style-ref/ref-{01..36}.png`, "Færrin — Liturgy of
  the Iridite").

---

## 1. The five feedback items (verbatim intent)

1. **Faceted browse is the wrong shape.** Wanted: 5e.tools-style **split column** — filterable
   list left, the selected entry rendered right — with filters in an expandable **drawer/modal**
   with sensible defaults, not the current always-visible facet sidebar + flat listing.
2. **Navigation is abysmal.** Going category→category requires backing out to `/` and hunting.
   Wanted: a **global header with categorized dropdowns on every page** (5e.tools-style).
3. **The home page is bad.** "Every entity lives at /{category}/{slug}" is useless to humans.
   Wanted: **big buttons for the most-used sections** on top of the same global header.
4. **The legacy checkbox is confusing** — unchecked, legacy items still appear in category lists
   (never-remastered legacy-edition rows aren't `superseded`, so today's toggle doesn't hide
   them). Wanted: **kill the checkbox; search always covers both editions; the edition facet
   defaults to remaster on every page.**
5. **codex gets its own bespoke style** (stakeholder decision — the other astra sites keep
   gothic untouched). The style source is the campaign's own sourcebook (the 36 reference pages):
   light parchment print aesthetic — maroon small-caps serif headings, gold rules/frames, tan +
   blue callout families, PF2e-convention trait pills, condensed-sans statblock headers.

## 2. Stakeholder decisions — RESOLVED 2026-07-14 (all batched via AskUserQuestion)

| # | Decision | Resolution |
|---|---|---|
| R1 | Split-view right pane | **Full entity render** (statblock + prose, same as the entity page), URL-driven/deep-linkable. `/{category}/{slug}` stays canonical for direct links + mobile. |
| R2 | Theme policy | **Parchment only.** The dark-only pre-hydration machinery is REMOVED (not inverted): the `saved-theme` stamp script + both `suppressHydrationWarning` props in `__root.tsx` exist solely for it and go with it. |
| R3 | Legacy scope | **One edition control everywhere** — browse listings, `/rules` tree, attached sidebars all share the same edition-facet mechanism + default; search (Omnibar + `/search`) always queries both editions and badges results. |
| R4 | Home tiles | **The standard eight:** Creatures · Spells · Feats · Equipment & Items · Classes · Ancestries & Backgrounds · Rules · Sources, under a prominent search bar. |
| R5 | Edition-default semantics | **Hide superseded only** (AoN behavior). The facet's default "Remaster (current)" state hides rows with `remasteredAs ≠ ∅`; never-remastered legacy-edition content **stays visible** (still table-legal). Widening the facet to Legacy reveals superseded rows. This preserves today's hidden SET while moving the control into the facet UI. |
| R6 | Style blast radius | codex only. gothic (the lib) is untouched; the other frontends keep it. codex drops the gothic import and owns its tokens/components. |

**R5 precision for the spec (the crux from the ui-map §3):** `superseded` (= `remasteredAs`
non-empty) and `edition === "legacy"` are different sets. The default-hidden set stays
`superseded`; `edition` remains an ordinary facet value filter on top. The facet UI must present
this honestly — e.g. an Edition section whose default state is labeled as current/remaster and
whose "include legacy" widening maps to `legacy: true` semantics today (show superseded), NOT to
an `edition` value filter. Exact labeling/widget is a spec decision; the semantics above are
locked.

## 3. Verified current-state facts (the load-bearing subset; full detail in the ui-map)

- **Legacy-toggle removal blast radius is exactly 7 importing files** (4 routes + `Omnibar.tsx`,
  `SearchPage.tsx`, `RulesLayout.tsx`) **+ 4 hide-by-default call sites** keyed on `superseded`:
  `filterEngine.ts`, `pagefindClient.ts`/`searchUrlState.ts` (query-time Pagefind filter),
  `treeModel.ts` (`pruneForLegacy`), `AttachedSidebars.tsx`. `BrowseListing.tsx`/`FacetPanel.tsx`
  never import the toggle — the edition facet UI already exists.
- **The M4 two-phase hydration seam collapses** once the toggle dies: `hasHydrated ? liveLegacy :
  search.legacy` in 3 routes becomes a plain URL read (no second source of truth). The spec must
  state this as a deliberate simplification. `legacyToggle.ts`'s module-eval URL-seed idiom is
  retired with it.
- **Search needs NO reindex**: both `superseded` and `edition` are already Pagefind filter facets
  (stamped at index build); "always both + badge" is a query-time default swap. A reindex is only
  needed if the record schema itself gains fields — flag that distinction in the spec.
- **Dropping gothic ≠ deleting one import.** `globals.css` (~1,017 lines) defines ZERO tokens of
  its own — 100% gothic `--color-*`/`--font-*` consumers. Plus five gothic React components are
  imported directly and need codex-owned replacements: `TraitPill` (traits.tsx), `ActionGlyph` +
  `normalizeActionCost` + `ActionCost` (actionGlyph.tsx), `ErrorChip` (nodes.tsx), `Input`
  (RulesTree.tsx, FacetPanel.tsx), `Button` (EmptyState.tsx) — and the `gothic-card*` class usages
  in nodes/statblock/entityPage. gothic's unused "diegetic" parchment tokens exist but are
  content-mode-scoped; codex should own its palette outright (R6) rather than couple to gothic.
- **`categoryGroup.ts` is render-shape taxonomy, not nav IA** — 6 buckets covering 9 of 88
  categories by name. The header-nav grouping over 88 categories is net-new information
  architecture.
- **Corpus scale for the split view:** feat 8,485 · creature 7,297 · equipment 7,296 · action
  4,026 · rules 3,646 · spell 2,605 rows; full `IndexRow[]` ships client-side today (D29-35,
  `content-visibility: auto` sanctioned). The split-column list panel must stay smooth at 8.5k
  rows; right-pane entity fetch can reuse `getEntityPage` (already URL-addressable).
- **Tests that churn:** `legacyToggle.test.ts` deleted; legacy-specific assertions rewritten in
  `filterEngine/treeModel/pagefindClient/searchUrlState/AttachedSidebars` tests;
  `render/goldens.test.tsx` (byte-exact HTML ×6) fully regenerated under the restyle;
  `ssrSmoke.test.ts` (550 lines) is the broadest shell/routing re-verification surface;
  `render/listing.test.tsx` churns with the landing page. Preserved: facetDefs conformance,
  actionGlyph totality, nodes/statblock/totality, sources model.
- **Weight baselines to re-measure, not silently exceed:** `/rules` 393,058 B raw / 78,044 B gz ·
  `/sources` 696,918/63,869 · heaviest sidebar host 378,215/77,866 · tree toggle ~35 ms avg.
  New fonts (5 families → subset weights), nav chrome, and split view all add weight; the spec
  needs fresh budgets (F-class gate) incl. a font-loading strategy (self-hosted @fontsource
  subsets, `font-display: swap`).
- **Standing decisions untouched by this phase:** C-1 noindex (D29-30 head meta), D29-12
  hermeticity (fixture fallback), D29-22 URLs, D29-23 reader split, D29-35 client-side filtering,
  Decision I (SSR Compose service). RUM effect stays mounted in the restructured shell.

## 4. 5e.tools anatomy we're adopting (the parts the feedback names)

- **Split columns:** left = dense row list (name + level/type + trait pills + source), sticky
  list header with quick-search box + sort controls; right = the full rendered entry; clicking a
  row swaps the right pane and updates the URL (no full navigation).
- **Filter drawer:** a "Filter" button above the list opens an expandable drawer/modal with
  per-facet sections (the existing FacetPanel sections re-housed), an active-filter pill summary
  row (each pill removable, "Clear all"), and sensible defaults applied on open (edition =
  current per R5). The always-visible facet sidebar dies with the old layout.
- **Header nav:** brand → home; categorized dropdown menus spanning ALL 88 categories (grouped
  IA proposed in §5); the Omnibar stays in the header; dropdowns work with keyboard + no-JS
  degradation (plain links to category listings at minimum).
- **Home:** search bar front-and-center + the R4 eight tiles (styled as sourcebook "big
  buttons") + a quieter all-categories index below (the current grouped directory data can seed
  it); the "every entity lives at" blurb dies.

## 5. Nav IA proposal (spec finalizes the full 88-category enumeration)

Six dropdowns + two direct links, every category reachable (catch-all group included):
- **Player** — class, ancestry, heritage, background, feat, archetype, class-feature, …
- **Spells** — spell, ritual, domain, …
- **Equipment** — equipment, weapon, armor, shield, consumable, treasure, item-bonus, relic, vehicle, …
- **GM** — creature, creature-family, creature-ability, hazard, warfare-army, kingdom-*, …
- **Rules** (direct link to `/rules`) + a dropdown tail: condition, action, trait, skill, category-page, …
- **Setting** — deity, plane, organization, faction, curse, disease, …
- **Sources** (direct link to `/sources`)
- Remainder → an "Everything" dropdown/index page so no category is orphaned (the current
  `/` directory data survives as that index).

## 6. Proposed slice shape (for the spec to refine)

- **S1 — theme foundation.** codex-owned token set (`tokens.css`: the §1 palette from the
  style-tokens doc) + self-hosted fonts (Cinzel, Cormorant SC, EB Garamond, Alegreya SC, Oswald —
  subset weights only) + codex-owned `ui/` components replacing the five gothic imports (pill,
  action glyph, input, button, error chip — visual re-skins, same props) + drop
  `@astra/gothic/theme.css` + remove the dark-theme script/suppressHydrationWarning pair +
  re-skin base elements. Goldens regenerate here. Site renders parchment end-to-end (old layout,
  new skin).
- **S2 — shell: header nav + footer + landing.** Nav IA (§5) as a data module + dropdown header
  (keyboard/no-JS safe), sourcebook footer treatment, the R4 landing page. `ssrSmoke` shell
  assertions updated.
- **S3 — edition rework.** Delete `legacyToggle.ts` + the header control; collapse the M4
  two-phase reads; `BrowseFilterState.legacy` → edition-facet default (R5 semantics) in
  `filterEngine`/`urlState`; query-time search default swap (always-both + badges, R3);
  `pruneForLegacy`/sidebars re-key; per-surface URL codec keeps deep links working (`?legacy=1`
  compat: decide map-or-drop in spec).
- **S4 — split-column browse.** The R1 split view + filter drawer on `/{category}`; right-pane
  entity render reuses the P2 renderer + `getEntityPage`; URL state for selected entry;
  mobile behavior (list-first, row tap navigates to the entity page); 8.5k-row list perf gate.
- **S5 — page-surface restyle sweep.** Entity pages (statblock header row, stat lines, tan/blue
  callouts, gold art frame where art exists), `/rules` tree + trail + pager, `/sources`,
  `/search` in the new language; citation/footer treatment.
- **S6 — acceptance sweep.** Playwright zero-hydration-error pass, fresh weight/perf numbers,
  telemetry spot-check, hermeticity both lanes, README; then **H re-run** (the consolidated
  stakeholder review against the reworked UI).

## 7. Risks / adversarial notes for the spec

- **The R5 facet-labeling trap:** presenting "Edition: Remaster ✓" while never-remastered legacy
  rows remain visible will read as a bug to users. The widget copy must say what it does (e.g.
  "Current content" default vs "Include superseded"). Spec must pin exact labels + URL params.
- **Split-view double-render weight:** listing payload (full rows) + full entity in one view.
  Right pane should fetch-on-select (server fn), not preload; back/forward must restore
  selection; SSR of a deep-linked selection must render the entity server-side (no flash).
- **Font weight creep:** 5 families is the print-faithful set; subset aggressively (latin,
  needed weights only) and measure — the F-class budget gate exists for this.
- **Goldens churn twice** (S1 skin, S5 structure) — regenerate once per slice, not per commit.
- **`?legacy=1` shared links** exist in the wild (P4 acceptance used them). Decide: map to the
  new edition param (cheap) or let them 404-soft to default view. Spec decision, one line.
- **Nav dropdowns are new hydration surface** — keyboard/focus management on an SSR'd header;
  keep it dependency-free (no headless-UI lib) per repo idiom.
- The linguist-commit timer must stay stopped during commit windows (the P4 S3 incident).

## 8. Out of scope (P4.5)

- P5 deploy (Caddy host, Compose unit, robots.txt/X-Robots-Tag) — next phase, unchanged.
- Any corpus/transform/ingest change (the emit layer is untouched; this is frontend-only except
  test fixtures).
- gothic lib changes (R6: other sites untouched).
- Entity-page content changes (M7 links-not-inlined + M11 statblock-twice stay as-is unless H
  re-review re-raises them).
