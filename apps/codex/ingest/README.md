# @astra/codex-ingest — the codex ingest pipeline

The pipeline that turns two Pathfinder 2e sources plus assay's homebrew store into a codex
corpus release: the **foundryvtt/pf2e** compendium packs (structured mechanics, per-doc
license data) and the **Archives of Nethys** Elasticsearch index (prose, citations, page
numbers) are fetched once into snapshots, parsed, joined into one canonical entity per game
element, emitted as a deterministic, Zod-validated corpus tree, indexed with Pagefind, and
published as an immutable release that the site (`apps/codex/web`) serves. The corpus
contract both sides share (schemas, the reader, the release layout and its servability
check) is [`@astra/codex-corpus`](../../../libs/ts/codex-corpus/README.md). The site never
imports this package at run time; it uses it only to generate its test corpus.

## The CLI

`pnpm --filter @astra/codex-ingest cli <command> [args]` (`src/cli.ts`). The `just codex-*`
recipes call it; prefer them for anything that touches the real releases.

| Command | What it does | Recipe |
| --- | --- | --- |
| `fetch-foundry` | Sparse-clones the pinned pf2e tag into `<codex.data-path>/snapshots/foundry/`; updates `corpus-manifest.json`. | `just codex-refresh` |
| `fetch-aon` | Snapshots the AoN index (~259 MB, at most 4 req/s) into `snapshots/aon/<date>/`; updates `corpus-manifest.json`. | `just codex-refresh` |
| `transform --out <dir>` | Snapshots + homebrew store → a corpus tree at `<dir>`, with `report.json`/`report.md`. | (inside `release build`) |
| `search-index --corpus <dir> --out <dir>` | A Pagefind index over a corpus tree. Host-only, ~3.8 GB RSS. | (inside `release build`) |
| `release build [--allow-shrink] [--reuse-corpus] [--force]` | Transform and index into `releases/.staging-*`, validate, publish as `releases/<id>`, swap `current`, prune. | `just codex-build`, `just codex-search-index` |
| `release rollback [<id>] [--force]` | Make an older release current; mark the one it leaves rejected. | `just codex-rollback` |
| `release list` | The releases on disk, newest first. | `just codex-releases` |
| `release migrate` | One-time: the flat `corpus/` + `search/` become the first release. | `just codex-migrate-releases` |
| `fixture` | Bring the generated fixture corpus (`fixtures/entities/`) up to date. | — |
| `extract-fixture` | Host-only, rare: re-pick `fixtures/raw/` and `fixtures/picks/` from the real snapshots and current release. | — |

`release` takes `--data-path <dir>` (a scratch releases root instead of `codex.data-path`) and
`--server <origin>` (where to ask `/healthz` which release the running codex serves; pruning
keeps it). The transform always reads the snapshots under `codex.data-path`; set
`ASTRA_DATA_ROOT` to point it at a scratch copy. Release operations, rollback and the schema
bump order are in the site README's "Operations" section and `docs/runbook.md`.

The transform reads code, `corpus-manifest.json`, `join-aliases.json` and the homebrew store
(`apps/assay/py/homebrew/`) from the checkout it runs in, so run a real build from a clean
checkout at a pushed commit.

## Layout

```
corpus-manifest.json   the committed source pins: what to fetch (tag, snapshot date, hashes)
join-aliases.json      hand-curated one-off join aliases (see "Adding a join alias")
src/                   the pipeline modules, the CLI (cli.ts) and their tests
fixtures/              the fixture's committed inputs; fixtures/entities/ is generated
tests/fixtures/        parser samples for the unit tests
```

`@astra/codex-ingest/fixture` (`src/fixtureCorpus.ts`) is the one export other packages use:
`ensureFixtureCorpus()`, `buildFixtureCorpus()` and `FIXTURE_CORPUS_DIR`. The site's vitest
setup, its two Chromium guards and its golden regeneration call it.

## Determinism

Two transform runs over the same snapshots produce a byte-identical corpus tree
(`transform.test.ts` checks it over the fixture inputs). The Pagefind index is not
byte-stable between runs (its filter files differ), so compare indexes by page count.

## Traps

**Corpus and ingest**
- Run the real transform before trusting any count in a spec, test or golden. Counts derived
  from a proxy (grepping one field, raw AoN doc counts) have been wrong in both directions.
- Foundry packs have no `system.slug`; the pack file basename is the slug. AoN URLs are not
  unique (tiered items, class/class-feature twins), so join by `pickCanonical`, never by URL.
