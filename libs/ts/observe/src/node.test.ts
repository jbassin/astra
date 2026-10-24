// What `@astra/observe/register` installs, with in-memory exporters: inbound HTTP server
// spans (node:http, through srvx as every service serves) and outbound fetch spans
// (undici). The container check in the lib-7a report proves the real register hook.
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SpanKind } from "@opentelemetry/api";
import { serve } from "srvx";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { serviceNameFor } from "./node";
import { type Captured, captureTelemetry } from "./testing";

let cap: Captured;
beforeAll(() => {
  cap = captureTelemetry({ serviceName: "astra.register-test", instrumentHttp: true });
});
afterAll(async () => {
  await cap.close();
});

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
}

describe("installNodeTelemetry", () => {
  test("a srvx request makes a SERVER span and the fetch a CLIENT span in one trace", async () => {
    const server = serve({
      port: 0,
      hostname: "127.0.0.1",
      silent: true,
      gracefulShutdown: false,
      fetch: () => new Response("ok"),
    });
    await server.ready();
    const res = await fetch(new URL("/hello", server.url));
    expect(await res.text()).toBe("ok");
    await server.close(true);

    await until(() => cap.spans().filter((s) => s.kind === SpanKind.SERVER).length > 0);
    const serverSpan = cap.spans().find((s) => s.kind === SpanKind.SERVER);
    const clientSpan = cap.spans().find((s) => s.kind === SpanKind.CLIENT);
    expect(serverSpan?.name).toBe("GET");
    expect(serverSpan?.attributes["url.path"]).toBe("/hello");
    expect(serverSpan?.attributes["http.response.status_code"]).toBe(200);
    expect(clientSpan?.name).toBe("GET");
    expect(clientSpan?.attributes["url.full"]).toMatch(/\/hello$/);
    // The fetch's traceparent links the server span under the client span.
    expect(serverSpan?.spanContext().traceId).toBe(clientSpan?.spanContext().traceId);
    expect(serverSpan?.resource.attributes["service.name"]).toBe("astra.register-test");
  });

  test("/healthz makes no span; other paths still do", async () => {
    const before = cap.spans().length;
    const server = serve({
      port: 0,
      hostname: "127.0.0.1",
      silent: true,
      gracefulShutdown: false,
      fetch: () => new Response("ok"),
    });
    await server.ready();
    await (await fetch(new URL("/healthz", server.url))).text();
    await (await fetch(new URL("/healthz?probe=1", server.url))).text();
    await (await fetch(new URL("/healthzz", server.url))).text();
    await server.close(true);
    await until(() =>
      cap
        .spans()
        .slice(before)
        .some((s) => s.kind === SpanKind.SERVER),
    );
    const paths = cap
      .spans()
      .slice(before)
      .filter((s) => s.kind === SpanKind.SERVER)
      .map((s) => s.attributes["url.path"]);
    expect(paths).toEqual(["/healthzz"]);
  });

  test("a named `createServer` import (ESM) is instrumented too", async () => {
    const before = cap.spans().length;
    const server = createServer((_req, res) => res.end("named"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    await (await fetch(`http://127.0.0.1:${address.port}/named`)).text();
    await new Promise((r) => server.close(r));
    await until(() =>
      cap
        .spans()
        .slice(before)
        .some((s) => s.kind === SpanKind.SERVER),
    );
    const span = cap
      .spans()
      .slice(before)
      .find((s) => s.kind === SpanKind.SERVER);
    expect(span?.attributes["url.path"]).toBe("/named");
  });
});

describe("serviceNameFor", () => {
  function app(pkg: object): string {
    const dir = mkdtempSync(join(tmpdir(), "observe-register-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    return join(dir, "src", "index.ts");
  }
  const config = { wealOverlay: { serviceName: "astra.weal-overlay" } };

  test("reads the service-name of the block the package.json names", () => {
    const entry = app({ astra: { config: "weal-overlay" } });
    expect(serviceNameFor(entry, config)).toBe("astra.weal-overlay");
  });

  test("fails loudly without the package.json field or the config field", () => {
    expect(() => serviceNameFor(app({}), config)).toThrow(/"astra": \{ "config"/);
    expect(() => serviceNameFor(app({ astra: { config: "nope" } }), config)).toThrow(
      /has no service-name/,
    );
  });
});
