# NLSpec 0023 — portal: an MCP for the FoundryVTT campaign instance

**Status:** COMPLETE — ALL ACCEPTANCE A–H MET (2026-07-07) — all 6 slices CI-green + pushed (`87f633f` S1 ·
  `f015063` S2 · `a498a35` S3 · `1023381` S4 · `d554527` S5 · `18cecff` S6); deployed via `just up` +
  `just caddy-reload`, live-verified at `portal.iridi.cc`. **Live acceptance closed 2026-07-07 evening**
  after the GM installed + configured the module in the launched "Faerrin" world: E (search-compendium
  Monster-Core goblin hits, get-document full 18.5 KB actor, get-current-scene `engine-heart`,
  search-world), F (import Goblin Warrior → token drop on the active scene (tokenCount 7→8) → journal
  create; `cap-exceeded` rejection at quantity 11 vs cap 10; every write audit-logged ok/denied with
  span-linked `portal.audit.*` attrs), G (the full search→import→token loop driven by a Claude client
  through the public edge; SigNoz traces+logs+metrics flowing, 0 unexpected errors). Two
  orchestrator-review hardenings beyond the spec text: heartbeat-interval cleanup on replace-adopt;
  healthy-hold (≥10s) backoff reset in the module reconnect. Fast-follow flagged (not built): the
  `search-compendium` `type` param means pack `metadata.type` (`"Actor"`) but the zod schema carries no
  `.describe()`, so an MCP client guesses `"npc"` and gets `[]`; same for `folder` (must pre-exist).
**Scope doc:** `thoughts/shared/research/2026-07-06-portal-0023-thoughts.md` (verified against the live
  `foundry_faerrin` container + the astra orator-backend template). This spec resolves scope §9 open
  items (§9.1 empirically; §9.6 + write posture via stakeholder decision; the rest by default below).
