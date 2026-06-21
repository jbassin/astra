# NLSpec 0016 — strider template hardening

> **Numbering note:** originally drafted as `0015` (slices 1–6a were committed with `0015` in their commit
> messages) — renumbered to **0016** because `0015` is the reserved Phase-6 **cutover** sub-plan
> (`plans/0015-cutover.md`). Commit messages from slice 6b onward use `0016`.

**Status:** **IN PROGRESS — slices 1–6a of 7 BUILT + PUSHED** (`68fcff0`…`4658bcb`); resume at slice 6b.
Scope chosen (FULL template-readiness); originally ready for
`octo:embrace`. **Phase:** 5 (frontends — template prep). **Source review:**
[`../../shared/research/2026-06-21-strider-template-review-thoughts.md`](../../shared/research/2026-06-21-strider-template-review-thoughts.md)
(the multi-agent review; all findings carry `file:line` + severity). **Builds on:**
[`0014-strider-spec.md`](./0014-strider-spec.md) (the original lift).
**Process:** octo:spec → octo:embrace, per astra `CLAUDE.md`. **Honors memory:**
`config-single-source`, `telemetry-built-in`, `no-silent-scope-cuts`, `strider-editor-auth-accepted`,
`tanstack-start-skill`, `deploy-apply-with-just`, `no-ci-monitoring`.
**Blocks (as the SSR template):** `0011` akasha-fe, `0012` mouthpiece-fe, `0013` vellum-fe.

## Goal

strider works and is deployed (0014), but it is **not yet fit to be copied**: framework-idiom footguns
would clone into 0011–0013, and there is no separation between the reusable template skeleton and strider's
faction/hex/skein domain (a port today is "copy everything, delete by hand"). This spec hardens strider into
a **clean, idiomatic, well-tested, partly-extracted template**: fix the correctness/idiom mistakes, lock the
untested template spine with tests, dedup the load-bearing geometry, trim the worst perf cost, then extract
the genuinely-reusable pieces into shared libs (`libs/ts/site-kit`, `libs/ts/content-build`) and split
strider's own tree into a thin shell vs `src/domain/`. Net outcome: 0011 becomes "copy the shell, register a
content source, delete nothing domain-specific."

## Decisions in force

