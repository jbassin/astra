import { z } from "zod";

import { CodexId } from "./entity";

/**
 * D30-38 — the cross-track CONTRACT: `apps/assay`'s `assay export-codex`
 * artifact, `<data-path>/assay/spell-power.json` (a SIBLING of `corpus/`
 * and `search/`, D30-41's third identical-path bind — NOT under
 * `corpus/`). Track B (this app) builds against THIS schema, never Track
 * A's in-progress implementation — the spec's own "builds against the
 * D30-38 schema fixture, NOT Track A's output" instruction (§5, Track B
 * slice).
 *
 * Deterministic per D30-38 (sorted keys, comparables in engine
 * `(-similarity, name)` order, no timestamps) — none of that ordering is
 * enforced here (this is a read-side schema, not an emit-side one); this
 * file only validates SHAPE.
 *
 * `variants[]` (the D30-38 "34 multi-row slugs" variant-collapse
 * mechanism): each variant carries `label` plus the SAME fields as a
 * top-level entry, EXCLUDING a further nested `variants` — the spec's own
 * "variants render as sub-lines" describes a depth-1 structure, and the
 * export report's own worked example never nests a variant's variant.
 */

export const AssayKindSchema = z.enum([
  "quantitative",
  "comparables",
  "buff-comparables",
  "ledger",
]);
export type AssayKind = z.infer<typeof AssayKindSchema>;

/** `null` is a real, distinct value here (not "absent") — an entry can be
 * scored/ledgered with NO hostile/beneficial/summon population at all
 * (e.g. a pure ledger "no-comparable-profile" miss with no population
 * context to report). */
export const AssayPopulationSchema = z.enum(["hostile", "beneficial", "summon"]).nullable();
export type AssayPopulation = z.infer<typeof AssayPopulationSchema>;

export const AssayComparableSchema = z
  .object({
    id: CodexId,
    name: z.string().min(1),
    rank: z.number(),
  })
  .strict();
export type AssayComparable = z.infer<typeof AssayComparableSchema>;

export const AssaySummonBandSchema = z
  .object({
    baseLevel: z.number(),
    curveLevel: z.number(),
    delta: z.number(),
  })
  .strict();
export type AssaySummonBand = z.infer<typeof AssaySummonBandSchema>;

/** The fields shared by a top-level entry and each of its `variants[]`
 * members — factored out so the two schemas below can't drift apart on a
 * field neither the entry nor its own doc comment forgot to update. */
const ASSAY_ENTRY_SHARED_FIELDS = {
  kind: AssayKindSchema,
  rank: z.number(),
  population: AssayPopulationSchema,
  verdict: z.string().optional(),
  residualRanks: z.number().optional(),
  ev: z.number().optional(),
  budget: z.number().optional(),
  rankRange: z.tuple([z.number(), z.number()]).optional(),
  comparables: z.array(AssayComparableSchema).optional(),
  summonBand: AssaySummonBandSchema.optional(),
  // D30-38: "typed enum, NOT prose" — Track A's own reason-code enumeration
  // isn't part of this cross-track contract (this app never reads Track A's
  // in-progress source), so this stays a plain non-empty string; codex's OWN
  // curated copy map (`assayBlock.tsx`, the P13 `formatFacetValue` lesson)
  // is what turns a known code into a sentence, with a generic honest
  // fallback for anything not in that map — including a code this schema
  // has genuinely never seen before.
  reasonCode: z.string().min(1).optional(),
} as const;

export const AssayVariantSchema = z
  .object({
    label: z.string().min(1),
    ...ASSAY_ENTRY_SHARED_FIELDS,
  })
  .strict();
export type AssayVariant = z.infer<typeof AssayVariantSchema>;

export const AssayEntrySchema = z
  .object({
    ...ASSAY_ENTRY_SHARED_FIELDS,
    variants: z.array(AssayVariantSchema).optional(),
  })
  .strict();
export type AssayEntry = z.infer<typeof AssayEntrySchema>;

/**
 * The whole `spell-power.json` artifact. `entries` keyed by codex id
 * (`spell/<slug>`, D30-38) — plain `z.string()` keys (not re-validated
 * against `CodexId`'s regex): a malformed KEY is not this app's problem to
 * diagnose, and Zod's `z.record` key-schema validation would reject the
 * WHOLE file over one bad key rather than just that entry, which is a
 * harsher failure mode than D30-39's fail-soft loader wants (a single
 * malformed record shouldn't cost every other spell its Assay block —
 * see `assayFs.ts`'s own doc comment: unparseable is an ALL-OR-NOTHING
 * fallback at the FILE level today, not a per-entry one, so keeping this
 * permissive at least means a stray extra/oddly-shaped key can't be the
 * thing that tips a otherwise-valid file into "unparseable").
 */
export const AssayExportFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.record(z.string(), AssayEntrySchema),
  })
  .strict();
export type AssayExportFile = z.infer<typeof AssayExportFileSchema>;

export function parseAssayExportFile(data: unknown): AssayExportFile {
  return AssayExportFileSchema.parse(data);
}
