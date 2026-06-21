---
name: strider-0016-gotchas
description: strider template-hardening (spec 0016) COMPLETE — all 7 slices built+pushed+live-verified; load-bearing gotchas for the 0011–0013 copies
metadata:
  type: project
---

Hardening strider into the *copy* template for frontends 0011–0013, per the 2026-06-21 review
(`thoughts/shared/research/2026-06-21-strider-template-review-thoughts.md`). Spec:
`thoughts/astra/specs/0016-strider-hardening-spec.md`. **Slices 1–6a BUILT + PUSHED** (`68fcff0`…`4658bcb`);
**resume at slice 6b**. Builds on [[astra-migration-research]]; honors [[verify-before-acting]],
[[no-silent-scope-cuts]], [[config-single-source]], [[telemetry-built-in]], [[deploy-apply-with-just]].

**Numbering wart:** drafted + committed as "0015" (slices 1–6a commit messages say 0015), but `0015` is the
reserved Phase-6 **cutover** plan (`plans/0015-cutover.md`). The spec was renumbered to **0016**; use 0016
from slice 6b onward. Don't "fix" the old commit messages (immutable history).

**Done (1–6a), all CI-green locally, renderer visually verified in dev:**
- **1 idiom/correctness:** `verbatimModuleSyntax:false` in the *frontend* tsconfig ONLY (base stays on for
  non-Start pkgs — the start-core skill's HIGH mistake); `getRouter()` got `defaultErrorComponent` +
  `defaultNotFoundComponent` (retry = `router.invalidate()`, `.route-boundary` CSS, body is `pointer-events:none`
  so the boundary re-enables it); `/editor` is `ssr:false` (dropped the in-component `<ClientOnly>`); deleted 3
  dead exports; renamed `fit()`→`fitToViewport()` to kill a mis-applied `biome-ignore noFocusedTests`.
- **2 tests:** `build-content` exports its pure parsers + is guarded by **`if (import.meta.main)`** so tests can
  import without regenerating (contentWatchPlugin spawns it as a *subprocess*, so generation still runs there).
  `writeLayer` got an optional `layersDir` seam (default unchanged) so guard tests hit a temp dir. **SSR smoke:**
  `scripts/ssrSmoke.ts` imports the built `dist/server/server.js` in real bun and asserts `ssr.fetch` exists +
  `/` renders 200; `src/ssrSmoke.test.ts` builds-if-absent then `execFileSync`s it (avoids vitest re-bundling the
  output). vitest excludes `**/e2e/**`.
- **3 dedup:** ONE hex geometry — `hexCorners`/`hexCornersAtPixel`/`HEX_SIZE`/`HEX_NEIGHBORS` in `hexUtils.ts`;
  `pixiScene.hexVertsAtPixel` = `hexCornersAtPixel(...).flat()`. Shared region paint in `components/HexMap/mapPaint.ts`
  (`paintRegionFill/Border` + `mapTheme`), `connKey`/`connectionEndpoints` in `skeinGeometry.ts` (Pixi-free,
  type-only layers import), `strokePolyline` in `pixiScene.ts`.
- **4 perf (the risky one):** `setFactionState` now **reuses Graphics for unchanged hexes and only
  destroys+recreates the ones that changed owner** — this is what keeps the **flip-animation contract** intact
  (the flip only ever animates fresh graphics; reused hexes get `scale.y` reset). Do NOT naively reuse changed
  hexes. Reused one hover `GlowFilter`. **`pixi-filters/glow` subpath import saved 0 bytes** — rollup already
  tree-shakes the barrel; the 861 KB pixi client chunk is **pixi.js core**, not filters (don't chase filter
  trimming). Canvas has **no unit test** — visually eyeball the dev app after any renderer change.
- **5 observability/docs:** `writeLayerFn` wraps the write in a span + `strider.editor.writes` counter + an OTLP
  log (audit trail); `writeLayer.ts` stays transport/telemetry-free. **`libs/ts/observe/src/telemetry.ts` (the
  preload) now flushes on SIGTERM/SIGINT** (it was dormant — unused — so safe; benefits orator/weal/vellum/Nitro
  when adopted). Dropped dead `CONTENT_HASH`. Rewrote `content/layers/{README,CLAUDE}.md` to SSR/server-fn reality.
- **6a `@astra/content-build`:** generic build-time pipeline — `markdownToHtml`, `parseFrontmatter`,
  `listMarkdownFiles`, `hashFiles` (moved here, tested), `emitModule` (AUTOGEN header), `emitGitignore`, and a
  `defineContentSource`/`buildContent` registry for *simple* sites. strider's `build-content.ts` consumes the
  primitives; its two sources are **coupled** (layers' `computeEffectiveAssignments` needs faction slugs), so it
  shares slugs via a closure and relies on `buildContent` running sources in declaration order — NOT the clean
  independent-source model. strider dropped remark/remark-html devDeps (kept gray-matter for editorHelpers.test).

**6b DONE + PUSHED + LIVE-VERIFIED (`a03f06c`, `0ac2cec`) — `@astra/site-kit` extracted:**
- `libs/ts/site-kit` (pure TS source, no build step — repo convention): `createSsrServer({serviceName,
  port, ssr, clientDir})` (app's server.ts passes its own built `ssr` + `dist/client`; the lib owns Bun.serve
  + OTel span-per-request + SIGTERM flush; ssr.fetch contract kept), `startRum` (./web subpath, client-only),
  `contentWatchPlugin`/`gothicFontsPlugin`/`generateRouteTree`, `loadSiteConfig`/`siteConfigFile`.
- **THE load-bearing gotcha: importing a workspace TS package from `vite.config.ts` REQUIRES vite's
  `--configLoader runner`** (added to strider's dev/build scripts). vite's default loader esbuild-bundles the
  config and **Node-externalizes** workspace packages, and the vite bin is `#!/usr/bin/env node` → Node can't
  execute a package's raw `.ts` → import fails (`ERR_MODULE_NOT_FOUND` on the lib's extensionless re-exports).
  `runner` loads the config through vite's own TS pipeline, which resolves workspace source. This IS the precise
  mechanism behind the old "vite.config can't import @astra/config" note. 0011-0013 MUST set the flag.
- **createServerFn stays in app source** (`rumConfig.ts`, ~12 lines) — the tanstackStart vite plugin only
  transforms server fns from the app, not a workspace lib (unproven + can't runtime-verify browser RUM this
  session). site-kit owns the glue (`startRum`); the server fn now returns BOTH endpoint AND serviceName from
  config (`${cfg.strider.serviceName}-rum`) since the browser can't read config.kdl.
- **config-single-source:** new `strider { service-name; port }` namespace in config.kdl, mirrored in BOTH the
  ts (Zod) + py (Pydantic) schemas. `loadSiteConfig` walks from a plain dir (`process.cwd()`) — avoids
  @astra/config's Bun-only `import.meta.dir` so vite can read the dev port from the same config.kdl.
- **Dockerfile templatized (`ARG APP`)**; dropped `PORT` env from Dockerfile + compose (config-sourced).
  **Build-stage gotcha:** vite.config now reads config.kdl AT BUILD time → the build stage must `COPY
  ontology/ontology-config` too (not just runtime), else the config load throws and the build fails.
- **Font self-serve (`0ac2cec`):** `gothicFontsPlugin({clientOutDir})` now ALSO copies gothic fonts →
  `dist/client/fonts` at build (closeBundle), so the container self-serves /fonts (server.ts static-serve);
  **removed strider's `import gothic_fonts` + the now-unused `(gothic_fonts)` snippet** from sites.caddyfile
  (matches orator/weal-overlay; removes host-path coupling). Live: /fonts via the edge → 200 font/ttf from the
  container.
- **Live re-verify (targeted `docker compose up -d --build strider` + `just caddy-reload`):** container healthy;
  `/` 200, `/editor` 200 (local_only), `/fonts/CaslonAntique.ttf` 200 font/ttf 86308 B both direct (10360) and
  via the edge. **NB the host Caddy edge listens on 2650/2651, NOT 443** (loopback test: `curl --resolve
  strider.iridi.cc:2651:127.0.0.1`).
- **PRE-EXISTING telemetry gap found (NOT a 6b regression, surfaced not buried):** server-side SSR spans don't
  reach SigNoz. The container exports to config `telemetry.otlp-endpoint = http://localhost:10353`, which is
  **unreachable inside a container** (collector = `signoz-otel-collector:4318` on signoz-net, confirmed
  reachable). `astra.strider-rum` (browser) lands fine; `astra.strider`/orator/weal **server-side never have**
  (absent from `signoz_list_services` 7d). createSsrServer's initTelemetry is byte-identical to old server.ts →
  not introduced here. **Fix = a cross-cutting in-container OTLP-endpoint / config-single-source dual-address
  decision** (host localhost:10353 vs container signoz-otel-collector:4318) touching ALL services — its own
  change, not 6b. See [[telemetry-built-in]].

**7 DONE + PUSHED + LIVE-VERIFIED (`0aaae5f`) — shell vs `src/domain/` split:**
- Moved all faction/hex/skein/timeline/memoriam/editor logic + components → `apps/strider/src/domain/`
  (`lib/` + `components/{HexMap,Editor,FactionDetail,FactionSymbol,MapView,Modal}`). 47 git renames; imports
  `@/lib|components/*` → `@/domain/...` (sed), incl. build-content.ts's **relative** `../src/lib/*` imports +
  its **emitted-module template strings** + writeLayerFn's now-deeper `../../../../scripts/writeLayer`.
- **Shell stays:** ClientOnly, PixiHost, SiteHeader (+ `entitiesObserved` = a generic `number|null` context,
  kept in shell; domain→shell import is fine), generic hooks (useIsMobile/useFocusTrap), observe/ RUM seam,
  router/routes/styles/generated. **Modal moved to domain** (it's the faction modal, not generic — relocated,
  not rewritten).
- **biome.json gotcha:** the strider lint suppressions (noNonNullAssertion / dangerouslySetInnerHtml / a11y)
  are keyed on **exact paths**; moving files re-exposed them as 11 errors + 93 warnings until I repointed the
  override globs `**/strider/src/lib|components/...` → `...src/domain/...` (useFocusTrap stayed → its glob
  unchanged). A path-glob refactor must update biome.json overrides too.
- Added `apps/strider/README.md` = the port recipe (shell vs domain, 6-step copy, inherited gotchas).
- Routes still hard-import domain → a literal `rm -rf src/domain` won't compile until route bodies are
  replaced; the README frames routes as the wiring seam (edited, not deleted).

**6b TELEMETRY FIX DONE + LIVE-VERIFIED (`ee8f831`):** OTLP endpoint → `http://signoz-otel-collector:4318`
(in-cluster; `localhost:10353` is unreachable inside a container). Changed in config.kdl + both schema
defaults + both `DEFAULT_ENDPOINT` constants + 2 config-test assertions; rum-endpoint untouched. **Verified:
`astra.strider` `SSR GET /` spans now land in SigNoz.** Fixes orator/weal/Dagster too on their next redeploy.
Tradeoff: host-run/dev can't resolve the name (pass `endpoint=` explicitly). Plaintext config has NO env
override (only secrets do).

**CI gotcha (slice 6b shipped a RED test lane, fixed in 7):** a TS lib with **no test file** fails
`bun test` ("0 test files matching") = exit 1, so `bun --filter '*' test` goes red. Every new TS lib needs at
least one test (added `libs/ts/site-kit/src/index.test.ts`). Watch the **aggregate exit code**, not just the
per-package "Exited with code 0" lines.

**0016 COMPLETE — all 7 slices pushed + live-verified.** Next subsystem = frontends 0011–0013 (copy strider
per the README). No open 0016 items.

**(historical 6b plan, now done) — `libs/ts/site-kit` + config + Dockerfile (DEPLOY-TOUCHING):**
- Create `libs/ts/site-kit`: `createSsrServer({serviceName, port})` lifting `server.ts` (KEEP the `ssr.fetch`
  contract — the smoke test asserts it; decide: keep programmatic `initTelemetry` like server.ts does, or use
  the now-signal-flushing preload); `startRum({serviceName})` + the `getRumEndpoint` server-fn factory (lift
  `src/observe/rum.ts` + `rumConfig.ts` — `@astra/observe/web` already owns `initRum`); the vite plugins
  `contentWatchPlugin`/`gothicFontsDevPlugin` (parameterize the hardcoded `factions.ts`/`layers.ts` invalidation
  list; resolve gothic via its package export, not `../../../`); `generateRouteTree`.
- **config-single-source:** move `serviceName` + `port` (10360) into `config.kdl`, read via `@astra/config`.
  `@astra/config` has **both** a py and a ts schema — mirror the addition in both (per [[config-single-source]];
  same gotcha bit orator). `vite.config.ts` is ESM and historically **can't import `@astra/config`** (see the
  frontend-gotchas note in [[astra-migration-research]]) — so the port for vite may need a different seam than
  the runtime read; verify.
- Templatize the Dockerfile with `ARG APP`; the runtime copies `content` + `src/generated` (content-pipeline-
  specific — note which COPYs are).
- **Then slice 7:** move faction/hex/skein/timeline/memoriam/editor logic + the domain components into
  `apps/strider/src/domain/`, leaving a thin reusable shell (Modal/ClientOnly/PixiHost/SiteHeader + the generic
  hooks); add a port-recipe README ("copy strider, delete `src/domain/`, replace `content/`, register sources,
  set serviceName/port in config.kdl").
- **6b acceptance includes a LIVE deploy re-verify** (`just up` + `just caddy-reload` + a `signoz_*` span check) —
  outward-facing/user-triggered ([[deploy-apply-with-just]], [[no-ci-monitoring]]). Don't run it without go-ahead.

**CI gotchas (bit us at `306808f`, after 6a):** (1) Adding a workspace member re-runs `bun install` which
**regenerates bun.lock AND can bump tools within their semver range** — biome `2.x`→`2.5.0` here, which is
stricter (new `suppressions/unused`, format tweaks). Reproduce CI **exactly**: `bunx biome ci .` on the WHOLE
repo, not `biome ci <scoped-path>` (scoped runs missed real violations the full run flags, incl. in untouched
files like gothic Button.tsx). (2) A **new workspace member breaks `--frozen-lockfile` in any Dockerfile that
copies only a partial manifest set** — bun recomputes the lock from present package.json's and the root
`apps/*`/`libs/ts/*` globs resolve the FULL workspace, so a partial set = "lockfile had changes". Every
service Dockerfile must COPY all five app manifests (strider's now does, mirroring orator). Verify with
`bun install --frozen-lockfile` at root + `docker compose build <svc>`.

**Decisions locked:** editor write-endpoint auth = accepted won't-fix ([[strider-editor-auth-accepted]]);
Nitro+bun-preset migration deferred until non-nightly (fold into `createSsrServer` then). Local CI lanes for any
slice: `bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build`.
