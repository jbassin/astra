// The `/rules` tree browser's pure core. Mirrors
// `directoryData.ts`'s split: a plain function over an injected `CorpusReader`,
// directly unit-testable against the fixture corpus with zero
// createServerFn/Start-runtime machinery, called from `corpusFns.ts`'s thin
// wrapper. Unlike `directoryData.ts` (which reshapes `manifest.json`'s
// category-count map into a grouped view), this is a thin passthrough — the ingest's
// `rulesTree.ts` builder already did every ordering/grouping decision at
// TRANSFORM time, so there is no further server-side shaping: the
// route loader ships the artifact as-is, and `treeModel.ts` (the pure
// client-side tree logic — legacy pruning, quick-filter, collapse state, DFS
// walk) operates directly on `RulesTreeBook.nodes`.

import type { RulesTreeFile } from "@astra/codex-corpus";
import type { CorpusReader } from "@astra/codex-corpus/reader";

export type RulesTreeData = RulesTreeFile;

export function resolveRulesTree(reader: CorpusReader): RulesTreeData {
  return reader.rulesTree();
}
