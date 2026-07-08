---
name: headless-gm-0027-gotchas
description: headless-gm (0027) — supervised headless-Chromium GM session so portal works with zero human tabs; S1–S3 built+pushed, S4 live gate pending; the load-bearing findings + gotchas
metadata:
  type: project
---

# headless-gm 0027 — S1–S3 BUILT + PUSHED (2026-07-08); ▶ S4 live gate pending

A dedicated Foundry GM account ("Portal") permanently logged in via headless Chromium (Compose
unit `apps/portal/headless`, port 10373) so portal MCP tools work 24/7 tab-free. Scope
`thoughts/shared/research/2026-07-08-headless-gm-0027-thoughts.md` (THE reference: live-host
findings, Foundry v13.351 `/join`+session mechanics read from the live server's own `foundry.mjs`);
spec `thoughts/astra/specs/0027-headless-gm-spec.md` (D27-1..14). S1 `32f509b` (designated dialer +
identity, module 0.3.0) · S2 `f281283` (supervisor service) · S3 `4914111` (container + compose).

## Load-bearing findings (verified, will bite again)

- **Two live GM sessions ping-pong the bridge forever** — server replace-adopts
  (`bridge.ts#adopt` terminates the prior socket), the loser's backoff resets to 1s after a ≥10s
  healthy hold, both dwell >10s → oscillation never self-heals. Fix = the world-scoped
  **`bridge-user-id`** setting (compare `game.user.id` per-session; empty = any-GM/today); NO
  auto-fallback (it reintroduces the race). Re-checked in `dispatchQuery` (new typed
  `not-designated` error) — matters when the GM repoints the setting on an adopted socket sans F5.
- **Foundry NEVER auto-rejoins**: kick (same-user second login) / world shutdown / ≥5s outage all
  land the client back on `/join` (or `/`) with no credential resubmit — the supervisor loop IS
  the product. `/join` is 100% client-rendered (empty `<template id="join-game">`) — a real JS
  runtime is mandatory; login = `POST /join` JSON `{userid, password, action:"join"}` →
  `{redirect}`.
- **`options.json` `"world": null` on the live felddy container** (read directly) — a container
  restart strands at `/setup` today. `FOUNDRY_WORLD` env CANNOT fix it
  (`CONTAINER_PRESERVE_CONFIG=true` never rewrites an existing options.json; upstream felddy#234)
  — the fix is editing `options.json` itself (S4, flagged, root-owned file in Josh's
  `/emerald/data/apps` stack). Auto-launch is boot-time only → "Return to Setup" maintenance is
  untouched; the supervisor never touches `/setup` (world-down = polite backoff-idle, zero login
  attempts — unit + fixture proven).
- **`core.noCanvas` is safe + valuable for headless**: client-scoped localStorage
  (`"core.noCanvas" = "true"`), `Canvas.initialize()` early-returns (no PIXI/WebGL at all); zero
  portal handlers touch `canvas`/`game.scenes.viewed` (all use world-level `game.scenes.active`).
  Seed via `context.addInitScript` on EVERY (re)launch (ephemeral profile).
- **Classify in-world POSITIVELY (`/game`), never by elimination** — the S2 draft classified
  "unknown page, no join form" as in-world, which would idle forever on e.g. `/license` while
  `/health` lies `inWorld: true`. Unknown → `world-down` (safe: keeps re-probing).
- **Health semantics**: `ok` = process-up + browser-connected ONLY; `world-down` is a reported
  state, NOT unhealthy (a restart can't launch a world; a restart-loop during GM maintenance is
  noise). Note `state:"broken"` still has `ok:true` when nav fails but Chromium is alive — by
  design.
- **`page.on("console")` capture → telemetry is the ONLY visibility** into the module's in-page
  warnings (misconfigured `bridge-user-id` logs a console.warn nobody sees in a headless
  container).
- **AuthMeta skew**: old-module→new-server safe (`userId`/`userName` optional); **server ROLLBACK
  past 0027 vs an installed 0.3.0 module fails the `.strict()` handshake bucketed as `bad-key`**
  (looks like a key leak, isn't) — recovery = reinstall the matching module zip + F5.

## Build gotchas

- `game.users` can't reuse `FoundryWorldCollection<T>` (constrained to `FoundryDocumentLike`,
  which `User` doesn't satisfy) → own narrow `FoundryUsersCollection`.
- Mocking a class the module `new`s: `vi.hoisted` + a `function` (not arrow) mock — arrows aren't
  constructable.
- `@astra/config` has **no env override for plain fields** (only `SecretRef.resolve()` reads env)
  — for container tests, bind-mount a modified `config.kdl` read-only over the baked
  `/repo/ontology/ontology-config/config.kdl`.
- Long-lived-tab Chromium needs **`shm_size: "1gb"`** (64MB `/dev/shm` default = renderer OOM;
  vellum-render never hit it because its contexts are per-request).
- The Pydantic config mirror is load-bearing for TS-only services (root `AppConfig`
  `extra="forbid"` — an unmirrored kdl block breaks Python config loading outright).
- The TS-Dockerfile manifest-COPY ripple is now **13** files (every sibling + the new one).

## ▶ S4 checklist (live gate — Josh at the table)

(1) create user "Portal" (Gamemaster) in-world; (2) `sops set foundry_portal_gm_password`;
(3) the flagged `options.json` `"world":"faerrin"` edit (docker-as-root); (4) set module
`bridge-user-id` to Portal's id + F5 Josh's tab; (5) "deploy it" → `just up` + GM module update
(0.3.0) + F5; (6) exit gate A–H: zero-tab tool calls, `bridge-status` `userName:"Portal"`,
no-oscillation with Josh's tab open, `docker restart` resilience, Return-to-Setup politeness,
noCanvas smoke (get-current-scene/create-token/create-light), **≥24h soak**. Foundry-container
bounce to prove auto-launch ONLY with Josh's explicit approval. Driver DOM selectors
(`select[name=userid]` etc.) are best-effort — verify at S4 (the network contract is
source-proven, the markup isn't).

⚠️ Incidental pre-existing find (surfaced 2026-07-08, NOT 0027): host Caddy admin API
`localhost:2019` unauthenticated, serves full config incl. a plaintext Cloudflare DNS token.

Builds on [[portal-0023-gotchas]] + [[portal-oauth-0025-gotchas]] +
[[portal-authoring-0026-gotchas]] + [[deploy-artifacts-run-as-user]] + [[config-single-source]] +
[[telemetry-coverage-pass]] + [[flag-paid-live-actions]].
