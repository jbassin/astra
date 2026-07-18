# codex.iridi.cc — enhancement & bug backlog (read-only sweep, 2026-07-18)

Live-site sweep via Playwright (desktop 1440/1920 + mobile 390). Cross-checked against
known/tracked items — P10 spec (statRow + size chip), the P9 register (Ctrl+F/Tab/ellipsis
trade-offs), M7/M11, the R10 UNCERTAIN abbreviations, and the deferred backrefs round are
NOT re-reported. Everything below is net-new signal. Screenshots in
the session scratchpad (ephemeral).

## P1 — visible data loss / high-traffic surfaces

1. **[BUG] Listing tables clip cell content site-wide — every numeric column is illegible.**
   Root cause measured on live: P9's fixed-layout measured-ch column widths do NOT include
   the 16px (8+8) cell padding. The Lvl column is 19px wide with 16px padding → ~3px content
   box → every level renders as "1..", "2..", "8.." (level 11 = "1..", level -1 = "-…").
   Same math clips Actions ("Passive"→"Passi…"), Type ("Ancestry"→"Ances…"), Size
   ("MED"→"M…"), creature HP/AC ("287"→"2…"), equipment Bulk, and the edition-icon column
   (16px = exactly the padding → 0px content box, glyph half-drawn). Affects every category,
   every viewport. Fix: include padding (border-box) in the measured widths; extend the P9
   real-browser drift-guard to pin column *content* fits, not just row height.
2. **[BUG] Listing table width is fixed (617px) regardless of viewport** — at 1920px the
   pane has ~400px of unused width while columns truncate. Let the table fill the pane
   (min-width guarantees + fluid name column).
3. **[ENH] Structured (Foundry-body) statblocks have the same stat-sprawl P10 fixes for AoN
   bodies** — e.g. `/creature/aapoph-granitescale` stacks Str/Dex/Con/Int/Wis/Cha then
   AC/Fort/Ref/Will/HP as ~10 single-item lines. P10 (D29-91) explicitly excludes Foundry
   bodies, so this survives P10. Render-side only: group ability mods on one wrapping flex
   line and AC/saves on another, reusing P10's `.codex-stat-row` CSS. No schema change.

## P1 — action category data quality (follow-up sweep)

3a. **[BUG] ~31% of the action category is nameless item-activations.** Corpus-counted
    (read-only): 2,466 of 8,050 action entities have names starting with "(" — AoN
    item-activation docs whose name IS the activation string ("(1 minute) envision,
    Interact", "(arcane, concentrate)"). They sort to the top of /action (the first
    screens are all of them), render context-free pages (the owning item appears only
    incidentally in body prose), and produce indistinguishable rows — four literally
    identical "(1 minute) envision, Interact (LOGB)" entries from four different items.
    No parent-item pointer exists in the docs, so the fix needs a decision: derive a
    display name from the owning item (join via AoN url adjacency?), re-bucket them out
    of action into an "activation" category, or drop them (their content already lives
    on the item pages). Stakeholder call.
