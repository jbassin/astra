# NLSpec 0013 — vellum-frontend (the PF2e document forge: editor + render service)

**Status:** **BUILT — all 7 slices DONE + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE** (`3835dae`(s1)…
`f1171fd`(s7), 2026-06-23). Two Compose units healthy (vellum-frontend 10367 + vellum-render 10368);
containerized Chromium renders a real PNG; SigNoz has `astra.vellum-frontend` SSR + `astra.vellum-render`
render spans; the VR gate passes 0.000% drift on 7 fixtures in the pinned container. **Spec-sanctioned
deferral:** the `vellum.iridi.cc` DNS record (outward-facing; Caddy block authored + validated, faerrin's
block decommissioned). See `[[vellum-frontend-0013-gotchas]]`. (Originally: SPEC pre-implementation.) Scope
gate COMPLETE (`ab04539`/`0dba4ef`, 2026-06-23,
[`../../shared/research/2026-06-23-vellum-frontend-0013-thoughts.md`](../../shared/research/2026-06-23-vellum-frontend-0013-thoughts.md)).
This spec builds on that verified scope doc and carries **D1–D6 settled** (D2/D4/D5 locked with the user
2026-06-23; D1/D3/D6 accepted). The **final frontend** (Phase 5); after it → Phase-6 cutover (`0015`).
**Source plan:** [`../plans/0013-vellum-frontend.md`](../plans/0013-vellum-frontend.md) (dated 2026-06-19,
**pre-Decision-I details** — the scope gate resolved the implementation shape; this spec supersedes the
plan's implicit assumptions, see *Decisions in force*).
**Process:** scope → spec (authored from the verified scope doc + locked decisions) → octo:embrace, Claude
team mode (typescript-pro, frontend-developer, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** `0004` vellum-lang (`parseDocument`/`compileVss`/`DOCUMENT_KINDS`/fields/timeline/crossref),
`0003` gothic (`DocumentView` + grime + `theme.css` + `fontsDir`), Phase 1 (`@astra/config`,
`@astra/observe`+`/web`), `0014` strider (the SSR template + `@astra/site-kit`; the `ssr:false` editor route
+ `createServerFn` RUM seam), `0011`/`0012` (the worked frontend examples — copy the scaffold/deploy).
**No pipeline dependency.**
**Phase:** 5 (frontends). The **only non-read-surface frontend** (an interactive editor) and the **only**
subsystem that ships a **browser-in-a-container** + a **visual-regression CI gate** — both net-new to astra.

## Goal

Port faerrin's `vellum` — a CodeMirror editor that authors vellum source, previews it live (parse via
**`@astra/vellum-lang`**, render via **`@astra/gothic`**), manages multiple docs, shares via URL, and
exports a pixel-faithful PNG — into astra as **two Compose units**:

1. **`apps/vellum-frontend`** (port **10367**) — a **TanStack Start SSR** app (Decision I) whose **editor
   route is `ssr:false`** (the editor is inherently client-only: CodeMirror + `localStorage`). The React
   components from faerrin `src/app/` port ~verbatim; the render/parse logic is now a dependency
   (`@astra/{vellum-lang,gothic}`), so this is the **editor shell**, not a renderer rewrite.
2. **`apps/vellum-render`** (port **10368**) — a **Bun.serve + Playwright** render service: a warm headless
   Chromium, per-request isolated contexts, egress-blocked, semaphore-gated; serves a plain-Vite-built
   render-entry page exposing `window.vellumRender(source, mode)`, screenshots `[data-vellum-export]`,
   returns `image/png`. Lifted ~verbatim from faerrin, re-pointed at gothic, with telemetry added.

Telemetry from day one for **both** services; a **visual-regression gate** with goldens regenerated against
astra-gothic output, run in a pinned CI container.

## Decisions in force (settled — scope §4)

- **D1 — Editor hosting = SSR shell + `ssr:false` editor route (ACCEPTED).** SSR app (template/telemetry/RUM/
  Caddy edge) with the editor route `ssr:false` (strider precedent) — keeps CodeMirror off the SSR path.
- **D2 — Two apps + same-origin `/render` via Caddy (LOCKED ✅).** `vellum-frontend` (10367) +
  `vellum-render` (10368) are separate Compose units. The browser POSTs **same-origin** (`RENDER_URL=""`);
  **Caddy `vellum.iridi.cc` routes `/render`+`/health` → vellum-render, `/editor` → vellum-frontend
  (local-only), everything else → vellum-frontend.** This is faerrin's exact pattern (its block already
  proxies `/render`+`/health` to the service) — dev uses the Vite proxy. The render-entry page +
  `render.html` live in **vellum-render** (plain Vite — not a TanStack surface), so vellum-frontend stays a
  clean single-entry Start app.
