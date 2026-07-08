---
name: portal-0023-gotchas
description: portal (0023) — the FoundryVTT MCP; COMPLETE — built + deployed + GM-installed + LIVE ACCEPTANCE E/F/G PASSED 2026-07-07; the load-bearing decisions + build/acceptance gotchas
metadata:
  type: project
---

**portal (0023)** — a net-new astra subsystem: a **TypeScript MCP server** + a **custom astra-owned
FoundryVTT module** so an LLM (Claude Code + Claude Desktop) can **search** the pf2e compendium + world
entities and **create** (import statblocks, drop tokens on the active scene, items, journals) against
the live **pf2e "Faerrin"** world. **State 2026-07-07 evening: COMPLETE — all 6 slices built + pushed
(`87f633f`…`18cecff`) + deployed live + the GM installed/configured the module + LIVE ACCEPTANCE E/F/G
PASSED** (all A–H met; spec status header carries the detail). Live-verified through the public edge:
reads (Monster-Core search, full-actor get-document, current scene `engine-heart`, world search), writes
(import Goblin Warrior → token on the active scene tokenCount 7→8 → journal; `cap-exceeded` at 11 vs
cap 10; every write audit-logged with span-linked `portal.audit.*`), SigNoz three signals 0 unexpected
errors. Scope `thoughts/shared/research/2026-07-06-portal-0023-thoughts.md`; spec
`thoughts/astra/specs/0023-portal-spec.md` (6 slices S1–S6, decisions D1–D14; commit map in the header).

**⭐ Live-acceptance gotchas (2026-07-07, found by running the acceptance):**

- **The module dials ONLY on the `ready` hook — no settings `onChange` redial.** After the GM pastes
  WS URL + bridge key into module settings, the bridge stays offline until the GM **reloads the Foundry
  page (F5)**. Symptom: settings look right, `bridge-status` says `{"connected":false}`, portal logs
  show zero WS attempts.
- **`search-compendium`'s `type` param means pack `metadata.type` (`"Actor"`/`"Item"`/`"Scene"`), NOT
  the pf2e subtype (`"npc"`)** — but result rows report `entry.type` = the subtype, and the zod schema
  has no `.describe()`, so an MCP client naturally guesses `"npc"` and silently gets `[]`. Flagged
  fast-follow: add `.describe()` to `type` (and `folder`) in `apps/portal/shared/src/tools.ts`.
- **`import-from-compendium`'s `folder` must name an EXISTING Actor folder** (typed `not-found`
  otherwise — it doesn't create one).
- Negative-path tool calls (cap-exceeded, not-found) surface as `hasError` spans by design — filter
  them out before reading a SigNoz "0-error" check.

**⭐ Build-session gotchas (2026-07-07, found by review/running — not in the spec):**

- **Bridge replace-adopt must clear the prior heartbeat interval** — `#adopt` → `#startHeartbeat()`
  without a `clearInterval` leaks one interval per GM tab reload, and two offset intervals share
  `#awaitingPong`, so a healthy socket gets terminated on ordinary pong latency (`bridge.ts`).
- **Module reconnect backoff resets only after a ≥10s "healthy hold", never on `open`** — the bridge
  sends no auth ack, so open-reset would let a WRONG key hammer the server at ~1/s forever (open →
  reset → instant 1008 policy close → 1s retry). Hold-time reset keeps portal-restart recovery at 1s
  AND lets a bad key climb to the 30s cap (`bridgeClient.ts`, `HEALTHY_HOLD_MS`).
- **The MCP SDK's `registerTool` callback type can't be reduced inside a generic wrapper** — one
  documented `as never` at the single `registerBridgeTool` seam (covered by a real-MCP-client
  round-trip test); SDK `@modelcontextprotocol/sdk@1.29` resolves zod 4.4.3, matching the workspace.