3b. **[BUG] 24 action entities carry raw unrendered AoN templates in their NAMES** —
    `<%TRAITS%561%%>concentrate<%END>` and `<%ACTION.TYPES#3%%>` glyph templates leak
    into names AND slugs (e.g. `/action/traits-561-concentrate-end-…`; one Treasure
    Vault entity's name is a full sentence with glyph templates → a 150-char slug).
    Ingest gap: the AoN template grammar isn't applied to the name field.
3c. **[BUG] "Item Category: X" masthead pair leaks on multiple categories** — deity
    pages show "Item Category: deity", action pages show "Action Cost: 1 | Item
    Category: offensive". Internal AoN taxonomy; suppress the pair globally (supersedes
    the deity-only item #18 below).
3d. **[NIT] Action entity headers spell "Action Cost: 1" in text** — could render the
    P6 traced action glyph next to the title (house style already has the SVGs).

## P1 — default-empty categories (long-tail sweep)

3e. **[BUG] 10 nav-reachable categories render "0 of 0 shown / Nothing in this category
    yet." by default** — arcane-thesis, cause, conscious-mind, doctrine, implement, muse,
    racket, research-field, style, subconscious-mind. Every entity in them is legacy +
    superseded (their remaster counterparts were joined into class-feature, e.g.
    `doctrine/warpriest.remasteredAs → class-feature/warpriest`), the default view hides
    superseded, and listings have no reveal affordance (item #13). `?superseded=1`
    correctly reveals them, so only the surface is broken. Also the empty-state copy
    ("Nothing in this category yet.") is misleading — implies future content. Options
    (stakeholder call): show "N legacy entries hidden — show them" (reuse the /rules
    reveal pattern); redirect/merge these shells into class-feature browse; or drop the
    nav links for all-superseded categories.
3f. **[NIT] 8 more categories are thin (1–3 visible):** hunters-edge 1/4, lesson 1/13,
    mystery 2/12, patron 1/11 (same superseded dynamics) + epithet 1/1, apparition 1/1,
    animal-companion-unique 1/1, tenet 2/2 (data-faithful but the nav presents a
    category holding a single page — e.g. exemplar epithets/animist apparitions mostly
    live as class-feature docs). Fold into the 3e decision.

## P2 — search & findability

4. **[ENH] Omnibar results lack category labels.** "shield block" → 8 rows all titled
   "Shield Block", distinguishable only by book code — three "(PC1)" rows are fully
   identical. The /search page already renders "Feat · Lvl 1 · Common · PC1"; the omnibar
   dropdown omits the category/level meta. Add it to omnibar rows.
5. **[ENH] Class-feature results never name their owning class.** Even on /search, the three
   "(PC1) Class Feature · Lvl 1 · Common" Shield Block rows are indistinguishable (Fighter's
   vs Champion's vs …). Add an owning-class qualifier to class-feature search meta/titles
   (derivable from breadcrumb/parent data).
6. **[ENH] "Leads to…" nav text pollutes Pagefind excerpts** (Shield Block excerpt reads
   "…leads to... Bastion Dedication, Channeling Block…"). Mark the leads-to/related section
   `data-pagefind-ignore` and rebuild the index.
7. **[ENH] Filters dialog: Traits (224 pills, 1,637px of content) and Source (106 rows,
   2,837px) scroll inside 224px windows with no per-section type-ahead and no visible
   scrollbar/fade** — the cutoff after the "B" traits reads as end-of-list, so users may
   never discover traits C–Z. Add a mini filter input per big section + a scroll affordance.
8. **[BUG] Filter Source list is in arbitrary insertion order** (LOAC, APG, LOAG, BC, BotD,
   LOCG, CotT, COCA-ECPG, …) — unfindable at 106 items. Sort alphabetically or by count desc.
9. **[NIT] Rarity checkbox order is alphabetical (Common/Rare/Uncommon)** — use tier order
   Common/Uncommon/Rare.

## P2 — navigation & IA

10. **[ENH] Nav dropdowns clip at fixed max-height 384px with no scroll affordance** —
    Player menu shows ~12 of 39 items on a 900px viewport with room to spare; the menu just
    "ends" at Animal Companion Specialization. Viewport-relative max-height
    (`min(70vh, …)`) + visible scrollbar/fade, or multi-column layout.
11. **[ENH] /rules book headers are bare abbreviations** (BC, DA-R, LODM…) — full names are
    tooltip-only (dead on touch), and the 45-book order is opaque (PC1 sits 14th). Show
    visible full titles ("Battlecry! (BC)") and order deliberately (remaster cores first,
    then alphabetical) — /sources already renders full names, reuse it.
12. **[BUG] /rules quick-filter leaves every zero-match book header on screen** —
    "flanking" yields ~44 empty section headers around one real match. Hide books whose
    tree filtered to empty.
13. **[ENH] Superseded-reveal affordance is inconsistent.** /rules shows inline
    "Show 1,288 hidden (superseded) →", but category listings say "1,662 of 1,662 shown"
    while ~800 superseded spells are silently hidden (reveal only via Filters → Current
    edition). Add the same inline "Show N hidden" control to listings.

## P2 — crossref hover popovers (stakeholder-reported)

13a. **[BUG] Popovers can't be scrolled at all.** `.popover-inner` has `overflow-y: auto`
     + `max-height: 352px` (content e.g. 456px), so it *should* scroll — but both
     `.popover` and `.popover-inner` carry `pointer-events: none`, so the wheel never
     reaches the panel and the mouse can't enter it (moving toward it leaves the link
     and dismisses it). Long previews clip mid-sentence with no scrollbar or fade hint.
     Fix: enable pointer events on the panel + keep-open-while-hovering-panel (standard
     floating-ui hover interaction), plus a visible scroll affordance.
13b. **[BUG] Popover surface color is off-palette.** `.popover-inner` bg is
     `#E7D6B3` with a gold border `rgba(185,155,93,.4)` — a warmer, more saturated
     gold than the page parchment (`#EEE7D8`) and than the Filters dialog surface.
     Point it at the shared card/dialog surface token instead of its own hardcoded tan.
13c. **[ENH] Popover renders the full entity page verbatim in a 352px panel** — the
     display-size H1 eats a third of it, and the legacy-version pointer box + internal
     fields ("Valued: false" on conditions — same leak family as "Item Category") ride
     along. Add a compact popover variant: small title + type chip, skip the pointer
     box and internal-only masthead pairs.

## P2 — scrollbar theming (stakeholder-requested)

13d. **[ENH] Theme the scrollbars.** Verified: no `scrollbar-color`/`scrollbar-width`/
     `::-webkit-scrollbar` rules exist anywhere — all scrollbars are stock UA chrome,
     visually jarring against the parchment skin. Two layers: the standard
     `scrollbar-color: <thumb> <track>` (+ `scrollbar-width: thin` where wanted) on
     `:root` and inner scroll regions (Chrome 121+/Firefox), plus `::-webkit-scrollbar`
     `/-track/-thumb` fallback for older Chromium/Safari. Palette: track = page
     parchment, thumb = the tan/gold border family, hover = maroon accent. Apply to the
     page plus every internal scroll window (filter-dialog sections, nav dropdown menus,
     popover-inner, listing pane) — where an always-visible themed thumb ALSO serves as
     the missing scroll affordance flagged in items 7, 10, and 13a (one fix, two
     findings).

## P2 — header/title density (stakeholder-requested)

13e. **[ENH] Move the page title into the header, replacing the "codex" wordmark.**
     On listing pages the in-content title block (h1 "Equipment" + "5,110 of 5,110
     shown" + kbd hints + FILTERS) spends 120px before the table starts (y=207, header
     itself is 55px). Stakeholder wants the category title to replace the top-left
     "codex" wordmark instead of adding vertical space. Design decisions for the round:
     (a) the wordmark is the home link — keep a home affordance (small mark/glyph
     before the title, or title links home); (b) where the count line + FILTERS button
     land (fold count into the header next to the title vs. a slim bar above the
     table); (c) scope — listings only, or entity/rules pages too (entity pages have
     the same big in-content h1); (d) landing/search keep the wordmark. Reclaims
     ~40–60px above the fold on every listing, more if the count line folds in.

## P2 — nav curation (stakeholder-requested)

13f. **[ENH] Prune the header nav to curated high-traffic destinations; long-tail
     categories become link/search-only.** Codex's 8 menus expose ALL 88 categories
     (Player alone = 39 items), including the 10 empty shells (3e) and one-page
     categories (3f). Comparison evidence: **2e.aonprd.com**'s sidebar exposes ~30
     curated destinations in 9 icon groups (Ancestries · Archetypes · Backgrounds ·
     Classes · Skills · Companions · Familiars · Equipment + weapon/armor/shield
     splits · Feats + pre-filtered general/skill views · Afflictions · Creatures ·
     Hazards · Rules · Actions · Conditions · GM Screen · Player's Guide · Traits ·
     Sources) — its 90+ internal categories (bloodlines, doctrines, mysteries…) are
     reachable only via class pages and search. **5e.tools** (per the P8 study): 8
     role-keyed menus (Home · Rules · Player · DM · References · Utilities · Settings ·
     Help). Proposal: cut the dropdowns to a curated ~25–35 set mirroring AoN's list;
     demote everything else to `/categories` (already built as the full 88-directory),
     the omnibar (already indexes all categories), and in-context links (class pages
     link their own subsystems). The "Everything ▾" menu collapses to a single
     "All categories" link. Solves the nav half of 3e for free; direct URLs keep
     working for every category. Stakeholder explicitly OK with link/search-only
     reachability for the long tail.

## P3 — entity pages & polish

14. **[ENH] Cross-version pointer boxes render raw slugs as link text, site-wide, both
    directions** — "spell/heal@legacy (legacy version)" on remaster pages, "This is the
    legacy version. spell/heal" on legacy pages (same on feat/creature/rules/deity/trait).
    Render display names + book context: "Heal (Core Rulebook) — legacy version".
15. **[ENH] Long pages have no ToC and zero heading anchors.** /class/fighter = 14,300px,
    83 headings, no ids — sections can't be deep-linked or jumped to. Add stable heading
    ids + anchor links + a ToC rail (sticky or collapsible) for long documents (class,
    ancestry, long rules).
16. **[ENH] Trait pages are definition dead-ends** — /trait/healing defines the trait but
    offers no "browse everything with this trait" links (→ per-category `?traits=` browse
    or /search). Natural cross-nav; adjacent to but distinct from the deferred backrefs
    round.
17. **[BUG] Duplicate crossref links: Sarenrae's "Pantheons" lists "Cosmic Caravan" twice**
    with identical text AND identical href (/deity/cosmic-caravan) — likely a legacy/
    remaster pair collapsed by link repointing, or an upstream dupe. Dedupe identical
    adjacent crossrefs at render; check breadth via transform.
18. **[BUG] Redundant "Item Category: deity" line at the top of deity page bodies** — the
    header chip already says DEITY. A masthead pair that should be consumed/suppressed;
    check which other categories leak it.
19. **[NIT] "Hunters Edge" nav label missing its apostrophe** ("Hunter's Edge").
20. **[NIT] 404 page could offer a search escape hatch** — it's correct (real 404 status,
    Home link) but a "search for ‹slug›" link would be friendlier.

## Verified-fine (no action)
Landing + nav IA structure; filter pill/URL round-trip (`?traits=`, `?sort=`, `?q=`);
j/k slug-persisted browse + preview sync; split-view row click (no re-fetch jank felt);
mobile COMPACT tier (no h-scroll anywhere incl. statblock pages); mobile row-click →
full page; non-ASCII slug (`/creature/ixamè`); @legacy round-trip; sources page; DFS
pager on rules pages; source-cell tooltips; zero console errors/warnings across the
whole sweep (only the expected 404 resource error).

## Environment note
The Playwright MCP wanted Chrome at `/opt/google/chrome/chrome`; a symlink to the
installed Playwright Chromium (`~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`)
was created via docker-as-root and left in place for future sessions.