- **D3 — vellum-render base image = bun-slim + apt Chromium deps (ACCEPTED).** Keep `oven/bun:1.3.14-slim`,
  `apt-get install` Playwright/Chromium system libs + `bunx playwright install --with-deps chromium`,
  **pinning the Chromium version** (orator precedent: apt-gets ffmpeg onto the same base). Share that exact
  pin with the CI VR container (D4). `--no-sandbox` required.
- **D4 — Visual-regression gate ships in 0013 (LOCKED ✅ — not deferred).** Port faerrin's pixelmatch
  script + fixtures, **regenerate goldens against astra-gothic's void palette** (a new-baseline regression
  gate, not a faerrin-parity gate), and add a pinned `oven/bun:1.3.14` + `PLAYWRIGHT_BROWSERS_PATH` CI job
  sharing the render image's Chromium pin.
- **D5 — Drop the `⇄ Syntax` button (LOCKED ✅).** No `canonicalToVss` port, no 0004 follow-on. **VSS
  authoring (O3) is fully preserved**: typed VSS compiles inside `parseDocument`, the palette emits VSS
  snippets, the VSS grammar/highlight stays. Only the explicit canonical↔VSS toggle is removed;
  `compileVss` is never called directly by the editor.
- **D6 — New full-vellum authoring is genuinely new surface (ACCEPTED).** faerrin's palette predates
  full-vellum; add `:::fields`/`:::timeline`/`[[crossref]]` snippets + templates + highlight decoration.

## Scope (in)

Slices (each CI-green before commit; push on chunk completion; reproduce the relevant lane locally per
[[no-ci-monitoring]]):

1. **Scaffold `apps/vellum-frontend`** from the strider/akasha SSR shell (`server.ts`, `vite.config.ts` with
   **`--configLoader runner`** + `@tailwindcss/vite` + `gothicFontsPlugin`, `vitest.config.ts`,
   `tsconfig.json`, templated `ARG APP` `Dockerfile`, `scripts/generate-routes.ts`, `src/router.tsx` +
   boundaries, `src/observe/{rum,rumConfig}.ts` with `cfg.vellumFrontend` via the `createServerFn` seam,
   `src/components/ClientOnly`, `src/styles` importing `@astra/gothic/theme.css`). Depend on
   `@astra/{site-kit,gothic,vellum-lang,observe,config}` (`workspace:*`) + `@types/mdast` (dev) + the
   CodeMirror/`@lezer`/`lz-string` deps. **`contentWatchPlugin` is NOT used** (no committed markdown corpus —
   content is user-typed). **Config namespace** `vellum-frontend { service-name "astra.vellum-frontend";
   port 10367; public-origin "https://vellum.iridi.cc" }` in `config.kdl`, **mirrored in both**
   `libs/ts/config` (Zod, `.strict()`) **and** `libs/py/config` (Pydantic), with tests in both. Telemetry-first
   via `createSsrServer` ([[telemetry-built-in]]). Add `apps/vellum-frontend` to `pyproject.toml` uv `exclude`.
   A trivial `index` route + an `ssr:false` `/editor` placeholder route + **≥1 test** (else `bun test` exits 1).
   CI-green skeleton that boots SSR.

