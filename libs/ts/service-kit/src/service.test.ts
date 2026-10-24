import type { Server } from "node:http";

import { type Captured, captureTelemetry } from "@astra/observe/testing";
import { SpanKind } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { HttpError, json, matchPath, route } from "./routes";
import { safeEqual } from "./safeEqual";
import { createHandler, createService, type Outcome, type ServiceDefinition } from "./service";

let cap: Captured;
beforeAll(() => {
  cap = captureTelemetry({ serviceName: "astra.service-kit-test", instrumentHttp: true });
});
afterAll(async () => {
  await cap.close();
});

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
}

class Refused extends Error {
  readonly status = 409;
}

const outcomes: Outcome[] = [];

const ITEM = z.object({ name: z.string({ error: "name_required" }).min(1, "name_required") });

const definition: ServiceDefinition = {
  serviceName: "astra.service-kit-test",
  routes: [
    route({ method: "GET", path: "/open", handler: () => json({ open: true }) }),
    route({ method: "*", path: "/any", handler: (ctx) => json({ method: ctx.req.method }) }),
  ],
  groups: [
    {
      prefix: "/api/",
      authenticate: (request) => (request.headers.get("x-token") === "good" ? { uid: "u1" } : null),
      onOutcome: (o) => outcomes.push(o),
      routes: [
        route<unknown, { uid: string }>({
          method: "GET",
          path: "/api/items/:id",
          handler: (ctx) => json({ id: ctx.params.id, uid: ctx.auth.uid }),
        }),
        route({
          method: "POST",
          path: "/api/items/:id",
          body: ITEM,
          handler: async (ctx) => {
            // The handler decides when the body is read: a missing item 404s first.
            if (ctx.params.id === "missing") throw new HttpError(404, "not_found");
            const body = await ctx.body();
            return json({ saved: body.name }, 201);
          },
        }),
        route({
          method: "GET",
          path: "/api/refused",
          handler: () => Promise.reject(new Refused("busy")),
        }),
        route({
          method: "GET",
          path: "/api/boom",
          handler: () => Promise.reject(new Error("kaput")),
        }),
      ],
    },
  ],
  fallback: (_req, url) => new Response(`spa ${url.pathname}`),
};

