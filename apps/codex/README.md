# codex — the PF2e reference-site ingest pipeline

codex builds a canonical, Zod-typed, license-labeled corpus by combining two independently
maintained Pathfinder 2e sources: the **foundryvtt/pf2e** compendium packs (structured
mechanics, per-doc license data) and the **Archives of Nethys** Elasticsearch index (prose,
citations, page numbers). P1 (this ingest) is deliberately frontend-free — it ends with a
validated, deterministic, sharded corpus + a transform report on disk, not a rendered page.
See `thoughts/astra/specs/0029-codex-p1-ingest-spec.md` for the full spec.

## Pipeline shape

```
snapshots/foundry/<tag>/    ─┐
                              ├─► parse ─► join ─► emit ─► corpus/ + report
snapshots/aon/<date>/       ─┘
```

Two ONE-SHOT snapshots (`data/snapshots/`, gitignored — fetched once, never queried again at
transform/build time), parsed by two independent grammars, joined into one canonical entity
per real game element, and written as a deterministic corpus tree.

### Module map

| Stage | Module(s) | What it does |
| --- | --- | --- |
| Fetch | `scripts/fetch-foundry.ts`, `scripts/fetch-aon.ts` | Snapshot the two sources to `data/snapshots/`; update the committed `corpus-manifest.json` pin. |
| Parse (Foundry) | `src/ingest/{enrichers,foundryHtml,journals,foundryEntities,uuidResolve}.ts` | `@UUID`/`@Check`/`@Damage`/`@Localize`/`@Template`/`@Embed` + inline-roll grammar → `CodexNode`s; JournalEntry `pages[]` assembly; per-doc license/edition. |
| Parse (AoN) | `src/ingest/{aonFacets,aonMarkup,aonLinkTable}.ts` | Facet extraction + the `markdown` field's custom-tag grammar → `CodexNode`s; the AoN-URL→codex-id link table. |
| Join | `src/ingest/join.ts` | Slug match → qualifier-reorder normalization → `join-aliases.json`; field ownership (Foundry wins mechanics, AoN wins prose/citations); identity finalization (`@legacy`/`-2` suffixing); crossref/embed patching. |
| Emit | `src/ingest/emit.ts` | Deterministic corpus writer — sorted keys, sorted file order, zod-validates every entity. |
| Report | `src/ingest/report.ts` | Pure builders for `report.json`/`report.md` — the P1 acceptance artifact. |
| Orchestrate | `scripts/transform.ts` | `runTransform()` wires all of the above; CLI wrapper for the real host run. |

`src/schema/{entity,nodes,manifest}.ts` are the shared Zod contracts (`CodexEntity`,
`CodexNode`, `CorpusManifest`) — read by P2+ verbatim, same package.

## Running it

```bash
pnpm --filter @astra/codex fetch:foundry   # sparse-clones the pinned tag
pnpm --filter @astra/codex fetch:aon       # snapshots the AoN ES index (~259 MB, ≤4 req/s)
pnpm --filter @astra/codex transform       # parse -> join -> emit -> report

# or all three + a report summary in one step:
just codex-refresh
```

`just codex-refresh` **refuses to run if `git status --porcelain -- apps/codex` is
non-empty** — a refresh rewrites the committed `corpus-manifest.json` pin, and that diff
must be reviewable on its own (the linguist-commit-timer lesson: never let a generated-file
change ride in on top of unrelated in-progress edits). Commit or stash first.

A real run takes well under a minute end to end (~15s for the transform stage alone) and
produces roughly 46,000 entities / ~625 MB of corpus (gitignored — `data/` never leaves the
host; see the corpus layout below).

## Corpus layout (`data/corpus/`, gitignored)

```
corpus/
  <category>/
    <slug>.json          one file per entity (the P2 lazy-load unit)
    <slug>@legacy.json    the legacy half of a shared-slug remaster pair (D29-1)
    _index.json          slim facet rows for the whole category (id/name/level/traits/
                          rarity/source/edition — NO body), sorted by id. The leading
                          underscore is load-bearing (D29-21): sluggify() can never
                          emit one, so this file can never clobber a real entity slug
                          (the old plain index.json ate the two real `index`-slug
                          entities, ancestry/index + archetype/index)
  manifest.json           schemaVersion + the D29-4 source pins + final per-category
                          counts + total size (NOT the same file as the committed
                          apps/codex/corpus-manifest.json one level up — that one pins
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
- One upstream pack typo (`pfs-season-6-bestiary/.../historys-repetition-7-8`, an
  unterminated `@Check[` in its hazard `disable` field) is handled fail-soft: the one
  broken field is omitted and counted as `hazardStatsHtmlFailed` — entity `body`
  parsing keeps its hard-fail posture.

Every file is written through one canonical serializer (`emit.ts`'s `canonicalJson`):
object keys sorted recursively (codepoint order), 2-space indent, trailing LF. Two full
transform runs over the same snapshots produce a **byte-identical** `corpus/` tree —
verify with `diff -r` after copying a run aside. `emit.ts` wipes `corpus/` before every
write, so a stale file from a category/entity that no longer exists can't survive a
re-transform.

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
   lists (or `pnpm --filter @astra/codex exec node --import
   ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/dev-join.ts` for the live
   category/dragon-family breakdown).
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
`src/ingest/foundryEntities.ts`'s `present()` helper for the `null`-vs-`undefined`
landmines the real corpus has already turned up), re-run, confirm zero failures.

## The fixture (`fixtures/`, committed)

CI needs the transform to run with **zero network and zero `data/` reads** — `fixtures/`
is a small (~1 MB), deterministic, committed subset of the real corpus that makes that
possible:

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
  join-aliases.json   trimmed to the one alias entry this fixture's raw docs exercise
  entities/     canonical-form-ONLY entities (no raw source) copied verbatim from a real
                emitted corpus — one representative per codex category (the smallest
                entity in that category) plus whatever else is needed to cover every
                CodexNode kind at least once (`blockquote` is allowlisted as
                corpus-extinct post-D29-19 — the only blockquotes lived in the excluded
                pregen docs — and the extractor re-proves that extinction on every run).
                Also carries the D29-21 fixture read surface: a per-category
                `_index.json` (fixture-scoped IndexRows) and a fixture-scoped
                `manifest.json` (fixture categoryCounts), so P2's corpus reader/route
                tests/ssrSmoke run hermetically with zero `data/` reads
```

`scripts/extract-fixture.ts` builds this from a real emitted corpus (run
`pnpm --filter @astra/codex transform` first) and **asserts the full coverage matrix**
before writing anything — every category, every `CodexNode` kind, the legacy pair, the
alias join, the qualifier-reorder + variantOf pair, a journal-merged entity, a residual
`-2` collision, and a Foundry-only / AoN-only entity. It fails loudly (listing exactly
what's missing) rather than silently shipping a gap.

`scripts/transform.test.ts` is the CI-hermetic pipeline test: it calls the exact same
`runTransform()` the real CLI uses, twice, over `fixtures/raw/`, into two fresh temp
dirs, and asserts zero hard failures, byte-identical output between the two runs, 100%
Zod-valid entities, the `entities/` coverage set still parsing, and a couple of content
spot-checks (the Heal pair's cross-links, Magic Missile's license + pairing).
