// D29-23 — the corpus read layer's `node:fs` half. Imported ONLY from
// `corpusFns.ts` (server fns) — NEVER from a route/component file, so `node:fs`
// (and the corpus's ~625 MB of JSON) never reaches the client bundle. Mirrors the
// heartwood-frontend `src/domain/review/fs.ts` precedent: a plain-function seam
// over `node:fs`, traversal-guarded to its root.
//
// `createCorpusReader(rootDir)` is a pure factory — directly unit-testable against
// `fixtures/entities/` with no config/module-state involved (D29-23's own text).
// The module-scope singleton below is what `corpusFns.ts` actually uses at
// runtime. Its root is picked once per process by `servedCorpus()` (not in the root
// `server.ts`, which has no channel into the built loader closure): `CODEX_CORPUS_ROOT`
// when set (tests and the Chromium guards pin the fixture there), else
// `<codex.data-path>/corpus`. A built server fails closed: a missing corpus, a
// schemaVersion other than `CORPUS_SCHEMA_VERSION`, or the fixture at the config path
// throws `CorpusUnservableError`, and the server entry (`src/server.ts`) checks this
// when the bundle loads, so the process exits instead of serving. Only the Vite dev
// server falls back to the fixture when the config corpus is missing.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { loadConfig } from "@astra/config";

import { CORPUS_SCHEMA_VERSION } from "../schema/corpusVersion";
import type { CodexEntity, IndexRow } from "../schema/entity";
import { parseRulesTreeFile, type RulesTreeFile } from "../schema/rulesTree";
import { parseSourcesIndexFile, type SourcesIndexFile } from "../schema/sourcesIndex";

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

/** Walk up from `startDir` until a `fixtures/entities/manifest.json` marker is
 * found (the `@astra/config` `findRepoRoot` idiom). `import.meta.dirname`-based
 * relative paths (`"../../fixtures/entities"`) are a real footgun here: THIS
 * module's physical location differs between dev (`src/server/corpusFs.ts`) and
 * a `vite build` (bundled somewhere under `dist/server/assets/`), so a fixed
 * relative offset resolves to a different, WRONG directory once built (verified
 * — the built server's fallback silently pointed at a nonexistent
 * `dist/fixtures/entities` and every corpus read then threw an uncaught ENOENT
 * instead of a clean 404). Walking up to a stable marker is robust either way. */
function findAppRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "fixtures", "entities", "manifest.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir); // marker never found — give up gracefully
    dir = parent;
  }
}

/** `apps/codex/web/fixtures/entities/` — the D29-11 committed fixture corpus that the
 * tests, the Chromium guards and a dev server without the real corpus read. A FUNCTION,
 * not a top-level `const` (the exact same client-bundle-leak class this file's other
 * lazy-singleton comment calls out): a top-level statement that CALLS
 * `findAppRoot`/touches `node:fs` at module-evaluation time runs the instant
 * this module is merely imported/bundled, real corpus or not, client bundle or
 * not — verified by hand (a `const` here reintroduced the exact leak the
 * `getCorpusReader` laziness fix below was written to prevent). The production image
 * does not ship the fixture, so there this path does not exist. */
export function fixtureCorpusRoot(): string {
  return join(findAppRoot(import.meta.dirname), "fixtures", "entities");
}

/** Thrown when the corpus a server would read is missing, was built for another schema
 * generation, or is the fixture outside dev. The server refuses to start or to serve
 * rather than answer 200 from the wrong data. */
export class CorpusUnservableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusUnservableError";
  }
}

/** The inputs that pick the corpus root, passed in so the rules are testable. */
export interface CorpusRootInputs {
  /** `CODEX_CORPUS_ROOT`, if set: an explicit root, used as given. The vitest setup and
   * the Chromium guards pin it to the fixture; it may name the fixture in any mode. */
  explicitRoot: string | undefined;
  /** `codex.data-path` from config.kdl; the corpus is `<dataPath>/corpus`. */
  dataPath: string;
  /** True only under the Vite dev server: a missing config corpus then falls back to
   * the fixture with a warning. A built server never falls back. */
  dev: boolean;
}

/** The corpus a server process reads, as checked at startup. */
export interface ServedCorpus {
  root: string;
  /** Where `root` came from: `CODEX_CORPUS_ROOT`, `codex.data-path`, or the dev-only
   * fixture fallback. */
  source: "env" | "config" | "dev-fixture-fallback";
  schemaVersion: number;
  totalEntityCount: number;
  /** The committed fixture corpus: its manifest pins `foundry.tag` to `"fixture"`. */
  fixture: boolean;
}

interface CorpusManifestHeader {
  schemaVersion?: unknown;
  totalEntityCount?: unknown;
  foundry?: { tag?: unknown };
}

function manifestFile(root: string): string {
  return join(root, "manifest.json");
}