2. **Editor port (faerrin `src/app/` → `src/domain/`, ~verbatim).** Port, behind the `ssr:false` `/editor`
   route (so no `<ClientOnly>` gymnastics inside):
   - **`Editor.tsx`** — uncontrolled CodeMirror 6; doc-switch reseeds via `key={loadKey}` remount with fresh
     `initialValue`; live keystrokes `onChange→setSource`. Extensions: `basicSetup`,
     `markdown({extensions: vssMarkdown})`, `vssHighlighting`, `vellumHighlighting`, `slashComplete`,
     `tabIndents` (`Prec.low`), `lineWrapping`, a **gothic-var-only** `EditorView.theme` (NFR-3: no hex), the
     update listener.
   - **`Preview.tsx`** — `parseDocument(source,{mode})` → `<DocumentView document={…}/>` **with no
     `resolveCrossref`** (crossrefs render as styled placeholders — correct for an authoring tool); wrap in
     `useDeferredValue`.
   - **`docStore.ts`** (pure reducers, `localStorage` `"vellum:docs"` + legacy migration), **`slashComplete.ts`**
     (9 VSS-emitting commands), **`templates.ts`** (6 canonical templates), **`shareLink.ts`**
     (`#doc=<lz-string>`, `MAX_HASH_LENGTH=8000`, open-as-new-doc + strip-hash), **`vssLanguage.ts`**
     (`@lezer/markdown` grammar; imports `DOCUMENT_KINDS` from `@astra/vellum-lang`), **`vellumHighlight.ts`**
     (gothic-var re-theme + directive/SIGIL decoration + `vssFold`), **`welcomeDoc.ts`**, **`useExport.ts`**
     (the export state machine — wired to the POST in slice 5).
   - **Drop `convertSyntax`/the ⇄ Syntax button + its `compileVss`/`canonicalToVss` direct calls (D5).**
   - Port the faerrin `src/app/` tests verbatim: `docStore.test.ts`, `shareLink.test.ts`,
     `vssLanguage.test.ts`. App boots, edits, previews, switches/saves docs, shares.

3. **New full-vellum authoring (D6).** Add to the slash palette + template gallery + highlight decoration:
   - `:::fields` (a `Term :: value` block), `:::timeline` (entries with optional `{marker}`), `[[crossref]]`
     (an inline cross-ref insert) — palette snippets + **≥1 template each**. Decide per-construct whether VSS
     sugar is offered (canonical-only snippet vs a `@fields`/`@timeline` form) and decorate accordingly in
     `vellumHighlight`/`vssLanguage`. Verify each renders via the live preview (`parseDocument` already
     supports all three). **R2 sync test:** assert the editor's known SIGIL/directive set ⊆ what
     `parseDocument` lowers (catches a `surface.ts` desync).

