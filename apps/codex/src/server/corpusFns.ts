// D29-23's other half: the `createServerFn` wrapper the route loader calls.
// Client navigations fetch this over RPC; SSR runs it inline (the akasha `$.tsx`
// precedent). This module is the ONLY place `corpusFs.ts` (the `node:fs` seam)
// gets imported outside its own file — routes/components never touch it
// directly, so `node:fs`/`@astra/config` never reach the client bundle. Kept
// deliberately minimal (mirrors heartwood-frontend's `serverFns/loadReview.ts`
// shape exactly: ONLY `createServerFn` definitions) — the pure, unit-testable
// core logic lives in the sibling `entityPageData.ts`, which nothing under
// `src/routes/` imports (see that file's own comment on why the split matters).

import { createServerFn } from "@tanstack/react-start";

import { getCorpusReader } from "./corpusFs";
import { type CategoryDirectoryData, resolveCategoryDirectory } from "./directoryData";
import { type EntityPageData, resolveEntityPageData } from "./entityPageData";
import { type CategoryListingData, resolveCategoryListing } from "./listingData";
import { resolveRulesTree, type RulesTreeData } from "./rulesTreeData";

/**
 * The one entity-page server fn the route loader calls. `null` (an unknown
 * category/slug/traversal attempt) crosses the serverFn RPC boundary as a plain
 * value rather than a thrown error; the ROUTE loader turns it into `notFound()`
 * (D29-22).
 */
export const getEntityPage = createServerFn({ method: "GET" })
  .validator((input: { category: string; slug: string }) => input)
  .handler(({ data }): EntityPageData | null => resolveEntityPageData(getCorpusReader(), data));

/** S3 (D29-27) — the `/` category directory. */
export const getCategoryDirectory = createServerFn({ method: "GET" }).handler(
  (): CategoryDirectoryData => resolveCategoryDirectory(getCorpusReader()),
);

/** S3 (D29-27) — the `/{category}` A–Z listing; `null` (unknown category) ->
 * the route loader's `notFound()`, same convention as `getEntityPage`. */
export const getCategoryListing = createServerFn({ method: "GET" })
  .validator((input: { category: string }) => input)
  .handler(({ data }): CategoryListingData | null =>
    resolveCategoryListing(getCorpusReader(), data.category),
  );

/** P4 S2 (D29-40) — the `/rules` tree browser's loader. No `null` case (the
 * artifact is always present in a valid corpus, real or fixture) — a
 * missing/malformed `rules-tree.json` is a genuine server error, not a
 * "this page doesn't exist" 404. */
export const getRulesTree = createServerFn({ method: "GET" }).handler(
  (): RulesTreeData => resolveRulesTree(getCorpusReader()),
);
