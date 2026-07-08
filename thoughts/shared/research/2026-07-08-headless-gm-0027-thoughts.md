# 0027 — headless GM: a long-running Foundry GM session so portal works with no human tab open

**Date:** 2026-07-08 · **Status:** SCOPED (all decisions resolved) · **Next:** spec via `octo:spec` →
`thoughts/astra/specs/0027-headless-gm-spec.md`

## 1. What + why

Portal (0023/0025/0026) executes every Foundry action through the astra module running **in a GM's
browser tab**, which dials out over WS to portal-server. Today: no GM tab open → every tool returns
typed `bridge-offline`. The stakeholder wants MCP actions to work 24/7 with zero tabs open.

The shape was assessed at the end of 0025 and is now stakeholder-sanctioned: a **supervised
headless-Chromium GM session as a Compose unit** — a dedicated Foundry GM account, logged in
permanently, running the portal module like any other GM client. Server-side integration remains a
dead end (no Foundry API; LevelDB process-locked; raw socket.io reimplementation version-fragile —
see §8 prior art for the re-check). Don't re-litigate.

## 2. Verified findings (all checked this session against the live host + repo)

### 2.1 Live Foundry deployment (read-only inspection)

- Container `foundry_faerrin`, `felddy/foundryvtt:13.351`, compose project `apps` at
  `/emerald/data/apps/docker-compose.yaml` (jsonnet-generated, hand-managed personal infra — **not**
  astra), network `apps-network`, host port `30001→30000`, `restart: unless-stopped`, up 2 months.
- Env: `FOUNDRY_USERNAME`/`FOUNDRY_PASSWORD`/`FOUNDRY_ADMIN_KEY` set (redacted; the first two are
  foundryvtt.com download credentials, NOT a world user), `CONTAINER_PRESERVE_CONFIG=true`,
  `FOUNDRY_HOSTNAME=FOUNDRY_LOCAL_HOSTNAME=https://btl.iridi.cc`. **`FOUNDRY_WORLD` NOT set.**
- **`options.json` `"world": null` — read directly.** A container restart lands at `/setup`; the
  world being live right now is only because nobody restarted since the last hand-launch. The felddy
  env path can't fix this (`CONTAINER_PRESERVE_CONFIG=true` means the container never rewrites an
  existing `options.json`; upstream auto-launch-via-env bug felddy#234 also unresolved) — the fix is
  a **one-line edit to `options.json` itself** (`"world": "faerrin"`), which Foundry core reads at
  boot (equivalent to `--world`).
- World live: `/api/status` (local + public edge) → `{"active":true,"world":"faerrin","system":"pf2e",
  "systemVersion":"7.12.2","version":"13.351"}`.
- World users (from auth-success log lines; LevelDB untouched): Jorge, Josh, Mike, Noah, Tanner —
  **no dedicated bot account exists**.
- Edge: `btl.iridi.cc` is served by the **host** Caddy (`/emerald/data/reverse-proxy/Caddyfile`
  → `reverse_proxy localhost:30001`), not astra's `sites.caddyfile`. No astra edge change needed.
- Host headroom: 51Gi available; a 200–400 MB Chromium is a rounding error.
- ⚠️ **Incidental find (NOT 0027, surfaced to stakeholder 2026-07-08):** the host Caddy admin API on
  `localhost:2019` is unauthenticated and serves the full config incl. a plaintext Cloudflare DNS API
  token. Pre-existing; fix belongs to the reverse-proxy setup, not this project.

### 2.2 Module/bridge code (file:line verified)

- **Dial gate** `apps/portal/module/src/main.ts:80-111`: `Hooks.once("ready")` → `game.user?.isGM`
  → reads `ws-url` + `bridge-api-key`. All four existing settings are **world-scoped** (`constants.ts:16-36`)
  — every GM session in the world independently satisfies the dial condition. Nothing arbitrates.
