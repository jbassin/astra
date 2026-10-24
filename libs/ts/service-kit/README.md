# @astra/service-kit — the HTTP spine of astra's Node services

`createService()` serves one Node HTTP service on srvx: a route table with `:param` templates and
zod-validated JSON bodies, authenticated route groups, JSON error mapping, `/healthz` with
readiness probes, WebSocket upgrade endpoints, and one ordered shutdown. orator-backend
(`apps/orator/bot`), menhir (`apps/menhir/web`), portal (`apps/portal/server`), weal-overlay
(`apps/weal/overlay`) and vellum-render (`apps/vellum/render`) use it. Frontends use
`@astra/site-kit`'s `createSsrServer` instead.

## Using it

```ts
import { createService, HttpError, json, route } from "@astra/service-kit";
import { z } from "zod";

const service = createService({
  serviceName: cfg.app.serviceName,
  port: cfg.app.port,
  routes: [route({ method: "GET", path: "/api/v1/rum-config", handler: () => json({}) })],
  groups: [
    {
      prefix: "/api/",
      authenticate: (req) => actorOf(req), // null answers 401, before the route lookup
      routes: [
        route({
          method: "POST",
          path: "/api/v1/things/:id",
          body: z.object({ name: z.string({ error: "name_required" }) }),
          handler: async (ctx) => json(await save(ctx.params.id, (await ctx.body()).name)),
        }),
      ],
    },
  ],
  fallback: (req) => serveSpa(req), // everything no route answered
  probes: { db: () => store.ping() },
});
service.onShutdown(() => store.close());
```

- **Order of a request:** `GET /healthz`, then the public `routes`, then the first group whose
  `prefix` matches (authenticate, then look the route up, then 404), then `fallback`.
- **Bodies are read by the handler** with `await ctx.body()`, so a handler can answer 404 for a
  missing record before it looks at the body. A body that is not JSON answers 400 with the
  `invalidJson` code; one the schema rejects answers 400 with the schema's first issue message, so
  write the error code as the zod message.
- **Errors:** throw `HttpError(status, code)`. Any error with an integer 4xx/5xx `status` is
  answered the same way. Anything else is a 500 with the `internalError` code, an ERROR log
  (`api error on METHOD /path: message`) and an error status on the request span. The body is
  `{ "error": code }` unless the service passes `errorResponse`.
- **Spans:** `node --import @astra/observe/register` makes one HTTP server span per request. The
  kit names it after the matched template (`GET /api/v1/tracks/:id`) and sets `http.route`, so the
  raw path is never a span name. `/healthz` makes no span at all.
- **Secrets:** compare tokens, keys and signatures with `safeEqual(a, b)`, never `===`.
- **WebSockets:** pass `upgrades: { "/ws": { handle, close } }`. The kit owns the server's
  `upgrade` event and calls `handle(req, socket, head)` (hand it to `ws`'s
  `WebSocketServer.handleUpgrade`) only for that exact pathname; any other path is answered 404,
  and an upgrade during shutdown 503, with the socket closed. Upgrades make no kit span.
- **Node-only libraries** (an Express sub-app, an SDK's Node transport): a route handler returns
  `callNode(ctx.req, (req, res) => app(req, res))`. On a real server the handler writes to the
  socket; under `createHandler` srvx gives it in-memory stand-ins. A throw or rejection before
  anything is written becomes the kit's 500.

## Readiness and shutdown

`/healthz` answers 503 `{"status":"starting"}` until the server listens, then 200
`{"status":"ready"}`; with `probes` it also runs each probe (2 s timeout; a throw is a failure)
and answers 503 `unready` with the per-probe `checks` when any fails. During shutdown it answers
503 `draining`.

observe owns SIGTERM. The kit registers one observe shutdown hook that runs in this order:

1. `/healthz` turns 503 and the server stops accepting connections. Each upgrade handler's
   `close()` runs now, because an upgraded socket never drains on its own (portal's bridge closes
   with 1001 here, so the Foundry module redials).
2. In-flight requests drain for up to `drainMs` (default: a quarter of
   `telemetry.shutdown-timeout-ms`); then every connection still open, such as an SSE stream, is
   closed.
3. The service's `onShutdown` hooks run one at a time, last registered first. A failing hook is
   logged and the rest still run.
4. observe flushes telemetry and exits.

## Traps

- **srvx's own graceful shutdown is off** (`gracefulShutdown: false`). Left on, it installs a
  second SIGTERM handler that races observe's.
- **Unit tests use `createHandler(definition)`**, which builds the same handler without a port.
  Its state starts `ready`.