- A plain crossref (`{category}/{slug}`) carries no provenance. Repoint links at
  link-resolution time (url → aonId → final id), not by patching strings afterwards.
- Any pass that drops entities needs its own crossref/embed reconciliation afterwards. Emit-time
  Zod checks shape only, not referential integrity.
- Embed overrides apply only in `reconcileInline` (post-drop); applied earlier they are a silent
  no-op. Ids from the parse-time repoint seam are pre-collision; use `aonIdToFinalId` for any
  url-keyed join.
- The crossref/embed patcher must walk every `BlockNode[]` field, including the hazard
  `stats` fields (`disable`, `routine`, `reset`).
- Class grants resolve by the corpus's masthead "Class" label, then `legacyOf`, then level.
  Twelve classes share one Foundry item uuid, so a uuid map links the wrong class.
- Drop predicates must be scoped with `proseOnly === true`; Foundry adventure actions also
  start with "(".
- Facets exist only on Foundry-merged entities. Trait casing differs by edition (fold it);
  `usage`/`itemCategory` mean different things per category (never share facet defs by key
  name); `facets.size` is the Foundry token default, not an ancestry's size.
- `statsText` is gated to creature/hazard; on other categories it indexes junk like "HP 8".
- Never write raw control bytes (NUL, SOH) in template literals: git then treats the source as
  binary and the Read tool hides them. Use `\u0000` escapes. Sweep with
  `perl -ne 'print "$ARGV\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/' <files>`.

**Homebrew (assay store) ingest**
- Homebrew names can collide with legacy AoN-only spells. Check a new name against the full
  emitted id space, not just the Foundry packs.
- `CodexEntitySchema` and `parseManifest` are `.strict()`: keep homebrew provenance in
  `report.json` and the `homebrewIds` parameter, never as an entity field or manifest key.
- Homebrew assembly must reuse the Foundry `UuidIndex`, or every `@UUID` ref in the store
  silently becomes a broken ref.
- Store basenames are the ids. Basenames hyphenate apostrophes where `sluggify` strips them, so a
  fixed set of `slugMismatch` reports is expected; a change in that count is a real problem.
- Trait source docs carry `{name, description}` only. A stray `level` adds a Lvl column to every
  `/trait` row.
- A book with no AoN presence gets "License unknown" on `/sources`; set it in
  `BOOK_LICENSE_OVERRIDE` (`sourcesIndexBuild.ts`).

**Fixture, search index and releases**
- Synthetic rows and patches stay out of `rules-tree.json` and `sources-index.json` (those
  describe the real books). A new entity shape needs a raw pick, a pick or a synthetic row.
- `extract-fixture` (host-only) re-picks `fixtures/raw/` and `fixtures/picks/` from the real
  snapshots and the current release, then checks the coverage matrix over a fresh fixture
  build. A re-extract drops the one hand-made raw doc, `class-feature-9001` in
  `fixtures/raw/aon/class-feature.json` (witch's Weapon Specialization, the D29-132 case in
  `transform.test.ts`): restore that hit from git afterwards.
- The site finds the fixture corpus by walking up from its own code to
  `<dir>/ingest/fixtures/picks` (`apps/codex/web/src/server/corpusFs.ts`), so moving this
  package or `fixtures/` breaks the site's fixture root. The site's `corpusFs.test.ts` checks
  that both sides name the same directory.
- The Pagefind build is host-only (~3.8 GB RSS). It runs inside `release build`; never in CI,
  Docker or `vite build`. `build-search.test.ts` covers it over the fixture.
- `release build` asks the running codex (`http://127.0.0.1:<codex.port>/healthz`) which
  release it serves before it prunes. A scratch build must pass `--server` with an unused
  origin (and `--data-path`), or it queries the live server.
- `transform.ts` and `fixtureCorpus.ts` resolve their inputs from `import.meta.dirname`
  (`../corpus-manifest.json`, `../join-aliases.json`, `../fixtures/`) and the homebrew store
  from the repo root; keep `src/` one level below the package root.

## Pipeline shape

```
snapshots/foundry/<tag>/    ─┐
                              ├─► parse ─► join ─► emit ─► corpus/ + report
snapshots/aon/<date>/       ─┘
```

Two ONE-SHOT snapshots (`<codex.data-path>/snapshots/`, outside the repo — fetched once,
never queried again at transform/build time), parsed by two independent grammars, joined into
one canonical entity per real game element, and written as a deterministic corpus tree.

