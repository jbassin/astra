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
 */

export const SourceIndexEntrySchema = z
  .object({
    book: z.string().min(1),
    productLine: z.string().min(1).optional(),
    license: LicenseSchema,
    edition: EditionSchema,
    entityCount: z.number().int().nonnegative(),
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
