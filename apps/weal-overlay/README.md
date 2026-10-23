# weal-overlay — the dice-roll overlay for OBS

weal-overlay shows live weal dice rolls as an OBS browser source. weal-bot posts each roll to
`POST /api/v1/roll` (header `x-eerie-token`, the shared `weal_token` secret), and the server fans it
out to browsers over the SSE stream at `GET /feed`. The page is a Vite-built React SPA served by
the same srvx process (`server.ts`); it is not a TanStack Start app.

It runs as the Compose service `weal-overlay` (container port 10360, host port 10361), behind Caddy
at `weal-overlay.iridi.cc`. Config is the `weal-overlay` block in `config.kdl`.

## Operations

- **Deploy:** push, then `just deploy weal-overlay`.
- **Local dev:** `pnpm --filter @astra/weal-overlay dev:server` runs the server, and
  `pnpm --filter @astra/weal-overlay dev` runs Vite with `/feed` and `/api` proxied to it.

## Traps

- **Startup fails closed.** The server refuses to start with a blank ingest token; there is no open
  mode. Start it only through `just deploy`, which injects `WEAL_TOKEN`.
- **The SSE stream needs unbuffered proxying.** The Caddy stanza sets `flush_interval -1`; without it
  rolls arrive in bursts or not at all.
- **Fonts are served from `public/fonts/`**, copied in, because the page requests absolute `/fonts/`
  paths that nothing else serves.
- **The browser bundle never reads config.** The server injects the RUM endpoint into `index.html` as
  `window.__RUM_ENDPOINT__`.
- **Port 10360 is shared with strider.** The dev server binds the config port 10360 and the Vite proxy
  defaults to it, but strider's host port is also 10360. Don't run strider locally at the same time
  (open bug).