### Module map

| Stage | Module(s) | What it does |
| --- | --- | --- |
| Fetch | `src/fetch-foundry.ts`, `src/fetch-aon.ts` | Snapshot the two sources to `<codex.data-path>/snapshots/`; update the committed `corpus-manifest.json` pin. |
| Parse (Foundry) | `src/{enrichers,foundryHtml,journals,foundryEntities,uuidResolve}.ts` | `@UUID`/`@Check`/`@Damage`/`@Localize`/`@Template`/`@Embed` + inline-roll grammar → `CodexNode`s; JournalEntry `pages[]` assembly; per-doc license/edition. |
| Parse (AoN) | `src/{aonFacets,aonMarkup,aonLinkTable}.ts` | Facet extraction + the `markdown` field's custom-tag grammar → `CodexNode`s; the AoN-URL→codex-id link table. |
| Join | `src/join.ts` | Slug match → qualifier-reorder normalization → `join-aliases.json`; field ownership (Foundry wins mechanics, AoN wins prose/citations); identity finalization (`@legacy`/`-2` suffixing); crossref/embed patching. |
| Emit | `src/emit.ts` | Deterministic corpus writer — sorted keys, sorted file order, zod-validates every entity. |
| Report | `src/report.ts` | Pure builders for `report.json`/`report.md` — the P1 acceptance artifact. |
| Search | `src/build-search.ts` | The Pagefind index over a corpus tree. |
| Release | `src/releaseStore.ts`, `src/release.ts` | Staging, validation, content-hash ids, the `current` swap, rollback, pruning. |
| Orchestrate | `src/transform.ts`, `src/cli.ts` | `runTransform()` wires parse, join and emit; the CLI wraps each step. |

The shared Zod contracts (`CodexEntity`, `CodexNode`, `CorpusManifest`) live in the
`@astra/codex-corpus` package (`libs/ts/codex-corpus`), which the site and the ingest both import.

## Running it

```bash
pnpm --filter @astra/codex-ingest cli fetch-foundry      # sparse-clones the pinned tag
pnpm --filter @astra/codex-ingest cli fetch-aon          # the AoN ES index (~259 MB, ≤4 req/s)
pnpm --filter @astra/codex-ingest cli transform --out <dir>   # parse -> join -> emit -> report

# or fetch, transform, index and publish a release in one step:
just codex-refresh
```

The transform and the indexer take explicit output dirs (`transform --out <dir>`;
`search-index --corpus <dir> --out <dir>`) and never write a served release; `just
codex-build` (`release build`) runs both into a staging dir and publishes it.

`just codex-refresh` **refuses to run if `git status --porcelain -- apps/codex/ingest` is
non-empty** — a refresh rewrites the committed `corpus-manifest.json` pin, and that diff
must be reviewable on its own (the linguist-commit-timer lesson: never let a generated-file
change ride in on top of unrelated in-progress edits). Commit first.

A real run takes about a minute end to end (~15s for the transform stage, ~30s for the
index) and produces about 45,000 entities / ~625 MB of corpus (under `codex.data-path`,
never in the repo; see the corpus layout below).

## Corpus layout (`releases/<id>/corpus/`)

```
corpus/
  <category>/
    <slug>.json          one file per entity (the P2 lazy-load unit)
    <slug>@legacy.json    the legacy half of a shared-slug remaster pair (D29-1)
    _index.json          slim facet rows for the whole category (id/name/level/traits/
                          rarity/source/edition/superseded + a per-category-allowlisted
                          `facets` subset, D29-33c — NO body), sorted by id, COMPACT
                          JSON (no indentation, D29-33d — ~31% smaller; still key-sorted
                          + trailing LF, same determinism guarantee as every other
                          corpus file). The leading underscore is load-bearing (D29-21):
                          sluggify() can never emit one, so this file can never clobber
                          a real entity slug (the old plain index.json ate the two real
                          `index`-slug entities, ancestry/index + archetype/index)
  manifest.json           schemaVersion + the D29-4 source pins + final per-category
                          counts + total size (NOT the same file as the committed
                          apps/codex/ingest/corpus-manifest.json — that one pins
                          what to FETCH; this one summarizes what got EMITTED).
                          totalEntityCount reconciles EXACTLY against a find|wc over
                          the entity files (D29-21)
  report.json / report.md the transform report (see below)
```

### schemaVersion 2 (P1.6, D29-19/-20/-21)