- **Oscillation is real and does not self-heal**: the server replace-adopts (`server/src/bridge.ts:113-196`
  — second authed socket terminates the first); the module's `close` handler unconditionally
  reconnects, resetting backoff to 1s after a ≥10s healthy hold (`module/src/bridgeClient.ts:171-179`,
  `HEALTHY_HOLD_MS`). Two healthy GM sessions each dwell >10s before being kicked → both keep
  resetting to 1s → **indefinite ping-pong**. (The 0023 heartbeat-leak is already fixed —
  `bridge.ts:198-203` clears the prior interval on adopt.)
- **Fix location**: a new world-scoped `bridge-user-id` setting compared against `game.user.id`
  (inherently per-session) right after the isGM gate at `main.ts:84`. Empty default = today's
  any-GM behavior (purely additive). Also re-check in `dispatchQuery` (`module/src/handlers.ts:1271-1273`)
  mirroring the existing dial-time + query-time isGM double-check.
- **No canvas dependence anywhere**: zero references to `canvas` or `game.scenes.viewed` in module
  source. Scene-touching handlers (`handleListScenes` :208, `handleGetCurrentScene` :220,
  `handleCreateLight` :638, `handleCreateToken` :1135) all read `game.scenes.active` — a world-level
  document flag, independent of any client's viewport. **`core.noCanvas` is safe for the headless
  session** (smoke-test at acceptance anyway).
- **Identity gap**: `AuthMeta` (`shared/src/envelope.ts:42-51`, `.strict()`) carries only
  world/system/version fields — `bridge-status` cannot say WHICH user is connected. Additive fields
  `userId`/`userName` (optional, so an older module still authenticates) close it.
- Long-run stress points: heartbeat 30s / one missed pong kills the socket (`bridge.ts:100-101,206-214`);
  reconnect never gives up (1s→30s doubling forever, `bridgeClient.ts:16-21` — desired); query
  timeout `bridge-timeout-ms 15000` (`config.kdl:269`); audit fires identically for any connected
  account both sides.
- Module version `0.2.0` (`module.json:4`) must bump in lockstep with `server/src/mcp.ts:184`
  (0026 D-12); module zip served in-process with the manifest rendered from `portal.public-origin`.

### 2.3 Foundry v13 client mechanics (primary-source: the live server's `scripts/foundry.mjs`, build 351)

