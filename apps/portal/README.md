# portal — an MCP server that lets an LLM read and edit the live FoundryVTT world

portal lets MCP clients (Claude Code, Claude Desktop, claude.ai) search and edit the live pf2e
"Faerrin" world on Foundry 13 (`https://btl.iridi.cc`, a separate Compose stack on the same host).
Foundry has no external API, so all world access runs inside a logged-in GM browser session: an
astra-owned Foundry module dials out to portal over a WebSocket, and portal forwards each MCP tool
call over that socket. portal never connects to Foundry directly.

Four pnpm members live here (the `apps/*/*` glob in `pnpm-workspace.yaml` finds them):

- **`server/`** — the MCP and bridge server. Compose service `portal`, port 10372, Caddy at
  `portal.iridi.cc`. Routes: `/mcp` (Streamable HTTP), `/ws` (the module's bridge socket),
  `/module/module.json` and `/module/portal.zip` (install by manifest URL), `/health`, and the OAuth
  endpoints (`/.well-known/…`, `/authorize`, `/token`, `/register`, `/revoke`, `/consent`).
- **`module/`** — the Foundry module (id `portal`), bundled by tsdown into `dist/main.js`. The server
  image builds it and serves the zip.
- **`shared/`** — the tool contracts (`src/tools.ts`) and the wire envelope both sides use.
- **`headless/`** — `portal-headless`, a supervised headless Chromium that keeps the dedicated
  "Portal" GM account logged into the world, so the tools work with no human tab open. Compose
  service `portal-headless`, port 10373, health only (no Caddy route).

Config is the `portal` and `portal-headless` blocks in `config.kdl`. Secrets: `portal_mcp_api_key`
(admin bearer and OAuth consent password), `portal_player_api_key` (read-only player bearer),
`portal_bridge_api_key` (module handshake), and `foundry_portal_gm_password`.

## Access model

- **Admin key** (Claude Code): all tools, including creates, edits, deletes and `execute-macro`.
- **Player key**: exactly five read-only tools (`bridge-status`, `query-party`, `query-player`,
  `query-item`, `query-rolls`), filtered by `PLAYER_TOOL_NAMES` in `server/src/mcp.ts`. Player tools
  respect Foundry ownership, so GM-only documents and LIMITED compendium packs stay hidden.
- **OAuth 2.1** (claude.ai custom connectors, which support nothing else): a single-user
  authorization server with dynamic client registration limited to claude.ai's callback and loopback
  URIs. The consent page asks for the admin key. State (clients and hashed tokens) lives in
  `/ruby/data/astra-state/portal-oauth/state.json`, so connections survive redeploys.
- **Writes** are gated by the GM check, the module settings `allow-write-operations` and
  `allow-macro-execution` (both default on), and `max-creates-per-request` (10). Every created
  document carries `flags["astra-portal"]`, and `delete-document` refuses anything without it.
  Every write is audit-logged (`portal.audit.*` spans and logs).

## Operations

- **Deploy the server:** push, then `just deploy portal` (or `portal-headless`). Every secret is
  required at startup, so set a new SOPS key before the deploy that needs it.
- **Install or update the module:** in Foundry, Install Module with manifest URL
  `https://portal.iridi.cc/module/module.json`, or update it from Foundry's module list. Bump
  `version` in `module/module.json` for every module change, or Foundry's update check sees nothing.
  After any module update:
  1. Restart the headless GM: `just deploy --restart portal-headless`. A socket redial does not
     reload module code.
  2. Human GM tabs must reload (F5); the module dials only on Foundry's `ready` hook.
  3. MCP clients must reconnect (`/mcp` in Claude Code) to see a changed tool list.
  A server-only redeploy needs none of this: the module redials within about a minute.
- **Fallback install** (file drop): `just portal-module-install` builds the module and copies it
  into the Foundry data dir. It fails with EACCES today because Foundry's own installer leaves that
  directory owned by root (open follow-up); copy as root instead.
- **Onboard a player:**
  ```
  claude mcp add --transport http portal-player https://portal.iridi.cc/mcp \
    --header "Authorization: Bearer <portal_player_api_key>"
  ```
- **Rotate a key:** `sops set` the new value in `deploy/sops/secrets.enc.yaml`, then
  `just deploy portal`; clients re-add the key. No Foundry step for the MCP keys. For the bridge
  key, also paste the new value into the module setting and reload the GM sessions.
- **Connect claude.ai:** Add custom connector, URL `https://portal.iridi.cc/mcp`, no client id or
  secret; consent with the admin key.
- **Designate the dialer before starting a second GM session.** Set the world setting
  `bridge-user-id` to the Portal user's id first, then start `portal-headless`. Otherwise two GM
  sessions take turns replacing each other's socket forever.

## Traps

### server

- **A zod comment never reaches the MCP client.** Anything an LLM needs to know about a parameter
  must be in `.describe()` in `shared/src/tools.ts`. Example: `search-compendium`'s `type` is the
  pack type (`"Actor"`, `"Item"`), not the pf2e subtype (`"npc"`); without the description, clients
  guess `"npc"` and get an empty result.
- **The env name of a secret is the SOPS key upper-cased**, not the config field name:
  `portal_player_api_key` becomes `PORTAL_PLAYER_API_KEY`. A mismatched name in compose crash-loops
  the container.
- **A running MCP session keeps the tool list it started with.** After a deploy that adds tools,
  reconnect (`/mcp`) before testing them.
- **The bridge server must clear the old heartbeat when a new socket replaces the old one.**
  Otherwise two intervals share the pong flag and kill healthy sockets.
- **The SDK's `registerClient` receives a `client_id` already generated**; reuse it, because the
  router returns its own copy to the client. Build the 401 `resource_metadata` URL with the SDK's
  `getOAuthProtectedResourceMetadataUrl` (it is path-suffixed `/mcp`), never by hand.
- **A corrupt OAuth state file is renamed to `state.json.corrupt-<ms>`** and portal starts empty;
  clients re-consent.
- **`docker restart astra-portal` keeps the injected secrets;** recreating the container does not,
  so recreate only with `just deploy`.
- **Negative-path tool calls (cap exceeded, not found) record error spans by design.** Filter them
  out before reading a SigNoz error count.

### module

- **The module dials only on Foundry's `ready` hook.** After changing the WebSocket URL or bridge key
  setting, the GM must reload; until then `bridge-status` reports disconnected and portal logs no
  connection attempts.
- **Backoff resets only after the socket survives 10 s** (`HEALTHY_HOLD_MS`), never on open. The
  bridge sends no auth acknowledgement, so a reset on open would let a wrong key reconnect once a
  second forever.
- **`not-designated` while `bridge-status` looks connected means a mistyped `bridge-user-id`.** The
  Foundry console shows ids with quotes; pasting those or a stray space breaks the exact match.
  Check with `game.settings.get("portal", "bridge-user-id")`. The setting is read per query, so a
  fix needs no reload.
- **Roll back server and module together.** The handshake is strict, so an old server rejects a newer
  module's handshake, and the rejection is reported as `bad-key` (it looks like a leaked key but is
  version skew). Recover by installing the matching module zip and reloading.
