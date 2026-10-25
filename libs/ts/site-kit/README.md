# @astra/site-kit — the shared spine of astra's SSR frontends

site-kit holds the parts every TanStack Start frontend shares, so apps don't copy them. Consumers:
strider, akasha-frontend, mouthpiece-frontend, vellum-frontend, harrow, ledger and codex (plus
`serveFile` and the server-bundle preset in the other Node services). It is plain TS source with
no build step. How to start a new frontend from these pieces is in `apps/strider/web/README.md`.

## The frontend preset

An app's shell files are a few lines of app-specific options. Every TanStack Start frontend uses
it: strider, akasha-frontend, mouthpiece-frontend, harrow, ledger, vellum-frontend and codex.
menhir is a plain vite SPA served by its own service-kit server, so it uses only the vitest
preset.

| File | Calls | App-specific options |
|---|---|---|
| `vite.config.ts` | `defineSiteConfig` (`@astra/site-kit/vite`) | `root`; `generated` (the modules `build-content.ts` writes; dev invalidates them; omit it when the app has no content step); `contentInputs` (a function returning the paths outside the app that `build-content.ts` reads, such as an astra-data snapshot; akasha and mouthpiece set it); `theme: false` for an app that doesn't use gothic; optional `vite` merged over the preset |
| `vitest.config.ts` | `defineSiteVitestConfig` (`@astra/site-kit/vitest`) | `root`; `environment: "node"`; `generatedContent: false` when there is no `build-content.ts`; extra `globalSetup` and `setupFiles` |
| `src/router.tsx` | `createRouter({ routeTree, ...siteRouterOptions({ notFound }) })` (`/router`) | `notFound`: `{ heading, message, homeLabel }` or a component; other router options go after the spread (codex's `pathParamsAllowedCharacters`) |
| `src/routes/__root.tsx` | `head: () => siteHead({ title, description, meta? })`, `<SiteDocument>` (`/document`), `import "@astra/site-kit/theme"` | `rum={() => import("@/observe/rumConfig")}`, `forceDarkTheme`, `head` (extra head nodes), `bodyProps`, the body as children |
| `src/ssrSmoke.test.ts` | `describeSsrSmoke` (`/ssrSmoke`) | `appRoot`, `routes: [{ path, status?, contains }]`, optional `build` |

`defineSiteConfig` reads the dev port from the config.kdl block that `package.json` names in
`"astra": { "config": "<namespace>" }`, sets the `@` alias, and wires the plugins in order:
`contentWatchPlugin`, `gothicFontsPlugin`, `@tailwindcss/vite`, `ssrExternalsPlugin`,
`tanstackStart()`, plugin-react. `defineSiteVitestConfig` sets jsdom, globals, the alias and a
global setup that runs `scripts/build-content.ts` when `src/generated/` holds no module.
`describeSsrSmoke` rebuilds `dist/` when it is missing or older than the app's sources or any
`libs/ts` file, then renders each route through the built bundle in a plain Node process.

The preset leaves the server alone. `server.ts` stays a `createSsrServer` call of the app's own,
with any `routes` or `staticMounts` it needs, and a `src/server.ts` that wraps TanStack's handler
(codex pins each request to one corpus release there) is found by TanStack Start by name.
`server.ts` loads the vite build with `await loadSsrBuild(APP)`, where `APP` is
`findPackageRoot(import.meta.dirname)`, rather than importing `./dist/server/server.js`, so its
server bundle does not inline the SSR build a second time.

## Server bundles

Every Node service the image runs (the frontends here and the service-kit services) bundles its
server entry with tsdown. The app's `tsdown.config.ts` is one line,
`export default defineServerBundle({ root: import.meta.dirname, entry: "server.ts" })` (from
`@astra/site-kit/bundle`), and its `build` script ends with `tsdown --config-loader tsx`. The
output is `dist-server/main.mjs` plus `dist-server/register.mjs`, which is
`@astra/observe/register` built into the same bundle so both share one copy of observe. The image
runs `node --import ./dist-server/register.mjs dist-server/main.mjs`. Externals follow the SSR
rule: the app's own non-workspace `dependencies` stay external, and everything else (workspace
packages and the third-party packages they import) is inlined.
codex keeps its own smoke file: its route tests share one build with the smoke, and it imports
`bundleIsStale` from `/ssrSmoke` for the rebuild check.

## A new frontend: `just new-frontend <name>`

