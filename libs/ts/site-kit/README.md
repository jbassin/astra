# @astra/site-kit — the shared spine of astra's SSR frontends

site-kit holds the parts every TanStack Start frontend shares, so apps don't copy them. Consumers:
strider, akasha-frontend, mouthpiece-frontend, vellum-frontend, harrow, ledger and codex (plus
`serveFile` and the resolve hook in the other Node services). It is plain TS source with no build
step. How to start a new frontend from these pieces is in `apps/strider/web/README.md`.

## The frontend preset

An app's shell files are a few lines of app-specific options (strider, akasha-frontend and
mouthpiece-frontend use it; the other frontends still carry their own copies):

| File | Calls | App-specific options |
|---|---|---|
| `vite.config.ts` | `defineSiteConfig` (`@astra/site-kit/vite`) | `root`, `generated` (the modules `build-content.ts` writes; dev invalidates them), optional `vite` merged over the preset |
| `vitest.config.ts` | `defineSiteVitestConfig` (`@astra/site-kit/vitest`) | `root` |
| `src/router.tsx` | `createRouter({ routeTree, ...siteRouterOptions({ notFound }) })` (`/router`) | `notFound`: `{ heading, message, homeLabel }` or a component |
| `src/routes/__root.tsx` | `head: () => siteHead({ title, description })`, `<SiteDocument>` (`/document`), `import "@astra/site-kit/theme"` | `rum={() => import("@/observe/rumConfig")}`, `forceDarkTheme`, `head` (extra head nodes), `bodyProps`, the body as children |
| `src/ssrSmoke.test.ts` | `describeSsrSmoke` (`/ssrSmoke`) | `appRoot`, `routes: [{ path, status?, contains }]`, optional `build` |

`defineSiteConfig` reads the dev port from the config.kdl block that `package.json` names in
`"astra": { "config": "<namespace>" }`, sets the `@` alias, and wires the plugins in order:
`contentWatchPlugin`, `gothicFontsPlugin`, `@tailwindcss/vite`, `ssrExternalsPlugin`,
`tanstackStart()`, plugin-react. `defineSiteVitestConfig` sets jsdom, globals, the alias and a
global setup that runs `scripts/build-content.ts` when `src/generated/` holds no module.
`describeSsrSmoke` rebuilds `dist/` when it is missing or older than the app's sources or any
`libs/ts` file, then renders each route through the built bundle in a plain Node process.

## Exports

| Export | Where it runs | What it does |
|---|---|---|
| `createSsrServer` | `server.ts` | srvx server on Node 24: static client assets, optional `staticMounts` (e.g. `/audio/`), then the app's SSR handler under an `ssr.render` span; closes on shutdown (`@astra/observe/register` owns telemetry and signals) |
| `serveFile`, `staticMountPath` | servers | `send`-backed file serving with Range/206, 304 and 416; traversal-guarded mount paths |
| `contentWatchPlugin` | `vite.config.ts` | runs the app's `scripts/build-content.ts` (as a Node subprocess) at build start and on content edits in dev |
| `gothicFontsPlugin` | `vite.config.ts` | serves gothic's fonts in dev and copies them to `dist/client/fonts` at build |
| `ssrExternalsPlugin` | `vite.config.ts` | at build, inlines into the SSR bundle every package that isn't one of the app's own `dependencies`; `just ssr-externals-check` (run by `just ts-build`) fails on a bundle that imports anything else |
| `loadSiteConfig` | `vite.config.ts`, build scripts | reads `config.kdl` by walking up from `process.cwd()` |
| `generateRouteTree`, `staleRouteTreeFiles` | `scripts/route-tree.ts` (`just routes-gen`, `just routes-check`) | writes each Start frontend's `src/routeTree.gen.ts`, byte for byte what `vite dev` writes; the check regenerates in a scratch copy and names stale files |
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
- **An SSR bundle may import only the app's own `dependencies`.** The image installs nothing
  else (`pnpm install --prod --filter ./apps/<app>...`). vite externalises any bare import it can
  resolve from the app dir, and in a checkout or the build stage that includes the root
  `node_modules` (devDependencies such as `yaml`). 2026-10-24: codex crash-looped on
  `Cannot find package 'yaml'` after the root gained a `yaml` devDependency. Every Start
  frontend's `vite.config.ts` uses `ssrExternalsPlugin`, and `just ssr-externals-check` checks
  the built bundles.
- **The build stage needs `config.kdl`.** `vite.config.ts` reads the port and service name at
  build time, so `deploy/node.Dockerfile` copies `ontology/` before `pnpm run build`.
- **The harrow and ledger SSR smokes read whatever `dist/` exists.** They build only when
  `dist/server/server.js` is missing, so after a dependency change they fail on a stale build
  (for example `matchedRoutes is not iterable`) until you run the app's `build`. CI is
  unaffected (no `dist/`). `describeSsrSmoke` and codex's smoke rebuild when stale.
- **`vitest.config.ts` loads without the resolve hook.** vitest's config loader leaves workspace
  packages to plain Node, so `src/vitestPreset.ts` may import only packages and Node builtins;
  a relative import there fails with `ERR_MODULE_NOT_FOUND`. That is why the vitest preset is
  its own entry, apart from `/vite` (which vite loads with `--configLoader runner`).
- **Import `@astra/site-kit/theme` where the fonts and theme CSS belong in the cascade.** CSS
  rules land in import order; in strider the theme import sits after the component imports, so
  the PixiHost and SiteHeader module rules stay ahead of the theme as before.
- **`/vite` imports build tools that are site-kit devDependencies.** The runtime image doesn't
  install them, so only `vite.config.ts` may import `/vite`; the root export never re-exports it.
- **Build with async `execFile` in tests when the build is heavy.** A synchronous child build
  blocks the vitest worker until it misses its heartbeat ("Timeout calling onTaskUpdate").
- **`grep -a` when checking SSR HTML.** Pages contain UTF-8 glyphs, so plain `grep` treats them as
  binary and prints nothing, which looks like a missing marker.
- **A new TS package needs at least one test.** The root vitest run fails when any project has no
  test files (`vitest.empty-projects.ts`; a real exception goes in its `ALLOWED_EMPTY` with the
  reason), and a package run of `vitest run` exits 1 when it finds none.
- **Config fields have no env override** (only secrets and `ASTRA_DATA_ROOT`/`ASTRA_CONTENT_ROOT`
  do). A path a container writes must be an identical-path bind mount, so the one `config.kdl`
  value is true on the host and in the container.
