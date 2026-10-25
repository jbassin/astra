import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  CORPUS_SCHEMA_VERSION,
  CodexEntitySchema,
  IndexRowSchema,
  toIndexRow,
  type CodexEntity,
  facetKeysFor,
} from "@astra/codex-corpus";

/**
 * The deterministic corpus writer. Takes the join's final `CodexEntity[]` and
 * writes a corpus root (on the host, a release staging dir's `corpus/`):
 *
 *   - `corpus/<category>/<slug>.json` — one file per entity (the web app's
 *     lazy-load unit); the file's slug segment is read off the entity's OWN
 *     `id` (its `{category}/{slug}` form, WITH any `@legacy`/`-2` collision
 *     suffix the identity resolution applied), never off the bare `slug` field
 *     (which stays the pre-suffix extract-time value on a collision member —
 *     see `join.ts`'s `Draft` doc comment).
 *   - `corpus/<category>/_index.json` — slim `IndexRow[]` (via `toIndexRow`,
 *     entity.ts) sorted by id. Leading-underscore basename:
 *     `sluggify()` can never emit a leading underscore, so this name can never
 *     collide with a real entity slug (a plain `index.json` would clobber the
 *     two real `index`-slug entities, `ancestry/index` and `archetype/index`).
 *   - `corpus/manifest.json` — schemaVersion + the source pins (copied
 *     verbatim from the committed `corpus-manifest.json`, never regenerated
 *     here) + FINAL per-category entity counts + total size. Deliberately
 *     carries NO wall-clock timestamp of its own (`fetchedAt` is the pins'
 *     own, already-on-disk value) — the determinism check (two full runs over
 *     the same snapshots byte-identical) would break if this module stamped
 *     "now".
 *
 * ## Determinism (two runs over the same snapshots are byte-identical)
 *
 * Every JSON file here goes through `canonicalJson` — a serializer that sorts
 * object keys recursively (codepoint order, matching `manifest.ts`'s own
 * `serializeManifest` convention) before `JSON.stringify`, so key-insertion-
 * order accidents (map iteration, object literal construction) can never
 * change the bytes on disk. Entities are also grouped/sorted by category then
 * id before writing (not just relying on the caller's array order), and the
 * corpus dir is WIPED (`rmSync` + `mkdirSync`) before every write pass so a
 * stale file from an entity/category that no longer exists this run can never
 * survive alongside the new tree.
 *
 * ## Validation (100% Zod-valid)
 *
 * `CodexEntitySchema.parse` runs on every entity right before it's written —
 * this is the FIRST point in the whole pipeline a full `CodexEntity` is
 * actually zod-validated at runtime (the upstream passes only construct
 * TS-typed object literals, checked at compile time, not runtime) — so a
 * schema violation hard-fails the emit pass here, per the drift-tripwire
 * posture the rest of the pipeline already uses for unknown enricher/markup
 * forms.
 */

// ---------------------------------------------------------------------------
// canonical (key-sorted, LF, trailing-newline) JSON serialization
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, sortKeysDeep(v)] as const)
      // Codepoint comparison (not localeCompare) — locale-independent byte
      // determinism, same convention as `schema/manifest.ts`'s own sort.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  }
  return value;
}

/** Sorted-keys, 2-space-indented, trailing-LF JSON — the one serializer every
 * corpus file goes through, so "sorted object keys at every level" is
 * a property of the writer, not something each caller has to remember. */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

/** Writes `value` through `canonicalJson`, returning the byte length written
 * (for `emit.ts`'s own size-total bookkeeping and reused by `transform.ts` for
 * `report.json`, which is written the same deterministic way — see
 * `report.ts`'s "same division of labor as emit.ts" note). */
export function writeCanonicalJson(path: string, value: unknown): number {
  const content = canonicalJson(value);
  writeFileSync(path, content);
  return Buffer.byteLength(content);
}

/** Sorted-keys, NO-indentation, trailing-LF JSON — `_index.json`'s own
 * serializer (~31% smaller than pretty-printed `canonicalJson`, measured).
 * Determinism (sorted keys) is preserved identically to `canonicalJson`; only
 * the whitespace differs. Entity files stay on `canonicalJson` — this is
 * `_index.json`-only, no 46k-file churn. */
