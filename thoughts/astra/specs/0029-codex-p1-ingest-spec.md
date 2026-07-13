# 0029 — codex P1: ingest + canonical corpus — NLSpec

**Status:** FINAL (2026-07-12) — adversarially reviewed same day: **8 blockers + 6 minors, ALL
folded in** (edition-collision identity B1, the `re-en.json` Localize gap B2, the four
inline-roll forms B3, depth-aware bracket grammar B4, the license-fallback table B5, journal
page identity/join B6, the creature qualifier-reorder normalization B7, CodexNode kind gaps B8;
minors M9–M14 inline). Reviewer also VERIFIED: `search_after` works on `name.keyword`/`url`
(not `_id`); `sluggify` portable from `src/util/misc.ts` (NOT in the sparse clone — port pulls
that file); no seventh `@Tag[` form exists in the packs; the Magic Missile↔Force Barrage pair
resolves live; 21-line Dockerfile ripple + uv-exclude + port 10374 all confirmed.
**▶ RESUME AT: implementation S1** (`octo:embrace` against this spec).
**Scope doc:** `thoughts/shared/research/2026-07-12-codex-0029-thoughts.md` (decisions C-1..C-8
all stakeholder-resolved; repo + live-data facts verified there — this spec doesn't re-derive
them). **Viability:** `…/2026-07-12-codex-0029-viability-thoughts.md`.
**Phase context:** P1 of 5 (P2 entity pages · P3 faceted browse+search · P4 rules browser ·
P5 deploy). Per-phase specs by design (heartwood 0020 precedent) — P2+ get specced against the
REAL corpus this phase produces. P1 is deliberately frontend-free: it ends with a validated,
deterministic, sharded canonical corpus + transform report on disk, not a rendered page.

## 1. Overview

Build `apps/codex`'s ingest pipeline: snapshot two corpora — the **foundryvtt/pf2e packs**
(28,646 docs, structured mechanics, per-doc ORC/OGL labels) and the **AoN Elasticsearch index**
(43,686 docs, prose/citations/rules text) — parse both markup grammars, join them, and emit one
**canonical, Zod-typed, license-labeled, facet-annotated corpus** (gitignored, ~100–200 MB)
plus a small committed fixture that keeps CI hermetic. Everything downstream (P2–P4) consumes
only the canonical corpus; neither source format leaks past this phase.

## 2. Locked decisions

Carried from scoping (stakeholder): C-3 hybrid corpus · C-4 remaster-primary + legacy pairing ·
C-5 all categories · C-6 gitignored corpus + committed fixture · C-7 TS scripts in `apps/codex`,
`just codex-refresh`, no Dagster.

Spec-level:

- **D29-1 Identity (revised per adversarial B1 + M14).** `slug = sluggify(name)` via an exact
  port of Foundry's `sluggify` from `src/util/misc.ts` (pure Unicode-property regexes, verified
  portable; **that file is NOT in the packs sparse clone — the port must fetch it** + its test
  vectors). Entity id = `{category}/{slug}` — EXCEPT when a legacy↔remaster **pair shares a
  slug** (the common case for unrenamed remasters — live-verified: two "Heal" spells,
  `spell-148`/`spell-1554`): the legacy member's id and file become `{slug}@legacy` /
  `<slug>@legacy.json`. `edition: "remaster" | "legacy"` stays a field and is NOT identity for
  unpaired docs (most `remaster:false` content — AP creatures etc. — is the only edition of
  itself and keeps its plain slug). Pairing links are **arrays** (AoN `remaster_id`/`legacy_id`
  are arrays, verified): `remasteredAs: id[]` / `legacyOf: id[]`; multi-member pairs reported.
  Residual same-name collisions (not remaster pairs) → deterministic suffix ordered by
  (edition: remaster-first, then source-priority) then `-2`, `-3`…, all reported. IDs are
  STABLE across refreshes for unchanged names.
