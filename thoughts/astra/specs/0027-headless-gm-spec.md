# NLSpec 0027 — headless-gm: a supervised 24/7 GM session so portal works with no human tab

**Status:** IN PROGRESS (2026-07-08) — S1 `32f509b` (dialer + identity) · S2 `f281283` (supervisor
  service; classify() hardened at review: in-world is positively `/game`, unknown → `world-down`) ·
  S3 `4914111` (container + compose; non-live acceptance passed: unreachable→`broken` no-crash-loop,
  /setup-fixture→`world-down` zero-login) — all CI-green + pushed. **S4 LIVE GATE RUN 2026-07-08
  evening: acceptance A/B/C/D/F/G-signals ALL PASSED live** (zero-tab read+write; `userName:
  "Portal"`; the real oscillation observed in the empty-setting window then dead once
  `bridge-user-id` landed; restart → in-world in ~5s; world-down politeness during the GM's Setup
  session; hidden-light + Goblin-Warrior token create/delete clean, zero debris). Two live
  fast-follows shipped: viewport 1600×900 `bda23ee` (Foundry min 1366×768 — its console error paged
  Class A) + page-console demote-to-warn `6fd8d5e` (world noise must not trip the error/fatal
  alert; the `module_console` counter keeps the real level). **▶ Remaining to close: the ≥24h soak
  (G) + acceptance E** (options.json auto-launch proof — foundry-container bounce awaits explicit
  stakeholder approval, else the next natural restart).
