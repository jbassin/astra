---
date: 2026-06-21
subsystem: strider
kind: review (template-readiness)
status: reviewed — actionable backlog below; no code changed
reviewers: 6 parallel agents (TanStack idioms, architecture/reuse, clean-code, performance, security+observability, testing) + synthesis
scope: apps/strider — the SSR frontend TEMPLATE that frontends 0011–0013 will be copied from
---

# strider template review — in-depth, principled

A multi-agent critical review of `apps/strider` before it is blessed as the copy
template for the remaining TanStack Start frontends (0011–0013). Reviewed against the
bundled TanStack skills (`@tanstack/react-start` 1.170.x, `@tanstack/react-router`
1.171.x, `@tanstack/router-plugin` 1.168.x — under `node_modules/.bun/@tanstack+*/…/skills/`),
the astra standing principles, and template-reuse goals.

**Verdict:** a genuinely high-quality app with a sound core pattern, but **not yet ready
to bless as the template**. Two classes of problem dominate:
1. *Correctness/idiom footguns that get cloned verbatim* into every future frontend.
2. *Zero physical separation between the reusable skeleton and strider's faction/hex/skein
   domain* — every port today is "copy everything, then delete by hand."

Premise correction worth recording: `scripts/writeLayer.ts` is **well-validated**
(regex allowlist + `path.resolve`/`startsWith(LAYERS_DIR + path.sep)` traversal guard +
64 KiB cap + `wx` no-overwrite). The earlier worry about an "unvalidated write" is wrong;
the only security gap is **auth on the endpoint**, which has been deliberately accepted
(see below + memory `[[strider-editor-auth-accepted]]`).

---

## Decisions taken during this review