- **pf2e data lives on different sides of the document.** Live `game.messages` rolls are Roll
  objects, not JSON strings (normalize with `JSON.parse(JSON.stringify(x))`); `hp.max` exists only on
  the live actor; hero points exist only in source data (pf2e zeroes the live value); a spellcasting
  DC is reliable only at the actor's `system.attributes.spellDC.value`. Fixtures are source-shaped,
  so this class of bug shows up only against the live world.
- **pf2e authoring recipes:** clone and patch a compendium document where one exists; hand-author
  only where there is no base. A spell is castable only when `system.location.value` is the
  spellcasting entry's id. Apply persistent damage through the non-dialog path; a bare
  `increaseCondition("persistent-damage")` opens a dialog on the GM's screen. Derived PC fields
  (saves and similar) are refused by the update deny-list.
- **`import-from-compendium`'s `folder` must already exist;** it is not created.

### headless

- **Foundry never logs a client back in.** A kick (the same user logging in elsewhere), a world
  shutdown or an outage of 5 s or more lands the page on `/join`. The supervisor's re-login loop is
  the whole point of the service.
- **Classify the page only after navigating.** A page torn off `/game` by a server restart has a dead
  socket and never moves again, so the supervisor reloads the origin before classifying any page
  that is not `/game` or `/join`. Only `/game` counts as in-world; anything unknown is `world-down`.
- **`world-down` is not unhealthy.** Health `ok` means the process and browser are up; a restart
  cannot launch a world, and the supervisor never touches `/setup`, so GM maintenance is safe.
- **The world must auto-launch after a Foundry restart.** The Foundry container's `options.json`
  needs `"world": "faerrin"`; the `FOUNDRY_WORLD` env var cannot set it once the file exists.
- **The browser context needs a 1600×900 viewport** (Foundry's minimum is 1366×768) and
  `shm_size: "1gb"` (Chromium's renderer runs out of the 64 MB default `/dev/shm`).
- **`core.noCanvas` is seeded on every launch.** No portal handler uses the canvas, and skipping it
  avoids WebGL entirely.
- **Page console lines are logged at WARN, always.** They are Foundry or world-module output, not
  supervisor faults, and must not trigger the error alert; the `module_console{level}` counter keeps
  the real level (`astra.portal_headless.module_console`). This capture is the only way to see the module's in-page warnings.
- **Container tests cannot override plain config fields by env.** Bind-mount a modified
  `config.kdl` over `/repo/ontology/ontology-config/config.kdl` instead.