4. **Scaffold `apps/vellum-render`** (Bun.serve + plain-Vite render-entry). Lift ~verbatim from faerrin
   `src/server/` + `scripts/render-server.ts` + `render-entry/` + `render.html`:
   - **Server (`Bun.serve`)** on config `port` (**10368**): `GET /health` → `{ok,ready,queued}`;
     `POST /render` (JSON `{source,mode,scale}` → `image/png`; per-IP 60/min rate limit; specific 4xx/5xx text
     errors); static-serve the built `dist/` otherwise; CORS allow-list incl. `https://vellum.iridi.cc`.
     Warm Chromium **before** listening; `SIGINT/SIGTERM` → close browser + flush telemetry + stop.
   - **`renderService.ts`** — `chromium.launch({args:["--no-sandbox"]})`, one warm browser; fresh
     `BrowserContext` per request (`deviceScaleFactor: scale`), closed in `finally`; **egress block (SEC-3)**
     `context.route("**/*")` continue only `baseUrl`/`data:` else abort; **`Semaphore(2)`**; load
     `${baseUrl}/render.html`, `window.vellumRender(source,mode)`, wait `[data-vellum-export]` visible,
     **pixel-area cap (SEC-4)**, `target.screenshot({type:"png"})`. `caps.ts` (`RENDER_LIMITS` 64KiB / scale
     1–4 / 8000² / 15s; `validateRenderRequest` pure). `playwright` is a **runtime dependency**.
   - **Render-entry (plain Vite, `render.html` + `render-entry/main.tsx`)** — imports `@astra/gothic/theme.css`
     + fonts; `window.vellumRender = (source,mode)=>` `parseDocument`→`root.render(<DocumentView/>)`→
     **rAF → `document.fonts.ready` → rAF** before resolve (determinism); `render.css` opaque
     `[data-vellum-export]`, `width:42rem`, `padding:1.5rem` (1344px @ scale 2). `mode ∈ {mechanical,diegetic}`.
   - **Config namespace** `vellum-render { service-name "astra.vellum-render"; port 10368 }` mirrored in both
     schemas (+ tests). **Telemetry net-new:** `initTelemetry` + **a span per render** (the useful one:
     attrs `mode`, `scale`, `source.bytes`, `queued`) + SIGTERM flush ([[telemetry-built-in]]). Port the
     **pure** unit tests (`caps.test.ts`, `semaphore.test.ts`) — ≥1 test so `bun test` stays green. Add
     `apps/vellum-render` to uv `exclude`.

5. **Export wiring (editor ↔ service).** `useExport`/`exportClient` POST `{source,mode,scale}` to
   **same-origin `/render`** (`RENDER_URL=""`), `.blob()` the PNG, download + best-effort clipboard copy; map
   a fetch `TypeError` to "render service unreachable". **Dev:** `vite.config.ts` proxies `/render` + `/health`
   → `http://localhost:10368` (faerrin parity, so same-origin works in dev). **Verify** a real
   editor→service→PNG round-trip (the contract is fixed: §Locked decisions).

6. **Deploy (D2/D3) + telemetry + faerrin edge decommission.**
   - **`apps/vellum-render` Dockerfile** — `oven/bun:1.3.14-slim` + `apt-get install` Chromium system libs +
     `bunx playwright install --with-deps chromium` at a **pinned version**, `--no-sandbox`,
     `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`; build the render-entry (plain Vite) + COPY
     `ontology/ontology-config`; runtime serves `dist/` + the warm browser. **First browser-in-container in
     astra** (Risk 1).
   - **`apps/vellum-frontend` Dockerfile** — the strider template (`ARG APP`; COPY all sibling app manifests
     for the frozen lock + `ontology/ontology-config`; build the SSR app; fonts self-served from the
     container). Handle the **new-member manifest ripple** across every sibling frontend Dockerfile.
   - **Two Compose units** on `signoz-net`, `restart: unless-stopped`, healthchecks: `vellum-frontend`
     publishes **10367**, `vellum-render` publishes **10368** (host-published so Caddy `localhost:10368`
     reaches it, consistent with every other service; the caps + semaphore + rate-limit bound the surface).
   - **Caddy `vellum.iridi.cc`** in `sites.caddyfile`: `import astra_site`; `@api path /render /health` →
     `reverse_proxy localhost:10368`; `@editor path /editor /editor/*` → `import local_only` +
     `reverse_proxy localhost:10367`; `handle { reverse_proxy localhost:10367 }`. (Mirrors faerrin's block +
     strider's `/editor` gate.)
   - **Decommission faerrin's `vellum.iridi.cc`** (the user's note): comment out the `vellum.iridi.cc { … }`
     block in `/ruby/data/experiments/faerrin/sites.caddyfile` with a pointer to astra (exactly as the
     `strider.iridi.cc` block there already is) — **both repos can't own `vellum.iridi.cc` at once.** This is
     part of the cutover edge handoff; do it when the astra block is authored, before `caddy-reload`.
   - **Telemetry verified** — `astra.vellum-frontend` SSR spans **and** `astra.vellum-render` render spans
     land in SigNoz via the `signoz_*` MCP ([[signoz-mcp]]); browser RUM via the `rumConfig` seam +
     `@astra/observe/web`. Apply with `just up` (+ `just caddy-reload` only when taking the edge live —
     [[deploy-apply-with-just]]).

