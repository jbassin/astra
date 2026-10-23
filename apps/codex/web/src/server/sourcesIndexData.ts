// P4 S4 (D29-43) — the `/sources` aggregate index's pure core. Mirrors
// `rulesTreeData.ts` exactly: S1's `sourcesIndexBuild.ts` already did every
// grouping/derivation decision at TRANSFORM time, so there is no further
// server-side shaping here — the route loader ships the artifact as-is, and
// `src/domain/sources/sourcesModel.ts` (the pure client-independent grouping
// logic — product-line ordering, "Other" last) operates directly on
// `SourcesIndexFile.books`.

import type { SourcesIndexFile } from "../schema/sourcesIndex";
import type { CorpusReader } from "./corpusFs";

export type SourcesIndexData = SourcesIndexFile;

export function resolveSourcesIndex(reader: CorpusReader): SourcesIndexData {
  return reader.sourcesIndex();
}