- **D29-2 Body = typed nodes, not pre-rendered HTML (union widened per adversarial B8/B3).**
  One Zod discriminated union (`CodexNode`) over: `paragraph`, `heading` (levels; carries the
  AoN `<title right=…>` right-annotation — action cost/level — as `meta`), `list`, `table`
  (with caption), `blockquote`, `divider` (11,137 `<hr>` in Foundry packs + 585 in journals),
  `aside` (AoN `<aside>` → P2 renders as inset), `text` (marks: bold/italic/superscript),
  `crossref` (resolved codex id + display text), `brokenRef` (unresolved target preserved as
  plain text + reported), `check` (type/dc/basic/traits), `damage` (raw formula + display
  string), `inlineRoll` (`kind: "r"|"br"|"gmr"`, formula, label — all three forms exist at
  scale), `inlineAction` (the `[[/act …]]` form, 1,343 uses — action slug + options + label),
  `template` (shape/distance), `embed` (target codex id — covers Foundry `@Embed` AND AoN
  `<document>`; inlining is a P2 render decision), `actionGlyph` (cost token),
  `localizedBoilerplate` (resolved text + source key). **Images are DROPPED at transform**
  (report-counted): Foundry packs have zero `<img>`; AoN `<image>` (22 hits) is art we neither
  host nor hotlink. AoN `<column>`/`<row>` (324/180 hits) **flatten to sequential blocks** —
  layout, not content. The renderer contract for P2 is exactly this union — no
  `dangerouslySetInnerHTML` of source-derived HTML.
- **D29-3 Corpus layout.** `apps/codex/data/` (gitignored):
  `snapshots/foundry/<tag>/…` + `snapshots/aon/<date>/…` (raw, as-fetched) and
  `corpus/<category>/<slug>.json` (one file per entity — the P2 lazy-load unit, transcript-
  pattern; shared-slug legacy pair members at `<slug>@legacy.json` per D29-1) +
  `corpus/<category>/index.json` (slim facet rows: id/name/level/traits/rarity/
  source/edition — NO body) + `corpus/manifest.json`. All emits deterministic: sorted object
  keys, sorted file order, LF, trailing newline — two runs on the same snapshots are
  byte-identical (the D-gate).
- **D29-4 Pinning.** Committed `apps/codex/corpus-manifest.json`: Foundry tag (start:
  `pf2e-8.3.0`), AoN snapshot date, per-source doc counts, sha256 per snapshot archive,
  `schemaVersion` (integer; any breaking CodexNode/entity-schema change bumps it and forces a
  full regen). `just codex-refresh` re-fetches, re-transforms, rewrites this manifest — refresh
  is a deliberate, diffable event, never implicit in a build.
- **D29-5 Fetcher etiquette (AoN) + fetch lists (revised per adversarial B2).** Server-side
  only; descriptive User-Agent with contact email; per-`category` `term` queries, page size
  1,000, `search_after` pagination sorted on `name.keyword` with `url` tiebreaker (both
  verified working; `_id` sort is rejected by the cluster); ≤4 req/s throttle; single-shot
  snapshot to disk, never queried at build/render time. Foundry side: shallow sparse clone
  (or release tarball) of the pinned tag — `packs/pf2e/`, **`static/lang/*.json` (ALL of them:
  `re-en.json` alone resolves 106 of the 200 distinct `@Localize` keys — more than `en.json`'s
  91; 3 resolve only in `sf2e-overrides-en.json`)**, `system.pf2e.json`, **and
  `src/util/misc.ts`** (the sluggify port source, D29-1).
