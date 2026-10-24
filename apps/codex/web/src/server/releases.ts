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
// `<id>` is a content hash of the release's corpus and search trees
// (`scripts/releaseStore.ts`), so two identical builds share one release. Only
// `releases/` is mounted into the container; `current` is relative, so it resolves the
// same way inside and outside it. The writers live in `scripts/releaseStore.ts`; this
// module only reads, and is shared by the corpus reader (`corpusFs.ts`), the Pagefind
// route (`pagefindRoute.ts`) and the scripts.

import { readlinkSync } from "node:fs";
import { join } from "node:path";

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
