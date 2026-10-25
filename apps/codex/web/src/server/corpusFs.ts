// Which corpus this server process reads, and whether it may serve it. The
// reader itself (`createCorpusReader`, traversal-guarded `node:fs` reads) lives in
// `@astra/codex-corpus/reader`. Imported ONLY from `corpusFns.ts` (server fns) and the
// server entry — NEVER from a route/component file, so `node:fs` (and the corpus's
// ~625 MB of JSON) never reaches the client bundle.
//
// The served corpus is picked by `selectServedCorpus()` (not in the root `server.ts`,
// which has no channel into the built loader closure): `CODEX_CORPUS_ROOT` when set
// (tests and the e2e suite pin the fixture there), else the immutable release
// that `<codex.data-path>/releases/current` names (`@astra/codex-corpus/releases`). A
// built server fails closed: no current release, a schemaVersion other than
// `CORPUS_SCHEMA_VERSION`, or the fixture in a release throws `CorpusUnservableError`,
// and the server entry
// (`src/server.ts`) checks this when the bundle loads, so the process exits instead of
// serving. Only the Vite dev server falls back to the fixture when there is no release.
//
// A running server follows `current`: each request reads the link, and a new release
// that passes the same checks gets a fresh reader (its caches belong to that release
// alone). `withPinnedCorpus` pins one request to one release.

import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createCorpusReader, type CorpusReader } from "@astra/codex-corpus/reader";
import {
  CURRENT_LINK,
  CorpusUnservableError,
  type InspectedCorpus,
  inspectCorpus,
  manifestFile,
  readCurrentReleaseId,
  releaseCorpusDir,
  releasesDirOf,
} from "@astra/codex-corpus/releases";
import { loadConfig } from "@astra/config";

export { CorpusUnservableError };

/** Walk up from `startDir` until the ingest package's committed `fixtures/picks/` marker
 * (the generated `fixtures/entities/` may not exist yet) is found beside this app, at
 * `<dir>/ingest/fixtures/picks` (the `@astra/config` `findRepoRoot` idiom). An
 * `import.meta.dirname`-relative path is a footgun here: this module's physical location
 * differs between dev (`src/server/corpusFs.ts`) and a `vite build` (bundled under
 * `dist/server/assets/`), so a fixed relative offset resolves to the wrong directory once
 * built. Walking up to a stable marker works either way. */
function findCodexDomainRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "ingest", "fixtures", "picks"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir); // marker never found — give up gracefully
    dir = parent;
  }
}

/** `apps/codex/ingest/fixtures/entities/`: the fixture corpus that the tests, the Chromium
 * guards and a dev server without the real corpus read. The ingest package generates it
 * (`@astra/codex-ingest/fixture`, `pnpm --filter @astra/codex-ingest cli fixture`); it is
 * gitignored. A function, not a top-level `const`: a top-level call into `node:fs` would
 * run the moment this module is imported or bundled, including into the client bundle.
 * The production image does not ship the fixture, so there this path does not exist. */
export function fixtureCorpusRoot(): string {
  return join(findCodexDomainRoot(import.meta.dirname), "ingest", "fixtures", "entities");
}

/** The inputs that pick the corpus root, passed in so the rules are testable. */
interface CorpusRootInputs {
  /** `CODEX_CORPUS_ROOT`, if set: an explicit root, used as given. The vitest setup and
   * the e2e suite pin it to the fixture; it may name the fixture in any mode. */
  explicitRoot: string | undefined;
  /** `codex.data-path` from config.kdl; the served corpus is the release that
   * `<dataPath>/releases/current` names. */
  dataPath: string;
  /** True only under the Vite dev server: a missing release then falls back to the
   * fixture with a warning. A built server never falls back. */
  dev: boolean;
}

/** The corpus a server process reads, as checked when it was selected. */
export interface ServedCorpus extends InspectedCorpus {
  /** Where `root` came from: `CODEX_CORPUS_ROOT`, the current release under
   * `codex.data-path`, or the dev-only fixture fallback. */
  source: "env" | "config" | "dev-fixture-fallback";
  /** The release id for `source: "config"`; null for an explicit root or the fixture. */
  releaseId: string | null;
}

