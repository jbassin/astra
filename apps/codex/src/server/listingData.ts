// S3 (D29-27) — the `/{category}` A–Z listing's pure core, split the same way
// `entityPageData.ts` is (see that file's own comment on why the split matters:
// nothing under `src/routes/` imports this directly, only `corpusFns.ts` and this
// app's own tests do).
//
// M6 weight measurement (spec §6 risk / D29-27): a listing row does NOT render
// `traits` (D29-27's field list is "name -> link, level, rarity, source book,
// edition pill") — `ListingRow` below drops it from `IndexRow`, so the loader
// payload TanStack Start dehydrates into `window.$_TSR` carries only what the
// page actually renders, not the full `IndexRow` (the sanctioned "trim the
// loader payload to rendered fields" fallback, done proactively rather than
// waiting to see if the feat listing measures badly).

import type { Edition, IndexRow, Source } from "../schema/entity";
import { CorpusNotFoundError, type CorpusReader } from "./corpusFs";

export interface ListingRow {
  id: string;
  name: string;
  level?: number;
  rarity?: string;
  source: Source;
  edition: Edition;
}

export interface CategoryListingData {
  category: string;
  rows: ListingRow[];
}

function toListingRow(row: IndexRow): ListingRow {
  return {
    id: row.id,
    name: row.name,
    ...(row.level !== undefined ? { level: row.level } : {}),
    ...(row.rarity !== undefined ? { rarity: row.rarity } : {}),
    source: row.source,
    edition: row.edition,
  };
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
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return { category, rows: sorted.map(toListingRow) };
}
