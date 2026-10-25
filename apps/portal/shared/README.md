# @astra/portal-shared — the contract between portal-server and the Foundry module

The one package both sides of portal import, so the wire contract cannot drift between them.
Portal as a whole is described in [`apps/portal/README.md`](../README.md); adding or changing a
tool is its "Adding or changing a tool" section.

## Public surface

- `src/envelope.ts`: the bridge WebSocket messages (`BridgeMessage`, `AuthMsg`, queries and
  responses), the typed error codes (`BridgeErrorCode`, thrown as `BridgeError`), and the
  version constants `PORTAL_VERSION`, `BRIDGE_PROTOCOL` and `MIN_BRIDGE_PROTOCOL`. Parse every
  received message into these schemas at once.
- `src/tools.ts`: each tool's parameter and result schemas.
- `src/registry.ts`: `PORTAL_TOOLS`, every MCP tool once, in the order clients see them, with its
  `access` (player or admin), `runsOn` (server or bridge), `kind` (read or write) and, for
  creates, its `creates` count.

It has no build step and reads no config.

## Testing

```sh
pnpm --filter @astra/portal-shared test
```

## Traps

- **An LLM sees only `.describe()` text.** A zod comment never reaches the MCP client, so put
  everything a client needs to know about a parameter in `.describe()` in `tools.ts`.
- **`PORTAL_VERSION` and `BRIDGE_PROTOCOL` are the one source** of the release and protocol
  versions. Bump `BRIDGE_PROTOCOL` on any envelope change an older peer cannot parse, and keep
  `module/module.json`'s `version` equal to `PORTAL_VERSION` (a module test checks).
- **It is the one workspace library outside `libs/ts`.** Both the server bundle and the module
  bundle inline it, and `deploy/node.Dockerfile` copies it into every Node build, so a change
  here ships only with a server deploy and a module release.
