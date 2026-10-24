// The read side of codex's immutable corpus releases. A refresh never edits served data:
// it writes a complete new release directory and then repoints one symlink.
//
//   <codex.data-path>/releases/
//     <id>/corpus/...           the corpus tree (manifest.json, <category>/, ...)
//     <id>/search/pagefind/...  the Pagefind index built from that corpus
//     <id>/release.json         id, createdAt, entity count, schema version, source pins
//     current -> <id>           relative symlink, swapped atomically by rename(2)
//     .staging-*/               a build in progress; never served
//
// `<id>` is a content hash of the release's corpus and search trees, so two identical
// builds share one release. Only `releases/` is mounted into the container; `current` is
// relative, so it resolves the same way inside and outside it. The writers live in the
// ingest package (`apps/codex/ingest/src/releaseStore.ts`); this module only reads, and is
// shared by the site's server (`corpusFs.ts`, `pagefindRoute.ts`) and the release builder.
// `inspectCorpus` is the one servability check both sides run: the server before it serves
// a corpus, the release builder before it publishes or rolls back to one.

import { readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

import { CORPUS_SCHEMA_VERSION } from "./schema/corpusVersion";

/** A release id: the first 16 hex digits of the release's content hash. */
export const RELEASE_ID_RE = /^[0-9a-f]{16}$/;

/** The name of the symlink that selects the served release. */
export const CURRENT_LINK = "current";

/** `<dataPath>/releases`, the directory the codex container mounts. */
export function releasesDirOf(dataPath: string): string {
  return join(dataPath, "releases");
}

export function releaseCorpusDir(releasesDir: string, id: string): string {
  return join(releasesDir, id, "corpus");
}

export function releaseSearchDir(releasesDir: string, id: string): string {
  return join(releasesDir, id, "search", "pagefind");
}

/** Thrown when `current` exists but does not name a release id. */
export class ReleaseLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseLayoutError";
  }
}

/** The release `current` names, or null when there is no `current` link yet. Reads the
 * link itself (one syscall), never the target, so callers can pin a reader to
 * `releases/<id>/` and keep reading it after `current` moves on. Throws
 * `ReleaseLayoutError` when `current` is not a symlink to a bare release id. */
export function readCurrentReleaseId(releasesDir: string): string | null {
  let target: string;
  try {
    target = readlinkSync(join(releasesDir, CURRENT_LINK));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ReleaseLayoutError(
      `[codex] "${join(releasesDir, CURRENT_LINK)}" is not a release symlink: ${(e as Error).message}`,
    );
  }
  if (!RELEASE_ID_RE.test(target)) {
    throw new ReleaseLayoutError(
      `[codex] "${join(releasesDir, CURRENT_LINK)}" points at ${JSON.stringify(target)}, ` +
        "which is not a release id.",
    );
  }
  return target;
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

/** What `inspectCorpus` reads from a corpus root. */
export interface InspectedCorpus {
  /** The corpus directory, resolved past `current` (`releases/<id>/corpus`), so a reader
   * built on it keeps reading one release after `current` moves. */
  root: string;
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

/** `<root>/manifest.json`. */
export function manifestFile(root: string): string {
  return join(root, "manifest.json");
}

/** Read errors that mean the manifest is not there (as opposed to a transient I/O error). */
const PERMANENT_READ_ERRORS = new Set(["ENOENT", "ENOTDIR", "EISDIR"]);

/** Reads `<root>/manifest.json` and checks its schema generation. Throws
 * `CorpusUnservableError` when the manifest is absent or unreadable, or when its
 * `schemaVersion` is not this build's `CORPUS_SCHEMA_VERSION`. The release builder runs
 * the same check before it publishes or rolls back to a release. */
export function inspectCorpus(root: string): InspectedCorpus {
  const path = manifestFile(root);
  let header: CorpusManifestHeader;
  try {
    header = JSON.parse(readFileSync(path, "utf8")) as CorpusManifestHeader;
  } catch (e) {
    // A missing or malformed manifest is permanent; an I/O error (EMFILE, EIO, ...) is
    // not, so it propagates as itself and a running server retries it later.
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== undefined && !PERMANENT_READ_ERRORS.has(code)) throw e;
    throw new CorpusUnservableError(
      `[codex] no readable corpus manifest at "${path}": ${(e as Error).message}`,
    );
  }
  if (header.schemaVersion !== CORPUS_SCHEMA_VERSION) {
    throw new CorpusUnservableError(
      `[codex] the corpus at "${root}" has schemaVersion ${JSON.stringify(header.schemaVersion)}, ` +
        `but this build reads schemaVersion ${CORPUS_SCHEMA_VERSION}. Build a new release ` +
        "(`just codex-build`) or deploy the matching code.",
    );
  }
  return {
    root,
    schemaVersion: CORPUS_SCHEMA_VERSION,
    totalEntityCount: typeof header.totalEntityCount === "number" ? header.totalEntityCount : 0,
    fixture: header.foundry?.tag === "fixture",
  };
}
