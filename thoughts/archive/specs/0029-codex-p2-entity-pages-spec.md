# 0029 — codex P2: entity pages — NLSpec

**Status:** BUILT (2026-07-14) — all four slices committed + pushed same-day by the
staff-orchestrator + sonnet engineers, one reviewed commit per slice: **S6 `b174b15`** (P1.6
transform addendum, D29-19..21) · **S1 `031a7fb`** (total render layer + 6 goldens, D29-24..26)
· **S2 `72f224e`** (scaffold + corpus reader + entity routes, D29-22/23/30/31) · **S3
`c9d1d3b`** (listings + Popover tooltips + acceptance sweep, D29-27/28). **Acceptance A–G all
met with recorded evidence (see the S3 commit message + [[codex-0029-gotchas]]); ▶ H (the
stakeholder review of rendered pages) is the ONLY open item — the §5 C spot-set renders on
`pnpm dev`/`pnpm start` in `apps/codex` against the real corpus.** Post-S6 corpus: **46,192
entities** (−134 pregens); `blockquote` is corpus-extinct (17-of-18 kinds at corpus level; the
renderer stays total, unit-covered synthetically). Process deviation, orchestrator-sanctioned
under the autonomous-run directive: the S1 mid-gate "stakeholder eyeballs the goldens before
S2" was replaced by an orchestrator review; the goldens + the M7/M11 expected behaviors fold
into H instead.
_(Original status line:)_ FINAL (2026-07-13) — authored against the REAL post-P1.5 corpus
(46,326 entities / 627.7 MB, inspected this session), per the phase plan's "P2+ get specced
against the real corpus". Stakeholder decisions batched + resolved 2026-07-13 (URL scheme, statblock ambition,
delivery shape, tooltip scope — recorded as D29-19 + D29-22/26/27/28 below).
**Adversarially reviewed same day: 5 blockers + 7 minors, ALL folded in** (B1 actionGlyph
vocabulary — the corpus speaks AoN long forms `normalizeActionCost` can't parse; B2
block-nodes-inside-`<p>` via `localizedBoilerplate` → hydration mismatch class; B3 the
corpus-reader wiring/test seam was unimplementable as written; B4 fixture manifest missing; B5
the §9 npc-drop acceptance contradicted D29-14(a) for AoN-joined pregen twins; minors M6–M12
inline). Reviewer VERIFIED: every §1 corpus count exact; the 18-kind union matches `nodes.ts`;
facet field names match `entity.ts`; `@`/non-ASCII params round-trip on the pinned router;
crossref sample 86,536 → 0 missing targets; all 8,511 embed targets exist; all 6,325 npc docs
have `ac.value`, all 12,627 melee items have `bonus.value`; rules docs carry NO breadcrumbs
(the §7 P4 flag stands).
**Prerequisite:** P1 spec §9 **P1.6 addendum (slice S6, transform-only)** — D29-19 npc-only
creature import, D29-20 `stats` extraction (schemaVersion 2), D29-21 `_index.json` rename +
fixture indexes **+ fixture manifest (adversarial B4)**. P2's S1+ consume the post-P1.6
corpus/fixture; S6 lands first.
**Scope doc:** `thoughts/shared/research/2026-07-12-codex-0029-thoughts.md` (C-1..C-8).
**P1 spec:** `thoughts/astra/specs/0029-codex-p1-ingest-spec.md` (D29-1..21).
**Phase context:** P2 of 5 (P3 faceted browse+search · P4 rules browser · P5 deploy). P2 turns
the ingest-only member `apps/codex` into a real SSR frontend on the strider/site-kit template
(Decision I): per-entity pages for all ~88 categories, minimal throwaway listings so the site
is navigable, hover tooltips. NO search/facets (P3), NO rules-tree UX (P4), NO deploy (P5).

## 1. Overview