- **D29-6 Enricher policy (Foundry) (revised per adversarial B3/B4/M11/M13).** Parse ALL of:
  `@UUID` `@Check` `@Damage` `@Localize` `@Template` `@Embed` (no seventh `@Tag[` form exists
  in the packs — verified) **+ all four inline-roll forms `[[/r` (1,627) / `[[/br` (184) /
  `[[/gmr` (1,939) / `[[/act` (1,343), each with optional `{label}`**. The `@Tag[…]` argument
  grammar is **depth-aware bracket matching, NOT scan-to-first-`]`** — 14,931 of 15,877
  `@Damage` uses contain nested `[type]` annotations
  (`@Damage[(floor((@actor.level+1)/2)+1)d6[poison]]`). **Unknown enricher form → hard fail**
  (transform aborts listing every occurrence; no silent passthrough — the drift tripwire).
  `@Localize` resolves against the MERGED `static/lang/*.json` map (D29-5). `@UUID` pack
  segments resolve via `system.pf2e.json`'s `packs[].name→path` map (registered names ≠ dir
  names; 10 mismatches incl. `actionspf2e→packs/actions`) **with the `pf2e/` path-prefix
  rewrite** (manifest paths are release-layout `packs/X`, the repo nests `packs/pf2e/X`);
  skip `_folders.json`; pack dirs nest arbitrarily (`spells/spells/rank-1/…`). Expected,
  by-design crossref residue (report classes, not bugs): relative `@UUID[.<docId>]` (66) —
  resolve within the containing document's embedded items, else brokenRef; refs to excluded
  doc types (Macro 123, RollTable 22) → `excludedRef` report class, rendered as plain text.
  `@Damage` keeps the raw formula and computes a display string; actor-relative formulas
  (`@actor.level` etc.) display as formula text (reference site, not a VTT).
- **D29-7 Join policy (revised per adversarial B7/M12/M13).** Explicit committed category map
  in `apps/codex/scripts/categoryMap.ts` **keyed on (Foundry pack, doc `type`) — not pack
  alone**: the single `equipment` pack fans out to AoN's `weapon`/`armor`/`shield`/`equipment`
  categories per-doc (verified: a 500-file sample mixes weapon 75, armor 22, shield 4,
  consumable 144, …); the 58 bestiary packs collapse many-to-one to `creature`. Match on
  `slug`, THEN a **deterministic qualifier-reorder normalization** before any alias: Foundry
  `"X (A)"` / `"X (A, B)"` generates candidate keys `"A X"` / `"A B X"` / `"X"` — the verified
  systematic divergence (AoN `"Adult Adamantine Dragon"` vs Foundry `"Adamantine Dragon
  (Adult)"`) that costs ~30% of the creature join if unhandled (209/300 raw vs 397/400 for
  spells). Foundry 1:N variants (e.g. `(Adult, Spellcaster)`) join to the same AoN doc with
  `variantOf: <id>` on the extras. `apps/codex/join-aliases.json` (committed, hand-curated) is
  reserved for TRUE one-offs after normalization. Field ownership: **Foundry wins mechanics;
  AoN wins prose, page citations, `aonUrl`**. Legacy↔remaster pairing: AoN
  `remaster_id`/`legacy_id` arrays primary, Foundry's `remaster-changes` journal cross-check;
  disagreements → report, AoN wins. **AoN-internal links** (`[Agile](/Traits.aspx?ID=170)`-
  style markdown in the `markdown` field) resolve via an AoN-URL→codex-id table built from
  every doc's own `url` field (S3); CRLF normalized. Unjoined entities are NOT fatal:
  Foundry-only ship without citations; AoN-only categories (rules, sidebars, sources — AoN has
  **93 categories total**, verified aggregation) ship as codex entities on their own. The
  report quantifies both residues.
- **D29-8 Exclusions + journal policy (revised per adversarial B6).** Excluded (Foundry):
  `*-effects` packs (2,808 VTT automation items), `macros`/`action-macros`, `rollable-tables`,
  `gm-screen`/`hero-point-deck` journals — not reference content. **Journals are INCLUDED as
  prose sources with an explicit identity rule**: a JournalEntry is ONE doc with `pages[]`
  (55 text pages in `ancestries.json` — a different shape from Items, parsed as such in S2).
  Each page maps by journal → target category (`ancestries`→ancestry, `archetypes`→archetype,
  `classes`→class, `domains`→domain) and **merges by slug into the matching Item-derived
  entity as its `loreBody`** (a second, Foundry-internal join — journal page "Anadi" enriches
  the ancestry entity `anadi`, it does NOT become `anadi-2`). Pages with no matching entity
  become standalone `proseOnly` entities in that category (report-counted). Journal page HTML
  adds tags Items lack (h1 ×200, sup ×88, blockquote, caption) — covered by the widened
  D29-2 union. `remaster-changes` is NOT an entity: it's parsed as the redirect-table input for
  pairing (D29-7). AoN side: every category ships (C-5); `article` docs ship as what they are —
  citation stubs (verified in scoping).
