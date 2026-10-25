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
| `transform --out <dir> [--pass <name>]` | Snapshots + homebrew store → a corpus tree at `<dir>`, with `report.json`/`report.md`. `--pass` runs one pass and the passes it reads from. | (inside `release build`) |
| `transform --list-passes` | Prints the pass registry: each pass's phase, summary, reads and writes. | |
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
setup, its e2e server and its golden regeneration call it.

## Determinism

Two transform runs over the same snapshots produce a byte-identical corpus tree
(`transform.test.ts` checks it over the fixture inputs). The Pagefind index is not
byte-stable between runs (its filter files differ), so compare indexes by page count.

## Traps

**Corpus and ingest**
- Run the real transform before trusting any count in a doc, test or golden. Counts derived
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
  `fixtures/raw/aon/class-feature.json` (witch's Weapon Specialization, which a
  `transform.test.ts` case needs): restore that hit from git afterwards.
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

Two snapshots under `<codex.data-path>/snapshots/` (outside the repo; fetched once, never
queried at transform time) are parsed by two independent grammars, joined into one canonical
entity per real game element, and written as a deterministic corpus tree.

### Module map

| Stage | Module(s) | What it does |
| --- | --- | --- |
| Fetch | `src/fetch-foundry.ts`, `src/fetch-aon.ts` | Snapshot the two sources to `<codex.data-path>/snapshots/`; update the committed `corpus-manifest.json` pin. |
| Parse (Foundry) | `src/{enrichers,foundryHtml,journals,foundryEntities,uuidResolve}.ts` | `@UUID`/`@Check`/`@Damage`/`@Localize`/`@Template`/`@Embed` + inline-roll grammar → `CodexNode`s; JournalEntry `pages[]` assembly; per-doc license/edition. |
| Parse (AoN) | `src/{aonFacets,aonMarkup,aonLinkTable}.ts` | Facet extraction + the `markdown` field's custom-tag grammar → `CodexNode`s; the AoN-URL→codex-id link table. |
| Join | `src/join.ts` | Slug match → qualifier-reorder normalization → `join-aliases.json`; field ownership (Foundry wins mechanics, AoN wins prose/citations); identity finalization (`@legacy`/`-2` suffixing); crossref/embed patching. |
| Emit | `src/emit.ts` | Deterministic corpus writer — sorted keys, sorted file order, zod-validates every entity. |
| Report | `src/report.ts` | Pure builders for `report.json`/`report.md`. |
| Search | `src/build-search.ts` | The Pagefind index over a corpus tree. |
| Release | `src/releaseStore.ts`, `src/release.ts` | Staging, validation, content-hash ids, the `current` swap, rollback, pruning. |
| Orchestrate | `src/transform.ts`, `src/passRegistry.ts`, `src/cli.ts` | `TRANSFORM_PASSES` lists every pass; `runTransform()` validates and runs it; the CLI wraps each step. |

The shared Zod contracts (`CodexEntity`, `CodexNode`, `CorpusManifest`) live in the
`@astra/codex-corpus` package (`libs/ts/codex-corpus`), which the site and the ingest both import.

### The pass registry

`runTransform` runs `TRANSFORM_PASSES` (`src/transform.ts`), an array of passes in run order.
Each pass names the state slots it reads and writes (`TransformSlots`) and a phase. Before a
run, `validatePasses` (`src/passRegistry.ts`) fails on a duplicate name, a slot with two
writers, a read nobody writes, a dependency cycle, a pass placed before a pass it reads from,
or a parse pass after a build pass. After the parse phase, any hard failure stops the run.

Each pass gets one span (`codex.transform.<pass>`) and one log line with its time and counts;
the CLI sends both to SigNoz as `astra.codex-ingest`. Timings and counts never go into the
corpus or the report, so the output stays byte-identical. `transform --pass <name>` runs one
pass with only the passes it reads from (a pass that writes files still writes them).

To add a pass, add a slot to `TransformSlots` and an entry at the point where its reads exist.
A pass that only needs to run after another (a file written after `emit-corpus` wipes the
root) reads that pass's slot. Moving a pass that calls `report` changes the order of that
class's examples in `report.json`, so check the output diff after any reorder.

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

`just codex-refresh` refuses to run if `git status --porcelain -- apps/codex/ingest` is
non-empty: a refresh rewrites the committed `corpus-manifest.json` pin, and that diff must be
reviewable on its own. Commit first.

A real run takes about a minute end to end and produces about 45,000 entities in 88
categories, about 555 MB of corpus (under `codex.data-path`, never in the repo).

## Corpus layout (`releases/<id>/corpus/`)

```
corpus/
  <category>/
    <slug>.json           one file per entity
    <slug>@legacy.json    the legacy half of a remaster pair that shares a slug
    _index.json           slim rows for the whole category, no body (see below)
  manifest.json           schemaVersion, source pins, per-category counts, total size
  rules-tree.json         the rules books as trees (the site's /rules)
  sources-index.json      one row per source book, grouped by product line (the site's /sources)
  report.json / report.md the transform report (see below)
```

