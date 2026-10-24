# weal-overlay — the dice-roll overlay for OBS

weal-overlay shows live weal dice rolls as an OBS browser source. weal-bot posts each roll to
`POST /api/v1/roll` with the shared `weal_token` secret in the `x-weal-token` header, and the
server fans it out to browsers over the SSE stream at `GET /feed`. The page is a Vite-built React
SPA served by the same srvx process (`server.ts`); it is not a TanStack Start app.

The ingest body is defined once, in `@astra/weal-wire` (`libs/ts/weal-wire`): weal-bot builds each
roll through that schema and the overlay validates the body with it (`src/schema.ts`), then maps it
to the camelCase event the feed sends the browser.

It runs as the Compose service `weal-overlay` (port 10361, in the container and on the host), behind
Caddy at `weal-overlay.iridi.cc`. Config is the `weal-overlay` block in `config.kdl`.

## Operations

- **Deploy:** push, then `just deploy weal-bot weal-overlay`. Deploy the two together whenever
  `libs/ts/weal-wire`, the port, or the ingest URL changes.
- **Local dev:** `pnpm --filter @astra/weal-overlay dev:server` runs the server on the config port,
  and `pnpm --filter @astra/weal-overlay dev` runs Vite on port 3000 with `/feed` and `/api`
  proxied to that port. While the live stack runs on the same host, the live overlay already holds
  host port 10361, so the dev server can't bind it and the proxy reaches the live overlay instead.

## Traps

- **Startup fails closed.** The server refuses to start with a blank ingest token; there is no open
  mode. Start it only through `just deploy`, which injects `WEAL_TOKEN`.
- **The token header has two names for one release.** The server accepts `x-weal-token` or the old
  `x-eerie-token`, and weal-bot sends both, so the two can deploy in either order. Drop the old
  name once both run the release that added the new one (see the weal-wire README).
- **The SSE stream needs unbuffered proxying.** The Caddy stanza sets `flush_interval -1`; without it
  rolls arrive in bursts or not at all.
- **Fonts are served from `public/fonts/`**, copied in, because the page requests absolute `/fonts/`
  paths that nothing else serves.
- **The browser bundle never reads config.** The server injects the RUM endpoint into `index.html` as
  `window.__RUM_ENDPOINT__`. `vite.config.ts` reads config.kdl only for the dev proxy target, which
  is why `dev` and `build` pass `--configLoader runner`; tests use the separate `vitest.config.ts`.
