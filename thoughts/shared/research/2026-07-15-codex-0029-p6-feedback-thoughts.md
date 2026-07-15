# codex 0029 — P6 gate-H feedback scope (2026-07-15)

**Provenance:** the D29-58 consolidated gate-H stakeholder review ran 2026-07-15 against the live
`codex.iridi.cc` and came back a **REDIRECT** with 11 feedback items (the P4.5 precedent repeating).
Each item below was investigated against the real repo/corpus by four parallel research agents before
any stakeholder question was asked; every decision is **RESOLVED** (batched via two AskUserQuestion
rounds, same session). This doc is the scoping input for the P6 spec.

**Corpus facts at investigation time:** 46,192 entities / 88 category dirs at `apps/codex/data/corpus/`
(gitignored); fixture at `apps/codex/fixtures/entities/`; search index `apps/codex/data/search/`
(Pagefind, host-only build via `just codex-search-index`); live at `codex.iridi.cc` (port 10374).

---

## Items, root causes, resolutions

### R1 — Tables unstyled (BUG, no decision needed)

`.codex-content` has **zero** table CSS — the P4.5 gothic→parchment restyle never ported gothic's
table skin (`libs/ts/gothic/src/theme.css:207-215`: border-collapse, cell borders+padding, header
styling, zebra). Renderer emits classless `<table>` (`apps/codex/src/domain/render/nodes.tsx:384-402`);
stylesheet is `apps/codex/src/styles/globals.css` (`.codex-content` currently styles only `p/ul/ol`,
~line 630). **917 entities** carry table nodes (creature 272, rules 222, equipment 166, class 48,
skill 35). Straight omission, not a redesign — nothing in the P4.5 spec mentions tables.

**RESOLVED: fix.** CSS-only — port the gothic rule set under `.codex-content` in parchment tokens.
Size S. Sample entities: `spell/shining-starlight-attack`, `feat/chromotherapy`, `ritual/awaken-animal`.

### R2 — Crit success/failure blocks collapse onto one line (BUG, no decision needed)

AoN marks each degree-of-success block with `<br/>`, which ingest **deliberately** preserves as a
literal `"\n"` inside a single `text` node within ONE `paragraph` node
(`apps/codex/src/ingest/aonMarkup.ts:69-71,325-327` — "does NOT open a markdown line"). No
`white-space` rule exists near `.codex-content p`, so CSS default collapses the `\n`s to spaces.
NOT the P3 `embedRendersAsBlock` guard (unrelated). Verified on `spell/accelerated-decomposition`
(body node ~9) and `spell/nightmare` (node 11).

**RESOLVED: fix.** Preferred: CSS-only `white-space: pre-line` on `.codex-content p` (collapses space
runs, honors `\n`). Fallback if side effects surface: split on `\n` in `nodes.tsx` `case "text"` and
emit real `<br/>` (touches the total renderer + goldens). Size S (CSS) / S-M (renderer).

### R3 — Content duplicated above and below the title

`entityPage.tsx:44-99` renders the structured header (name, level tag, traits, Citation, edition) +
the per-category FacetHeader (`facetHeader.tsx:67-117` for spells: Rank/Cast/Range/Defense), then
renders `entity.body` verbatim — whose **first ~6 nodes ARE the AoN masthead** (repeated `h1` +
`**Source**`/`**Range**`/`**Defense**` paragraphs, terminated by the first `divider`). Nothing strips
it, so title+facets render twice. **Distinct from the accepted M11** (creature statblock-twice) —
grep of P2–P5 specs confirms this preamble duplication was never triaged. Structural: affects most
spell/feat/equipment/generic-group pages. ⚠️ The masthead also carries fields the structured header
does NOT show (e.g. `**Mystery**`, `**Target**` on spells) — naive stripping loses information.

**RESOLVED: strip the pre-divider masthead AND enrich the structured facet headers to absorb the
non-duplicated fields** (Mystery, Target, …) — no information loss, one clean header. Size M.
Spec must decide strip location (ingest emit vs render skip; ingest-strip also cleans Pagefind
excerpts) + pin the masthead shape per category group (blast-radius survey required).

### R4 — "Only two rituals"

`ritual/` holds 58 entities; **56 are superseded legacy** (`remasteredAs → spell/*`), so the P4.5
default-hidden view shows exactly 2 (`rite-of-the-blood-crown`, `wish` — the only never-remastered
rituals). The 56 current-edition rituals were merged into **`spell/`** by the D29-15(5) spell↔ritual
equivalence join (`apps/codex/src/ingest/join.ts:223-229`), landing in Foundry's own category per
D29-16 — and **no ritual marker survived** (e.g. `spell/atone` has `traits: []`, `legacyOf:
["ritual/atone"]`). Working-as-spec'd; re-decision.

