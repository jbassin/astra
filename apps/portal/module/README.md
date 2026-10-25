# @astra/portal-module — the Foundry module (id `portal`)

The FoundryVTT module that runs inside a logged-in GM session, dials portal-server's `/ws`
bridge, and answers each MCP tool call by reading or writing the world. Portal as a whole (the
access model, install and update steps, the handshake codes, adding a tool, the pf2e traps) is
described in [`apps/portal/README.md`](../README.md); this file lists only what is specific to
this package.

## Layout

- `module.json` is the Foundry manifest. `esmodules` names `dist/main.js`, the one file tsdown
  builds from `src/main.ts`.
- `src/main.ts` registers the world settings and query handlers on Foundry's `init` hook and,
  for a GM session only, starts the bridge client on `ready`.
- `src/bridgeClient.ts` is the WebSocket client with its capped backoff.
- `src/handlers/` holds one file per domain (actors, compendium, documents, items, macros,
  party, player, rolls, scenes); `handlers/index.ts` builds `TOOL_HANDLERS`. Writes go through
  `handlers/writes.ts` and `handlers/payloads.ts`.
- `src/pf2e/` is the only code that reads pf2e `system.*`, chat-message `flags.pf2e` and
  ownership; its accessors name which side of the document (source or live) they read.
- `tests/fixtures/` holds actor and party documents for the handler tests.

It reads no `config.kdl`: the bridge URL, bridge key and write switches are world settings set
in Foundry.

## Build and test

```sh
just portal-module-build                 # tsdown -> dist/main.js (gitignored)
pnpm --filter @astra/portal-module test
```

`src/handlers.fixtures.test.ts` snapshots handler output over the fixtures
(`src/__snapshots__/`). The deployed module is built by the `portal` stage of
`deploy/node.Dockerfile` and served by portal-server; `just portal-module-install` is the
file-drop fallback.

## Traps

- **Bump `version` in `module.json` for every module change.** Foundry's update check compares
  it, and a test pins it to `PORTAL_VERSION` in `@astra/portal-shared`, so bump both.
- **Everything must be bundled.** Foundry's browser imports `dist/main.js` with no
  `node_modules` beside it, so `tsdown.config.ts` force-inlines `@astra/portal-shared` (and its
  zod). A new runtime dependency must be inlined too.
- **`TOOL_HANDLERS` must have exactly one handler per bridge tool** in the shared registry, or
  the package fails to typecheck.
- **The fixtures' live sides are synthesized**, not captured from Foundry, so a wrong guess
  about pf2e's prepared data shows up only against the live world.
