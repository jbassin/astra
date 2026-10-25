# @astra/portal-headless — the always-on headless GM session

A supervised headless Chromium (Playwright) that keeps the dedicated "Portal" GM account
logged into the live Foundry world, so portal's tools work with no human tab open. Compose
service `portal-headless`, port 10373, health only (no Caddy route). Portal as a whole, and
this service's traps (re-login, page classification, `world-down`, viewport and `/dev/shm`,
console logging), are described in [`apps/portal/README.md`](../README.md); this file lists only
what is specific to this package.

## Layout

- `src/index.ts` loads config, wires the Playwright page adapter into the supervisor, and binds
  `/health`.
- `src/supervisor.ts` is the state machine over one page: `in-world` (monitor, and reload every
  `reload-interval-hours`), `join` (log in), `world-down` (back off, never touch `/setup`) and
  `broken` (relaunch the browser). Every browser, clock and timer dependency is injected.
- `src/playwrightDriver.ts` is the thin real driver; unit tests do not run it.
- `src/health.ts` is a plain `node:http` `/health`. `ok` means the process is up and the browser
  connected; `world-down` is reported in `state` but is not unhealthy. The compose healthcheck
  reads `ok`.

## Config

The `portal-headless` block of `config.kdl`: `service-name`, `port`, `foundry-origin` (the
public edge, `https://btl.iridi.cc`), `world`, `gm-username`, `reload-interval-hours` (0
disables the reload), and the secret `gm-password` (`sops:foundry_portal_gm_password`), read only
at login time. The image is built with `RUNTIME: chromium`.

## Testing

```sh
pnpm --filter @astra/portal-headless test
```

The supervisor tests drive a fake page adapter with fake timers; no Chromium runs.

## Traps

- **`SERVICE_NAME` in `src/constants.ts` must equal `portal-headless.service-name`.** The
  constant names the tracer, meter and logger; config names the process.
- **After a module update, restart this service** (`just deploy --restart portal-headless`). A
  socket redial does not reload module code in its page.
- **Its metrics** are `astra.portal_headless.joins`, `astra.portal_headless.relaunches`,
  `astra.portal_headless.world_down_dwell_ms` and `astra.portal_headless.module_console{level}`.