**Date:** 2026-07-06 · **Subsystem slug:** `portal` · **Phase:** net-new subsystem (post-migration)
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`.
**Honors memory:** [[verify-before-acting]], [[no-silent-scope-cuts]], [[resolve-open-questions-before-next-stage]],
  [[no-ci-monitoring]], [[deploy-apply-with-just]], [[deploy-sops-injection]], [[deploy-artifacts-run-as-user]],
  [[config-single-source]], [[telemetry-built-in]], [[telemetry-coverage-pass]], [[strider-0016-gotchas]],
  [[ledger-0018-gotchas]].

## Goal

Ship **portal**: a TypeScript **MCP server** (Streamable-HTTP, a Compose unit behind Caddy at
`portal.iridi.cc`) plus a **custom astra-owned FoundryVTT module** that dials out to it, so an LLM
client (Claude Code + Claude Desktop) can, against the live **pf2e "Faerrin"** world:

1. **Search + read** — the pf2e compendium (bestiaries, equipment, spells, feats) and imported world
   entities (actors, items, journals, scenes), for context.
2. **Create** — import a compendium statblock into the world, drop it as a **token** on the active
   scene, create items, and create journal entries.

The one hard engineering constraint — **correct pf2e creates** — is met by **clone-from-compendium**,
never hand-authored `system.*` schemas (Decision D5). The one hard operational constraint —
**liveness** (nothing works unless the GM has "Faerrin" open in a browser) — is surfaced as a typed
"bridge offline" error, never a hang.

## Decisions in force

Carried from the scope doc (D1–D9) with two spec-level updates (D8 flipped, D10–D14 added):

| # | Decision | Resolution |
|---|---|---|
| D1 | Bridge architecture | **Custom astra-owned Foundry module** dialing out to portal (not the ThreeHats relay, not raw socket.io). Pattern proven by `adambdooley/foundry-vtt-mcp` (MIT). |
| D2 | Target | Foundry **13.351** + pf2e **7.12.2**, world **"Faerrin"** (verified on the live host). Module `compatibility.minimum:"13"`. |
| D3 | Server language | **TypeScript**, on the `apps/orator-backend` template (Node 24, `node --import …/nodeTsResolve.mjs`, no build step for the server). |
| D4 | MCP transport | **Streamable-HTTP** (`@modelcontextprotocol/sdk`), + a WebSocket server the module dials. Reference's stdio-wrapper topology rejected. |
| D5 | Create strategy | **Clone-from-compendium only.** `pack.getDocument(id).toObject()` → `Actor/Item.createDocuments`. **Zero hand-authored pf2e schemas** in v1. |
| D6 | Auth | **Two-hop key** — one bearer key MCP-client→server (`mcp-api-key`), one handshake key module→server (`bridge-api-key`). Both SOPS-resolved server-side; the module's copy is a Foundry module setting. |
| D7 | Repo layout | **`apps/portal/{server,module,shared}`** nested members (verified viable — see footprint). |
| D8 | **Write posture** | **Creates ON by default** (stakeholder decision — overrides scope §8-D8's proposed off). Still gated by **`game.user.isGM` AND the bridge key AND `max-creates-per-request`** (default 10). `allow-write-operations` module setting defaults **true**. |
| D9 | WebRTC | **Out of scope** — Caddy terminates TLS → authenticated `wss://` suffices. |
| D10 | MCP clients | **Claude Code + Claude Desktop** (both HTTP-capable) → **one shared bearer key** on `/mcp`; per-client scoped keys deferred (no rework needed to add). |
| D11 | Module bundler + **install by Manifest URL** | **tsdown** (in-repo post-0022 S14) → `module/dist/main.js`; dist **not** committed. **portal-server serves the module as an installable Foundry package** — a `module.json` generated at runtime with **absolute `manifest`/`download` URLs from `public-origin`** at `/module/module.json`, plus the packaged zip at `/module/portal.zip`. So the module installs into Foundry via **Install Module → Manifest URL = `https://portal.iridi.cc/module/module.json`** (Foundry's server fetches it — no CORS, no host file-drop). The Docker build packages the zip into the image; local file-drop stays a fallback. |
| D12 | Compendium search | **Live-iterate** `game.packs` + per-pack `getIndex`/`search`, merged/ranked, in v1. The reference's precomputed "enhanced index" (world-flags cache + pack fingerprints) is a **fast-follow**, noted not built. |
| D13 | Token import | **Import-then-tokenize** — import the compendium doc to `game.actors`, then `getTokenDocument({x,y})` → `scene.createEmbeddedDocuments("Token",…)`. Unlinked throwaway tokens deferred. |
| D14 | Module telemetry | **Bridge-forwarded log events** in v1 (the module emits diagnostics back over the WS as log records; portal re-emits to SigNoz). No browser→OTLP path. |

## Verified footprint (trust these numbers over the scope doc's prose)

- **Nested-member viability (scope §9.1) — RESOLVED empirically.** With throwaway
  `apps/portal/{server,module,shared}` members present:
  - pnpm `apps/*` is **single-level** → nested members are **not** discovered. **Fix:** add
    `- "apps/portal/*"` to `pnpm-workspace.yaml` → all three (`@astra/portal-{server,module,shared}`)
    discovered (verified via `pnpm -r ls`).
  - uv `apps/*` matches the manifest-less `apps/portal` parent → **hard error**
    (`error: Workspace member .../apps/portal is missing a pyproject.toml`), even on
    `uv sync --dry-run`. **Fix:** add `"apps/portal"` to the `[tool.uv.workspace] exclude` list →
    `uv sync --dry-run` exits **0**, resolves cleanly (verified). This mirrors how every TS app is
    already uv-excluded.
  - **Net: the nested layout costs exactly two one-line config edits, both proven.** (S1.)
- **The live instance:** `felddy/foundryvtt:13.351`, pf2e `7.12.2`, world `faerrin` (`system: pf2e`),
  public `https://btl.iridi.cc`, on Compose project `apps` / network `apps-network` (a **separate**
  stack from astra's `signoz-net`, **same host**). World currently `null` (idle at /setup) — the
  liveness constraint is real and present.
- **pf2e packs on disk** (portal's read/import sources): `pathfinder-monster-core(-2)`,
  `pathfinder-npc-core`, `pathfinder-bestiary(-2)(-3)`, `npc-gallery`, `hazards`, `equipment`,
  `spells`, `feats`, `actions`, `conditions`, `ancestries`, `heritages`, `classes`, `backgrounds`,
  `deities`, `*-effects`. Addressed `game.packs.get("pf2e.<name>")`.
- **Next free port: 10372** (highest assigned = heartwood 10371; band 10350–10399).
- **The Dockerfile manifest ripple is real** (orator Dockerfile L27–39): every service Dockerfile
  COPYs the full workspace `package.json` set; adding portal's 3 members means editing **every** TS
  service Dockerfile's manifest list, or their `--frozen-lockfile` reads "lockfile changed."
- **The env-injection path** (`just up`) exports each SOPS secret UPPER_CASED; config's env-override
  resolves it in-container (verified in `justfile` + orator's compose block).

## Scope (in)

1. **Three workspace members** under `apps/portal/`: `server` (`@astra/portal-server`, the MCP+WS
   server), `module` (`@astra/portal-module`, the Foundry ESM package), `shared`
   (`@astra/portal-shared`, the bridge envelope Zod types imported by both).
2. **The two workspace-config edits** (pnpm glob + uv exclude) from the footprint.
3. **Config wiring** — a `portal { }` block in `config.kdl` + the mirrored Pydantic + Zod schema
   (both lanes, `.strict()`); two SOPS keys (`portal_mcp_api_key`, `portal_bridge_api_key`).
4. **The bridge** — `portal-shared` envelope; `portal-server` WS server (two-hop auth, ping/pong,
   correlation-id request map w/ timeout) + Streamable-HTTP MCP server; telemetry first.
5. **The Foundry module** — `module.json`, dial-out WS client, `CONFIG.queries` handlers, GM gate,
   auth handshake, write-gate setting + per-request cap.
6. **Tools** — read: `search-compendium`, `list-compendium-packs`, `get-document`, `search-world`,
   `list-scenes`, `get-current-scene`; write: `import-from-compendium`, `create-token`,
   `create-journal`; plus `bridge-status` (liveness). All from §6 of the scope doc.
7. **Deploy** — `apps/portal/Dockerfile` (server + **the packaged module zip**) + the manifest ripple;
   Compose service (port 10372, `user:"1000:1000"`, `signoz-net`, healthcheck, the two env keys);
   portal-server serves `/module/module.json` (generated from `public-origin`) + `/module/portal.zip`;
   Caddy `portal.iridi.cc` block (SSE matcher for `/ws` + `/mcp`, **plus an explicit `/module/*`
   route** so the module installs by **Manifest URL**); a `just portal-module-build` (package) +
   `-install` (file-drop fallback) recipe.
8. **Telemetry** — `initTelemetry("astra.portal")` first; spans per MCP tool + bridge round-trip;
   `lazyCounter`/`lazyHistogram` metrics; bridge-forwarded module log events.
9. **Live verification** against `btl.iridi.cc` with "Faerrin" launched (end-to-end: search → import
   → token on the active scene, visible in Foundry).
10. **Memory update** — load-bearing gotchas → `thoughts/shared/memory/` + `MEMORY.md` pointer.

## Scope (out) / deferred (recorded, not silently cut — [[no-silent-scope-cuts]])

- Rolls, combat/encounter control, token movement/conditions, **delete** operations, macro exec.
- Per-system **curated NPC builders** (the reference's `dnd5e-create-npc` style) — pf2e creates are
  clone-only in v1.
- The precomputed **compendium index cache** (D12 fast-follow).
- **WebRTC** transport (D9); **per-client scoped keys** (D10); **unlinked throwaway tokens** (D13);
  **browser→OTLP** module telemetry (D14).
- Any support for systems other than pf2e, or Foundry majors other than v13.
- Non-pf2e worlds / multi-world routing (portal targets the one connected module).

## Slices

Each slice is independently CI-green (reproduce both lanes locally per [[no-ci-monitoring]]:
`uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest` and
`pnpm exec vp run -r typecheck && pnpm run lint && pnpm run format:check && pnpm exec vp run -r test`),
committed with a Conventional Commit, pushed at slice or subsystem completion.

### Slice S1 — skeleton + workspace wiring (the gating edits)
- Create `apps/portal/{server,module,shared}` each with a `package.json` (`@astra/portal-*`,
  `"type":"module"`, `"private":true`, `"version":"0.0.0"`).
- **`pnpm-workspace.yaml`:** add `- "apps/portal/*"`. **`pyproject.toml`:** add `"apps/portal"` to the
  uv `exclude` list. (Both proven in the footprint.)
- `portal-shared`: the bridge envelope Zod schemas (`McpQuery`, `McpResponse`, `AuthMsg`, `Ping/Pong`)
  + ≥1 vitest test (a TS lib with no test reds `vitest`, per [[strider-0016-gotchas]]).
- Config: `portal { }` in `config.kdl`; mirrored `PortalConfig` (Pydantic, `models.py`) + `Portal`
  Zod (`config.ts`), both registered on the root Config and `.strict()`/`extra="forbid"`. SOPS: add
  `portal_mcp_api_key` + `portal_bridge_api_key` (placeholder values ok until deploy).
- **Acceptance:** `pnpm -r ls` shows the 3 members; `uv sync` exits 0; both CI lanes green; the py
  config smoke parses the new `portal {}` block (it would fail `extra="forbid"` if the schema were
  unmirrored — the reason both lanes are mandatory even though only TS reads portal).

### Slice S2 — portal-server: the bridge + MCP skeleton
- `initTelemetry("astra.portal")` as the **first** statement of `server/src/index.ts`; then
  `loadConfig()`.
- WS server (`ws`) on the configured port path `/ws`: accept a socket, require the
  `{type:"auth",apiKey}` handshake matching `cfg.portal.bridgeApiKey.resolve()`, reject otherwise;
  first authed socket = "the Foundry connection"; ping/pong heartbeat; a `Map<id,{resolve,reject,
  timeout}>` request tracker with a timeout → typed error.
- Streamable-HTTP MCP server (`@modelcontextprotocol/sdk`) on `/mcp`, bearer-checked against
  `cfg.portal.mcpApiKey`; registers a single tool `bridge-status` returning connected/offline.
- Metrics via `lazyCounter`/`lazyHistogram` ONLY (never module-scope — [[telemetry-coverage-pass]]).
- **Acceptance:** unit tests for the envelope round-trip + auth reject; `bridge-status` returns
  "offline" with no module connected; typecheck/test green. (No Foundry needed yet.)

### Slice S3 — the Foundry module: end-to-end bridge proof
- `module/module.json` (`id:"portal"`, `compatibility.minimum:"13" verified:"13"`, `esmodules:
  ["dist/main.js"]`, `socket:true`). `just portal-module-build` (tsdown → `dist/main.js`).
- Module: on `ready`, dial `wss://<portal public-origin>/ws` (URL + bridge key from **module
  settings**), send the auth handshake, register `CONFIG.queries["portal.<method>"]` handlers, GM
  gate (`game.user?.isGM`), ping/pong, reconnect w/ backoff.
- Wire `bridge-status` end-to-end (module answers a `portal.ping` query).
- **Acceptance:** with the module installed in a **launched** world and portal running, `bridge-status`
  reports connected + world/system/version; a forced module disconnect flips it to offline within the
  heartbeat window (no hang). First live checkpoint against `btl.iridi.cc`.

### Slice S4 — read tools
- `search-compendium` (iterate `game.packs`, filter by `metadata.type`, `getIndex({fields})` +
  per-pack `search({query})`, merge + rank), `list-compendium-packs`, `get-document` (uuid/id via
  `fromUuid`/`pack.getDocument`/`game.actors.get`), `search-world` (`WorldCollection.search` + folder
  walk), `list-scenes`, `get-current-scene`.
- Use forward-safe `foundry.documents.*` / `getDocumentClass` (avoid the v15 deprecation cliff).
- **Acceptance:** live — search "goblin" returns pf2e Monster-Core hits; `get-document` fetches a full
  actor; `get-current-scene` reflects the active "Faerrin" scene. Read tools work with
  `allow-write-operations` irrelevant (reads always allowed).

### Slice S5 — write tools (creates ON, D8)
- `import-from-compendium` (`pack.getDocument(id).toObject()` → `Actor/Item.createDocuments`),
  `create-token` (import-then-tokenize, D13 — `actor.getTokenDocument({x,y})` →
  `scene.createEmbeddedDocuments("Token",…)`), `create-journal` (`JournalEntry.create`).
- Write-gate: `allow-write-operations` module setting (default **true**, D8) AND `game.user.isGM` AND
  `max-creates-per-request` cap; each denied path returns a typed reason. Log every write as a span +
  a forwarded module log event (audit trail — a mitigation for the default-ON blast radius).
- **Acceptance:** live — import a Monster-Core creature into `game.actors`, drop it as a token on the
  active scene (visible in Foundry), create a journal entry; the per-request cap rejects an oversized
  batch; a non-GM session is silently denied writes.

### Slice S6 — deploy + install-by-manifest-URL + live end-to-end + memory
- `apps/portal/Dockerfile` (server two-stage, `node:24-slim`, context repo-root, `COPY
  ontology/ontology-config`) **+ add `apps/portal/server/package.json` (and `module`/`shared`) to the
  manifest COPY list of the portal Dockerfile AND every sibling service Dockerfile** (the ripple).
  The **build stage also runs `tsdown` + packages the module** (`dist/main.js` + `module.json` +
  `styles/` → `portal.zip`) into the server's static dir, so the deployed server serves a current
  package with **no host file-drop**.
- **portal-server static module routes:** `GET /module/module.json` — the manifest rendered at
  runtime with absolute `manifest` (`{public-origin}/module/module.json`) + `download`
  (`{public-origin}/module/portal.zip`) URLs from `cfg.portal.publicOrigin` (single source,
  [[config-single-source]]); `GET /module/portal.zip` — the packaged module (served
  `application/zip`). These sit on portal's HTTP server alongside `/mcp` and `/ws`.
- Compose service (10372, `user:"1000:1000"`, `signoz-net`, healthcheck, `PORTAL_MCP_API_KEY` +
  `PORTAL_BRIDGE_API_KEY` env). **Caddy `portal.iridi.cc` block** — the SSE/`flush_interval -1` matcher
  for `/ws` + `/mcp`, **plus an explicit `/module/*` route to portal** so the Manifest URL is reachable
  (the catch-all would cover it, but the explicit route documents intent + lets us set caching):
  ```caddy
  portal.iridi.cc {
      import astra_site
      @sse path /ws /mcp
      handle @sse { reverse_proxy localhost:10372 { flush_interval -1 } }
      handle /module/* { reverse_proxy localhost:10372 }   # module.json + portal.zip → install by Manifest URL
      handle { reverse_proxy localhost:10372 }
  }
  ```
  Real SOPS keys. `just portal-module-build` (package locally); `just portal-module-install`
  (file-drop **fallback** into the `foundry_faerrin` module dir).
- `just up` + `just caddy-reload` ([[deploy-apply-with-just]]); verify SigNoz spans; confirm push +
  one status check ([[no-ci-monitoring]]).
- **Install into Foundry (documented GM step):** *Setup → Add-on Modules → Install Module → Manifest
  URL =* `https://portal.iridi.cc/module/module.json` → enable in the "Faerrin" world → set the bridge
  API key + WS URL in the module's settings. (`*.iridi.cc` is a Cloudflare wildcard, so
  `portal.iridi.cc` resolves + mints a cert with no manual DNS — [[ledger-0018-gotchas]].)
- Add Claude Code + Claude Desktop MCP config pointing at `https://portal.iridi.cc/mcp` + the bearer.
- **Acceptance:** the module **installs cleanly via the Manifest URL** (Foundry fetches the manifest,
  downloads `portal.zip`, extracts to `modules/portal/`) and updates the same way; then the full live
  loop through the public edge — a Claude client searches → imports → drops a token on the active
  "Faerrin" scene; SigNoz shows the three signals 0-error; `bridge-status` healthy. Then write
  `thoughts/shared/memory/portal-0023-gotchas.md` + the `MEMORY.md` pointer.

## Acceptance criteria (exit gate)

- **A.** All 6 slices CI-green + pushed; both lanes reproduce locally.
- **B.** `apps/portal/{server,module,shared}` discovered by pnpm; `uv sync` clean (the two config
  edits in place).
- **C.** Config: `portal {}` block + mirrored Pydantic/Zod schema; two SOPS keys; no hardcoded
  endpoints/keys ([[config-single-source]]).
- **D.** Bridge: two-hop auth enforced (unauth WS + wrong bearer both rejected); liveness surfaces as a
  typed "offline", never a hang.
- **E.** Read (live): compendium + world search, get-document, scenes — all return correct pf2e data.
- **F.** Write (live): import + token-drop on the active scene + journal create — visible in Foundry;
  GM gate + per-request cap enforced; every write audited.
- **G.** Deploy: live behind Caddy at `portal.iridi.cc`; SigNoz three signals 0-error; a Claude client
  drives the full search→import→token loop through the public edge.
- **H.** Memory updated.

## Risks

- **Liveness (highest).** No world open → nothing works. Mitigate: typed "offline" + `bridge-status`;
  document prominently. *(Present reality: the world is `null` right now.)*
- **Default-ON writes on a live campaign (D8, stakeholder-chosen).** Blast radius = an LLM creating/
  importing onto real "Faerrin" data. Mitigations: GM gate + bridge key + per-request cap + **full
  audit logging** of every write (span + forwarded log). No delete tools in v1 shrinks the downside.
- **pf2e schema drift.** Mitigated by D5 (clone migrates on import); hand-built payloads banned.
- **v13→v15 deprecations.** Use `foundry.documents.*`/`getDocumentClass` in the module.
- **Dockerfile manifest ripple.** Miss one sibling Dockerfile → CI reds on `--frozen-lockfile`. S6
  checklist covers all TS service Dockerfiles.
- **The linguist-commit timer** auto-commits staged files / touches the tree mid-session (observed
  this session: `M dagster/Dockerfile` + today's linguist files appeared). Keep a clean index during
  portal commits; `systemctl --user stop linguist-commit.timer` during manual git if needed
  ([[pipeline-reorder-0021]]).
- **Foundry on a separate Compose stack.** The module install is manual (not `just up`); document it.

## Adversarial completeness pass

- *"Is the module discoverable/installable without committing dist?"* — the Docker build packages the
  zip; portal-server serves `/module/module.json` + `/module/portal.zip` and Caddy routes `/module/*`,
  so it installs (and updates) via **Manifest URL = `https://portal.iridi.cc/module/module.json`** —
  Foundry's server fetches it (no CORS). Host file-drop remains a fallback (`just portal-module-install`).
  ✓ (D11 / S6.)
- *"Does the browser-side module reach portal on a separate Docker network?"* — irrelevant: the module
  is a **browser** WS client hitting the **public** `wss://portal.iridi.cc`, not a container. (Scope
  §2.1.) ✓
- *"Can a non-GM or a wrong key write?"* — three independent gates (isGM ∧ bridge-key ∧ setting) + cap;
  S5 acceptance tests the non-GM denial. ✓
- *"What if pf2e version bumps under us?"* — clone-from-compendium migrates on import; the module pins
  `compatibility.minimum:"13"`; a pf2e 8.x/v14 bump is a re-verify, not a silent break. ✓
- *"Both config lanes really needed if portal is TS-only?"* — yes: the py config smoke parses the same
  `config.kdl` under `extra="forbid"`; an unmirrored block fails Python CI. S1 acceptance guards it. ✓
- *"Search completeness — no native cross-pack search?"* — correct; v1 iterates+merges (D12), the
  cache is a flagged fast-follow, not a silent cap. ✓

## Hand-off

Implement with **octo:embrace** against this spec, slice by slice, telemetry from S2. Start S1 by
re-applying the two verified config edits and confirming `pnpm -r ls` + `uv sync` before anything
else. The live gates (S3–S6) require the GM to **launch the "Faerrin" world** on `btl.iridi.cc` and
install the module — coordinate that with the stakeholder. Record load-bearing gotchas in
`thoughts/shared/memory/portal-0023-gotchas.md` at S6.