- **`/join` is 100% client-rendered** (empty `<template id="join-game">`) — driving it requires a
  real JS runtime; static HTTP can't even see the user list. Login = `POST /join` with JSON
  `{userid, password, action:"join"}` → `{message, redirect}` → client navigates. (The supervisor
  can drive the UI or issue the same fetch from page context; either way it's inside Chromium.)
- **Session semantics**: session id lives in a cookie, passed to socket.io as a query param.
  **Second login as the same user kicks the first** — mechanism found: on the socket `"session"`
  event, a mismatched id triggers `debouncedReload()` → lands on `/join` unauthenticated. Hence the
  dedicated account.
- **Nothing auto-rejoins.** World shutdown → notification + redirect to `/` after 1s. Server outage
  ≥5s → full page reload on reconnect (`socket.io.on("reconnect")`). All roads lead back to `/join`
  (or `/setup`/`/auth` when the world is down); Foundry never resubmits credentials. **The
  supervisor loop is therefore the core of this service**: detect not-in-world states, re-drive
  login with backoff, idle politely while the world is down.
- **`core.noCanvas`** confirmed: `scope: "client"` (localStorage), `requiresReload: true`;
  `Canvas.initialize()` early-returns — no PIXI/WebGL constructed at all. Side effects are
  canvas-only features (scene-thumbnail gen etc.) that portal never uses.

### 2.4 In-repo precedent + service pattern

- **`apps/vellum-render` is the browser-in-container template**: `node:24-slim` two-stage,
  `npx playwright install --with-deps chromium` (version pinned transitively by `pnpm-lock.yaml`),
  `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` + **`chown -R 1000:1000 /ms-playwright`**
  (Dockerfile:59,78-85), compose `user: "1000:1000"`, `--no-sandbox` at launch
  (`renderService.ts:45`), one warm Browser for process life, `/health` from `browser.isConnected()`,
  SIGTERM → close browser → `telemetry.shutdown()`. Healthcheck `start_period: 25s` covers warm-up.
- **Delta for a long-lived tab**: set `shm_size` (Docker's default 64MB `/dev/shm` is a known
  Chromium OOM source; vellum-render never hit it because its contexts are short-lived).
- Config/SOPS/telemetry: the `portal` block (`config.kdl:255-276`) + zod mirror
  (`libs/ts/config/src/config.ts:225-240`, `secret()` → `SecretRef`) is the model; `just up`
  decrypts SOPS → env; the service declares only its own `UPPER_CASED` keys in compose. Telemetry:
  `initTelemetry` + `lazyCounter`/`lazyHistogram` only ([[telemetry-coverage-pass]]).
- **Workspace**: `apps/portal/*` pnpm glob + the uv `exclude "apps/portal"` already exist (0023) —
  a new nested member `apps/portal/headless` is **zero-config**. astra's compose has no external
  network yet; adding `apps-network {external}` is possible but not needed under the chosen edge
  path (§3 D27-3). **Next free port: 10373.**

## 3. Decisions — ALL RESOLVED (stakeholder, 2026-07-08)

- **D27-1 World launch: set Foundry auto-launch; the supervisor never touches `/setup`.**
  One-line host-side edit `options.json "world": "faerrin"` (flag at deploy per
  [[flag-paid-live-actions]]; file is in the stakeholder's `apps` stack data dir, root-owned →
  docker-as-root edit or stakeholder does it; takes effect next container boot, no restart forced
  now). Consequences: **no admin key enters astra SOPS**, and the stakeholder's maintenance flow is
  preserved — "Return to Setup" is a runtime action auto-launch doesn't override (boot-time only);
  while he works at Setup the supervisor just backs off on `/join`. Stakeholder's exact concern
  ("what if I want Setup for updates/module installs") is thereby addressed. *To verify at deploy
  (low-risk):* that Return-to-Setup doesn't rewrite `options.json` back to null — if it somehow
  does, behavior degrades to today's manual launch, nothing breaks.
- **D27-2 Strict designated dialer.** New world-scoped `bridge-user-id` setting; only the matching
  `game.user.id` dials; empty = any-GM (today). No auto-fallback to the human GM — fallback logic
  reintroduces the §2.2 race. Headless down → typed `bridge-offline` until it returns (or the GM
  repoints the setting + F5). Re-checked in `dispatchQuery` as defense-in-depth.
- **D27-3 Network path: public edge `https://btl.iridi.cc`.** Identical to a human browser's path;
  avoids the baked-`FOUNDRY_HOSTNAME` absolute-URL risk of in-cluster access. The Foundry origin is
  a config.kdl field regardless, so switching later is a config change.
- **D27-4 Account: "Portal", full Gamemaster role.** Created by the GM in-world (manual, coordinate
  at deploy); password → SOPS (`foundry_portal_gm_password`); one-session-per-account is the reason
  it can't reuse "Josh".

## 4. Proposed shape (for the spec)

New nested member **`apps/portal/headless`** (pkg `@astra/portal-headless`, service name
`astra.portal-headless` — de-collided per the heartwood lesson), port **10373** (health only, not
edge-routed):

1. **Supervisor state machine** (the heart): launch persistent Chromium (vellum-render pattern +
   `shm_size`); navigate to the Foundry origin; classify page state (`/join` → drive login as
   "Portal"; in-world → idle/monitor; `/setup`/`/auth`/world-down → backoff-wait; crash/hang →
   relaunch browser). Seed `core.noCanvas=true` (client-scoped localStorage) before first join;
   verify the module's bridge connects (the page's own module does the dialing — the headless
   service itself never speaks the bridge protocol).
2. **Module change** (version → 0.3.0 in lockstep with `mcp.ts`): `bridge-user-id` setting + gate at
   `ready` + `dispatchQuery` re-check; `AuthMeta` +`userId`/`userName` (optional fields) surfaced
   through `bridge-status` so we can assert WHO holds the bridge.
