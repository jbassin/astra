# 0029 — codex P4: rules/lore browser — spec

**Status:** FINAL (2026-07-14) — authored against the REAL corpus (46,192 entities / 88
categories; rules 3,645 · sidebar 689 · source 245 — measured this session, §1). Stakeholder
decisions batched + resolved 2026-07-14 (tree surface, legacy semantics, sidebar scope,
sources scope — recorded as D29-39..43 below). *Process note: no external octo providers on
this host; research + adversarial review ran on in-house agents (the sanctioned fallback,
P2/P3 precedent).*
**Adversarially reviewed same day: 3 blockers + 9 minors + 3 nits, ALL folded in.** The
blockers rewrote the reading-order model: (B1) raw AoN `next`/`previous` links are
**per-level sibling chains, not a page-turn chain** (0/3,642 next hops descend; 780 fork
targets — all ancestor/descendant pairs; 986 prev/next asymmetries; 106 cross-book hops) →
tree ordering = per-sibling-group restricted chain walks; (B2) the draft's "existing
url→aonId→finalId resolver" doesn't exist as one seam (S5d repoint is parse-time,
pre-finalId — it would mis-target collision-losing rules docs at scale) → dissolved by (B3):
the pager derives prev/next from the tree's **DFS order** (true page-turn), raw links are
used transform-internally for sibling ordering only, and no `readingOrder` entity field
exists at all. Plus the data-demanded pins: synthetic-node fallback rule + parent
tie-breaks, the two 100%-superseded books, the `pickCanonical` host-owner rule for shared
sidebar-host urls, book-level edition/license derivation (the Treasure Vault (Remastered)
release-date anomaly), the recalibrated D29-43 guard + the ~253-book "Other" expectation,
`/sources`-vs-`/source` relationship, CodexId reference convention, fixture ancestor-chain
completeness.
**Prerequisite:** P3 acceptance **H (the consolidated stakeholder review) is still pending**
— stakeholder-deferred. It folds into THIS phase's final stakeholder gate (P2-H spot-set w/
M7/M11 expected behaviors + P3 browse/search incl. the heal-ranking limitation + P4's
surfaces), unless cleared earlier.
**Scope doc:** `thoughts/shared/research/2026-07-12-codex-0029-thoughts.md` (C-1..C-8; the
P4 line: "rules tree from breadcrumbs + sidebar placement + sources index"; v1 "lore" =
rules + sidebars + entity-embedded flavor — full AP gazetteer prose was never in the corpus,
and `article` is citation stubs only, 107 docs).
**Prior specs:** P1 `0029-codex-p1-ingest-spec.md` (D29-1..21) · P2
`0029-codex-p2-entity-pages-spec.md` (D29-22..31) · P3 `0029-codex-p3-browse-search-spec.md`
(D29-32..38).
**Phase context:** P4 of 5 (P5 deploy remains). P4 adds the rules tree browser at `/rules`,
breadcrumb/reading-order navigation on rules entity pages, attached-sidebar rendering on all
categories, and a `/sources` index — plus the transform slice that feeds them. NO deploy
artifacts (P5).

## 1. Overview