- **`fflate` zips the module package in-process** (no system `zip` in node:24-slim); the zip is built
  lazily at first request + cached, and the zipped `module.json` carries the SAME absolute
  manifest/download URLs as the served one (else Foundry update checks break). `moduleDir` resolves
  `new URL("../../module", import.meta.url)` — identical layout locally and in-image.
- **Repo-wide `pnpm run lint` OOM-flakes on this host** ("Linter process terminated abnormally") —
  `pnpm exec oxlint --type-aware --deny-warnings --threads=4 apps libs/ts` is the reliable form.
- **`apps/heartwood-frontend/src/routeTree.gen.ts` regen-flaps** when the TS lanes run (drops the
  trailing `declare module` block non-deterministically) — `git checkout --` it before committing;
  pre-existing, not portal's.
- **The manifest ripple was 11 sibling Dockerfiles** (all TS services with a Dockerfile;
  orator-controller has none, dagster is py). A new nested member = 3 COPY lines in EVERY one.
- **`vitest run` with zero test files exits 1** → every new member ships ≥1 real test from birth.
- **New-subdomain TLS takes ~60s** after `caddy-reload` (wildcard DNS + ACME mint) — curl exit 35 /
  000 in that window is normal, not a routing bug (same as [[ledger-0018-gotchas]]).

**Feasibility = GREEN.** Foundry ships NO native external API; every integration needs code running
*inside a live world*. Reference impl `adambdooley/foundry-vtt-mcp` (MIT, verified Foundry v13–14,
pf2e-aware) proves the exact pattern; `Zorgonaute84/FoundryVTT-mcp-server-Plugin` contributes the
Streamable-HTTP transport + two-hop API-key auth we adopt.

**The live instance (verified via `docker exec`/`inspect`):** `felddy/foundryvtt:13.351`, **pf2e
7.12.2**, world `faerrin` (`system: pf2e`), public **`https://btl.iridi.cc`**, on Compose project
`apps` (`/emerald/data/apps`) / network `apps-network` — a **separate stack, SAME host** as astra's
`signoz-net`. World currently `null` (idle at /setup). pf2e packs on disk incl.
`pathfinder-monster-core`, `pathfinder-npc-core`, `pathfinder-bestiary(-2/-3)`, `equipment`, `spells`,
`feats`, `conditions`, `npc-gallery`. *(Aside: that container has `FOUNDRY_ADMIN_KEY`/`FOUNDRY_PASSWORD`
in plaintext env — portal never uses them; flagged for rotation.)*

**⭐ THE load-bearing gotchas / locked decisions:**

- **Liveness is THE headline constraint.** Nothing works unless the GM has "Faerrin" **launched in a
  browser** — the module is client-side JS running in the GM's tab. No headless always-on Foundry API.
  portal must surface "bridge offline" as a typed error, never hang. S3–S6 (all the live gates) require
  the GM to launch the world + install the module (a manual, coordinate-with-stakeholder step).

- **The module dials out from the BROWSER over the public internet** — not container-to-container. So
  "same host" gives NO network shortcut: portal MUST expose a public `wss://portal.iridi.cc/ws`, and the
  **two-hop auth is mandatory, not optional.** portal NEVER connects to Foundry directly (all world
  interaction flows back through the WS the module opened) → Foundry's port/network is irrelevant.

- **Creates = CLONE-FROM-COMPENDIUM ONLY (D5, the crux). Zero hand-authored pf2e `system.*` schemas.**
  pf2e schemas are large, interdependent (NPCs need embedded strike/action/spell items), and volatile
  (hundreds of numbered migrations + per-doc `system._migration.version`). A fabricated payload is
  versionless → fragile. Even the reference impl has NO from-scratch pf2e builder. The pattern:
  `pack.getDocument(id).toObject()` → `Actor/Item.createDocuments(...)` (migrates on import) → for a
  token, **import-then-tokenize**: `actor.getTokenDocument({x,y})` → `scene.createEmbeddedDocuments("Token",…)`.

