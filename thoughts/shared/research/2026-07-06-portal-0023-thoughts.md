---
date: 2026-07-06
subsystem: portal
number: "0023"
stage: scope
status: verified
author: Claude (orchestrator) + sonnet research fan-out
verified_against:
  - "live Foundry container `foundry_faerrin` (felddy/foundryvtt:13.351)"
  - "pf2e system 7.12.2, world `faerrin`, packs on disk"
  - "astra apps/orator-backend (the TS service template)"
  - "reference MCP: adambdooley/foundry-vtt-mcp (MIT), Zorgonaute84/FoundryVTT-mcp-server-Plugin"
supersedes: []
---

# portal (0023) — an MCP for the FoundryVTT campaign instance

## 0. Purpose & verdict

**portal** is a new astra subsystem: a **Model Context Protocol (MCP) server** that lets an
LLM client search and mutate a running **FoundryVTT** world — search the compendium + imported
entities for context, and create entities (import statblocks, drop tokens, add items/journals).

**Feasibility verdict: GREEN, no blockers.** This is a well-trodden path — there are ≥4 working
FoundryVTT MCP servers on GitHub, two verified against our exact Foundry major (v13). The reference
implementation (`adambdooley/foundry-vtt-mcp`, MIT, verified v13–14, pf2e-aware) validates the
architecture end-to-end. The only concentrated engineering cost — **correct pf2e creates** — has a
settled answer: **clone-from-compendium, never hand-built schemas** (§5).

This is a **scope doc** (gate 1 of 3). It locks the architecture, verifies every load-bearing claim
against the real repos/instance, resolves the design forks, and leaves a short list of items for the
**spec** (gate 2, via `octo:spec`) to nail down. It does **not** write code.

---

## 1. The target instance (verified on the live host)

Inspected `foundry_faerrin` directly (`docker exec` / `docker inspect`):

| Fact | Value | Source |
|---|---|---|
| Image | `felddy/foundryvtt:13.351` | `docker inspect .Config.Image` |
| Core version | **13.351** | `FOUNDRY_VERSION` env + `world.json coreVersion` |
| System | **pf2e 7.12.2** | `/data/Data/systems/pf2e/system.json` (`minimum 13.348, verified 13.351`) |
| World | `faerrin` — "Faerrin", `system: pf2e`, `systemVersion 7.12.2` | `/data/Data/worlds/faerrin/world.json` |
| Public host | **`https://btl.iridi.cc`** | `FOUNDRY_HOSTNAME` / `FOUNDRY_LOCAL_HOSTNAME` |
| Ports | `0.0.0.0:30001 -> 30000/tcp` | `docker ps` |
| Compose project | `apps` at `/emerald/data/apps/docker-compose.yaml`, network **`apps-network`** (172.21.0.2) | compose labels |
| Currently active world | **`null`** (Foundry idle at /setup; `lastPlayed` Mon Jul 06 2026) | `/data/Config/options.json` |

pf2e version mapping confirmed: **pf2e 7.x ↔ Foundry v13** (pf2e 6.x→v12, 8.x→v14). We target the
**7.x line** exactly as installed (7.12.2).

**pf2e compendium packs present on disk** (relevant subset, `ls .../systems/pf2e/packs/`):
`pathfinder-monster-core`, `pathfinder-monster-core-2`, `pathfinder-npc-core` (NPC Core),
`pathfinder-bestiary`, `-bestiary-2`, `-bestiary-3`, `npc-gallery`, `hazards`, plus content packs
`equipment`, `spells` (SRD), `feats`, `actions`, `conditions`, `ancestries`, `heritages`, `classes`,
`backgrounds`, `deities`, `bestiary-ability-glossary-srd`, and the `*-effects` packs. These are the
sources portal's `search` + `import` tools read (addressed as `game.packs.get("pf2e.<name>")`).

### 1.1 The two operational constraints (verified, non-negotiable)

1. **Liveness.** The bridge only works while the **world is launched and a GM is connected in a
   browser**. Right now `options.json world=null` — Foundry sits on the setup screen and *nothing*
   portal offers would work until the GM opens "Faerrin". There is no headless "always-on Foundry
   API"; this is inherent to Foundry, not a portal limitation. Design + docs must make this explicit,
   and portal's health/status must report "no Foundry module connected" cleanly (return a typed
   "bridge offline" error to the MCP client, never hang).
