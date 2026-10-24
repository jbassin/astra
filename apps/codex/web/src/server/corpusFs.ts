// D29-23 — which corpus this server process reads, and whether it may serve it. The
// reader itself (`createCorpusReader`, traversal-guarded `node:fs` reads) lives in
// `@astra/codex-corpus/reader`. Imported ONLY from `corpusFns.ts` (server fns) and the
// server entry — NEVER from a route/component file, so `node:fs` (and the corpus's
// ~625 MB of JSON) never reaches the client bundle.
//
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
import { dirname, join, resolve } from "node:path";

import { CORPUS_SCHEMA_VERSION } from "@astra/codex-corpus";
import { createCorpusReader, type CorpusReader } from "@astra/codex-corpus/reader";
import { loadConfig } from "@astra/config";

/** Walk up from `startDir` until a `fixtures/picks/` marker (committed; the generated
 * `fixtures/entities/` may not exist yet) is found (the `@astra/config` `findRepoRoot` idiom). `import.meta.dirname`-based
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
    if (existsSync(join(dir, "fixtures", "picks"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir); // marker never found — give up gracefully
    dir = parent;
  }
}

/** `apps/codex/web/fixtures/entities/` — the D29-11 fixture corpus that the tests, the
 * Chromium guards and a dev server without the real corpus read. It is generated and
 * gitignored (`scripts/fixtureCorpus.ts`; `pnpm --filter @astra/codex fixture`). A FUNCTION,
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
  /** The fixture corpus: its manifest pins `foundry.tag` to `"fixture"`. */
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
    if (!existsSync(manifestFile(fixtureRoot))) {
      throw new CorpusUnservableError(
        `[codex] dev: no corpus at "${configRoot}" (config.kdl's codex.data-path) and no ` +
          `generated fixture at "${fixtureRoot}". Run \`pnpm --filter @astra/codex fixture\` ` +
          "for the fixture, or `just codex-refresh` for the real corpus.",
      );
    }
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
