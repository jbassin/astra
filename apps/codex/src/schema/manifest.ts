import { z } from "zod";

/**
 * Corpus pin manifest (D29-4, spec §2/§3): the single source of truth for which
 * upstream snapshot versions the ingest pipeline is pinned to, plus the doc counts and
 * content hashes that prove a snapshot on disk matches what was last fetched.
 * Committed at `apps/codex/corpus-manifest.json` — unlike the gitignored
 * `apps/codex/data/` it describes — so a refresh (`just codex-refresh`) is a
 * reviewable diff, never an implicit side effect of a build.
 *
 * `sha256` is an AGGREGATE hash over every file in the corresponding snapshot
 * directory, not a hash of a single archive: for each file, `sha256(file bytes)`; join
 * `<relPath>:<fileSha256>` lines (POSIX-normalized relative paths, sorted
 * lexicographically so filesystem write/readdir order never matters); `sha256` the
 * joined blob. See `src/ingest/hash.ts` (`hashDirectory`/`hashFileEntries`) for the
 * implementation both fetchers share.
 */

const Sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "expected a lowercase hex sha256 digest")
  .nullable();

const FoundrySnapshot = z
  .object({
    tag: z.string().min(1),
    docCount: z.number().int().nonnegative(),
    sha256: Sha256Hex,
    fetchedAt: z.string().nullable(),
  })
  .strict();

const AonSnapshot = z
  .object({
    snapshotDate: z.string().nullable(),
    docCount: z.number().int().nonnegative(),
    // Per-category doc counts (D29-4) — the one open-ended map in the manifest shape,
    // hence the only field `serializeManifest` needs to key-sort for determinism.
    categoryCounts: z.record(z.string(), z.number().int().nonnegative()),
    sha256: Sha256Hex,
    fetchedAt: z.string().nullable(),
  })
  .strict();

export const CorpusManifestSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    foundry: FoundrySnapshot,
    aon: AonSnapshot,
  })
  .strict();

export type CorpusManifest = z.infer<typeof CorpusManifestSchema>;

/** Starting pin (D29-4): Foundry tag `pf2e-8.3.0`, no AoN snapshot yet. */
export const INITIAL_FOUNDRY_TAG = "pf2e-8.3.0";

export function emptyManifest(): CorpusManifest {
  return {
    schemaVersion: 1,
    foundry: { tag: INITIAL_FOUNDRY_TAG, docCount: 0, sha256: null, fetchedAt: null },
    aon: { snapshotDate: null, docCount: 0, categoryCounts: {}, sha256: null, fetchedAt: null },
  };
}

export function parseManifest(data: unknown): CorpusManifest {
  return CorpusManifestSchema.parse(data);
}

/**
 * Deterministic serializer (D29-3's determinism gate applied to the manifest itself):
 * fixed field order taken from the schema shape (not object insertion order) plus
 * `aon.categoryCounts` keys sorted lexicographically, 2-space indent, trailing LF. Equal
 * `CorpusManifest` values always produce byte-identical output.
 */
export function serializeManifest(manifest: CorpusManifest): string {
  const sortedCategoryCounts = Object.fromEntries(
    // Codepoint comparison, not localeCompare — locale-independent byte determinism.
    Object.entries(manifest.aon.categoryCounts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const ordered = {
    schemaVersion: manifest.schemaVersion,
    foundry: {
      tag: manifest.foundry.tag,
      docCount: manifest.foundry.docCount,
      sha256: manifest.foundry.sha256,
      fetchedAt: manifest.foundry.fetchedAt,
    },
    aon: {
      snapshotDate: manifest.aon.snapshotDate,
      docCount: manifest.aon.docCount,
      categoryCounts: sortedCategoryCounts,
      sha256: manifest.aon.sha256,
      fetchedAt: manifest.aon.fetchedAt,
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