- **Editor auth gap — ACCEPTED (won't fix).** Personal, low-traffic site; the low
  probability of a bad actor outweighs the complexity of real auth, and `writeLayer.ts`
  already blocks the damaging cases (no traversal, no overwrite). Recorded in memory.
- **Nitro + bun-preset migration — DEFERRED.** Interesting and on the sanctioned path,
  but blocked by the `nitro-nightly` dependency (incompatible with this repo's pin-everything
  ethos) and `server.ts` is working+deployed. Revisit when TanStack Start's Nitro integration
  ships non-nightly, and do it inside the proposed `site-kit` lib. Full analysis at the end.

---

## Top priorities (cross-cutting, ranked)

1. **[High] `verbatimModuleSyntax: true` (`tsconfig.base.json:14`)** — the start-core skill's
   named HIGH mistake: *"causes server bundles to leak into client bundles. Keep it disabled."*
   Repo-wide, so every Start app inherits it. Override to `false` in the frontend tsconfigs at
   minimum (validate against non-Start packages that may want it on).
2. **[High] No error/not-found boundaries anywhere** — `router.tsx` has no
   `defaultErrorComponent`/`defaultNotFoundComponent`; no route has `errorComponent`. Any thrown
   loader error → bare framework fallback; no global 404. Router-core skills say you must have these.
   Add to `getRouter()`. (`factions.$slug.tsx` correctly handles its own `notFound()`, but that's local.)
3. **[High/Architecture] Nothing reusable is extracted to a lib — the template is pure copy-paste.**
   `server.ts`, `src/observe/rum.ts`+`rumConfig.ts`, `scripts/contentWatchPlugin.ts`,
   `gothicFontsDevPlugin.ts`, `generate-routes.ts`, most of `vite.config.ts`/`Dockerfile`/`tsconfig`
   will be near-identical across sites (rum.ts's own header calls itself "the per-frontend seam that
   0011-0013 copy"). N copies to fix on every TanStack bump. **Highest-leverage change:** extract
   `libs/ts/site-kit` (`createSsrServer({serviceName, port})`, `startRum({serviceName})`, the vite
   plugins, route-tree gen) + `libs/ts/content-build` (generic markdown→HTML / frontmatter /
   content-hash / emit, with a `defineContentSource` registry).
4. **[High/Architecture] No tree separation between skeleton and domain.** `scripts/build-content.ts`
   is 449 lines hardcoded to factions+layers+hexes; `src/lib/` mixes 3 generic hooks with ~1,300 lines
   of domain logic flat in one dir; `components/` is ~95% domain. A porter can't tell "keep" from
   "delete." Split into `src/domain/` vs a thin reusable shell; document "copy strider, delete
   `src/domain/`, replace `content/`."

---

## Findings by theme

### Performance (measured)
- **[High]** Pixi.js + pixi-filters = **861 KB raw / 247 KB gzip**, dominant client cost, eagerly
  loaded on every route (PixiHost background mounts in `__root.tsx:40`). `import { GlowFilter } from
  "pixi-filters"` pulls the whole barrel (only GlowFilter used). Fix: `pixi-filters/glow` subpath +
  Pixi granular entry points.
- **[Med]** `setFactionState` destroys+recreates every hex Graphic and its 3 listeners on every
  timeline step (`HexMap.tsx:268-324`); auto-play does this across 102 layers. Diff and mutate instead.
- **[Med]** GlowFilter allocated per hover (`HexMap.tsx:526`) thrashes GPU objects; reuse one and toggle `.enabled`.
- **[Med]** Per-step folds re-slice + re-fold the whole prefix (`MapView.tsx:82-115`) — O(n²) over playback; fold incrementally.
- **[Low]** Full 137 KB LAYERS dataset ships as a client chunk — correctly NOT double-shipped via SSR
  (no loader), but eagerly fetched/parsed before the map renders. Acceptable; revisit if a copy target's data grows.

### Clean code / maintainability
- **[High]** Hex geometry implemented 3× and `HEX_SIZE`/`NEIGHBORS` duplicated (`hexUtils.ts:114-126,189-201`;
  `pixiScene.ts:10-25`) — kept in sync by a comment. Single most important cleanup: one `hexCorners()`,
  one exported `HEX_SIZE`, one `HEX_NEIGHBORS`.
- **[High]** Region fill+border paint duplicated within HexMap (`setRegions` vs `setHoveredRegion`,
  ~40 lines + magic colors); EditorHexMap already extracted `paintRegionFill`/`paintRegionBorder` — adopt them.
- **[High]** Misapplied `biome-ignore noFocusedTests` (`pixiScene.ts:74`) — a helper literally named
  `fit()` tripped the test-only rule; the suppression "fixes" it by name collision. Rename to
  `fitToViewport`, delete the ignore.
- **[Med]** Three dead exported functions (verified zero callers): `pixiScene.ts:37 dashedLinePath`,
  `editorHelpers.ts:50 effectiveHexFactionMap`, `editorHelpers.ts:152 nowIsoUtc`. Delete.
- **[Med]** `buildScene` is an 880-line closure (`HexMap.tsx:210-1089`); extract the skein subsystem
  (~270 lines) like `animationManager`/`skeinGeometry` already were.
- **[Med]** Map colors/widths are magic literals scattered across both renderers — shared `mapTheme`
  (ideally from gothic tokens) names them once and keeps the two renderers in agreement.
- **[Med]** Pixi type casts (`balatroBackground.ts:114`, `HexMap.tsx:450,501`, `as Texture` reads) —
  wrap in one typed helper rather than copying the cast pattern into every site.

### Testing
- **[High]** The build-content pipeline and `writeLayer.ts` security guards have **zero tests** — both
  pure, no new tooling, both template spine. The traversal/regex/size/`wx` guards should be regression-locked.
- **[Med]** No SSR render test / no e2e — `vitest.config.ts` reserves an `**/e2e/**` slot that's never
  filled. CI can be fully green while SSR, the build pipeline, or the editor write break. One Playwright
  smoke (`/` + `/factions/<slug>`) is best ROI.
- **[Med]** Editor reducer + modeHandlers + timeline `dotIndices`/`visibleEntries` untested — all pure.
- The ~60% that IS tested is high quality (invariants/round-trips, zero brittle snapshots) — good model to copy.

### Observability
- **[Med]** The one mutating op (`writeLayerFn`) is untraced — only a `console.log`, no span/metric/OTLP
  log. Wrap in a span + counter + structured log (doubles as the editor audit trail). NB: moving the
  per-request span to a request middleware (see Nitro section) would trace server functions for free.
- **[Low]** RUM captures only a page-load span — no error capture, no web-vitals (lives in
  `libs/ts/observe/src/web.ts`, so fixing it benefits all frontends). Add or explicitly scope as deferred.

### Framework idioms (additional)
- **[Med]** `/editor` SSRs a client-only canvas view — should be `ssr: false` per the deployment skill's
  Selective SSR, which also lets you drop the manual `<ClientOnly>` page gate.
- **[Med]** Custom Bun `server.ts` is off the sanctioned host path — depends on the internal shape of
  `dist/server/server.js` (`ssr.fetch`), which can change between minors. Add a test asserting `ssr.fetch`
  exists (fail loud on bump), or migrate to Nitro (deferred — see below). Static-serve guard compares
  `startsWith(CLIENT_DIR)` without a trailing separator — use `+ path.sep` like `writeLayer.ts` does.
- **[Low]** Stale docs — `content/layers/README.md` + `CLAUDE.md` still describe the deleted port-3001
  sidecar and a "statically exported" site; rewrite to SSR/server-fn reality. `CONTENT_HASH` is emitted
  with zero consumers — wire or drop.

### Architecture / portability hazards
- **[High]** `build-content.ts` (build script) imports from `src/lib` (runtime) — backwards direction for
  a template; and `writeLayerFn.ts:2` (runtime) imports `../../../scripts/writeLayer` (build dir). Shared
  types should live in a neutral place; move `writeLayer.ts` out of `scripts/` (it's runtime-invoked).
- **[High]** `astra.strider` service name inlined in 4+ places (`server.ts:28,31`, `rum.ts:14` `-rum`,
  `__root.tsx:18-20` title/description). One `SERVICE_NAME` constant / lib-injected `serviceName`.
- **[Med]** Port 10360 hardcoded in `vite.config.ts:12`, `server.ts:19`, `Dockerfile:29,44`. Source from
  config.kdl (config-single-source) or one shared constant.
- **[Med]** Dockerfile strider-pathed throughout + copies content/generated dirs; templatize with `ARG APP`.
- **[Med]** `parseChange`/`parseLayer` validation duplicated between build (`build-content.ts:138-291`) and
  runtime (`regions.ts` union) — comment literally says "mirrors src/lib/layers.ts". A shared **Zod** schema
  (repo principle #2 — KDL/Zod at the edges) would collapse the drift and model the right pattern for ports.
- **[Low]** `gothicFontsDevPlugin` hardcodes `../../../libs/ts/gothic/src/fonts`; `writeLayer.ts` resolves
  `LAYERS_DIR` from `process.cwd()` (fragile — resolve via `import.meta.url`).

---

## What to PRESERVE (copy these forward)
The build→runtime contract (gitignored, type-importing, auto-generated `src/generated/*`; zero fs/remark
in the client bundle); `getRouter()` factory + root document shell (`HeadContent`/`Scripts`/`head()`);
RUM via post-hydration dynamic import; `getRumEndpoint` as the textbook server-fn config seam; PixiHost's
leak-free single-GL-context lifecycle; `prefers-reduced-motion` gating; `useIsMobile` via
`useSyncExternalStore`; split value/setter contexts; the ref-based stable-callback escape hatch; server.ts
telemetry-from-day-one (guarded init, per-request span, SIGTERM flush); invariant/round-trip test style;
separate `vitest.config.ts` + content-generating global-setup; `factions.$slug.tsx` as the model
loader→`head()`→`notFound()` route.

---

## Suggested sequence before blessing the template
1. Flip `verbatimModuleSyntax` to false (frontend tsconfigs).
2. Add error/not-found boundaries to `getRouter()`.
3. Add the two pure test files (build-content, writeLayer); fix the `noFocusedTests` mis-suppression; delete the 3 dead exports.
4. The lib extraction (`site-kit` + `content-build`) + `src/domain/` split — the big one, but what makes every future port cheap.
5. Geometry/dedup cleanups; rewrite stale layer docs; wire-or-drop CONTENT_HASH.
6. Cheap insurance now: a test asserting `dist/server/server.js` exports `fetch`; add SIGTERM/SIGINT shutdown to `libs/ts/observe/src/telemetry.ts`.

---

## Appendix — Nitro + bun-preset migration analysis (DEFERRED)

### What `server.ts` does today
Four responsibilities: (1) telemetry init `initTelemetry("astra.strider")`; (2) static asset serving
(`Bun.serve` + `isFile`/`CLIENT_DIR` + traversal guard); (3) per-request SSR span wrapping `ssr.fetch`;
(4) graceful shutdown SIGTERM/SIGINT → `telemetry.shutdown()` (force-flush BatchSpanProcessor). Also
depends on the internal shape of `dist/server/server.js` (`ssr.fetch`) — the off-sanctioned-path fragility.

### What the migration entails
- **Vite:** `plugins: [..., tanstackStart(), nitro({ preset: "bun" }), viteReact()]`. ⚠️ dep is
  `nitro@npm:nitro-nightly@latest` per the deployment skill.
- **Output:** moves from `dist/server`+`dist/client` to `.output/`, started `bun .output/server/index.mjs`.
  Static assets served by Nitro for free → **delete responsibility #2** (~25 lines incl. the traversal guard).
- **Per-request span → request middleware** in `src/start.ts` via `createMiddleware().server(...)` +
  `createStart({ requestMiddleware: [...] })`. Bonus: request middleware runs on SSR **and** server
  functions → traces `writeLayerFn` for free (closes the observability Med finding). Needs rework to set
  status/attributes from `next()`'s result rather than a raw Response.
- **Telemetry init+shutdown → the preload (the crux).** Nitro owns the entry, so use the lib's already-built
  `bun --preload @astra/observe/preload .output/server/index.mjs` with `OTEL_SERVICE_NAME=astra.strider`.
  This inits OTel before app modules load — more correct than today (the static `import ssr` is hoisted
  above the `initTelemetry()` call). **BUT `libs/ts/observe/src/telemetry.ts` does NOT register
  SIGTERM/SIGINT shutdown** — switching to the preload as-is **regresses** the force-flush-on-stop that
  `server.ts` does correctly today (buffered spans drop on container stop). Must add ~5 lines of signal
  handling to `telemetry.ts` (good change regardless — orator/weal/vellum benefit).
- **Dockerfile/Compose/Caddy:** copy `.output/` not `dist/`+`server.ts`; change CMD to the preload
  invocation; re-verify with `just up` + `just caddy-reload` (port 10360 stays; bun preset honors PORT).
- **Runtime file-layout gotcha:** the editor's `writeLayer.ts` writes to `process.cwd()/content/layers`
  and `@astra/config` walks up to `ontology/ontology-config`. Nitro changes output layout + dep bundling,
  so both need re-verification and likely the `import.meta.url`-relative fix. Most likely source of a surprise.

### Pros
On the sanctioned path (kills the `ssr.fetch` dependency, survives version bumps); less hand-rolled code +
better asset handling (caching/range/compression); one span definition covers SSR + server functions;
more-correct OTel ordering via the lib's preferred preload; re-targetable host via preset; big template
leverage if done once inside `site-kit`.

### Cons
**Nitro nightly dependency** (a moving, unpinned target — contradicts the repo's pin-everything ethos —
the dealbreaker for now); must re-establish flush-on-stop or regress it; Nitro's bun preset less
battle-tested; real validation surface (Docker/Compose/Caddy + two runtime file-path assumptions) on a
**deployed, working** service; trace-tree reshaping. ROI for strider alone is modest — it's a
correctness/maintainability improvement, not a bug fix.

### Recommendation
Don't migrate strider now. Instead: (1) add the `ssr.fetch`-exists test as cheap insurance; (2) add
SIGTERM/SIGINT shutdown to `telemetry.ts` (free win, Nitro-independent); (3) revisit Nitro+bun when the
TanStack integration ships **non-nightly**, folded into the `site-kit` extraction so it's done once for
all frontends. Related memory: `[[tanstack-start-skill]]`, `[[telemetry-built-in]]`,
`[[config-single-source]]`, `[[deploy-apply-with-just]]`.
