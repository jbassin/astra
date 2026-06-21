---
name: strider-0016-gotchas
description: strider template-hardening (spec 0016) — load-bearing gotchas + the resume-at-6b plan; slices 1–6a built+pushed
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

**RESUME AT SLICE 6b — `libs/ts/site-kit` + config + Dockerfile (DEPLOY-TOUCHING):**
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

**Decisions locked:** editor write-endpoint auth = accepted won't-fix ([[strider-editor-auth-accepted]]);
Nitro+bun-preset migration deferred until non-nightly (fold into `createSsrServer` then). Local CI lanes for any
slice: `bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build`.