| # | Decision | Choice & rationale |
|---|---|---|
| D0 | Scope | **FULL template-readiness** (user-chosen) — in-place fixes **and** the lib extraction + `src/domain/` split. |
| D1 | Sequencing | **Correctness/idiom → tests → dedup → perf → observ+docs → extraction → domain split.** Tests land before the dedup/extraction refactors so behavior is locked first. Each slice = one CI-green commit (per-slice rhythm, `CLAUDE.md`). |
| D2 | Editor auth | **OUT OF SCOPE — accepted risk** ([[strider-editor-auth-accepted]]). Do not add auth/CSRF/middleware to the write path. |
| D3 | Nitro+bun migration | **DEFERRED** until TanStack Start's Nitro integration is non-nightly; will be folded into `site-kit`'s `createSsrServer` then. Two cheap, Nitro-independent insurance items ARE in scope: a test asserting `dist/server/server.js` exports `fetch`, and SIGTERM/SIGINT shutdown in `libs/ts/observe/src/telemetry.ts`. |
| D4 | `verbatimModuleSyntax` | Override to **`false`** in the **frontend** tsconfig(s) only (start-core skill's named HIGH mistake — server bundles leak into client). Do **not** flip it repo-wide; non-Start packages keep the base setting. |
| D5 | `CONTENT_HASH` | **Drop** it (emit + generated module) — verified zero consumers. If a real use appears later (cache-bust / `/health` provenance) it returns with a consumer, not as dead weight. |
| D6 | Extract-now vs defer | **Extract now** (D0). Risk of designing a shared lib against one consumer is mitigated by keeping the lib API minimal + parameterized and validated by strider still passing all gates after consuming it. |
| D7 | Config single-source | New per-app values the extraction introduces (`serviceName`, `port`) come from **config.kdl via `@astra/config`** ([[config-single-source]]) — no hardcoded port/name in `server.ts`/`vite.config`/Dockerfile beyond the one `ARG APP`. |

## Scope (in)

The seven slices below. Everything in the research doc's "Suggested sequence" §1–6 plus the architecture
extraction. PRESERVE list items (research doc) must remain intact and verified after each slice.

## Scope (out) / deferred

- **Editor write-endpoint auth** — accepted risk (D2).
- **Nitro+bun-preset migration** — deferred (D3); only the two insurance items are in scope.
- **Redesigning the faction/hex/skein domain** — the split relocates it, does not rewrite it.
- **RUM web-vitals / error capture** in `libs/ts/observe/src/web.ts` — note as a known gap; not required here (may be a follow-up). Surface, don't silently absorb ([[no-silent-scope-cuts]]).

---

## Slices

### Slice 1 — Framework-idiom & correctness fixes (low risk, in-place)
- `apps/strider/tsconfig.json`: override `verbatimModuleSyntax: false` (D4).
- `src/router.tsx`: add `defaultErrorComponent` + `defaultNotFoundComponent` to `getRouter()` (router-core
  skills require error/not-found handling; today a thrown loader error → bare fallback, no global 404).
- `src/routes/editor.tsx`: set `ssr: false` (Selective SSR — deployment skill); remove the now-redundant
  page-level `<ClientOnly>` gate around the editor tree (keep PixiHost's own client-only boundary).
- Delete 3 dead exports (verified zero callers): `pixiScene.ts` `dashedLinePath`, `editorHelpers.ts`
  `effectiveHexFactionMap` + `nowIsoUtc`.
- `pixiScene.ts`: rename the `fit()` helper → `fitToViewport()` and delete the misapplied
  `biome-ignore lint/suspicious/noFocusedTests` (the suppression only existed due to the `fit` name collision).
- **Acceptance:** error route renders a styled boundary; unknown URL renders the not-found component; `/editor`
  is not server-rendered (SSR smoke shows no editor canvas in initial HTML); no dead exports remain; no
  `noFocusedTests` ignore in app code. **CI:** `typecheck`, `bunx biome ci .`, `test`, `build` all green.

### Slice 2 — Lock the untested template spine (tests; before any refactor)
- Refactor `scripts/build-content.ts` to **export** its pure functions (`parseChange`, `parseLayer`,
  `splitBody`, `computeContentHash`) without changing behavior; add `scripts/build-content.test.ts`: each op
  happy-path + each `throw` branch (bad filename, missing timestamp, non-array changes, malformed hex pairs,
  unknown op), `splitBody` (hidden section / hidden member / no members), `computeContentHash` determinism +
  byte-sensitivity.
- Add `scripts/writeLayer.test.ts` (temp dir): traversal payloads (`../`, absolute, encoded) → rejected;
  bad filename shapes → rejected; empty/oversized → rejected; duplicate (`wx`) → rejected; happy path →
  file written at the expected relative path.
- Wire the empty `**/e2e/**` slot in `vitest.config.ts` with **one SSR smoke**: build, then assert a
  `fetch('/')` (or the SSR handler) returns 200 and contains a known marker string; and `/factions/<slug>`
  renders. (If a full Playwright lane is too heavy for CI now, a build+`ssr.fetch('/')` assertion satisfies
  the gate; record the choice.)
- Insurance (D3): a test asserting the built `dist/server/server.js` default export has a `fetch` method
  (fails loud on a TanStack Start version bump).
- **Acceptance:** new tests pass and meaningfully fail when the guard/parse logic is broken (spot-check by
  temporarily breaking one). **CI:** `test` green (build prerequisite for the SSR smoke documented).

### Slice 3 — Dedup the load-bearing geometry (safe now — tests lock behavior)
- One `hexCorners(q, r): HexVerts` and one exported `HEX_SIZE` and one `HEX_NEIGHBORS`, consumed by
  `hexUtils.ts` (both `computeAssignmentBorders` + `computeRegionBorders`) and `pixiScene.ts` (drop the
  duplicated `verts`/`hexVertsAtPixel`/`NEIGHBORS` copies and the "must match" comment-coupled constant).
- Share the region paint + skein helpers between the two renderers: lift `paintRegionFill`/`paintRegionBorder`
  (already in `EditorHexMap`) so `HexMap.setRegions`/`setHoveredRegion` use them; move `connKey` +
  `connectionEndpoints`/curve building into `skeinGeometry.ts`; add a shared `strokePolyline(g, points)`.
- Introduce a shared `mapTheme` constants object (colors/widths/alphas currently inlined in both renderers);
  source from gothic tokens where one exists.
- **Acceptance:** geometry/skein math has a single definition; `HexMap` + `EditorHexMap` import the shared
  helpers; all Slice-2 + existing geometry tests still pass (behavior unchanged); a `HEX_SIZE` change now edits
  exactly one site. **CI:** all four lanes green.

### Slice 4 — Trim the worst perf cost
- `pixi-filters` subpath import (`pixi-filters/glow`) in `HexMap.tsx` + `EditorHexMap.tsx` to drop the barrel
  (~20 unused filters); verify the pixi chunk shrinks (record before/after `wc -c` on the built chunk).
- `HexMap.setFactionState`: diff against the previous assignment and recolor/move only changed hex Graphics
  instead of destroy-recreate-all-per-step (reuse the existing `factionHexByCoord` map; keep listeners attached).
- Reuse one `GlowFilter` for hover (toggle `.enabled` / mutate color+strength) instead of allocating per
  hover-in.
- (Nice-to-have, same slice if cheap) incremental folds in `MapView` instead of re-slicing+re-folding the full
  prefix each step.
- **Acceptance:** measurable client-chunk reduction from the subpath import; timeline auto-play no longer
  destroys+recreates the full hex layer per step (verify via code + a render check); no visual/behavior
  regression (geometry tests + an SSR/editor smoke). **CI:** all lanes green; note the chunk delta in the commit.

### Slice 5 — Observability completeness + doc hygiene (small)
- `libs/ts/observe/src/telemetry.ts`: register SIGTERM/SIGINT → `shutdown()` force-flush (so the preload path
  doesn't drop buffered spans; benefits orator/weal/vellum too). Keep idempotent.
- `writeLayerFn`: wrap the handler in a span (filename attr, ERROR status on validation/write failure), emit a
  counter (e.g. `strider.editor.writes`), and replace `writeLayer.ts`'s `console.log` with
  `getLogger("astra.strider").emit(...)` (the mutating op + its audit trail reach SigNoz —
  [[telemetry-built-in]]).
- Rewrite `content/layers/README.md` + `content/layers/CLAUDE.md` to the **SSR + server-fn** reality (delete
  the port-3001 sidecar / "statically exported" narrative).
- Drop `CONTENT_HASH` (D5): remove `emitContentHash`/`computeContentHash` emission + `src/generated/contentHash.ts`
  (keep `computeContentHash` only if Slice-2 tests it as a pure util worth retaining; otherwise remove with its test).
- **Acceptance:** a SIGTERM during a request flushes spans (verify via `signoz_*` MCP that the SSR span + a
  `writeLayer` span land); stale docs gone; no dangling `CONTENT_HASH` references. **CI:** all lanes green; the
  observe lib's own tests pass.

### Slice 6 — Extract the reusable skeleton into shared libs (the big one)
- **`libs/ts/content-build`** (new): the generic pipeline — markdown→HTML (remark), frontmatter (gray-matter),
  content-hash util, `emit` with the AUTO-GENERATED header, gitignore emit, and a `defineContentSource({ dir,
  parse, emit })` registry. strider's `build-content.ts` becomes a thin registration of two sources
  (`factions`, `layers`) that still imports its **domain** fold/geometry logic (which moves in Slice 7).
- **`libs/ts/site-kit`** (new): `createSsrServer({ serviceName, port })` (lift all of `server.ts`),
  `startRum({ serviceName })` + the `getRumEndpoint` server-fn factory (lift `src/observe/rum.ts` +
  `rumConfig.ts`), the vite plugins `contentWatchPlugin`/`gothicFontsDevPlugin` (parameterize the hardcoded
  invalidation list + resolve gothic via its package export, not a `../../../` climb), and `generateRouteTree`
  (lift `generate-routes.ts`). Optionally a `viteConfig({ port, serviceName, plugins })` helper so an app's
  `vite.config.ts` is ~5 lines.
- **Single service-name + port source** (D7): `serviceName` + `port` come from config.kdl via `@astra/config`;
  strider passes them into `createSsrServer`/`startRum`/root `head()`; the `-rum` suffix derives from
  `serviceName`. Add the strider entry to `ontology/ontology-config` + the `@astra/config` TS schema (mirror
  the py schema only if the loader requires parity — per [[config-single-source]]).
- **Templatize the Dockerfile** with `ARG APP` so the `apps/<name>` paths and content/generated COPYs are
  driven by one knob; document which COPY lines are content-pipeline-specific.
- strider consumes both new libs; `server.ts`/`vite.config.ts`/`rum.ts`/`rumConfig.ts` shrink to thin app-level
  callers (or are deleted where fully lifted).
- **Acceptance:** strider builds, typechecks, tests, and **deploys** identically via the libs (no inlined
  service name/port outside config.kdl + the one `ARG APP`); `bun --filter '*' {typecheck,test,build}` green
  across the workspace (the new libs included); the deployed service still serves SSR + RUM + editor write
  (re-verify per [[deploy-apply-with-just]]: `just up` + `just caddy-reload` + curl + a `signoz_*` span check).
  **CI:** all TS lanes green workspace-wide.

### Slice 7 — Split strider's tree: reusable shell vs `src/domain/` (last)
- Move all faction/hex/skein/timeline/memoriam/editor logic + the domain components into `apps/strider/src/domain/`
  (hexUtils, regions, skein, factions, layers, timeline, memoriam, editorHelpers; HexMap/EditorHexMap/MapView/
  FactionDetail/FactionSymbol/MemoriamPanel/TimelineStrip/Editor/*; the domain fold/geometry that
  content-build's source-registration imports). Keep generic hooks (`useIsMobile`, `useFocusTrap`) and shells
  (`Modal`, `ClientOnly`, `PixiHost`, `SiteHeader` as a pattern) in the reusable `src/lib`/`src/components`
  (or move the two generic hooks to gothic).
- Add a **template README** documenting the port recipe: "copy strider's shell, delete `src/domain/`, replace
  `content/`, register your content sources, set `serviceName`/`port` in config.kdl."
- **Acceptance:** the reusable-vs-domain boundary is obvious from the tree (a porter can `rm -rf src/domain` +
  `content/*` and have a compiling shell); strider still passes all four lanes + the deploy/RUM/editor
  re-verify. **CI:** all lanes green.

---

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | All four CI lanes green per slice and at the end: `uv`/`bun --filter '*' {typecheck,test,build}` + `bunx biome ci .` | run locally ([[no-ci-monitoring]]) |
| B | `verbatimModuleSyntax: false` in the frontend tsconfig; error + not-found boundaries render; `/editor` is `ssr:false` | code + SSR smoke |
| C | build-content parsers + `writeLayer` guards + an SSR smoke + the `ssr.fetch`-exists test all covered and passing | `test` lane |
| D | Hex geometry / `HEX_SIZE` / `HEX_NEIGHBORS` defined once; renderers share paint/skein helpers; no dead exports; no mis-applied biome-ignore | code review + tests |
| E | Measurable pixi-chunk reduction (subpath import); hex updates incremental, not destroy-recreate-all | chunk `wc -c` before/after + code |
| F | `telemetry.ts` flushes on SIGTERM/SIGINT; `writeLayer` traced (span+counter+log); stale layer docs rewritten; `CONTENT_HASH` removed | `signoz_*` MCP + code |
| G | `libs/ts/site-kit` + `libs/ts/content-build` exist and strider consumes them; service name/port from config.kdl; Dockerfile `ARG APP` | workspace build + code |
| H | strider re-deploys via the libs and still serves SSR + RUM + editor write | `just up` + `just caddy-reload` + curl + `signoz_*` ([[deploy-apply-with-just]]) |
| I | `src/domain/` split done; template README documents the port recipe; a porter can delete domain + content and still compile | tree + a compile check |

## Risks

1. **Template drift (the #1 risk, again).** Whatever lands here is what 0011–0013 inherit — now including the
   lib API surface. Keep `site-kit`/`content-build` minimal + parameterized; validate by strider passing every
   gate after consuming them.
2. **Refactor regression in the geometry/skein dedup (Slice 3) and incremental hex updates (Slice 4).** Mitigated
   by Slice 2 landing first — the parser/guard/geometry tests must stay green; add a render/SSR smoke.
3. **Extraction breaks the deployed service** (Slice 6 changes server/vite/Docker/config wiring). Mitigated by
   re-running the full deploy-verify loop, not just the build ([[deploy-apply-with-just]]); port + name now flow
   from config.kdl, so a mismatch surfaces at load.
4. **Designing a shared lib against one consumer** (D6). Accept the risk but keep the API thin; expect a small
   follow-up when 0011 is the second consumer.
5. **`telemetry.ts` shutdown change touches a shared lib** used by orator/weal — keep it additive + idempotent;
   run the observe lib's tests.
6. **Scope creep into the deferred items.** Editor auth (D2) and Nitro (D3) stay out; if a slice tempts toward
   them, stop and surface it ([[no-silent-scope-cuts]]).

## Hand-off (the template for 0011–0013)

After 0015, the port recipe for akasha-fe / mouthpiece-fe / vellum-fe is: scaffold an app that consumes
`@astra/site-kit` (thin `server.ts`/`vite.config.ts` via `createSsrServer`/`viteConfig`, `startRum`) and
`@astra/content-build` (register the app's content sources), copy strider's reusable shell, **omit**
`src/domain/`, supply `content/`, and set `serviceName`/`port` in config.kdl. The build-content → generated-
modules → route-loader pattern and the SSR-Compose-behind-Caddy + RUM deploy wiring now live in libs, not in
copied files.