**RESOLVED: re-categorize — ritual-derived merged entities move to `category: ritual`, ONLY
available under Rituals, removed from Spells** (stakeholder: "don't cross-list"). Amends D29-16 for
the ritual join. Ripple: `spell/` 2,604 → ~2,548; the legacy twins become same-category `@legacy`
siblings (`ritual/atone` remaster + `ritual/atone@legacy`); listing indexes, nav counts, link
repoints, Pagefind rebuild, corpus regen + determinism re-proof. Size M.

### R5 — Real action-cost glyph SVGs

Current rendering is **already inline SVG** (`apps/codex/src/ui/actionGlyph.tsx:55-92`, moved
verbatim from gothic at P4.5 S1) — but hand-approximated triangular pips, never Paizo's actual glyph
shapes. The `CodexActionGlyph` B1 shim (`domain/render/actionGlyph.tsx:91-112`) normalizes AoN's
long-form vocabulary ("Single Action", "Two Actions to Three Actions") to `ActionCost` and delegates.
Surfaces: statblock strike/action rows (`statblock.tsx:185,242`), feat facet header
(`facetHeader.tsx:183`), inline prose `actionGlyph` nodes (`nodes.tsx:324,344-345`), plain-text
fallback (`text.ts:78`). **No icon assets exist in-repo** — the Foundry snapshot is packs/lang only
(no `styles/fonts/icons` tree). SVG-not-font is load-bearing (icon fonts blank in the vellum-render
PNG pipeline) — keep the mechanism.

**RESOLVED: exact trace of the real PF2e glyphs.** Stakeholder: *"legality is fine, I've checked
with our lawyers and we have permission"* — the visual-IP question the P1 ORC/CUP analysis never
covered is stakeholder-cleared, on the record. Implementation: source the official glyph outlines
(the Foundry pf2e system's action-icon font is the known carrier — a targeted asset fetch, since our
snapshot has none) → convert outlines to SVG paths → replace the four `<path>` sets in
`actionGlyph.tsx`. Size S-M (asset sourcing + path swap + golden regen).

### R6 — Footer

`apps/codex/src/routes/__root.tsx:72-74` — the footer is ONLY the one line
("codex — public, unofficial, noindexed"). No CUP/ORC site-wide attribution exists anywhere (the
per-entity `Citation` license badges are per-page mechanical sourcing, not a legal notice); the word
"unofficial" was informally the entire global disclaimer for the P1 gray-tier posture.

**RESOLVED: DELETE the footer outright.** The orchestrator flagged that this leaves zero global
disclaimer (a regression vs the P1 posture); **stakeholder chose deletion anyway — accepted risk,
recorded.** Size S. (Check ssrSmoke/Playwright for footer-text assertions when removing.)

### R7 — Serve on `2e.iridi.cc`

**RESOLVED: alias — serve both hostnames identically**, mirroring the existing `heart.iridi.cc` →
akasha precedent (`sites.caddyfile:71-76`): a discrete stanza `2e.iridi.cc { import astra_site;
header X-Robots-Tag noindex; reverse_proxy localhost:10374 }` + `just caddy-reload`. Zero DNS work
(`*.iridi.cc` wildcard; cert mints on first hit). Verified safe: `codex.publicOrigin`
(`config.kdl:311`) is **consumed nowhere** in codex (no canonical tags/sitemap; only `serviceName` +
`dataPath` are read). Size S.

### R8 — Runes non-obvious (BUG-shaped data gap, baseline agreed)

No `rune` category/facet/trait exists — runes are plain `equipment/` entities. **AoN's snapshot
carries the taxonomy explicitly** (`item_category: "Runes"`, `item_subcategory: "Weapon Property
Runes"`) but ingest never reads those fields (zero grep hits); `facets.itemCategory` is populated
only from Foundry `system.category` (`foundryEntities.ts:385`), which rune items don't set — so the
existing `EquipmentFacetHeader` itemCategory slot (`facetHeader.tsx:154-156`) and the
`plainEnumDef("itemCategory")` facet filter (`facetDefs.ts:199`) render nothing for runes. The
`usage: etched-onto-*` proxy (130 items) renders but doesn't say "rune".

**RESOLVED (baseline, no stakeholder question needed): thread AoN `item_category`/`item_subcategory`
through ingest into `facets.itemCategory` (+ subcategory), Foundry `system.category` as fallback** —
the existing header slot and Category facet filter light up for free ("Runes" becomes filterable).
Listing-row badge NOT in scope (header + facet suffice for the complaint). Size S (ingest + regen).

### R9 — Level filter passes unleveled items

`equipment/adventurers-pack` (remaster) has **no `level` key at all** — 1 of only 2 such equipment
entities out of 7,295 (`cartographers-kit@legacy` is the other). D29-32 spec'd missing-key rows PASS
range filters unless the per-facet "Must have a value" checkbox is set (`filterEngine.ts:124-130`,
`FacetPanel.tsx:127-134` — exists, defaults off). Working-as-spec'd; re-decision.