/** Picks the corpus root and checks it. An explicit root is used as given. Otherwise the
 * root is the corpus of the release `<dataPath>/releases/current` names; a missing
 * `current` is fatal outside dev, and in dev falls back to the fixture with a warning.
 * Outside dev, a release that holds the fixture is fatal too. Every root must match
 * `CORPUS_SCHEMA_VERSION`. */
export function selectServedCorpus(inputs: CorpusRootInputs): ServedCorpus {
  if (inputs.explicitRoot) {
    return { ...inspectCorpus(inputs.explicitRoot), source: "env", releaseId: null };
  }
  const releasesDir = releasesDirOf(inputs.dataPath);
  let releaseId: string | null;
  try {
    releaseId = readCurrentReleaseId(releasesDir);
  } catch (e) {
    throw new CorpusUnservableError((e as Error).message);
  }
  if (releaseId === null) {
    const where = join(releasesDir, CURRENT_LINK);
    if (!inputs.dev) {
      throw new CorpusUnservableError(
        `[codex] no current release at "${where}" (under config.kdl's codex.data-path). A ` +
          "built server never serves the fixture: mount the releases directory, or build a " +
          "release (`just codex-build`).",
      );
    }
    const fixtureRoot = fixtureCorpusRoot();
    if (!existsSync(manifestFile(fixtureRoot))) {
      throw new CorpusUnservableError(
        `[codex] dev: no current release at "${where}" and no generated fixture at ` +
          `"${fixtureRoot}". Run \`pnpm --filter @astra/codex-ingest cli fixture\` for the fixture, or ` +
          "`just codex-build` for the real corpus.",
      );
    }
    // oxlint-disable-next-line no-console -- dev-server warning to stdout; codex has no OTel logger yet
    console.warn(
      `[codex] dev: no current release at "${where}", so this dev server reads the fixture ` +
        `corpus at "${fixtureRoot}". Run \`just codex-build\` for the real corpus.`,
    );
    return { ...inspectCorpus(fixtureRoot), source: "dev-fixture-fallback", releaseId: null };
  }
  const corpus = inspectCorpus(releaseCorpusDir(releasesDir, releaseId));
  if (corpus.fixture && !inputs.dev) {
    throw new CorpusUnservableError(
      `[codex] release ${releaseId} at "${corpus.root}" is the fixture corpus (foundry.tag ` +
        '"fixture"). A built server serves only the real corpus.',
    );
  }
  return { ...corpus, source: "config", releaseId };
}

/** One phrase naming what a server serves, for its log lines. */
export function describeServedCorpus(corpus: ServedCorpus): string {
  const release = corpus.releaseId === null ? "" : `release ${corpus.releaseId}, `;
  return (
    `the corpus at "${corpus.root}" (${release}source ${corpus.source}, ` +
    `${corpus.totalEntityCount} entities, schemaVersion ${corpus.schemaVersion}` +
    `${corpus.fixture ? ", fixture" : ""})`
  );
}

/** Whether this code runs under the Vite dev server. Vite replaces `import.meta.env` in a
 * build, so a built bundle is never dev; plain Node has no `import.meta.env` at all. */
function isViteDev(): boolean {
  return import.meta.env?.DEV === true;
}

/** The corpus this process serves and the reader over it. A reader's caches (categories,
 * per-category `_index.json` rows, the rules tree, the sources index) belong to one
 * release, so a switch builds a new reader and never mixes two releases' data. */
interface ActiveCorpus {
  served: ServedCorpus;
  reader: CorpusReader;
}

/** A process's view of the served corpus: the active release and a per-request pin. */
interface CorpusSource {
  /** The active corpus as of now (switching first if `current` moved). */
  served(): ServedCorpus;
  /** The reader for the pinned request, else for the active corpus. */
  reader(): CorpusReader;
  /** Runs `fn` (one request) with every `reader()` call inside it pinned to the release
   * that is active now, so an SSR render that spans a switch reads one release. */
  withPinned<T>(fn: () => T): T;
}

/** How long a release that failed with a transient error waits before a retry. */
const TRANSIENT_RETRY_MS = 30_000;

