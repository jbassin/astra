// S3 (D29-27, superseded by D29-35) — the `/{category}` faceted listing's pure
// core, split the same way `entityPageData.ts` is (see that file's own comment
// on why the split matters: nothing under `src/routes/` imports this directly,
// only `corpusFns.ts` and this app's own tests do).
//
// P3 S3 (D29-35): the P2 `ListingRow` trim (name/level/rarity/source/edition
// only, no `traits`/`facets`/`superseded`) is DEAD — "the /{category} loader
// ships the FULL enriched row set (loses P2's ListingRow trim — rows now =
// IndexRow incl. facets/traits/superseded)". The filter engine needs every
// field on every row (traits for tri-state, facets for the derived-facet
// panel, superseded for the legacy toggle) to run client-side at all, so this
// module is now a thin sort-and-shape-null wrapper over `reader.index()`
// rather than a field-dropping projection.

import type { IndexRow } from "../schema/entity";
import { CorpusNotFoundError, type CorpusReader } from "./corpusFs";

export interface CategoryListingData {
  category: string;
  rows: IndexRow[];
}

/** `null` for an unknown category (`CorpusNotFoundError`, D29-23's guard) — same
 * "unknown thing -> null crosses the RPC boundary as a plain value" convention
 * `resolveEntityPageData` uses, so the route loader's `notFound()` call is
 * identical shape either way. */
export function resolveCategoryListing(
  reader: CorpusReader,
  category: string,
): CategoryListingData | null {
  let rows: readonly IndexRow[];
  try {
    rows = reader.index(category);
  } catch (err) {
    if (err instanceof CorpusNotFoundError) return null;
    throw err;
  }
  // A-Z by name — the filter engine re-sorts (name/level) over whatever's
  // actually VISIBLE after filtering; this base ordering just keeps the
  // unfiltered payload deterministic (matches the emit-time / D29-27
  // precedent) rather than leaving it in on-disk `_index.json` order.
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return { category, rows: sorted };
}
