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

import { OTHER_GROUP_LABEL } from "../domain/sources/sourcesModel";
import type { IndexRow } from "../schema/entity";
import { CorpusNotFoundError, type CorpusReader } from "./corpusFs";

export interface CategoryListingData {
  category: string;
  rows: IndexRow[];
  /** P13 S3 (D29-121) — raw `source.book` value -> product-line group name,
   * built from the FULL category row set (never a windowed/filtered subset)
   * joined against `reader.sourcesIndex()`. Every book that appears anywhere
   * in `rows` has a key here (fail-soft to `OTHER_GROUP_LABEL`, see
   * `buildSourceLines`'s own doc comment) — the panel's grouped Source
   * section (`FacetPanel.tsx`'s `SourceSection`, D29-128) looks values up by
   * the SAME raw book string `sourceBookValueOf`/the URL codec already use;
   * this map is presentation-only, it never crosses back into the filter
   * engine or the URL. */
  sourceLines: Record<string, string>;
}

/** D29-121 — one-time (not per-request) warn when `sources-index.json` is
 * missing/malformed: `reader.sourcesIndex()` doesn't cache a THROWN attempt
 * (only a successful parse, `corpusFs.ts`), so a genuinely absent artifact
 * would otherwise re-throw — and this module would otherwise re-warn — on
 * EVERY `resolveCategoryListing` call for the lifetime of the process. Module
 * -scope, not per-reader: this app has exactly one long-lived `CorpusReader`
 * singleton per process (`corpusFs.ts`'s own `getCachedReader`), so "once per
 * process" and "once per reader" coincide in practice; a test constructing
 * its own throwaway reader against a sources-index-less fixture root still
 * only pays the `console.warn` cost once across the whole suite, which is
 * the point (loud, but not log-flooding).
 */
let warnedMissingSourcesIndex = false;

/** D29-121 — `source.book` -> product line, fail-soft THREE ways (spec's own
 * enumeration): a book whose `sourcesIndex()` entry carries no `productLine`
 * (the ~253-book "Other" bucket, `sourcesModel.ts`'s own EXPECTED-not-a-gap
 * note), a book with NO entry in the index at all, and — the one this
 * function itself guards against — the index FILE being missing/malformed
 * (`sourcesIndex()` throws `CorpusNotFoundError`) all resolve to
 * `OTHER_GROUP_LABEL`. The always-200 listing route must never 500 on this
 * artifact, and a fixture corpus with no `sources-index.json` at all (were
 * one ever committed that way) must keep every OTHER listingData test
 * passing. */
function bookToProductLine(reader: CorpusReader): ReadonlyMap<string, string> {
  try {
    const index = reader.sourcesIndex();
    const map = new Map<string, string>();
    for (const entry of index.books) map.set(entry.book, entry.productLine ?? OTHER_GROUP_LABEL);
    return map;
  } catch (err) {
    if (!(err instanceof CorpusNotFoundError)) throw err;
    if (!warnedMissingSourcesIndex) {
      warnedMissingSourcesIndex = true;
      console.warn(
        "[codex] no sources-index.json (or it's malformed) — every /{category} listing's " +
          `"sourceLines" map will fall back to "${OTHER_GROUP_LABEL}" for every book (the ` +
          "panel's Source section still renders, just ungrouped). Expected for a fixture " +
          "corpus that predates this artifact; check the real corpus mount if this is a live deploy.",
      );
    }
    return new Map();
  }
}

/** D29-121 — built from `rows` (the caller's FULL category row set, never a
 * windowed/filtered subset — `resolveCategoryListing` itself only ever sees
 * the whole `_index.json`, so this is automatic here, not something this
 * function has to enforce). One entry per DISTINCT `source.book` value
 * actually present in the category. */
function buildSourceLines(rows: readonly IndexRow[], reader: CorpusReader): Record<string, string> {
  const bookToLine = bookToProductLine(reader);
  const sourceLines: Record<string, string> = {};
  for (const row of rows) {
    const book = row.source.book;
    if (book in sourceLines) continue;
    sourceLines[book] = bookToLine.get(book) ?? OTHER_GROUP_LABEL;
  }
  return sourceLines;
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
  return { category, rows: sorted, sourceLines: buildSourceLines(sorted, reader) };
}
