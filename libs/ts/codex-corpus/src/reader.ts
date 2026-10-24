// D29-23 — the corpus read layer's `node:fs` half: a plain-function seam over a corpus root
// on disk, traversal-guarded to that root. It lives on its own subpath
// (`@astra/codex-corpus/reader`) so `node:fs` never reaches a client bundle through the
// browser-safe root entry.
//
// `createCorpusReader(rootDir)` is a pure factory: no config or env reads, so it is
// directly unit-testable against any corpus root. Which root a server reads, and whether
// it may serve it, is the app's business (`apps/codex/web/src/server/corpusFs.ts`).

import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

import type { CodexEntity, IndexRow } from "./schema/entity";
import { parseRulesTreeFile, type RulesTreeFile } from "./schema/rulesTree";
import { parseSourcesIndexFile, type SourcesIndexFile } from "./schema/sourcesIndex";

/** Thrown for both a genuinely-unknown category/slug AND a rejected (malformed /
 * traversal-attempting) one — the traversal guard IS the auth story for the
 * HTTP-reachable serverFn endpoints (D29-23), and from the caller's point of view
 * both cases are the same "this isn't a real page" 404. */
export class CorpusNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusNotFoundError";
  }
}

interface CorpusManifestShape {
  categoryCounts: Record<string, number>;
}

export interface CorpusReader {
  /** Every category directory name, from `manifest.json`'s `categoryCounts` —
   * cached forever (the corpus is immutable per process). */
  categories(): readonly string[];
  /** S3 (D29-27 root category directory) — the same `manifest.json`
   * `categoryCounts` map `categories()` derives its key list from, but with the
   * counts kept: `{category: entityCount}`. Cached alongside `categoriesCache`
   * (one manifest read, not two). */
  categoryCounts(): Readonly<Record<string, number>>;
  /** A category's slim `_index.json` rows — cached forever per category. */
  index(category: string): readonly IndexRow[];
  /** One entity, read + `JSON.parse` fresh per call — no cache, and NO
   * per-request Zod (D29-23's own words: the corpus is emit-validated at P1
   * acceptance C, so runtime re-validation is repeated work for no safety gain —
   * an entity page's embed prefetch would otherwise Zod-parse ~46 files per
   * request on a big class page). Type-level trust via a cast; runtime guarding
   * is the traversal checks plus unreadable-JSON → `CorpusNotFoundError`. Throws
   * `CorpusNotFoundError` for an unknown category, a malformed/
   * traversal-attempting slug, a missing file, or a file that isn't JSON. */
  entity(category: string, slug: string): CodexEntity;
  /** P4 (D29-39/40) — `rules-tree.json`, a SIBLING of `manifest.json` (not
   * per-category, unlike `index()`). Cached forever after first read, AND
   * Zod-validated at that first read — unlike `entity()`'s explicit
   * "no per-request Zod" (a per-request cost argument that doesn't apply
   * here: this is ONE small artifact parsed ONCE per process, not N reads
   * per request, so validating it catches a genuinely stale/malformed
   * artifact before it reaches tree-walk code instead of a 500 deep inside
   * `treeModel.ts`). Throws `CorpusNotFoundError` for a missing/unreadable/
   * schema-invalid file. */
  rulesTree(): RulesTreeFile;
  /** P4 S4 (D29-43) — `sources-index.json`, a SIBLING of `manifest.json` (the
   * exact same "one small artifact, cached + Zod-validated once per process"
   * posture as `rulesTree()` above — see that method's own doc comment for
   * why per-request Zod is skipped for `entity()` but not here). Throws
   * `CorpusNotFoundError` for a missing/unreadable/schema-invalid file. */
  sourcesIndex(): SourcesIndexFile;
}

/** Resolve `name` under `root`, refusing anything that would escape it (the
 * heartwood/strider `within()` pattern) — belt-and-suspenders alongside the
 * explicit slug-shape checks below, in case a future caller ever forgets one. */
function within(root: string, name: string): string {
  const target = resolve(root, name);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new CorpusNotFoundError(`path escapes its root: ${name}`);
  }
  return target;
}

/** D29-23's traversal guard on a slug: no path separators, no `..`, no leading
 * underscore (reserved for `_index.json` — a real `sluggify()` output can never
 * start with `_`, D29-21). Applied before the slug ever reaches a filesystem
 * path. */
