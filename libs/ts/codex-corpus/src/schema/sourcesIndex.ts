import { z } from "zod";

import { CodexId, EditionSchema, LicenseSchema } from "./entity";

/**
 * `sources-index.json` (D29-43, spec §3 P4 S1 deliverable) — the `/sources`
 * aggregate book index, grouped by AoN `primary_source_category` ("product
 * line"). One row per normalized `source.book` string (post the D29-39
 * mechanical book-name normalization pass — see `src/ingest/bookNormalize.ts`)
 * across the WHOLE corpus, not just rules — distinct from `/source`'s own
 * P3 faceted listing of the 245 `source`-category book ENTITIES (both
 * remain, D29-43's "relationship to the existing `/source` category
 * listing" note).
 *
 * `productLine` is absent for the ~253-book "Other" bucket (Foundry-only
 * book strings with zero AoN citations, D29-43 — EXPECTED, not a gap).
 * `license`/`edition` are the D29-39 book-level derivation (title
 * "(Remastered)" override, licenseMap/source-entity lookup, `"unknown"`
 * pill never a guessed OGL). `sourceEntityRef` links to the book's own
 * `source/{slug}` entity page when one exists (245 of the ~C normalized
 * books) — absent for sourceless books (renders without the link, D29-43).
 *
 * `categoryCounts` (P4 S4, D29-43's "per-category count links into filtered
 * browse" deliverable): the SAME `entityCount` total, broken down per
 * `CodexEntity.category` — `{category: count}`, every key's value ≥ 1 (a
 * category with zero of this book's entities is simply omitted, never a
 * `0`-valued key, matching every other "absent, never a defaulted empty"
 * corpus convention). Additive over the S1-shipped shape — every book has
 * ≥1 entity (`entityCountByBook`'s own keys, `sourcesIndexBuild.ts`), so
 * this is never an empty object; kept REQUIRED (not optional) since it's
 * cheap to compute and never legitimately absent. Feeds each book row's
 * `/{category}?book=<this book>` link with a real per-category count
 * instead of `entityCount` (which would over-count for a book spanning
 * multiple categories).
 */

export const SourceIndexEntrySchema = z
  .object({
    book: z.string().min(1),
    productLine: z.string().min(1).optional(),
    license: LicenseSchema,
    edition: EditionSchema,
    entityCount: z.number().int().nonnegative(),
    categoryCounts: z.record(z.string(), z.number().int().positive()),
    sourceEntityRef: CodexId.optional(),
  })
  .strict();
export type SourceIndexEntry = z.infer<typeof SourceIndexEntrySchema>;

export const SourcesIndexFileSchema = z
  .object({
    books: z.array(SourceIndexEntrySchema),
  })
  .strict();
export type SourcesIndexFile = z.infer<typeof SourcesIndexFileSchema>;

export function parseSourcesIndexFile(data: unknown): SourcesIndexFile {
  return SourcesIndexFileSchema.parse(data);
}
