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
- **`shared/`** — what both sides use: the tool registry (`src/registry.ts`), each tool's param and
  result schemas (`src/tools.ts`), and the wire envelope (`src/envelope.ts`).
- **`headless/`** — `portal-headless`, a supervised headless Chromium that keeps the dedicated
  "Portal" GM account logged into the world, so the tools work with no human tab open. Compose
  service `portal-headless`, port 10373, health only (no Caddy route).

Config is the `portal` and `portal-headless` blocks in `config.kdl`. Secrets: `portal_mcp_api_key`
(admin bearer and OAuth consent password), `portal_player_api_key` (read-only player bearer),
`portal_bridge_api_key` (module handshake), and `foundry_portal_gm_password`.

## Access model

- **Admin key** (Claude Code): all tools, including creates, edits, deletes and `execute-macro`.
- **Player key**: exactly five read-only tools (`bridge-status`, `query-party`, `query-player`,
  `query-item`, `query-rolls`), the registry entries with `access: "player"`. Player tools
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
  A server-only redeploy needs none of this: the module redials on its own (a 0.5.0+ module within
  seconds, since the server closes with 1001 on shutdown).
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
- **The server decides which Foundry user holds the bridge:** `portal.bridge-user-id` in
  `config.kdl` (today the dedicated "Portal" account that `portal-headless` logs in). Any other GM
  session's dial is refused with close code 4003 and retries every 30 s, so a human GM tab can
  stay open without a fight. With the value empty, the first user to connect keeps the bridge and
  a second user gets 4006 (busy). A same-user reconnect (a tab reload) replaces the old socket.
  The module's own `bridge-user-id` world setting is now only a local opt-out.

## Bridge handshake

The module sends `{type:"auth", apiKey, protocol, moduleVersion, meta}` on connect. The server
checks the protocol first, then the key, then designation, and either replies `auth-ok` (with
its protocol and `serverVersion`) or closes the socket with one of these codes. Both sides log
the reason; the module's console line starts `[portal] bridge client:`.

| Code | Reason | Module then |
|---|---|---|
| 4001 | `bad-key` or `malformed` handshake | notifies the GM, retries every 30 s |
| 4002 | `module-stale` | notifies the GM "module is stale, update and reload", stops dialing |
| 4002 | `server-stale` (module newer than server) | notifies the GM, retries every 30 s |
| 4003 | `not-designated` | retries every 30 s |
| 4004 | `replaced` (a newer socket for the same user) | retries every 30 s; regains the bridge once the replacer leaves |
| 4005 | `timeout` (no auth message within 5 s) | redials with backoff |
| 4006 | `busy` (no designation, another user connected) | retries every 30 s |
| 1001 | `server-shutdown` | redials with backoff |

The backoff resets to 1 s on `auth-ok`. Queries in flight on a replaced socket fail at once with
the typed error `bridge-replaced`; on a dropped socket or a shutdown, with `bridge-offline`.
A bridge frame larger than 8 MiB (`MAX_BRIDGE_PAYLOAD_BYTES`) closes the socket with 1009; a tool
result that big (a huge `get-document`) would need that cap raised.

`PORTAL_VERSION` and `BRIDGE_PROTOCOL` in `shared/src/envelope.ts` are the one source for the
release and protocol versions; a module test pins `module/module.json`'s `version` to
`PORTAL_VERSION`. Bump `BRIDGE_PROTOCOL` on any envelope change an older peer cannot parse.

**Legacy window (0.5.0 only):** the server still accepts the unversioned 0.4.x handshake as
protocol 0 (WARN log `legacy (protocol 0) portal module connected`), so the server can deploy
before the 0.5.0 module is installed. The next portal release sets `MIN_BRIDGE_PROTOCOL` to 1;
from then on a 0.4.x module is closed as `module-stale`.

## Adding or changing a tool

Every tool is one entry in `PORTAL_TOOLS` (`shared/src/registry.ts`): name, description, param and
result schemas, `access` (player or admin), `runsOn` (server or bridge), `kind` (read or write; writes
are audit-logged) and, for creates, the `creates` count the cap checks. The server registers one MCP
tool per entry in that order; the module's `TOOL_HANDLERS` (`module/src/handlers.ts`) must have
exactly one handler per bridge tool, or the module fails to typecheck. A tool that returns markdown
also needs a renderer in `RENDERERS` (`server/src/mcp.ts`).

- `server/src/__snapshots__/tools-list.{admin,player}.json` pin what MCP clients see. Any diff there
  is a client-visible change: review it, then update with `pnpm --filter @astra/portal-server exec
  vitest run -u`.
- The server checks each module result against the entry's `result` schema but only reports a
  mismatch (WARN log `portal result mismatch`, counter `astra.portal.mcp.result_mismatches{tool}`);
  the client still gets the result unchanged. A nonzero counter means module/server skew or a
  schema that is wrong about live data.

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
- **A tool error `not-designated` while `bridge-status` looks connected means the module's local
  `bridge-user-id` setting names another user.** The module trims spaces and quotes from it. Check
  with `game.settings.get("portal", "bridge-user-id")`, or clear it: the server's
  `portal.bridge-user-id` already decides who holds the bridge. The setting is read per query, so
  a fix needs no reload.
- **A 0.5.0+ module needs a 0.5.0+ server.** A pre-0.5.0 server parses the handshake strictly and
  reports the new `protocol` field as `bad-key` (it looks like a leaked key but is version skew).
  So deploy the server first, and roll back server and module together. From 0.5.0 on, skew in
  either direction closes with 4002 and says which side is stale.
- **pf2e data lives on different sides of the document.** Live `game.messages` rolls are Roll
  objects, not JSON strings (normalize with `JSON.parse(JSON.stringify(x))`); `hp.max` exists only on
  the live actor; hero points exist only in source data (pf2e zeroes the live value); a spellcasting
  DC is reliable only at the actor's `system.attributes.spellDC.value`. Handlers read `system.*`
  only through `module/src/pf2e/`, whose accessors name the side they read in their types
  (`Pf2eSystem<"source">` or `<"live">`); its `index.ts` has the field-by-field table. Add an
  accessor there rather than walking `system` in a handler. The fixtures in
  `module/tests/fixtures/pf2e/` hold both sides, but their live sides are synthesized, not
  captured, so a wrong guess about pf2e's prepared data still shows up only against the live
  world. Chat-message `flags.pf2e` reads (query-rolls) are not in the layer yet.
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