Four surfaces on one transform slice: (a) **`/rules` becomes the rules tree browser**
(stakeholder: replaces the P3 faceted flat listing — rules is core-facets-only anyway;
book-scoped collapsible trees, akasha-Explorer lineage); (b) **rules entity pages** gain a
breadcrumb trail, a tree sidebar (codex's first sidebar column), and a previous/next pager
in the tree's own DFS (page-turn) order; (c) **attached sidebars render on their host pages
across ALL categories** (stakeholder) as styled asides; (d) **`/sources`** — a book index
grouped by product line with license/edition/counts, each book linking into filtered browse
(stakeholder: plus mechanical book-name normalization, no hand-curation). Feeding these,
S1 threads the already-parsed AoN `breadcrumbs` through join/emit, orders sibling groups
from the raw link chains, reverse-joins sidebar attachments, normalizes book names, and
emits two corpus artifacts: `rules-tree.json` + `sources-index.json`.

**Measured facts this spec is built on (2026-07-14, real corpus + raw AoN snapshot; the
adversarial pass independently re-measured every load-bearing number — do not re-derive):**

- **Rules category (canonical corpus):** 3,645 entities, 100% `proseOnly` → `facets` is
  `{}` on every one (categorically outside the facet pipeline — facets populate only on
  Foundry-merged entities, by design). Edition: 2,033 legacy / 1,612 remaster; superseded
  (`remasteredAs` non-empty) = **1,288/3,645 (35.3%)** — much legacy rules content was
  never remastered, BUT two books are **100% superseded**: Dark Archive 29/29 and
  Guns & Gears 65/65 (their "(Remastered)" twins carry the content) — those book sections
  are empty under legacy-off (D29-40 pins the rendering). `source.book` + `source.page`
  100% present. Slug collisions: 891 `@legacy`, 682 `-N`; 1,125 same-name groups (max 12).
- **Breadcrumbs (raw AoN `rules.json`, 3,645 hits):** field `breadcrumbs: string[]` of
  ANCESTOR names (own name = leaf, not included). Coverage 3,500/3,645 (96.0%); **the 145
  without are the tree ROOTS** — absence is a root marker, not a gap — but note **39 of
  the 145 are CHILDLESS single-node trees** (their name never appears as anyone's
  `breadcrumbs[0]`; e.g. Core Rulebook "Chapter 5: Feats", Battlecry! "Banners") — the
  tree builder must expect ~40 childless roots. Depth distribution 0→145 · 1→540 ·
  2→1,193 · 3→1,328 · 4→419 · 5→19 · 6→1 (max 6, modal 3). 80 distinct normalized
  bc[0]-derived roots across **45 books carrying rules docs**.
- **Trees are per-book, NEVER per-title:** generic chapter titles recur verbatim across
  books (`"Chapter 1: Introduction"` = 116 Core Rulebook + 109 Player Core docs). Scope
  every node by `(source.book, path)`.
- **Materializability: 99.7% by name-rule** — 975/978 distinct `(book, parent-name)` pairs
  used in breadcrumbs resolve to a real rules doc in the same book (a doc can be both a
  leaf and a parent — e.g. `Building Skirmish Encounters`). The 3 unmatched =
  synthetic-node cases: Divine Mysteries → "Gods & Magic", Player Core 2 → "Archetypes",
  Player Core 2 → "Chapter 3: Classes". The stricter path-prefix rule alone would mint a
  4th (Divine Mysteries "Rules Elements" — a real breadcrumb-less root doc whose 4
  children expect it at path `['Gods & Magic']`) → D29-39's fallback rule resolves it.
  **Parent ambiguity exists:** 2 duplicate `(book, name, path)` groups (APG "Backgrounds"
  `rules-1416/1427`, APG "Versatile Heritages" `rules-1414/1417`) — a pinned tie-break is
  mandatory for determinism.
- **Reading order (CORRECTED by the adversarial pass):** raw `next_link`/`previous_link`
  `{label, url}` exist on 3,642/3,645 (0 docs lack both; 3 lack `next` — High Seas chain
  tails; 3 lack `prev` — Core Rulebook heads), 100% of targets resolve via the link
  table's `byUrl`, all `/Rules.aspx`. **But they form per-level SIBLING chains, not a
  page-turn chain:** 0 next hops descend into a subtree (2,656 same-depth, 986 shallower
  "pop-ups"); 780 fork targets (2–4 docs — always an ancestor/descendant set — claim the
  same next); 986 `A.next=B ∧ B.prev≠A` asymmetries; **106 hops cross book boundaries**
  (Core Rulebook→Bestiary, Kingmaker→Impossible Lands, …). Interior sibling-group heads
  are targeted by NO next anywhere. Usable ONLY as within-sibling-group ordering; there
  is NO numeric page/sort field (page numbers live in `source_raw` strings).
- **Data wart (normalize or the tree forks):** 192 rules docs (all Gamemastery Guide
  "Chapter 2: Tools" — the dirt lives in children's bc[0] ×192 + "Building Creatures"
  bc[1] ×47) carry a literal `\r\n` INSIDE the breadcrumb string; 239 elements repo-wide
  contain `\r`/`\n`/`\t`. The real root doc (`rules-994`) is clean.
- **Edition path-shift is real:** a legacy↔remaster pair can change its breadcrumb path
  entirely (the affliction-Counteracting pair moved "Chapter 9: Playing the Game > General
  Rules" → "Chapter 8: Playing the Game > Afflictions") — never assume a remaster doc
  keeps its legacy tree position. The 4× Counteracting case = two independent
  legacy/remaster pairs, correctly cross-linked via `legacyOf`/`remasteredAs`.
- **Sidebars:** 689 corpus from 694 raw = 1 empty-name skip + 4 same-`(slug,url)` dedup
  drops. NO breadcrumbs and NO next/prev links (0/694) — the attachment mechanism is
  **the sidebar's own `url`, which IS its host page's URL** (plus a literal
  `**Parent page**` markdown line, 694/694). Host base-path split: `/Rules.aspx` 361 ·
  `/Ancestries.aspx` 127 · `/Classes.aspx` 61 · `/Archetypes.aspx` 55 · `/Actions.aspx`
  28 · `/Skills.aspx` 21 · long tail ~36. **All 693 named sidebars' hosts resolve to a
  living corpus entity** (none lost to the P1.5 drop pass); rules hosts 361/361; max
  sidebars per host = **7** (`/Ancestries.aspx?ID=41`, `/Rules.aspx?ID=995`). **65 host
  urls are SHARED by multiple corpus entities** (a class page's url is shared by its 60+
  class-feature docs; equipment parents share with tier children) — a naive `aonUrl`
  scan mis-attaches (measured: naive first-match yields 64 class-feature "hosts" vs the
  correct 60 class + 1); the link table's `pickCanonical` page-owner rule is the correct
  disambiguator. Sidebars: 0 `@legacy`, 222 `-N` collisions; superseded 229/689.
- **Sources:** corpus `source` category = 245 book entities (prose bodies; license OGL 154
  / ORC 91; edition legacy 155 / remaster 90; `remasteredAs` = 0 — books are never
  superseded). Raw `source` docs carry NO structured release/publisher/product-line
  fields (markdown-embedded prose only); `primary_source_category` is present on
  **43,684/43,684 AoN docs** (e.g. "Rulebooks", "Lost Omens", "Adventure Paths") — the
  product-line signal is total for AoN-cited books. `scripts/licenseMap.ts` = 243
  hand-verified book→license entries. **Corpus-wide `source.book` = 519 distinct strings
  — the UN-cross-normalized union of AoN spellings and Foundry publication strings**;
  **276/519 are Foundry-only** (no AoN citations at all — mostly PFS scenarios/APs); the
  conservative `"Pathfinder "+name` prefix rule merges **23** of them (408 entities),
  leaving **≈253 book strings (~49% of rows; 2,502 entities = 5.4%)** with no product
  line — the D29-43 "Other" bucket, expectation recorded. Case-fold dedup is currently a
  no-op (0 groups) — the rule ships anyway (cheap, future-proof). `source.page` coverage
  42,272/46,192 (91.5%). Doc-majority edition mislabels "(Remastered)" books whose
  `release_date` equals the original's (Treasure Vault (Remastered): 57 legacy / 12
  remaster docs) — book-level derivation needs the title override (D29-39).
- **Transform seam (verified in code):** `src/ingest/aonFacets.ts` ALREADY extracts +
  validates `breadcrumbs` into `AonDocMeta` (tested; commented "the P4 rules-tree input").
  It is parsed-and-discarded at exactly two sites in `src/ingest/join.ts` —
  `buildAonOnlyEntity` (the path all rules/sidebar/source/article docs take) and
  `buildMergedEntity` — neither reads `meta.breadcrumbs`. The `creature.family` threading
  (P3 S1) is the exact precedent. Additive optional fields need NO schemaVersion bump
  (`superseded`/`embeddedItems` precedent; stays 2). The identity-aware id map is pass-4's
  `aonIdToFinalId` (`join.ts:861-873`) — any url-keyed join that must survive collision
  suffixing goes `byUrl → aonId → aonIdToFinalId` as a **post-identity step** (the S5d
  parse-time repoint seam returns pre-collision ids and must NOT be used for P4 joins).
- **Frontend state (verified):** codex has NO sidebar column today — `__root.tsx` is
  header + single-column `<Outlet/>`; P4 introduces the first sidebar via a route-local
  layout component (NOT a `__root.tsx` retrofit). The repo's only tree-nav prior art is
  akasha's Explorer: its PURE parts port directly (the `ensureFolder`-style tree builder
  — akasha `site.ts:327` — and `explorerState.ts`'s `computeOpen` collapse logic:
  localStorage-persisted, prefix-of-current auto-open, SSR-safe two-phase
  `useState`-then-`useEffect` seeding, the same idiom as codex's own `legacyToggle.ts`);
  its build-time generated-module posture does NOT port (codex reads the corpus from disk
  at request time). `EntityPage` has zero hierarchy awareness. **Route shadowing verified
  safe both ways:** a static `/rules` route out-ranks `$category` in TanStack precedence
  while `/rules/{slug}` still falls to `$category/$slug` (`pathParamsAllowedCharacters:
  ["@"]` unaffected) — the D29-40 "implementer's choice" is genuinely free.

## 2. Locked decisions

Carried: C-1 public-noindexed · C-4 remaster-primary + legacy · D29-12 hermeticity ·
D29-22 URL scheme · D29-23 reader split (fs layer never imported by components; pure
resolvers injected with a `CorpusReader`) · D29-30 telemetry/noindex · D29-35 browse
mechanics (incl. `content-visibility: auto` as the sanctioned long-list idiom — no
virtualization dependency; the URL codec, whose `book` param + comma-escaping already
handles D29-43's filtered-browse links) · D29-36/37/38 as shipped · Decision I (SSR
Compose service).

Spec-level:

- **D29-39 Tree data model (transform, S1).**
  - **`CodexEntity` gains optional `breadcrumbs?: string[]`** (rules-only in practice),
    threaded through BOTH `join.ts` construction sites (the `family` precedent) — as a
    **top-level field, NOT via `facets`** (facets are Foundry-merged-only by documented
    architectural boundary; rules is 100% proseOnly). `IndexRow` is untouched (the tree
    ships as its own artifact; rows don't need breadcrumbs — no index-envelope growth).
    **NO `readingOrder` entity field exists** (adversarial B2/B3): raw `next`/`previous`
    links are consumed transform-internally for sibling ordering only; the entity-page
    pager derives from the tree's DFS order (D29-41).
  - **Normalization before any grouping:** trim + strip embedded `\r`/`\n`/`\t` + collapse
    internal whitespace runs on every breadcrumb element (the 192 CRLF "Chapter 2: Tools"
    child strings and 239 dirty elements) — same disease `normalizeBookName` already
    fixes for `primary_source`. Normalized at extraction; corpus stores normalized
    strings.
  - **New corpus artifact `data/corpus/rules-tree.json`** (sibling of `manifest.json`),
    Zod-validated at emit, deterministic, compact JSON:
    `{books: [{book, edition, license, hiddenWhenLegacyOff: number, nodes: TreeNode[]}]}`;
    `TreeNode = {name, id?, superseded?, children: TreeNode[]}` (`id` = CodexId — the
    repo's single reference convention, adversarial N13; absent ⇒ synthetic group node —
    **pinned at exactly 3** under the resolution rule below; growth is a report-visible
    STOP, not a silent acceptance). Node arrays are emitted in final order (DFS-ready);
    `canonicalJson` handles key order — array order is pinned by the ordering rule so
    determinism 3× holds.
  - **Parent resolution rule (with the adversarial-mandated fallback + tie-breaks):** a
    node's parent doc = the rules doc in the SAME book whose `name` == the parent
    breadcrumb element AND whose own breadcrumb path == the child's path minus its last
    element (path-prefix rule). Where that finds nothing, **fall back to name-only match
    within the book, preferring a breadcrumb-less (root) doc** — this resolves the
    Divine Mysteries "Rules Elements" case to its real doc instead of orphaning it.
    **All remaining ambiguity tie-breaks on lowest aonId** (pinned — the 2 duplicate
    `(book, name, path)` groups in APG otherwise make determinism flap). Still-unmatched
    parents → synthetic nodes (the pinned 3). Roots = the 145 breadcrumb-less docs
    (≈40 of them childless single-node trees — expected, not a bug) plus the synthetic
    roots.
  - **Ordering (REWRITTEN per adversarial B1 — raw links are sibling chains):** children
    at every level are ordered by the next-chain **restricted to that sibling group**:
    consider only next-links whose target is another member of the same group (match by
    aonId); the head = the member no other member targets; walk the chain; members not
    on the chain sort after chained siblings, alphabetical. NEVER walk raw links across
    levels or books (0/3,642 hops descend; 106 cross book boundaries; 780 ancestor/
    descendant forks). S1 reports per-book sibling-group chain coverage (% of groups
    fully chained) so ordering quality is visible. Books ordered remaster-first, then
    alphabetical within edition.
  - **Book-level `edition`/`license` derivation (adversarial M11 — books aren't
    entities):** edition = title ends `"(Remastered)"` → remaster, else majority of
    member docs' edition (the title override is load-bearing: Treasure Vault
    (Remastered)'s docs measure 57 legacy / 12 remaster off the shared release date);
    license = the `licenseMap`/source-entity lookup by normalized title; books absent
    from both (the Foundry-only strings) → `license: "unknown"` with an explicit
    unknown-pill treatment in every consuming UI (never a blank or a guessed OGL).
  - **Attached sidebars (all categories — stakeholder):** reverse-join every sidebar's
    own `url` to its host via **the link table's `pickCanonical` page-owner rule →
    `aonId` → pass-4 `aonIdToFinalId`** (adversarial M8 — 65 host urls are shared by
    multiple entities; naive `aonUrl` scans mis-attach class sidebars to class-features;
    `pickCanonical` also already demotes `sidebar` itself). **The HOST entity gains
    `attachedSidebars?: CodexId[]`**, ordered by sidebar name asc, tie-break aonId
    (sidebars carry no reading order — 0/694 have next/prev, adversarial N14). Report:
    attachment coverage per host category (689/689 hosts resolve — pinned; rules 361
    exact), max-per-host (expect 7). Unresolvable hosts would be report-visible; the
    sidebar keeps its standalone page regardless.
  - **Book-name mechanical normalization (stakeholder: mechanical only, no
    hand-curation):** a transform pass over ALL `source.book` strings — trim/CRLF/
    whitespace-collapse, case-insensitive dedup (currently a measured no-op — ships
    anyway; AoN spelling wins as display form), and the conservative prefix rule (a
    Foundry string equal to `"Pathfinder " + <an existing AoN book name>` merges into
    it — measured: 23 merges / 408 entities). The full before→after mapping table lands
    in `report.md` for review; the collapse of the 519 is recorded; residual splits
    ACCEPTED (a curated alias map is explicitly out of scope). **Site-wide blast radius
    acknowledged:** `source.book` feeds browse facets, search meta, and collision
    disambiguation — S1 rebuilds the search index (host) and the fixture corpus.
- **D29-40 `/rules` = the tree browser (stakeholder — the P3 faceted flat listing for
  rules dies).**
  - Route loader ships the `rules-tree.json` payload via a new serverFn
    (`getRulesTree` in `corpusFns.ts`; pure `resolveRulesTree` in a new
    `src/server/rulesTreeData.ts` — mirrors `directoryData.ts`; reader gains a
    `rulesTree()` capability with the same lazy-cache posture as `index()`). Static
    `/rules` route vs a `$category` branch is implementer's choice (both verified safe,
    §1).
  - UI: book sections (remaster-first, edition pill, license pill incl. the unknown
    treatment) each containing a collapsible tree; collapse state = the akasha
    `computeOpen` port — localStorage-persisted (`codex:rulesTree`), SSR-safe two-phase
    seeding (initial render from an empty saved-map, `useEffect` re-derives), pure logic
    in its own node-env module + tested; the island file carries the
    `@vitest-environment jsdom` docblock. Long-tree rendering uses
    `content-visibility: auto` on book sections (the D29-35 sanctioned idiom).
  - **Legacy semantics (stakeholder: the site-wide superseded predicate, unchanged):**
    toggle off hides only `superseded` nodes; legacy books REMAIN with their
    never-remastered content visible; each book section shows "N hidden" when non-zero
    (precomputed `hiddenWhenLegacyOff` per book). A branch whose descendants are all
    hidden collapses to nothing (parents with `id` stay if their own doc is visible).
    **Fully-superseded books (measured: Dark Archive 29/29, Guns & Gears 65/65) render
    as a collapsed section header with "all N hidden" — never silently dropped**
    (adversarial M7 — implementers must not guess). The toggle store is subscribed via
    `useLegacyToggle()` with the standing `hasHydrated ? live : search.legacy`
    first-paint read; `legacy=1` URL precedence per the M4 rule (unchanged machinery).
  - A name quick-filter input (client-side, over tree node names; matching nodes shown
    with their ancestor chain force-open) — NO facet panel (rules was core-only; search
    covers text lookup).
  - `/` directory: the rules row keeps pointing at `/rules` (count unchanged).
- **D29-41 Rules entity pages gain hierarchy navigation (S3).**
  - **Breadcrumb trail** above the entity header: book › ancestors › self; ancestor
    elements link to their doc's page when the node has an `id`, render as plain text
    when synthetic. Trail data resolved server-side (walk `rules-tree.json` for the
    entity's path) inside the existing `getEntityPage` flow — one serverFn, no second
    round-trip.
  - **Tree sidebar** — codex's FIRST sidebar column, introduced by a route-local layout
    component (`RulesLayout`) that ONLY rules routes import (`__root.tsx` untouched;
    every non-rules page keeps its single-column shell). Sidebar = the same tree island
    scoped to the current book, current doc highlighted, path auto-expanded
    (`isPrefixOfCurrent` port). Collapses to a disclosure on narrow viewports (match
    akasha's mobile posture; no new breakpoint system).
  - **Previous/Next pager (REWRITTEN per adversarial B3): derived from the tree's DFS
    pre-order within the book** — true page-turn navigation (next from a chaptered node
    descends INTO its subtree, unlike AoN's raw sibling links which skip it), symmetric
    by construction, never crosses a book boundary; one-sided at book ends. Server-side
    derivation from `rules-tree.json` in `getEntityPage` (no entity field). Pager
    targets carry name + edition pill. The legacy toggle does NOT re-chain the pager (a
    superseded neighbor still appears, edition-pilled — this is the book's order, not a
    listing; re-chaining would lie about the book).
- **D29-42 Attached sidebars render on host pages, ALL categories (stakeholder).**
  - `EntityPage` renders `attachedSidebars` after the body as styled `<aside>` cards
    (gothic aside treatment; title + full rendered body + citation + link to the
    standalone `/sidebar/{slug}` page, which remains canonical). Bodies are resolved
    server-side in `getEntityPage` (sidebars are small prose; measured max 7 per host).
    Sidebar asides do NOT recurse (not a thing in the data; guard anyway — render depth
    1 only).
  - Superseded interplay: an attached sidebar that is itself `superseded` follows the
    site-wide predicate (hidden when toggle off, with the host page's "N hidden" note
    reusing the listing microcopy).
- **D29-43 `/sources` index + book pages (stakeholder: index + mechanical normalize).**
  - New `/sources` route: all books grouped by **product line** — derived at transform by
    aggregating raw AoN `primary_source_category` per book (majority value across that
    book's citing docs; measured present on 43,684/43,684 AoN docs, so AoN-cited books
    classify totally). **Books with NO AoN citations (the Foundry-only strings) form the
    "Other" bucket — expected ≈253 books (~49% of rows) / 2,502 entities (5.4%), mostly
    PFS scenarios and AP volumes (adversarial M10 — expectation recorded, not
    discovered at build); "Other" renders LAST and collapsed by default.** The guard is
    recalibrated to what is measurable: if classified books cover <90% of ENTITIES, the
    fallback grouping is license+edition (recorded deviation, not a stop). Emitted as
    `data/corpus/sources-index.json` (book, productLine, license — incl. "unknown",
    edition, entityCount, sourceEntityRef?: CodexId), book-level edition/license per the
    D29-39 derivation rule.
  - Each book row: name, license pill (OGL/ORC/unknown), edition pill, total entity
    count, link to the book's own `source/{slug}` entity page (245 have one;
    sourceless books render without the link), and **per-category count links into
    filtered browse** (`/{category}` with the `source.book` core facet pre-selected via
    the existing D29-35 URL codec — no new filter machinery).
  - **Relationship to the existing `/source` category listing (adversarial M12,
    recorded):** BOTH remain — `/source` stays the faceted listing of the 245 book
    ENTITIES (P3 machinery, untouched); `/sources` is the aggregate index over all ~519
    normalized book strings incl. Foundry-only ones. The `/` directory keeps its
    `source` category row AND gains a distinct "Sources index" entry linking `/sources`
    (rendered beside the category groups, not inside them).
  - `/sources` is a plain server-rendered page (no island; ~500 rows →
    `content-visibility` on groups suffices).
- **D29-44 Testing (repo idiom — explicit fixtures + structural asserts).**
  - Tree-builder unit suite over crafted fixtures: the CRLF fixture (must NOT fork
    "Chapter 2: Tools"), the cross-book generic-title fixture ("Chapter 1: Introduction"
    ×2 books → 2 subtrees), the path-prefix parent rule + the name-only/root-preferring
    fallback (the Rules Elements shape) + the lowest-aonId tie-break (the APG duplicate
    shape), synthetic-node emission, **sibling-group chain ordering incl. an
    INTERIOR-level group** (heads untargeted within the group; unchained-member
    fallback; a fork/asymmetry fixture proving cross-level links are ignored), the
    childless-root case, the leaf-that-is-also-parent case, DFS pager derivation
    (descends into subtrees; one-sided at book ends).
  - Fixture corpus regen (`extract-fixture.ts` — gains artifact emission, new code
    sanctioned): must include a depth-≥3 rules doc **with its COMPLETE ancestor chain**
    (adversarial N15 — else the fixture tree is mostly synthetic nodes and the ssrSmoke
    trail assert only exercises the plain-text branch), one breadcrumb-less root doc, a
    legacy/remaster rules pair with DIFFERENT paths (the Counteracting class),
    attached-sidebar host+sidebar pairs in ≥2 host categories (incl. one shared-url
    host shape), a `source` entity; `rules-tree.json` + `sources-index.json` regen into
    fixtures so CI route/ssrSmoke tests exercise real shapes hermetically.
  - Filter/interaction: tree quick-filter logic node-env tested; collapse-state
    (`computeOpen` port) pure tests; serverFn resolvers tested against the fixture
    reader (D29-23 idiom); ssrSmoke adds `/rules`, a deep rules page (trail + sidebar +
    pager asserted in HTML), a host page with an attached sidebar, `/sources`.
  - Determinism 3× on the full transform (now incl. both new artifacts); file count ==
    manifest (the standing gate).
- **D29-45 Telemetry.** SSR spans free (D29-30). NO new RUM events — tree/pager/sources
  interactions are not instrumented (P3's facet-interaction precedent: noise; revisit
  only on stakeholder ask). `codex.search` counter untouched.

## 3. Deliverables (by component)

**Transform/emit (S1)** — breadcrumb normalize+thread (both join sites), sibling-group
ordering from raw link chains, `attachedSidebars` reverse-join (pickCanonical →
aonIdToFinalId), book-name mechanical normalization (+ mapping table in report),
`rules-tree.json` + `sources-index.json` emit + Zod schemas, report sections (tree stats,
synthetic-node count == 3, chain coverage per book, sidebar attachment coverage, book
collapse, product-line coverage), fixture regen, search-index rebuild (host).
**`src/server/`** — `rulesTreeData.ts`, `sourcesIndexData.ts` (pure resolvers),
`corpusFns.ts` gains `getRulesTree`/`getSourcesIndex`; `corpusFs.ts` reader gains
`rulesTree()`/`sourcesIndex()` cached artifact reads; `entityPageData.ts` gains trail +
DFS pager + attached-sidebar resolution.
**`src/domain/rules/`** — `treeModel.ts` (pure: build/filter/computeOpen port/DFS walk),
`RulesTree.tsx` (island), `RulesLayout.tsx` (the first sidebar layout), `BreadcrumbTrail`,
`ReadingOrderPager`.
**`src/domain/render/`** — `AttachedSidebars` aside component wired into `EntityPage`.
**Routes** — rules→tree (static `/rules` route or `$category` branch — both verified
safe), new `sources.tsx`, the `/` directory's "Sources index" entry.
**README** — tree model (incl. the sibling-chain reality), artifacts, normalization
policy, the host-only rebuild note.

## 4. Slices (each CI-green, committed, conventional)

- **S1 — transform: tree/order/sidebar/book data (lands first, transform-only).** D29-39
  in full. Gate: determinism 3×; file count == manifest; report pins — breadcrumb
  coverage 3,500 + 145 roots exact (≈40 childless), **synthetic-node count == 3**
  *(AMENDED at S1 build, 2026-07-14: measured == 2 and 2 is CORRECT — the pinned
  "Divine Mysteries → Gods & Magic" case never materializes: a real breadcrumb-less doc
  named "Gods & Magic" exists in the Gods & Magic book (`/Rules.aspx?ID=798`) and
  resolves its 5 children; "Gods & Magic" appears in Divine Mysteries only as PATH
  CONTEXT inside the Rules Elements children, which the fallback rule resolves to the
  real root doc. The §1 estimate counted every (book, parent-name) breadcrumb element,
  a coarser question than immediate-parent resolution. Verified against the raw
  snapshot by the orchestrator. The 2 = PC2 "Chapter 3: Classes" root + its child
  "Archetypes". Growth above 2 remains a STOP.)*, per-book sibling-group chain
  coverage reported, sidebar attachment 689/689 with rules == 361 and max-per-host == 7,
  book collapse 519→N with the full mapping table (prefix merges == 23 expected),
  product-line coverage with the "Other" bucket ≈253 books / 2,502 entities, book-level
  edition/license spot-checks (Treasure Vault (Remastered) → remaster; a Foundry-only
  book → unknown); fixture regen incl. the D29-44 composition; search index rebuilt on
  the host (page count still == manifest).
- **S2 — `/rules` tree browser.** D29-40 in full (reader capability + serverFn + island +
  quick-filter + legacy counts). Gate vs the REAL corpus: **an INTERIOR-level ordering
  assertion** (a GMG "Chapter 2: Tools" subsection sequence matches its sibling-group
  chain — adversarial B1's gate fix; the root-level Battlecry! chain rides along); the
  4× Counteracting docs land in their correct book/edition positions; "Chapter 1:
  Introduction" yields separate Core Rulebook and Player Core subtrees; "Chapter 2:
  Tools" is ONE root (CRLF healed); the 3 synthetic nodes render unlinked; a childless
  root renders as a single-node tree; legacy toggle flips visible counts with per-book
  "N hidden" correct AND Dark Archive/Guns & Gears render as "all hidden" collapsed
  headers; payload size + render latency measured (content-visibility applied); zero
  hydration errors.
- **S3 — rules entity-page navigation.** D29-41 in full (trail + `RulesLayout` sidebar +
  DFS pager). Gate: `rules/counteracting` shows trail Player Core › Chapter 8 ›
  Afflictions (its remaster path), sidebar auto-expanded to it; **the pager descends: a
  chaptered node's "next" is its first child (assert on a real GMG chapter), prev∘next
  round-trips, and a book head/tail renders one-sided**; a root doc renders as its own
  trail head; non-rules pages provably untouched (snapshot a spell page's shell
  structure); mobile disclosure works.
- **S4 — attached sidebars + `/sources`.** D29-42 + D29-43. Gate: a rules host page and
  an ancestry host page (the Azarketi "A Place Undersea" case) both render their asides;
  **a shared-url host attaches to the page owner, not a class-feature** (the M8 case,
  asserted); standalone `/sidebar/{slug}` still serves; a superseded attached sidebar
  hides under the toggle; `/sources` groups by product line with correct
  license/edition pills (incl. an unknown-license Foundry-only book) and counts, "Other"
  last + collapsed; a per-category count link lands on the correctly-filtered browse
  listing via the existing codec; the `/` directory shows both the `source` category row
  and the "Sources index" entry.
- **S5 — acceptance sweep + docs.** Consolidated Playwright pass over §5; hermeticity
  both lanes with `data/` renamed OUT of tree; README + memory updates; measurements
  recorded in this status block.

## 5. Acceptance criteria (P4 exit gate)

- **A (S1).** Transform gates green: determinism 3×, manifest-exact count, all report
  pins from S1's gate (roots/childless/synthetic==3/chain-coverage/sidebar/book-collapse/
  product-line numbers), fixtures carry the D29-44 composition, search index rebuilt
  clean.
- **B (S2).** The tree browser proves the real-corpus cases (INTERIOR-level order,
  Counteracting placement, cross-book title split, CRLF heal, synthetic nodes, childless
  root, the two all-hidden books) + legacy counts; quick-filter opens ancestor chains;
  collapse state survives reload (localStorage) without hydration errors.
- **C (S3).** Trail/sidebar/pager on real pages incl. the edition path-shift case; the
  pager's DFS semantics proven (descends, symmetric, one-sided at ends); non-rules
  routes structurally unchanged.
- **D (S4).** Attached sidebars on ≥2 host categories incl. the shared-url owner case;
  superseded-sidebar toggle behavior; `/sources` grouping/pills/counts (unknown license
  rendered), "Other" placement, a working filtered-browse link; book-collapse mapping
  table reviewed (in-report).
- **E.** URL/state: deep-linking a rules page in a fresh session reproduces trail +
  expanded sidebar; `/rules?legacy=1` reproduces the sharer's tree view (M4 precedence
  machinery unchanged).
- **F.** Perf/weight recorded: `/rules` full response bytes (raw+gz) + tree interaction
  latency; the heaviest attached-sidebar host page weight (a 7-sidebar host); `/sources`
  response bytes.
- **G.** Telemetry + hermeticity: `astra.codex` spans healthy on the new routes (local
  OTLP smoke acceptable — record which); fresh-clone simulation green both lanes; zero
  hydration errors across the S5 Playwright sweep.
- **H.** THE consolidated stakeholder review (now P2-H + P3-H + P4): the P2 spot-set
  (M7/M11 expected), P3 browse/search (heal-ranking limitation flagged), P4 tree/
  sidebars/sources. Exit = sign-off → `octo:spec` P5 (deploy).

## 6. Risks / adversarial notes

- **Book-name normalization has site-wide blast radius** — `source.book` feeds browse
  facets, search meta, and the collision-disambiguation render rule. Mitigations: the
  mechanical-rules-only posture, the full mapping table in `report.md` (reviewable
  artifact), fixture + search-index rebuild in the same slice. Previously-shared browse
  URLs carrying an old book string degrade to zero-match (the standing unknown-param/
  empty-state behavior) — accepted, noted here deliberately.
- **The raw link chains are the likeliest data snare even post-fold** — 780 forks / 986
  asymmetries / 106 cross-book hops are REAL raw-data shapes the sibling-group
  restriction must provably ignore (the D29-44 fork/asymmetry fixture exists for exactly
  this). Any temptation to "just follow next" resurrects blocker B1.
- **The parent fallback rule can over-match in principle** (name-only within book) — it
  fires only where path-prefix fails; S1 reports every fallback hit (expect exactly the
  Rules Elements family) so silent over-matching is visible.
- **`rules-tree.json` payload size is unmeasured** (3,645 nodes + names ≈ low hundreds of
  KB compact) — S2 measures raw+gz; the sanctioned trim if it offends is per-book lazy
  child loading via the existing serverFn (books collapsed by default already), NOT a
  new dependency.
- **The pager deliberately diverges from AoN's own next/prev** (DFS page-turn vs raw
  sibling-jump). Recorded intentionally: AoN's raw links skip subtrees, hop books, and
  are asymmetric — mirroring them would ship navigation that can't round-trip. If the
  stakeholder wants AoN-mirroring at the H review, that's a re-decision, not a bug.
- **The "Other" sources bucket is ~half the book rows by design** (253 Foundry-only
  strings, 5.4% of entities) — expectation recorded here + rendered last/collapsed; the
  H review should eyeball it knowing that.
- **The first sidebar layout must not leak into non-rules routes** — route-local layout
  component, `__root.tsx` untouched; S3's gate snapshots a non-rules page's shell to
  prove it.
- **Attached-sidebar body inlining grows host entity responses** — measured max 7 per
  host; S5 measures the heaviest host page; the sanctioned trim is title+link asides
  (bodies behind the standalone page), a recorded fallback, not a redesign.
- **Standing:** keep a clean index across the linguist-commit timer window;
  `routeTree.gen.ts` flap → restore from HEAD if only-noise; oxlint `no-danger`/`no-array-
  index-key` overrides need explicit additions for any new file rendering trusted HTML or
  keying stable corpus arrays.

## 7. Out of scope (P4)

Deploy artifacts (P5: Dockerfile/compose/caddy/robots + prod refresh flow for corpus AND
search index AND the new artifacts). The `article` category surfacing (107 citation stubs
— by scope-doc design). Any lore beyond rules+sidebars. A curated cross-provenance book
alias map (mechanical rules only — residual splits accepted). A Pagefind `book` filter.
Tree state in the URL beyond the current-doc auto-expansion. Re-chaining the pager under
the legacy toggle. Mirroring AoN's raw next/prev links in the pager (DFS-derived — a
recorded decision, §6). Numeric page-number parsing for ordering (the link chain is
sibling-scoped only). Hover cards on tree nodes. i18n.

