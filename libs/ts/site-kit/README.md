# @astra/site-kit — the shared spine of astra's SSR frontends

site-kit holds the parts every TanStack Start frontend shares, so apps don't copy them. Consumers:
strider, akasha-frontend, mouthpiece-frontend, vellum-frontend, harrow, ledger and codex (plus
`serveFile` and the resolve hook in the other Node services). It is plain TS source with no build
step. How to start a new frontend from these pieces is in `apps/strider/web/README.md`.

| Export | Where it runs | What it does |
|---|---|---|
| `createSsrServer` | `server.ts` | srvx server on Node 24: static client assets, optional `staticMounts` (e.g. `/audio/`), then the app's SSR handler; one OTel span per SSR request; flushes telemetry on SIGTERM/SIGINT |
| `serveFile`, `staticMountPath` | servers | `send`-backed file serving with Range/206, 304 and 416; traversal-guarded mount paths |
| `contentWatchPlugin` | `vite.config.ts` | runs the app's `scripts/build-content.ts` (as a Node subprocess) at build start and on content edits in dev |
| `gothicFontsPlugin` | `vite.config.ts` | serves gothic's fonts in dev and copies them to `dist/client/fonts` at build |
| `loadSiteConfig` | `vite.config.ts`, build scripts | reads `config.kdl` by walking up from `process.cwd()` |
| `generateRouteTree` | `scripts/generate-routes.ts` | regenerates `src/routeTree.gen.ts` |
| `startRum` (`@astra/site-kit/web`) | browser | starts browser RUM with the endpoint the app's server function returns |
| `src/nodeTsResolve.mjs` | every `node` run of workspace TS | resolve hook, loaded with `node --import` |
| `nodeTsResolveHook` (`@astra/site-kit/nodeTsResolveHook`) | vitest setups, ssrSmoke tests | the hook's absolute path, for code that spawns `node --import`; use it instead of `../../libs/ts/...` |

## Traps

- **Use `vite --configLoader runner`** in every `dev`/`build` script whose `vite.config.ts`
  imports a workspace package. vite's default loader bundles the config and leaves workspace
  packages to Node, which can't run their raw `.ts`.
- **Every `node` run of workspace TS needs the resolve hook:**
  `node --import <repo>/libs/ts/site-kit/src/nodeTsResolve.mjs file.ts`. The workspace writes
  extensionless and directory imports, which Node's ESM resolver rejects. The hook retries with
  `.ts`/`.tsx` before `/index.*` (a sibling file wins over a same-named directory, as in a
  bundler), and it compiles JSX with esbuild, because Node's type stripping doesn't do JSX.
- **Node type stripping rejects non-erasable TS** (parameter properties, enums, namespaces). Only
  running the file finds them reliably; `erasableSyntaxOnly` in the tsconfigs now catches most.
- **Keep `createServerFn` in app source.** The TanStack Start vite plugin only transforms server
  functions inside the app, so `startRum` takes the app's own `src/observe/rumConfig.ts`.
- **Read the TanStack Start skill docs before adding server-side behaviour.** They ship with the
  installed packages and match the pinned version better than online docs:
  `apps/<app>/node_modules/@tanstack/react-start/skills/react-start/SKILL.md`, and the
  `start-core` sub-skills (server functions, server routes, middleware, execution model) under
  `node_modules/.pnpm/@tanstack+start-client-core@*/node_modules/@tanstack/start-client-core/skills/start-core/`.
  Loaders are isomorphic: anything server-only goes in a `createServerFn`.
- **In `vite.config.ts`, use `loadSiteConfig()`, not `@astra/config`'s `loadConfig()`.**
  `loadSiteConfig` finds `config.kdl` from the working directory, which is the app dir under vite.
- **Never hand-roll static file serving.** A bare `node:fs` read sends no content type, and
  Chromium then refuses module scripts. Use `serveFile`.
- **The build stage needs `config.kdl`.** `vite.config.ts` reads the port and service name at
  build time, so a frontend Dockerfile must COPY `ontology/ontology-config` before `pnpm run build`.
- **SSR smoke tests read whatever `dist/` exists.** The strider, harrow, ledger and akasha smokes
  build only when `dist/server/server.js` is missing, so after a dependency change they fail on a
  stale build (for example `matchedRoutes is not iterable`) until you run the app's `build`. CI is
  unaffected (no `dist/`). codex's smoke rebuilds when stale; copy that check.
- **Build with async `execFile` in tests when the build is heavy.** A synchronous child build
  blocks the vitest worker until it misses its heartbeat ("Timeout calling onTaskUpdate").
- **`grep -a` when checking SSR HTML.** Pages contain UTF-8 glyphs, so plain `grep` treats them as
  binary and prints nothing, which looks like a missing marker.
- **A new TS package needs at least one test.** `vitest run` exits 1 when it finds no test files,
  which fails the lane, unless the script passes `--passWithNoTests`.
- **Config fields have no env override** (only secrets and `ASTRA_DATA_ROOT`/`ASTRA_CONTENT_ROOT`
  do). A path a container writes must be an identical-path bind mount, so the one `config.kdl`
  value is true on the host and in the container.