- **THE nested-member fix — EMPIRICALLY PROVEN (was the one gating structural risk).** The chosen
  `apps/portal/{server,module,shared}` layout needs **two** one-line edits, both verified with throwaway
  members: (1) add `- "apps/portal/*"` to `pnpm-workspace.yaml` — pnpm's `apps/*` is **single-level**,
  so nested members are otherwise **undiscovered** (`pnpm -r ls` confirms); (2) add `"apps/portal"` to
  the `[tool.uv.workspace] exclude` in `pyproject.toml` — uv **hard-errors** on the manifest-less
  `apps/portal` parent (`error: Workspace member … is missing a pyproject.toml`), even on `uv sync
  --dry-run`; excluded → uv exits 0. (Same mechanism as every TS app already being uv-excluded.)

- **In-world exec:** the module uses Foundry v13's **`CONFIG.queries["portal.<method>"]` registry** (NOT
  `game.socket`, NOT socketlib), running with the **GM's own privileges** (hard `game.user?.isGM` gate).
  Use forward-safe `foundry.documents.*` / `getDocumentClass` (bare globals warn, removal v15).

- **Write posture (D8, stakeholder-chosen): creates ON by default** — module setting
  `allow-write-operations` defaults **true**, still gated by isGM ∧ bridge-key ∧ `max-creates-per-request`
  (10) + **full audit logging** (the blast-radius mitigation on live campaign data). No delete tools in v1.

- **Install by Manifest URL (D11):** portal-server serves `/module/module.json` (generated at runtime
  with absolute `manifest`/`download` URLs from `cfg.portal.publicOrigin`) + `/module/portal.zip`
  (packaged in the Docker build). Install = *Foundry → Install Module → Manifest URL =
  `https://portal.iridi.cc/module/module.json`*. **Foundry's server fetches it → no CORS.** Caddy gets
  an explicit `handle /module/* { reverse_proxy localhost:10372 }` route (the catch-all would cover it,
  but explicit documents intent). Host file-drop (`just portal-module-install`) is the fallback.

- **astra wiring (mirror the orator-backend template):** TS (astra's Python is Dagster-only; every
  long-running service is a TS Node Compose unit). `initTelemetry("astra.portal")` FIRST;
  `lazyCounter`/`lazyHistogram` metrics ONLY (never module-scope — the [[telemetry-coverage-pass]]
  no-op trap). Config `portal {}` block + **mirrored Pydantic + Zod schema, both lanes** (the py config
  smoke parses the same config.kdl under `extra="forbid"`, so an unmirrored block reds Python CI even
  though only TS reads portal). Two SOPS keys `portal_mcp_api_key` + `portal_bridge_api_key` (injected
  UPPER_CASED by `just up`). Port **10372**. The Dockerfile manifest-COPY ripple hits every sibling TS
  Dockerfile. Module bundler = **tsdown**, dist NOT committed. Deferred (recorded, not cut): rolls/
  combat/movement/delete, per-system curated NPC builders, the precomputed compendium index cache,
  WebRTC, per-client scoped keys, unlinked tokens, browser→OTLP module telemetry.

- **The linguist-commit timer touches the tree mid-session** — this session it produced background
  commits `da8152f`/`5cff55f` (`M dagster/Dockerfile` + today's linguist transcript/timeline files).
  Keep a clean index during portal commits; stage only your files; `systemctl --user stop
  linguist-commit.timer` during manual git. (Same trap as [[pipeline-reorder-0021]].)

Builds on [[config-single-source]] + [[telemetry-built-in]] + [[telemetry-coverage-pass]] +
[[deploy-sops-injection]] + [[deploy-apply-with-just]] + [[deploy-artifacts-run-as-user]] +
[[strider-0016-gotchas]] + [[ledger-0018-gotchas]] + [[verify-before-acting]] + [[no-silent-scope-cuts]].