- **D29-13 License labeling (NEW — adversarial B5).** `source.license: "ORC" | "OGL" |
  "unknown"`. Foundry-derived entities read `system.publication.license` — **for Actors the
  path is `system.details.publication`** (verified on monster-core). AoN-only entities (which
  include exactly the removed-from-Foundry legacy content — *Magic Missile*/*Produce Flame*
  have NO pack file, verified) and journal-derived prose have NO license field in-source →
  resolve via a **committed book→license table** (`apps/codex/scripts/licenseMap.ts`, keyed on
  AoN `primary_source`/`source`; remaster-era books ORC, pre-remaster OGL — the table is
  small, book-granular, and hand-verifiable). Residual `unknown` is allowed but report-counted
  and reviewed at S4.
- **D29-9 Script runtime.** Plain TS via the repo idiom
  `node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/<x>.ts` (akasha
  precedent, verified `apps/akasha-frontend/package.json`). Node 24 built-in `fetch`. No new
  runtime deps beyond zod (+ dev-only test tooling); the enricher/markup parsers are
  hand-rolled (the grammars are small and MUST hard-fail on unknowns — a lenient off-the-shelf
  markdown parser is the wrong failure mode).
- **D29-10 Telemetry.** None in P1 — ingest scripts are build-time CLIs, not services (akasha
  build-content precedent; the standing principle binds apps/services in their runtime — that's
  P2's `astra.codex`). Recorded here so its absence is by-design, not an oversight.
- **D29-11 Fixture (budget revised per adversarial M10).** `apps/codex/fixtures/` (committed):
  a deterministic extractor selects entities from the real corpus covering EVERY codex
  category (AoN has 93) × EVERY CodexNode kind × ≥1 legacy/remaster pair × ≥1 normalization
  hit + ≥1 alias × ≥1 Foundry-only and AoN-only entity × ≥1 journal-merged entity. **RAW
  source docs are included only for the parser-fixture subset (~40 docs chosen for grammar
  coverage — creature raw docs average 30.4 KB, so raw-everything blows any budget); the
  category-coverage set is canonical-form only.** Budget ≤5 MB. The extractor ASSERTS the
  coverage matrix. CI runs the full parse→join→emit pipeline over the fixture with zero
  network.
- **D29-12 Workspace mechanics (S1) (hermeticity pinned per adversarial M9).** New flat member
  `apps/codex` — package.json scripts: `typecheck` = **bare `tsc --noEmit`** (NOT the akasha
  idiom of running content-gen first — codex's corpus is gitignored, so every member script
  MUST succeed on a fresh clone with no `data/` present), `test` = vitest (fixture-driven,
  zero network), `build` = `tsc --noEmit` in P1 (no bundle artifact exists yet; corpus
  operations live ONLY in `just codex-refresh`). ≥1 real test from day one. Plus:
  **add `"apps/codex"` to the uv `exclude` list in `pyproject.toml`** (verified required — the
  list names every TS app; scope doc corrected) + the 21-sibling Dockerfile manifest-COPY
  ripple (lockfile references the new manifest; sibling images fail frozen-lockfile install
  without it) + `codex {}` config block in `config.kdl` (port 10374, public-origin, data paths)
  mirrored in BOTH schemas per config-single-source. No SOPS keys (no secrets in P1).

## 3. Deliverables (by component)

**`apps/codex/scripts/`** — `fetch-aon.ts` (D29-5 pager → snapshot), `fetch-foundry.ts`
(pinned-tag pull → snapshot), `transform.ts` (orchestrates: parse Foundry → parse AoN → join →
emit corpus + report), `extract-fixture.ts` (D29-11), `categoryMap.ts` (D29-7).
**`apps/codex/src/schema/`** — `entity.ts` (CodexEntity discriminated union per category, facet
fields per category), `nodes.ts` (CodexNode union, D29-2), `manifest.ts` (corpus-manifest zod).
Shared verbatim with P2 (same package).
**`apps/codex/src/ingest/`** — `enrichers.ts` (D29-6 grammar), `foundryHtml.ts` (description
HTML → nodes), `journals.ts` (JournalEntry `pages[]`, D29-8), `aonMarkup.ts` (AoN
markdown+custom tags → nodes), `join.ts`, `emit.ts` (deterministic writer), `report.ts`,
`sluggify.ts` (ported + vector-tested). **`apps/codex/scripts/licenseMap.ts`** (D29-13).
**Transform report** — `apps/codex/data/corpus/report.json` + human-readable `report.md`:
per-category in/out/excluded counts, unknown-enricher occurrences (fatal), broken crossrefs,
join hit/miss per category + unjoined lists, slug collisions, legacy-pair counts +
disagreements, size totals. The report is the P1 acceptance artifact.
**`just codex-refresh`** — fetch both → transform → report; prints the report summary; refuses
to run if the git index is dirty under `apps/codex` (the manifest diff must be reviewable
alone — linguist-timer lesson).
**Docs** — `apps/codex/README.md` (pipeline shape, refresh recipe, how to add a join alias,
what hard-fails mean).

## 4. Slices (each CI-green, committed, conventional)

- **S1 — member scaffold + snapshots.** D29-12 mechanics (member, uv exclude, Dockerfile
  ripple, config block + mirrors, gitignore for `apps/codex/data/`); `fetch-aon.ts` +
  `fetch-foundry.ts` + corpus-manifest; unit tests with mocked fetch (pager logic incl. the
  >10k `search_after` path, throttle, manifest round-trip). Gate: `uv sync` + `pnpm install` +
  both CI lanes green locally; a real host-side snapshot run of BOTH fetchers completes and
  the counts land in the manifest (~43.6k AoN / 28.6k Foundry).
- **S2 — canonical schema + Foundry parser.** `nodes.ts`/`entity.ts` (the widened D29-2
  union); `sluggify.ts` (ported from the fetched `src/util/misc.ts` + vectors); `enrichers.ts`
  (depth-aware brackets, all 6 `@Tag` forms + all 4 inline-roll forms) + `foundryHtml.ts` +
  **`journals.ts` (JournalEntry `pages[]` shape, D29-8)**; license/remaster carry-through incl.
  the Actor `system.details.publication` path (D29-13); exclusions (D29-8). Tests: per-enricher
  fixtures from REAL pack docs (fireball; a strikes-heavy monster; an `@Localize`-heavy ability
  resolving from `re-en.json`; an `@Embed` action; a nested-bracket `@Damage` feat; a
  `[[/gmr`-bearing doc; a journal page with h1/sup/blockquote); hard-fail proven on a synthetic
  unknown `@Foo[…]`. Gate: the S2 parser runs over the FULL Foundry snapshot on the host with
  zero unknown-enricher failures and per-category counts reported.
- **S3 — AoN parser.** `aonMarkup.ts` — the `markdown` field mixes real markdown (links,
  `**bold**`, CRLF) with ~19 custom tags (reviewer sample: `<title>`, `<traits>`, `<actions>`,
  `<row>`/`<column>`, `<aside>`, `<document>`, `<image>`, `<table>`…) → CodexNode per D29-2's
  mappings (flatten columns, drop images report-counted, `<document>`→embed), same hard-fail
  posture for unknown tags; the AoN-URL→codex-id link table (D29-7); field extraction into
  facet rows; `licenseMap.ts` (D29-13); breadcrumbs carried for `rules` docs (P4 needs the
  tree). Tests: real sampled docs per category (incl. a rules section + sidebar + an article
  stub + a `<column>`-heavy doc). Gate: full AoN snapshot parses clean on the host.
- **S4 — join + emit + report + fixture + recipe.** `join.ts`/`emit.ts`/`report.ts`;
  determinism gate (run twice → `diff -r` empty); `extract-fixture.ts` + committed fixture +
  CI-hermetic pipeline test over it; `just codex-refresh`; README. Gate: full real-corpus
  transform on the host; report reviewed BY THE STAKEHOLDER (join rates + residues are a
  judgment call, not a threshold); fixture committed; determinism proven.

## 5. Acceptance criteria (P1 exit gate)

- **A.** Both snapshots fetched live (host), counts + hashes in the committed corpus-manifest.
- **B.** Full-corpus transform completes with ZERO unknown-markup failures (both grammars) —
  or every remaining occurrence is an explicitly allowlisted, report-visible decision.
- **C.** Canonical corpus 100% Zod-valid; every entity carries `source.license` — Foundry-
  derived from publication data, AoN-only/journal-derived via the D29-13 book table; `unknown`
  residue report-counted and reviewed. Spot-checks: a remastered Player Core entity reads ORC;
  a pre-remaster CRB entity reads OGL; an AoN-only legacy spell (*Magic Missile* — absent from
  Foundry, verified) resolves via the table.
- **D.** Determinism: two full runs over the same snapshots → byte-identical `corpus/`.
- **E.** Join report reviewed: hit-rates per category eyeballed; the D29-7 qualifier-reorder
  normalization proven on the dragon family (raw creature hit-rate ~70% → post-normalization
  target >90%); ≥3 true one-offs resolved via `join-aliases.json` to prove that mechanism;
  1:N spellcaster variants carry `variantOf`; unjoined residues enumerated.
- **F.** Legacy pairing: the canonical known pairs (*Magic Missile→Force Barrage* — verified
  live via `remaster_id` — *Produce Flame→Ignition*, wizard schools) resolve; the shared-slug
  case (*Heal*/*Heal*) lands as `heal` + `heal@legacy` per D29-1; pair counts in the report.