- `_index.json` holds id, name, level, traits, rarity, source, edition, `superseded` and the
  `facets` subset that `facetKeys.ts` (`@astra/codex-corpus`) allows for that category. It is
  sorted by id and written as compact JSON. The leading underscore matters: `sluggify()` never
  emits one, so the file can never clobber a real entity (there are real `index` slugs).
- `manifest.json` summarizes what was emitted. It is not the committed `corpus-manifest.json`,
  which pins what to fetch. `totalEntityCount` matches a count of the entity files exactly.
- `creature` and `hazard` entities carry a typed `stats` statblock projection; `class` entities
  carry typed class `stats` (key ability, HP, proficiencies, feat cadence, granted features and
  subclass options), built by `augmentClassStats.ts` over the final kept entity set.
- Foundry `character` Actors (pregens, companions) are excluded before assembly: their numbers
  are derived at run time by the pf2e system. The report counts them (`excludedActorsCount`).
- A broken field in a hazard's `disable`/`routine`/`reset` HTML is omitted and counted
  (`hazardStatsHtmlFailed`); entity `body` parsing still hard-fails.

Every file goes through one of two canonical serializers, both key-sorted (codepoint order,
recursively) with a trailing LF: `canonicalJson` (2-space indent) for everything except
`_index.json`, which uses `canonicalJsonCompact`. Array order in `rules-tree.json` is meaningful
and kept. `emit.ts` wipes its output dir before every write, so a stale file can't survive a
re-transform. To check determinism, copy a run aside and `diff -r` it against a second run.

## The transform report

Read `report.md` first after a transform. It covers, per category: Foundry-in, AoN-in and
final-out counts; join rate (exact, qualifier-normalized, alias); unjoined residues (capped
lists); slug collisions (legacy pair or residual); legacy/remaster pairing and the Foundry
`remaster-changes` cross-check; crossref/embed patch stats; license/edition breakdowns; and
non-fatal report-class counts (broken refs, mismatches, dropped images, ...). **Join rates are a judgment call,
not a threshold.** A category under 50% joined with both sources present gets a
`⚠ STOP-condition` callout at the top of the report. That means the join key needs a human
decision; the pipeline does not correct it.

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
`codex.data-path`**. `fixtures/` holds a small (~1.8 MB, within a 2 MiB budget) committed set
of inputs taken from the real data, and a fixture corpus generated from them:

```
fixtures/
  raw/
    foundry/    a real-shaped mini Foundry snapshot (packs/pf2e/<pack>/..., static/lang/,
                system.pf2e.json): about 50 hand-picked real docs, enough to reproduce the
                Heal legacy/remaster pair, Magic Missile -> Force Barrage, the Adamantine
                Dragon qualifier-reorder + 1:N variant, the Camouflage Coat alias, the
                Anadi journal-page merge and the class-stats cases from scratch
    aon/        the matching real AoN doc hits, in the {category, hits:[...]} shape the
                real fetcher produces
    homebrew*/  the homebrew mini store (inline docs in extract-fixture.ts)
  join-aliases.json   trimmed to the one alias entry this fixture's raw docs exercise
  picks/        111 canonical-form-only entities copied verbatim from a real emitted corpus:
                the smallest entity in each category, plus whatever else covers every
                CodexNode kind (`blockquote` is allowlisted as extinct: the only ones lived
                in the excluded pregen docs, and the extractor re-checks that every run)
  entities/     GENERATED, gitignored: the fixture corpus (235 entities) that tests, guards
                and goldens read
```

`src/fixtureCorpus.ts` generates `entities/` from three sources: the picks; 32 entities
(class stats, doctrine/lesson/patron subclasses) from a `runTransform` run over `raw/`, prose
trimmed to a stub; and patches and synthetic rows defined in code (the 90 `ritual/virt-*`
rows, the basic-lesson collision pair, and test-only additions to `class/witch` and
`class-feature/reactive-strike`), each naming the test that needs it. It derives the read
surface the server expects: a per-category `_index.json`, `manifest.json`,
`rules-tree.json` and `sources-index.json`. The output is deterministic; nothing edits it by
hand.

`src/extract-fixture.ts` (`cli extract-fixture`) refreshes `raw/` and `picks/` from the
real snapshots and the current release (host-only, rare). It then builds the fixture
corpus into a temp dir and **asserts the full coverage matrix** over it — every category,
every `CodexNode` kind, the legacy pair, the alias join, the qualifier-reorder + variantOf
pair, a journal-merged entity, a residual `-2` collision, a Foundry-only / AoN-only entity,
and the class-stats cases. It fails loudly, listing exactly what is missing, and fails when
the committed inputs exceed the 2 MiB budget.

`src/transform.test.ts` is the CI-hermetic pipeline test: it calls the exact same
`runTransform()` the real CLI uses, twice, over `fixtures/raw/`, into two fresh temp
dirs, and asserts zero hard failures, byte-identical output between the two runs, 100%
Zod-valid entities, the `entities/` coverage set still parsing, and a couple of content
spot-checks (the Heal pair's cross-links, Magic Missile's license + pairing).
`src/fixtureCorpus.test.ts` does the same for the fixture generator.