`just new-frontend <name> [--port <n>]` scaffolds `apps/<name>/web` on the preset from
`template/`: the shell files above, a home route, `rumConfig.ts`, `globals.css`, a favicon, a
README stub, the `package.json` with `"astra": { "config": "<name>" }`, and its route tree. It
also adds the app's stubs to the shared files: a `<name>` block in `config.kdl` and
`fixtures/config/config.kdl` (`service-name "astra.<name>"`, `port`), a `<Name>Config` model in
`models.py` (in `WholeConfig` and `TS_NAMESPACES`, and the docstring's owner list), a compose
service and a `<name>.iridi.cc` Caddy stanza. The port defaults to one above the highest port
`config.kdl` and compose name in 10350 to 10399. The recipe then runs `just ontology-gen` and
`pnpm install`. Review the stubs, replace the home route, then `just ci`, commit, and after the
merge `just deploy <name>` and `just caddy-reload`. The app starts with no content step and on
gothic; add `generated` and `scripts/build-content.ts` (strider's README) when it needs one.
`scaffold.test.ts` applies the stubs to the real shared files in memory and builds and renders a
scaffolded app in a scratch dir.

## Exports

| Export | Where it runs | What it does |
|---|---|---|
| `createSsrServer` | `server.ts` | srvx server on Node 24: static client assets (vite's hashed `/assets/*` as `max-age=31536000, immutable`, everything else revalidating), optional `staticMounts` (e.g. `/audio/`), then the app's SSR handler under an `ssr.render` span; closes on shutdown (`@astra/observe/register` owns telemetry and signals) |
| `loadSsrBuild` | `server.ts` | imports `<app>/dist/server/server.js` by path and returns its handler |
| `defineServerBundle` (`@astra/site-kit/bundle`) | `tsdown.config.ts` | the server bundle's tsdown config (see "Server bundles") |
| `serveFile`, `staticMountPath` | servers | `send`-backed file serving with Range/206, 304 and 416 (`{ immutable: true }` for content-hashed files); traversal-guarded mount paths |
| `contentWatchPlugin` | `vite.config.ts` | runs the app's `scripts/build-content.ts` (as a Node subprocess) at build start, and in dev whenever a file under one of its inputs changes: `content/`, `scripts/`, config.kdl and `contentInputs` (any extension; dotfiles and `src/generated/` ignored; edits within 100 ms coalesce into one run) |
| `gothicFontsPlugin` | `vite.config.ts` | serves gothic's fonts in dev and copies them to `dist/client/fonts` at build |
| `ssrExternalsPlugin` | `vite.config.ts` | at build, inlines into the SSR bundle every package that isn't one of the app's own `dependencies`; `just ssr-externals-check` (run by `just ts-build`) fails on an SSR bundle or server bundle (`dist-server/`) that imports or `require`s anything else |
| `loadSiteConfig` | `vite.config.ts`, build scripts | reads `config.kdl` by walking up from `process.cwd()` |
| `generateRouteTree`, `staleRouteTreeFiles` | `scripts/route-tree.ts` (`just routes-gen`, `just routes-check`) | writes each Start frontend's `src/routeTree.gen.ts`, byte for byte what `vite dev` writes; the check regenerates in a scratch copy and names stale files |
| `scaffoldFrontend` and the stub editors (`src/scaffold.ts`) | `scripts/new-frontend.ts` (`just new-frontend`) | writes an app from `template/` and adds its stubs to the shared files; each edit is a pure function of the file's text |
| `startRum` (`@astra/site-kit/web`) | browser | starts browser RUM with the endpoint the app's server function returns |
| `tsxLoader()` (`@astra/site-kit/tsxLoader`) | vitest setups, ssrSmoke tests, the content plugin | tsx's loader, resolved from site-kit, for code that spawns `node --import <loader> file.ts` from any cwd |

## Traps

- **Template files end in `.tmpl`,** so no linter, type checker, formatter or test runner reads
  them; tokens are `__name__`, `__camel__`, `__title__` and `__port__`. Only `scaffold.test.ts`
  checks them (it builds and renders a scaffolded app). Change a template like the shell file it
  copies in a real app.
- **`defineSiteConfig` reads the port straight from the KDL block,** not through the generated
  schema, so a scaffolded app builds before `just ontology-gen`. The server's `loadConfig()` and
  the CI config tests still validate the block.

- **Use `vite --configLoader runner`** in every `dev`/`build` script whose `vite.config.ts`
  imports a workspace package. vite's default loader bundles the config and leaves workspace
  packages to Node, which can't run their raw `.ts`.
- **Every `node` run of workspace TS goes through tsx:** `node --import tsx file.ts` in a shell or
  package script (Node resolves `tsx` from the working directory, so the root devDependency
  covers the checkout), or `tsxLoader()` from code that spawns node. The workspace writes
  extensionless and directory imports and JSX, which plain Node rejects. tsx reads the tsconfig
  of the working directory, so the frontends' `@/*` alias works only when run from the app dir.
  Production never runs TypeScript: it runs the server bundles.
- **A library `.tsx` that a script renders declares its JSX runtime.** tsx applies the
  working directory's tsconfig only to the files it includes, so in an app's
  `build-content.ts` run, gothic's render tree would compile to `React.createElement` and fail
  with `React is not defined`. Those files start with
  `/** @jsxRuntime automatic @jsxImportSource react */`; add it to any library `.tsx` a script
  reaches.
- **A server must not locate files from `import.meta.dirname` plus `../`.** In the bundle every
  module's `import.meta` is the bundle's. Use `findPackageRoot(import.meta.dirname)`
  (`@astra/config`) and join from the app root; load a file by package name
  (`@astra/weal-engine/gen/...`) when it lives in a library.
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
- **`vitest.config.ts` loads without tsx.** vitest's config loader leaves workspace
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