- **npc-only creature import (D29-19):** `type: "character"` Actors (iconics pregens,
  paizo-pregens, Kingmaker companions — 150 docs) are excluded before assembly; their
  AC/HP/saves are runtime-derived by the pf2e system, not statable from source. The
  ~16 AoN-indexed pregen twins still ship as AoN-only pages (D29-14(a)). Report field:
  `excludedActorsCount`.
- **`stats` (D29-20):** `creature`/`hazard` entities carry a typed, discriminated
  statblock projection — CreatureStats (speeds/abilityMods/senses/languages/
  immunities/resistances/weaknesses/skills) or HazardStats (hardness/stealth/
  isComplex + disable/routine/reset as parsed `BlockNode[]`). `EmbeddedItem` gains
  `attackBonus`/`damage[]` on `melee` strikes and `dc`/`attack`/`tradition` on
  `spellcastingEntry` items. Extraction is deterministic field mapping; absent source
  fields are omitted. The report carries per-field extraction coverage tables.
- **P7 additions (D29-73/D29-74, schemaVersion 2→3):** `melee` strikes additionally
  carry an optional `range` display string baked from `system.range.{increment,max}`
  ("range 10 feet" max-only / "range increment 120 feet"; increment wins if both —
  0 real docs carry both). And `type:"lore"` embedded items' `system.mod.value`
  merges into the creature's `stats.skills` as `sluggify(name) → mod`
  (`mergeLoreSkills` — core-skill collisions guarded + reported as
  `loreSkillCoreCollision` (0 real), same-slug duplicates last-write-wins +
  reported as `loreSkillDuplicateSlug` (3 real)); hazards have no `skills` field —
  a future hazard lore item needs deliberate schema work (guard comment at
  `extractStats`).
- One upstream pack typo (`pfs-season-6-bestiary/.../historys-repetition-7-8`, an
  unterminated `@Check[` in its hazard `disable` field) is handled fail-soft: the one
  broken field is omitted and counted as `hazardStatsHtmlFailed` — entity `body`
  parsing keeps its hard-fail posture.

Every file is written through one of two canonical serializers, both key-sorted
(codepoint order, recursively) with a trailing LF: `canonicalJson` (2-space indent) for
every entity file + `manifest.json` + the reports, and `canonicalJsonCompact` (no
indentation, D29-33d) for `_index.json` only. Two full transform runs over the same
snapshots produce a **byte-identical** `corpus/` tree —
verify with `diff -r` after copying a run aside. `emit.ts` wipes its output dir (a fresh
staging dir on the host) before every write, so a stale file from a category/entity that no
longer exists can't survive a re-transform.

## The transform report

`report.md`/`report.json` are the P1 acceptance artifact — read `report.md` first. It
covers, per category: Foundry-in/AoN-in/final-out counts, join rate (exact / qualifier-
normalized / alias), unjoined residues (capped lists); slug collisions (legacy-pair vs.
residual); legacy/remaster pairing + the Foundry `remaster-changes` cross-check;
crossref/embed patch stats; license/edition breakdowns; and non-fatal report-class
counts (broken refs, mismatches, dropped images, ...). **Join rates are a judgment
call, not a threshold** — a category sitting under 50% joined with both sources present
gets a `⚠ STOP-condition` callout at the top of the report; per spec §6, that's a signal
to re-decide the join key with a human before P2, not something this pipeline
auto-corrects.

## Adding a join alias

`join-aliases.json` (committed, hand-curated) is reserved for **true one-offs** — a
name divergence between the two corpora for the exact same real-world game element
(a typo, a pluralization difference) that neither exact-slug matching nor the
qualifier-reorder normalization catches. It is NOT for systematic patterns (those need
a normalization rule in `join.ts` instead — see `qualifierCandidates`).

To add one:

1. Find a real unjoined pair in the report's per-category `unjoinedForeign`/`unjoinedAon`
   lists.
2. Verify it's genuinely the same thing (same level, same source book) before adding it —
   never guess.
3. Append `{ "foundryId": "<category>/<slug>", "aonId": "<the AoN _id>", "note": "..." }`
   to `join-aliases.json`, documenting the divergence in the note.
4. Re-run the transform; the entry should show up in `report.md`'s "Aliases applied" table.

## What a hard-fail means