7. **Visual-regression gate (D4).** Port faerrin `scripts/visual-regression.ts` + `test/visual/fixtures.ts`
   (the custom Bun script: serve `dist/`, drive the real `RenderService`, `pixelmatch` threshold 0.1, **fail
   >0.5%**). **Regenerate goldens against astra-gothic output** in the **pinned `oven/bun:1.3.14` container**
   (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`) — the void-palette render differs from faerrin's amber/teal, so
   faerrin's goldens are NOT reused. Extend the fixture set with **≥1 `:::fields` + `:::timeline` fixture**
   (lock the D6 constructs). Add a **path-filtered `ci.yml` job** running inside that container, **sharing the
   exact Chromium pin** the vellum-render image uses (Risk 1 — same env or goldens drift). Goldens committed.

## Scope (out)

- **Public DNS / outward-facing edge** — the `vellum.iridi.cc` **DNS record** + `just caddy-reload` are
  manual, outward-facing steps (like strider/akasha/mouthpiece/orator/weal-overlay); the Caddy block is
  authored + `caddy validate`-clean and faerrin's block is decommissioned in-repo, but the live record flip is
  **deferred** unless told to proceed ([[deploy-apply-with-just]]).
- **The `⇄ Syntax` canonical↔VSS toggle + `canonicalToVss`** — dropped (D5). VSS authoring otherwise intact.
- **Server-side document persistence** — docs live in `localStorage` (faerrin parity); no `createServerFn`
  doc-save, no DB. (The RUM-config `createServerFn` seam is the only server fn.)
- **Auth on `/render`** — bounded by caps + semaphore + rate-limit (faerrin posture); not IP-gated by default
  (the `/editor` UI is `local_only`; revisit only if abuse appears).
- **Re-architecting the renderer** — `parseDocument`/`DocumentView`/grime are consumed from
  `@astra/{vellum-lang,gothic}` as-is; no changes to those libs (D5 removed the only would-be lang change).
- **faerrin-parity goldens** — the VR gate is a new astra-gothic baseline, not a byte-match to faerrin's PNGs.

## Locked technical decisions

| # | Decision | Choice |
|---|----------|--------|
| Framework | vellum-frontend build flavor | **`@tanstack/react-start` (SSR)**, editor route **`ssr:false`** (D1); no `prerender` block (Decision I). |
| Topology | apps | **Two Compose units** (D2): `vellum-frontend` (10367) + `vellum-render` (10368). render-entry lives in vellum-render (plain Vite). |
| Ports | namespaces | **10367** vellum-frontend, **10368** vellum-render (next free after 10366; both host-published behind Caddy). |
| Browser↔service | export path | **Same-origin `/render`** via Caddy (D2): `@api /render /health → 10368`; dev Vite proxy. Editor `RENDER_URL=""`. |
| Render service | runtime | **Bun.serve + Playwright** (`playwright` a runtime dep), warm Chromium, per-request contexts, egress-block (SEC-3), `Semaphore(2)`, caps (SEC-4), per-IP rate limit. Lifted ~verbatim, re-pointed at gothic. |
| Base image | vellum-render | **`oven/bun:1.3.14-slim` + apt Chromium deps + pinned `playwright install`** (D3); `--no-sandbox`; Chromium pin shared with the CI VR container (D4). |
| Parse | source→AST | **`@astra/vellum-lang` `parseDocument`** (total; runs `compileVss`+desugar+crossref internally). Editor never calls `compileVss` directly (D5). |
| Render | AST→React/HTML | **`@astra/gothic` `<DocumentView>`** for both the live preview AND the render-entry (same component). **No `resolveCrossref`** in the editor (placeholders). grime consumed from gothic (no port). |
| Syntax toggle | ⇄ Syntax | **Dropped (D5)** — no `canonicalToVss`. VSS authoring preserved via grammar + `parseDocument`. |
| Authoring | full-vellum | **Add `:::fields`/`:::timeline`/`[[crossref]]`** to palette + templates + highlight (D6). |
| Styling | visual layer | **gothic Tailwind** — `@astra/gothic/theme.css` (inherits the `@source "./"` fix) + `gothicFontsPlugin`; editor CM theme is gothic-vars-only (NFR-3). |
| Determinism | golden stability | **gothic grime (FNV-1a) + rAF→`fonts.ready`→rAF + in-bundle fonts** (egress block forbids network fonts) — keep all three. |
| VR gate | goldens | **Regenerated against astra-gothic**, pinned `oven/bun:1.3.14` container, pixelmatch >0.5% fail, +fields/timeline fixtures (D4). |
| Edge | cutover | astra owns `vellum.iridi.cc`; **faerrin's `vellum.iridi.cc` block is decommissioned** (commented + pointer, like its strider block). |

## Acceptance criteria (exit gate)

- [ ] **Both toolchains green locally** before pushing ([[no-ci-monitoring]]): `bun --filter '*'
      {typecheck,test,build}` + `bunx biome ci .` over the repo; the new VR job green in the pinned container.
- [ ] **vellum-frontend scaffold:** SSR boots on 10367; config namespace `vellum-frontend` in kdl + both
      schemas (+ tests); uv `exclude` updated; ≥1 test; RUM seam wired.
- [ ] **Editor:** live preview renders vellum source (vellum-lang → gothic) with crossref placeholders; multi-doc
      manager (localStorage), slash palette, templates, share links work; the 3 ported app tests pass; **no ⇄
      Syntax button** (D5). The editor route is `ssr:false`.
- [ ] **Full-vellum authoring (D6):** `:::fields`/`:::timeline`/`[[crossref]]` authorable (palette + templates)
      and render in the preview; the R2 SIGIL-sync test passes.
- [ ] **vellum-render:** runs as a Compose service — warm Chromium, egress-blocked, `[data-vellum-export]`,
      `Semaphore(2)`, caps, survives restart; config namespace `vellum-render` in kdl + both schemas (+ tests);
      `caps`/`semaphore` unit tests pass; a **render span** lands in SigNoz.
- [ ] **Export:** the editor exports a PNG via same-origin `/render` (editor→service→download round-trip
      verified); dev Vite proxy works; `/health` 200.
- [ ] **Deploy:** both Compose units up (10367 host-published; 10368 host-published, behind Caddy); the
      vellum-render Dockerfile builds Chromium (first browser-in-container); Caddy `vellum.iridi.cc` authored
      (`/render`+`/health`→10368, `/editor` local-only→10367, rest→10367) + `caddy validate` Valid;
      **faerrin's `vellum.iridi.cc` block decommissioned in-repo.** Telemetry verified for **both** services
      via SigNoz MCP. **(Public DNS deferred — outward-facing.)**
- [ ] **Visual-regression (D4):** goldens regenerated against astra-gothic in `oven/bun:1.3.14`; the pinned-
      container `ci.yml` job passes (incl. the fields/timeline fixtures), sharing the render image's Chromium pin.
- [ ] Memory updated (`[[vellum-frontend-0013-gotchas]]`) with the load-bearing gotchas (browser-in-container,
      VR pin, the Caddy two-upstream routing, the faerrin decommission); RESUME bumped; committed per-slice +
      pushed.

## Risks

1. **Playwright in CI + prod (plan R1) — dominant.** Pinned Chromium needed in two places (the vellum-render
   Compose image + the VR CI container); any divergence (base image, bun version, font stack) drifts goldens.
   First browser-in-container in astra → no Dockerfile precedent. **Mitigation:** pin the Chromium version once
   in a shared place; the VR job runs in `oven/bun:1.3.14` with the **same** `playwright install` pin the image
   uses; goldens are container-bound (regenerate only in that container with `visual-regression -- --update`).
2. **SIGIL/desugar coupling.** The editor's `vellumHighlight.SIGIL` + `vssLanguage` opener set duplicate
   vellum-lang's `surface.ts`/`DOCUMENT_KINDS`. `DOCUMENT_KINDS` is imported (auto-tracks); the SIGIL regex is
   not. **Mitigation:** the R2 test (slice 3) asserts the editor's sigils ⊆ what `parseDocument` lowers.
3. **Determinism / golden stability (plan R3) — de-risked but load-bearing.** Grime moved to gothic (FNV-1a,
   no `Math.random`); output determinism rests on gothic grime + the rAF→`fonts.ready`→rAF settle + in-bundle
   fonts. **Mitigation:** lift the render-entry settle logic verbatim; never add network fonts (egress block
   would abort them anyway → blank glyphs).
4. **Two-upstream Caddy + the faerrin decommission.** `vellum.iridi.cc` must route `/render`+`/health` to
   10368 and the rest to 10367 in one block, **and** faerrin must stop owning the host. **Mitigation:** mirror
   faerrin's existing two-handle block; comment out faerrin's block (+ pointer) in the same change; `caddy
   validate` before any reload; keep DNS deferred.
5. **Second Vite build under the monorepo.** vellum-render needs a minimal plain-Vite build (render.html +
   render-entry, gothic theme + fonts, vellum-lang parse) with **no** TanStack — separate from
   vellum-frontend's Start build. **Mitigation:** the apps are fully separate (D2); vellum-render's Vite config
   is the small faerrin one, not the Start config.
6. **Telemetry net-new for vellum-render.** A bare `Bun.serve` with no observe wiring in faerrin.
   **Mitigation:** `initTelemetry` in the entrypoint + a render span + SIGTERM flush ([[telemetry-built-in]]).
7. **Editor port surface (plan R4) — lighter than it reads.** Most of `src/app/` is React 19 already; the real
   new work is the SSR shell + `ssr:false` route + telemetry/RUM + the D6 palette additions. **Mitigation:**
   port CodeMirror/docStore/slashComplete/templates/shareLink/useExport near-verbatim; bring their tests.

## Hand-off

Drive the build with `octo:embrace` against this spec, slice by slice, CI-green-then-commit, pushing on chunk
completion (reproduce the TS lane + the new VR job locally; don't watch GHA — [[no-ci-monitoring]]). **Port
faerrin verbatim** where the contract is fixed (the render service internals, the editor components, the
`window.vellumRender` settle logic, the visual-regression script) and add **only** the genuinely-new surface
(the SSR shell, both services' telemetry, the full-vellum palette, the VR CI job). After 0013 → **Phase-6
cutover** (`0015-cutover.md`): vellum is the authoring tool for new vellum documents; the render service is
also a fidelity path others could reuse. Update `[[vellum-frontend-0013-gotchas]]` + RESUME on completion.

**Key source paths** — faerrin: `pkg/vellum/src/{app,server,render-entry}/`, `scripts/{render-server,
visual-regression}.ts`, `render.html`, `test/visual/`, `sites.caddyfile` (the block to decommission). astra
deps: `libs/ts/{vellum-lang,gothic,site-kit}`. Templates: `apps/strider` (editor `ssr:false` +
`createServerFn` RUM seam + Dockerfile/compose/Caddy), `apps/akasha-frontend` (gothic consumption). Memories:
`[[strider-0016-gotchas]]`, `[[akasha-frontend-0011-gotchas]]`, `[[mouthpiece-frontend-0012-gotchas]]`,
`[[deploy-apply-with-just]]`, `[[config-single-source]]`, `[[telemetry-built-in]]`, `[[verify-before-acting]]`,
`[[no-silent-scope-cuts]]`, `[[no-ci-monitoring]]`.