2. **Creates are system-versioned.** A fabricated pf2e `system.*` payload is schema-versionless
   (`system._migration.version` absent) and fragile across pf2e's frequent migrations. Clone-from-
   compendium sidesteps this entirely (§5).

### 1.2 Security note (out of scope, but recorded)

The `foundry_faerrin` container carries `FOUNDRY_ADMIN_KEY` and `FOUNDRY_PASSWORD` in **plaintext
env**. Not portal's job to fix, and portal never uses them (it reaches Foundry only through the
module the browser loads, never Foundry's admin/REST API). portal's **own** bridge secret goes
through SOPS per astra convention (§7). Flagged for the owner's awareness.

---

## 2. Architecture

FoundryVTT ships **no native external API** for world data (it's Express + socket.io; the community
confirms "it lacks a native API for external integrations"). Every integration path requires code
running *inside a live world*. We build that code ourselves — a **custom astra-owned Foundry module**
(the decision, §8) — bridging out to the portal MCP server.

```
  MCP client (Claude, etc.)
        │  Streamable-HTTP (POST/GET /mcp)          ← stolen from the Zorgonaute variant;
        ▼                                             fits astra's Compose-behind-Caddy edge
  apps/portal/server        ── TS MCP server, Compose unit, @astra/observe + @astra/config
        │  WebSocket  (wss://portal.iridi.cc/ws)    ← the MODULE dials OUT to here, from the
        ▼                                             GM's BROWSER, over the public internet
  apps/portal/module        ── Foundry ESM package, loaded in the "Faerrin" world
        │  CONFIG.queries["portal.<method>"] handlers → Foundry v13 Document API, as GM
        ▼
  FoundryVTT 13.351 + pf2e 7.12.2  (world "Faerrin")
```

### 2.1 The corrected networking insight (matters for the spec)

The Foundry module is **client-side JS running in the GM's browser tab**. When it "dials out" to
portal, that WebSocket originates **from the browser over the public internet**, *not*
container-to-container. Consequences:

- portal **must expose a public `wss://` endpoint** behind Caddy (`portal.iridi.cc`). The two-hop
  API-key auth (§6) therefore does **real** work — it is not optional.
- portal **never connects to Foundry directly.** All world interaction flows back through the WS the
  module opened. Foundry's own port/network (`30001` / `apps-network`) is **irrelevant** to portal.
- "Same host as astra" gives us operational simplicity (one box, low latency) but **no network
  shortcut** for the bridge — it's a browser client either way. (This corrects an earlier assumption
  that same-host meant an internal Docker path.)

### 2.2 Why we diverge from the reference's topology

adambdooley uses a **stdio wrapper → TCP backend → WS** three-process desktop topology (Claude
Desktop spawns a local stdio server). That exists for a single-machine desktop install and is wrong
for us. We collapse to **one server process** exposing **Streamable-HTTP** (a URL the MCP client
connects to) + the WS server the module dials — the natural shape for a `restart: unless-stopped`
Compose service behind Caddy. Caddy already proves SSE/stream proxying (the orator `@sse` matcher
with `flush_interval -1`, verified in `sites.caddyfile`).

---

## 3. The bridge protocol (ported from adambdooley, hardened with Zorgonaute's auth)

Both references converge on a **bespoke, correlation-ID envelope** over the module→server WebSocket
(near-identical between the two repos):

```jsonc
// server → module (request)
{ "type": "mcp-query",    "id": "query-<n>", "data": { "method": "portal.searchCompendium", "data": {…} } }
// module → server (response)
{ "type": "mcp-response", "id": "query-<n>", "data": { "success": true,  "data": <result> } }
{ "type": "mcp-response", "id": "query-<n>", "data": { "success": false, "error": "<msg>" } }
// heartbeat both ways: { "type": "ping" } / { "type": "pong" }
```

Design points (verified against adambdooley source + Zorgonaute source):

- **The module is the WS client and dials out**; portal runs the WS server. First authenticated
  socket becomes "the Foundry connection." Pending requests tracked in a `Map<id, {resolve,reject,
  timeout}>` with a timeout (reference uses 10s) so a dead world surfaces as an error, not a hang.
- **Envelope is bespoke, not JSON-RPC** internally — but the *outward* MCP surface (client ↔ portal)
  IS proper MCP over Streamable-HTTP via `@modelcontextprotocol/sdk`. Two protocols, cleanly split:
  MCP outward, the `{type,id,data}` envelope inward.