function assertValidSlug(slug: string): void {
  if (
    slug.length === 0 ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("..") ||
    slug.startsWith("_")
  ) {
    throw new CorpusNotFoundError(`invalid entity slug: ${JSON.stringify(slug)}`);
  }
}

/**
 * The D29-23 factory. Pure over `rootDir` — no config/env reads inside, so it's
 * directly unit-testable against `fixtures/entities/` (or any other real corpus
 * root) with zero mocking.
 */
export function createCorpusReader(rootDir: string): CorpusReader {
  let categoriesCache: readonly string[] | undefined;
  let categoryCountsCache: Readonly<Record<string, number>> | undefined;
  const indexCache = new Map<string, readonly IndexRow[]>();
  let rulesTreeCache: RulesTreeFile | undefined;
  let sourcesIndexCache: SourcesIndexFile | undefined;

  function readManifest(): CorpusManifestShape {
    const manifestPath = within(rootDir, "manifest.json");
    return JSON.parse(readFileSync(manifestPath, "utf8")) as CorpusManifestShape;
  }

  function categories(): readonly string[] {
    if (categoriesCache) return categoriesCache;
    categoriesCache = Object.keys(readManifest().categoryCounts).sort();
    return categoriesCache;
  }

  function categoryCounts(): Readonly<Record<string, number>> {
    categoryCountsCache ??= readManifest().categoryCounts;
    return categoryCountsCache;
  }

  function assertKnownCategory(category: string): string {
    if (!categories().includes(category)) {
      throw new CorpusNotFoundError(`unknown category: ${JSON.stringify(category)}`);
    }
    // `within()` too, even though a categories()-member can't structurally carry a
    // traversal segment — defense in depth, D29-23's own "resolved path must stay
    // within root" wording applies to every read, not just the slug.
    return within(rootDir, category);
  }

  return {
    categories,
    categoryCounts,

    index(category: string): readonly IndexRow[] {
      const cached = indexCache.get(category);
      if (cached) return cached;
      const categoryDir = assertKnownCategory(category);
      const indexPath = within(categoryDir, "_index.json");
      let rows: IndexRow[];
      try {
        // No per-row Zod (D29-23) — `_index.json` is emit-validated alongside the
        // entities it summarizes; a cast suffices (see `entity()`'s doc comment).
        rows = JSON.parse(readFileSync(indexPath, "utf8")) as IndexRow[];
      } catch (err) {
        throw new CorpusNotFoundError(
          `unreadable index for category "${category}": ${String(err)}`,
        );
      }
      indexCache.set(category, rows);
      return rows;
    },

    entity(category: string, slug: string): CodexEntity {
      assertValidSlug(slug);
      const categoryDir = assertKnownCategory(category);
      const entityPath = within(categoryDir, `${slug}.json`);
      if (!existsSync(entityPath)) {
        throw new CorpusNotFoundError(`no entity at ${category}/${slug}`);
      }
      try {
        return JSON.parse(readFileSync(entityPath, "utf8")) as CodexEntity;
      } catch (err) {
        // A corrupt/unreadable entity file 404s instead of 500ing — the corpus
        // is emit-validated, so this only fires on disk-level damage.
        throw new CorpusNotFoundError(`unreadable entity ${category}/${slug}: ${String(err)}`);
      }
    },

    rulesTree(): RulesTreeFile {
      if (rulesTreeCache) return rulesTreeCache;
      const treePath = within(rootDir, "rules-tree.json");
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(treePath, "utf8"));
      } catch (err) {
        throw new CorpusNotFoundError(`unreadable rules-tree.json: ${String(err)}`);
      }
      try {
        rulesTreeCache = parseRulesTreeFile(raw);
      } catch (err) {
        throw new CorpusNotFoundError(`malformed rules-tree.json: ${String(err)}`);
      }
      return rulesTreeCache;
    },

    sourcesIndex(): SourcesIndexFile {
      if (sourcesIndexCache) return sourcesIndexCache;
      const path = within(rootDir, "sources-index.json");
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path, "utf8"));
      } catch (err) {
        throw new CorpusNotFoundError(`unreadable sources-index.json: ${String(err)}`);
      }
      try {
        sourcesIndexCache = parseSourcesIndexFile(raw);
      } catch (err) {
        throw new CorpusNotFoundError(`malformed sources-index.json: ${String(err)}`);
      }
      return sourcesIndexCache;
    },
  };
}