**Scope doc:** `thoughts/shared/research/2026-07-08-headless-gm-0027-thoughts.md` (all claims
  verified 2026-07-08: live host inspected read-only — compose labels, env, `options.json` read
  directly; module/bridge code walked file:line; Foundry v13.351 `/join`+session+`core.noCanvas`
  mechanics extracted from the live server's own `scripts/foundry.mjs`; prior art re-checked).
**Date:** 2026-07-08 · **Subsystem slug:** `headless-gm` · **Phase:** follow-on to 0023 + 0025 +
  0026 (all COMPLETE).
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`.
**Honors memory:** [[verify-before-acting]], [[no-silent-scope-cuts]],
  [[resolve-open-questions-before-next-stage]], [[no-ci-monitoring]], [[deploy-apply-with-just]],
  [[config-single-source]], [[telemetry-built-in]], [[flag-paid-live-actions]],
  [[portal-0023-gotchas]], [[portal-oauth-0025-gotchas]], [[portal-authoring-0026-gotchas]],
  [[deploy-artifacts-run-as-user]].

## Goal

Every portal tool executes through the astra module in a GM browser tab; no tab → typed
`bridge-offline`. The stakeholder wants MCP actions to work 24/7 with zero tabs open. Build a
**supervised headless-Chromium GM session as a Compose unit**: a dedicated Foundry user ("Portal",
full GM) permanently logged into the live pf2e "Faerrin" world through the public edge, running the
portal module exactly like a human GM client, with a supervisor loop that re-drives login whenever
Foundry drops the session (Foundry never auto-rejoins — verified). Plus the module-side
**designated-dialer gate** so the human GM's tab and the headless session never fight over the
single bridge socket (the oscillation is real and does not self-heal — verified in code).

## Decisions in force

D27-1…D27-4 are stakeholder-resolved (scope doc §3, AskUserQuestion 2026-07-08); D27-5…D27-14 are
spec-level technical decisions.

| # | Decision | Resolution |
|---|---|---|
| D27-1 | World launch | **Foundry auto-launch via a one-line `options.json` edit** (`"world": "faerrin"`; the felddy env path is dead — `CONTAINER_PRESERVE_CONFIG=true` never rewrites an existing file, upstream #234). Boot-time only, so the GM's "Return to Setup" maintenance flow (updates, module installs) is untouched; **the supervisor never touches `/setup` and no admin key enters astra SOPS** — while the world is down the supervisor idles with backoff. The edit is a flagged host-side action at S4 (stakeholder's `apps` stack data dir, root-owned → docker-as-root or stakeholder applies it). |
| D27-2 | Bridge dialer | **Strict designated dialer.** New world-scoped module setting `bridge-user-id`; a GM session dials only if `game.user.id` matches. Empty default = today's any-GM behavior (purely additive; the existing world keeps working until the setting is set). **No auto-fallback** to the human GM — fallback reintroduces the replace-adopt race. Headless down → typed `bridge-offline` until it returns, or the GM repoints the setting + F5. |
| D27-3 | Network path | **Public edge `https://btl.iridi.cc`** — the exact path a human browser takes; avoids the risk that `FOUNDRY_HOSTNAME`-baked absolute/WS URLs break in-cluster access. The origin is a config.kdl field, so switching later is config-only. No `apps-network` attachment; the unit lives on `signoz-net` alone. |
| D27-4 | Account | **"Portal", full Gamemaster role**, created in-world by the GM (manual, S4); password → SOPS `foundry_portal_gm_password`. One-session-per-account (kick mechanism verified in `foundry.mjs`) is why "Josh" can't be reused. |
| D27-5 | Member layout | New nested member **`apps/portal/headless`** (pkg `@astra/portal-headless`, service name `astra.portal-headless` — de-collided per the heartwood lesson). Zero workspace config: the `apps/portal/*` pnpm glob + uv `exclude "apps/portal"` already cover it (0023). Port **10373** (next free), health-only, **not edge-routed** (no `sites.caddyfile` change). |
| D27-6 | Supervisor shape | A **coarse state machine** over one persistent Chromium page: classify by URL + a couple of DOM probes → `in-world` (idle/monitor) · `join` (drive login) · `world-down` (`/setup`/`/auth`/`/` or join UI absent → backoff-wait, never interfere) · `broken` (crash/hang/nav error → relaunch browser). Login = the real `/join` flow in-page (select user "Portal" by name, `POST /join` `{userid, password, action:"join"}`, follow `redirect`). Coarseness is deliberate — less surface to break on Foundry upgrades. Backoff mirrors the module's bridge client (1s→30s doubling, never gives up). |
| D27-7 | Canvas | Seed **`core.noCanvas = true`** (client-scoped, localStorage, verified `Canvas.initialize()` early-return) before first join — no PIXI/WebGL constructed, the RAM/CPU win for a 24/7 tab. Safe: zero portal handlers touch `canvas`/`game.scenes.viewed` (grep-verified); smoke-tested anyway (acceptance F). |
| D27-8 | Connection identity | `AuthMeta` gains **optional `userId` + `userName`** (additive — an older module build still authenticates); module `meta()` sends `game.user.id/.name`; `BridgeStatus`/`bridge-status` surface them. This is how acceptance proves *the headless account* holds the bridge, and how oscillation would be caught if it ever recurred. |
| D27-9 | Dialer enforcement points | The `bridge-user-id` gate runs at the `ready` dial gate (after the existing `isGM` check, `main.ts:84`) **and** is re-checked in `dispatchQuery` (defense-in-depth, mirroring the existing dial-time + query-time `isGM` double-check — this matters when the GM repoints the setting on an already-adopted socket without an F5). The query-time refusal needs a wire value: **`BridgeErrorCode` gains `not-designated`** (additive union, mirrors 0026 D-11; `not-gm` would be semantically wrong — the session IS a GM). A set-but-unresolvable id (no matching `game.users` entry) logs a loud module warning at `ready` and does not dial; **the supervisor captures `page.on("console")`** and re-emits module warn/error lines through its own telemetry (counter + log), because nobody watches a headless devtools console — this is what makes a misconfigured dialer diagnosable from SigNoz rather than invisible behind a green healthcheck. |
| D27-10 | Browser lifecycle | vellum-render pattern: one warm Chromium for process life, `--no-sandbox`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` + `chown 1000:1000`, `user: "1000:1000"`. Deltas for a long-lived tab: **`shm_size: 1gb`** (Docker's 64MB `/dev/shm` default is the known Chromium OOM source) and an **optional periodic page reload** (config `reload-interval-hours`, default 24, 0 = off) as slow-leak insurance. Ephemeral profile; `core.noCanvas` re-seeded on every (re)launch before navigation. |
| D27-11 | Health semantics | `/health` reports `{ok, browserConnected, state, inWorld, lastJoinAt, joins, relaunches}`. The compose healthcheck asserts **process-up + browser-connected only** — `world-down` is a *reported state, not unhealthy* (restarting the container can't launch a world; a restart-loop during the GM's maintenance window would be noise and could fight D27-1's politeness). |
| D27-12 | Versioning | Module `module.json` + server `McpServer` → **0.3.0** in lockstep at S1 (0026 D-12 discipline). The headless service versions with the repo like every other astra app. |
| D27-13 | Config | New kdl block `portal-headless { port 10373; foundry-origin "https://btl.iridi.cc"; world "faerrin"; gm-username "Portal"; gm-password ref="sops:foundry_portal_gm_password"; reload-interval-hours 24 }` + **both** schema mirrors (zod + Pydantic — [[config-single-source]]; the Pydantic mirror is load-bearing, not ceremony: root `AppConfig` is `extra="forbid"` (`models.py:17`), so an unmirrored top-level block breaks Python config loading outright — every TS-only service already mirrors). Compose env: `FOUNDRY_PORTAL_GM_PASSWORD` only. |
| D27-14 | Secret hygiene | The GM password exists only as a `SecretRef` resolve at login time — never in logs, span attributes, error messages, or health output; no page screenshots are ever captured (a screenshot could contain world content or the login form). The 0025 hygiene hard rule applies verbatim. |

## Verified footprint (trust these over prose — file:line in the scope doc §2)

- **Dial gate**: `module/src/main.ts:80-111` (`Hooks.once("ready")` → `isGM` → world-scoped
  `ws-url`/`bridge-api-key`). All existing settings world-scoped (`constants.ts:16-36`); new
  setting registers in `registerSettings()` (`main.ts:24-66`) + a `SETTING_*` constant.
- **Oscillation mechanics**: server replace-adopt terminates the prior socket
  (`server/src/bridge.ts:113-196`); module reconnects unconditionally on `close`, backoff resets
  to 1s after a ≥10s healthy hold (`module/src/bridgeClient.ts:16-21,171-179`) → two healthy GM
  sessions ping-pong forever. D27-2 removes the second dialer instead of arbitrating.
- **`AuthMeta`** is `.strict()` with 5 fields (`shared/src/envelope.ts:42-51`); `BridgeStatus`
  (`bridge.ts:66-73`) mirrors it; module `meta()` built at `main.ts:100-106`. Optional-field
  addition is the established pattern ("older module must still authenticate").
- **Query-time re-check precedent**: `isGM` at `handlers.ts:274` + `dispatchQuery`
  (`handlers.ts:1271-1273`).
- **Foundry v13.351 client (primary source, live bundle)**: `/join` is 100% client-rendered (empty
  `<template id="join-game">`) — automation requires a real JS runtime; login = `POST /join` JSON
  `{userid, password, action:"join"}` → `{redirect}`; session id in a cookie, socket.io query
  param; same-user second login → session-mismatch → `debouncedReload()` → `/join` (the kick);
  world shutdown → redirect to `/`; outage ≥5s → full page reload on reconnect; **nothing ever
  resubmits credentials** — the supervisor loop is the product.
- **`core.noCanvas`**: `scope: "client"`, `requiresReload: true`, `Canvas.initialize()`
  early-returns (no PIXI at all). Portal module has zero `canvas`/`.viewed` references; scene
  handlers read `game.scenes.active` (world-level): `handlers.ts:208,220,638,1135`.
- **Live host**: `options.json` `"world": null` (read directly — container restart lands at
  `/setup` today); no bot account exists (users: Jorge/Josh/Mike/Noah/Tanner); `btl.iridi.cc` edge
  is the **host** Caddy (`/emerald/data/reverse-proxy/Caddyfile` → `localhost:30001`), not astra's;
  51Gi RAM headroom.
- **vellum-render precedent**: Dockerfile `node:24-slim` + `npx playwright install --with-deps
  chromium` (Chromium pinned transitively by `pnpm-lock.yaml`) + `chown /ms-playwright`
  (Dockerfile:59,78-85); warm-Browser lifecycle + `/health` from `browser.isConnected()`
  (`renderService.ts:44-55`); compose healthcheck `start_period: 25s`; SIGTERM → browser close →
  `telemetry.shutdown()`. **No `shm_size` there** (short-lived contexts) — D27-10 adds it here.
- **Bridge long-run parameters**: heartbeat 30s, one missed pong kills the socket
  (`bridge.ts:100-101,206-214`); module reconnect never gives up (desired); query timeout
  `bridge-timeout-ms 15000` (`config.kdl:269`).
- **Ambient-stub ripple (new surface, same kind as 0026's):** `module/src/types/foundry.d.ts`'s
  `FoundryUser` currently declares only `isGM` — D27-8/-9 need `id`/`name` on it plus a
  `game.users` collection on `FoundryGame` (not currently declared).
- **Not verified (deliberate, low-stakes — don't code against invented numbers):** Foundry's
  session-cookie lifetime; and the "world shutdown → redirect to `/`" behavior is source-inferred
  from `foundry.mjs`, not observed live (the cold-boot `/setup` state WAS observed via
  `options.json`). Both are absorbed by the coarse classifier (a stale session or unexpected
  landing page just classifies as `join`/`world-down` on the next probe) and re-proven live at
  acceptance D.

## Scope (in)

1. **`module/` + `shared/` + `server/` (the dialer + identity change):** `bridge-user-id` setting
   + `ready` gate + `dispatchQuery` re-check + the new `not-designated` error code (D27-2/-9);
   `AuthMeta` + `BridgeStatus` + `bridge-status` gain `userId`/`userName` (D27-8); the
   `foundry.d.ts` ambient additions (§Verified footprint); versions → 0.3.0 (D27-12); tests via
   the existing `stubFoundry` fakes + server unit tests.
2. **`apps/portal/headless` (the new service):** supervisor state machine (D27-6) with the page
   layer behind an injected adapter so the machine is hermetically unit-testable (CI has no
   Chromium — vellum-render's browser also isn't exercised in unit CI); Playwright page driver
   (classify, login, noCanvas seed, reload, **`page.on("console")` capture → telemetry**, D27-9);
   `/health` (D27-11); telemetry from day one (`initTelemetry`, spans per state transition,
   `lazyCounter`s for joins/relaunches/world-down dwell + module console warns, logs —
   [[telemetry-coverage-pass]]).
3. **Config:** the `portal-headless` block + zod + Pydantic mirrors + config tests (D27-13); SOPS
   key `foundry_portal_gm_password` (value set at S4 with the stakeholder).
4. **Deploy:** Dockerfile (vellum-render pattern + D27-10 deltas), compose unit (`signoz-net`,
   `user: "1000:1000"`, `shm_size`, healthcheck per D27-11, `restart: unless-stopped`,
   `FOUNDRY_PORTAL_GM_PASSWORD` env). No Caddy change (D27-5). The sibling Dockerfile
   manifest-COPY ripple applies to the new member (0023 gotcha; 12 TS Dockerfiles today → 13 —
   expect to touch every one).
5. **Live acceptance (S4)** with the GM present: account creation, SOPS set, `options.json` edit
   (D27-1, flagged), `bridge-user-id` set + human tab F5, then the A–G gate below; memory +
   RESUME + spec status.

## Scope (out) / deferred (recorded, not silently cut — [[no-silent-scope-cuts]])

- **Driving `/setup`** (launch-world automation, admin key in SOPS) — declined by D27-1's shape.
- **Any `apps`-stack change beyond the one-line `options.json` value** — it's the stakeholder's
  hand-managed infra.
- **Multi-world / second-instance support** (`star.iridi.cc`, `btl-old.iridi.cc` exist; not
  portal's).
- **Auto-fallback dialer arbitration** (D27-2 rationale — revisit only if headless downtime
  actually bites).
- **In-page module-state introspection** (supervisor asserting the bridge socket from inside the
  page) — `bridge-status` via MCP is the authoritative check; adding module internals coupling
  buys little.
- **The `just portal-module-install` EACCES fix** (0026 residue; manifest-URL install is primary).
- **The host Caddy admin-API exposure** (scope §2.1 — surfaced to the stakeholder; reverse-proxy
  territory, not astra).

## Slices

### Slice S1 — designated dialer + connection identity (module/shared/server; Foundry-free)
- `shared/`: `AuthMeta` optional `userId`/`userName`; `module/`: `SETTING_BRIDGE_USER_ID` +
  registration + `ready` gate + `dispatchQuery` re-check + `meta()` sends identity; `server/`:
  `BridgeStatus` carries identity through `bridge-status`; versions → 0.3.0 both sides.
- **Acceptance:** CI-green both lanes locally. Tests prove — empty setting: GM dials (today's
  behavior byte-compatible); set + matching id: dials; set + non-matching id: never constructs a
  `BridgeClient`, and `dispatchQuery` refuses typed `not-designated` if reached; set +
  unresolvable id: warns loudly, no dial; handshake without identity fields still authenticates
  (old-module compat — the safe skew direction); `bridge-status` round-trips `userName` via a
  stub bridge.

### Slice S2 — the headless supervisor service (hermetic)
- New member `apps/portal/headless`: state machine + injected page adapter + Playwright driver +
  `/health` + telemetry + config block/mirrors/tests (D27-6/-7/-10/-11/-13/-14).
- **Acceptance:** CI-green. State-machine unit tests prove — every classified state transitions
  correctly (join→login→in-world; in-world→(kick/reload/shutdown)→join; world-down→backoff-idle
  with **zero** login attempts against `/setup`; nav-error/crash→relaunch with re-seeded
  `noCanvas`); backoff doubles 1s→30s and resets after a healthy hold; the reload knob fires at
  the configured interval and 0 disables it; the password never appears in any log line the fake
  captures (D27-14 asserted in-test); page-console warn/error lines re-emit through the service's
  telemetry (D27-9, via the injected adapter); `/health` truthfully reports each state incl.
  `world-down` as `ok: true` (D27-11).

### Slice S3 — containerization + compose
- Dockerfile (playwright chromium, chown, two-stage), compose unit (all D27-10/-11 deltas),
  manifest-COPY ripple across sibling Dockerfiles (12 today, 13 with the new member — "every TS
  Dockerfile"), `just` recipe touch-ups if any.
- **Acceptance:** CI-green; the image builds locally; the container is exercised against **two
  pinned non-live targets** (never the live host pre-S4 — [[flag-paid-live-actions]]): (a) an
  unreachable origin → `broken`, bounded relaunch/backoff, no crash-loop; (b) a **minimal local
  HTTP fixture serving a captured `/setup`-shaped page** → `world-down`, healthy-idle, zero login
  attempts. `/health` serves truthfully in both — proving the unit deploy-safe before any live
  coupling.

### Slice S4 — deploy + live acceptance + memory (GM present)
- Human steps, coordinated live: GM creates user "Portal" (full GM) in-world; `sops set`
  `foundry_portal_gm_password`; the `options.json` `"world": "faerrin"` edit
  ([[flag-paid-live-actions]] — flag it; docker-as-root or stakeholder applies); GM sets
  `bridge-user-id` to Portal's user id + F5s their own tab.
- `just up` (rebuild incl. module 0.3.0 zip; classifier gate — stakeholder says "deploy it");
  GM updates the module + F5 (0023 rule); `/mcp` reconnect if any tool schema changed (0026
  snapshot gotcha).
- Then the exit gate below, a soak window, memory (`headless-gm-0027-gotchas` + `MEMORY.md`),
  RESUME, spec status.

## Acceptance criteria (exit gate)

- **A.** All slices CI-green + pushed; both lanes reproduce locally.
- **B.** **Zero-tab operation:** with no human Foundry tab open, MCP read + write tools succeed
  end-to-end through the public edge (claude.ai or Claude Code), and `bridge-status` reports
  `userName: "Portal"` (D27-8 live-proven).
- **C.** **Oscillation dead:** the human GM tab open *simultaneously* with the headless session →
  a single stable bridge socket (server logs show no adopt-churn; the human tab, non-designated,
  never dials).
- **D.** **Resilience:** `docker restart astra-portal-headless` → auto-relogin + bridge back
  (bounded, ~2 min); GM performs a real "Return to Setup" + relaunch → supervisor idles politely
  during (zero `/setup` interaction, `state: world-down`, container stays "healthy" per D27-11)
  then auto-rejoins after.
- **E.** **Auto-launch:** `options.json` proven by a foundry container bounce **only with explicit
  stakeholder approval** (his stack); otherwise deferred to the next natural restart with the
  expected behavior recorded.
- **F.** **noCanvas smoke:** `get-current-scene`, `create-token`, `create-light` (+ stamped
  cleanup) behave identically under the headless session.
- **G.** **Telemetry + soak:** `astra.portal-headless` traces+logs+metrics in SigNoz;
  join/relaunch counters move when D's restart runs; the module-console capture (D27-9) is
  observable; `portal.audit.*` unchanged for the writes in F; **soak ≥ 24h (≥ one
  `reload-interval-hours` cycle)** with 0 unexpected errors and a working tool call at the end —
  anything shorter proves nothing about the slow-leak risk the knob exists to hedge; no secret
  material anywhere (D27-14 spot-check).
- **H.** Memory + RESUME + spec status updated.

## Risks

- **Foundry client drift** (the supervisor automates 13.351 mechanics): D27-6's deliberate
  coarseness; `not-in-world` health state + Class-A ERROR alerting surface a break; the pinned
  image means drift arrives only when the stakeholder upgrades — recheck `/join` mechanics then
  (record in memory).
- **Long-run Chromium stability** (weeks-long tab is unproven in-repo): `shm_size`, crash-relaunch,
  the reload knob, soak in G. If leaks persist, drop `reload-interval-hours`.
- **The kick loop foot-gun:** if anyone logs in as "Portal" manually, the two sessions kick each
  other in a loop (same-user, not the bridge race). Mitigation: documentation (the account exists
  for the machine; humans use their own), and the supervisor's backoff makes the contention slow
  rather than hot.
- **Return-to-Setup vs `options.json`** (does it rewrite `world` to null? — unverifiable without
  touching production): if it does, behavior degrades to today's manual launch; nothing breaks;
  check at S4/E and record.
- **`bridge-user-id` misconfiguration** (typo'd id): the failure shape is nasty by default —
  `bridge-status` shows plain `connected: false` (identical to "no tab"), `/health` shows
  `inWorld: true` (login succeeded), and the module's warning lands in a devtools console nobody
  has open. D27-9's `page.on("console")` capture is the mitigation: the warn surfaces in the
  service's own logs/counter in SigNoz. Named residual: `bridge-status` itself still can't
  distinguish "no dialer" from "dialer refused" — accepted, the console capture covers diagnosis.
- **Server rollback skew:** old-module → new-server is safe (`userId`/`userName` optional,
  verified), but a portal-server **rollback past 0027** leaves the already-installed 0.3.0 module
  sending fields a pre-0027 `.strict()` `AuthMeta` rejects — handshake fails bucketed as `bad-key`
  (`bridge.ts:161-171`), which reads like a key leak, not skew. Accepted (strictness kept
  deliberately); recovery = reinstall the matching module zip (served by whatever server version
  is live) + GM F5. Recorded here so an incident responder recognizes the signature.
- **The linguist-commit timer** sweeps staged files — keep a clean index during commits
  ([[pipeline-reorder-0021]]).

## Adversarial completeness pass

- *"The headless session IS a GM — did we just widen portal's blast radius?"* — No new capability:
  the bridge was already a full-GM surface when Josh's tab was open; this changes *availability*
  (24/7), not *authority*. All 0026 gates (writes toggle, macro setting, stamp-gated deletes,
  caps, audit) apply identically to the headless connection. The stakeholder chose 24/7
  availability knowingly — it's the project goal. ✓
- *"Can the supervisor wedge the GM's maintenance?"* — D27-1/D27-6/D27-11 are all shaped around
  exactly this: never touch `/setup`, `world-down` is healthy-idle, no restart-loop. S2 asserts
  zero login attempts in `world-down`; D's live gate re-proves it. ✓
- *"What if the module setting is empty after deploy?"* — Any-GM behavior: the headless session
  dials, and if Josh also has a tab open they oscillate — i.e. the pre-0027 world, not a new
  failure. C's gate requires the setting set; the RESUME/memory records it as an operational
  requirement. ✓
- *"AuthMeta is `.strict()` — do optional fields break old/new skew?"* — Old-module → new-server
  is safe (fields optional; S1 tests it). New-module → old-server CAN happen despite the module
  zip being served by the server: Foundry keeps its locally-installed copy across server
  **rollbacks** (no re-fetch until someone clicks Update). Not airtight — downgraded from ✓ to an
  accepted, documented risk (see Risks: rollback skew, with the `bad-key` signature + recovery). ⚠
- *"Password in the page: can Playwright leak it?"* — It's typed/POSTed inside the page (same as a
  human), never logged (S2 asserts), no screenshots (D27-14), health/telemetry carry states and
  counters only. Residual exposure = the SOPS env var in the container, identical to every other
  astra secret. ✓
- *"Does the headless user disturb the game?"* — It appears in the user list as a logged-in GM
  (cosmetic, stakeholder aware); it never moves tokens/scenes on its own (the supervisor only
  logs in and idles — every action is an MCP call that was previously possible from Josh's tab,
  fully audited). `core.noCanvas` is client-local and invisible to other users. ✓
- *"btl.iridi.cc edge dependency: Caddy down → what?"* — Supervisor sees nav errors → `broken` →
  bounded relaunch/backoff loop; recovers when the edge does. Same blast radius as a human
  browser. ✓
- *"felddy image upgrade / world migration?"* — Out of scope by D27-1 (stakeholder's stack); the
  supervisor's coarse classifier + health surfacing means a surprise upgrade shows up as
  `not-in-world`, not silent wrongness. ✓

## Hand-off

Implement via `octo:embrace`, slice by slice, one CI-green Conventional Commit per slice
(`feat(portal): 0027 S<N> — …`), push per slice. S1–S3 need no live Foundry. S4 is a coordinated
session with the stakeholder (account, SOPS, `options.json`, setting + F5, "deploy it" for
`just up`, then A–G). The builder must read the scope doc §2 before writing code, honor the
classifier gates recorded in [[portal-authoring-0026-gotchas]] (deploy phrasing, `/mcp` snapshot,
docker-as-root for root-owned files), and flag every live/host-mutating step at the point of
execution ([[flag-paid-live-actions]]).
