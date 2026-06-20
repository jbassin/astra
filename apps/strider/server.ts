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
import { getTracer, initTelemetry } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = `${HERE}dist/client`;
const PORT = Number(process.env.PORT ?? 10360);

// Telemetry from day one (principle #1): wire server-side OTel into the SSR
// runtime. The OTLP endpoint comes from config.kdl via @astra/config
// (config-single-source — no env reads, no hardcoded endpoints). Guarded so a
// telemetry misconfig never takes the site down.
let telemetry: { shutdown: () => Promise<void> } | null = null;
try {
  telemetry = initTelemetry("astra.strider");
} catch (err) {
  console.warn(`[strider] telemetry init skipped: ${err instanceof Error ? err.message : err}`);
}
const tracer = getTracer("astra.strider");

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
    // One SSR span per rendered request (assets above short-circuit).
    return tracer.startActiveSpan(
      `SSR ${req.method} ${url.pathname}`,
      { attributes: { "http.method": req.method, "http.route": url.pathname } },
      async (span) => {
        try {
          const res = await ssr.fetch(req);
          span.setAttribute("http.status_code", res.status);
          if (res.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
          return res;
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  },
});

console.log(`[strider] SSR listening on http://${server.hostname}:${server.port}`);

// Force-flush buffered spans before the container stops (BatchSpanProcessor).
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void telemetry?.shutdown().finally(() => process.exit(0));
  });
}
