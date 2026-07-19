---
name: codex-0029-gotchas
description: codex (0029) — public-but-noindexed PF2e reference site — 2026-07-19 **P14 ENTITY-PAGE INTEGRITY ROUND BUILT + DEPLOYED + LIVE (provenance: "investigate /ancestry?entry=shisk + /class/alchemist" → 5 systemic defects, none page-specific; 5 parallel investigation agents → scope R1–R6 → spec D29-132..140 → opus pair killed 5 blockers → S1 `dbb6cbb` transform / S2 `5ecb628` render / S3 orchestrator deploy, window ≈70 s, SigNoz 0 ERROR): loreDedupe render-time suppression (per-heading split + implicit preamble + collision-BASE-slug embed matching + ADAPTIVE shingle window — a fixed 5-word window can never match <5-word sections, every class's byte-identical "Perception" stub survived until adapted); grants family disambiguation masthead→legacyOf→level (164 of 503 were WRONG-CLASS via pre-collision uuid resolution — augmentClassStats's own "0 renamed/suffixed" doc comment was false; 497/23 resolved/null, 6 genuinely undeterminable nulled); embedOverrides at reconcileInline ONLY (patchEmbed is a PROVABLE silent no-op — unresolvedEmbeds:0 at patch time, the 27 only flip unresolved post-drop); 2 debris drop-families (4 journal section headers + 5 unknown-book creature husks; 44,808→44,799); ToC deleted everywhere (`.codex-toc` never had CSS — the 620px void); GenericFacetLine→formatFacetValue ("Size: med"); shisk lore → exactly "Shisk Heritages", alchemist → the Versatile Vial table, heights −46%. ⭐ finds: opus reviews pre-killed top-level-split-destroys-the-canary + exact-id-match-no-op (260/469) + preamble-undefined; a missing pathspec ABORTS the whole `git add` → the commit captured only pre-staged deletions (caught by immediate status re-read, amended); a CONCURRENT session (assay 0030) worked the same tree → enumerated-pathspec commits + deploy scoped to the codex compose unit (blanket `just up` would trip dagster's `uv sync --frozen` on the in-tree uv.lock naming the not-yet-COPYable apps/assay member); brokenRef crossref targets riding the dehydration payload are NOT leaks (displays render). Gate-H register adds: ~30 cross-category action/* embed dup survivors; Description sub-feature headings survive; 4 family-size-1 upstream masthead gaps; eidolon crossref repoints candidate. ▶ OPEN = gate H, consolidated P2–P14**; earlier same-day **P13 FILTER PANEL REDESIGN BUILT + DEPLOYED + LIVE (tester-feedback round, pane-swap: filters replace the idle preview pane, table stays visible; formatFacetValue curated-map humanization; grouped Source via sourcesModel's PINNED order; OptionSearch ≥20/≥100; chip/checkbox split ≤8; /search onto shared facetControls; render-only deploy ~33 s, 0 ERROR; ⭐ hydrateRoot(document) sibling-listener stopImmediatePropagation find; matchMedia tier hook over container-width flag; opus pair pre-killed the count-gating false premise + ssrSmoke posture + j/k focus steal + the source-order fork)**; earlier same-day **P12 BESPOKE CLASS PAGE BUILT + DEPLOYED + LIVE (5e.tools model; /class rail + ClassPage w/ Core Traits/progression/subclass pills/feature stream; stats kind:class schema v5 via the augmentClassStats POST-DROP pass — grants 503/17-null, subclassOptions current-edition UNION; ⭐ the "0 superseded subclasses" pin was FALSE — 108, remasters absorbed into class-feature/ → union mechanism; extract-fixture's canonical-coverage WIPES the hand-spliced virt-* fixtures (recurred) + new-shape fixtures need a fixture-pipeline second source; TanStack search params round-trip string[] not CSV; loreBody carries a SECOND duplicate progression table; closed-details ::details-content content-visibility hides content undisplayable by descendant CSS — latent in /rules too; EntityHeader extracted w/ goldens byte-identical; deploy = checksum-rsync of the determinism-proven scratch corpus, ≤25 s window)** + same-day follow-ups `7829f29` (class ToC dropped · bare /class 307→first visible class · header nav right-aligned everywhere; ⭐ deriveHeaderTitle misses fail INVISIBLY — standalone h1s are sr-only on the header-carries-title premise, so class pages had NO visible title; ssrSmoke tests a STALE dist unless rebuilt; ONE auto-margin owns the header right-push); same day **P11 BACKLOG ROUND BUILT + DEPLOYED + LIVE (6 serial slices, one autonomous orchestrated session): activation-debris drop 1,384 + keep-9 + 55 pointer-strips, 12 name-template renames, whole-doc crossref dedupe 1,167/133 (pin AMENDED from 1,147/123 — raw-markdown ground-truthing beat the review scanner), table cell-fit + 96rem browse, popover hover-bridge, curated 28-nav, loader-side hiddenCount reveal, title-into-header w/ the sr-only-h1×popover-B1 interlock; ⭐ three in-flight bug finds (proseOnly drop scoping · icon padding-inline cascade loss · the P9 pending-heuristic false-negative that would have zero-rowed the /doctrine reveal) + 4 malformed-name actions escape the drop regex (P12); corpus 44,808**; 2026-07-18 P10 statRow+size round same day as its gate-H provenance ("look at aso-berang"): AoN `<row>` wrappers now collapse to a 19th node kind `statRow` at ingest (schema v4) + creature/vehicle header size chip; ⭐ the census's tag-aware-candidacy trap (post-flatten all-paragraph ≠ collapsible — deity pages), the stripMasthead 36%-overlap find, and BOTH adversarial reviews pre-killing a class-name collision + a live-serving deploy wipe + a factually-wrong ancestry chip**; 2026-07-17 P8 density/table round — listings are now flat sortable per-category-column tables (5e.tools register, parchment voice kept), site-wide density pass, exact-name search boost (fireball/heal #1), j/k keyboard, nav carets; ⭐ the proxy-pin class struck AGAIN ×2 (hydrate-window 40 vs heal-ranks-43 → 60; gate-B "full set at 1600px" impossible under the 26rem list-track cap → 58/42 grid amendment) and the adversarial reviews caught the omnibar-8-stub no-op + the j/k history/fetch-spam class pre-build; plus the P6 proxy-population finds, the P5 bind-mount/fixture-fail-soft finds, the P4.5 loaderDeps finds + all prior corpus/join/render/browse/search/tree gotchas. ▶ open: gate H consolidated re-run (P2–P8) — screenshots delivered
metadata:
  type: project
---

**codex (0029)** — a PF2e rules-reference site: AoN content breadth × 5etools structure × gothic,
flat TS member `apps/codex` on the strider/site-kit SSR template, **port 10374**, public-but-
NOINDEXED (C-1..C-8 in the scope doc). Per-phase specs: **P1 ingest COMPLETE-pending-review** →
P2 entity pages → P3 faceted browse+search → P4 rules browser → P5 deploy. P2+ get specced
against the REAL corpus P1 produced.

**P14 ENTITY-PAGE INTEGRITY ROUND — BUILT + DEPLOYED + LIVE 2026-07-19** (stakeholder: two
pages to investigate → every finding systemic; spec `0029-codex-p14-entity-page-integrity-spec.md`
D29-132..140 BUILT+DEPLOYED w/ §8 evidence; S1 `dbb6cbb` · S2 `5ecb628` · deploy window ≈70 s):

- **The five defects:** (1) body+loreBody double-render on all 77 ancestry/class docs (body=AoN
  "wins prose", loreBody=Foundry JournalEntry merged by slug — `journals.ts` merge, rendered
  unconditionally by entityPage/ClassPage; class pages showed feature text up to 4×); (2) 164/503
  class grants linked the WRONG class's feature doc (augmentClassStats resolved via the
  PRE-COLLISION uuid index; 12 classes cite one shared Foundry Item uuid so no uuid map can
  disambiguate — the corpus's own mastheadExtra "Class" label is the signal, masthead→legacyOf→
  level cascade, ties edition-then-lowest-suffix, else null); (3) 27 unresolved embeds rendered
  raw ids (embeds lacked crossref's brokenRef display discipline); (4) journal-section-header +
  unknown-book-husk debris entities; (5) `.codex-toc` had NO CSS at all → full-width 624px strip.
- **⭐ The P14 build finds:** the opus pair pre-killed FIVE blockers — top-level heading split
  suppresses whole H1 "Class Features" chapters and DESTROYS the unique Versatile Vial table
  (per-EVERY-heading split is the mechanism); exact-final-id embed-vs-stream matching is a no-op
  for 260/469 collision-family embeds (bare base slug vs suffixed stream ids — match on
  collision-base); preamble exists in 77/77 docs and must be an implicit leading section;
  `patchEmbed` NEVER sees the 27 as unresolved (report.json unresolvedEmbeds:0 — they flip at
  `reconcileInline` post-drop; that is the ONLY valid override application point); a repoint map
  cannot DELETE a node (suppress = replace w/ empty text node, else the count pin reads 7 not 6).
  Then S2's mandated real-data run caught one more: **a fixed 5-word shingle window can never
  match sections shorter than 5 words** (every class's byte-identical "Perception" stub survived)
  → window adapts to min(5, sectionWords).
- **Process finds:** a missing pathspec in a multi-file `git add` ABORTS THE WHOLE ADD — the S2
  commit initially captured only the engineer's pre-staged deletions; always re-read `git status`
  after committing. A CONCURRENT session (assay, 0030) built in the SAME tree throughout —
  enumerated-pathspec commits only, leave their uv.lock/apps alone, and scope the deploy to the
  codex compose unit (`docker compose build codex && up -d codex`, unit has no secrets) because
  blanket `just up` would rebuild dagster whose `uv sync --frozen` fails on an in-tree uv.lock
  naming a workspace member the Dockerfile doesn't COPY.
- **Deploy shape (differs from P12/P13):** reindex WAS required (−9 URL records — debris had
  name-only Pagefind rows); image-first → checksum-rsync of the determinism-proven scratch corpus
  (0.7 s) → reindex 31 s / exactly 44,799 pages → recreate; total window ≈70 s; SigNoz 0 ERROR.
  `class-feature/*-eidolon` strings in raw HTML are brokenRef CROSSREF targets in the dehydration
  payload (displays render; not a leak).
- **Gate-H register adds:** ToC gone everywhere (ancestry in-page nav loss, stakeholder call);
  ~30 class lore survivors whose dup content hides behind cross-category `action/*` embeds
  (structurally outside both suppression mechanisms); Description sub-feature headings (e.g.
  "Formula Book") survive once — only granted-feature-NAMED sections strip; the 6 nulled grants +
  4 pre-existing family-size-1 masthead gaps (upstream coverage); eidolon crossref repoints.

**P13 FILTER PANEL REDESIGN — BUILT + DEPLOYED + LIVE 2026-07-19** (tester feedback "filter
panel aesthetics/ux very poor" → scope (R1–R6 same-day) → spec D29-121..131 → opus
adversarial ×2 → 4 serial slices `c60bdbe`/`f443d31`/`713c138`/`0d7765f` → orchestrator
deploy, one session). **The design:** pane-swap — filters render in the idle 42% preview
pane (table + count row stay visible, live-updating), `<dialog>` demoted to a narrow-tier
bottom sheet; `formatFacetValue` curated-map humanization (the map IS the mechanism — glued
compounds have no delimiter; 24 "worn<slot>" values; stringified-Python-list parse;
`facetDefs` labelMap always wins); Source grouped by `sourcesModel.ts`'s exported
`PINNED_PRODUCT_LINE_ORDER` (⭐ the draft spec FORKED that order — both reviewers caught it;
reuse-don't-redeclare); OptionSearch on every ≥20-option list (≥100 auto-expanded, query
bypasses bounded renders); ≤8-option enums are toggle-chip rows; traits selected-first +
40-bound + AT state labels; pills truncate >2 values; `/search` consumes shared
`facetControls.tsx` (keeps its own state + Pagefind counts via a comparator seam);
`sourceLines` = request-time server derivation from server-only sources-index.json
(`CorpusNotFoundError` fail-soft is load-bearing for fixtures; max map creature 21,436 B).
**⭐ THE P13 finds:** the `.codex-facet-option-label` `text-transform: capitalize` CSS was
itself the "Ancestryfeature" bug; `hydrateRoot(document)` makes React's delegated listeners
same-node SIBLINGS of manual `document` listeners — `stopPropagation()` cannot block them,
`nativeEvent.stopImmediatePropagation()` is the Esc-sequencing mechanism; the
container-width flag (`useNarrowListingContainer`) has a mid-width gap (700–850 px reads
"wide" while the 56 rem CSS breakpoint already hid the pane cell) → tier decisions need a
`matchMedia` hook mirroring the CSS breakpoint; Playwright locator `.click()` auto-scrolls
targets into view (confounds scroll-drift asserts — use `evaluate(el => el.click())`);
"no scroll jump" on superseded reveal is really PARITY (the toolbar control itself drifts
~480 px via content reflow on deep-scroll reveals); /creature first-toggle ~144 ms is
one-time JIT/memoization warmup (warmed 6–27 ms). **The opus pair pre-killed:** the
count-gating em-dash design (false premise — `totalCount`/`eligibleCountOverride` already
carry full numbers through the cold-load window), the unpinned SSR posture (panel must stay
unconditionally mounted or ssrSmoke coverage silently dies), the j/k focus-steal
(`focusAnchorForSlug` vs pane focus), the source-order fork, the pane-superseded
scroll-jump divergence (`onSupersededReveal`/`resetScroll:false` path parity), and the
`aria-live` flood (preview branch only). **Process:** an S3 engineer ran `git stash`
despite the no-git-writes brief (popped clean, no harm — restate the P6 rule in EVERY
brief); linguist-commit timer stopped for the whole build session, restarted after the
docs push. ▶ gate H is now the consolidated **P2–P13** review; P13 register: filters-open
is non-shareable local state; group headers aren't select-alls; tier-cross closes the pane;
the humanization map is a standing maintenance surface.

**P12 BESPOKE CLASS PAGE — BUILT + DEPLOYED + LIVE 2026-07-19** (scope→spec→adversarial ×2
(OPUS reviewers, stakeholder-directed)→4 serial slices→staged deploy, one session; spec
`0029-codex-p12-class-page-spec.md` D29-113..120, S1 `21547da` · S2 `ed40bab` · S3 `93fa2e2` ·
S4 sweep+deploy): `/class` = narrow rail (27 visible / 20 superseded-reveal / 2 miscategorized
unlisted) + bespoke ClassPage (Core Traits · 1–20 progression table w/ anchor-linked features +
cadence cells · per-category subclass pill rows w/ inline render + `?subclass=` persistence ·
level-ordered inlined feature stream · Description w/ the duplicate AoN progression-table
suppressed). Transform: `stats:{kind:"class"}` (scalar at extract; psychic keyAbility=[];
attacks.other gated non-empty — present-but-empty on 24/27 raw) + **`augmentClassStats`
POST-DROP pass** (grants from `system.items` via uuidResolve nulled against the kept set —
503/17 exact, the 17 = genuinely dropped stubs (cleric's 6 doctrines etc.), NEVER name-match
rescue (action/exploit-vulnerability is a different doc); subclassOptions = curated map +
**current-edition UNION**: non-superseded category docs ∪ remasteredAs-targets of superseded —
because ⭐ **the "0 superseded subclass docs" scoping pin was FALSE: 108, ten categories are
100% legacy husks whose remasters were ABSORBED into class-feature/ by CATEGORY_EQUIVALENCE**;
barbarian 9+6 · sorcerer 18+10 · cleric current == its 2 remaster targets); schemaVersion 5;
class search rows + `_index.json` byte-stable → **no reindex at deploy** (proven by recomputing
Pagefind payloads). ⭐ THE P12 finds: **`extract-fixture`'s canonical-coverage step wipes the
hand-spliced `ritual/virt-*` fixtures** (recurred from P10 — restore surgically, never
`git checkout HEAD` the whole entities/ tree, which also reverted the new fixture emits once)
+ new-SHAPE fixtures need a **fixture-pipeline second source** (the canonical sweep only
selects from the real emitted corpus — pre-deploy it lacks the new fields); **TanStack search
params round-trip `string[]` as a real array, not a CSV string** (probe the pinned router,
accept both shapes); **`loreBody` carries a second duplicate progression table** on several
classes (alchemist/cleric/druid/…) — suppression must walk both; **a closed `<details>` hides
content via `::details-content{content-visibility:hidden}`** that NO descendant display rule
can undo (rail painted blank on desktop; fix = explicit `::details-content` override) — **the
same latent bug sits unfixed in /rules' RulesLayout sidebar** (follow-up candidate);
`EntityHeader` extracted from the monolithic EntityPage w/ all 7 goldens byte-identical (the
popover `.popover-hint` contract — 1,066 class-feature→class crossrefs — now rides the shared
header). The OPUS adversarial pair pre-killed 4 blockers (the superseded-union redesign; the
extract-time-impossible augment placement; the nonexistent "emit-Zod referential" precedent;
the unsatisfiable "reuse header without forking") + killed a 28-vs-27 phantom pin and the
missed loaderDeps/dehydration-×2/ToC-is-a-passive-DOM-scan contracts. Deploy: image FIRST →
**checksum-rsync of the determinism-proven S4 scratch corpus** (recorded mechanism deviation;
30-path delta) → `just up` — **window ≤25 s** (vs P11's 82 s); SigNoz all /class routes
hasError:false, 0 ERROR logs. Class pages carry 3 pre-existing AoN-literal prose h1s (the P11
gate-H flag, not a P12 regression). An engineer ran a `git stash` round-trip mid-slice despite
the brief (harmless — popped clean; the ban stays load-bearing); the S1 engineer was
API-error-killed mid-final-check and resumed cleanly via SendMessage.

**P12 follow-up round `7829f29` (2026-07-19, mid-gate-H stakeholder items, built+deployed+live
same session):** class-page "On this page" ToC dropped (ClassPage only — EntityRenderPane
standalone pages keep theirs); bare `/class` now loader-307s (`replace`, `?superseded=`
carried — note the router's own pre-existing `?superseded=1→true` canonicalization hop fires
FIRST, making it a 2-hop chain) to the alphabetically-first VISIBLE rail class (Alchemist real /
Cleric fixture — derived from the rail, never a hardcoded slug; the empty pane survives only as
the zero-visible-classes fail-soft); header nav+omnibar right-aligned on EVERY page. ⭐ THE
finds: (1) **`deriveHeaderTitle` is a route-enumeration seam that fails INVISIBLY** — P12's
`/class/$slug` was never added to its switch, and since standalone pages render their h1
sr-only ON THE PREMISE the header carries the title (D29-112), the missed case meant class pages
had NO visible title anywhere (just the wordmark) — audit this switch for every NEW route
family. (2) **ssrSmoke imports the prebuilt `dist/server/server.js` and builds only if ABSENT**
— after any route/source change a stale dist silently tests the OLD behavior (a new redirect
"failed" as 200 until `pnpm run build`). (3) **exactly ONE flex auto-margin may own the
header's right-push** — it lived on `.codex-omnibar`, so wordmark pages (no `flex:1` title)
left the nav hugging left while title pages happened to work; moved to `.codex-header-nav`
(nav+omnibar travel right as a group; two auto margins would split the free space and center
the nav; the <64rem block hands it back to the omnibar where the nav wraps to its own row).

**P11 BUILT + DEPLOYED + LIVE 2026-07-19 — six serial slices S1 `0f2a452` (transform/search) ·
S2 `0d015ac` (tables/facets/filter/rules) · S3 `a271419` (popovers/scrollbars) · S4 `52a046e`
(nav/reveal/header) · S5 `6fc2a9e` (polish/search-meta) · S6 `13b99b6` (sweep+deploy record);
spec `thoughts/astra/specs/0029-codex-p11-backlog-round-spec.md` D29-98..112 status
BUILT+DEPLOYED w/ full §6 evidence; scope `…/research/2026-07-18-codex-0029-p11-backlog-round-
thoughts.md`. Corpus 46,192 → 44,808 (activation drop 1,384 = paren 1,224 + digit 160; keep-9
ID-keyed; 55 dangling edition pointers stripped); 12 ACTION.TYPES/TRAITS name-templates resolved
(the pinned `{2:Single,3:Two,4:Three}` table — naive #N→N is off-by-one on all 9); adjacent-
crossref dedupe whole-document 1,167/133 → 0. THE P11 finds:** (1) **the hard-pin-vs-mechanism
rule cut BOTH ways** — dedupe's review-measured 1,147/123 UNDERCOUNTED (S1 ground-truthed the
epicenter against raw AoN markdown: 38 real pairs vs the scanner's 37; shipped the mechanism,
amended the pin, P6 precedent); digit-family ≈163 → exactly 160 twice-derived. (2) **drop
predicates need `proseOnly===true` scoping** — Foundry adventure-specific actions also start
with "(" and would be misclassified (entity set unchanged, accounting wrong). (3) **the
padding-inline cascade trap recurred** — `.codex-listing-col-icon`'s `padding-inline` silently
LOST to `.codex-listing-table th,td`'s higher-specificity `padding` shorthand (the same trap
the file already documents for col-name); only the real-corpus drift-guard caught it (fixture
too thin). Source col: `ch` is pinned to "0" glyph width — "COCA-ECPG" (uppercase+hyphens)
clips at p99+1, needed 10ch. (4) **the P9 `pending` heuristic (`rows.length < totalCount`) is
FALSE for small/all-superseded categories** — it silently skipped the post-hydration full-array
fetch, so the D29-111 reveal showed ZERO rows on /doctrine; fix = an explicit `windowed` flag
in the loader payload. (5) **the sr-only-h1 × popover interlock (B1)**: the popover clones the
STANDALONE page's SSR HTML, so sr-only must ride a `-standalone` modifier with a
`.popover-inner` re-show override — S3 landed its compact rule on the plain selector FIRST and
S4 tightened it (cross-slice sequencing recorded in both §6 entries). (6) **classifier gate:
delegating a deploy to a subagent is blocked** — the sweep ran as an agent, the deploy ran in
the orchestrator's own loop under explicit user "deploy it" (the portal-0026 lesson holds for
agents too). Deploy: D29-97 staged order reproduced — all 8 gate-A pins EXACT live, 82 s
degraded window (P10 band 77–91 s), `/action/interact-142` shows NO banner (strip proof =
absence, not fail-soft), traits=fire 686 == the S1 pin (S5's 539 was the pre-drop index).
**Gate-H flags: 4 malformed-name actions escape both drop families (`1-minute`,
`1-minute-manipulate-6`, `1-minute-command-interact` — truncated names missing ")" — plus
`action/u` = "</u>"; P12 candidates); class/investigator pre-existing multi-h1 (AoN literal
`level: 1` headings); 200 ms popover grace tunable; post-curation no live dropdown scrolls.**

**P10 BUILT + DEPLOYED + LIVE 2026-07-18 — S1 `0b7b3f8` (ingest/schema) · S2 `cf254a4`
(render/chip/regen/deploy); spec `thoughts/astra/specs/0029-codex-p10-statrow-size-spec.md`
D29-91..97 status BUILT w/ §6 record; scope `…/research/2026-07-18-codex-0029-p10-statrow-size-
thoughts.md`.** Provenance: mid-gate-H "look at /creature/aso-berang" → triage split 4 oddities
into 2 ours (stat-line sprawl from D29-2 row-flattening; size rendered NOWHERE) + 2 upstream-
verbatim (Watch Over Evil mislabeled Single-Action w/ malformed `**` spans; "Enimty" typo —
left faithful, override registry = future decision). **THE P10 finds:** (1) **tag-aware candidacy
is mandatory** — 14,869 rows are all-paragraph only POST-FLATTEN (paragraphs spliced from nested
`<column>`s; every deity page) — a children-array test would collapse whole pages; the working
mechanism = a `wrapperOpenSeq` counter sampled around the recursive parseSequence call. (2)
**stripMasthead eats 36% of candidates** (17,471 rows / 10,710 docs — spells/equipment, NOT
creatures): collapse-before-strip would have silently vanished mastheadExtra pairs; strip is now
statRow-aware (whole-row-or-nothing, partial=0 measured). (3) **Cell-trim vs masthead byte-
identity contradicted on exactly 155 pairs/151 docs** (today's pairs keep untrimmed value runs) —
gate relaxed to modulo-trim w/ the pin report-counted; 2 committed fixtures (shadow-double,
simulacrum) are in the set. (4) **The adversarial reviews earned their keep ×3:**
`codex-stat-row` class was ALREADY TAKEN (structured statblock Row — a collision would restyle
Foundry-only pages; renamed `codex-stat-line`); the draft deploy order wiped the LIVE-mounted
`data/corpus`+`data/search` before the image build (≈18.5k pages of ErrorChips for the whole
reindex — resequenced: build image FIRST, then one wipe→reindex→immediate `just up`; measured
residual window 77–91 s); the ancestry size chip would have shipped factually-wrong data
(facets.size = Foundry's single default token size but ancestry size is a PLAYER CHOICE —
"awakened-animal med" vs body "Tiny or Small or Medium or Large"; chip is creature+vehicle only,
hazard excluded too — 81% default-fill `med` noise). (5) **The proxy-pin class struck in MY OWN
draft** — the expected-diff lists were candidacy-derived, wrong both directions (spell-heal
golden is byte-IDENTICAL — its rows are fully masthead-consumed; 6 changing fixtures omitted);
review re-derived masthead-aware. (6) The transform's collapse counter (20,738) runs BELOW the
census (21,389) because url-dedup + variant-grouping never re-parse duplicate docs — the S1
engineer proved the rule reproduces census numbers exactly on raw docs before accepting the
delta. (7) virt-001..090 fixture rows have NO generator — regen rm-rfs them; restore-from-git +
re-splice into `_index.json` is now the spec'd procedure (ritual `_index` proved byte-identical —
IndexRow carries no mastheadExtra). Render notes: cells `white-space: pre-line` (`<br/>`→literal
`\n`); block-cell guard vs the div-in-span hydration class (cells are text+crossref-only today,
census-measured); `firstParagraphSummary` stays paragraph-first w/ statRow fallback when no
paragraph exists. ▶ Pre-existing residue surfaced (NOT P10's): 7 ssrSmoke failures on main;
`codex-virtualization-interaction-guard` CI-env flake (`before=1600 after=1336`, passes locally
— identical on S1's pre-S2 run).**

**P9 BUILT + DEPLOYED + LIVE 2026-07-18 — S1 `d467e78`/S2 `9542d0c` + S3 sweep + `just up`;
live-edge gate F PASSED: /feat 95,167 B decoded / 11.8 KB wire, quiet 783–862 ms at 4× throttle
(3-run set; the first post-recreate hit read 1,212 ms = cold cache, warm-up not the record), TBT
136 ms — vs the pre-P9 baseline 7.16 MB / 3.8–4.5 s quiet / 2,726 ms TBT: ~75× less HTML, ~4.7×
faster to quiet. Provenance: stakeholder "site is very slow" 2026-07-17 → measured TTFB fine +
main-thread parse/hydrate guilty → SVG symbol/use dedupe landed same day (`a298025`, −884 KB
decoded −11%, but main-thread UNCHANGED — bytes-not-nodes: each glyph kept its <svg><title><use>
wrapper so node count never dropped; the dedupe was worth it for weight, virtualization was the
real fix) → stakeholder chose full windowing over the recommended progressive-append (option 2).
Listing windowed virtualization; spec
`thoughts/astra/specs/0029-codex-p9-virtualization-spec.md` D29-83..90 status BUILT w/ §7 build
record.** Killed the /feat-class parse+hydrate cost two ways: `@tanstack/react-virtual`
`useWindowVirtualizer` DOM-windows every category `<tbody>` (spacer-`<td>`s, overscan 20, slug
keys), AND — the actual bulk of the win — the router's auto-dehydration payload now ships only the
SSR window's rows, not the full array (**bytes-not-nodes lesson**: P8-era windowing-only framing
would have left a ~2.4 MB dehydration floor untouched; D29-89 measured it LIVE first —
2,264,706 B, 31.7% of post-dedupe /feat — before the fix, confirming the payload as the real
target, not just DOM node count). /feat: 7,157,306→93,606 B decoded, 8,485→60 SSR rows.
**The derived-window mechanism:** `SSR_WINDOW=60` is never asserted, it's the OUTPUT of
`initialRect.height = 40×ROW_PITCH_PX` fed through the real virtualizer on both server AND client-
first passes (a unit test recomputes and pins `[0,60)`) — change any input, re-derive, never
hand-edit the constant. Post-hydration, the client re-fetches the FULL array via the existing
`memoizedListing` path (D29-35 stays intact; ~100-300ms window where filter/sort compute over
not-yet-landed data, recorded not hidden). **`resetScroll:false`** was needed on both entry
navigations — a LATENT P8 scroll-snap bug, not new to P9, only surfaced once virtualization made
scroll position load-bearing. **The `preventScroll` yank:** `focus()` after a wheel-back remount
was observed dragging the viewport at 923px (browser's default post-focus scroll-into-view
fighting the virtualizer's own scroll math) — `{preventScroll:true}` on every programmatic focus
call is now mandatory in this codepath, not optional hygiene. **The rAF-coalesce find:** fast key-
repeat j/k outruns scroll-event dispatch and floods `scrollToIndex` calls — coalesce them per
animation frame, don't call directly from the keydown handler. **The settle-timer ref-mirror
race:** `onEntryPreview`'s 180ms settle timer closed over stale props on rapid j/k — fixed by
mirroring the current value into a ref the timer reads at fire-time, not capture-time. **Fixture
growth:** `ritual` grown 6→96 rows (additive-only, no other fixture touched) specifically so
`virtualizationInteractionGuard.ts` has a real category past `SSR_WINDOW` to drive — every other
fixture category tops out at 7 rows. **S3 finding — the name-column pin was stale:** spec §2/D29-
86 cited "the longest real corpus name (41 chars)" for the R6 zero-wrap gate; the actual real
corpus (`_index.json` scan, 38,268 clean entity names across 85 browsable categories) tops out at
**56 chars** ("House Spirits With an Absurd Number of Regenerating Pies", `hazard`) — re-verified
the gate against the corrected pin (single-line/24px/`title`-fallback holds at the narrowest
engaged 897px split-view floor), no code change needed, spec-pin correction only. **S3 also
reconfirmed:** the `?entry=` param on a `/{category}` route takes the BARE slug, not
`category/slug` (passing the corpus `id` verbatim 404s inside the entry pane); `codex.port` has NO
env override by design (`config.kdl`) — a local scratch-port serve needs its own throwaway
`createSsrServer` boot script, never edit the shared config file or touch 10374; a raw
`LC_ALL=C` byte sort of SSR'd HTML titles DISAGREES with the app's actual `a.name.localeCompare
(b.name)` comparator on entity-escaped punctuation (`&#x27;`) — decode entities and use
`localeCompare` itself to verify SSR sort-order proofs, not a shell byte-sort; hermeticity re-
proof (corpus masked via a temporary reverted `config.kdl` data-path edit) = 85/85 files, 1854/1854
green including the 7 `ssrSmoke` cases that fail w/ the real corpus visible (confirmed as the
baseline first, not assumed); oxlint still needs `--threads=4` (standing repo gotcha, recurred).
**D29-90 (stakeholder mid-round): whole-row click target** — direct implementation, NEVER a
synthetic `anchor.click()` (detail===0 takes the keyboard branch = wrong full-nav on desktop);
guards: modifier no-op on cells, closest("a,button") yields, non-collapsed selection no-op.
▶ **OPEN: gate H — now the consolidated P2–P9 review on the live site** (P9 adds to the register:
Ctrl+F finds only mounted rows — categorical now, R2; Tab reaches only the window w/
aria-rowcount/rowindex compensation, R5; name column single-line + ellipsis, R6; the ~100-300 ms
cold-load filter window, D29-89).**

**P8 BUILT + DEPLOYED + LIVE 2026-07-17 (density/table restyle + UX round; spec
`thoughts/astra/specs/0029-codex-p8-density-tables-spec.md` D29-77..82 status BUILT w/ §7 build
record; scope `…/research/2026-07-16-codex-0029-p8-density-thoughts.md` R1–R4).** Provenance
chain, all 2026-07-16→17: **P7 deploy sanctioned + edge-verified** (P7 spec → BUILT; the
"Gambling Lore" reindex proof made non-vacuous via Satinder Morne — a creature whose lore skill
exists only via the D29-74 merge; `codex-refresh`'s corpus-manifest diff was timestamp-only →
REVERTED per the P1 precedent, AoN un-drifted) → **edition icons `e0267e0`** (Remaster/Legacy
text → Four-Point-Spark/History-Ring square SVGs at 10 sites + both filter `labelOf` seams
widened string→ReactNode; gotcha: `regen-goldens.ts` runs under `nodeTsResolve.mjs` which
retries only RELATIVE specifiers — `@/*` imports in EntityPage-reachable modules break golden
regen while tsc/vite/vitest all pass) → **the 5e.tools UX comparison**
(`…/research/2026-07-16-codex-vs-5etools-spell-browse-ux-thoughts.md`; method find: 5e.tools is
Cloudflare-challenged AND this host's DNS filter blocks `*.challenges.cloudflare.com` — headless
can never pass; clone `5etools-mirror-3/5etools-src` and serve locally, byte-identical UI) →
stakeholder adopted its recommendations + the 5e.tools spacing scheme (R1 full table register ·
R2 aligned sortable columns · R3 traits out of rows · R4 site-wide), AskUserQuestion w/ ASCII
previews. **Slices: S1 `0693d61` columnDefs/sort/table · S2 `fa0b42d` density+grid+carets · S3
`e969cf0` search-boost+keyboard · S4 sweep+`just up` (render-only round — NO codex-refresh
needed, the deploy discriminator is "did the transform/index change").**
**⭐ THE P8 finds:** the **proxy-pin class struck ×2 more** (the D29-81 hydrate window was sized
40 off the fireball-rank-10 measurement alone — `heal`, the decision's own second acceptance
query, ranks 43 raw → 60; gate-B's "full set at 1600px" was UNREACHABLE — the pre-P8
`.codex-browse-layout` caps the list track at 26rem/416px at every desktop width → S1-build
amendment, 58/42 grid, 55/45 fell 15px short of the 600px tier floor); **the adversarial
reviews pre-killed two would-be no-ops** (Omnibar hydrates only its first 8 stubs — a
post-hydration name-boost literally cannot see rank-10; j/k reusing the click path's deliberate
non-replace push = 15 history entries + a ~43.5KB-avg entity fetch PER KEYPRESS on /creature →
real-DOM-focus selection + 180ms-settled `replace:true` commit + `memoizedEntity` 50-LRU);
**`/search` silently reuses `.codex-browse-layout`** — S2's widening broke /search's mobile
collapse via specificity (the 2-class scoped override outranked the 56rem media query; restate
the media query inside the override); **React SSR text nodes carry `<!-- -->` separators** —
"145 of 145 shown" is un-greppable as plain text through the edge (match segments or parse;
the three-prong assert scripts must know this); **keyboard Enter on a row anchor is a click
with `detail === 0`** — the split-view row-click intercept must fall through to native
navigation for it or Enter breaks; sortable-header a11y = `aria-sort` on the CELL never the
button; coverage-aware columns (64/88 categories are 0%-level; sidebar has NO rarity) — reuse
the facetKeys classifier rule, never hardcode fallback columns. **Weights: /feat 8.04 MB/630 KB
gz = +35% gz vs P3** (per-row inline Cast-glyph SVGs are the growth) — flagged for H,
`<symbol>`/`<use>` dedupe is the ready fix if felt. **Harness finds:** a user-STOPPED
background agent is UNRESUMABLE (SendMessage refuses; relaunch fresh only on the user's
explicit word — tree was clean, zero work lost); oxlint at default threads OOMs on this host
(the 0023 `--threads=4` fix still required, repo-wide). Alphabet jump strip + letter headers
DELETED (recorded trade-off — quick-filter+sort replace them imperfectly; a jump aid can
return if H asks). ▶ **OPEN: gate H, now the consolidated P2–P8 review on the live site**
(M7/M11 + heal-Pagefind-limitation now FIXED by the boost; P8 register screenshots delivered
2026-07-17).

**P6 BUILT + LIVE 2026-07-15 (gate-H feedback round; spec
`thoughts/astra/specs/0029-codex-p6-feedback-spec.md` D29-59..71, status BUILT; scope
`…/research/2026-07-15-codex-0029-p6-feedback-thoughts.md` R1–R11 all stakeholder-resolved).**
P5's gate H was a REDIRECT with 11 items; the whole round ran scope→spec→adversarial-×2→build→
deploy in one session. **FIRST USE of the 4-parallel-worktree-track structure (D29-71):** Track A
in the MAIN tree (the gitignored `data/{corpus,snapshots,search}` exist ONLY there — a worktree
materializes tracked files only, so the corpus-regenerating track cannot be a worktree), B/C/D in
isolated worktrees gating fixture-only (the hermeticity bar is what makes this safe), a binding
per-track file-ownership table, pinned merge order A→B→C→D (D rebases onto merged A+B+C), NO track
regens shared goldens (regen-locally-and-flag; integration regens ONCE at merged HEAD — A's and
B's golden drift sets overlapped on 3 of 6 files exactly as predicted, the only merge conflicts).
**⭐ THE P6 find — the proxy-population pin failure mode, ×3:** the spec pinned ritual movers=55/
`ritual/`=113 (adversarially reviewed ×2!) but BOTH derivations grepped `legacyOf` pointers — a
proxy population — while D29-59's mechanism actually triggers on any Foundry-spell↔AoN-ritual join
= **143 movers** (87 never-remastered rituals sat miscategorized in `spell/`; Foundry's own
`packs/pf2e/spells/rituals/` subfolder signal is discarded by categoryMap.ts); Runes pinned 323
(raw AoN doc count) vs 273 emitted (aonDedup collapse). Track A ran the REAL transform before
trusting any pin, STOPPED with options instead of improvising, and the resolution was "ship the
mechanism as written, amend the pins" (`d7b3100`, the P4 pin-correction precedent). **Final:
`spell/`=2,461 · `ritual/`=201 (145 visible default) · 143 movers = 45 same-slug colliders + 98
fresh-slug (9 renamed-on-remaster among the paired ones — a mover pattern nobody documented) ·
three named regression cases: commune many-to-one, shadow-double/simulacrum fresh-slug,
unbearable-cacophony pairing-less.** Two bonus real bugs fixed in-flight: the crossref/embed
patcher NEVER walked `HazardStats.disable/routine/reset` BlockNode[] fields (latent since P1.6,
exposed when R4 staled `hazard/the-power-of-faith`→`spell/consecrate`); mastheadExtra appended
unconditionally duplicates labels the typed facet headers already render (caught via golden-diff
review; fix = exact-match label dedup per header, recorded as a D29-62 deviation). **Process
finds:** a Track C engineer ran `git stash` in the MAIN tree (Track A's WIP briefly stashed —
restored + line-by-line verified, `stash@{0}` left as recovery artifact, redundant + droppable;
future worktree briefs must say "never run git outside your worktree path"); the spec-drafting
subagent REFUSED a mid-run SendMessage directive as suspected prompt injection (right instinct —
inter-agent messages arrive interleaved with tool results; re-send with provenance context and
judge-by-consistency framing); R10 abbreviations shipped as a client-safe pure `abbreviateBook()`
module because `sources-index.json` is server-only//sources-consumed (the adversarial review's
biggest catch — the spec'd 7-site wiring had NO data path); 24 dual-form PFS scenarios carry two
book-name strings → distinct codes under the injectivity test (relaxable if the stakeholder
objects at H); 40 UNCERTAIN curated abbreviations flagged inline for one-pass review. Perf: byte
weights flat-to-shrinking, interaction latency ~1.5–2× from R10 per-row lookups (memoizable).
R5 glyphs: traced from foundryvtt/pf2e `pf2e-8.3.0`'s `pathfinder-2e-actions.woff2` via
fontTools TransformPen (naive quadratic flattening corrupts the reaction hook), provenance in
`apps/codex/src/ui/ACTIONS-GLYPH-SOURCE.md`, visual-IP legality stakeholder-cleared w/ lawyers.
R6 footer deleted outright — the site now has ZERO global disclaimer, stakeholder-accepted risk.
`2e.iridi.cc` = discrete alias stanza (heart precedent), TLS ~10s, byte-identical SSR both hosts.

_(P4.5, superseded detail:)_ **P4.5 BUILT 2026-07-15 (UX rework + bespoke restyle; spec
`thoughts/astra/specs/0029-codex-p45-ux-restyle-spec.md` D29-46..52, status BUILT; scope
`…/research/2026-07-14-codex-0029-p45-ux-restyle-thoughts.md` + ui-map + style-tokens
companions).** P4's acceptance H was a stakeholder REDIRECT: 5e.tools-style split-column
browse, header nav dropdowns, real landing, kill the legacy checkbox, and a **bespoke
parchment sourcebook style** (the stakeholder's own book, 36 refs at `/home/jbassin/style-ref`
— gothic dropped from codex ENTIRELY, other astra sites untouched). Slices S1 `4831fec` · S2
`a5e448c` · S3 `28b4392` · S4 `fccee40` · S5 `8505e17` · S6 `157f10b`. **THE P4.5 gotchas:**
(1) **TanStack `loaderDeps` is load-bearing** for any search-param-driven loader — without it
the matchId ignores search params, the router reuses the cached match, and the loader silently
never re-runs (`?entry=a`→`?entry=b` = stale pane; verified vs router-core 1.171.14); (2) the
split view needs a **module-memoized category-keyed listing fetch** (pagefindClient idiom) or
every row click re-fetches the full 8,485-row listing — plus **`entry` must be explicitly
resynced through `filterStateToSearch`** (it rebuilds search from BrowseFilterState alone; same
bug class as the old legacy resync); (3) **R5 semantics: the default-hidden set is
`superseded`-only, NEVER `edition!=="remaster"`** — never-remastered legacy-edition content
stays visible (AoN behavior; stakeholder-resolved) — the param is `?superseded=1` with
`?legacy=` as a forever-decode alias (proven byte-identical; **CORRECTED at P5: NO 307/redirect
exists anywhere** — the alias decode is pure client-side in `urlState.ts`, old links render
in-place and the encoder re-emits `superseded` on the next navigation); (4) search NEVER filters superseded (always-both + Legacy
badges; Pagefind needed NO reindex — superseded+edition were already indexed filters, the swap
is query-time); (5) killing the site-wide toggle COLLAPSED all four M4 two-phase hydration
seams (3 routes + SearchPage.tsx) to bare URL reads — no persisted edition preference exists
anymore, per-page URL is the only truth; (6) UA `dialog:modal` centering breaks on tall
content (explicit `position:fixed;inset:0;margin:auto`); jsdom lacks
`HTMLDialogElement.showModal` (test-only polyfill); (7) a session-limit-killed engineer
resumed CLEANLY via SendMessage on its partial tree (re-read own diffs first); (8) codex owns
its 5 ui/ components (TraitPill/ActionGlyph/Input/Button/ErrorChip, exact prop parity) + a
3-bucket traitBucket (rarity→amber, traditions+alignments→purple, else umber) + tokens.css
repointing gothic's var NAMES to parchment values (globals.css untouched-by-rename); tailwind
+ gothicFontsPlugin removed from vite.config (existed only for gothic; codex uses zero
utility classes). Weights for P5: `/rules` 401/79 gz · `/sources` 705/65 · heaviest host
415/80 · `/` 12/3 · `/feat?entry=` 5.81 MB/537 KB · fonts 70.5 KB.

**P5 DEPLOY BUILT + LIVE 2026-07-15 (spec `thoughts/astra/specs/0029-codex-p5-deploy-spec.md`
D29-53..58, status BUILT — spec'd, adversarially reviewed (0 blockers), built S1 `dd42b19` + S2
`7e3e348`, and LIVE on `codex.iridi.cc` in one session; gate H folds the deferred consolidated
stakeholder review into P5's exit, stakeholder-resolved).** THE P5 finds: (1) **the D29-53
identical-path bind-mount convention** — `codex.data-path` (config.kdl) is host-absolute and
consumed VERBATIM at request time in dev and container alike, and plain config fields have NO
env-override (only SOPS `ref=` secrets do) → mount `data/corpus` + `data/search` at the SAME
absolute path in-container, `:ro` (Dagster pipeline-volume precedent, first frontend use;
repointing to a short `/data` would break host-side real-corpus serving); (2) the image is
**corpus-free on the heartwood model** with ONE departure — runtime `COPY fixtures/` so
corpusFs's fail-soft works — and the fail-soft is the #1 deploy trap: **a mis-mount serves a
healthy-looking 2.1 MB fixture site** (one-time console.warn), so any codex deploy check must
assert a real-corpus marker (dragon page + /spell 2,604), never bare 200s; (3) **Pagefind
bundle = 203 MB measured** (fragment/ 184 MB, 46,192 files 1:1 with entities; index/ 18 MB) —
the "~50–55 MB" figure in earlier docs was stale ~4×; total runtime mount ≈ 891 MB, snapshots
601 MB stay unmounted; (4) **refresh-in-prod**: corpusFs caches listings/tree/sources forever
per-process (`entity()` uncached) → `codex-refresh` now ends with a guarded
`docker compose restart codex`; the Pagefind staticMount alone needs NO restart (per-request
fail-soft, proven live via move-aside → 404 → restore → 200); (5) root `.dockerignore` was
missing `apps/codex/data` + `artifacts` — 1.5 GB sat in every sibling's build context since P1,
masked by BuildKit lazy transfer; (6) noindex = THREE layers live (meta since P2 · robots.txt
in `public/` served via the clientDir fallback, favicon-proven mechanism · plain
`header X-Robots-Tag noindex` in the Caddy stanza — first X-Robots-Tag/robots.txt in the repo);
(7) internet scanners found the new host within minutes (404 noise, non-error — expected under
C-1); the wildcard cert minted in ~20 s. Non-astra host residue surfaced, untouched:
`nextcloud-app` crash-looping for months.

**P1 BUILT 2026-07-13** (spec `thoughts/astra/specs/0029-codex-p1-ingest-spec.md`, status FINAL →
all four slices committed same-day by staff-orchestrator + sonnet engineers): S1 `108571d`
(member + fetchers + real snapshots) · S2 `40b2447` (CodexNode/CodexEntity schema, sluggify port,
enricher grammar, HTML parser, assembly+journals — 25,781 Foundry entities) · S3 `8465625` (AoN
markup grammar 29 tags, link table, 243-book licenseMap, facets — 43,631 metas) · S4 `8d66293`
(join + emit + report + 1.8 MB asserted-coverage fixture + `just codex-refresh` + README). Plus
`98bbef9` fix(ontology): main was red pre-existing — the heartwood apply had not re-seeded
entity.kdl (311→313). 503 hermetic tests; CI green.

**P1.5 (2026-07-13, same day) — exit-gate review → AoN-primary rework (spec §8 `12ea536`,
D29-14..18): S5a `eadb218` dedup · S5b `7ccc5c5` equivalence joins · S5c `0210b1c` drop pass ·
S5d `defd586` link repoint.** The review measured the STOP causes full-set (cross-category map
mismatch, rituals hiding in spell, 61/61 domain suffix) → stakeholder chose **AoN-primary**:
keep all AoN-only + merged; equivalence joins ({weapon,armor,shield}↔equipment; class-feature↔
27 class-subsystem cats; action↔{relic,tactic,feat} exact-tier + level-guarded; spell↔ritual;
domain "X Domain"→"X"); **drop every other Foundry-only entity** incl. the four Foundry-only
categories (2,233 dropped) **except the creature/hazard carve-out** (2,242+660 kept). Post-fix:
domain 100% / weapon 95.2% / armor 90.6% / shield 99.2% / spell 99.7%; STOP residue = only the
3 accepted-asymmetry cats (creature-ability 9%, hazard 42.8%, warfare-army 31.8% — measured
no-AoN-counterpart 485/488, 671/675, 15/15); **corpus 46,326 / 627.7 MB**; 550 tests; D-gate 3×.
**THE P1.5 gotchas:** (1) an engineer wrote RAW NUL bytes in a template literal → git treats the
SOURCE file as binary (no diff/blame; `file` says "data") — always `\\u0000` escapes; (2)
cross-category merges broke every inbound AoN link to the consumed id (joinBrokenRef 890→2,634)
— fix at link-RESOLUTION time, NOT pass-5 patch (a crossref string carries no provenance; the
resolver has url→aonId→finalId) → **joinBrokenRef now 0** (the old 890 baseline was the same
disease via qualifier/alias merges; 6,616 repoints: 2,621 cross-category + 3,995 merged), incl.
the legacy-twin silent-mislink case (a twin squatting the old slug swallowed links to the merged
doc); (3) a drop pass needs its OWN post-drop crossref/embed reconciliation (postDropBrokenRef
530 / postDropEmbedBroken 40 — emit Zod validates shape, not referential integrity); (4) the
creature dedup-artifact theory was REFUTED empirically — all 2,242 unjoined-F creatures have
zero AoN counterpart anywhere pre-dedup (pure asymmetry; dedup's real effect = 982 docs, 100%
equipment/item-bonus ES parent-child duplicates); (5) D29-16 deliberately narrowed (orchestrator-
accepted): AoN-name override on cross-category merges only, so domain pages keep "Air Domain";
(6) **the linguist-commit timer PUSHES main** — it carried the engineer's unpushed commits up
mid-review (review-before-COMMIT is the real gate, not review-before-push).

**The corpus (gitignored `apps/codex/data/`) — post-P1.5: 46,326 entities / 627.7 MB.**
_(Pre-P1.5 build facts, still true of the parsers/snapshots:)_ P1 raw output was 50,952
entities / 97 categories / **656 MB**
(spec estimated 100–200 MB — the P5 COPY-vs-bind-mount decision must use the real number).
Transform = 15.4 s wall. Determinism gate proven (three runs, `diff -r` empty). Corpus layout per
D29-3; `corpus/report.{json,md}` is THE acceptance artifact.

**▶ NEXT: stakeholder review of `apps/codex/data/corpus/report.md` (the P1 exit gate)**, esp.
the **9 both-source categories <50% joined (spec §6 STOP condition — re-decide join keys with
Josh BEFORE P2, no fuzzy-matching):** `domain` 0% (systematic: Foundry "X Domain" vs AoN "X" —
one new normalization rule would fix it); `armor` 18%/`weapon` 27%/`shield` 14% (**2026-07-13 review CORRECTED the cause: NOT
"AoN doesn't split tiers" — AoN splits them fine but files magic weapons/armor/shields under its
`equipment` category while categoryMap routes Foundry docs to weapon/armor/shield, so the
category-scoped join never compares them; measured full-set: weapon 634/715 + 33 tier-strip,
armor 142/165 + 9, shield 96/102 + 5 unjoined-F have exact same-slug AoN `equipment` entities →
category-equivalence join projects ≈95/93/99%**); `class-feature` 41%/`creature-ability` 9%
(granularity mismatch — AoN generic names vs Foundry per-creature docs); `hazard` 43%,
`action` 44% (AoN glossary fragments), `warfare-army` 32%. Creature overall 57.6% despite the
dragon-family proof (raw 13.8% → **98.1%** post-normalization); spells 91.7%.

**THE load-bearing empirical finds (don't re-derive):**
- **Packs carry NO `system.slug`** — the pack file basename IS the slug; the ported `sluggify`
  agrees on **28,636/28,636** real docs (154 committed vectors).
- **AoN urls are NOT unique** — 2,269 collision groups (tiered items, class/class-feature
  twins); canonical pick via `_id == {category}-{urlQueryId}`, 62 ambiguous residue.
- **licenseMap = zero unknown residue**: rule = title ends "(Remastered)" → ORC (load-bearing —
  reprints keep ORIGINAL release dates), else earliest `release_date >= 2023-11-15` → ORC else
  OGL; 91 ORC / 152 OGL books, machine-verified transcription.
- AoN `<traits>` blocks DROPPED (53,255): 98.8% duplicate the structured fields; facets win the
  653 disagreements. `<title right=…>` → heading meta. row/column ~187k pairs flattened (far
  above the scope-doc sample); `<image>` 3,193 dropped (not 22).
- `localizedBoilerplate` needed recursive `children` (69/200 real @Localize keys resolve to
  block HTML); lang merge: `en ∪ re-en` covers all 200 keys, re-en wins collisions.
- **Plain crossref targets can't disambiguate renamed collision ids** (`{category}/{slug}`
  carries no provenance) — only `embed` nodes (real uuid/aonId) resolve to `@legacy`/`-2`
  members; 890 crossrefs downgraded brokenRef, report-visible. **(SUPERSEDED at P1.5 S5d:**
  the fix is at link-RESOLUTION time where url→aonId→finalId IS available — repointing cured
  all 890 plus the cross-category class; brokenRef residue is now only the postDrop classes.) 9,994 collisions resolved:
  7,367 `@legacy` + 2,494 `-2` residual (mostly creature — partly an artifact of the AoN
  slug-index one-winner dedup, flagged for P2) + 133 same-edition anomalies.
- Emit-time Zod validation caught 3 real-corpus bugs no unit fixture hit: mid-string `<p>`
  reopen (HTML5 implicit close), actor-relative `@Check dc:@self.level` (NaN), literal JSON
  `null`s needing a `present()` guard — acceptance C's gate earns its keep.
- **Dockerfile manifest ripple = 13 sibling Dockerfiles** (the old "21" was COPY-lines-per-file);
  vp discovers new members automatically, CI needs no edit. `**/codex/data/**` AND
  `**/codex/fixtures/**` are in BOTH `.oxlintrc.json`/`.oxfmtrc.json` ignores (`**/tests/
  fixtures/**` does NOT match `apps/codex/fixtures/`).
- AoN fetch: `search_after` on `name.keyword`+`url` (cluster rejects `_id` sort), per-category
  term queries, ≤4 req/s, UA w/ contact email; snapshot-once. Foundry: blobless sparse clone of
  the pinned tag, `packs/pf2e` ONLY (sf2e out of scope) + ALL `static/lang/*.json` +
  `system.pf2e.json` (repo root) + `src/util/misc.ts`.
- `just codex-refresh` refuses on a dirty `apps/codex` index; refresh is the ONLY corpus-refetch
  path; the committed `corpus-manifest.json` diff is the reviewable event.
- Ops: two background engineer agents were killed mid-S3 by a session usage limit —
  `SendMessage` resume-from-transcript continued them cleanly (files already on disk survive;
  re-establish state by re-reading own files).

**P2 (entity pages) BUILT 2026-07-14** (spec `0029-codex-p2-entity-pages-spec.md` status →
BUILT; one autonomous overnight run, one reviewed commit per slice): **S6 `b174b15`** (P1.6:
npc-only import — 150 `character` pregens excluded, 16 persist as AoN-only twins; typed
`stats` + EmbeddedItem attack/damage/dc/attack/tradition, schemaVersion 2; `_index.json`
rename — corpus **46,192** == manifest exact) · **S1 `031a7fb`** (total renderer + goldens) ·
**S2 `72f224e`** (scaffold + reader + routes) · **S3 `c9d1d3b`** (listings + Popover +
acceptance sweep). A–G met with evidence; **▶ H = stakeholder page review, then spec P3.**

**THE P2 gotchas (don't re-derive):**
- **TanStack Start client-bundle leak class:** ANY export co-located in a `createServerFn`
  file (even one no client code imports) drags its imports into the client bundle — the
  splitter only rewrites the `.handler(fn)` argument. And any module-scope statement that
  CALLS into `node:fs`/`loadConfig` leaks on import. Cure = heartwood's split taken further:
  `corpusFs.ts` (fs, lazy singleton `getCorpusReader()`) ← `corpusFns.ts` (ONLY serverFn
  defs) ← pure logic in its own route-unreachable file (`entityPageData.ts`). Verify by
  byte-searching the built client bundle for `readFileSync`/`loadConfig`.
- **`import.meta.dirname`-relative paths break under `vite build`** (module relocates to
  `dist/server/assets/`) — the built server's fixture fallback silently pointed at a
  nonexistent dir and 500'd. Cure = upward marker-walk (`findAppRoot`, the `findRepoRoot`
  idiom).
- **Two engineers hardcoded plausible-but-wrong game data; only corpus cross-checks caught
  it:** inlineAction "all single-action" allowlist was wrong 11/39 ways (grab-an-edge is a
  REACTION, pick-a-lock 2 actions, 9 passive activities) — the corpus's own
  `action/<slug>.json` `facets.actionCost` is the ground truth; and per-request Zod crept
  into the reader against D29-23's explicit NO (46 parses/request on class pages).
  Orchestrator review-before-commit caught both.
- **`blockquote` is corpus-extinct post-D29-19** (its only 8 nodes lived in pregen docs) —
  renderer stays total (synthetic unit test); `extract-fixture.ts` `KNOWN_EXTINCT_KINDS`
  asserts extinction by full-corpus scan both ways.
- One upstream pack typo (unterminated `@Check[...` in a PFS hazard's `disable`) forced the
  ONLY fail-soft in the transform: `hazardStatsHtmlFailed=1`, field omitted, report-visible;
  entity `body` keeps hard-fail.
- Popover port needs akasha's CSS too (component carries none); mount on entity routes only
  (8k-row listings would thrash). Feat listing = 4,438,105 bytes (spec's ~4 MB estimate);
  loader payload trimmed to rendered fields (drop `traits` from rows).
- Agent ops: a mid-slice API-error/session-limit death is cheap — `SendMessage` resumes from
  transcript with files intact; a small fully-specified review fix is faster done by the
  orchestrator than a resume.

**P3 SPEC FINAL 2026-07-14 `242ee0c`** (`0029-codex-p3-browse-search-spec.md`, D29-32..38;
adversarially reviewed, 3 blockers folded). Stakeholder decisions: **5e.tools-depth facets
everywhere** (data-derived; classifier + pinned big-12 sets) · omnibar + `/search` page ·
**legacy hidden by default behind a site-wide toggle** · **full rows client-side, filter
locally** · extractor gap closed for all 5 categories · `creature.family` populated from AoN.

**P3 BUILT 2026-07-14 — ALL FIVE SLICES same-day** (staff-orchestrator + sonnet engineers, one
reviewed commit per slice; spec build record carries per-gate evidence): S1 emit extensions ·
S2 Pagefind index+mount · S3 faceted browse · S4 omnibar+/search · S5 sweep+docs. A–G met;
**acceptance H (ONE consolidated stakeholder review: browse + P2-H spot-set w/ M7/M11
expected + search w/ the heal limitation) was deferred AGAIN at P4-spec time → it now folds
into P4's exit gate.** Decisions closed in-build: D29-36 traits filter KEPT (176 KB); feat listing
4.49 MB/465 KB gz accepted (P2 weight class); NO creature-saves trim (61 ms interaction);
index-envelope 11.31 MB accepted (spec's 10.23 MB predated required `superseded` + gap facets).

**THE P3-build gotchas (don't re-derive):**
- **Pagefind `writeFiles` is NOT idempotent against a pre-existing outDir** — stale
  content-hashed fragments accumulate on every re-run (two fragments both claiming
  `/spell/heal` after a 2nd build); `build-search.ts` rm-rf's before write. Any pre-fix index
  dir is silently polluted — rebuild.
- **`meta.title` carries NO ranking weight on the `addCustomRecord` path** (display-only);
  weight-span injection into content doesn't move rankings at 46k scale AND leaks raw
  `data-pagefind-weight` attribute text into excerpts (window anchors inside the span exactly
  when the query matches the name). Single-common-word name queries ("heal" → not top-40 of
  2,676) are an accepted Pagefind TF limitation; distinctive names rank fine. Don't re-attempt.
- **`vite dev` does NOT serve site-kit staticMounts** (createSsrServer-only) — anything
  touching `/pagefind/` needs `pnpm build` + the production server.
- **Comma-bearing facet values shred a naive CSV URL codec** — creature.family "Dragon,
  Black" ×380 + source.book ×240; backslash-escape at the string level (post-percent-decode);
  byte-identical for comma-free values.
- **The SSR legacy-flash pattern:** a shared `?legacy=1` link must render legacy content in
  SSR HTML — first render reads `search.legacy` isomorphically (the live-toggle store's server
  snapshot is always false), the live toggle takes over only post-hydration. And the URL-wins
  seed must run at MODULE-EVAL time, not an effect (children's effects fire before the root's
  — a route's URL-reflect effect would strip the param before a root-effect seed ran).
- **Two hydration-mismatch classes only the at-HEAD sweep caught:** (1) an inline resolved
  embed renders a block `<div class=codex-embed-card>` inside `<p>` → the B2 paragraph guard
  must consult `embedRendersAsBlock` (the exact renderEmbed conditions, factored); (2) a
  pre-hydration script that stamps `<html>` needs `suppressHydrationWarning` on `<html>`
  itself, not just `<body>`.
- **`statsText` is NOT category-agnostic post-S1** — gap extractors put hp/size on
  ancestry/class/vehicle; the search build gates it to creature/hazard or spurious "HP 8"
  fragments get indexed.
- **No browser MeterProvider exists in astra** (@astra/observe/web = traces only) — a client
  RUM *metric* is really a fire-and-forget serverFn incrementing the server meter (every repo
  lazyCounter site is server-side).
- A global vitest `jsdom` default breaks an unrelated `import.meta.url` test under vp's
  concurrent run — DOM tests carry per-file `@vitest-environment jsdom` docblocks.
- Hermeticity checks must rename `data/` OUT of the tree (`/tmp`) — an in-tree rename makes
  the vendored snapshots visible to lint (false-fail).
- The in-cluster OTLP hostname doesn't resolve from host-run processes; the host-published
  collector port works for local smokes (`localhost:10353`).

**THE P3-spec measured facts (empirical, this session — do not re-derive):**
- **Pagefind 1.5.2 probe over the REAL 46,192-entity corpus:** build 33.0 s; bundle 49.1 MB
  apparent (46,192 fragments avg 648 B; 536 index chunks avg 32 KB max 341 KB; meta 316 KB);
  cold-start ~470–535 KB, warm query ~35–100 KB; **native indexer peak RSS ~3.8 GB** (matches
  public 30k–100k-page OOM reports) → **index build is HOST-ONLY** (`just codex-search-index`),
  never CI/Docker. `addCustomRecord` takes structured `filters`/`meta` (no HTML round-trip);
  Pagefind filters are string-equality ONLY (no numeric ranges); its zero-result prefix
  fallback is truncation recovery, NOT typo tolerance.
- **Facet analysis (all 88 cats):** `facets` exists ONLY on Foundry-merged entities — coverage
  ceiling = 1 − proseOnly, all-or-nothing per entity; 15/88 categories carry any facets,
  75/88 are core-only (level/rarity/traits/source/edition); `featLevel`/`rank` are PROVEN
  exact `level` duplicates; **trait casing is edition-coupled** (remaster lower, legacy
  Title-Case): 1,082 raw → 644 case-folded — fold or the trait filter fragments; price 100%
  parseable to copper (`per 10` batch suffix divides); `usage`/`itemCategory` mean different
  things per category (weapon.usage card 4 vs equipment.usage 116) — never share defs by key
  name; size uses Foundry abbreviations (`med`/`grg` — label map); level spans **-2..28, 31
  values**; `superseded` (`remasteredAs` non-empty) = **11,012** (10,970 legacy + 42
  remaster) — NOT P2's 7,152 legacy-pair figure (different question); source.book 519
  distinct. **5-cat extractor gap** (background/heritage/ancestry/condition/class have merged
  Foundry data, zero facets extracted).
- **THE codec find (verified empirically):** TanStack Router's default search parser follows
  the `URLSearchParams` convention — a bare `+` in a param value decodes to a SPACE, and bare
  numerics coerce to JS numbers. Tri-state URL sigils must be no-marker=include /
  `-`=exclude; `validateSearch` must accept `1` as number.
- site-kit `StaticMount` fails soft PER-REQUEST (`isFile` in the fetch handler) — register
  mounts unconditionally; an index built after server start comes online with no restart.
- Enriched compact `_index.json` measured 10.23 MB raw / 1.12 MB gz total (compact-vs-pretty
  alone saves 31%); creature compresses worst (+42.5% gz, near-unique stat ints) — accepted.
- Process: no external octo providers on this host — orchestrate.sh probe hard-stops; the
  sanctioned fallback is in-house agent research + a separate adversarial-review agent (P2
  precedent). The octopus state-manager drops a `.claude-octopus/` state dir in the repo
  ROOT — delete it, don't commit it.

**P4 SPEC FINAL 2026-07-14** (`0029-codex-p4-rules-browser-spec.md`, D29-39..45;
staff-orchestrator + two in-house research agents + adversarial reviewer — 3 blockers +
9 minors + 3 nits ALL folded). Stakeholder decisions: **`/rules` = tree browser** (the P3
flat listing for rules dies) · **superseded predicate in-tree** (Dark Archive 29/29 +
Guns & Gears 65/65 are 100% superseded → "all N hidden" collapsed headers, never dropped) ·
**attached sidebars on ALL categories** · **`/sources` index + mechanical book-name
normalize** (no hand-curation; residual splits accepted). H folds into P4's exit gate as
ONE consolidated review (P2-H + P3 + P4). ▶ NEXT: `octo:embrace` P4 S1.

**THE P4-spec measured facts (empirical — do not re-derive):**
- **⭐ AoN `next`/`previous` links are per-level SIBLING chains, NOT page-turn order** (THE
  adversarial find — the draft's ordering algorithm + pager were wrong): 0/3,642 hops
  descend into a subtree (2,656 same-depth + 986 shallower); 780 fork targets (always
  ancestor/descendant sets); 986 prev/next asymmetries; **106 hops cross book boundaries**.
  Usable ONLY restricted within one sibling group (head = the member no other member
  targets; unchained members alphabetical after). The pager derives from the tree's DFS
  pre-order instead; NO `readingOrder` entity field exists.
- Rules 3,645 (2,033 legacy/1,612 remaster; superseded 1,288): raw breadcrumbs 96% — the
  145 absent ARE the roots (~40 childless single-node trees, their names never appear as
  anyone's bc[0]); depth ≤6 modal 3; **trees scope per (book, path)** — generic chapter
  titles recur verbatim across the 45 books ("Chapter 1: Introduction" = 116 CRB + 109 PC).
  Parent resolution = path-prefix rule + name-only/root-preferring fallback (rescues Divine
  Mysteries "Rules Elements") + **lowest-aonId tie-break** (2 duplicate (book,name,path)
  groups in APG make determinism flap otherwise) → synthetic nodes pinned == 3.
- 192 breadcrumb strings carry embedded `\r\n` (GMG "Chapter 2: Tools" children ×192 +
  "Building Creatures" ×47) — normalize at extraction or the tree forks. Legacy↔remaster
  pairs can CHANGE path entirely (Counteracting: Ch9/General Rules → Ch8/Afflictions).
- Sidebars 689 (694 raw = 1 empty-name + 4 same-(slug,url) dedup): NO breadcrumbs, NO
  next/prev (0/694); attachment = the sidebar's own `url` == host page url (689/689
  resolve, rules 361, max 7/host); **65 host urls are SHARED by multiple entities (class
  page vs its 60+ class-features) → resolve via pickCanonical page-owner → aonId → pass-4
  `aonIdToFinalId`; the S5d parse-time repoint seam returns PRE-collision ids — wrong for
  any P4 url-keyed join.**
- Sources: `primary_source_category` present on 43,684/43,684 AoN docs (product-line signal
  total for AoN-cited books); 519 `source.book` strings = 276 Foundry-only + AoN's; the
  `"Pathfinder "+name` prefix rule merges only 23 → **"Other" bucket ≈253 books / 5.4% of
  entities EXPECTED** (renders last + collapsed). **Book-level edition needs the
  "(Remastered)" title override** — Treasure Vault (Remastered)'s docs measure 57 legacy/12
  remaster off the shared release_date; Foundry-only books get license "unknown" (explicit
  pill, never guessed OGL). `/sources` (aggregate index) and `/source` (the 245 book-entity
  faceted listing) BOTH remain, recorded.
- Frontend: codex has NO sidebar today — P4 introduces the first via a route-local
  `RulesLayout` (never a `__root.tsx` retrofit); akasha Explorer = the repo's only tree
  precedent (portable pure parts: `ensureFolder` in akasha `site.ts:327`, `explorerState`'s
  `computeOpen` w/ the SSR-safe two-phase seed); a static `/rules` route out-ranks
  `$category` safely while `/rules/{slug}` still falls through ($category/$slug).

**P4 BUILT 2026-07-14 — same day as its spec** (staff-orchestrator + sonnet engineers, one
reviewed commit per slice): S1 `0e75391` (transform: breadcrumbs threaded, sibling-chain tree,
sidebar reverse-join, book normalize 519→496, both artifacts, fixture regen, host index
rebuild) · S2 `c9ad9d1` (`/rules` tree browser, akasha computeOpen port, quick-filter, legacy
counts) · S3 content in `b71d3f4` + marker `a3184ce` (trail + RulesLayout first-sidebar +
DFS pager; see the timer gotcha below) · S4 `65036ba` (AttachedSidebars on all categories +
`/sources`; `categoryCounts` added to sources-index.json — spec gap, closed additively w/
determinism re-proven) · S5 `43caa6c` (A–G sweep, README P4 section, spec → BUILT).
Codex 1,362 tests; both lanes green incl. hermeticity. **▶ H = ONE consolidated stakeholder
review (P2-H spot-set w/ M7/M11 expected + P3 browse/search w/ heal limitation + P4
tree/sidebars/sources), then `octo:spec` P5 (deploy).**

**THE P4-build gotchas (don't re-derive):**
- **The linguist-commit timer race is REAL at second granularity:** it fired BETWEEN the
  orchestrator's `git add` and `git commit` in one shell invocation, sweeping the staged S3
  slice into a mislabeled `chore(mouthpiece)` auto-publish commit (`b71d3f4`) AND pushing
  it. Recovery = `--allow-empty` marker commit with the correct message (`a3184ce`), never
  force-push. Since then: `systemctl --user stop linguist-commit.timer` around every commit
  window, restart + `is-active` after.
- **The P1.5 raw-control-byte gotcha RECURRED twice** (S1 `ingest/rulesTree.ts` NUL+SOH,
  S2 `treeModel.ts` NUL, as key separators in template literals) and review missed it both
  times because (a) NEW untracked files show no diff line to expose "Bin", and (b) **the
  Read tool silently swallows control chars** — the source looked clean. Detection =
  `perl -ne 'print "$ARGV\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/'` sweep; fix = unicode
  escapes (`\\u0000` in source), byte-identical runtime strings.
- **The spec's synthetic-node pin (3) was WRONG — measured 2 is correct** (amendment in
  spec §4 S1): the "Divine Mysteries → Gods & Magic" case counted a PATH-CONTEXT element,
  not an immediate parent; a real breadcrumb-less "Gods & Magic" doc exists
  (`/Rules.aspx?ID=798`) and resolves its 5 children; DM's "Rules Elements" children are
  the fallback-rescued case. Lesson: a materializability estimate over every (book,
  parent-name) pair is a COARSER question than immediate-parent resolution — verify pins
  against the algorithm as specified before treating a mismatch as an implementation bug.
- **Hermeticity-masked test class:** an S2 ssrSmoke assert (`/rules` root renders as link)
  passed ONLY because the real corpus was present — the fixture's GMG root is `superseded`
  so legacy-off prunes it; caught by S4's hermetic run, fixed by asserting under
  `?legacy=true`. Every new SSR assert must pass with `data/` renamed OUT of tree.
- `pruneForLegacy` gained `currentId` (S3): the entity-page sidebar must never prune the
  page you're standing on even when it's superseded and the toggle is off.
- `send`'s static traversal guard 403s on a literal `".."` SUBSTRING in the configured dir
  string even when the path resolves inside the root — `path.resolve` dirs before handing
  them over (bit an S5 throwaway driver script, not app source).
- Local telemetry smoke recipe: call `initTelemetry("astra.codex", {endpoint:
  "http://localhost:10353"})` BEFORE `createSsrServer` (the module-singleton state guard
  makes the first call win over config.kdl's in-cluster endpoint), then verify via the
  `signoz_*` MCP tools — 64 spans / all 3 new routes confirmed this way.
- P4 weights (feed P5): `/rules` 393,058 B / 78,044 gz · `/sources` 696,918 / 63,869 gz ·
  heaviest 7-sidebar host (`rules/building-creatures@legacy?legacy=1`) 378,215 / 77,866 gz ·
  tree-toggle latency avg 35 ms. Corpus artifacts additive only — NO search-index rebuild
  needed for breadcrumbs/attachedSidebars/sources changes (statsText/meta untouched).

Docs: viability `…/research/2026-07-12-codex-0029-viability-thoughts.md` + scope
`…/research/2026-07-12-codex-0029-thoughts.md`. Builds on [[portal-0023-gotchas]] (pf2e document
model) + [[akasha-frontend-0011-gotchas]] + [[strider-0016-gotchas]] (template) +
[[heartwood-0020-gotchas]] (corpusFs/Fns split precedent) + [[config-single-source]] +
[[no-silent-scope-cuts]].
