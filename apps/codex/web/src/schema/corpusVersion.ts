/** The CodexEntity/CodexNode schema generation that `corpus/manifest.json` records as
 * `schemaVersion`. Bump it on any corpus-shape change a consumer must detect: a new
 * field on a validated shape, a new node kind, a new `stats` union member, a renamed
 * file (5 = P12's `ClassStatsSchema`). It is not `corpus-manifest.json`'s fetch-pin
 * version, which is a different concept.
 *
 * It lives here, apart from the ingest writer (`src/ingest/emit.ts`), so the server can
 * refuse a corpus built for another generation without bundling the ingest code. */
export const CORPUS_SCHEMA_VERSION = 5;