/** A corpus source over `inputs`, read on each check. The active corpus switches when
 * `current` names a new release; the check is one `readlink` per call. A new release
 * passes the same checks as at startup before it is served; when it fails them (or
 * `current` is unreadable) the source logs the reason and keeps serving the release it
 * has. A `CorpusUnservableError` refuses that release for good (releases never change);
 * any other error (EMFILE, EIO) is retried after `retryMs`. The first call throws (and
 * caches nothing) when no corpus can be served. An explicit root or the dev fixture never
 * switches. */
export function createCorpusSource(
  inputs: () => CorpusRootInputs,
  { clock = Date.now, retryMs = TRANSIENT_RETRY_MS } = {},
): CorpusSource {
  let active: ActiveCorpus | undefined;
  // Releases this source refused as unservable: neither checked nor logged again.
  const refused = new Set<string>();
  // Releases that failed transiently, with the time they may be tried again.
  const retryAt = new Map<string, number>();
  // Whether the last check found `current` unreadable (logged once until it reads again).
  let linkUnreadable = false;
  const pinned = new AsyncLocalStorage<ActiveCorpus>();

  function logRefusal(what: string, reason: string): void {
    // oxlint-disable-next-line no-console -- a refused release switch; codex has no OTel logger yet
    console.error(
      `[codex] not switching to ${what}: ${reason} Still serving release ` +
        `${active?.served.releaseId}.`,
    );
  }

  function current(): ActiveCorpus {
    if (!active) {
      const served = selectServedCorpus(inputs());
      active = { served, reader: createCorpusReader(served.root) };
      return active;
    }
    if (active.served.source !== "config") return active;
    const now = inputs();
    let id: string | null;
    try {
      id = readCurrentReleaseId(releasesDirOf(now.dataPath));
    } catch (e) {
      if (!linkUnreadable) logRefusal("an unreadable current link", (e as Error).message);
      linkUnreadable = true;
      return active;
    }
    linkUnreadable = false;
    if (id === null || id === active.served.releaseId || refused.has(id)) return active;
    const retry = retryAt.get(id);
    if (retry !== undefined && clock() < retry) return active;
    try {
      const served = selectServedCorpus(now);
      const previous = active.served.releaseId;
      active = { served, reader: createCorpusReader(served.root) };
      retryAt.delete(id);
      // oxlint-disable-next-line no-console -- one line per release switch; codex has no OTel logger yet
      console.info(`[codex] switched from release ${previous} to ${describeServedCorpus(served)}`);
    } catch (e) {
      if (e instanceof CorpusUnservableError) {
        refused.add(id);
        retryAt.delete(id);
        logRefusal(`release ${id}`, e.message);
      } else {
        retryAt.set(id, clock() + retryMs);
        logRefusal(
          `release ${id} for now`,
          `${(e as Error).message} (retrying in ${Math.round(retryMs / 1000)} s).`,
        );
      }
    }
    return active;
  }

  return {
    served: () => current().served,
    reader: () => (pinned.getStore() ?? current()).reader,
    withPinned: (fn) => pinned.run(current(), fn),
  };
}

/** This process's source, created on first use: this module must run no side effects at
 * import (the client-bundle leak guard). Its inputs are `CODEX_CORPUS_ROOT`,
 * `codex.data-path` and the dev flag. */
let processSource: CorpusSource | undefined;
function source(): CorpusSource {
  processSource ??= createCorpusSource(() => ({
    explicitRoot: process.env.CODEX_CORPUS_ROOT || undefined,
    dataPath: loadConfig().codex.dataPath,
    dev: isViteDev(),
  }));
  return processSource;
}

/** This process's corpus as of now. The server entry (`src/server.ts`) calls it when the
 * bundle loads, so a bad corpus stops the process before it listens. */
export function servedCorpus(): ServedCorpus {
  return source().served();
}

/** Runs one request pinned to the release that is current when it starts. */
export function withPinnedCorpus<T>(fn: () => T): T {
  return source().withPinned(fn);
}

/** The reader `corpusFns.ts` reads from: the request's pinned release, else the active
 * one. Every request in the SSR server shares the active release's category and index
 * caches. */
export function getCorpusReader(): CorpusReader {
  return source().reader();
}