Render the canonical corpus as pages. One generic, total `CodexNode → React` renderer
(mirroring gothic's `mdastToReact.tsx` shape — DocumentView is vellum-AST-only and NOT
reusable) + bespoke stat/facet headers for the structured category groups (creature, hazard,
spell, equipment-family, feat), served by SSR routes that read entity JSON from disk at request
time (heartwood-frontend precedent — 46k files / 627 MB makes baked generated modules a
non-starter; akasha's own Dockerfile warns its baked-module approach caps out at its 115 MB).
Minimal A–Z category listings + a root category directory make every entity reachable by click
at P2 exit; akasha's Popover island pattern gives hover cards on crossrefs and trait pills.

**Corpus facts P2 is built against (inspected 2026-07-13, post-P1.5; §9/P1.6 shifts noted):**
88 category dirs; sizes p50 5.7 KB / p90 30.8 KB / p99 110.5 KB / max 809 KB (`spell/avatar`);
`proseOnly` ≈50%; empty `body` on 3,395 (creature 2,716 + hazard 675 — the P1.6 `stats` field
is what makes these renderable); `embeddedItems` on 7,658; `loreBody` on 77; legacy twins
7,152; postDrop brokenRef 530 + embedBroken 40 (render as plain text per D29-2, by design);
residual `-N` collisions 1,830 (both members render as distinct pages — P3 may disambiguate
listings); license `unknown` 159 (135 = carve-out creatures with book `"unknown"`, mostly
removed by D29-19); node-kind census: text 1.73M · paragraph 611k · crossref 493k · divider
96k · heading 80k · actionGlyph 44k · damage 11.7k · embed 11.7k · check 10.8k · list 10.3k ·
brokenRef 9.2k · localizedBoilerplate 7.2k · aside 5.7k · template 3.6k · inlineRoll 3.0k ·
inlineAction 2.1k · table 1.1k · blockquote 8 — all 18 kinds occur; the renderer must be total.

## 2. Locked decisions

Carried: C-1 public-noindexed · C-4 remaster-primary + legacy · D29-2 (the CodexNode union IS
the renderer contract; no `dangerouslySetInnerHTML` of source-derived content) · D29-3 corpus
layout (+D29-21 `_index.json`) · Decision I (SSR Compose service, not prerender — P5 deploys).

Spec-level:

- **D29-22 URL scheme = the corpus id, verbatim (stakeholder).** `/{category}/{slug}` —
  `/spell/heal`, `/spell/heal@legacy`, `/creature/red-dragon-adult`, `/rules/counteracting`.
  Zero mapping layer; `@` is legal in a path segment. Non-ASCII slugs exist
  (`ixamès-eye`, `ōmukade`) — percent-encoding must round-trip (test one). **Router option
  `pathParamsAllowedCharacters: ["@"]` (adversarial M9 — the pinned router round-trips `@`
  fine but `<Link>` would render `%40legacy` without it; verified supported).** Paired pages
  cross-link:
  a legacy member with `remasteredAs` shows a banner linking the remaster member(s); a
  remaster member with `legacyOf` shows a compact "legacy version" link. Every page shows an
  edition pill. Unknown category or slug → `notFound()` (the template 404).
- **D29-23 Corpus read layer = runtime SSR reads (heartwood precedent), NOT baked modules
  (wiring rewritten per adversarial B3; file split per M12).** TWO server-side modules,
  heartwood's deliberate split: **`src/server/corpusFs.ts`** — the `node:fs` layer, imported
  ONLY from server fns (never from components — the client-bundle leak guard heartwood
  documents): a **`createCorpusReader(rootDir)` factory** (directly unit-testable on
  `fixtures/entities/`) exposing `categories()` (from `manifest.json` categoryCounts — the
  fixture corpus carries its own manifest per D29-21), `index(category)` (reads `_index.json`,
  cached forever in a module Map — corpus is immutable per process; all indexes ≈13.5 MB),
  `entity(category, slug)` (read + `JSON.parse` per request — NO per-request Zod: the corpus
  is emit-validated (P1 acceptance C); p50 5.7 KB, max 809 KB is fine). Traversal guard:
  category must be a `categories()` member; slug must not contain `/`, `\`, `..`, or a leading
  `_`; resolved path must stay within root (heartwood `within()` pattern) — the guard IS the
  auth story for the HTTP-reachable serverFn endpoints. **`src/server/corpusFns.ts`** — the
  `createServerFn` wrappers route loaders call (client navigations fetch; SSR runs inline —
  akasha `$.tsx` precedent). **Root resolution happens INSIDE the module** (the repo idiom —
  ledger's `rumConfig.ts` calls `loadConfig()` from within the bundle; `server.ts` has no
  channel into the built loader closure): `loadConfig().codex.dataPath + "/corpus"`, and **if
  that directory is absent, fail-soft to the repo's `fixtures/entities/` with a prominent
  startup WARN log** — this single mechanism gives hermetic CI (fresh clone, no `data/` →
  ssrSmoke + route tests run on the fixture corpus with zero extra seams) and dev/prod the
  real corpus. The misconfigured-mount risk this creates is owned by P5's live gate, which
  must assert a REAL-corpus marker (the dragon page), not just 200s.
- **D29-24 Renderer = one total `CodexNode → React` layer, mirrored on `mdastToReact.tsx`.**
  `src/domain/render/nodes.tsx`: a flat switch over all 18 kinds; the default branch renders a
  visible error chip (gothic `ErrorChip` idiom) carrying `data-render-error` — it must never
  throw, and goldens assert zero occurrences. Kind mappings: `paragraph/heading/list/table/
  blockquote` → gothic-content HTML elements (heading `meta` — "Spell 3" etc. — renders as a
  right-aligned annotation, the AoN/statblock idiom); `divider` → `<hr>`; `aside` → inset card
  (`.gothic-card` inset variant); `text` marks → `strong/em/sup`; `crossref` →
  `<a href="/{targetId}" data-crossref>` (the Popover target contract); `brokenRef` → plain
  `<span>` of `display` (never a link — D29-2); `check` → styled inline text
  ("DC 26 Intimidation", basic saves annotated); `damage`/`inlineRoll` → `display`/formula in
  a dice-styled `<span>` (no roll interactivity — reference site); `inlineAction` → label text
  + action glyph where cost is knowable, else plain label; `template` → "15-foot cone"-style
  text; **`actionGlyph` → a codex-side token normalizer IN FRONT of gothic's
  `normalizeActionCost` (adversarial B1 — the corpus vocabulary is AoN long forms gothic
  can't parse: "Single Action" 21,032 · "Two Actions" 9,167 · "Reaction" 5,085 · "Free
  Action" 1,791 · "Three Actions" 1,789 · digits 3,852 · "A"/"a" 712 · composites like
  "Single Action to Three Actions" 211 + "… or …" 33 · "R"/"F" ~140; without the shim ~34k of
  ~44k glyphs would render as prose). The shim maps the long forms + "A"/"a", and renders
  composites as glyph–connective–glyph ("◆ to ◆◆◆", the PF2e idiom); genuinely unknown tokens
  ("T" ×1, "Two Actions to 2 rounds" ×3) fall back to text, golden-visible**;
  `localizedBoilerplate` → render children; `embed` → per D29-25. **Block-in-`<p>` guard
  (adversarial B2): ALL 7,197 `localizedBoilerplate` nodes sit inside `paragraph` nodes and
  7,114 carry BLOCK children (paragraph/list/divider — resolved `@Localize` values are block
  HTML, the schema's own comment) — a naive `paragraph → <p>` emits `<p><p>…</p></p>`, the
  browser hoists the nested blocks, and hydration mismatches on essentially every carve-out
  creature page. The paragraph renderer must detect block-carrying children and emit `<div>`
  (or hoist the boilerplate blocks out); a fixture + unit test pin exactly this shape.**
  Trait pills render via
  gothic `TraitPill` wrapped in a link to `/trait/{sluggified}` **when the trait exists in the
  trait index** (907 entities; unmatched traits — numeric qualifiers like `reach-15` — render
  as plain pills, not dead links).
- **D29-25 Embed policy = server-side inline expansion, depth 1, cycle-guarded.** A resolved
  `embed` node inlines its target's `body` at render time (loader fetches targets via the
  corpus reader; a visited-set kills cycles; embeds encountered INSIDE an inlined body render
  as crossref-style links, not further expansion). This is what makes class pages (max 46
  embeds/page — `class/commander`) and archetype pages readable — AoN/5etools both inline.
  **Known depth-1 consequence (adversarial M7, accepted): 977 of 8,511 embed targets
  themselves contain embeds (class-feature → action, e.g. `eidolon` → `manifest-eidolon`), so
  the second layer renders as links — flagged for the stakeholder eyeball at the S1 summoner
  golden, not discovered there.** 2,625 embed targets are `@legacy` members (all resolve);
  unresolved embeds (the 40 postDrop) render as plain text of `display`. Inlined blocks are
  visually framed (embed card w/ a small source link to the target page).
- **D29-26 Page shape per category group (stakeholder: P1.6 extension chosen over
  render-what-exists).** Every page: name + level right-annotation, trait pills, edition pill,
  rarity, source citation line (book + page + license badge; license `unknown` → badge
  omitted; book `"unknown"` → line omitted), `aonUrl` external link when present. Then:
  - **creature/hazard** — a statblock header from P1.6 `stats` + facets (Perception+senses ·
    languages · skills · ability mods · AC/saves · HP/immunities/resistances/weaknesses ·
    speeds; hazards: complexity/stealth/hardness/disable/routine), then embedded-item sections
    grouped by type: strikes (`melee` items: name, glyph, `attackBonus`, traits, `damage[]`),
    spellcasting entries (name, DC/attack, grouped spell name links), actions/abilities (name,
    glyph, traits, body), then `body` prose (AoN-joined creatures carry the full AoN statblock
    text — rendered after the structured header; empty-body carve-out creatures simply have no
    prose tail). Fields absent → line omitted (fail-soft, never "undefined").
  - **spell** — facet header rows (rank, traditions, cast time, range, area, duration,
    defense) then body. **equipment-family** (weapon/armor/shield/equipment/consumable/
    treasure rows exist in facets) — price/bulk/hands/usage/itemCategory header then body.
    **feat** — level, prerequisites, actionCost header then body.
  - **everything else** (~80 categories) — generic: any populated scalar facets render as a
    compact key→value line; body; `loreBody` (77 entities) renders as a titled "Lore" section
    after body. `embeddedItems` on non-creature actors (vehicle etc.) render via the same
    grouped sections. `proseOnly` needs no special casing (it's just body-only).
  Facet-spillover quirk (featLevel/rank mirror `level` on all Foundry-merged entities) is
  NOT rendered outside its home group — the per-group header reads named fields explicitly,
  never dumps `facets` wholesale. **Two expectations to hold at review (adversarial M11):
  facet headers are Foundry-merge-only — ~30% of feats (2,506/8,484: legacy + AoN-only
  members) have empty `facets` and render body-only headers (fail-soft, correct); and
  AoN-joined creatures show their statblock TWICE (structured header + the AoN statblock
  prose in `body`) — the likeliest stakeholder flashpoint, surfaced at the S1 dragon golden;
  if he wants dedup, that's a deliberate follow-up decision, not an S1 improvisation.**
- **D29-27 Listings (stakeholder: full layer + minimal throwaway listings).** `/` = category
  directory (grouped list of all categories + counts from the manifest); `/{category}` = one
  A–Z listing from `_index.json` rows (name → link, level, rarity, source book, edition pill)
  with letter anchors. Explicitly THROWAWAY: P3's faceted browse replaces these pages;
  they get no facet UI, no pagination, no sort options. **Weight reality (adversarial M6):
  TanStack Start dehydrates loader data into the HTML (`window.$_TSR`), so the feat listing's
  real response ≈ rendered rows + the 2.5 MB row JSON ≈ 4 MB (entity pages double-carry their
  body JSON the same way — akasha's accepted cost class). S3 measures FULL response bytes;
  the sanctioned fallback is trimming the loader payload to rendered fields — a `<details>`
  shard reduces neither transfer nor dehydration and is NOT the fix.**
- **D29-28 Tooltips (stakeholder): crossrefs + trait pills.** Port akasha's Popover island
  (`@floating-ui/dom`, hover on `a[data-crossref]`, fetch target page, extract
  `.popover-hint`, cache per pathname, SSR-safe null render + `useEffect` binding): every
  entity page wraps its content in `.popover-hint`; trait-pill links carry `data-crossref`
  too, so trait hover-cards come free. **The port must bring the CSS too (adversarial M10):
  akasha's `.popover`/`.popover-inner`/`.active-popover` styles live in its stylesheet, not
  the component — codex's globals.css ports them.** (Verified: the component itself has no
  akasha-specific data deps; its `fetchCanonical` alias hop is harmless here.) Listing rows
  do NOT pop cards in P2 (they navigate) — hover on 8k-row listings would thrash; P3 owns
  listing UX.
- **D29-29 Testing = fixture-driven golden renders (repo idiom: explicit fixtures + structural
  asserts; NO snapshot testing — none exists in the TS lane).** Three tiers: (1) **totality** —
  render EVERY fixture entity (one per category, 88) via `renderToStaticMarkup`; assert zero
  `data-render-error`, every non-empty body yields non-empty HTML, every entity name appears;
  (2) **committed exact-HTML goldens for 6 flagship categories** (creature = a statblock
  dragon, spell = heal + its @legacy twin, weapon, feat, rules, class = embed-inlining proof) —
  hand-checked once, then byte-asserted (regen script `scripts/regen-goldens.ts`); (3) **route
  tests** over the fixture corpus (loader 404s, `@legacy` param round-trip, a non-ASCII slug,
  the two `index`-slug entities resolving post-D29-21). Plus the template's ssrSmoke against
  the fixture root. The renderer itself gets per-kind unit tests (all 18 kinds + unknown-kind
  chip + actionGlyph unmappable-token fallback + cycle-guard).
- **D29-30 Telemetry + noindex.** `astra.codex` SSR spans come free from site-kit
  `createSsrServer`; client RUM per the template (`src/observe/{rum,rumConfig}.ts`,
  `startRum` in `__root` effect → `astra.codex-rum`); the kdl comment "no browser RUM surface
  yet" dies. `<meta name="robots" content="noindex">` in the root head from day one (C-1
  defense-in-depth; the Caddy `X-Robots-Tag` + robots.txt land at P5).
- **D29-31 Member mechanics.** `apps/codex` gains the strider shell verbatim where applicable:
  `server.ts` (createSsrServer, no staticMounts), `vite.config.ts` (**no contentWatchPlugin —
  codex has no build-time content step; document the divergence**; gothicFontsPlugin +
  tailwindcss + tanstackStart + viteReact; dev port from `loadSiteConfig`), `vitest.config`,
  `scripts/{generate-routes,ssrSmoke}.ts`, `src/{router.tsx,routes,observe,styles,domain}`,
  committed `routeTree.gen.ts`. Scripts: `dev`/`build` = vite `--configLoader runner`;
  `typecheck` stays **bare `tsc --noEmit`** and `build` = `vite build` — BOTH corpus-free
  (routes read disk at runtime; nothing bakes), so D29-12 hermeticity holds on a fresh clone
  with no `data/`. Deps mirror ledger: react 19, @tanstack/react-start (pinned family), vite
  exact-pin `8.1.3` (repo lockstep), tailwindcss, gothic/observe/config/site-kit
  `workspace:*`; devDeps vitest/jsdom/@testing-library/react. The app-side CSS reset must be
  `@layer base` (the gothic unlayered-reset gotcha) and globals must `@import` gothic
  theme.css (its `@source "./"` makes gothic utilities compile). Sibling Dockerfiles already
  COPY `apps/codex/package.json` (verified — the P1-era ripple covered it); codex's OWN
  Dockerfile/compose/caddy are P5.

## 3. Deliverables (by component)

**`apps/codex/src/server/{corpusFs.ts,corpusFns.ts}`** — createCorpusReader + serverFn
wrappers (D29-23 split — fs layer imported only from server fns).
**`apps/codex/src/domain/render/`** — `nodes.tsx` (D29-24 total renderer), `statblock.tsx`
(creature/hazard header + embedded-item sections), `facetHeader.tsx` (spell/equipment/feat +
generic), `citation.tsx`, `editionBanner.tsx`.
**`apps/codex/src/routes/`** — `__root.tsx` (shell, noindex meta, RUM), `index.tsx` (category
directory), `$category/index.tsx` (A–Z listing), `$category/$slug.tsx` (entity page; loader
resolves entity + inline-embed targets + pair links).
**`apps/codex/src/domain/components/islands/Popover.tsx`** — the ported akasha island.
**Frontend shell** — server.ts, vite/vitest configs, router, styles, ssrSmoke (D29-31).
**Goldens** — `apps/codex/goldens/*.html` (6 flagship) + `scripts/regen-goldens.ts`.
**P1 spec §9 S6 artifacts** (prerequisite, transform-side): `stats` extraction, npc filter,
`_index.json`, fixture indexes, schemaVersion 2, report sections.

## 4. Slices (each CI-green, committed, conventional)

- **S6 (P1 spec §9 — transform-only, lands FIRST).** npc-only import + `stats`/EmbeddedItem
  extraction + `_index.json` + fixture regen (incl. fixture `_index.json`s, a statblock dragon,
  a complex hazard) + report sections + full re-transform + determinism 3×. Gate: §9
  acceptance (jaws +29 line present in the corpus; zero character-type creatures; file count
  == manifest exactly).
- **S1 — the render layer, frontend-free (member plumbing pulled forward per adversarial
  M8: react/react-dom/@types + `@astra/gothic` deps, tsconfig `jsx: "react-jsx"` + the
  frontend-lane `verbatimModuleSyntax` stance per ledger's tsconfig, a vitest config — none
  of which `apps/codex` has today; without them the first `.tsx` fails `tsc --noEmit`).**
  `src/domain/render/*` + all D29-24/26 components,
  driven entirely by fixture entities; per-kind unit tests (incl. the B1 glyph shim's
  composite forms + the B2 block-in-`<p>` fixture); the 88-category totality test; the
  6 flagship goldens (hand-checked this slice — the D29-29 "vs hand-checked output" gate);
  embed inlining (D29-25) with an injected target-resolver (pure — no server dependency).
  Gate: totality green over the full fixture matrix; goldens committed; stakeholder eyeballs
  the 6 golden HTML files rendered (screenshot or browser) before S2 proceeds — **explicitly
  including the M7 depth-1 links-not-inlined second layer on the summoner golden and the M11
  statblock-twice duplication on the dragon golden.**
- **S2 — frontend scaffold + corpus reader + routes.** D29-31 shell; D29-23 reader (fs/fns
  split, in-module root resolution, the fixture fail-soft + its startup WARN) + traversal
  guard; the three route families + 404 + head/meta (title `{name} ·
  codex`, description from first-paragraph `collectText`); edition banners/pair links; route
  tests over the fixture corpus (loader 404s, `@legacy` + non-ASCII round-trip incl. the M9
  `pathParamsAllowedCharacters` href check, the two rescued `index`-slug entities); ssrSmoke
  (runs on the fixture fallback in CI by construction). Gate: `pnpm dev` against the REAL
  corpus renders red-dragon-adult with the full statblock, heal + heal@legacy pair-linked, a
  rules page, a class page with inlined features; CI green with zero `data/` present.
- **S3 — listings + tooltips + polish.** D29-27 listings (+ the feat-listing size
  measurement); D29-28 Popover port; trait-pill links; RUM wiring verified (spans + a RUM
  config fetch in dev); a Playwright-driven visual spot-check of ~10 real pages (dev server,
  real WebGL browser per the repo's verify idiom); README update (member is now app+ingest).
  Gate: full acceptance sweep below.

## 5. Acceptance criteria (P2 exit gate)

- **A (S6/P1.6).** §9 acceptance: statblock fields in the corpus (dragon jaws `+29` /
  `3d12+15 piercing`), zero `type: "character"` creatures, manifest/file-count exact, D-gate 3×.
- **B.** Totality: all ~88 fixture categories render with zero `data-render-error`; all 18
  node kinds unit-covered; the 6 flagship goldens committed + hand-checked.
- **C.** Real-corpus SSR spot-set renders correctly (dev server): `creature/red-dragon-adult`
  (structured statblock incl. strikes/spell DC/speeds), a carve-out AP creature (npc-type,
  statblock from `stats` alone), `spell/heal` ↔ `spell/heal@legacy` (banner + links both
  ways), `class/summoner` (embed inlining, cycle-safe), `rules/counteracting`, an
  `ixamès`-style non-ASCII slug, `ancestry/index` (the D29-21 rescue), a brokenRef-bearing
  page (`warfare-army/tiger-lord-berserkers` — plain text, no dead links).
- **D.** Navigability: `/` lists all categories; every category listing renders; every entity
  file is reachable by click (listing row count == corpus file count per category, asserted
  against the fixture + spot-checked against 3 real categories incl. feat's 8,484).
- **E.** Tooltips: crossref + trait-pill hover cards work on a real page (SSR-safe — no
  hydration errors in console), Popover teardown on navigation.
- **F.** Telemetry: `astra.codex` SSR spans visible in SigNoz from a dev-server session (or
  local OTLP smoke if SigNoz-net unreachable from dev — record which); RUM config endpoint
  serves; noindex meta present in every page's SSR HTML (`grep -a` idiom).
- **G.** Hermeticity: fresh-clone simulation (`data/` renamed away) — typecheck/test/build all
  green; both CI lanes reproduced locally + pushed green.
- **H.** Stakeholder review of the rendered pages (the C spot-set + anything he clicks) — P2's
  equivalent of the P1 report review. Exit = his sign-off, then `octo:spec` P3.

## 6. Risks / adversarial notes

- **TanStack param edge cases** — `@` and non-ASCII in `$slug` params must round-trip
  (encode/decode); akasha's dotted `$id` precedent says the router handles unusual segments,
  but `@legacy` + `ixamès` get explicit route tests (S2) before anything builds on them.
- **Embed-inlining fan-out** — a class page loads ~dozens of embed targets per request (p50
  5.7 KB each — fine), but a pathological page could fan wide; the loader caps inlined targets
  (e.g. 100/page, report-logged in dev) and the cycle guard is unit-tested. Depth stays 1.
- **The renderer is the ONLY consumer of 18 node kinds at scale** — corpus-wide kind census is
  known (§1), but *combinations* (tables containing checks, asides containing lists) only
  surface on real pages; the totality test + the S3 visual spot-check are the net. Any
  render-time surprise becomes a fixture entity + unit test, not an ad-hoc patch.
- **Statblock fidelity** — P1.6 extracts what's statically present; pf2e's *derived* NPC
  conveniences (e.g. elite/weak adjustments) are out of scope — the page shows source-static
  numbers, exactly like AoN.
- **Listing weight** — feat's ~1.5 MB HTML is accepted as throwaway (D29-27); if it measures
  materially worse in S3, letter-sharding (`/feat#a` → per-letter `<details>`) is the
  sanctioned fallback, NOT pagination UI (that's P3's).
- **Popover fetches whole pages** — worst case `spell/avatar` (809 KB → larger HTML). Akasha
  accepts the same class of cost; cards cache per pathname. If hover on huge pages feels bad
  in S3, the sanctioned tweak is a `?hint` truncation at the extractor, not a new endpoint.
- **Two clock-stoppers already known:** the 530+40 postDrop broken refs render as plain text
  (by design, not fixable in P2 — they point at drop-pass casualties); the 1,830 `-N`
  collisions render as separate valid pages (disambiguation UX is P3 listing territory).

## 7. Out of scope (P2)

Search + facet UI + Pagefind (P3 — the build-search hook point is noted in D29-31's no-content
divergence); rules-tree/breadcrumb navigation + sources index (P4 — NOTE: corpus `rules`
entities carry NO breadcrumbs field today; P4's spec must re-derive the tree source, flagged
now); site-wide legacy/remaster toggle (P3 filter — P2 ships per-page pills/banners only);
deploy artifacts (Dockerfile/compose/caddy/robots.txt/X-Robots-Tag — P5); roll interactivity;
images/art (dropped at transform); populating creature `family` (dead facet, 0 occurrences —
P3 may want it for filtering; left to P3's spec); the facet-spillover cleanup (featLevel/rank
mirror — harmless, renderer ignores it); listing pagination/sort.