function req(path: string, init: RequestInit & { token?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("x-token", init.token);
  return new Request(`http://svc.test${path}`, { ...init, headers });
}

async function answer(res: Response): Promise<[number, unknown]> {
  const text = await res.text();
  return [res.status, text.startsWith("{") ? JSON.parse(text) : text];
}

describe("routing", () => {
  const { handle } = createHandler(definition);

  test("public routes, `*` methods, params and the fallback", async () => {
    expect(await answer(await handle(req("/open")))).toEqual([200, { open: true }]);
    expect(await answer(await handle(req("/any", { method: "DELETE" })))).toEqual([
      200,
      { method: "DELETE" },
    ]);
    expect(await answer(await handle(req("/elsewhere")))).toEqual([200, "spa /elsewhere"]);
    expect(matchPath("/a/:id/b", "/a/x%20y/b/")).toEqual({ id: "x y" });
    expect(matchPath("/a/:id", "/a/%E0")).toEqual({ id: "%E0" });
    expect(matchPath("/a/:id", "/a")).toBeNull();
  });

  test("a group authenticates before it looks the route up", async () => {
    outcomes.length = 0;
    expect(await answer(await handle(req("/api/items/7")))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    expect(await answer(await handle(req("/api/nope")))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    expect(await answer(await handle(req("/api/items/7", { token: "bad" })))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    expect(await answer(await handle(req("/api/nope", { token: "good" })))).toEqual([
      404,
      { error: "not_found" },
    ]);
    expect(await answer(await handle(req("/api/items/7", { token: "good" })))).toEqual([
      200,
      { id: "7", uid: "u1" },
    ]);
    expect(outcomes).toEqual([
      "unauthenticated",
      "unauthenticated",
      "unauthenticated",
      "not_found",
      "ok",
    ]);
  });

  test("bodies parse lazily: bad JSON, schema issues, and the handler's own order", async () => {
    const post = (id: string, body: string) =>
      handle(req(`/api/items/${id}`, { method: "POST", token: "good", body }));
    expect(await answer(await post("1", "{nope"))).toEqual([400, { error: "invalid_json" }]);
    expect(await answer(await post("1", "{}"))).toEqual([400, { error: "name_required" }]);
    expect(await answer(await post("1", '{"name":""}'))).toEqual([400, { error: "name_required" }]);
    expect(await answer(await post("missing", "{nope"))).toEqual([404, { error: "not_found" }]);
    expect(await answer(await post("1", '{"name":"lamp"}'))).toEqual([201, { saved: "lamp" }]);
  });

  test("errors map to JSON: HttpError and status-bearing errors keep their status", async () => {
    outcomes.length = 0;
    expect(await answer(await handle(req("/api/refused", { token: "good" })))).toEqual([
      409,
      { error: "busy" },
    ]);
    expect(await answer(await handle(req("/api/boom", { token: "good" })))).toEqual([
      500,
      { error: "internal" },
    ]);
    expect(outcomes).toEqual(["client_error", "error"]);
    expect(cap.logs().some((l) => l.body === "api error on GET /api/boom: kaput")).toBe(true);
  });

  test("the error body, codes and 404 text are the service's choice", async () => {
    const custom = createHandler({
      serviceName: "astra.service-kit-test",
      invalidJson: "invalid json",
      errorResponse: (status, code) => json({ problem: code }, status),
      groups: [
        {
          prefix: "/api/",
          notFound: "not found",
          routes: [
            route({
              method: "POST",
              path: "/api/x",
              handler: async (ctx) => json(await ctx.body()),
            }),
          ],
        },
      ],
    });
    expect(await answer(await custom.handle(req("/api/y")))).toEqual([
      404,
      { problem: "not found" },
    ]);
    expect(await answer(await custom.handle(req("/api/x", { method: "POST", body: "{" })))).toEqual(
      [400, { problem: "invalid json" }],
    );
  });
});

describe("healthz", () => {
  test("ready, unready probes, and draining", async () => {
    let dbUp = true;
    const h = createHandler({ ...definition, probes: { db: () => dbUp, slow: async () => true } });
    expect(await answer(await h.handle(req("/healthz")))).toEqual([
      200,
      { status: "ready", checks: { db: "ok", slow: "ok" } },
    ]);
    dbUp = false;
    expect(await answer(await h.handle(req("/healthz")))).toEqual([
      503,
      { status: "unready", checks: { db: "fail", slow: "ok" } },
    ]);
    h.state = "draining";
    expect(await answer(await h.handle(req("/healthz")))).toEqual([503, { status: "draining" }]);
  });

  test("a probe that throws counts as failed", async () => {
    const h = createHandler({
      serviceName: "astra.service-kit-test",
      probes: { broken: () => Promise.reject(new Error("down")) },
    });
    expect(await answer(await h.handle(req("/healthz")))).toEqual([
      503,
      { status: "unready", checks: { broken: "fail" } },
    ]);
  });
});

describe("createService (a real server)", () => {
  test("names the server span by route template and leaves /healthz unspanned", async () => {
    const svc = createService({
      ...definition,
      port: 0,
      hostname: "127.0.0.1",
      handleShutdown: false,
    });
    const base = await svc.ready();
    expect(svc.state).toBe("ready");
    const before = cap.spans().length;
    await (await fetch(new URL("/healthz", base))).text();
    await (await fetch(new URL("/api/items/42", base), { headers: { "x-token": "good" } })).text();
    await (await fetch(new URL("/api/items/43", base))).text();
    await (await fetch(new URL("/somewhere/else", base))).text();
    await svc.close();
    await until(
      () =>
        cap
          .spans()
          .slice(before)
          .filter((s) => s.kind === SpanKind.SERVER).length >= 3,
    );
    const spans = cap
      .spans()
      .slice(before)
      .filter((s) => s.kind === SpanKind.SERVER)
      .map((s) => [s.name, s.attributes["http.route"], s.attributes["url.path"]]);
    expect(spans).toEqual([
      ["GET /api/items/:id", "/api/items/:id", "/api/items/42"],
      ["GET /api/items/:id", "/api/items/:id", "/api/items/43"],
      ["GET", undefined, "/somewhere/else"],
    ]);
  });

  test("shutdown: stop accepting, drain, close streams, run hooks last-first", async () => {
    const events: string[] = [];
    const { promise: slowGate, resolve: releaseSlow } = Promise.withResolvers<void>();
    const svc = createService({
      serviceName: "astra.service-kit-test",
      port: 0,
      hostname: "127.0.0.1",
      handleShutdown: false,
      drainMs: 300,
      routes: [
        route({
          method: "GET",
          path: "/slow",
          handler: async () => {
            await slowGate;
            events.push("slow answered");
            return new Response("slow done");
          },
        }),
        route({
          method: "GET",
          path: "/stream",
          handler: () =>
            new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(new TextEncoder().encode("data: hi\n\n"));
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            ),
        }),
      ],
    });
    const openConnections = () =>
      new Promise<number>((resolve) => {
        const node = svc.server.node?.server as Server;
        node.getConnections((_err, n) => resolve(n));
      });
    svc.onShutdown(() => events.push("hook registered first"));
    svc.onShutdown(async () => {
      events.push(`hook registered second (${await openConnections()} connections open)`);
      throw new Error("a failing hook does not stop the others");
    });
    const base = await svc.ready();

    const slow = fetch(new URL("/slow", base)).then(async (r) => r.text());
    const stream = await fetch(new URL("/stream", base));
    const reader = stream.body?.getReader();
    await reader?.read();
    expect(await openConnections()).toBe(2);
    const streamEnded = (async () => {
      try {
        while (!(await reader?.read())?.done);
      } catch {
        // the server closed the connection under it
      }
    })();
    await new Promise((r) => setTimeout(r, 50));

    const closed = svc.close().then(() => events.push("close resolved"));
    expect(svc.state).toBe("draining");
    expect(await answer(await svc.handle(req("/healthz")))).toEqual([503, { status: "draining" }]);
    // New connections are refused while the old ones drain.
    await expect(
      fetch(new URL("/slow", base), { headers: { connection: "close" } }),
    ).rejects.toThrow();
    releaseSlow();
    expect(await slow).toBe("slow done");
    await closed;
    await streamEnded;
    expect(svc.close()).toBe(svc.close());
    expect(events).toEqual([
      "slow answered",
      "hook registered second (0 connections open)",
      "hook registered first",
      "close resolved",
    ]);
  });
});

describe("safeEqual", () => {
  test("equal strings only, whatever the lengths", () => {
    expect(safeEqual("token-abc", "token-abc")).toBe(true);
    expect(safeEqual("token-abc", "token-abd")).toBe(false);
    expect(safeEqual("short", "a-much-longer-value")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "x")).toBe(false);
  });
});