Every parser here (`enrichers.ts`, `foundryHtml.ts`, `aonMarkup.ts`) is hand-rolled and
**hard-fails on an unrecognized grammar form** — an unmapped `@Tag[...]` enricher, an
unmapped HTML tag, an unmapped AoN custom tag — rather than silently passing it through
or stripping it. This is the drift tripwire: a lenient parser would corrupt the corpus
quietly; a hard fail turns corpus drift (a Foundry/AoN refresh that introduces a genuinely
new markup form) into a loud, specific, fixable worklist entry instead. `emit.ts`'s
`CodexEntitySchema.parse` on every entity is the same posture applied one level up — a
schema violation (a field that slipped through parsing in a shape the corpus contract
doesn't allow) aborts the whole transform rather than emitting a malformed entity.
`categoryMap.ts`'s `(pack, docType)` map is the same idea again, one level up from that:
an unrecognized pack/type pair is a hard fail, not a silent default category.

If a real transform run ever hard-fails, the error names the exact document (path or
entity id) and the offending text — that's the intended workflow: fix the parser (or, for
a `CodexEntitySchema` violation specifically, the raw-field extraction feeding it — see
`src/foundryEntities.ts`'s `present()` helper for the `null`-vs-`undefined`
landmines the real corpus has already turned up), re-run, confirm zero failures.

## The fixture (`fixtures/`: committed inputs, generated corpus)

CI needs the transform and every test to run with **zero network and zero reads under
`codex.data-path`**.
`fixtures/` holds a small (~1.8 MB) committed set of inputs taken from the real data, and a
fixture corpus generated from them:

```
fixtures/
  raw/
    foundry/    a real-shaped mini Foundry snapshot (packs/pf2e/<pack>/..., static/lang/,
                system.pf2e.json) — ~30 hand-picked real docs, enough to reproduce the
                Heal legacy/remaster pair, Magic Missile -> Force Barrage, the Adamantine
                Dragon qualifier-reorder + 1:N variant, the Camouflage Coat alias, and the
                Anadi journal-page merge from scratch when re-parsed
    aon/        the matching real AoN doc hits (spell/creature/ancestry/feat), same
                {category, hits:[...]} shape the real fetcher produces
    homebrew*/  the homebrew mini store (inline docs in extract-fixture.ts)
  join-aliases.json   trimmed to the one alias entry this fixture's raw docs exercise
  picks/        111 canonical-form-ONLY entities (no raw source) copied verbatim from a real
                emitted corpus — one representative per codex category (the smallest
                entity in that category) plus whatever else is needed to cover every
                CodexNode kind at least once (`blockquote` is allowlisted as
                corpus-extinct post-D29-19 — the only blockquotes lived in the excluded
                pregen docs — and the extractor re-proves that extinction on every run)
  entities/     GENERATED, gitignored: the fixture corpus (235 entities) that tests, guards
                and goldens read
```

`src/fixtureCorpus.ts` generates `entities/` from three sources: the picks; 32 entities
(class stats, doctrine/lesson/patron subclasses) from a `runTransform` run over `raw/`, prose
trimmed to a stub; and patches and synthetic rows defined in code (the 90 `ritual/virt-*`
rows, the basic-lesson collision pair, and test-only additions to `class/witch` and
`class-feature/reactive-strike`), each naming the test that needs it. It derives the D29-21
read surface the server expects: a per-category `_index.json`, `manifest.json`,
`rules-tree.json` and `sources-index.json`. The output is deterministic; nothing edits it by
hand.

`src/extract-fixture.ts` (`cli extract-fixture`) refreshes `raw/` and `picks/` from the
real snapshots and the current release (host-only, rare). It then builds the fixture
corpus into a temp dir and **asserts the full coverage matrix** over it — every category,
every `CodexNode` kind, the legacy pair, the alias join, the qualifier-reorder + variantOf
pair, a journal-merged entity, a residual `-2` collision, a Foundry-only / AoN-only entity,
and the class-stats cases. It fails loudly (listing exactly what's missing) rather than
silently shipping a gap. The 2 MB budget covers the committed inputs.

`src/transform.test.ts` is the CI-hermetic pipeline test: it calls the exact same
`runTransform()` the real CLI uses, twice, over `fixtures/raw/`, into two fresh temp
dirs, and asserts zero hard failures, byte-identical output between the two runs, 100%
Zod-valid entities, the `entities/` coverage set still parsing, and a couple of content
spot-checks (the Heal pair's cross-links, Magic Missile's license + pairing).
`src/fixtureCorpus.test.ts` does the same for the fixture generator.
