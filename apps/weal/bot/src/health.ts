/**
 * The container healthcheck endpoint: `GET /health` answers `ok` while the
 * process is up. It binds config `weal.bindAddr` (127.0.0.1:10203), inside the
 * container only; compose publishes no port, and the compose healthcheck is its
 * one caller.
 */

import { getLogger } from "@astra/observe";
import { serve } from "srvx";

const log = getLogger("astra.weal-bot");

/** The request handler, without binding a port (unit-testable). */
export function handleHealth(req: Request): Response {
  const { pathname } = new URL(req.url);
  if (req.method === "GET" && pathname === "/health") return new Response("ok\n");
  return new Response("not found\n", { status: 404 });
}

export function startHealthServer(bindAddr: string): { stop: () => void } {
  const [hostname, portStr] = bindAddr.split(":");
  const server = serve({
    hostname: hostname || "127.0.0.1",
    port: Number(portStr ?? "10203"),
    fetch: handleHealth,
  });
  log.emit({ severityText: "INFO", body: `health endpoint listening on ${bindAddr}` });
  return {
    stop: () => {
      void server.close(true);
    },
  };
}
