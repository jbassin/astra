# @astra/observe — telemetry for TypeScript services and pages

`@astra/observe` installs OpenTelemetry traces, metrics and logs for every astra Node service
and exports them over OTLP/HTTP to the SigNoz collector; `@astra/observe/web` is the browser
RUM counterpart. Every Node service depends on it. It is the twin of the Python
[`astra-observe`](../../py/observe/README.md).

## How a service gets telemetry

A Node service never initialises telemetry itself. It runs as
`node --import ./dist-server/register.mjs dist-server/main.mjs` (each app's `start` script and
the `deploy/node.Dockerfile` CMD; the server bundle builds `register.mjs` from
`@astra/observe/register`). Before any app module loads, `register` installs the three
providers, HTTP server and client spans (`node:http`), fetch spans (undici), the stdout mirror
of every log record, and the one SIGTERM/SIGINT handler.

The service name comes from config: the entry's nearest `package.json` names a block in
`"astra": { "config": "<namespace>" }`, and that block's `service-name` is the name
(`serviceNameFor`). A package without that field fails at startup with a message that says
what to add.

## Public surface

- `getTracer`, `getMeter`, `getLogger`, and `logger("astra.<sub>")` with
  `debug/info/warn/error/fatal(msg, attrs)`. Every record at INFO or above also prints to
  stdout as one line, so `docker logs` shows what SigNoz shows.
- `lazyCounter` and `lazyHistogram`: instruments that bind on first use. Use them for app
  metrics.
- `onShutdown(fn)` registers cleanup; hooks run in reverse order, concurrently, before the
  flush. `exitAfterFlush(code)` runs them, flushes and exits; use it on a fatal startup error so
  the FATAL record reaches SigNoz. The whole shutdown is bounded by
  `telemetry.shutdown-timeout-ms` (hooks get 60%, the flush the rest).
- `reportIgnored(site, err)` records a deliberately swallowed error
  (`astra.errors.ignored{site}` and a DEBUG record) instead of a bare `catch {}`.
- `initTelemetry` and `installNodeTelemetry` are what `register` calls; app code doesn't.
- `@astra/observe/testing`: `captureTelemetry()` records spans, metrics and logs in memory for
  a test; `close()` resets the globals.
- `@astra/observe/web`: `initRum({ serviceName, endpoint })` installs a browser tracer and a
  `page-load` span. It imports neither config nor the Node SDK, so the server must hand the
  endpoint (`telemetry.rum-endpoint`) to the page.

## Where telemetry goes

`ASTRA_RUNTIME=container` (set by `deploy/node.Dockerfile`) exports to
`telemetry.otlp-endpoint`; unset means the host and `telemetry.host-otlp-endpoint`.
`deployment.environment` is `test` under vitest (nothing is exported), `production` in a
container or the deploy checkout, else `development`.

## Testing

```sh
pnpm --filter @astra/observe test
```

## Traps

- **Every ERROR or FATAL log pages Discord** (a SigNoz alert rule). Log a user-content problem
  at WARN or below.
- **Don't `console.log` what you log.** `logger()` already prints INFO and above to stdout;
  `console.log` itself does not export.
- **`/healthz` is never traced**, and inside a container loopback requests (the compose
  healthcheck) are not traced either.
- **An instrument created before the provider exists is a permanent no-op.** Under `register`
  module-scope instruments work, but a module that also loads in tests or scripts needs
  `lazyCounter`/`lazyHistogram`. A lazy instrument stays bound to the first capture that used
  it.
- **Only one SIGTERM handler.** observe owns it; libraries such as `@astra/service-kit` register
  an `onShutdown` hook instead of their own handler.