- **G.** Fixture committed (≤2 MB, D29-11 coverage matrix satisfied — the extractor asserts
  it); full pipeline test runs in CI with zero network.
- **H.** Both CI lanes reproduced locally + pushed green; `just codex-refresh` runs end-to-end
  on the host.

## 6. Risks / adversarial notes

- **AoN markup grammar is undocumented** — S3 discovers it empirically from the corpus; the
  hard-fail posture turns unknowns into an enumerated worklist instead of silent corruption.
  Budget: this is the likeliest slice to grow.
- **ES endpoint could die mid-project** — snapshot-first design; after S1's snapshot lands,
  P1 never needs the network again.
- **Foundry tag drift during P1** — pinned tag (D29-4); refresh only via the recipe.
- **Join quality** — the reviewer's empirical test made this concrete: spells 99.25% raw, but
  creatures ~70% raw due to the qualifier-order convention — hence the D29-7 normalization is
  DECIDED now, not discovered mid-build. The remaining ~90 categories are unmeasured; the S4
  stakeholder report review is the net. If any mechanical category still sits <50% joined
  AFTER normalization + aliases, STOP and re-decide the join key with the stakeholder before
  P2 (no silent fuzzy-matching).
- **The uv-exclude miss class** — D29-12 exists because the scope doc got this wrong; the S1
  gate (`uv sync` green) catches it structurally.
- **Corpus size vs image (P5 concern, decided there)** — P1 only guarantees the sharded layout
  makes both options (COPY vs bind mount) possible.

## 7. Out of scope (P1)

Rendering of any kind (P2); facet UI + Pagefind (P3); rules-tree UX (P4); compose/caddy/deploy
+ noindex headers (P5); scheduled/automated refresh (post-v1, if ever); Starfinder packs
(`sf2e` tree in the same repo — explicitly not fetched); non-English locales.