## 8. Build record (grows per slice)

- **S1 (2026-07-14, sonnet engineer + orchestrator review).** All D29-39 deliverables;
  transform-only. Gate evidence: determinism 3× (`diff -r` empty, two rounds); manifest
  46,192 unchanged; breadcrumb coverage 3,645 docs → 146 roots (145 real + 1 synthetic),
  39 childless; **synthetic == 2 (amendment in §4 S1 — pin corrected from 3, verified
  against the raw snapshot)**; parent tie-breaks = 4 events (exactly the 2 pinned APG
  duplicate groups × 2 children); fallback hits = the Rules Elements family only;
  sibling chain coverage 43/45 books 100% (GMG 590/591, PC2 9/10); sidebar attachment
  689/689, rules == 361, max-per-host == 7; book collapse 519→496, prefix merges == 23
  (408 entities), case-fold no-op; Other bucket 253 books / 2,502 entities, classified
  coverage 94.6% of entities (≥90% guard holds); spot-checks green (Treasure Vault
  (Remastered) → remaster/ORC; all 253 Foundry-only books → license unknown; Dark
  Archive 29 + Guns & Gears 65 hiddenWhenLegacyOff). Fixture regen carries the full
  D29-44 composition (chapter-2-tools root → building-creatures@legacy (CRLF-healed) →
  ability-modifiers-2 depth-3 chain; counteracting-2/-4 path-shift pair; 2 host
  categories incl. the M8 shared-url shape with the class-feature asserted
  unattached; source/core-rulebook). Search index rebuilt on host, 46,192 pages ==
  manifest. Codex tests 1,226; both repo lanes green incl. hermeticity with `data/`
  out of tree. Notes for S2/S3: DFS pager helper deliberately NOT in S1 (frontend
  slice territory); fixture `rules-tree.json` sibling order is alphabetical-fallback
  only (no raw link side-channel survives fixture extraction) — chain-order
  correctness is proven by `rulesTree.test.ts` unit fixtures.
