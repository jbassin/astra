// Production SSR entry for the strider Compose service (Decision I).
//
// `vite build` emits a bare Web-fetch handler at dist/server/server.js plus the
// hashed client bundle under dist/client/. This entry wraps both: static client
// assets are served straight from disk; everything else falls through to the
// TanStack Start SSR handler. Caddy reverse-proxies this whole service (it does
// not static-serve the site — Decision I).
//
// Run after `bun run build`:  PORT=10360 bun run server.ts

import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = `${HERE}dist/client`;
const PORT = Number(process.env.PORT ?? 10360);

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 30,
  async fetch(req) {
    const url = new URL(req.url);
    // Serve built client assets (hashed bundles, fonts, favicon) directly. The
    // root path always goes to SSR so "/" renders the document, not a file.
    if (url.pathname !== "/") {
      const filePath = `${CLIENT_DIR}${url.pathname}`;
      if (filePath.startsWith(CLIENT_DIR) && (await isFile(filePath))) {
        return new Response(Bun.file(filePath));
      }
    }
    return ssr.fetch(req);
  },
});

console.log(`[strider] SSR listening on http://${server.hostname}:${server.port}`);
