// Production SSR entry for the codex Compose service (Decision I, P5 deploy — this
// slice only runs it via `pnpm run dev`/`pnpm run start` for the S2 gate). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush
// spine lives in the lib; codex supplies only what's app-specific — its built SSR
// handler, the client-assets dir, and serviceName/port from config.kdl. The corpus
// itself is read at request time via server fns (D29-23), not served as static files.
//
// The Pagefind search bundle (D29-34, `scripts/build-search.ts`) is part of each corpus
// release and is served by `pagefindRoute` under release-keyed URLs (see that file). It
// checks the releases directory per request, so a release published after the server
// starts comes online with no restart; with no release, `/pagefind/*` 404s and the
// omnibar/`/search` render their "index not built" fail-soft notice (S4).
//
// Runs on Node 24 (R3, 0022 S4 — the pilot). `--import .../nodeTsResolve.mjs` is a
// resolve hook that lets Node walk the workspace's extensionless relative imports
// (`from "./config"`) the same way Vite/Bun already do — see that file for why.
//
// Run after `pnpm run build`:  pnpm run start

import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";

import built from "./dist/server/server.js";
import type { ServedCorpus } from "./src/server/corpusFs";
import { PAGEFIND_PREFIX, pagefindRoute } from "./src/server/pagefindRoute";
import { releasesDirOf } from "./src/server/releases";

// `src/server.ts` attaches `servedCorpus` to the bundle's handler (see there).
const ssr = built as typeof built & { servedCorpus: () => ServedCorpus };
const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port, dataPath } = loadConfig().codex;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
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
