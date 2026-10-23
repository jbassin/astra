// Production SSR entry for the codex Compose service (Decision I, P5 deploy — this
// slice only runs it via `pnpm run dev`/`pnpm run start` for the S2 gate). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush
// spine lives in the lib; codex supplies only what's app-specific — its built SSR
// handler, the client-assets dir, and serviceName/port from config.kdl. The corpus
// itself is still read at request time via server fns (D29-23), not served as
// static files — but the Pagefind search bundle (D29-34, `scripts/build-search.ts`)
// IS a static dir, codex's first use of `staticMounts`.
//
// Registered UNCONDITIONALLY, no startup existence check (adversarial N11):
// `StaticMount` fails soft per-request (`isFile()` inside the fetch handler, see
// `@astra/site-kit`'s `ssrServer.ts`), so an index built AFTER the server starts
// (`just codex-search-index`, host-only — see that script's own file comment for
// the ~3.8 GB indexer-RSS reason it never runs in CI/Docker) comes online with no
// restart; before a build exists, `/pagefind/*` 404s and the omnibar/`/search`
// render their "index not built" fail-soft notice (S4).
//
// Runs on Node 24 (R3, 0022 S4 — the pilot). `--import .../nodeTsResolve.mjs` is a
// resolve hook that lets Node walk the workspace's extensionless relative imports
// (`from "./config"`) the same way Vite/Bun already do — see that file for why.
//
// Run after `pnpm run build`:  pnpm run start

import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";

import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port, dataPath } = loadConfig().codex;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
  staticMounts: [{ urlPrefix: "/pagefind/", dir: `${dataPath}/search/pagefind` }],
});