**RESOLVED (three-part):** (a) **missing `level` defaults to `0` at ingest** for entities in
level-bearing categories; (b) **a typed min/max bound implies has-value** for every range facet
(rows without data are excluded once any bound is set); (c) **the "Must have a value" checkbox is
removed** from FacetPanel. Amends D29-32. Size S-M (ingest default + filterEngine semantics + UI
removal + corpus regen).

### R10 — Source-name abbreviations

496 normalized book names (`sources-index.json`; P4's mechanical-only normalize at
`ingest/bookNormalize.ts`): 243 AoN-known (productLine set) + 253 "Other" (146 of which are
`Pathfinder Society Scenario #N-NN: <title>`; ~107 numbered APs/Bounties/one-offs). **No
abbreviation data exists in any snapshot** (AoN + Foundry both grepped) — community conventions
(CRB, APG, SoM, G&G) must be hand-seeded. Eight UI surfaces render the full name (BrowseListing row
+ disambiguator, FacetPanel source filter, activeFilterPills, SourcesIndexView, RulesTree/
RulesLayout, SearchPage/Omnibar, citation.tsx) — all resolve through the ONE normalized `source.book`
key (`entityPageData.ts:169-171` invariant).

**RESOLVED: build-time `abbreviation` field in `sources-index.json`** (schema
`sourcesIndex.ts:31-40`, populated in `sourcesIndexBuild.ts`): a **hand-curated map for the 243
AoN-known books** (community-convention codes) + a **stopword-aware title-initialism generator for
Society/numbered products in the stakeholder's `PS:ATG` style** (map overrides for collisions/ugly
cases; hand-review the generated set). Compact surfaces (listing rows, pills, search results, rules
sidebar) use the abbreviation; full name stays where space allows (entity citation line, /sources
headings — spec pins the exact split + hover/title affordance). Size M — curation labor dominates.

### R11 — Legacy/remaster duplicates in search

Deliberate P4.5 **D29-48/R3 carve-out**: "search NEVER hides superseded content" — the toggle-less
always-both design, edition pill badges render in both surfaces (`Omnibar.tsx:225-227`,
`SearchPage.tsx:286-288`), and search state has **no superseded field at all** (removed as dead
code). The reversal is cheap: `superseded` is **already in the Pagefind index**
(`build-search.ts:117`) and a tested-but-unused `supersededFilter()` helper exists
(`pagefindClient.ts:88-99`).

**RESOLVED: hide superseded in search by default** (amends D29-48): re-add `superseded` to
`SearchFilterState`/`SearchPageSearch` (default false), merge `supersededFilter()` into both
surfaces' Pagefind calls, add a visible reveal control on `/search` (+ honor `?superseded=`).
Never-remastered legacy content still appears (it isn't superseded). Size S.

---

## Decisions summary (all RESOLVED 2026-07-15)

| # | Decision | Supersedes/amends |
|---|---|---|
| R1 | Port table CSS into `.codex-content` (parchment tokens) | P4.5 omission |
| R2 | `white-space: pre-line` for degree-of-success line breaks | — |
| R3 | Strip body masthead + enrich facet headers (no info loss) | untriaged (≠ M11) |
| R4 | Rituals re-categorized under `ritual` only — NOT in Spells | amends D29-16 (ritual join) |
| R5 | Exact-trace real PF2e action glyphs (legal stakeholder-cleared) | P2 B1 approximation |
| R6 | Footer deleted outright (zero-disclaimer risk accepted) | P1 informal posture |
| R7 | `2e.iridi.cc` alias stanza (heart.iridi.cc pattern) | — |
| R8 | Thread AoN item_category/subcategory into facets | P1 ingest gap |
| R9 | level→0 default + bounds imply has-value + checkbox removed | amends D29-32 |
| R10 | Build-time abbreviations: curated 243 + PS:ATG-style generator | — |
| R11 | Search hides superseded by default + reveal control | amends D29-48/P4.5-R3 |

## Notes for the spec

- **Corpus-regenerating items (R3, R4, R8, R9) should share one regen + determinism re-proof** and
  one Pagefind rebuild (host-only, `just codex-refresh` restarts the container per D29-57).
- R4's id migration needs the P1.5 resolution-time link-repoint machinery (crossrefs pointing at
  `spell/<ritual-slug>` must follow the move) + `?legacy=`/`?superseded=` alias behavior intact.
- R3 needs a masthead-shape survey per category group BEFORE the strip rule is pinned (the P4 lesson:
  verify pins against the algorithm-as-specified — don't trust one sample).
- R5 asset sourcing is a NEW fetch (our Foundry snapshot deliberately has no asset tree).
- Deploy tail: R7 is edge-only; everything else ships via image rebuild + `just up`; gates should
  re-run the C real-corpus three-prong assert (never bare 200s).