/** Reads `<root>/manifest.json` and checks its schema generation. Throws
 * `CorpusUnservableError` when the manifest is absent or unreadable, or when its
 * `schemaVersion` is not this build's `CORPUS_SCHEMA_VERSION`. */
function inspectCorpus(root: string): Omit<ServedCorpus, "source"> {
  const path = manifestFile(root);
  let header: CorpusManifestHeader;
  try {
    header = JSON.parse(readFileSync(path, "utf8")) as CorpusManifestHeader;
  } catch (e) {
    throw new CorpusUnservableError(
      `[codex] no readable corpus manifest at "${path}": ${(e as Error).message}`,
    );
  }
  if (header.schemaVersion !== CORPUS_SCHEMA_VERSION) {
    throw new CorpusUnservableError(
      `[codex] the corpus at "${root}" has schemaVersion ${JSON.stringify(header.schemaVersion)}, ` +
        `but this build reads schemaVersion ${CORPUS_SCHEMA_VERSION}. Re-run the transform ` +
        "(`just codex-refresh`) or deploy the matching code.",
    );
  }
  return {
    root,
    schemaVersion: CORPUS_SCHEMA_VERSION,
    totalEntityCount: typeof header.totalEntityCount === "number" ? header.totalEntityCount : 0,
    fixture: header.foundry?.tag === "fixture",
  };
}

/** Picks the corpus root and checks it. An explicit root is used as given. Otherwise the
 * root is `<dataPath>/corpus`; a missing one is fatal outside dev, and in dev falls back
 * to the fixture with a warning. Outside dev, a config root that holds the fixture is
 * fatal too. Every root must match `CORPUS_SCHEMA_VERSION`. */
export function selectServedCorpus(inputs: CorpusRootInputs): ServedCorpus {
  if (inputs.explicitRoot) {
    return { ...inspectCorpus(inputs.explicitRoot), source: "env" };
  }
  const configRoot = join(inputs.dataPath, "corpus");
  if (!existsSync(manifestFile(configRoot))) {
    if (!inputs.dev) {
      throw new CorpusUnservableError(
        `[codex] no corpus at "${configRoot}" (config.kdl's codex.data-path). A built server ` +
          "never serves the fixture: mount the real corpus, or run `just codex-refresh`.",
      );
    }
    const fixtureRoot = fixtureCorpusRoot();
    // oxlint-disable-next-line no-console -- dev-server warning to stdout; codex has no OTel logger yet
    console.warn(
      `[codex] dev: no corpus at "${configRoot}" (config.kdl's codex.data-path), so this dev ` +
        `server reads the fixture corpus at "${fixtureRoot}". Run \`just codex-refresh\` for ` +
        "the real corpus.",
    );
    return { ...inspectCorpus(fixtureRoot), source: "dev-fixture-fallback" };
  }
  const corpus = inspectCorpus(configRoot);
  if (corpus.fixture && !inputs.dev) {
    throw new CorpusUnservableError(
      `[codex] the corpus at "${configRoot}" is the fixture corpus (foundry.tag "fixture"). ` +
        "A built server serves only the real corpus.",
    );
  }
  return { ...corpus, source: "config" };
}

/** Whether this code runs under the Vite dev server. Vite replaces `import.meta.env` in a
 * build, so a built bundle is never dev; plain Node has no `import.meta.env` at all. */
function isViteDev(): boolean {
  return import.meta.env?.DEV === true;
}

/** This process's corpus, picked and checked once from `CODEX_CORPUS_ROOT`,
 * `codex.data-path` and the dev flag, then cached. Throws `CorpusUnservableError` (and
 * caches nothing) when the corpus can't be served. The server entry (`src/server.ts`)
 * calls it when the bundle loads, so a bad corpus stops the process before it listens;
 * `getCorpusReader()` reads the same cached value. */
let cachedServed: ServedCorpus | undefined;
export function servedCorpus(): ServedCorpus {
  cachedServed ??= selectServedCorpus({
    explicitRoot: process.env.CODEX_CORPUS_ROOT || undefined,
    dataPath: loadConfig().codex.dataPath,
    dev: isViteDev(),
  });
  return cachedServed;
}

/** The lazily-constructed singleton `corpusFns.ts` reads from — resolved once
 * per process on FIRST USE, not at module-import time (the client-bundle leak
 * guard, D29-23: this file must never run a side-effecting call just by being
 * imported/bundled — only when a server fn actually invokes `getCorpusReader()`
 * at request time). Cached forever after that (the corpus is immutable per
 * process), so every request in the SSR server shares the same
 * category/index caches. */
let cachedReader: CorpusReader | undefined;
export function getCorpusReader(): CorpusReader {
  cachedReader ??= createCorpusReader(servedCorpus().root);
  return cachedReader;
}
