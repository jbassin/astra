# @astra/portal-server — portal's MCP and bridge server

The Node service behind `portal.iridi.cc` (Compose service `portal`, port 10372). It serves
MCP over Streamable HTTP at `/mcp`, the Foundry module's bridge WebSocket at `/ws`, the module
package at `/module/module.json` and `/module/portal.zip`, health at `/health` and `/healthz`,
and the OAuth endpoints for claude.ai. It runs on `@astra/service-kit`. Portal as a whole (the
access model, operations, the bridge handshake, adding a tool, traps) is described in
[`apps/portal/README.md`](../README.md); this file lists only what is specific to this package.

## Layout

- `src/index.ts` loads config and starts the service; `src/server.ts` builds the route table.
- `src/mcp.ts` registers one MCP tool per `PORTAL_TOOLS` entry, applies the key checks, the
  create cap and the audit log, and holds `RENDERERS` for the markdown tools
  (`src/markdown.ts`).
- `src/bridge.ts` is the WebSocket bridge and its handshake; `src/oauth.ts` is the single-user
  OAuth 2.1 server built on the MCP SDK's router; `src/modulePackage.ts` renders the module
  manifest with absolute URLs from `portal.public-origin` and zips the built module.

## Config

The `portal` block of `config.kdl`: `service-name`, `port`, `public-origin`,
`bridge-timeout-ms`, `max-creates-per-request`, `bridge-user-id`, `oauth-state-path`, and the
secrets `mcp-api-key`, `player-mcp-api-key` and `bridge-api-key`. Every secret is required at
startup.

## Testing

```sh
pnpm --filter @astra/portal-server test
```

- `src/pins.test.ts` pins every route's response for each credential.
- `src/__snapshots__/tools-list.{admin,player}.json` pin the tool list MCP clients see. Review a
  diff there as a client-visible change, then update with
  `pnpm --filter @astra/portal-server exec vitest run -u`.

## Traps

- **The module is served from `../module`.** Locally, run `just portal-module-build` first;
  without `module/dist/main.js` both module routes answer 503. The image build does this
  itself.
- **`SERVICE_NAME` in `src/constants.ts` must equal `portal.service-name`.** The constant names
  the tracer, meter and logger; config names the process.
- **`@astra/portal-shared` is inlined into the server bundle.** A change there needs a server
  redeploy as well as a module release.