3. **Config**: `portal-headless { port 10373; foundry-origin "https://btl.iridi.cc"; world "faerrin";
   gm-username "Portal"; gm-password ref="sops:foundry_portal_gm_password" }` + zod/Pydantic mirrors.
4. **Compose unit**: astra `deploy/docker-compose.yml`, `signoz-net` only (edge path → no
   `apps-network` attachment needed), `user: "1000:1000"`, healthcheck on `/health` (reports
   supervisor state: browser up / in-world / module-bridge-observed), `restart: unless-stopped`.
5. **Telemetry from day one**: spans per state transition, counters (rejoins, relaunches,
   world-down dwell), logs; the existing `portal.audit.*` trail already captures the actions
   themselves.
6. **Hygiene knob**: optional periodic page reload (e.g. daily) — long-lived Foundry tabs are a
   known slow-leak surface (prior art anecdotal, not confirmed); cheap insurance, config-gated.

**Operational notes for the spec**: deploy needs the usual GM coordination (create "Portal" user,
set `bridge-user-id`, F5 the human tab per the ready-hook gotcha, `sops set` the password,
`options.json` edit); the session MCP tool-list snapshot gotcha applies if any tool schema changes;
`just up` is classifier-gated (stakeholder says "deploy it").

## 5. Acceptance sketch (A–G, refine in spec)

A. Zero human tabs open → MCP tool calls (read + write) succeed end-to-end through the public edge.
B. `bridge-status` reports `userName: "Portal"` (the AuthMeta change live-proven).
C. Oscillation dead: human GM tab open simultaneously → no bridge flap (tab doesn't dial;
   server logs show a single stable socket).
D. Resilience: `docker restart astra-portal-headless` → auto-relogin + bridge back within ~2 min;
   world shutdown → supervisor idles (no `/setup` interference) → world relaunch → auto-rejoin.
E. `options.json` auto-launch proven (bounce the foundry container **only with stakeholder
   approval** — it's his stack; else defer to the next natural restart).
F. `core.noCanvas` smoke: create-token/create-light/get-current-scene behave identically headless.
G. SigNoz: three signals from `astra.portal-headless`, 0 unexpected errors over a soak window.

## 6. Explicitly out of scope

- Any change to the stakeholder's `apps` stack beyond the one-line `options.json` value (D27-1).
- Admin-key automation / driving `/setup` (declined by D27-1's shape).
- Multi-world or second-instance support (`star.iridi.cc`, `btl-old` exist but are not portal's).
- Fixing the `just portal-module-install` EACCES (0026 residue — separate small item; manifest-URL
  install is the primary path anyway).
- The host Caddy admin-API exposure (§2.1 — surfaced, belongs elsewhere).

## 7. Risks

- **Foundry client drift**: the supervisor drives `/join` mechanics pinned to 13.351 behavior
  (verified from the live bundle). A Foundry upgrade can break login automation — mitigation: the
  state classifier is deliberately coarse (URL + a couple of DOM probes), health surfaces
  `not-in-world`, and Class-A alerting picks up ERROR logs.
- **Long-run Chromium stability**: unproven in-repo for a weeks-long tab (vellum-render is
  per-request). Mitigations: `shm_size`, crash-relaunch in the supervisor, optional daily reload,
  soak criterion G.
- **Two-GM-session edge cases in pf2e**: none known (module handlers are document-CRUD), but the
  headless user will appear in the user list / chat as a logged-in GM — cosmetic; stakeholder aware.

## 8. Prior art re-checked (context for the spec author)

- `ThreeHats/foundryvtt-rest-api-relay` uses Puppeteer for "unattended Foundry sessions" + a
  dedicated bot user — same shape as 0027, validating the approach.
- `laurigates/foundryvtt-mcp` speaks raw socket.io with no browser — lighter, but can't host the
  portal module (execute-macro and any client-context tool need the real JS environment), and the
  0025 assessment already rejected protocol reimplementation as version-fragile. Rejected again.
- Foundry ToS: no prohibition found on automated clients against your own self-hosted licensed
  server (full EULA not exhaustively read; risk assessed negligible for personal infra).
