# 0030 assay — homebrew → codex ingest ("Liturgy of the Iridite Vol.2") — NLSpec

**Status:** BUILT + DEPLOYED + LIVE (2026-07-24, §5) — was FINAL after adversarial review ×2 (mechanism + surfacing lenses);
**3 blockers + 12 minors/nits ALL folded below.** Blocker catches: (B1) the draft's
`origin:"homebrew"` entity marker would hard-fail the `.strict()` `CodexEntitySchema.parse` at
emit for all 175 docs → replaced with a `homebrewIds` set parameter on `applyAonPrimaryDrop`;
(B2) a `homebrew` key on `corpus-manifest.json` throws at `parseManifest` (`.strict()`,
`{schemaVersion,foundry,aon}` only) **before the transform starts** → the pin moved to
report.json/report.md; (B3) `@UUID` resolution needs the official Foundry `UuidIndex` threaded
into the homebrew assembly ctx, else all 70 ref-bearing docs downgrade to `brokenRef` and gate A
fails. Key minor catches: the trait detail page does NOT list its spells (it renders copy + a
`TraitCrossNav` link to `/search?traits=<slug>` — goal/gates restated); codex `sluggify` strips
apostrophes while store basenames hyphenate them → **17/175 ids diverge** (possessives —
store basenames win, expect exactly 17 `slugMismatch` reports); the collision sweep was vs the
1,144 pack spells = a PROXY of the 2,461-spell emitted corpus (~1,300 AoN-only docs unchecked)
→ full-id-space pre-check + the guard widened to the pre-drop official id space; a stray
`level` on a trait source doc would flip a Lvl column onto all 915 /trait rows (invariant + test);
the sources-index override must key on the post-`bookNormalize` string; the abbreviations
fixture proves nothing about new books (add LotI2 + a direct assertion); fixture homebrew source
must be emitted by extract-fixture, not hand-spliced (P12); copy approval gates the trait-JSON
content commit specifically. Reviewer-verified foundations: spell facets
(traditions/castTime/range) come from the Foundry `system` via `extractFacets` — NOT the AoN
side — so homebrew rows are fully filterable; Foundry-only books unconditionally get
sources-index entries (that's how the ~253 "Other" books exist), so the productLine override
acts at the correct layer; empty `traditions:[]` on the 3 rituals is Zod-valid;
`bookNormalize`/`sidebarAttach`/`augmentClassStats`/`levelDefault` all pass homebrew through
harmlessly; the book URL codec handles the spaced title; no existing test pins break.

**Stakeholder scope (scoping doc `thoughts/shared/research/2026-07-24-assay-homebrew-codex-ingest-
0030-thoughts.md`, R0–R4 all RESOLVED 2026-07-24; store-side prerequisites ALREADY APPLIED:**
`9d72157` Time Jump → Stolen Moment rename · `ef5de24` publication title → "Liturgy of the Iridite
Vol.2" adapter+store lockstep**).** The 175-spell canonical homebrew store
(`apps/assay/homebrew/spells/`) enters the codex corpus as a Foundry-only source and surfaces on
`codex.iridi.cc` alongside official content: 172 → `spell/`, 3 structural rituals → `ritual/` (R2),
plus 8 authored school `trait/` docs (R4), a pinned "Homebrew" product-line group (R3), and the
"LotI2" abbreviation (R0).

**Empirical pins (verified 2026-07-24, main `61cbf73`; review-corrected):** store = 175 docs,
uniform `{name,_id,flags,type:"spell",system}`, no `img`/`folder`; `system.publication` uniform
`{license:"OGL", remaster:true, title:"Liturgy of the Iridite Vol.2"}`; `flags.assay.{seededFrom,
adapterWarnings}` on all docs (assay-internal — never enters the corpus); exactly one school
trait per doc (memetics 30 · kosmoturgy 28 · chronomancy 28 · planara 25 · gestalt 23 ·
antillurgy 22 · mercuromancy 18 · seraphic 1 [= Worldweaver]); rituals = exactly the 3 docs with
`system.ritual` (hellforging/overhaul/worldweaver — also the only 3 with `traditions:[]`;
cast-time text is NOT a ritual marker); `@UUID[…conditionitems…]` refs on **70**/175, zero
`@Damage`/`@Check`; **codex-`sluggify`(name) ≠ basename on 17/175** (possessive apostrophes:
sluggify strips `'`, basenames hyphenate — ids freeze to the store basenames, D30-42);
collision sweep vs the 1,144 pack spells found zero (post-rename) — **a proxy population**; the
full 2,461-spell + 201-ritual + 907-trait emitted id space is checked at build (D30-43, M3).
"LotI2" absent from the 243 curated abbreviation codes (manual claim → automated in S3). Corpus
today: spell 2,461 · ritual 201 · trait 907 · schemaVersion 5. **Count expectations (NOT pins —
re-derive by running the real transform at build; unexplained delta = STOP with options):**
spell → 2,633 · ritual → 204 · trait → 915.

## 1. Goal

After this round, `codex.iridi.cc` serves the homebrew set as first-class corpus content: every
store spell has a detail page + listing row (Source = "Liturgy of the Iridite Vol.2", abbreviated
LotI2 in rows/pills; citation always full title), the 3 rituals browse under `/ritual`, the 8
school traits are linked `trait/` pages (approved copy + the standard "everything with this
trait" search cross-nav — NOT an in-page spell list; that's how official trait pages work),
`/sources` + the Source facet group the book under a pinned "Homebrew" product line, and search
finds all of it. Official content is byte-untouched. The store remains the single source of
truth — codex reads it, never writes it; stakeholder edits keep flowing through the established
store→revisions.md workflow.

## 2. Decisions

- **D30-42 The homebrew source + loader.** New `loadHomebrewSide` in the transform: walk the
  committed store (`apps/assay/homebrew/spells/*.json`) via a new `TransformPaths.homebrewDir`,
  resolved repo-relative from `import.meta.dirname` exactly like the `join-aliases.json`
  precedent (`scripts/transform.ts:583`) — NOT via `cfg.codex.dataPath` (versioned repo content,
  not fetched data; config-single-source is not violated). **Host-run only — the codex Docker
  image never contains `apps/assay`; no in-container refresh may be wired.** Docs assemble
  through the existing `assembleFoundryEntity` (packDir `"spells"`, docClass `"Item"`) — no
  parallel assembly logic. **Runs AFTER `loadFoundrySide` and assembles with
  `makeCtx(foundry.index, new Map(), report)`** so `@UUID` refs resolve against the official
  `UuidIndex` (B3; empty localize map is fine — zero `@Localize`/`@Damage`/`@Check` in the
  store). License/edition resolve from the store's own `system.publication` (OGL/remaster).
  **Slug/id convention: the store file basename IS the slug** (canonical-store convention; the
  17 possessive-apostrophe names where codex `sluggify` disagrees keep their basenames —
  `spell/almonk-s-arcane-drain` — and fire exactly 17 expected `slugMismatch` reports, gate A).
  Walk order sorted for determinism. `flags.assay.*` never enters the emitted doc.
- **D30-43 Category routing + drop posture + collision guard.** Homebrew entities never enter
  the AoN join (no match attempt, no `aonUrl`, no `legacyOf`/`remasteredAs` ⇒ `superseded:false`
  by construction). All 175 assemble as `category:"spell"` (mapCategory sees (spells, spell));
  the 3 docs bearing `system.ritual` then get a **post-assembly rebuild of BOTH `category` and
  `id`** (`spell/hellforging` → `ritual/hellforging`); the collision guard runs on the
  post-reroute ids. **The drop keep-arm is an id-set parameter, not an entity marker (B1):**
  `applyAonPrimaryDrop` gains `homebrewIds: ReadonlySet<string>` (signature + the transform call
  site + drop tests); the arm keeps a homebrew id before the AoN-backed/carve-out decision, so
  official Foundry-only spells stay dropped. **Hard guard (M3-widened):** every homebrew final
  id is checked against the FULL official id space — the pre-drop assembled Foundry set AND the
  post-drop emitted set (spell + ritual + trait + everything) — a hit is a transform ERROR
  naming the id, never a silent overwrite (`emitCorpus` has no dup-id guard of its own; a
  homebrew-vs-DROPPED-official collision would otherwise flip an official doc's `brokenRef`
  bytes — the one Gate-B drift vector). **A first-real-run throw is an expected possibility**
  (the pin population was a proxy) → STOP with options; it may force another rename.
- **D30-44 The 8 school trait docs.** New committed source
  `apps/assay/homebrew/traits/<token>.json` — **ids are the literal trait tokens** (memetics,
  kosmoturgy, chronomancy, planara, gestalt, antillurgy, mercuromancy, **seraphic** — NOT
  display names; `trait/worldweaver` would dangle the Worldweaver pill). Shape
  `{name, description:{value:"<html>"}}` **and nothing else — no `level` field, ever** (a level
  on any trait row flips `categoryHasLevelCoverage("trait")` and puts a Lvl column on all 915
  /trait rows; S1 adds a test asserting the /trait column set is unchanged pre/post).
  `loadHomebrewSide` assembles them into `trait/<token>` entities: `edition:"remaster"`,
  `source:{book:"Liturgy of the Iridite Vol.2", license:"OGL"}`, body from the HTML,
  `traits:[]`, no `proseOnly` (AoN-join provenance; homebrew rides the D30-43 arm). The trait
  page renders header + copy + the existing `TraitCrossNav` → `/search?traits=<token>` (no
  in-page listing; the search view is the roster). Copy is staff-drafted from each school's
  spell corpus and **stakeholder-approved BEFORE the `traits/*.json` content commit lands** —
  loader/fixture scaffolding may land first (shape-dependent only), the content commit is
  approval-gated so unapproved copy never sits in git.
- **D30-45 Surfacing: product-line group + abbreviation.** `sourcesIndexBuild.ts` gains a small
  committed override map (book → productLine) consulted BEFORE the AoN majority vote — **keyed
  on the post-`bookNormalize` FINAL book string** (for LotI2 the normalized form is the literal
  title; assert this in the unit test so future punctuation can't silently miss); single entry:
  LotI2 → "Homebrew". `sourcesModel.ts`'s `PINNED_PRODUCT_LINE_ORDER` appends "Homebrew" LAST
  (before the trailing "Other" bucket — appending is required: unpinned it would sort
  alphabetically among future lines); both `/sources` and the FacetPanel Source group inherit
  through the existing data path (no request-time special case). `abbreviations.ts` gains one
  `CURATED_MAP` entry: "Liturgy of the Iridite Vol.2" → "LotI2". **S3 must add the automated
  backstop the fixture doesn't give** (the 496-book fixture is only read by its own test and
  never regenerates): add the LotI2 title to `bookNames.fixture.json` (→ 497, so the collision
  test actually exercises the new code) + a direct `abbreviateBook(...)==="LotI2"` assertion +
  an explicit unit test of override→"Homebrew"→pinned-last (the synthetic fixture corpus won't
  exercise the real-title override path — don't rely on it). No other surfacing changes: Source
  options derive live from `row.source.book`; traits filter, Spark edition icon, full-title
  citation, search `book` meta all work as-is (review-verified).
- **D30-46 Report + determinism (manifest pin DROPPED — B2).** `corpus-manifest.json` is
  `.strict()` `{schemaVersion,foundry,aon}` and MUST NOT gain a key (parse-crash before the
  transform starts). The homebrew provenance pin `{dir, count, sha256}` (via the existing
  `hashDirectory`) goes in `report.json` + a `report.md` homebrew section instead: docs in /
  emitted per category / trait docs / `@UUID` refs resolved-as-crossref vs brokenRef (expected
  70 resolved / 0 broken) / the 17 expected slugMismatches / collision-guard result. The
  double-run byte-diff determinism gate extends over the new source automatically
  (`runTransform` stays a pure function of `TransformPaths`).
- **D30-47 Fixtures + tests.** The synthetic homebrew fixture source is **emitted by
  `extract-fixture.ts` as an independent `fixtures/raw/homebrew` source** (P12: hand-spliced
  fixtures get wiped by canonical-coverage sweeps), and `TransformPaths.homebrewDir` is
  exercised by the existing determinism test: ≥4 synthetic docs covering a plain spell, a
  `system.ritual` ritual, a `@UUID` ref bearer, and a school-trait doc; plus a NEGATIVE-path
  fixture asserting the D30-43 collision guard throws (hand-authored inside extract-fixture —
  it cannot come from the collision-free real store). Unit/integration coverage: loader walk +
  sorted order, ritual reroute (category+id), drop exemption (homebrew kept, official
  Foundry-only spell still dropped), collision guard both id spaces, emit Zod validity,
  sources-index override + pinned order, abbreviation assertions, /trait column-set invariant,
  determinism ×2. ssrSmoke: the 7 pre-existing fixture-env fails ride unchanged; no new fails.
- **D30-48 Deploy.** Staged per codex precedent: build image FIRST (server+client code changes:
  sourcesModel/abbreviations/sourcesIndexBuild) → run the real transform on the host → verify
  gate-A counts vs the re-derived expectations → host-only Pagefind reindex → `just up`
  (blanket is the default; codex-scoped only if a concurrent session appears) → live gates →
  SigNoz check. `just codex-refresh` needs no recipe change (review-verified: the transform is
  host-run via pnpm, the path is a `main()`-computed constant; its dirty-tree guard covers
  `apps/codex` only — informational, the store is committed). Record the measured degraded
  window.

## 3. Validation gates

- **A (counts, re-derived):** transform reports homebrew in=175+8 → emitted 172 `spell/` + 3
  `ritual/` + 8 `trait/`; corpus totals match the re-derived expectations; collision guard
  green over BOTH id spaces; `@UUID`: 70 docs resolve as `crossref` (verify kind, not just
  0-broken) / 0 `brokenRef`; **exactly 17 `slugMismatch` reports** (the possessive-apostrophe
  set — 0 or ≠17 is a STOP).
- **B (official no-drift):** official corpus docs byte-identical pre/post (set-diff over doc
  paths + content hashes in single-process Python — never bare `diff`, per
  [[shell-output-reliability]]); allowed deltas ONLY: new homebrew docs, `_index.json` of the 3
  touched categories, `sources-index.json`, report files. **The allowed-delta list is a
  tripwire: ANY official content-hash change halts the round** (the known residual vector is a
  homebrew id shadowing a dropped official id — D30-43's widened guard should have caught it
  first).
- **C:** emit-time Zod 100% (the existing `CodexEntitySchema.parse` hard gate).
- **D (determinism):** double-run byte-diff clean, fixture + real corpus.
- **E (CI):** both lanes green locally (codex TS lane; assay py lane untouched — trait-source
  JSONs are data).
- **F (live, through the edge):** a homebrew spell page renders (school pill links
  `/trait/<token>`; citation shows the full book title; NO AoN link; Spark edition icon);
  `/spell?book=Liturgy of the Iridite Vol.2` filters to 172 rows; `/ritual` lists
  hellforging/overhaul/worldweaver; `/trait/chronomancy` renders approved copy + its
  trait-search link resolves non-empty (28 chronomancy spells); `/sources` shows the pinned
  "Homebrew" group last with LotI2 → per-category links; Source facet group present; LotI2
  abbreviation in listing rows; search finds "Stolen Moment"; official spot-checks unchanged
  (fireball page + one ritual + one trait).
- **G:** SigNoz 0 ERROR / 0 error traces over the deploy window.
- **H (stakeholder):** trait-page copy approved BEFORE the traits content commit (D30-44);
  post-live review of the homebrew surface rides the standing consolidated codex gate H.

## 4. Slices (serial, one engineer + one reviewed commit each)

1. **S1 — ingest:** D30-42/43/46 loader (UuidIndex-threaded), ritual reroute, keep-arm
   (`homebrewIds` param), widened collision guard, report section; D30-47 extract-fixture
   homebrew source + tests + /trait column-set invariant; determinism proof. (Touches
   `apps/codex` only.)
2. **S2 — school traits:** draft the 8 copy blocks → **stakeholder approval checkpoint** →
   commit `apps/assay/homebrew/traits/` (content commit is approval-gated; scaffolding may
   precede) + trait assembly in the loader + fixtures.
3. **S3 — surfacing:** D30-45 sources-index override (normalized-key assert) + pinned group +
   abbreviation + the automated backstops (fixture 497, direct assertions, override unit test).
4. **S4 — sweep + deploy:** gates A–E locally, D30-48 staged deploy, live gates F–G, build
   record §5, RESUME/memory checkpoint.

## 5. Build record (2026-07-24 — BUILT + DEPLOYED + LIVE in one session)

**Slices:** S1 `b09a0d6` (loader/reroute/keep-arm/guard/report/fixtures; 2,363 codex tests
passing, 7 pre-existing ssrSmoke fixture-env fails ride) · S2 `8e4f1a1` (8 trait docs + trait
assembly; revisions.md re-proven byte-identical, 121 deviations; the extract-fixture virt-* wipe
struck again and was surgically restored per memory) · S3 `37de595` (override + pinned group +
abbreviation + backstops; all 324 curated keys verified fixture-covered pre-change) · S4
orchestrator-run: rename `633b843`, license fix `cd3ed04`, dagster COPY fix, deploy.

**Stakeholder process amendment (recorded):** mid-build the stakeholder delegated the D30-44 copy
approval and all remaining decision points to END-REVIEW ("go with your lean, tell me after") —
the 8 copy blocks are staff-authored (grounded in a full-store characterization pass) and shipped
without pre-approval; gate H's copy approval converts to the stakeholder's end review.

**The predicted M3 throw HAPPENED (first real run):** homebrew Glitterdust collided with
`spell/glitterdust` — the LEGACY Core Rulebook doc (AoN-only `proseOnly`, superseded →
Revealing Light), exactly the ~1,300-doc population the pack-only sweep couldn't see. Full-space
rescan found it was the ONLY collision (183 ids vs 44,799). Resolution per the R1 posture:
renamed **Glimmerdust** (`633b843`; seededFrom pairing held; revisions 121→122 — glitterdust
had been deviation-free). The guard did precisely its job: named throw, zero corpus writes.

**Two unplanned fixes, both recorded:** (1) `/sources` rendered "License unknown" for LotI2 —
`deriveBookLicense`'s two tiers both require AoN-side presence → `BOOK_LICENSE_OVERRIDE`
(`cd3ed04`, same committed-override posture, unit-tested); a gap both adversarial reviews
missed. (2) `just up` failed on the DAGSTER image: `uv sync --frozen` requires every lock
member present and `dagster/Dockerfile` never gained `COPY apps/assay` when assay joined the
workspace (0030 R1) — latent since then, surfaced by the first blanket rebuild; fixed (+7 MB
context, no .dockerignore issue).

**Gate evidence:** **A** homebrew in 175+8 → emitted 172 spell + 3 ritual + 8 trait;
collisionGuardOk; slugMismatch EXACTLY 17; uuidRefs 192 resolved / 0 broken (192 = ref
occurrences across exactly 70 docs — the spec's "70" was doc-count; independently re-counted,
both true); corpus spell 2,633 · ritual 204 · trait 915 · total 44,982 = 44,799 + 183. ·
**B** pre/post sha256 manifest (single-process Python): 183 added = exactly the homebrew set,
0 removed, changed = exactly the 7 allowed files; every official doc byte-identical. ·
**C** emit Zod 100% (transform exit 0). · **D** real-corpus determinism ×2: 45,075 files
byte-identical. · **E** typecheck 32/32, oxlint `--threads=4` clean, oxfmt clean, codex suite
2,376/2,383 (the 7 = accepted baseline). · **F** live through the edge: stolen-moment /
glimmerdust / trait/chronomancy all 200 w/ LotI2 citation + school-pill link + copy; NO AoN
link; `/spell?book=…` = exactly 172 w/ LotI2 abbreviation; `/ritual` toolbar 145→**148** (=
+3 homebrew; rows sit at positions 93/122/203, beyond the SSR window [0,60) by design);
`/sources` shows the pinned Homebrew group w/ OGL badge; Pagefind fragment for Stolen Moment
verified (fragments are gzip — grep the DECOMPRESSED bytes); fireball spot-check unchanged. ·
**G** SigNoz 0 ERROR/FATAL logs, 0 error traces (astra.codex, 1 h window, 2,932 spans
scanned). · **Deploy** in-place transform (P11 precedent; no snapshot re-fetch — P7 drift
trap avoided); image-first; host reindex 44,982 pages / 32.7 s; window ≈439 s
transform-start→container-restart (stretched by the in-window collision-rename cycle + the
license fix + determinism proof; corpus valid throughout except transient wipe-rewrite
seconds).

**Residue / notes:** the S1 hand-written fixture bytes were verified canonical-format (sorted-
key 2-space + LF) in lieu of an extractor byte-diff — a real extractor re-run needs a fresh
corpus AND would now pull homebrew picks into the canonical-coverage selection (churn); next
legitimate fixture regen should expect that. `?query=` listing filtering is client-side
post-hydration (not homebrew-specific). `assay export-codex`/spell-power.json untouched —
homebrew ids absent, fail-soft, block hidden anyway. Future `just codex-refresh` picks the
store up automatically (path is a `main()` constant; recipe unchanged).
