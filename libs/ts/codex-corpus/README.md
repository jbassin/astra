# @astra/codex-corpus — the codex corpus contract

The corpus contract that codex's site (`apps/codex/web`) and its ingest pipeline
(`apps/codex/ingest`) share: the Zod schemas the transform validates against and the site
reads, the reader over a corpus directory, the release layout, and the pure node utilities both
sides use. Neither of those packages imports the other at run time.

## API

- **`@astra/codex-corpus`** (browser-safe: Zod and pure functions only)
  - Schemas and types: `schema/entity` (`CodexEntitySchema`, `IndexRow`, `Facets`, `Stats`, …),
    `schema/nodes` (`CodexNodeSchema`, `BlockNode`, `InlineNode`, …), `schema/manifest`,
    `schema/rulesTree`, `schema/sourcesIndex`, `schema/facetKeys`.
  - `CORPUS_SCHEMA_VERSION`: the generation `manifest.json` records. Bump it on any corpus-shape
    change a consumer must detect.
  - `collectText`, `firstParagraphSummary`, `statsText` and the `humanize*` helpers (`text.ts`).
  - `collectEmbedTargetIds` (`embeds.ts`): the depth-0 resolved embed targets a page prefetches.
  - `sluggify`: the verbatim foundryvtt/pf2e port that defines entity identity.
- **`@astra/codex-corpus/reader`** (`node:fs`; server and scripts only)
  - `createCorpusReader(rootDir)`, `CorpusReader`, `CorpusNotFoundError`. A pure factory with no
    config reads; which root a server serves is the app's decision (`src/server/corpusFs.ts`).
- **`@astra/codex-corpus/releases`** (`node:fs`; server and release builder only)
  - The release layout (`releasesDirOf`, `releaseCorpusDir`, `releaseSearchDir`,
    `CURRENT_LINK`, `RELEASE_ID_RE`, `readCurrentReleaseId`) and the servability check both
    sides run: `inspectCorpus(root)` (a readable manifest at this `CORPUS_SCHEMA_VERSION`;
    reports whether it is the fixture) and `CorpusUnservableError`. The writers live in the
    ingest package (`src/releaseStore.ts`).

## Traps

- Keep `node:fs` out of the root entry. Client code imports the root entry, and an fs import
  there would reach the client bundle.
- Keep `"sideEffects": false` in `package.json`. Without it the bundler keeps every Zod schema the
  root entry re-exports, about 100 KB of client JS.
- codex, codex-ingest and this package must resolve the same `zod` (4.6.7; see
  `pnpm-workspace.yaml`).
- Tests here are pure. Anything that needs the fixture corpus lives in `apps/codex/ingest`,
  which generates it, or in the site.
