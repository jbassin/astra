import { z } from "zod";

import { CodexId, EditionSchema, LicenseSchema } from "./entity";

/**
 * `rules-tree.json` (D29-39, spec §3 P4 S1 deliverable) — the per-book rules
 * hierarchy, built from the AoN `breadcrumbs` ancestor chain now threaded
 * onto `CodexEntity` (`entity.ts`'s `breadcrumbs?: string[]`). See
 * `src/ingest/rulesTree.ts` for the builder (parent resolution + sibling
 * ordering algorithm) — this module is the SHAPE only, mirroring
 * `entity.ts`/`nodes.ts`'s own "schema module owns validation, a sibling
 * ingest module owns construction" split.
 *
 * `TreeNode.id` is a `CodexId` when the node corresponds to a real rules
 * entity; absent means a SYNTHETIC node (a parent breadcrumb element that
 * resolved to no real doc at all, D29-39's fallback-then-synthetic rule —
 * pinned at exactly 3 in the real corpus). `TreeNode.superseded` mirrors the
 * site-wide `remasteredAs`-non-empty predicate (`IndexRow.superseded`'s own
 * convention) — omitted (never `false`) when the node isn't superseded, same
 * "absent, never a defaulted falsy value" convention every other optional
 * corpus field follows.
 *
 * Node arrays (`children`, `RulesTreeBook.nodes`) are emitted in FINAL order
 * (DFS-ready) — the sibling-group chain-walk ordering rule (D29-39) is a
 * property of the BUILDER, not this schema; `canonicalJson` still key-sorts
 * every OBJECT's own keys, but array element order is meaningful data here
 * and is never touched by that sort (same convention `emit.ts`'s entity/
 * category sort already relies on for `_index.json` row order).
 */

export interface TreeNode {
  name: string;
  id?: string;
  superseded?: boolean;
  children: TreeNode[];
}

/** Recursive zod schema — see `nodes.ts`'s `CodexNodeSchema` for the same
 * `z.ZodType<T> = z.lazy(...)` tie-the-knot pattern this mirrors. */
export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1),
      id: CodexId.optional(),
      superseded: z.literal(true).optional(),
      children: z.array(TreeNodeSchema),
    })
    .strict(),
);

export const RulesTreeBookSchema = z
  .object({
    book: z.string().min(1),
    edition: EditionSchema,
    license: LicenseSchema,
    /** Count of nodes (with an `id`) in this book that are `superseded` — the
     * D29-40 legacy-toggle "N hidden" precompute. Two real books measure
     * 100% here (Dark Archive 29/29, Guns & Gears 65/65) — expected, not a
     * bug (their "(Remastered)" twins carry the content). */
    hiddenWhenLegacyOff: z.number().int().nonnegative(),
    nodes: z.array(TreeNodeSchema),
  })
  .strict();
export type RulesTreeBook = z.infer<typeof RulesTreeBookSchema>;

export const RulesTreeFileSchema = z
  .object({
    books: z.array(RulesTreeBookSchema),
  })
  .strict();
export type RulesTreeFile = z.infer<typeof RulesTreeFileSchema>;

export function parseRulesTreeFile(data: unknown): RulesTreeFile {
  return RulesTreeFileSchema.parse(data);
}