- **Auth = two-hop** (Zorgonaute's model, closing adambdooley's *no-auth* gap):
  1. MCP client → portal `/mcp`: a bearer/key check.
  2. Module → portal `/ws`: an `{ "type":"auth", "apiKey":"…" }` handshake on open; reject the
     socket if it doesn't match. Both keys resolved from SOPS (§7).
- Reference uses a WebRTC path for the *remote/HTTPS* case (P2P, avoids server SSL). **We don't need
  it** — Caddy already terminates TLS and gives us `wss://`, so plain authenticated WSS suffices.
  Recorded as explicitly out of scope for v1.

---

## 4. In-world execution (how the module acts as GM)

Verified from `adambdooley/.../foundry-module/src/{queries,data-access}.ts`:

- **No socketlib.** The module runs in the **GM's own browser session** with the GM's privileges. A
  hard gate `if (!game.user?.isGM) return { allowed:false }` fronts every op.
- **Dispatch via Foundry v13's `CONFIG.queries` registry**, keyed `"<module-id>.<method>"`. On an
  `mcp-query`, the module looks up `CONFIG.queries[data.method]` and invokes it. (This is the v13+
  mechanism; it's why the module needs Foundry ≥13 — matches our 13.351.)
- **Document API calls** (all inherited from `foundry.documents.*`, verified against the v13 API):
  - Actors: `Actor.create(data)` / `Actor.createDocuments([data], op)`.
  - Embedded on actors: `actor.createEmbeddedDocuments("Item", [...])`.
  - Tokens on the active scene: `scene.createEmbeddedDocuments("Token", [tokenData])`
    (equivalently `TokenDocument.create(data, { parent: scene })`).
  - Journals: `JournalEntry.create(...)` + `journal.createEmbeddedDocuments("JournalEntryPage",…)`.
  - v13 deprecation note: bare globals (`Actor`, `game.actors`) still work but warn (removal v15);
    forward-safe form is `foundry.documents.Actor` / `getDocumentClass("Actor")`. Spec should pick
    the forward-safe form to avoid the v15 cliff.

---

## 5. The create strategy: clone-from-compendium (the crux)

This is the single most important design decision, and it is **settled by evidence**, not preference.

**pf2e `system.*` schemas are large, interdependent, and volatile.** Verified: the pf2e repo carries
hundreds of numbered migrations under `src/module/migration/migrations/`, every document stores
`system._migration.version`, and the world tracks `worldSchemaVersion` vs
`MigrationRunnerBase.LATEST_SCHEMA_VERSION`. A hand-built payload is versionless → flagged for
migration, mis-shaped, or silently defaulted. A correct NPC additionally needs its strikes/actions/
spells as **embedded Items** (`melee`, `action`, `spell`, `spellcastingEntry`) with rule-elements —
impractical to synthesize.

**The robust pattern (what real pf2e tooling and the reference both do):** find a compendium document
and **clone it**. Compendium docs ship at the current schema version and migrate on import.

The verified end-to-end sequence for "drop a pf2e goblin as a token on the current scene":

```js
// 1. locate (no native cross-pack search — iterate/merge; see §6 read tools)
const pack  = game.packs.get("pf2e.pathfinder-monster-core");
const idx   = await pack.getIndex();
const entry = idx.find(e => e.name === "Goblin Warrior");   // or pack.search({query})
// 2. fetch the full compendium Actor (embedded items included)
const src   = (await pack.getDocument(entry._id)).toObject();
// 3. import into the world → schema-current world Actor
const [actor] = await Actor.createDocuments([src]);
// 4. derive a token from the actor's prototype, place on the active scene
const scene = game.scenes.active;                            // == canvas.scene
const td    = await actor.getTokenDocument({ x, y });        // merges actor.prototypeToken
await scene.createEmbeddedDocuments("Token", [td.toObject()]);
```

Notably, **adambdooley itself has no from-scratch pf2e builder** — its pf2e support is read/search +
this clone path. So v1 portal does the same: **no hand-authored pf2e schemas at all.** (A `dnd5e-
create-npc`-style curated builder is a possible *future* per-system feature, explicitly out of scope.)

For **items**, same principle: import from `pf2e.equipment` / `pf2e.spells-srd` / `pf2e.feats` by
name/id, optionally attach to an actor via `createEmbeddedDocuments("Item", …)`.

---

## 6. v1 tool surface

All mechanisms verified against the v13 API / pf2e packs. Reads are system-agnostic; the one
write with pf2e specificity (`import-from-compendium`) is handled by the clone path (§5), so it too
carries no hardcoded pf2e schema.

| MCP tool | Kind | Mechanism (in-module) |
|---|---|---|
| `search-compendium` | read | iterate `game.packs` (filter by `metadata.type`), `pack.getIndex({fields})` + per-pack `pack.search({query})`, merge + rank. **No native cross-pack search** — we build it. |
| `list-compendium-packs` | read | `Array.from(game.packs.values()).map(...)` |
| `get-document` (by uuid/id) | read | `pack.getDocument(id)` / `fromUuid(uuid)` / `game.actors.get(id)` |
| `search-world` (actors/items/journals) | read | `game.actors`/`game.items`/`game.journal` `WorldCollection.search({query,filters})` + folder walk (`game.folders`, `folder.contents/children`) |
| `list-scenes` / `get-current-scene` | read | `game.scenes`, `game.scenes.active` |
| `import-from-compendium` | write | `pack.getDocument(id).toObject()` → `Actor/Item.createDocuments([...])` (§5) |
| `create-token` | write | `actor.getTokenDocument({x,y})` → `scene.createEmbeddedDocuments("Token",[…])` |
| `create-journal` | write | `JournalEntry.create(...)` (+ pages) |

**Write gating (all three of):** the module-level `allow-write-operations` setting (default —
proposed **off**, safer than the reference's default-on; spec to confirm) **AND** `game.user.isGM`
**AND** a valid bridge API key. A per-request cap (reference uses `maxActorsPerRequest=10`) guards
runaway creates.

**Deferred to a later slice / out of v1 scope** (recorded so we don't silently cut): rolls
(`/roll`), combat/encounter control, token movement/conditions, delete operations, map generation,
per-system curated NPC builders, WebRTC transport. v1 is **search + read + create** (the user's
stated minimum), nothing more.

---

## 7. astra integration (verified against the orator-backend template)

portal follows the **orator-backend** pattern (the closest analogue: a Node backend service behind
Caddy, not a frontend). Concrete wiring, quoting the real files I read:

### 7.1 Layout — `apps/portal/{server,module,shared}` (the chosen structure, §8)

```
apps/portal/
  server/     package.json (@astra/portal-server)  — the MCP+WS server (pnpm member)
  module/     package.json (@astra/portal-module)  — the Foundry ESM package (pnpm member)
  shared/     package.json (@astra/portal-shared)  — the bridge envelope Zod types, imported by both
  Dockerfile  — builds server/ only (the module is not a runtime service; see 7.5)
```

- **server** mirrors `apps/orator-backend/package.json`: `"type":"module"`, `start` =
  `node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs src/index.ts` (run TS directly, no
  build step for the server), `typecheck` = `tsc --noEmit`, `test` = `vitest run`. Deps:
  `@astra/config`, `@astra/observe`, `@astra/portal-shared` (`workspace:*`),
  `@modelcontextprotocol/sdk`, `ws`, `srvx` or `@modelcontextprotocol/sdk`'s HTTP transport,
  `@opentelemetry/api`. **No** React/Vite/Tailwind (portal has no UI).
- **module** is a **browser ESM** Foundry package — neither a Node service nor a Dagster asset. It
  builds to `dist/main.js` via **tsdown or vite (lib mode)**, referenced from a `module.json`
  (`compatibility.minimum:"13"`, `esmodules:["dist/main.js"]`, `socket:true`). It is a pnpm member
  only so `tsc`/`vitest`/`oxlint` see it and it can import `@astra/portal-shared`; it is **not**
  containerized (§7.5). Spec to decide the exact bundler (lean tsdown — already in the repo post-0022
  S14) and whether the built `dist/main.js` is committed or built at install-into-Foundry time.
- **shared** holds the bridge envelope Zod schemas (`mcp-query`/`mcp-response`) imported by both
  sides — mirrors adambdooley's `shared/src/schemas.ts`. A TS lib needs ≥1 test or `vitest` reds CI
  (per [[strider-0016-gotchas]]).

**Membership gotcha:** uv globs `apps/*`; a glob-matched dir *without* a `pyproject.toml` is a hard
uv error, but a dir **with** only `package.json` is silently ignored by uv and claimed by pnpm.
Since `apps/portal/` itself has no manifest (only its subdirs do), confirm uv doesn't choke on the
bare parent — precedent: pnpm ignores manifest-less dirs, and uv only errors on glob-matched dirs it
*expects* to own. **Spec action:** verify `apps/portal/` (no manifest) + `apps/portal/server`
(`package.json`) does not trip `uv sync` before committing the skeleton. If it does, the subdirs must
be the glob targets — but `apps/*` only matches one level, so `apps/portal/server` is *not*
glob-matched by either lane's `apps/*`. **This is the one real structural risk of the nested layout**
(see §8/§9).

### 7.2 Config block (config.kdl) — new `portal { }`

Modeled on the verified `orator { }` block:

```kdl
portal {
    // The MCP server binds this port; behind Caddy at portal.iridi.cc → host 10372.
    port 10372
    public-origin "https://portal.iridi.cc"
    service-name "astra.portal"
    // The Foundry world/host this bridges (informational; the module dials us, not vice-versa).
    foundry-origin "https://btl.iridi.cc"
    // Two-hop bridge auth (SOPS refs; see deploy/sops).
    mcp-api-key ref="sops:portal_mcp_api_key"       // MCP client → server
    bridge-api-key ref="sops:portal_bridge_api_key" // Foundry module → server
    // Safety: writes off unless explicitly enabled.
    allow-write-operations #false
    max-creates-per-request 10
}
```

### 7.3 Config schema — mirror in BOTH lanes (verified pattern)

The Pydantic (`libs/py/config/.../models.py`) and Zod (`libs/ts/config/src/config.ts`) schemas are
kept in lockstep (both `.strict()`/`extra="forbid"` — a mistyped KDL key is a loud error). Add:
- **Zod** `const Portal = z.object({ port: z.number().default(10372), publicOrigin: …,
  serviceName: …, foundryOrigin: …, mcpApiKey: secret(), bridgeApiKey: secret(),
  allowWriteOperations: z.boolean().default(false), maxCreatesPerRequest: z.number().default(10)
  }).strict();` + register `portal: Portal.default(() => Portal.parse({}))` on the root Config
  (alongside line 244's `orator:`).
- **Pydantic** the mirror `class PortalConfig(_Base)` + `portal: PortalConfig = Field(default_factory
  =PortalConfig)`. (Strictly only the TS side is *read* by portal, but the repo mirrors both — and
  the py smoke test parses the same config.kdl, so an unmirrored `portal {}` block would fail
  `extra="forbid"` on the Python side. **Both are mandatory.**)

### 7.4 Secrets (SOPS) — verified `just up` env-injection

Two new keys in `deploy/sops/secrets.enc.yaml`: `portal_mcp_api_key`, `portal_bridge_api_key`.
`just up` (verified) decrypts on the host and exports each **UPPER_CASED**
(`export "${k^^}=$v"`), and config's env-override resolves it in-container. So the compose service's
`environment:` block lists `PORTAL_MCP_API_KEY: ${PORTAL_MCP_API_KEY:-}` and
`PORTAL_BRIDGE_API_KEY: ${PORTAL_BRIDGE_API_KEY:-}`. The **module** also needs the bridge key — but
the module runs in the browser, so its key is configured as a **Foundry module setting** (entered
once in the world's module config), not via SOPS. Spec to note this asymmetry.

### 7.5 Deploy — Compose unit behind Caddy (verified against orator)

- **Dockerfile** (`apps/portal/Dockerfile`): copy orator's two-stage `node:24-slim` pattern, build
  context = **repo root** (workspace `:*` deps). **Ripple (verified gotcha, orator Dockerfile
  L27-39):** every service Dockerfile COPYs the full set of workspace `package.json`s so the shared
  `pnpm-lock.yaml` reconciles — **adding portal's members means adding
  `COPY apps/portal/server/package.json apps/portal/server/` (+ module/shared) to portal's Dockerfile
  AND the manifest list in every other service Dockerfile**, or their `--frozen-lockfile` reads
  "lockfile changed." The runtime stage `COPY ontology/ontology-config` so `loadConfig()` finds
  config.kdl (orator L81). portal's Dockerfile builds `server/` only; the Foundry `module/dist` is
  **not** shipped in any container — it's installed into Foundry separately (§7.6).
- **Compose service** in `deploy/docker-compose.yml`: `build.context: ..`,
  `dockerfile: apps/portal/Dockerfile`, `image: astra-portal:local`, `user: "1000:1000"`,
  `networks: [signoz-net]`, `ports: ["10372:10372"]`, `restart: unless-stopped`, a `node -e fetch`
  healthcheck, and the two `environment:` keys. No DB, no volume (portal is stateless — it holds no
  world data; the compendium index, if we precompute one à la the reference's "enhanced creature
  index", lives in **Foundry world flags** on the module side, not in portal).
- **Port 10372** — verified next free in the 10350–10399 band (highest assigned is heartwood 10371).
- **Caddy** (`sites.caddyfile`): a `portal.iridi.cc { import astra_site; reverse_proxy localhost:10372 }`
  block, copying orator's `@sse`/`flush_interval -1` matcher for the `/ws` upgrade + the `/mcp`
  stream so events aren't buffered. `just caddy-reload`. `*.iridi.cc` is a Cloudflare wildcard, so
  `portal.iridi.cc` should resolve + mint a cert with **no manual DNS** ([[ledger-0018-gotchas]]).

### 7.6 Installing the module into Foundry (operational, not CI)

The GM installs `portal-module` into the "Faerrin" world once (drop the built `module/` into
`/data/Data/modules/portal/` on the `foundry_faerrin` container, or serve a manifest URL), enables it
in the world, and sets the bridge API key + `portal.iridi.cc` WS URL in the module's settings. This
is a documented manual step (like enabling any Foundry module); it is **not** part of `just up`.
Spec to write the install recipe (`just portal-module-install`?) and decide committed-`dist` vs
build-on-install.

### 7.7 Telemetry (principle #1 — verified template)

`server/src/index.ts` first statement: `const telemetry = initTelemetry("astra.portal");` then
`loadConfig()` (mirrors orator L14/L43). Every MCP tool call and bridge round-trip gets a span;
metrics via `@astra/observe` **`lazyCounter`/`lazyHistogram`** (NEVER module-scope
`getMeter().createCounter()` — the [[telemetry-coverage-pass]] permanent-no-op gotcha). The **module**
can't reach SigNoz's in-cluster collector from the browser; if we want module-side telemetry it goes
to the public OTLP `otel.iridi.cc` best-effort (the orator-controller precedent) — spec to decide;
likely v1 emits module diagnostics back over the bridge as log events instead.

---

## 8. Decisions resolved (this scope)

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| D1 | Bridge architecture | **Custom astra-owned Foundry module** (not the ThreeHats relay, not raw socket.io) | User choice; most control, fully self-hosted, no third-party relay/data egress. adambdooley proves the pattern. |
| D2 | Target Foundry/system | **v13.351 + pf2e 7.12.2**, world "Faerrin" | Verified on the live instance. |
| D3 | MCP server language | **TypeScript** | astra's Python is Dagster-only; every long-running service is a TS Node Compose unit. orator-backend is the template. |
| D4 | MCP transport | **Streamable-HTTP** (+ the WS the module dials) | Fits Compose-behind-Caddy; Zorgonaute's model. Reference's stdio-wrapper topology rejected. |
| D5 | Create strategy | **Clone-from-compendium only; no hand-built pf2e schemas** | pf2e schema volatility + embedded-item complexity; reference itself has no pf2e builder. |
| D6 | Auth | **Two-hop API key** (client→server, module→server), SOPS-resolved | Closes the reference's no-auth gap; the public `wss://` makes it mandatory. |
| D7 | Repo layout | **`apps/portal/{server,module,shared}`** | User choice (one subsystem, one dir). Shared bridge types between the two sides. **Risk flagged in §9.** |
| D8 | Write default | Proposed **off** (`allow-write-operations #false`) | Safer than the reference's default-on; spec confirms. |
| D9 | WebRTC transport | **Out of scope** | Caddy gives us `wss://`; P2P/SSL-avoidance is the reference's desktop concern, not ours. |

---

## 9. Open items for the SPEC (gate 2) — resolve before `octo:embrace`

1. **Nested-member viability (the one real structural risk of D7).** `apps/*` globs match one level,
   so `apps/portal/server` is **not** matched by either lane's `apps/*` glob — meaning pnpm/uv would
   **not** discover the nested members at all. Two fixes to evaluate in the spec:
   (a) add `apps/portal/*` to `pnpm-workspace.yaml` packages (and confirm uv is unaffected since none
   carry `pyproject.toml`); or (b) flatten to `apps/portal-server` + `apps/portal-module` +
   `apps/portal-shared` siblings (the rejected §8-D7 alt) if nesting proves to fight the toolchain.
   **This must be settled first — it gates the skeleton.** (Recommend (a); verify with a throwaway
   `pnpm install` + `uv sync` before committing.)
2. **Module bundler + dist handling** — tsdown vs vite lib-mode for `module/dist/main.js`; commit the
   built artifact or build-on-install. (Lean tsdown, build-on-install via a `just` recipe.)
3. **Compendium search ranking + optional precomputed index.** Do we ship the reference's "enhanced
   creature index" (precompute stats → world flags, pack-fingerprint invalidation) in v1, or start
   with live `getIndex`/`search` iteration and add the cache later? (Lean: live-iterate v1, note the
   cache as a fast-follow.)
4. **`import-from-compendium` linked vs unlinked tokens** — import to `game.actors` then tokenize
   (linked, robust) vs a throwaway unlinked token from the compendium object. (Lean: import-then-
   tokenize per §5.)
5. **Write-gate confirmation** — default-off + per-request cap + is a per-tool ACL wanted (reference
   has only one coarse boolean)?
6. **MCP client identity** — which client(s) consume portal (Claude Desktop? Claude Code? a custom
   agent?), and does that change the `/mcp` auth (bearer vs per-client scoped keys)?
7. **Module-side telemetry** — best-effort `otel.iridi.cc` vs bridge-forwarded log events vs none.
8. **Verify the exact pf2e 7.x `system` shapes** the clone path round-trips for our common cases
   (import an NPC-Core creature, an equipment item) against a live launched world — a spec pre-flight
   once "Faerrin" is opened.

---

## 10. Risks

- **Liveness (highest).** Nothing works unless the GM has the world open. Mitigate with a clear
  "bridge offline" typed error + a portal status tool; document the constraint prominently.
- **pf2e schema drift.** Mitigated by D5 (clone-from-compendium migrates on import). Hand-built
  payloads are explicitly banned.
- **v13→v15 deprecations.** Use forward-safe `foundry.documents.*` / `getDocumentClass` in the module.
- **Nested pnpm members (§9.1).** The one thing that could force a layout change; verified-before-
  commit gates it.
- **Public write surface.** An LLM with create/delete on a live campaign world is a real blast
  radius — default-off writes + GM gate + API key + per-request cap + (spec) audit logging.
- **Dockerfile manifest ripple.** Adding portal's members touches every service Dockerfile's COPY
  list (verified gotcha); miss one and CI reds on `--frozen-lockfile`.

---

## 11. Prior art (cited)

- **adambdooley/foundry-vtt-mcp** (MIT, verified Foundry v13–14, pf2e read/search) — the reference
  architecture: custom module + MCP server, `CONFIG.queries` in-world exec, clone-from-compendium,
  `SystemAdapter` registry, enhanced-index cache. `github.com/adambdooley/foundry-vtt-mcp`.
- **Zorgonaute84/FoundryVTT-mcp-server-Plugin** (v13+) — the Streamable-HTTP MCP transport + two-hop
  API-key auth we adopt. `github.com/Zorgonaute84/FoundryVTT-mcp-server-Plugin`.
- **laurigates/foundryvtt-mcp**, **TheStranjer/foundry-vtt-mcp** — alternative (direct socket.io)
  approaches, rejected as brittle.
- Foundry v13 API: `foundryvtt.com/api/v13/` (Actor/Item/TokenDocument/CompendiumCollection).
- pf2e system: `github.com/foundryvtt/pf2e` (actor/item data models, migration runner, packs).
- Full source-cited research: the two 0023 fan-out reports (this session's transcript).

---

## 12. Next steps

1. **Spec (gate 2):** `octo:spec` → `thoughts/astra/specs/0023-portal-spec.md`, resolving §9. Start
   by verifying §9.1 (nested members) with a throwaway `pnpm install`/`uv sync`.
2. **Implement (gate 3):** `octo:embrace` — telemetry day one, reproduce CI lanes locally, commit per
   CI-green slice, then record load-bearing gotchas in `thoughts/shared/memory/`.
