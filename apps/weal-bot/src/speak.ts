/**
 * The internal speak API — TS port of `http.rs` (`POST /api/v1/speak`) on a `Bun.serve`
 * bound to the internal address (config `weal.bindAddr`, default 127.0.0.1:10203). A
 * local control plane: other services dial it to post as a host.
 */

import { getLogger } from "@astra/observe";
import type { Gateway, SpeakArgs } from "./gateway";

const log = getLogger("astra.weal-bot");

export function startSpeakServer(bindAddr: string, gateway: Gateway): { stop: () => void } {
  const [hostname, portStr] = bindAddr.split(":");
  const server = Bun.serve({
    hostname: hostname || "127.0.0.1",
    port: Number(portStr ?? "10203"),
    async fetch(req): Promise<Response> {
      const { pathname } = new URL(req.url);
      if (req.method === "GET" && pathname === "/health") {
        return new Response("ok\n");
      }
      if (req.method === "POST" && pathname === "/api/v1/speak") {
        let body: SpeakArgs;
        try {
          body = (await req.json()) as SpeakArgs;
        } catch {
          return new Response("invalid json\n", { status: 400 });
        }
        try {
          await gateway.speak(body);
          return new Response(null, { status: 204 });
        } catch (e) {
          return new Response(`${e}\n`, { status: 400 });
        }
      }
      return new Response("not found\n", { status: 404 });
    },
  });
  log.emit({ severityText: "INFO", body: `speak API listening on ${bindAddr}` });
  return {
    stop: () => {
      server.stop(true);
    },
  };
}
