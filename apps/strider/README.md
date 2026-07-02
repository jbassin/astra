# strider — the astra SSR frontend template

strider is the reference **TanStack Start SSR frontend** (roadmap Decision I): an SSR
process deployed as a Compose service behind Caddy, with build-time content →
generated TS modules → route loaders, server-side OTel, and browser RUM. Frontends
**0011–0013** (akasha-fe, mouthpiece-fe, vellum-fe) are produced by copying this app
and replacing its domain — not by reinventing the wiring.

The reusable spine lives in two shared libs so it is **not** re-copied per app:

- **`@astra/site-kit`** — `createSsrServer` (the srvx + `send` SSR entry on Node 24), `startRum` (`/web`),
  the vite plugins `contentWatchPlugin`/`gothicFontsPlugin`, `generateRouteTree`, and
  `loadSiteConfig` (a node-safe config read for `vite.config`).
- **`@astra/content-build`** — the generic markdown→generated-modules pipeline
  primitives (`markdownToHtml`, `parseFrontmatter`, `emitModule`, …).

## Shell vs domain

```
apps/<app>/
  server.ts          SHELL  thin createSsrServer caller (config-driven)
  vite.config.ts     SHELL  site-kit plugins + dev port from config.kdl
  Dockerfile         SHELL  templated (ARG APP); copies content + src/generated
  scripts/
    build-content.ts  DOMAIN  registers this app's content sources
    writeLayer.ts     ~shell  generic guarded fs write (strider's editor uses it)
    generate-routes.ts SHELL  thin generateRouteTree caller
  src/
    router.tsx        SHELL  getRouter() + error/not-found boundaries
    routes/           MIXED  thin route files; bodies wire in domain (replace per app)
    observe/          SHELL  rum.ts + rumConfig.ts (the per-app RUM seam)
    components/        SHELL  ClientOnly, PixiHost, SiteHeader (a pattern — edit branding)
    lib/               SHELL  generic hooks: useIsMobile, useFocusTrap
    styles/, generated/ SHELL / content output (gitignored, regenerated)
    domain/           DOMAIN  EVERYTHING app-specific:
      lib/             faction/hex/skein/timeline/memoriam/editor logic + tests
      components/      HexMap, Editor, FactionDetail, FactionSymbol, MapView, Modal
```

The boundary is mechanical: **`src/domain/` + `content/` + the route bodies** are what
a new frontend replaces; everything else is copy-as-is infra. (A literal `rm -rf
src/domain content/*` won't compile until you also replace the route bodies that import
domain modules — routes are the wiring seam, so they're edited, not deleted.)

## Port recipe (new frontend `apps/<app>`)

1. **Scaffold** `apps/<app>/` by copying strider's shell files: `server.ts`,
   `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `Dockerfile`, `scripts/`
   (`generate-routes.ts`, `writeLayer.ts` if you need an editor), `src/router.tsx`,
   `src/observe/`, `src/components/{ClientOnly,PixiHost,SiteHeader}`, `src/lib/`,
   `src/styles/`. Depend on `@astra/site-kit`, `@astra/content-build`, `@astra/gothic`,
   `@astra/observe`, `@astra/config` (`workspace:*`).
2. **Delete** `src/domain/` and `content/*`; add your own `src/domain/` + `content/`.
3. **Register content sources** in `scripts/build-content.ts` via
   `@astra/content-build` (`defineContentSource`/`buildContent`) — emit your generated
   modules into `src/generated/`.
4. **Config** (config-single-source): add an `<app> { service-name; port }` namespace
   to `ontology/ontology-config/config.kdl` **and mirror it in both** `libs/ts/config`
   (Zod) and `libs/py/config` (Pydantic) schemas. `server.ts` and `vite.config.ts`
   read it; the RUM service name derives as `${serviceName}-rum`.
5. **Deploy**: add a Compose service (`build.args.APP: <app>`, no `PORT` env — port is
   config-sourced; map the published host port) and a Caddy block in `sites.caddyfile`
   (`import astra_site` + reverse_proxy; fonts self-serve from the container).
6. **uv exclude**: a new `apps/*` TS dir must be added to the root `pyproject.toml`
   `[tool.uv.workspace]` `exclude` (uv globs `apps/*` and errors on a manifest-less or
   non-py member).

## Load-bearing gotchas (inherit these)

- **`vite --configLoader runner`** is REQUIRED (in `dev`/`build` scripts): importing a
  workspace TS package (`@astra/site-kit`) from `vite.config.ts` fails under vite's
  default Node-externalizing loader; `runner` loads the config through vite's own TS
  pipeline. This is the real shape of "vite.config can't import @astra/config".
  Verified again on Rolldown-vite 8.
- **`vite` is exact-pinned (no caret), currently `8.1.3`.** Every vite-using member in
  the workspace moves in lockstep — a partial bump silently installs a duplicate
  `vite` (two resolved versions in the lockfile), which is the actual trigger behind
  the once-presumed TanStack/router#7614 blocker. Bump `vite` only as one atomic
  change across all 12 vite-using members, re-verify the lockfile has exactly ONE
  `vite@` line, and don't caret it until TanStack officially certifies the major.
  `vitest` tracks the matching major (`^4.1` alongside vite 8) — `vitest` staying
  green on an older major is a false signal, since its `vite-node` dep can pin a
  private vite internally.
- **`createServerFn` stays in app source** (`src/observe/rumConfig.ts`) — the
  tanstackStart vite plugin only transforms server fns it finds in the app, not in a
  lib. `@astra/site-kit/web`'s `startRum` consumes the app's tiny server fn.
- **Wire `@tailwindcss/vite`** in `vite.config.ts` and ship `public/` (favicon,
  symbols), or gothic's `@theme`/`@apply` styling ships raw (black text, no panels).
- **Layer your CSS reset** — wrap any `*{margin:0;padding:0}` reset in `@layer base`.
  Unlayered it outranks gothic's `@layer components` content styles and silently
  zeroes every rendered-vellum margin/padding (paragraph spacing, list indents,
  trait-pill + code-block padding). Only frontends that render gothic `DocumentView`
  (akasha, strider factions, the vellum editor preview) are affected — but layering
  is free, so do it everywhere. See the 2026-06-24 design audit.
- **Cap the reading measure** — if a route renders long-form vellum prose, cap the
  reading column at ~42rem/68ch; gothic's content base is sized for cards, and an
  un-capped grid column runs prose to 100+ chars/line.
- **Fonts self-serve**: `gothicFontsPlugin({ clientOutDir })` copies gothic fonts into
  `dist/client/fonts` at build; the SSR server static-serves them. No Caddy
  `gothic_fonts` import, no vendored copy in git.
- **SSR only** — no `prerender` block. Commit `src/routeTree.gen.ts` (oxlint/oxfmt-ignored).
  Pixi behind `lazy()` + `<ClientOnly>`. `/editor`-style routes use `ssr: false`.
- **Telemetry** lands only from in-cluster: config `telemetry.otlp-endpoint` is the
  collector's signoz-net name (`http://signoz-otel-collector:4318`), not `localhost`.

For the full sequenced playbook + ecosystem dos/don'ts (read this before a migration),
see **`thoughts/shared/guides/migrating-an-app-into-astra.md`**. Background:
`thoughts/astra/specs/0014-strider-spec.md` (original lift) and
`0016-strider-hardening-spec.md` (this template hardening), plus the memories
`strider-0016-gotchas`, `tanstack-start-skill`, `config-single-source`,
`deploy-apply-with-just`.
