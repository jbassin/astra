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
import { type EntityPageData, resolveEntityPageData } from "./entityPageData";

/**
 * The one entity-page server fn the route loader calls. `null` (an unknown
 * category/slug/traversal attempt) crosses the serverFn RPC boundary as a plain
 * value rather than a thrown error; the ROUTE loader turns it into `notFound()`
 * (D29-22).
 */
export const getEntityPage = createServerFn({ method: "GET" })
  .validator((input: { category: string; slug: string }) => input)
  .handler(({ data }): EntityPageData | null => resolveEntityPageData(getCorpusReader(), data));
