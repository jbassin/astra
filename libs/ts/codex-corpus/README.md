# @astra/codex-corpus — the codex corpus contract

The corpus contract that codex's site (`apps/codex/web`) and its ingest pipeline share: the Zod
schemas the transform validates against and the site reads, the reader over a corpus directory,
and the pure node utilities both sides use. The ingest code still lives in the app for now.

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

## Traps

- Keep `node:fs` out of the root entry. Client code imports the root entry, and an fs import
  there would reach the client bundle.
- Keep `"sideEffects": false` in `package.json`. Without it the bundler keeps every Zod schema the
  root entry re-exports, about 100 KB of client JS.
- codex and this package must resolve the same `zod` (both 4.6.7; see `pnpm-workspace.yaml`).
- Tests here are pure. Anything that needs the fixture corpus stays in `apps/codex/web`, which
  generates it.
