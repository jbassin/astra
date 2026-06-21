/**
 * orator-backend entrypoint — astra's lift of faerrin `lark` (single-process Bun
 * Discord music bot: voice + library + REST + operator SPA). Wires telemetry first
 * (principle #1 / [[telemetry-built-in]]), then config + ontology, then serves.
 *
 * This scaffold (slice 1) stands up the telemetry-first entry, the ontology-derived
 * operator allowlist (M1), and a minimal HTTP surface (`/api/v1/health`). Later slices
 * lift the Postgres store (2), the bot + voice + full REST (3), auth (4), ingest (5),
 * the data migration (6), and the served Router SPA (7).
 */

import { getLogger, initTelemetry } from "@astra/observe";

// Telemetry before anything that emits — traces/metrics/logs → SigNoz.
initTelemetry("astra.orator-backend");
const log = getLogger("astra.orator-backend");

import { loadConfig } from "@astra/config";
import { loadBeing } from "@astra/ontology";
import { buildAllowlist } from "./allowlist";

function main(): void {
  const cfg = loadConfig();
  const being = loadBeing();

  // Operators = ontology admin snowflakes ∪ the optional config override (M1).
  const allowlist = buildAllowlist(being, cfg.orator.allowedUserIds);
  log.emit({ severityText: "INFO", body: `operator allowlist: ${allowlist.size} id(s)` });

  // PORT overrides config (the Compose unit sets it; cfg.orator.port is the default).
  const port = Number(process.env.PORT) || cfg.orator.port;
  const server = Bun.serve({
    port,
    // Voice join can take a few seconds; the default 10s idle timeout would cut a
    // /playback/play off mid-join. Give it room (lark's idleTimeout:60).
    idleTimeout: 60,
    fetch(req): Response {
      const { pathname } = new URL(req.url);
      if (pathname === "/api/v1/health") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found\n", { status: 404 });
    },
  });

  log.emit({
    severityText: "INFO",
    body: `orator-backend listening on http://localhost:${server.port}`,
  });
}

main();
