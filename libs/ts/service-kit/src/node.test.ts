import { request } from "node:http";
import type { Duplex } from "node:stream";

import { describe, expect, test } from "vitest";

import { callNode } from "./node";
import { route } from "./routes";
import { createHandler, createService } from "./service";

/** Send an upgrade request; resolve with the status line or the upgraded socket. */
function dialUpgrade(base: string, path: string): Promise<{ status: number; socket?: Duplex }> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, base), {
      headers: { connection: "Upgrade", upgrade: "echo" },
    });
    req.on("upgrade", (res, socket) => resolve({ status: res.statusCode ?? 0, socket }));
    req.on("response", (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("callNode", () => {
  const handler = createHandler({
    serviceName: "astra.service-kit-test",
    routes: [
      route({
        method: "*",
        path: "/node",
        handler: (ctx) =>
          callNode(ctx.req, (req, res) => {
            let body = "";
            req.on("data", (chunk: Buffer) => (body += chunk.toString()));
            req.on("end", () => {
              res.writeHead(201, { "content-type": "text/plain", "x-node": "yes" });
              res.end(`${req.method} ${req.url} ${body}`);
            });
          }),
      }),
      route({
        method: "GET",
        path: "/throws",
        handler: (ctx) =>
          callNode(ctx.req, () => {
            throw new Error("node handler broke");
          }),
      }),
      route({
        method: "GET",
        path: "/rejects",
        handler: (ctx) => callNode(ctx.req, async () => Promise.reject(new Error("later"))),
      }),
    ],
  });

  test("a Node handler answers a kit route, body and headers included", async () => {
    const res = await handler.handle(
      new Request("http://svc.test/node?x=1", { method: "POST", body: "hello" }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("x-node")).toBe("yes");
    expect(await res.text()).toBe("POST /node?x=1 hello");
  });

  test("a throw or a rejection before any answer becomes the kit's 500", async () => {
    for (const path of ["/throws", "/rejects"]) {
      const res = await handler.handle(new Request(`http://svc.test${path}`));
      expect([res.status, await res.json()]).toEqual([500, { error: "internal" }]);
    }
  });

  test("on a real server the handler writes to the socket", async () => {
    const svc = createService({
      serviceName: "astra.service-kit-test",
      port: 0,
      hostname: "127.0.0.1",
      handleShutdown: false,
      routes: [
        route({
          method: "GET",
          path: "/node",
          handler: (ctx) =>
            callNode(ctx.req, (_req, res) => {
              res.writeHead(200, { "content-type": "application/json" });
              res.end('{"from":"node"}');
            }),
        }),
      ],
    });
    const base = await svc.ready();
    const res = await fetch(new URL("/node", base));
    expect([res.status, await res.json()]).toEqual([200, { from: "node" }]);
    await svc.close();
  });
});

describe("upgrades", () => {
  test("an exact path upgrades; other paths 404; close runs first at shutdown", async () => {
    const events: string[] = [];
    const sockets = new Set<Duplex>();
    const svc = createService({
      serviceName: "astra.service-kit-test",
      port: 0,
      hostname: "127.0.0.1",
      handleShutdown: false,
      drainMs: 2_000,
      upgrades: {
        "/echo": {
          handle(_req, socket) {
            sockets.add(socket);
            socket.write(
              "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n",
            );
            socket.on("data", (chunk: Buffer) => socket.write(chunk));
          },
          close() {
            events.push(`upgrade close (${sockets.size} open)`);
            for (const s of sockets) s.destroy();
          },
        },
      },
    });
    svc.onShutdown(() => events.push("hook"));
    const base = await svc.ready();

    expect((await dialUpgrade(base, "/elsewhere")).status).toBe(404);
    expect((await dialUpgrade(base, "/echo/")).status).toBe(404);
    const { status, socket } = await dialUpgrade(base, "/echo?x=1");
    expect(status).toBe(101);
    const echoed = new Promise<string>((resolve) =>
      socket?.once("data", (c: Buffer) => resolve(c.toString())),
    );
    socket?.write("ping");
    expect(await echoed).toBe("ping");
    const ended = new Promise<void>((resolve) => socket?.once("close", () => resolve()));

    const started = Date.now();
    await svc.close();
    await ended;
    // The upgraded socket closed at the start of shutdown, so the drain did not wait it out.
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(events).toEqual(["upgrade close (1 open)", "hook"]);
  });
});
