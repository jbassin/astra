# 0029 — codex P4.5: UX rework + bespoke restyle — spec

**Status:** BUILT (2026-07-15) — S1–S6 complete, A–G met with recorded evidence; ▶ H = the
consolidated stakeholder review re-run.
**Scope doc:** `thoughts/shared/research/2026-07-14-codex-0029-p45-ux-restyle-thoughts.md` (R1–R6
resolved same day, §6 slice shape, §7 risks, §8 out-of-scope — all binding; this spec elaborates,
never contradicts). Companion docs: `2026-07-14-codex-0029-p45-ui-map.md` (current-implementation
facts, re-verified against the real repo while authoring this spec — citations below reflect that
re-verification, not the map's own best-effort line numbers) and
`2026-07-14-codex-0029-p45-style-tokens.md` (the design-token/component extraction from the 36
sourcebook reference pages — referenced by name below, hex tables not restated).
**Prerequisite:** this phase **is itself** the output of acceptance H at the end of P4 — the
stakeholder reviewed the built site (P2+P3+P4) and redirected on five fronts instead of signing
off (scope doc §1). **H re-runs at this phase's exit, now covering all three prior phases' pending
items PLUS these five reworked surfaces; P5 (deploy) stays gated behind that re-run.**
**Prior specs:** P1 `0029-codex-p1-ingest-spec.md` (D29-1..21) · P2
`0029-codex-p2-entity-pages-spec.md` (D29-22..31) · P3 `0029-codex-p3-browse-search-spec.md`
(D29-32..38, **amended below** — D29-32/-35/-36 each get a superseding sub-decision) · P4
`0029-codex-p4-rules-browser-spec.md` (D29-39..45, BUILT — its tree/trail/pager/sidebar/sources
*mechanics* are UNCHANGED by this phase; only their *skin* and *edition-visibility plumbing*
change).
**Phase context:** P4.5 of 5 (P5 deploy remains, gated behind this phase's H). Frontend-only
(`apps/codex` + the one gothic-import removal) — no corpus/transform/ingest change except test
fixtures (scope §8).

## 1. Overview

Five independent-but-interacting reworks, landing as six slices:

1. **Bespoke parchment restyle (R6).** codex drops `@astra/gothic` entirely — its own token set,
   its own five UI components (replacing `TraitPill`/`ActionGlyph`+`normalizeActionCost`/`Input`/
   `Button`/`ErrorChip`), its own fonts, the print-sourcebook visual language from the style-tokens
   doc. The dark-only pre-hydration theme mechanism (`__root.tsx`'s inline script + both
   `suppressHydrationWarning` props) is deleted outright (R2 — parchment is the only theme, no
   attribute stamp needed).
2. **Global header navigation (feedback #2).** A categorized dropdown nav spanning all 88
   categories replaces the current brand+tagline+Omnibar header — net-new information
   architecture (§3 below enumerates every category's group). The legacy checkbox is NOT part of
   this replacement: S2's new header RETAINS the functional `LegacyToggleControl` in its utility
   area (so the toggle never has an invisible-but-active window between slices); its deletion is
   S3's job (D29-48).
3. **A real landing page (feedback #3).** `/` becomes the R4 eight-tile hero + search bar; the
   existing grouped category directory survives as a demoted "browse everything" index at a new
   route.
4. **Edition/legacy rework (feedback #4, R3/R5).** The global legacy checkbox + its whole
   client-global-state mechanism (`legacyToggle.ts`, the `useSyncExternalStore` trio, the
   module-eval-time URL-wins seed, localStorage) are deleted. Every surface's edition-visibility
   becomes a **pure per-page URL read** — this is not just a rename, it collapses the M4
   two-phase-hydration seam everywhere it appears (3 routes + `SearchPage.tsx`, plus
   `RulesLayout`'s bare internal toggle read), because there is no longer a second, live,
   cross-page source of truth to reconcile SSR against.
5. **Split-column browse (feedback #1, R1).** `/{category}` (every category except `rules`, which
   keeps P4's dedicated tree browser) becomes a 5e.tools-style list-left/entity-right split view
   behind a filter drawer, replacing the always-visible facet sidebar + flat listing.

**Verified against the real repo while authoring this spec (do not re-derive):**

- **88 real corpus categories** (`apps/codex/data/corpus/` has 93 entries; 5 are non-category
  artifacts — `manifest.json`, `report.json`, `report.md`, `rules-tree.json`,
  `sources-index.json` — leaving exactly 88 directories). The full list, and its nav-group
  assignment, is enumerated in §3's table — this is net-new work, not a re-derivation of
  `categoryGroup.ts`'s 6-bucket render-shape taxonomy (which stays untouched — it answers a
  different question, "how do I lay out this entity's page," and is not nav IA).
- **`FacetPanel.tsx` is a plain always-rendered `<aside>`** (`export function FacetPanel(...):
  ReactElement` returning `<aside className="codex-facet-panel" aria-label="Filters">...`), not a
  drawer — confirmed by reading the file: `LevelSection`/`CoreEnumSection`(Rarity/Source/Edition)/
  `TraitsSection`/`DerivedFacetSection` are its five section kinds, all pure presentational
  components over `BrowseFilterState`. The drawer rework (§2 D29-49) only needs a new *container*
  around this exact tree of sections — zero section-level logic changes.
- **`BrowseListing.tsx`'s rows are plain `<a href={"/"+row.id}>` full-page navigations today**
  (`displayName()`), confirmed by reading the file — there is no click-intercept/state-swap
  anywhere in the browse listing yet. The split-view rework's row click handler is genuinely new
  code, not a rewire of existing behavior.
- **The legacy-toggle removal blast radius, confirmed:** `__root.tsx` (the header control),
  `routes/rules.tsx`, `routes/$category/index.tsx`, `routes/$category/$slug.tsx`,
  `domain/search/Omnibar.tsx`, `domain/search/SearchPage.tsx`, `domain/rules/RulesLayout.tsx` all
  import `useLegacyToggle`/`setLegacyToggle` from `domain/browse/legacyToggle.ts`.
  `FacetPanel.tsx`/`BrowseListing.tsx` import nothing from it (confirmed — they only ever receive
  `state.legacy` as an ordinary prop), so the split-view/drawer rework (D29-49) and the edition
  rework (D29-48) are independently landable in either order without touching each other's files.
- **`$category/$slug.tsx` and `rules.tsx` ALREADY have their own page-local, URL-only `legacy`
  read**, independent of the global toggle — `validateEntitySearch`/`validateRulesSearch` each
  parse a bare `{legacy?: boolean}` off `raw.legacy`, and the M4 `hasHydrated ? liveLegacy :
  search.legacy === true` dance only exists to reconcile that URL value against the ALSO-present
  global toggle. **Deleting the global toggle does not remove any working capability from these
  two routes** — it removes the thing they were reconciling against, so they collapse to a bare
  `search.legacy === true` (soon `search.superseded === true`, §2 D29-48) with no `useState`/
  `useEffect`/hydration dance at all.
- **The gothic component surface to replace, confirmed by reading each file:**
  `Input({className, ...props}: InputHTMLAttributes<HTMLInputElement>)` (a plain styled
  passthrough — `RulesTree.tsx` and `FacetPanel.tsx`'s `RangeInputs` import it);
  `Button({variant?: "solid"|"ghost", type, className, ...props}:
  ButtonHTMLAttributes<HTMLButtonElement>)` (`EmptyState.tsx`); `TraitPill({name: string})`
  (`traits.tsx`); `ErrorChip({message: string})` (`nodes.tsx`); `ActionGlyph({cost: ActionCost})` +
  `normalizeActionCost(raw: string): ActionCost | null` + the `ActionCost = "1"|"2"|"3"|"reaction"|
  "free"` type (`actionGlyph.tsx`, which sits in front of gothic's normalizer with its own
  25-token AoN/Foundry vocabulary shim — that shim is untouched, only its import source moves).
  Every one of these is a small, self-contained function component — codex-owned drop-in
  replacements can match each signature exactly (§2 D29-46).
- **Four literal `gothic-card*` class usages to rename:** `nodes.tsx` (`gothic-card
  gothic-card-inset`, an embed aside), `statblock.tsx` ×2 (`gothic-card gothic-card-stat`),
  `entityPage.tsx` (`gothic-card gothic-card-prose`), plus `AttachedSidebars.tsx`'s own
  `gothic-card codex-attached-sidebar` (a fifth site the ui-map's grep undercounted — confirmed by
  reading the file directly).
- **`--font-mono` (from gothic's theme.css, "IBM Plex Mono") is codex's own stand-in for a
  "mechanical/statblock" voice already** — used at 10 `var(--font-mono)` sites in `globals.css`
  (omnibar input, the rules-tree quick-filter, statblock header rows, citation lines, license
  badges — none of them a genuine code/`<pre>` block; the 10 figure is the `var()` usage count,
  re-verified at adversarial-review time — a broader raw grep can show a couple of extra
  non-`var()` artifacts). This is exactly the slot the style-tokens doc's Oswald recommendation
  fills; §2 D29-46 repoints it rather than inventing a parallel token.
- **`getEntityPage` is already URL-addressable and returns the FULL `EntityPageData`** (`entity`,
  `embeds`, `knownTraitIds`, `embedCapHit`, optional `rulesNav`, optional `attachedSidebars`) — the
  split view's right pane (D29-49) calls this exact server fn, unmodified, so the right pane is
  content-identical to visiting `/{category}/{slug}` directly, never a trimmed projection.
- **`corpusFns.ts` is a 5-function, ~56-line module** (`getEntityPage`, `getCategoryDirectory`,
  `getCategoryListing`, `getRulesTree`, `getSourcesIndex`) — the split-view deep-link SSR (D29-49)
  adds no new server fn, it composes two of these existing ones in parallel from one route loader.
- **`@fontsource/ibm-plex-mono` is already a codex runtime dependency**, imported per-weight in
  `__root.tsx` (`/400.css`, `/500.css`) — the self-hosted-subset-weight pattern this phase extends
  to the new families already has a working precedent in this exact file, not a new idiom.

## 2. Locked decisions

Carried unchanged from P1–P4: C-1 public-noindexed · C-4 remaster-primary+legacy · D29-12
hermeticity · D29-22 URL scheme · D29-23 reader split · D29-30 telemetry/noindex ·
`content-visibility:auto` as the sanctioned long-list perf idiom (no virtualization dependency) ·
Decision I (SSR Compose service) · P4's tree/breadcrumb/pager/sources *derivation* (D29-39, 41, 43
— unchanged corpus-side logic; only edition-visibility plumbing and skin change, D29-48/50).

Continuing the ledger from P4's D29-45:

- **D29-46 Theme foundation (R2 theme policy, R6 style blast radius).**
  - New `src/styles/tokens.css`: the style-tokens doc's §1 palette (page-bg/ink/heading-maroon/
    gold-rule/gold-frame/callout-tan/callout-blue/pill-patron/pill-oxblood/pill-umber/pill-amber/
    link tokens) defined under the SAME custom-property names `globals.css` already consumes
    (`--color-void`→repointed to the parchment bg, etc. — **actual token NAMES are an
    implementer choice**; the binding constraint is that every `--color-*`/`--font-*` reference
    already in `globals.css` keeps resolving after `@astra/gothic/theme.css`'s `@import` is
    deleted from `__root.tsx`, with parchment values, not dark-void ones). Four font tokens:
    `--font-display` (Cinzel 700, H1 chapter titles only), a new `--font-heading` (Cormorant SC
    600, H2/H3 — the style doc's own reasoning for a second display face: Cinzel reads too heavy
    at H2/H3 sizes), `--font-body` (EB Garamond 400/400-italic/600/700 — chosen over Crimson
    Pro/Spectral per the style doc for its real small-caps + old-style-figure OpenType features),
    and **`--font-mono` renamed to `--font-condensed`** (Oswald 500/700, repointing the existing
    "mechanical voice" slot rather than adding a parallel token — all 10 current `--font-mono`
    call sites in `globals.css` are statblock/omnibar/rules-tree/citation UI text, never a
    genuine monospace/code block, so the rename is a pure find-and-replace across a file this
    slice already rewrites in full for the color swap).
  - **Alegreya SC (the style doc's recommended caption face) is explicitly DEFERRED, not
    shipped** — codex has no art-plate/illustration component consuming it (no scanned art in the
    corpus), so self-hosting a fifth family with zero consumers would be pure weight with no
    payoff. Flagged here as a surfaced trade-off (not a silent cut): if a future entity-portrait
    feature ships, add it then, one `@fontsource` package + a component, not before.
  - Self-hosted via `@fontsource` per-weight CSS imports in `__root.tsx`, mirroring the existing
    `@fontsource/ibm-plex-mono/{400,500}.css` two-file pattern verbatim: `@fontsource/cinzel/
    700.css`, `@fontsource/cormorant-sc/600.css`, `@fontsource/eb-garamond/{400,400-italic,600,
    700}.css`, `@fontsource/oswald/{500,700}.css` (8 weight files, 4 families — down from the
    style doc's 5-family plan by the Alegreya SC deferral above). `font-display: swap` verified
    per-file at S1 build time (an oxlint/grep gate over the emitted `@font-face` rules), not
    assumed. `@fontsource/ibm-plex-mono` itself is DROPPED (no longer referenced once
    `--font-condensed` repoints to Oswald and no other site used it directly).
  - **New `src/ui/` module — codex-owned drop-in replacements, EXACT prop-signature parity** with
    the five gothic imports enumerated in §1: `Input`, `Button` (`variant: "solid"|"ghost"` — solid
    = maroon fill, ghost = tan/quiet, mirroring gothic's own solid/ghost split), `TraitPill`,
    `ErrorChip`, `ActionGlyph`+`normalizeActionCost`+`ActionCost` (the `actionGlyph.tsx` AoN/Foundry
    vocabulary shim is untouched — only its import source moves to `src/ui/actionGlyph.ts`).
    Every current call site (`RulesTree.tsx`, `FacetPanel.tsx`, `EmptyState.tsx`, `traits.tsx`,
    `nodes.tsx`) re-points its import, no prop-shape changes downstream.
  - **`TraitPill`'s color-bucket mapping is a real, disclosed simplification from the style doc's
    4-bucket scheme.** The style doc's purple/oxblood-maroon/umber/amber buckets were derived from
    Færrin's own bespoke trait vocabulary (HOST/JUDGE/CHORAL/RELIGIOUS/…) with a hand-picked
    4th "mental/emotion/concentrate/archetype" maroon cluster that has no clean equivalent in real
    PF2e's trait taxonomy. `TraitPill` only ever receives `{name: string}` (no category), so the
    bucket must be derivable from the name alone: **codex ships a 3-bucket scheme** — rarity
    names (`common`/`uncommon`/`rare`/`unique`) → amber; the 4 casting traditions
    (`arcane`/`divine`/`occult`/`primal`) + the 4 alignment traits (`lawful`/`chaotic`/`good`/
    `evil`) → purple; everything else → umber. The maroon 4th bucket is dropped. A lookup table
    (`src/ui/traitBucket.ts`), unit-tested against all 12 named traits (4 rarity + 4 traditions +
    4 alignments) + a default-umber fallback.
  - `import "@astra/gothic/theme.css"` and the gothic package dependency itself are removed from
    `apps/codex/package.json`; every `gothic-card*` class (5 sites, §1) renamed to `codex-card*`,
    styled in `tokens.css`/`globals.css` under the parchment system (art-frame double-gold-rule
    notched-corner treatment per the style doc §3.4, applied to `codex-card-inset`).
  - Base-element re-skin: html/body background/ink, link color/hover/focus-visible per the style
    doc §4 (maroon link, gold-rule underline on hover, gold-frame focus ring — replacing the
    generic browser default, keyboard-nav stays in-voice).
  - The dark-theme pre-hydration script and both `suppressHydrationWarning` props on `<html>`/
    `<body>` in `__root.tsx` are deleted outright (R2 — parchment is the ONLY theme; confirmed by
    the ui-map's grep that `saved-theme`/`data-theme` has no other consumer anywhere in the app).
  - **Goldens regenerate here** (`render/goldens.test.tsx`'s 6 byte-exact HTML fixtures) — this is
    the FIRST of exactly two regenerations this phase (§4's standing rule): S1 for the skin, S5
    for the restyle-structure pass. Regenerate once per slice, never per commit.
- **D29-47 Global header nav + landing page (feedback #2/#3, R4).**
  - **The complete 88-category nav IA** (every real corpus category assigned to exactly one
    group; `article`/`sidebar`/`source` — the ui-map's "structural, not ordinarily browsable"
    categories — land in the catch-all rather than inventing a group for them):

    | Nav item | Kind | Categories | Count |
    |---|---|---|---|
    | **Player** | dropdown | `class`, `class-feature`, `class-kit`, `class-sample`, `ancestry`, `heritage`, `background`, `feat`, `archetype`, `animal-companion`, `animal-companion-advanced`, `animal-companion-specialization`, `animal-companion-unique`, `eidolon`, `familiar-ability`, `familiar-specific`, `bloodline`, `instinct`, `racket`, `muse`, `doctrine`, `methodology`, `hunters-edge`, `arcane-school`, `arcane-thesis`, `druidic-order`, `patron`, `mystery`, `lesson`, `research-field`, `tenet`, `way`, `element`, `conscious-mind`, `subconscious-mind`, `draconic-exemplar`, `deviant-ability-classification`, `cause`, `innovation` | 39 |
    | **Spells** | dropdown | `spell`, `ritual`, `domain`, `tradition` | 4 |
    | **Equipment** | dropdown | `equipment`, `weapon`, `weapon-group`, `armor`, `armor-group`, `shield`, `item-bonus`, `relic`, `set-relic`, `implement`, `siege-weapon`, `vehicle`, `campsite-meal` | 13 |
    | **GM** | dropdown | `creature`, `creature-family`, `creature-ability`, `creature-adjustment`, `creature-theme-template`, `hazard`, `weather-hazard`, `warfare-army`, `warfare-tactic`, `kingdom-event`, `kingdom-structure`, `apparition`, `cult-activity`, `curse`, `disease` | 15 |
    | **Rules** | direct link (`/rules`) + dropdown tail | tail: `condition`, `action`, `trait`, `skill`, `skill-general-action`, `category-page`, `language`, `style`; direct link is the `rules` category itself | 8 (+1) |
    | **Setting** | dropdown | `deity`, `deity-category`, `plane`, `epithet`, `hellknight-order` | 5 |
    | **Sources** | direct link (`/sources`) | none (an aggregate page, not itself a category — every book row links onward into filtered `/source` or `/{category}` browse per D29-43, unchanged) | 0 |
    | **Everything** | catch-all dropdown → the demoted directory index (below) | `article`, `sidebar`, `source` | 3 |

    Total: 39+4+13+15+8+5+3 = 87, +1 (`rules` itself, the direct-link category) = **88, exact.**
    Class-subsystem categories (bloodline/instinct/racket/muse/doctrine/methodology/hunters-edge/
    arcane-school/arcane-thesis/druidic-order/patron/mystery/lesson/research-field/tenet/way/
    element/conscious-mind/subconscious-mind/draconic-exemplar/cause/innovation/
    deviant-ability-classification) are bucketed under Player as character-building content
    rather than split into a 7th dropdown — a deliberate flattening (they're all single- or
    low-digit-count niche categories per P1's report; a "Kineticist Elements" dropdown item would
    be a group of one). Any stakeholder disagreement at H is a one-line reassignment in the nav
    data module, not a re-architecture.
  - **Nav data module** (`src/domain/nav/navData.ts`) — a plain, statically-typed array of
    `{label, kind: "dropdown"|"link", categories?: string[], href?: string}`, imported by the
    header AND by the "Everything" index page (so the grouping is defined exactly once). A
    conformance test asserts the module's category union equals the full 88-entry corpus category
    list (`facetKeys.ts`'s own category enumeration or an equivalent fixture-corpus-derived list)
    exactly — every category assigned, none twice, none dropped, mirroring `facetDefs.test.ts`'s
    own conformance-gate idiom.
  - **Header dropdown contract:** each dropdown is a disclosure triggered on click OR hover-intent
    (a short open-delay, no external hover-menu library — repo idiom, "keep it dependency-free");
    keyboard: `Tab` reaches the trigger, `Enter`/`Space`/`ArrowDown` opens and focuses the first
    item, `ArrowUp`/`ArrowDown` moves focus within, `Escape` closes and returns focus to the
    trigger, `Tab` out of an open menu closes it (native focus-trap-free, matching the "no
    headless-UI dependency" constraint from the scope doc's risks §7). **No-JS degradation:** each
    dropdown is real anchor tags inside a `<details>`/`<summary>` (or an always-rendered `<nav>`
    with CSS-only hover reveal as the implementer's choice) — a JS-disabled client can still reach
    every category's plain listing link, never a JS-only menu.
  - **The "Rules" hybrid (direct link + dropdown tail) is a SPLIT control (adversarial M4 — the
    uniform dropdown contract can't cover it; a `<summary>` cannot be an `<a>`):** the "Rules"
    label is a plain `<a href="/rules">`, with a separate small caret button immediately beside
    it as the disclosure trigger for the 8-category tail. Keyboard: the caret is its own tab stop
    following the link (Tab reaches the link, Tab again the caret, which then follows the
    standard dropdown keyboard contract above). No-JS: the link works natively; the tail
    categories remain reachable via `/categories`, so nothing is orphaned when the caret's
    disclosure needs JS.
  - **Landing page (`/`, R4):** the eight big tiles (Creatures · Spells · Feats · Equipment & Items
    · Classes · Ancestries & Backgrounds · Rules · Sources) as prominent linked cards under a
    front-and-center search input. **The hero search is a DISTINCT lightweight search box wired to
    the same memoized `pagefindClient` — NOT a second `<Omnibar>` mount (adversarial M3):**
    mounting `Omnibar` twice (header + hero) double-registers its global Ctrl/Cmd-K `document`
    keydown listener (verified in `Omnibar.tsx` ~L159–171 — a per-instance `useEffect`
    registration, not a singleton), so two instances would race for focus. The hero box shares
    `loadPagefind()`'s memoized module promise (so the runtime still loads at most once per page)
    but registers NO global hotkey of its own; Ctrl/Cmd-K remains the header Omnibar's alone. The
    hero wants bigger, tile-scale styling anyway — a distinct component is the simpler shape, not
    a compromise. The "every entity lives at `/{category}/{slug}`" blurb is deleted. Below the
    tiles: a quieter link to the demoted all-categories index.
  - **The old `/` `CategoryDirectory` throwaway moves to a new route, `/categories`** (the
    "Everything" catch-all's target + the landing page's "browse everything" link) — same
    `getCategoryDirectory` server fn and `CategoryDirectory` component, unchanged data shape, only
    the route file and its surrounding page chrome move. `render/listing.test.tsx` updates its
    route-path assertions accordingly; the component itself is untouched.
  - `ssrSmoke.test.ts` gains/updates assertions for the new header (dropdown markup present, every
    nav category href resolves), the new `/` (tile hrefs, search box present), and `/categories`
    (still lists every category).
- **D29-48 Edition/legacy rework (feedback #4, R3/R5) — SUPERSEDES P3's D29-32/-35/-36 legacy
  plumbing and P4's D29-40 toggle-subscription text; the underlying R5 semantics (hide
  `superseded` only, never `edition==="legacy"`) are UNCHANGED from the scope doc's precision
  note — only the mechanism and the param name change.**
  - **Deleted outright:** `domain/browse/legacyToggle.ts` in full (the module, its
    `useSyncExternalStore` trio, the module-eval-time URL-wins seed, the `codex:legacy`
    localStorage key), `__root.tsx`'s `LegacyToggleControl` + its `site-legacy-toggle` CSS class,
    and every `useLegacyToggle()` call site (`rules.tsx`, `$category/index.tsx`, `$category/
    $slug.tsx`, `Omnibar.tsx`, `SearchPage.tsx`, `RulesLayout.tsx` — the exact 7-file blast radius
    §1 confirmed).
  - **No replacement global/persisted preference exists.** Each surface's edition-visibility
    becomes a **plain per-page URL read**, default hide-`superseded` when absent — this is the
    direct consequence of "one edition control everywhere" (R3) meaning "the same *semantics* and
    *default*," not "one shared piece of client state." Concretely: `$category/index.tsx`'s
    `BrowseFilterState.legacy` (renamed `state.superseded`, §3) is set purely from
    `searchToFilterState(search)`, no `liveLegacy`/`hasHydrated`/resync-effect at all;
    `rules.tsx` and `$category/$slug.tsx` collapse to a bare `search.legacy === true` read (soon
    `search.superseded === true`) with zero `useState`/`useEffect` — **the M4 two-phase hydration
    seam is deleted, not adapted, at all FOUR sites carrying it** (adversarial M1: the three
    routes PLUS `domain/search/SearchPage.tsx`, which has the byte-identical
    `hasHydrated`/`liveLegacy` pattern at ~L69–94 — there the whole block is deleted outright
    along with the `legacy` field, since search never filters superseded at all under R3),
    because there is no second live source of truth left to race against SSR (the ui-map's own
    prediction, confirmed correct by this design). **`RulesLayout` GAINS a new `superseded` prop
    (adversarial M2 — today it has NO such prop; it calls `useLegacyToggle()` internally, so this
    is an ADDITION, not a rename)**, passed down by `$category/$slug.tsx` from its own computed
    URL-derived value.
  - **URL param renamed `legacy` → `superseded`** (values `1`/`true`, matching the existing
    `toBool` coercion helpers verbatim) — self-documenting parity with the internal
    `IndexRow.superseded`/`TreeNode.superseded` field name and Pagefind's own `filters.superseded`
    key, so one name means the same thing everywhere in the codebase, not just in the UI copy.
    **Back-compat (the scope doc's "map, one line" decision): `legacy=1`/`legacy=true` decodes as
    an ALIAS for `superseded`** at every validator that currently reads `legacy`
    (`urlState.ts`'s `validateBrowseSearch`, `rules.tsx`'s `validateRulesSearch`,
    `$category/$slug.tsx`'s `validateEntitySearch`) — if both are present, `superseded` wins; the
    encoder (`filterStateToSearch` and the two routes' own search-writers) emits ONLY `superseded`,
    never `legacy`, so shared links naturally migrate to the new name on the next in-app
    navigation. This is a pure rename with zero behavior drift for any existing shared link
    (including P4's own acceptance fixture, `rules/building-creatures@legacy?legacy=true`), which
    is why it's decode-forever, not a deprecation window.
  - **The confusing-checkbox root cause (feedback #4) is fixed at the UI-copy layer, not just the
    mechanism layer:** wherever a visible control exists (the browse filter drawer's Edition
    section, §2 D29-49; a small inline link on `/rules`, below), its label is explicit about what
    it does — default state reads "Current edition" / "Hide superseded"; widening reads "Include
    superseded content" — never a bare "Show legacy" checkbox with no indication that
    never-remastered legacy content is ALREADY visible regardless. **The explainer ships IN S3,
    not as an H-rejection fallback (adversarial M6 — the scope doc §7 explicitly warned a bare
    "Current edition" default label reads as a bug when never-remastered legacy rows remain
    visible):** the Edition drawer section's default state carries a one-line explainer, e.g.
    "Current edition — previous-edition content that was never remastered still shows; 'Include
    superseded' reveals replaced versions."
  - **The four hide-by-default call sites re-key from `legacy: boolean` to the identical
    `superseded: boolean` semantics** (no behavior change, pure rename): `filterEngine.ts`'s
    `matchesFilterState` (`if (!state.superseded && row.superseded) return false;` —
    `BrowseFilterState.legacy` renamed `superseded`), `treeModel.ts`'s `pruneForLegacy` (renamed
    `pruneForSuperseded`, same signature shape), `AttachedSidebars.tsx`'s `legacy` prop (renamed
    `superseded`), `pagefindClient.ts`'s `supersededFilter`/`searchUrlState.ts`'s
    `pagefindFilters` — **except search's own default flips, next bullet.**
  - **Search (Omnibar + `/search`) NEVER hides superseded content by default (R3's explicit
    carve-out — "search always covers both editions and badges results"), diverging deliberately
    from browse/rules/sidebars.** `pagefindFilters()`'s `if (!state.legacy) out.superseded =
    ["false"]` line is deleted outright, not renamed — search simply never sets a `superseded`
    filter. The `legacy: boolean` field is removed from `SearchPageSearch`/`SearchFilterState`
    entirely (dead code, since nothing reads it anymore). The pre-existing `edition` enum filter
    (an ordinary content facet sourced from `pagefind.filters()` counts, letting a user narrow to
    just "remaster" or just "legacy" results) is UNCHANGED — it was never the hide-by-default
    mechanism and stays exactly as P3 built it. Every result row keeps its edition pill (the
    "badges results" half of R3).
  - **`/rules`'s visible control:** D29-40's "no facet panel" stance is UNCHANGED (rules still has
    no facet drawer) — but a small inline link/toggle near the tree's quick-filter box ("Show N
    hidden (superseded) →", reusing the existing `codex-rules-hidden-note` microcopy class)
    toggles the `?superseded=1` URL param, giving a discoverable, visible control without
    inventing a facet panel. Clicking it is a plain navigate/replace, same mechanism the old
    per-book "N hidden" note already renders next to.
  - **Entity pages / attached sidebars keep ZERO visible control** (identical to today —
    `$category/$slug.tsx` never rendered one either): a superseded sidebar shows only when the
    entity page was reached via a `?superseded=1` link (carried forward from a browse/rules link,
    or hand-edited) — this is exactly today's behavior, unchanged, just renamed.
  - **Testing:** `legacyToggle.test.ts` deleted wholesale; the `legacy`-specific assertions in
    `filterEngine.test.ts`, `treeModel.test.ts` (`pruneForLegacy`→`pruneForSuperseded`),
    `pagefindClient.test.ts` (`supersededFilter`), `searchUrlState.test.ts` (deleted legacy-field
    assertions), `AttachedSidebars.test.tsx` are rewritten in place (same test *shapes*, renamed
    fields); a new decode test proves `?legacy=1` and `?superseded=1` are behaviorally identical on
    every affected route.
- **D29-49 Split-column browse + filter drawer (feedback #1, R1) — applies to every `/{category}`
  EXCEPT `rules`, which keeps P4's dedicated tree browser unchanged (its trail+sidebar+pager
  already gives an equivalent "context + content" experience; retrofitting a split view there
  would collide with that machinery, not improve it — an explicit scope boundary, not an
  oversight).**
  - **Right pane = the full entity render, unmodified `getEntityPage`/`EntityPageData`** (R1 —
    "same as the entity page," confirmed reusable verbatim per §1). `/{category}/{slug}` stays the
    canonical, directly-linkable single-entity URL for direct links and mobile (unchanged from
    D29-22).
  - **URL scheme: `?entry=<slug>` on the `/{category}` route** (alongside the existing facet
    params — `traits`/`level`/`rarity`/`book`/`edition`/`superseded`/`sort`/`f.*`/`q`, all
    untouched). `slug` is the raw corpus id segment (identical format to
    `/{category}/{slug}`'s own path segment, including `@legacy`/`-N` collision suffixes) —
    percent-encoded by the router exactly as any other param value.
  - **Row click (desktop/tablet, above the existing 56rem `.codex-browse-layout` breakpoint):**
    intercepts the click, calls `navigate({search: {...search, entry: row.id}})` — a plain,
    NON-`replace` push (so back/forward step entry-to-entry through visited rows, per the risk
    doc's "back/forward must restore selection"). The list pane does not re-fetch or re-render on
    selection change; only the right pane's content changes.
  - **Mobile (at/below 56rem): row tap is a full `<a href="/{category}/{slug}">` navigation to the
    canonical entity page**, no split-view/URL-state involved at all — the existing
    `BrowseListing.tsx` row-link markup is reused verbatim on mobile; only the desktop breakpoint
    intercepts clicks into split-view state. One component, one breakpoint-gated behavior branch,
    not two components. **Edition-context symmetry (adversarial M7):** when `state.superseded` is
    true, the mobile row anchor's href carries `?superseded=1` (only that param — facet state is
    meaningless on the entity page), so a user who widened to superseded content doesn't have
    that choice silently reverted on the entity page's attached sidebars; desktop already
    preserves it via the search spread. Covered by a row-href unit assertion in
    `BrowseListing.test.tsx`.
  - **Loader mechanics (adversarial B1/B2 — folded as one coherent design; both blockers are this
    one surface):**
    - **`loaderDeps` is REQUIRED, not optional:** the `/$category/` route must declare
      `loaderDeps: ({search}) => ({entry: search.entry})`. Verified against the pinned
      `@tanstack/router-core@1.171.14` source: without `loaderDeps`, the matchId for
      `/feat?entry=a` and `/feat?entry=b` is identical, the router reuses the cached match, and
      the loader NEVER re-runs on a row click — the right pane would be permanently stale. This
      is the single easiest way to build a broken-but-demo-passing version of this feature; it is
      pinned here so no implementer discovers it in production.
    - **With `loaderDeps` in place, the naive loader re-invokes IN FULL on every row click** —
      re-fetching the 8,485-row `getCategoryListing` payload over the network per click, a
      silently-expensive implementation the latency gates alone would not catch (B2). The pinned
      design: a **module-scoped, category-keyed client-side memo around the listing fetch**
      (mirror `pagefindClient.ts`'s memoized-module-promise idiom — the repo's existing pattern
      for exactly this "fetch once per page load, share across consumers" shape), so the loader
      is `Promise.all([memoizedListing(category), search.entry ? getEntityPage({category,
      slug: search.entry}) : null])`. On client row clicks only `getEntityPage` hits the network;
      SSR is per-request fresh as normal (the memo is module state, so a fresh document load
      never sees a stale listing).
  - **SSR / deep-link requirement:** with the loader above, a deep link with `search.entry`
    present server-renders the selected entity's full render in the right pane in the initial
    HTML — never a client-side-only fetch-after-mount flash (the same SSR-flash class P3's memory
    already caught for the legacy toggle).
  - **`entry` survives facet mutations (adversarial B3):** `filterStateToSearch` rebuilds the
    search object from `BrowseFilterState` alone and knows nothing about `entry` — without an
    explicit rule, any facet change/quick-filter keystroke/clear-all would silently strip
    `?entry=` and deselect the right pane (the same bug class the current code fixed for `legacy`
    with its explicit resync). The route's search-mutation path (the `onStateChange` handler)
    must preserve `entry` verbatim across every filter-state write — an analogous resync spread
    (`{...filterStateToSearch(next), ...(search.entry !== undefined ? {entry: search.entry} :
    {})}`), with a test asserting a facet change does not clear `entry`. Interplay with the
    fail-soft case is deliberate: a facet change CAN legitimately filter the selected entry out
    of the visible list — `entry` stays in the URL and the right pane shows the "not shown under
    current filters" state (below), never a silent deselect. "Clear all" clears FILTERS, not the
    selection.
  - **Unresolvable `entry` (filtered out by the current facet selection, or a genuinely unknown
    slug) fails soft:** the right pane shows an explicit "not shown under the current filters" /
    "not found" message, never a whole-page 404 — the listing itself still renders normally. This
    is the risk the scope doc's §7 flagged ("right pane should fetch-on-select... SSR of a
    deep-linked selection must render server-side") made concrete.
  - **Filter drawer:** a "Filters" button in the listing header opens a native `<dialog>` (no
    headless-UI dependency, native focus-trap + `Escape` + backdrop-dismiss for free) containing
    the UNMODIFIED `FacetPanel` section tree (§1 confirms zero section-level changes needed — only
    the container around it changes from `<aside>` to `<dialog>`). An active-filter pill summary
    row renders ABOVE the list, outside the drawer, one pill per active dimension (a new pure
    helper `activeFilterPills(state): {key, label, onRemove}[]`, unit-tested) plus a "Clear all"
    action (`clearAllFilters()`, existing). Opening the drawer never mutates `BrowseFilterState` —
    it shows whatever the URL already encodes, including the sanctioned default (Edition section
    pre-showing "Current" per D29-48); closing (Esc/backdrop/an explicit "Done" button) is purely
    dismissive since every facet change already writes straight to the URL live, same as today.
  - **Perf gate carried forward, re-measured fresh:** the split view must stay smooth at feat's
    8,485 rows (the corpus's largest category) — `content-visibility:auto` on the list pane stays
    the sanctioned idiom; the right pane's render cost is identical to today's entity-page cost
    (same component, same data). S6 measures row-click-to-right-pane-paint latency alongside the
    existing filter-interaction number. **`contain-intrinsic-size` re-tune (adversarial M5):**
    the current `contain-intrinsic-size: auto 400px` placeholder (globals.css) was tuned for
    today's wide single-column listing — the split view's narrower list column wraps
    `.codex-listing-row`'s 5 inline fields onto more lines, inflating real section heights past
    the placeholder and causing scroll-anchor jank that a paint-latency gate never catches. S4's
    gate re-measures/re-tunes the placeholder against the actual split-view column width and
    asserts scroll-position stability (scroll deep into the feat list, expand/collapse letter
    sections don't jump), not just paint latency.
  - **Testing:** `BrowseListing.test.tsx` gains split-view render assertions (row click updates
    `entry`, breakpoint-gated mobile fallback incl. the M7 `?superseded=1`-carrying href); a new
    URL-codec round-trip test for `entry` (independent of the facet params, since it's addressed
    by a plain string, not a Set/Map); a test asserting a facet change does NOT clear `entry`
    (B3); `ssrSmoke.test.ts` gains a deep-linked `?entry=` fixture-corpus case.
- **D29-50 Page-surface restyle sweep (the S5 slice — applying D29-46's tokens/components to
  every remaining surface P4.5 hasn't already touched structurally).**
  - Entity pages: statblock header row (name + type/level tag in `--font-condensed`, the ◈
    action-diamond glyph per the style doc §3.5, full-width hairline rule beneath), trait pill row
    immediately below, bold-label stat lines (label in `--font-body` bold, value regular — "bold =
    mechanical label, italic = narrative emphasis," style doc §3.8), tan/blue callout treatment
    reused for existing flavor-vs-mechanical-aside distinctions codex already renders (asides,
    embed cards), gold double-line notched-corner frame on `codex-card-inset`.
  - `/rules` tree + trail + pager: book section headers get the maroon/gold heading treatment,
    edition/license pills restyled (unknown-license treatment stays, D29-39), the breadcrumb trail
    reuses the style doc §3.9 "chapter breadcrumb" typographic treatment repurposed as a
    "you are here" trail (per the style doc's own "Keep" list — position/treatment ported, literal
    page numbers dropped).
  - `/sources`: book rows restyled per the style doc §3.10 table convention (bold header row, thin
    gold rule under the header only, zebra tint on alternating rows using the callout-blue hue at
    low opacity, no cell borders) — a direct, named port, not a new invention.
  - `/search` + Omnibar: parchment input/dropdown chrome, result rows carry the same trait-pill/
    edition-pill treatment as browse listing rows (visual parity across the two "list of entities"
    surfaces).
  - Citation/footer treatment: the existing `Citation` component and `site-foot` restyle in the
    parchment voice; no structural change to what they render (D29-24/citation logic untouched).
  - **Goldens regenerate a SECOND time here** (the phase's other sanctioned regeneration point,
    §4) — this pass changes markup structure (statblock row layout, callout wrapping), not just
    color, so it is a distinct regen from S1's.
- **D29-51 Testing (repo idiom carried from every prior phase — explicit fixtures + structural
  asserts, no snapshot library beyond the existing byte-exact goldens).**
  - Every rewritten-in-place test file (§ D29-48/-49's own testing bullets) stays green under the
    SAME fixture corpus D29-44 built — no fixture regen needed for this phase (frontend-only,
    scope §8) except the two golden regenerations already called out.
  - New: nav conformance test (88-category union, D29-47), dropdown keyboard/no-JS Playwright
    checks, `activeFilterPills` unit tests, the `entry` URL-codec round-trip, the
    `legacy`↔`superseded` alias decode test, a font-loading smoke (every `@font-face` emits
    `font-display: swap`), `traitBucket.ts` unit tests (all 12 named traits + default fallback).
  - `ssrSmoke.test.ts` is the single broadest-churn file this phase touches — every slice except
    D29-48 (which is mostly hook/state deletion) adds or moves assertions here (new header markup,
    new `/`, new `/categories`, the split-view deep-link case, the restyled surfaces' presence).
    Treat it as touched by every slice's gate, not owned by one.
- **D29-52 Telemetry.** SSR spans free (D29-30, unchanged — `createSsrServer`'s
  `initTelemetry("astra.codex")` call site is untouched by a frontend-only phase). **No new RUM
  events** for drawer-open, row-select, or nav-dropdown interactions — carrying forward P3/P4's own
  "facet/tree interactions are not instrumented, noise, revisit only on stakeholder ask" posture
  verbatim; `codex.search`'s existing counter is untouched (search's own filter/query telemetry is
  orthogonal to this phase). S6's acceptance sweep re-verifies `astra.codex` spans are healthy on
  the reworked routes via a local OTLP smoke (the standing pattern — SigNoz MCP tools, not curl).

## 3. Deliverables (by component)

**`src/styles/`** — `tokens.css` (new), `globals.css` rewritten (color/font swap in S1, structural
restyle in S5), the 8 self-hosted font-weight imports in `__root.tsx`.
**`src/ui/`** (new) — `Input.tsx`, `Button.tsx`, `TraitPill.tsx` + `traitBucket.ts`, `ErrorChip.tsx`,
`actionGlyph.ts` (moved, not rewritten) + its re-exported `ActionCost` type.
**`src/domain/nav/`** (new) — `navData.ts` (the 88-category grouping table), `HeaderNav.tsx` (the
dropdown island), its conformance test.
**`src/routes/`** — `__root.tsx` (header replaced with nav + landing-friendly search entry point,
dark-theme script removed), `index.tsx` rewritten (R4 tiles), new `categories.tsx` (the demoted
directory, ex-`/`), `$category/index.tsx` rewritten (split-view + drawer + `loaderDeps`/memoized-listing loader,
edition-URL collapse), `$category/$slug.tsx` (edition-URL collapse + now passes its computed
`superseded` value into `<RulesLayout>` as that component's NEW prop — split-view right-pane
reuses this route's own render path unmodified), `rules.tsx` (edition-URL collapse + the inline
superseded link),
`search.tsx`/`sources.tsx` untouched structurally (styling only).
**`src/domain/browse/`** — `legacyToggle.ts` deleted; `filterEngine.ts` (`legacy`→`superseded`
rename), `urlState.ts` (`legacy`→`superseded` alias-decode + `entry` support), `FacetPanel.tsx`
(zero logic change, new container only), `BrowseListing.tsx` (split-view row-click + breakpoint
branch, drawer container, active-pill summary), `EmptyState.tsx` (re-import from `src/ui`).
**`src/domain/search/`** — `Omnibar.tsx`/`SearchPage.tsx` (drop `useLegacyToggle`, drop the
default-hide-superseded query), `searchUrlState.ts` (`legacy` field removed), `pagefindClient.ts`
(`supersededFilter` — kept as a pure helper, no longer called by default).
**`src/domain/rules/`** — `treeModel.ts` (`pruneForLegacy`→`pruneForSuperseded`), `RulesTree.tsx`
(prop rename, restyle), `RulesLayout.tsx` (GAINS a new `superseded` prop replacing its internal
`useLegacyToggle()` call — an addition, not a rename; restyle).
**`src/domain/render/`** — `AttachedSidebars.tsx` (`legacy`→`superseded` prop), restyle sweep across
`nodes.tsx`/`statblock.tsx`/`entityPage.tsx`/`traits.tsx`/`actionGlyph.tsx` (import re-point +
class rename).
**`README`** — the restyle/token policy, the nav IA table (or a pointer to `navData.ts`), the
edition-param rename + back-compat note, the split-view URL contract.

## 4. Slices (each CI-green, committed, conventional)

Standing rule carried from P4: goldens regenerate **exactly twice** across this whole phase (S1,
S5) — never per-commit. Hermeticity re-proven at S6 only (no fixture-corpus change needed
mid-phase; this is a frontend-only rework, scope §8).

- **S1 — theme foundation (D29-46).** New tokens, fonts, `src/ui/` component set, drop the gothic
  import + dependency, class renames, base-element/link restyle, dark-theme script removal. Gate:
  `render/goldens.test.tsx` regenerated and reviewed (diff is color/font only, not structure);
  `render/totality.test.tsx` still zero-error across all 88 fixture categories; a repo-wide grep
  proves zero remaining `@astra/gothic`/`gothic-card` references in `apps/codex/src`; font-loading
  smoke (every new `@font-face` has `font-display: swap`); site renders parchment end-to-end on
  the OLD layout (header/facet-sidebar/flat-listing unchanged structurally — this slice is skin
  only). Must NOT touch: routing, the legacy toggle, browse/nav/landing logic.
- **S2 — header nav + landing page (D29-47).** `navData.ts` + conformance test, `HeaderNav.tsx`,
  `__root.tsx`'s header swap, `/` rewritten to the R4 tiles (incl. the distinct hero search box,
  M3), new `/categories` (the demoted directory). **The new header RETAINS the functional
  `LegacyToggleControl` in its utility area (adversarial M8 — the toggle must never have an
  invisible-but-active window between slices); S3 deletes it.** Gate: the nav conformance test
  (88/88, no duplicates/gaps); a Playwright keyboard sweep opens/closes every one of the 6
  dropdowns via keyboard alone, plus the Rules split control (link tab stop, then caret tab
  stop, M4); exactly ONE Ctrl/Cmd-K listener is registered on `/` (the header Omnibar's — the
  hero box registers none, M3); a JS-disabled fetch (no browser JS execution) still resolves
  every category's plain link from the rendered HTML; `/categories` still lists all 88; the 8
  landing tiles link correctly; `ssrSmoke.test.ts` updated for the new shell. Must NOT touch: the
  legacy toggle's MECHANISM (`legacyToggle.ts` and its consumers stay working as-is), browse/facet
  logic, entity-page rendering.
- **S3 — edition rework (D29-48).** Delete `legacyToggle.ts` + its 7-file import blast radius
  (incl. the header control S2 deliberately retained); rename `legacy`→`superseded` across
  `filterEngine`/`urlState`/`treeModel`/`AttachedSidebars`/`pagefindClient`/`searchUrlState`;
  collapse the M4 two-phase read at all FOUR affected sites (`$category/index.tsx`,
  `$category/$slug.tsx`, `rules.tsx`, `SearchPage.tsx` — adversarial M1) to a bare URL read (at
  `SearchPage.tsx`, delete the block outright along with the `legacy` field); delete search's
  default-hide-superseded query entirely; add the `/rules` inline superseded link; ship the
  Edition drawer section's default-state explainer copy (M6); add the `legacy=1`↔`superseded=1`
  alias-decode; pass the new `superseded` prop into `RulesLayout` (M2). Gate: a real-corpus spot
  check on `rules/building-creatures@legacy` (the P4 acceptance's own 100%-superseded fixture)
  via BOTH `?legacy=true` and `?superseded=1` — byte-identical HTML either way; a browse listing
  with `?superseded=1` shows superseded rows, absent shows only current (unchanged semantics); a
  search for **"magic missile"** returns the superseded legacy spell WITHOUT any param (search's
  always-both carve-out — `spell/magic-missile` verified against the real corpus:
  `edition: legacy`, `remasteredAs: ["spell/force-barrage"]`, i.e. superseded; also P3 S4's own
  legacy search case, so the term is already proven findable); a grep proves zero remaining
  `hasHydrated`/`liveLegacy` occurrences across all FOUR collapsed sites; zero hydration errors.
  Must NOT touch: split-view/drawer markup, nav, restyle.
- **S4 — split-column browse + filter drawer (D29-49).** The row-click/breakpoint branch in
  `BrowseListing.tsx`, the `entry` URL param + codec, the `loaderDeps` + memoized-listing
  deep-link loader (B1/B2), the `entry`-preserving search-mutation resync (B3), the `<dialog>`
  drawer container around the unmodified `FacetPanel`, `activeFilterPills`. Gate: a fresh
  (no-storage-state) deep link to `/feat?entry=fireball` (or an equivalent real slug) SSRs the
  right pane server-side (raw pre-JS HTML contains the entity's rendered body, not just the
  list); clicking a row updates `entry` without a full navigation and browser back restores the
  prior selection; **clicking a row issues NO `getCategoryListing` network request, only
  `getEntityPage` (B2 — assertable via a fetch-spy in the Playwright/test harness)**; a facet
  change does not clear `entry` (B3); mobile viewport (below 56rem) makes row taps full-navigate
  to `/{category}/{slug}` instead, carrying `?superseded=1` when widened (M7); an `entry` naming
  a slug hidden by the current filter selection shows the "not shown under current filters"
  state, not a 404, **and a genuinely unknown slug shows the "not found" state with the listing
  still rendering (N3 — both fail-soft branches gated)**; feat's 8,485-row list stays responsive
  (filter-interaction latency measured, plus new row-click-to-paint latency, plus the
  `contain-intrinsic-size` re-tune/scroll-stability check against the actual split-view column
  width, M5). Must NOT touch: `/rules` (explicitly excluded from split-view), nav, edition
  semantics (already landed in S3).
- **S5 — page-surface restyle sweep (D29-50).** Statblock/callout/pill restyle on entity pages,
  `/rules` tree/trail/pager restyle, `/sources` table restyle, `/search`+Omnibar restyle,
  citation/footer restyle. Gate: goldens regenerated a second time (structural diff reviewed);
  the gold-frame/notched-corner art-frame component renders on `codex-card-inset`; a real-corpus
  spot check across a statblock entity (`creature/red-dragon-adult`), a feat with `actionCost`
  (any real reaction feat), the `/sources` page (zebra rows), and `/search` (pill-styled results)
  — all in the new visual language; zero hydration errors.
- **S6 — acceptance sweep.** Full Playwright zero-hydration-error pass across every route this
  phase touched (§5 below), fresh weight/perf numbers vs the P4 baselines, telemetry spot-check
  (local OTLP smoke), hermeticity both lanes (`data/` renamed out of tree, same holdout convention
  P3/P4 used), README updates, then **H re-runs** (the consolidated stakeholder review, now
  covering P2+P3+P4's carried-forward items plus all five P4.5 surfaces).

## 5. Acceptance criteria (P4.5 exit gate)

All measurements (F) and smoke checks (G) run against the **production build** (`pnpm build` +
`pnpm start`, curl/repeated-timing against the real server) — never `vite dev`, which serves
neither `/pagefind` nor `staticMounts` (the standing P3 S2 finding).

- **A (S1).** Theme foundation: goldens regenerated + reviewed (color/font diff only); zero
  `@astra/gothic`/`gothic-card` references remain (grep-provable); `render/totality.test.tsx`
  zero-error across all 88 categories; font-loading smoke green; old layout renders correctly in
  the new skin.
- **B (S2).** Nav: 88/88 category conformance; keyboard-only dropdown sweep passes on all 6
  dropdowns; a no-JS fetch resolves every category link from rendered HTML; `/` shows the 8 R4
  tiles + search; `/categories` lists all 88; `ssrSmoke` green on the new shell.
- **C (S3).** Edition rework: the `building-creatures@legacy` spot check byte-identical under
  `?legacy=true` and `?superseded=1`; browse/rules/sidebar hide-by-default correct with the param
  absent vs present; a search for **"magic missile"** returns the superseded legacy spell with NO
  param present (badge visible, not filtered — `spell/magic-missile` verified superseded against
  the real corpus, `remasteredAs: ["spell/force-barrage"]`); zero `hasHydrated`/`liveLegacy`
  occurrences remain across all four collapsed sites incl. `SearchPage.tsx` (grep-provable); zero
  hydration errors.
- **D (S4).** Split view: a fresh-session deep link to a real `?entry=` slug SSRs the right pane
  (raw HTML contains the entity body pre-JS); row click updates `entry` and back/forward restores
  selection; **clicking a row issues NO `getCategoryListing` network request, only
  `getEntityPage`** (fetch-spy-provable, B2); a facet change preserves `entry` (B3); mobile
  breakpoint full-navigates instead (carrying `?superseded=1` when widened, M7); BOTH fail-soft
  branches proven — a filtered-out `entry` shows "not shown under current filters" and a
  genuinely unknown slug shows "not found," the listing rendering normally in both cases (N3);
  feat's 8,485 rows stay responsive under filter-interaction, row-click-to-paint, and the M5
  scroll-stability check.
- **E (S5).** Restyle: goldens regenerated a second time and reviewed (structural diff); the
  gold-frame art-frame component renders; the four named real-corpus spot checks (statblock, an
  `actionCost` feat, `/sources`, `/search`) render in the new visual language; zero hydration
  errors.
- **F.** Perf/weight recorded fresh, **compared against the P4 S5 baselines named explicitly**:
  `/rules` (was 393,058 B raw/78,044 B gz), `/sources` (was 696,918/63,869), the heaviest
  attached-sidebar host (was 378,215/77,866 at `rules/building-creatures@legacy`), tree
  interaction latency (was avg 35.0 ms) — plus NEW numbers this phase introduces: a representative
  `/{category}` split-view page's full response bytes, row-click-to-right-pane-paint latency, and
  the landing page (`/`) response bytes. No silent regression past the named baselines — a real
  increase (fonts + nav chrome + split-view markup will add weight) is expected and must be
  reported, not hidden; a disproportionate one (order-of-magnitude, not incremental) is a stop.
- **G.** Telemetry + hermeticity: `astra.codex` spans healthy on every reworked route via a local
  OTLP smoke (record which, per the standing pattern); fresh-clone hermeticity simulation green
  both lanes (`data/` renamed out of tree); zero hydration/console errors across the FULL S6
  Playwright sweep (every route this phase touched, one shared listener, per the P4 S5 precedent).
- **H.** THE consolidated stakeholder review — re-running with the reworked UI in front of the
  stakeholder, covering: the carried-forward P2 spot-set (M7 links-not-inlined + M11
  statblock-twice, still expected behaviors); P3's browse/search (the Pagefind single-common-word
  ranking limitation, still a documented limitation, not a bug); P4's surfaces (rules tree,
  hierarchy nav, attached sidebars, `/sources`) now in the new skin; and **all five P4.5 rework
  items** — (1) the global header nav, (2) the landing page, (3) the edition-facet-only
  visibility model (checkbox gone), (4) the split-column browse + filter drawer, (5) the full
  parchment restyle. Exit = sign-off → `octo:spec` P5 (deploy).

## 6. Risks / adversarial notes

- **The R5 facet-labeling trap (carried from the scope doc, now concrete):** even with honest
  copy ("Current edition" vs "Include superseded"), a never-remastered legacy-edition row staying
  visible under the DEFAULT state can still read as a bug to a user who expects "current" to mean
  "only remaster." Mitigation is the exact UI copy pinned in D29-48 PLUS the one-line explainer
  in the drawer's Edition section, which **ships in S3** (adversarial M6 — no longer held back as
  an H-rejection fallback). If H STILL flags confusion after both, the next step is a copy
  iteration, never a semantics change (R5 is locked).
- **Split-view double-render weight (carried, now bounded):** the right pane reuses the FULL
  `getEntityPage` payload (embeds, rulesNav-shaped data for non-rules categories is always
  `undefined` so no waste there, attached sidebars) on top of the listing's already-full
  `IndexRow[]` payload — S6's fresh weight numbers (criterion F) are the actual measurement; the
  sanctioned trim if it offends is loader field-narrowing on the LISTING side (never the entity
  render itself, which must stay full per R1), same posture P3's own risk note took for enriched
  rows.
- **Font weight creep, bounded but not eliminated:** 4 families / 8 weight files (down from the
  style doc's 5-family plan via the Alegreya SC deferral) still adds real weight over today's
  2-file `ibm-plex-mono` baseline — S6's F-gate is where this gets caught, not assumed safe.
- **Goldens churn twice, by design** (S1 skin, S5 structure) — regenerate once per slice, never
  per commit, per the standing rule; a THIRD unplanned regeneration mid-phase is a signal something
  in S1–S4 touched rendering structure it shouldn't have (S1/S4 are scoped to be structure-neutral
  for exactly this reason).
- **The nav IA's Player-bucket flattening (§2 D29-47) is a judgment call, not a measured
  classification** — unlike the corpus-derived facet/category-group work in P1–P4, there is no
  "coverage ≥40%" style test to validate a nav grouping against; H is where the stakeholder either
  accepts the 39-category Player bucket or asks for a finer split, and `navData.ts`'s flat array
  shape makes that a small diff, not a rearchitecture.
- **`?entry=` interacting with facet state:** an `entry` naming a real slug that the CURRENT facet
  selection filters out is a real, expected state (not a bug) — the fail-soft "not shown under
  current filters" message (D29-49) is the mitigation; a temptation to silently widen the filters
  to "find" the entry would make the URL lie about what's actually selected and must be resisted.
- **Nav dropdowns are new hydration surface** (an SSR'd, keyboard-managed disclosure) — S2's own
  gate is a dedicated keyboard/no-JS Playwright sweep for exactly this reason, not folded silently
  into the general zero-hydration-error sweep.
- **The row-click/mobile-breakpoint branch in `BrowseListing.tsx` is genuinely new interactive
  code** (§1 confirmed today's rows are plain anchor tags with no intercept) — treat it with the
  same scrutiny as any first-time client-side navigation-interception in this app; a missed
  `preventDefault`/breakpoint-check class of bug is the likeliest regression here, not a filter
  logic bug (that surface is untouched by D29-49).
- **Adversarially re-verified claim classes (do not re-litigate at build time):** the two
  reviewers POSITIVELY re-verified, against source, (a) the five gothic component prop signatures
  quoted in §1 (`Input`/`Button`/`TraitPill`/`ErrorChip`/`ActionGlyph`+`normalizeActionCost`) and
  (b) the 88-category nav IA table in §2 D29-47 (zero drift against `data/corpus/`) — build
  agents can treat both as ground truth.
- **Standing (carried from every prior phase):** keep the linguist-commit timer stopped across
  commit windows (the P4 S3 incident); `routeTree.gen.ts` flap → restore from HEAD if only-noise;
  oxlint `no-danger`/`no-array-index-key` overrides need explicit additions for any new file
  rendering trusted HTML or keying stable corpus arrays; never watch the GHA run to completion
  after pushing.

## 7. Out of scope (P4.5)

P5 deploy (Caddy host, Compose unit, robots.txt/X-Robots-Tag) — unchanged, next phase, gated
behind this phase's H re-run. Any corpus/transform/ingest change (the emit layer is untouched;
frontend-only except test fixtures, which need no regen this phase). gothic lib changes (R6 — the
other astra frontends keep gothic exactly as-is; only codex drops it). Entity-page CONTENT changes
(M7 links-not-inlined + M11 statblock-twice stay as-is unless H re-raises them — this phase changes
how entity pages LOOK, never what they say). Split view on `/rules` (explicitly excluded, D29-49 —
the tree/trail/pager machinery already gives equivalent context+content UX). A persisted
cross-page edition preference of any kind (D29-48 — deliberately deleted, not replaced). Alegreya
SC / any art-plate caption component (deferred, D29-46, until a consuming feature exists). Search
gaining a superseded-hiding control (R3 — search never hides by default; out of scope to add one).
Pagefind reindexing (no record-schema change this phase — `superseded`/`edition` are already
indexed fields; the distinction "reindex only if the record schema itself grows a field" is
recorded here explicitly since it's the standing gotcha from P3/P4's own memory). A curated,
hand-tuned nav taxonomy beyond the flat grouping in §2 (H can request a re-split; not preemptively
built finer than the flat 7-group scheme). i18n.

## 8. Build record (grows per slice)

- **S1 (`4831fec`) — parchment theme foundation (D29-46).** New `src/styles/tokens.css`, four
  self-hosted font families (Cinzel/Cormorant SC/EB Garamond/Oswald, 8 weight files,
  `--font-mono` repointed to `--font-condensed`), the codex-owned `src/ui/` component set
  (`Input`/`Button`/`TraitPill`+`traitBucket.ts`/`ErrorChip`/`ActionGlyph`) as exact
  prop-signature drop-ins for the five gothic imports, `@astra/gothic` dropped from
  `package.json` and every `gothic-card*` class renamed `codex-card*`, the dark-theme
  pre-hydration script + both `suppressHydrationWarning` props deleted. Goldens regenerated
  (first of the phase's two sanctioned regenerations).
- **S2 (`a5e448c`) — global header nav + landing page (D29-47).** `src/domain/nav/navData.ts`
  (88-category IA table) + conformance test, `HeaderNav.tsx` (6 dropdowns + the split Rules
  control), `__root.tsx`'s header swap (legacy toggle RETAINED per D29-47's own instruction,
  deleted next slice), `/` rewritten to the R4 eight-tile hero + distinct hero search box
  (sharing `pagefindClient.ts`'s memoized loader, registering no hotkey of its own), new
  `/categories` (the demoted directory, same `getCategoryDirectory`/`CategoryDirectory`).
- **S3 (`28b4392`) — edition rework (D29-48).** `legacyToggle.ts` deleted whole + its 7-file
  blast radius; `legacy`→`superseded` rename across `filterEngine`/`urlState`/`treeModel`/
  `AttachedSidebars`/`pagefindClient`/`searchUrlState`; the M4 two-phase hydration seam
  collapsed to a bare URL read at all four sites (`$category/index.tsx`, `$category/$slug.tsx`,
  `rules.tsx`, `SearchPage.tsx` — the last deletes its whole `hasHydrated`/`liveLegacy` block
  + the `legacy` field outright, since search never hides superseded by default); `RulesLayout`
  gains the new `superseded` prop; `legacy=1`/`legacy=true` alias-decodes forever; the `/rules`
  inline "Show N hidden" link added; the Edition drawer's default-state explainer copy shipped.
- **S4 (`fccee40`) — split-column browse + filter drawer (D29-49).** `BrowseListing.tsx`'s
  row-click/breakpoint branch, the `entry` URL param + codec, `loaderDeps` (B1) +
  `listingClient.ts`'s module-scoped category-keyed memo (B2), the `entry`-preserving
  facet-mutation resync (B3), the `<dialog>` filter drawer around the unmodified `FacetPanel`,
  `activeFilterPills`, both fail-soft branches ("not shown under current filters" / "not
  found"), the `contain-intrinsic-size` re-tune (400px→640px, M5) for the split view's
  narrower list column.
- **S5 (`8505e17`) — restyle sweep (D29-50).** Statblock header/trait-pill/stat-line restyle,
  tan/blue callout treatment, gold-frame notched-corner `codex-card-inset`, `/rules`
  tree/trail/pager restyle, `/sources` zebra table, `/search`+Omnibar chrome, listing row
  pills (perf-gated against the S4 baseline — no regression), citation/footer restyle. Goldens
  regenerated a second time (the phase's other sanctioned regeneration, structural diff this
  time, not just color).
- **S6 (2026-07-15, sonnet engineer + orchestrator review) — acceptance sweep.** Real
  production server (`pnpm build` + `pnpm start`), real 46,192-entity corpus, the repo's
  pinned Playwright resolved from `apps/vellum-render`'s installed copy (the repo's standing
  pattern — no new devDependency). One real bug-adjacent finding, not a product bug: my first
  split-view "real slug" pick (`feat/aasimars-mercy`) turned out to be itself a superseded
  legacy feat (`remasteredAs: ["feat/celestial-mercy"]`) — its `?entry=` deep link correctly
  rendered the "isn't shown under the current filters" fail-soft state by design (superseded
  hidden by default), not a bug; re-picked a genuinely current feat
  (`feat/a-home-in-every-port`) to prove the SSR-deep-link-renders-the-body case cleanly. No
  other bugs found or fixed this slice — S1–S5's own gates already covered the surface area.

  **A.** Carried from S1 (§8 above) — zero `@astra/gothic`/`gothic-card` references
  (grep-provable, re-confirmed at HEAD); goldens reviewed; not re-run structurally.

  **B.** Carried from S2 (§8 above) — 88/88 nav conformance, keyboard/no-JS sweep; not
  re-run (no route/nav logic touched since).

  **C.** Carried from S3, fresh real-corpus proofs at HEAD: `rules/building-creatures@legacy`
  under `?legacy=true` vs `?superseded=1` — both take a pre-existing TanStack Start
  search-param canonicalization 307 to the same final `?superseded=true` URL, confirmed
  **byte-identical** (414,846 B each, diff only in the per-request loader timestamp embedded
  in the hydration payload). A search for **"magic missile"** with no param surfaces
  `spell/magic-missile` (`edition: legacy`, `remasteredAs: ["spell/force-barrage"]`, i.e.
  superseded) with its edition pill visible — confirmed live via Playwright (client-only
  `/search` can't be curl-verified). Zero `hasHydrated`/`liveLegacy` occurrences repo-wide
  (grep-provable). Zero hydration errors.

  **D.** Fresh Playwright proofs against the production server, real corpus: a fresh-context
  deep link to `/feat?entry=a-home-in-every-port` (a genuinely current, non-superseded feat)
  SSRs the full entity body pre-JS (`codex-entry-pane-content` present in the raw response,
  `curl`-verified). Row click updates `?entry=` via a client-side push (no full navigation);
  browser back restores the prior selection (verified: URL after `goBack()` matches the URL
  after the first click). **B2 measured precisely:** the very first client-side loader
  invocation on a fresh page load (unavoidably coincident with the first row click, since
  that's the first time `loaderDeps` changes) issues one `getCategoryListing` fetch alongside
  its `getEntityPage` fetch — this is `listingClient.ts`'s own documented "fetch once per page
  load" memo populating for the first time, not a per-click cost; the 2nd and 3rd row clicks
  on the SAME page load issue `getEntityPage` alone (fetch-spy-verified via
  `page.on("request")`, matching `_serverFn` hash IDs). A facet-state change (toggling a
  Rarity checkbox) preserves `?entry=` verbatim (B3, verified). Mobile viewport (390×844)
  row tap fully navigates to the canonical `/{category}/{slug}` URL, carrying
  `?superseded=1` (normalized to `?superseded=true`) when widened (M7, verified). Both
  fail-soft branches proven server-side: `?entry=` naming a real slug the current filters
  exclude renders "isn't shown under the current filters" with the listing intact (843 rows
  still rendered); a genuinely unknown slug renders "wasn't found in feat." with the listing
  unaffected. Scroll-stability: rapid-scroll to 40,000px deep into feat's 8,485-row list holds
  position exactly (0 px drift) under the re-tuned `contain-intrinsic-size: auto 640px` (M5).

  **E.** Carried from S5 (§8 above) — goldens reviewed structurally; not re-run (no restyle
  logic touched since).

  **F.** Measured at HEAD (`curl` raw+gz against the production server, real corpus), vs the
  P4 baselines: `/rules` 401,257 B raw / 79,339 B gz (was 393,058/78,044, +2.1%/+1.7%);
  `/sources` 705,112/64,978 (was 696,918/63,869, +1.2%/+1.7%); the heaviest attached-sidebar
  host, `rules/building-creatures@legacy` at its canonical post-redirect URL
  (`?superseded=true`), 414,846/80,424 (was 378,215/77,866 under `?legacy=true`, +9.7%/+3.3%)
  — every increase tracks the new fonts/nav chrome/restyle markup, none disproportionate (no
  order-of-magnitude jump). New this phase: `/` (landing) 12,204 B raw / 2,991 B gz;
  `/feat?entry=a-home-in-every-port` (full split-view response) 5,814,711/536,873 (the
  listing alone, no entry, is 5,795,488/532,301 — the right pane's entity render adds
  ~19 KB raw / ~4.6 KB gz on top); first-paint font payload on `/` is 4 woff2 files /
  70,532 B total (only the weights used above the fold: Cinzel 700, Oswald 500, Cormorant SC
  600, EB Garamond 400 — the other 4 weight files load on demand elsewhere). Row-click-to-
  paint latency (production build, 6 sequential clicks on `/feat`): 324.7 ms cold (first-ever
  click, includes the one-time B2 listing warm-fetch) then 51.2/49.0/64.5/66.6/64.9 ms warm,
  avg ~59 ms excluding the cold sample. Filter-interaction latency (toggling a Rarity
  checkbox, 5 samples): 124.3/109.3/81.9/118.9/121.6 ms, avg 111.2 ms — consistent with
  S4/S5's own measured range (61–148 ms), no regression. Tree interaction latency unchanged
  from P4 (not re-measured — P4's tree/trail/pager mechanics are untouched by this phase).

  **G.** Telemetry method (per the acceptance criterion's "record which"): a local OTLP
  smoke, the same method P4 S5 used — a throwaway driver script (not committed, deleted after
  use) calling `initTelemetry("astra.codex", {endpoint: "http://localhost:10353"})`
  explicitly BEFORE `createSsrServer`'s own config.kdl-default (in-cluster-only) init — the
  `@astra/observe` module-singleton `state` guard makes the first call win — then real hits
  to `/`, `/feat?entry=aasimars-mercy`, `/categories`, `/search?q=magic+missile`, `/rules`,
  `/creature?entry=red-dragon-adult`. Verified via the `signoz_*` MCP tools: all six routes
  present as `SSR GET <route>` spans in the last 10 minutes, `responseStatusCode: 200` /
  `hasError: false` on every one (durations ranging ~4.1 ms for `/search` to ~391 ms for a
  cold `/feat`). Hermeticity: `apps/codex/data` renamed OUT of tree to system `/tmp`
  (`/tmp/codex-data-holdout-p45s6`, never an in-tree rename) — BOTH lanes green with it
  absent: TS (`vp run -r typecheck`, `oxlint --type-aware --deny-warnings`, `format:check`,
  `pnpm --filter @astra/codex test` — codex falls back to the fixture corpus with its own
  loud startup WARN, **73 files / 1,435 tests** — `vp run -r build`) and Python (`ruff
  check`, `ruff format --check`, `ty check`, `pytest`, 360 passed, all green). `data/`
  restored afterward; `manifest.json`'s `totalEntityCount` (46,192) and a `find`-based
  recount reconciled exact; codex's own suite re-run once more against the REAL corpus,
  still 73 files / 1,435 tests green. Zero hydration/console errors across the entire S6
  sweep (`/`, `/categories`, `/feat`, `/feat?entry=...`, `/spell`, `/spell?superseded=1`,
  `/creature?entry=...&superseded=1`, `/rules`, `/rules?superseded=1`, `/rules/
  counteracting`, `/rules/building-creatures@legacy?superseded=1`, `/spell/heal`, `/spell/
  magic-missile`, `/creature/red-dragon-adult`, `/sources`, `/search`, a mobile-viewport
  `/spell`, plus drawer-open + 3-row-click interactions on `/feat`) — one shared
  console/`pageerror` listener across every context, zero issues collected. A stray
  `apps/heartwood-frontend/src/routeTree.gen.ts` flap surfaced mid-sweep from an unrelated
  `vp run` invocation — restored from HEAD per the standing gotcha, not a codex change.

  **README** gains the "UX rework + bespoke restyle (P4.5)" section (parchment theme/fonts/
  `src/ui/`, header nav IA + `/categories`, the edition-param rename + forever-alias + the
  307-canonicalization note, split-view mechanics incl. `loaderDeps`/the memoized-listing
  B2 nuance/`entry`-preservation, the restyle sweep, the S6 weight/telemetry/hermeticity
  numbers).

  **Left for H (the consolidated stakeholder review):** everything P2+P3+P4+P4.5 built is
  now evidence-complete for one sign-off — the carried-forward P2 spot-set (M7
  links-not-inlined + M11 statblock-twice, still expected), P3's browse/search (the
  single-common-word Pagefind ranking limitation, still documented, not a bug), P4's
  surfaces (rules tree, hierarchy nav, attached sidebars, `/sources`) now in the parchment
  skin, and all five P4.5 rework items (global header nav, the landing page, the
  edition-facet-only visibility model, split-column browse + filter drawer, the full
  restyle) — plus the one operational note above (the `?legacy=`→`?superseded=` 307
  canonicalization hop) for the stakeholder's awareness, not a re-decision request.
