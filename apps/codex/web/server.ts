// Production SSR entry for the codex Compose service (Decision I, P5 deploy — this
// slice only runs it via `pnpm run dev`/`pnpm run start` for the S2 gate). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + static + SSR-span
// spine lives in the lib; codex supplies only what's app-specific — its built SSR
// handler, the client-assets dir, and serviceName/port from config.kdl. The corpus
// itself is read at request time via server fns (D29-23), not served as static files.
//
// The Pagefind search bundle (D29-34, `apps/codex/ingest/src/build-search.ts`) is part of each corpus
// release and is served by `pagefindRoute` under release-keyed URLs (see that file). It
// checks the releases directory per request, so a release published after the server
// starts comes online with no restart; with no release, `/pagefind/*` 404s and the
// omnibar/`/search` render their "index not built" fail-soft notice (S4).
//
// `pnpm run build` bundles this file into `dist-server/main.mjs` (tsdown.config.ts), and
// the image runs that bundle. Run after `pnpm run build`:  pnpm run start

import path from "node:path";

import { releasesDirOf } from "@astra/codex-corpus/releases";
import { findPackageRoot, loadConfig } from "@astra/config";
import { createSsrServer, loadSsrBuild, type SsrHandler } from "@astra/site-kit";

import type { ServedCorpus } from "./src/server/corpusFs";
import { PAGEFIND_PREFIX, pagefindRoute } from "./src/server/pagefindRoute";

const APP = findPackageRoot(import.meta.dirname);
// `src/server.ts` attaches `servedCorpus` to the bundle's handler (see there).
const ssr = await loadSsrBuild<SsrHandler & { servedCorpus: () => ServedCorpus }>(APP);
const { serviceName, port, dataPath } = loadConfig().codex;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: path.join(APP, "dist", "client"),
  routes: [
    {
      urlPrefix: PAGEFIND_PREFIX,
      handle: pagefindRoute(releasesDirOf(dataPath), () => ssr.servedCorpus().releaseId),
    },
    // What this process serves. `release.ts` reads it before pruning, so a release a
    // running server still serves is never deleted.
    {
      urlPrefix: "/healthz",
      handle: () => {
        const { releaseId, source, totalEntityCount, schemaVersion } = ssr.servedCorpus();
        return Response.json(
          { releaseId, source, totalEntityCount, schemaVersion },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  ],
});
