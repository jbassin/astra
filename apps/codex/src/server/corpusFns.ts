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

import { emptyAssayReader } from "./assayFs";
import {
  type ClassPageData,
  type ClassRailData,
  resolveClassPageData,
  resolveClassRail,
} from "./classPageData";
import { getCorpusReader } from "./corpusFs";
import { type CategoryDirectoryData, resolveCategoryDirectory } from "./directoryData";
import { type EntityPageData, resolveEntityPageData } from "./entityPageData";
import { type CategoryListingData, resolveCategoryListing } from "./listingData";
import { resolveRulesTree, type RulesTreeData } from "./rulesTreeData";
import { resolveSourcesIndex, type SourcesIndexData } from "./sourcesIndexData";

/**
 * The one entity-page server fn the route loader calls. `null` (an unknown
 * category/slug/traversal attempt) crosses the serverFn RPC boundary as a plain
 * value rather than a thrown error; the ROUTE loader turns it into `notFound()`
 * (D29-22).
 */
export const getEntityPage = createServerFn({ method: "GET" })
  .validator((input: { category: string; slug: string }) => input)
  .handler(({ data }): EntityPageData | null =>
    // D30-39/40 — the one real `AssayReader` call site. The assay surface is ON
    // HOLD (stakeholder, 2026-07-20): wired to `emptyAssayReader` so the block
    // never displays; the loader/component/artifact machinery stays intact.
    // Revisit = swap back to `getAssayReader()` from "./assayFs".
    resolveEntityPageData(getCorpusReader(), data, emptyAssayReader),
  );

/** S3 (D29-27) — the category directory, served at `/categories` since
 * P4.5 S2 (D29-47). */
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

/** P4 S4 (D29-43) — the `/sources` aggregate index's loader. No `null` case,
 * same reasoning as `getRulesTree` above (the artifact is always present in
 * a valid corpus, real or fixture). */
export const getSourcesIndex = createServerFn({ method: "GET" }).handler(
  (): SourcesIndexData => resolveSourcesIndex(getCorpusReader()),
);

/** P12 S2 (D29-117) — the `/class/{slug}` bespoke page's one loader server
 * fn. `subclassTargetIds` is the URL's `?subclass=` CSV, already split by
 * the route's own `urlState.ts` codec — this fn takes the decoded array,
 * never the raw query string. `null` (unknown slug in the `class` category)
 * crosses the RPC boundary as a plain value, same `getEntityPage` convention. */
export const getClassPage = createServerFn({ method: "GET" })
  .validator((input: { slug: string; subclassTargetIds?: readonly string[] }) => input)
  .handler(({ data }): ClassPageData | null => resolveClassPageData(getCorpusReader(), data));

/** P12 S2 (D29-118) — the bare `/class` index route's own loader: just the
 * rail (no entity, no `?subclass=` to decode). `/class/{slug}` computes the
 * SAME rail data as part of its own `getClassPage` call above (one corpus
 * read either way — `resolveClassRail` is a cheap `_index.json`-only pass,
 * no per-doc reads), so this is a separate, smaller server fn rather than a
 * redundant `getClassPage` call with a placeholder slug. */
export const getClassRail = createServerFn({ method: "GET" }).handler(
  (): ClassRailData => resolveClassRail(getCorpusReader()),
);
