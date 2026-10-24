// The `/pagefind/` route: each corpus release's Pagefind index under a release-keyed URL.
//
//   /pagefind/<path>           302 to /pagefind/r/<served id>/<path>, `no-store`
//   /pagefind/r/<id>/<path>    <releases>/<id>/search/pagefind/<path>, `immutable`
//
// The client imports `/pagefind/pagefind.js` (`pagefindClient.ts`). The redirect makes the
// module's URL the release-keyed one, and Pagefind derives its base path from
// `import.meta.url`, so every index, fragment and filter file a page later fetches comes
// from the release it started with. A release switch therefore never hands a page
// fragments of a different index, and release-keyed files can be cached forever. A page
// stays on its release until it reloads; its release stays served while it is one of the
// releases kept on disk. With no release, every path is a 404, which the search UI shows
// as "index not built".
//
// Run by the root `server.ts` (through `@astra/site-kit`'s `routes`), outside the SSR bundle.

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { serveFile } from "@astra/site-kit";

import { RELEASE_ID_RE, releaseSearchDir } from "./releases";

export const PAGEFIND_PREFIX = "/pagefind/";
const RELEASE_SEGMENT = "r/";
const IMMUTABLE = "public, max-age=31536000, immutable";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

/** A path below a served root: no traversal, NUL, backslash or absolute escape. */
function isSafeRelPath(rel: string): boolean {
  return (
    rel !== "" &&
    !rel.startsWith("/") &&
    !rel.includes("\\") &&
    !rel.includes("\0") &&
    !rel.split("/").includes("..")
  );
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** The handler for `PAGEFIND_PREFIX`, over the releases directory the server mounts.
 * `servedReleaseId` is the release this process serves (null: none, or an explicit corpus
 * root); the redirect targets it, not `current`, so search and pages agree even while the
 * server refuses a newer `current`. */
export function pagefindRoute(
  releasesDir: string,
  servedReleaseId: () => string | null,
): (req: Request, url: URL) => Promise<Response> {
  return async (req, url) => {
    const rel = url.pathname.slice(PAGEFIND_PREFIX.length);
    if (rel.startsWith(RELEASE_SEGMENT)) {
      const rest = rel.slice(RELEASE_SEGMENT.length);
      const slash = rest.indexOf("/");
      const id = slash === -1 ? rest : rest.slice(0, slash);
      const filePart = slash === -1 ? "" : rest.slice(slash + 1);
      if (!RELEASE_ID_RE.test(id) || !isSafeRelPath(filePart)) return notFound();
      const root = releaseSearchDir(releasesDir, id);
      const filePath = join(root, filePart);
      if (!(await isFile(filePath))) return notFound();
      const res = await serveFile(req, filePath, root);
      if (res.status < 400) res.headers.set("cache-control", IMMUTABLE);
      return res;
    }
    if (!isSafeRelPath(rel)) return notFound();
    const id = servedReleaseId();
    if (id === null) return notFound();
    return new Response(null, {
      status: 302,
      headers: {
        location: `${PAGEFIND_PREFIX}${RELEASE_SEGMENT}${id}/${rel}${url.search}`,
        "cache-control": "no-store",
      },
    });
  };
}