export function canonicalJsonCompact(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value))}\n`;
}

/** Writes `value` through `canonicalJsonCompact` — same byte-length-return
 * contract as `writeCanonicalJson`. */
export function writeCanonicalJsonCompact(path: string, value: unknown): number {
  const content = canonicalJsonCompact(value);
  writeFileSync(path, content);
  return Buffer.byteLength(content);
}

/** Writes plain text, guaranteeing exactly one trailing LF (the "LF, trailing
 * newline" rule applies to `report.md` too, which isn't JSON). */
export function writeCanonicalText(path: string, content: string): number {
  const withNewline = content.endsWith("\n") ? content : `${content}\n`;
  writeFileSync(path, withNewline);
  return Buffer.byteLength(withNewline);
}

// ---------------------------------------------------------------------------
// entity id -> file slug
// ---------------------------------------------------------------------------

/** The file-name segment for `corpus/<category>/<slugPart>.json` — everything
 * in `entity.id` after its own `category/` prefix, INCLUDING a collision
 * suffix (`@legacy`, `-2`, ...) when present. Every entity's `id` is set by
 * `join.ts` as `${category}/${something}` (verified: `buildAonOnlyEntity`,
 * `mergeJoined`'s pass-through of the Foundry id, and pass-3/4's
 * `finalId`/`preId` construction all build ids this exact way) — a mismatch
 * here is a structural bug upstream, not corpus drift, so it throws rather
 * than silently falling back to `entity.slug` (which is the PRE-suffix value
 * for a collision member, `join.ts`'s `Draft` doc comment). */
function entityFileSlug(entity: Pick<CodexEntity, "id" | "category">): string {
  const prefix = `${entity.category}/`;
  if (!entity.id.startsWith(prefix)) {
    throw new Error(
      `emit: entity id "${entity.id}" does not start with its own category "${prefix}"`,
    );
  }
  return entity.id.slice(prefix.length);
}

// ---------------------------------------------------------------------------
// corpus/manifest.json (the in-corpus summary — distinct from the
// committed root `corpus-manifest.json`, the fetch-pin file)
// ---------------------------------------------------------------------------

interface SnapshotPin {
  readonly [key: string]: unknown;
}

interface CorpusOutputManifest {
  schemaVersion: number;
  foundry: SnapshotPin;
  aon: SnapshotPin;
  categoryCounts: Record<string, number>;
  totalEntityCount: number;
  totalSizeBytes: number;
}

// ---------------------------------------------------------------------------
// the writer
// ---------------------------------------------------------------------------

// `CORPUS_SCHEMA_VERSION` lives in `src/schema/corpusVersion.ts`, so the server can check it
// without importing the ingest code; re-exported for the ingest scripts.
export { CORPUS_SCHEMA_VERSION };

interface EmitCorpusInput {
  /** The corpus root (a release staging dir's `corpus/`) — wiped and rewritten wholesale
   * on every call. */
  corpusRoot: string;
  entities: readonly CodexEntity[];
  /** The source pins, read verbatim from the committed `corpus-manifest.json`
   * (never regenerated here — this module only ever COPIES them into
   * `corpus/manifest.json` for a single-file summary alongside the corpus). */
  pins: { foundry: SnapshotPin; aon: SnapshotPin };
}

export interface EmitCorpusResult {
  entityFileCount: number;
  /** Total bytes written across every file under `corpusRoot` (entity files +
   * `_index.json`s + `corpus/manifest.json`) — `report.json`/`report.md`
   * aren't included (chicken-and-egg: the report is written by the caller
   * AFTER this returns, using this very number). */
  corpusBytes: number;
  categoryCounts: Record<string, number>;
}

/**
 * Wipes `corpusRoot` and writes the full deterministic corpus tree: per-entity
 * files, per-category `_index.json`, and `corpus/manifest.json`. Every entity
 * is zod-validated (`CodexEntitySchema.parse`) right before its file is
 * written — "100% Zod-valid" is enforced HERE, not assumed.
 */
export function emitCorpus(input: EmitCorpusInput): EmitCorpusResult {
  const { corpusRoot, entities, pins } = input;

  rmSync(corpusRoot, { recursive: true, force: true });
  mkdirSync(corpusRoot, { recursive: true });

  const byCategory = new Map<string, CodexEntity[]>();
  for (const entity of entities) {
    const arr = byCategory.get(entity.category) ?? [];
    arr.push(entity);
    byCategory.set(entity.category, arr);
  }

  let corpusBytes = 0;
  let entityFileCount = 0;
  const categoryCounts: Record<string, number> = {};

  const sortedCategories = [...byCategory.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const category of sortedCategories) {
    const list = byCategory.get(category);
    if (!list) continue; // unreachable — category came from this same map's own keys
    const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    categoryCounts[category] = sorted.length;

    const categoryDir = join(corpusRoot, category);
    mkdirSync(categoryDir, { recursive: true });

    const indexRows = [];
    for (const entity of sorted) {
      let validated: CodexEntity;
      try {
        validated = CodexEntitySchema.parse(entity); // hard-fail on any schema violation
      } catch (e) {
        throw new Error(
          `emit: entity "${entity.id}" failed CodexEntitySchema validation: ${String(e)}`,
          {
            cause: e,
          },
        );
      }
      const slugPart = entityFileSlug(validated);
      corpusBytes += writeCanonicalJson(join(categoryDir, `${slugPart}.json`), validated);
      entityFileCount += 1;
      indexRows.push(IndexRowSchema.parse(toIndexRow(validated, facetKeysFor(category))));
    }
    corpusBytes += writeCanonicalJsonCompact(join(categoryDir, "_index.json"), indexRows);
  }

  const manifest: CorpusOutputManifest = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    foundry: pins.foundry,
    aon: pins.aon,
    categoryCounts: Object.fromEntries(
      Object.entries(categoryCounts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    totalEntityCount: entities.length,
    // Entity + index-file bytes only (deliberately NOT including
    // corpus/manifest.json's own size, which would otherwise be
    // self-referential — write-then-measure-then-rewrite to get an exact
    // self-inclusive count isn't worth the complexity for a size total that's
    // already an approximation by nature).
    totalSizeBytes: corpusBytes,
  };
  corpusBytes += writeCanonicalJson(join(corpusRoot, "manifest.json"), manifest);

  return { entityFileCount, corpusBytes, categoryCounts };
}
