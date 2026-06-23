---
date: 2026-06-23
subsystem: vellum-frontend
plan: 0013
status: scope (pre-implementation, verified)
author: Claude (Opus 4.8) via /astra:load → Scope gate
---

# Scope — 0013 vellum-frontend (the PF2e document forge: editor + render service)

Verified pre-implementation research for sub-plan
[`0013-vellum-frontend.md`](../../astra/plans/0013-vellum-frontend.md). Every claim below was checked
against the real repos (`/ruby/data/experiments/faerrin/pkg/vellum`, astra's already-moved
`libs/ts/{vellum-lang,gothic,site-kit}`, the three worked frontend examples, `config.kdl`,
`docker-compose.yml`, `ci.yml`). This is the **final frontend** (Phase 5); after it → Phase-6 cutover.

> **One-line goal.** Port faerrin's `vellum` — a CodeMirror editor that writes vellum source, previews it
> live (parse via **vellum-lang**, render via **gothic**), and exports a pixel-faithful PNG via a warm
> headless-Chromium **render service** — into astra as **two Compose units** on the SSR template, with
> telemetry from day one and a visual-regression gate.

---

## 0. TL;DR — what this actually is (and what changed since the plan was drafted)

The 0013 plan (2026-06-19) is essentially accurate, but four things are now **resolved facts** that the
plan left implicit, and they reshape the slicing:

1. **The renderer + parser already left faerrin's vellum package.** `parse.ts`→`@astra/vellum-lang`,
   `mdastToReact`+`components/`(incl. `DocumentView`, the grime/`seed.ts`)→`@astra/gothic`. So this port is
   **just the editor SPA + the render service shell** — the heavy render logic is a dependency now. This
   de-risks plan **Risk 3 (deterministic grime)**: grime lives in gothic (`grimeFor`/`hashString`/
   `seededGrime`/`grimeStyle`, FNV-1a, exported), not in anything we port here.
2. **The editor is inherently client-only** (CodeMirror + `localStorage` doc store, no SSR-able data). The
   plan says "TanStack rewrite" — in practice that means **the strider shape**: an SSR app shell (for the
   standard template/telemetry/RUM) whose editor route is **`ssr:false`**. The React components inside
   port ~verbatim (they're already React 19). This makes plan **Risk 4 (rewrite surface)** lighter than it
   reads — see §4 D1.
3. **This is TWO new apps, not one** (mirrors weal=bot+overlay, orator=backend+controller):
   `apps/vellum-frontend` (the SSR editor, **port 10367**) + `apps/vellum-render` (the **Bun + Playwright**
   render service, **port 10368**). They have disjoint runtimes, Dockerfiles, and lifecycles. See §4 D2.
4. **The render service is the FIRST browser-in-a-container in all of astra**, and the
   **visual-regression CI job does not exist yet** (plan §5/Risk 1 describe porting it; nothing is built).
   Both are genuinely net-new and are the two real cost centers of this subsystem. See §4 D3, §4 D4, §6.

Everything else (SSR scaffold, `ssr:false` editor route, `createServerFn` POST precedent, config
namespace, Dockerfile/compose/Caddy/uv-exclude) is a **verbatim copy of strider with the domain swapped**.

---

## 1. Current state — faerrin `pkg/vellum` (verified)

A private Bun/Vite/React-19 package, `@faerrin/vellum`, **two processes sharing one pure renderer**
(`src/render/`, now split into astra's vellum-lang+gothic). No router; no telemetry (faerrin-era).

### 1.1 Editor SPA (`src/app/`, `index.html`) — ports ~verbatim
Single React component (`App.tsx`), all state via `useState`. Files (each ports nearly as-is):
- **`Editor.tsx`** — **uncontrolled CodeMirror 6** mounted once; doc-switch reseeds by remounting via
  `key={loadKey}` with a fresh `initialValue`; live keystrokes flow `onChange→setSource`. Extensions:
  `basicSetup`, `markdown({extensions: vssMarkdown})`, `vssHighlighting`, `vellumHighlighting`,
  `slashComplete`, `tabIndents` (`Prec.low` so Tab accepts an open `/` first), `lineWrapping`, a
  gothic-var-only `EditorView.theme` (NFR-3: no hex), an update listener.
  CM6 deps: `codemirror ^6.0.1`, `@codemirror/{state,view,commands,language,lang-markdown,autocomplete}`,
  `@lezer/{highlight,markdown}`.
- **`Preview.tsx`** — `parseDocument(source,{mode})` → `<DocumentView document={...}/>` (the **same** path as
  export ⇒ WYSIWYG). Wrapped in `useDeferredValue`.
- **`useExport.ts` + `exportClient.ts`** — the export state machine + the POST. **Contract (load-bearing,
  editor↔service must agree):** `POST {RENDER_URL}/render`, `content-type: application/json`, body
  `{ source, mode, scale }` (`scale` default 2) → **raw `image/png` blob**. `RENDER_URL` default `""`
  (same-origin). On `!ok` reads body text as the error. Downloads the blob + best-effort clipboard copy.
- **`docStore.ts`** — multi-doc manager, pure reducers. `VellumDoc{id,title,source,titlePinned?,updatedAt}`,
  `DocStore{docs,activeId}`. localStorage `STORE_KEY="vellum:docs"` (+ legacy `"vellum:active-doc"` migrated).
  `deriveTitle` understands **both** canonical `:::kind[Label]` and VSS `@kind "Title"`.
- **`slashComplete.ts`** — `autocompletion` palette, 9 commands; **snippets emit VSS** (`@statblock "…" {…}`,
  `/columns`→`@columns [ … ]`, inline `/action`→`@2`, `/trait`→`#fire`, `/redact`→`||x||`).
- **`templates.ts`** — 6 templates (creature/hazard/item/spell/handout/edict), **authored in canonical
  `:::`** (inline in the file, no data dir).
- **`shareLink.ts`** — `#doc=<lz-string compressToEncodedURIComponent(source)>`; `MAX_HASH_LENGTH=8000`;
  load opens the shared doc as a **new** doc then strips the hash. Dep: `lz-string ^1.5.0`.
- **`vssLanguage.ts`** — a `@lezer/markdown` grammar extension (`vssMarkdown`) + `vssHighlighting` that
  parses the VSS surface into CM syntax nodes; **imports `DOCUMENT_KINDS`** (→ now `@astra/vellum-lang`,
  confirmed exported) to build the opener regex.
- **`vellumHighlight.ts`** — re-themes lezer-markdown to gothic vars + a regex `ViewPlugin` decorating
  canonical directive syntax + the authoring **SIGIL** regex (`@2`/`#trait`/`||x||`) + `vssFold`. **The
  SIGIL regex must stay in sync with vellum-lang's `surface.ts` desugar** (coupling risk — §5 R2).
- **`welcomeDoc.ts`** — first-run doc.

### 1.2 Render service (`src/server/` + `scripts/render-server.ts` + `render.html` +
`src/render-entry/main.tsx`) — lifts ~verbatim
- **`renderService.ts`** — `import { chromium } from "playwright"` (`playwright ^1.60.0`, a **runtime dep**),
  `chromium.launch({ args:["--no-sandbox"] })`, **one warm browser** for process life; **fresh
  `BrowserContext` per request** (`deviceScaleFactor: scale`), closed in `finally`. **Egress block (SEC-3):**
  `context.route("**/*", …)` continue only if `url.startsWith(baseUrl) || url.startsWith("data:")`, else
  abort. **Semaphore(2)** gate (`semaphore.ts`). Loads `${baseUrl}/render.html`, calls
  `window.vellumRender(source, mode)`, waits for `[data-vellum-export]` visible, **pixel-area cap (SEC-4)**
  on the bounding box, `target.screenshot({type:"png"})` → returns the element-clipped PNG `Buffer`.
- **`caps.ts`** — `RENDER_LIMITS`: `maxSourceBytes 64KiB`, scale `1..4` default 2, `maxPixelArea 8000²`,
  `renderTimeoutMs 15000`; `validateRenderRequest` (pure).
- **`render-server.ts`** — **`Bun.serve`** on `VELLUM_RENDER_PORT ?? 5252`; warms Chromium **before**
  listening; routes: `GET /health`→`{ok,ready,queued}`, `POST /render`→`image/png` (or specific 4xx/5xx text
  errors; per-IP 60/min rate limit), static-serve `dist/` otherwise; CORS allow-list incl.
  `https://vellum.iridi.cc`; `SIGINT/SIGTERM`→close browser+stop.
- **`render-entry/main.tsx` + `render.html`** — a **second Vite rollup input** (`render`); exposes
  `window.vellumRender = (source,mode)=>Promise<void>` that `parseDocument`→`root.render(<DocumentView/>)`,
  then **rAF → `document.fonts.ready` → rAF** before resolving (determinism, R-17). `render.css` makes
  `[data-vellum-export]` opaque (`--bg-void`/`--parchment-edge`), `width:42rem`, `padding:1.5rem` ⇒ at
  scale 2 every raster is **1344 px** wide. `mode ∈ {mechanical, diegetic}`.

### 1.3 Visual regression (`scripts/visual-regression.ts` + `test/visual/`) — port the approach,
**regenerate goldens**
- A **custom Bun script** (not `@playwright/test`): serves `dist/` on `:5350`, drives the real
  `RenderService`, `pixelmatch(threshold 0.1)`, **fail if >0.5% pixels differ** (`MAX_DIFF_RATIO 0.005`).
  5 fixtures (`statblock-mechanical/-diegetic`, `handout-diegetic`, `zoo-mechanical`, `gfm-mechanical`);
  goldens at `test/visual/golden/*.png` (1344-wide).
- **Goldens are container-bound** to `oven/bun:1.3.14` + `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`; the
  faerrin CI runs the job **inside** that container. **Stale-cruft flag:** comments/CLAUDE.md mention
  `dagger` — there is **no Dagger module**; CI is plain GHA. Do not port the Dagger invocations.

---

## 2. Target — astra vellum-frontend (the consumption contracts, verified)

### 2.1 `@astra/vellum-lang` (`libs/ts/vellum-lang`) — the parse side
- Import `@astra/vellum-lang`. Source-only (`build: echo no build step`); needs `@types/mdast` as a
  consumer devDep to typecheck the mdast AST.
- **`parseDocument(source, {mode?}): VellumDocument`** — **total, never throws**; internally runs
  `compileVss` → `desugar` (inline sigils) → remark(parse+gfm+directive) → `transformCrossRefs`. So the
  editor gets VSS + sigil support **for free** from one call.
- **`compileVss(source): string`** — exported (VSS→canonical; pure, total, idempotent, no-op on
  construct-free input). Powers a "lower VSS→canonical" view if wanted.
- `DOCUMENT_KINDS = [statblock,hazard,item,spell,handout,edict]` (exported — `vssLanguage.ts` consumes it).
- Full-vellum constructs all present: blocks (the 6 kinds), `:::columns`, **`:::fields`**, **`:::timeline`**,
  inline `:action/:redact/:trait`, **`[[crossref]]`** (parsed, **not resolved**), GFM. Model types exported
  (`VellumDocument/VellumNode/VellumBlock/…/CrossRef/Frontmatter/ThemeMode`).
- **⚠️ GAP (verify in spec):** faerrin's `⇄ Syntax` button needs **`canonicalToVss`** (the *reverse*,
  faerrin `render/format.ts`). Agent-verified exports of `@astra/vellum-lang` list **`compileVss` but NOT
  `canonicalToVss`**. Either (a) port `canonicalToVss` into vellum-lang (it is a lang concern — recommended),
  or (b) the editor carries it locally. **Decision D5.**

### 2.2 `@astra/gothic` (`libs/ts/gothic`) — the render side
- Import `@astra/gothic`. **`<DocumentView document={VellumDocument} resolveCrossref?={…} />`** — the
  `[data-vellum-export]` boundary; `data-mode` drives the skin in CSS. Used **identically** for the live
  React preview AND `renderToStaticMarkup(...)` (the render-entry path). For an editor (no resolved edge
  graph) **omit `resolveCrossref`** → crossrefs render as styled placeholders (the intended standalone
  behavior).
- Grime/seed helpers exported from gothic (`grimeFor/hashString/seededGrime/grimeStyle`) — **we port no
  grime** (R3 de-risked).
- **CSS wiring (2 steps, identical across strider/akasha/mouthpiece):** (a) `import "@astra/gothic/theme.css"`
  once in `__root.tsx` (pulls Tailwind v4 + tokens + `@font-face`; the **`@source "./"`** gotcha is already
  baked into gothic — consumers inherit styled DocumentView for free); (b) serve fonts via
  **`gothicFontsPlugin({ clientOutDir })`** in `vite.config.ts` (no Caddy `gothic_fonts`).
- **Skin reality:** astra gothic is the **void palette** (not faerrin's amber/teal). ⇒ astra's PNG output
  differs from faerrin's goldens ⇒ **goldens must be regenerated against astra-gothic output** — the VR gate
  is a *new-baseline regression* gate, not a faerrin-parity gate. See §4 D4.

### 2.3 Scaffold (`@astra/site-kit`) + the editor precedents
- `createSsrServer({serviceName,port,ssr,clientDir,staticMounts?})`, `startRum(getConfig)` (`./web`),
  `gothicFontsPlugin`, `contentWatchPlugin` (**optional/unused for vellum** — its "content" is user-typed,
  not committed markdown), `generateRouteTree`, `loadSiteConfig`. `vite.config.ts` needs
  **`--configLoader runner`** to import `@astra/site-kit`.
- **Interactive editor in an SSR app:** strider's `apps/strider/src/routes/editor.tsx` =
  `createFileRoute("/editor")({ ssr:false, component })` — exactly the pattern vellum's editor route copies
  (keeps CodeMirror off the SSR path; no `<ClientOnly>` needed inside).
- **The side-effecting POST precedent:** strider's `writeLayerFn` =
  `createServerFn({method:"POST"}).validator(d=>d).handler(({data})=> span(...))` wrapping a transport-pure,
  guarded function (`writeLayer.ts`, unit-tested). **createServerFn must live in app source** (the
  `tanstackStart` plugin only transforms server fns in the app). **But note:** vellum's export does NOT go
  through a createServerFn — it POSTs to the *render service* (a separate Bun.serve), same-origin via Caddy
  (§4 D2). The createServerFn precedent applies to the **RUM-config seam** (`src/observe/rumConfig.ts`,
  copied verbatim) and to any optional server-side doc persistence (not required — docStore is localStorage).

---

## 3. Resolved facts (checkable now — not open questions)

| # | Question | Resolved answer |
|---|---|---|
| 1 | Next free ports | **10367** (vellum-frontend SSR), **10368** (vellum-render). 10360–10366 taken (verified config.kdl + compose). |
| 2 | Does the render/parse logic still need porting? | **No.** It moved to `@astra/vellum-lang` (`parseDocument`,`compileVss`,`DOCUMENT_KINDS`) + `@astra/gothic` (`DocumentView`, grime). We port the **editor shell** + the **service shell** only. |
| 3 | Is `canonicalToVss` available? | **No** — `@astra/vellum-lang` exports `compileVss` but not the reverse. Needs porting (D5). `compileVss` ✓. |
| 4 | Crossref resolver for the editor? | **Omit it** — gothic renders unresolved `[[…]]` as placeholders (correct for an authoring tool). |
| 5 | Any astra browser-in-container precedent? | **None.** Render service is the first; bun image has no Chromium/libs. Closest mechanism: orator's runtime stage already `apt-get`s a heavy dep (ffmpeg) onto `oven/bun:1.3.14-slim`. |
| 6 | Visual-regression CI job exist? | **No.** `ci.yml` has zero playwright/visual/chromium. Net-new (plan §5 + exit-criteria require it). |
| 7 | How does a new TS app get CI? | Automatically — `ts-{typecheck,lint,test,build}` run `bun --filter '*'`. **Gotcha:** a new app needs **≥1 test** or `bun test` exits 1. |
| 8 | uv exclude | Both new `apps/*` dirs must be added to `pyproject.toml` `[tool.uv.workspace].exclude` (currently lists the 7 bun apps). |
| 9 | Export HTTP contract | `POST /render` JSON `{source,mode,scale}` → `image/png` blob; `GET /health` → `{ok,ready,queued}`. Editor `requestPng` + service already agree — keep in lockstep. |
| 10 | Telemetry today | faerrin vellum has **none**. Both apps must wire `libs/ts/observe`: vellum-frontend via `createSsrServer`(initTelemetry)+RUM seam; **vellum-render** via its own `init_telemetry`/`initTelemetry` in the Bun.serve entrypoint (net-new). |

---

## 4. Decisions to revisit before speccing

> The plan's O1/O2/O3 are already decided; these (**D1–D6**) are the *implementation-shape* decisions the
> spec must lock. Recommendations are mine — surface for confirmation; do not silently pick.

**D1 — Editor hosting: SSR shell + `ssr:false` editor route (RECOMMEND).** Reconciles Decision I ("all
frontends are SSR Compose services") with an inherently client-only editor. The app is an SSR frontend (for
the template, telemetry, RUM, Caddy edge) but the editor route is `ssr:false` (strider precedent). The
React components from faerrin `src/app/` port ~verbatim — so "TanStack rewrite" (O1) is mostly the *shell*,
not the editor internals. Alternative (a pure static SPA like orator's `web/`) loses the SSR template
consistency the roadmap wants for 0011–0014; reject.

**D2 — Two apps + same-origin render via Caddy (RECOMMEND).**
- `apps/vellum-frontend` (SSR editor, 10367) and `apps/vellum-render` (Bun+Playwright service, 10368) are
  **separate apps/Compose units** — disjoint runtime, Dockerfile, lifecycle (mirrors weal/orator's 2-unit
  split). The **render-entry page + `render.html`** live in **vellum-render** (built with plain Vite — it is
  not a TanStack SSR surface; it just needs `parseDocument`+`DocumentView`). Both apps depend on
  `@astra/{gothic,vellum-lang,observe,config}`.
- **Browser↔service path:** preserve faerrin's same-origin design. **Caddy `vellum.iridi.cc` routes
  `/render` + `/health` → the vellum-render container; everything else → vellum-frontend.** The browser
  POSTs same-origin (`RENDER_URL=""`), so no CORS in prod; dev uses the Vite proxy (faerrin pattern). The
  render service stays otherwise internal (signoz-net); it need not be host-published. (Alternative:
  cross-origin POST to a separate render host using faerrin's `ALLOWED_ORIGINS` CORS — more moving parts;
  reject unless Caddy path-routing to two upstreams proves awkward.)
- **Editor `/editor` gate:** like strider, Caddy gates the editor UI `local_only`; the render endpoint is a
  capability-bounded public surface (caps + semaphore + rate-limit already in faerrin) — decide in spec
  whether `/render` is `local_only` too or left public-but-capped (faerrin left it public-but-capped).

**D3 — vellum-render Docker base image (RECOMMEND: bun-slim + apt Chromium deps).** Keep
`oven/bun:1.3.14-slim` and `apt-get install` the Playwright/Chromium system libs + `bunx playwright install
--with-deps chromium`, pinning the Chromium version (precedent: orator apt-gets ffmpeg onto the same slim
base). Keeps the bun toolchain + lets us **share the exact pinned Chromium with the CI VR container**
(plan Risk 1 — same env or goldens drift). Alternative `mcr.microsoft.com/playwright` (Node-based) abandons
bun; reject. `--no-sandbox` required (no user-namespace sandbox in-container).

**D4 — Visual-regression: port the gate, regenerate the baseline, run it in CI (DO NOT DEFER).** Plan §5 +
exit-criteria require it; `no-silent-scope-cuts` says build it. Port faerrin's custom Bun
`visual-regression.ts` (pixelmatch, 0.5%, 5 fixtures) → run **inside `oven/bun:1.3.14` +
`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`** as a new path-filtered `ci.yml` job. **Regenerate goldens
against astra-gothic output** (void palette ≠ faerrin's amber/teal) — this is a new-baseline gate, not a
faerrin-parity gate. The render-service runtime Chromium and the VR-job Chromium must be the **same pinned
version**. *Possible spec-sanctioned phasing to surface:* land the editor+service+manual-PNG verification
first, then the VR job — but the gate itself ships in 0013.

**D5 — `canonicalToVss` home (RECOMMEND: port into `@astra/vellum-lang`).** The `⇄ Syntax` button needs the
reverse transform. It is a language concern and belongs beside `compileVss` in vellum-lang (with its
parity/round-trip tests), not buried in the editor. Confirm, then add it as a small vellum-lang slice (a
0004 follow-on) before the editor's syntax-toggle slice. Verify whether the VSS *editor grammar*
(`vssLanguage.ts` / `vellumHighlight.ts`) also belongs in a shared lib or stays app-local (it is CodeMirror-
specific → likely app-local, but it couples to vellum-lang's `surface.ts` SIGIL set — R2).

**D6 — New full-vellum authoring surface (genuinely new, not a pure port).** Plan work-item 2 requires
**adding `:::fields`, `:::timeline`, `[[crossref]]`** to the slash palette + templates (faerrin's palette
predates full-vellum). Budget this as real new authoring UX (snippets + at least one template each) +
matching `vellumHighlight`/`vssLanguage` decoration if VSS sugar is wanted for them. Decide the VSS surface
for fields/timeline (canonical-only snippet vs a `@fields`/`@timeline` VSS form) in the spec.

---

## 5. Risks (plan's, re-validated + augmented)

1. **Playwright in CI + prod (plan R1) — the dominant risk.** Pinned Chromium needed in two places
   (Compose runtime + the VR container); divergence drifts goldens. Mitigation: one pinned version shared
   (D3+D4). First browser-in-container in astra ⇒ no precedent to copy for the Dockerfile.
2. **SIGIL/desugar coupling (new).** The editor's `vellumHighlight.SIGIL` + `vssLanguage` opener set must
   track vellum-lang's `surface.ts` desugar + `DOCUMENT_KINDS`. `DOCUMENT_KINDS` is imported (auto-tracks);
   the SIGIL regex is duplicated ⇒ a vellum-lang change can silently desync editor decoration. Add a test
   asserting the editor's known sigils ⊆ what `parseDocument` lowers.
3. **Grime determinism (plan R3) — de-risked.** Grime moved to gothic (FNV-1a, exported, no `Math.random`).
   Output determinism now depends on gothic + the rAF→`fonts.ready`→rAF settle in the render-entry page +
   **in-bundle fonts** (egress block forbids network fonts). Keep all three.
4. **Editor port surface (plan R4) — lighter than stated.** Most of `src/app/` is React 19 already; the
   "rewrite" is the SSR shell + the `ssr:false` route + RUM/telemetry wiring + the new full-vellum palette
   entries (D6). CodeMirror/docStore/slashComplete/templates/shareLink/useExport are near-verbatim.
5. **Second Vite input under TanStack (new).** faerrin had `render.html` as a 2nd rollup input *in the same
   package*. D2 sidesteps this by putting render-entry in the **separate** vellum-render app (plain Vite) —
   so vellum-frontend stays a clean single-entry TanStack Start app. Confirm vellum-render's minimal Vite
   build (render.html + render-entry, gothic theme, fonts) works without TanStack.
6. **Telemetry net-new for the service (new).** vellum-render is a bare `Bun.serve` with no observe wiring
   in faerrin; must add `initTelemetry` + per-request spans (the render span is the useful one) + SIGTERM
   flush (`telemetry-built-in`).

---

## 6. Proposed slice sketch (for the spec to refine — not locked)

0. *(pre-req, D5)* **vellum-lang `canonicalToVss`** — port the reverse transform + round-trip test
   (small 0004 follow-on).
1. **Scaffold `apps/vellum-frontend`** from the strider shell — config namespace `vellum-frontend`
   (10367, service-name, public-origin) mirrored in kdl+Zod+Pydantic (+ tests); uv-exclude; the 6-sibling
   Dockerfile-manifest ripple; RUM seam; SSR smoke + ≥1 test.
2. **Editor port** — CodeMirror host + `Preview` (`parseDocument`→`<DocumentView>`) + docStore +
   slashComplete + templates + shareLink + vssLanguage/vellumHighlight; gothic theme + fonts. Port the
   `src/app/` tests (docStore/shareLink/vssLanguage).
3. **`⇄ Syntax` + new full-vellum authoring (D6)** — wire `compileVss`/`canonicalToVss`; add
   `:::fields`/`:::timeline`/`[[crossref]]` palette snippets + templates + highlight decoration.
4. **Scaffold `apps/vellum-render`** — Bun.serve server (`/render`,`/health`, caps, semaphore(2),
   egress-block) + render-entry (`window.vellumRender`, rAF/fonts settle) built with plain Vite; config
   namespace `vellum-render` (10368); `init_telemetry`+render span+SIGTERM flush; caps/semaphore unit tests.
5. **Export wiring** — editor `useExport` POSTs same-origin `/render`; dev Vite proxy; verify a real PNG
   round-trips editor→service→download.
6. **Deploy** — vellum-render Dockerfile (bun-slim + apt Chromium + pinned `playwright install`,
   `--no-sandbox`); both Compose units (frontend host-published 10367, render internal); Caddy
   `vellum.iridi.cc` (`/render`+`/health`→render, `/editor` local-only, rest→frontend); `just up` verify;
   SigNoz spans for **both** services.
7. **Visual-regression gate (D4)** — port `visual-regression.ts` + fixtures; regenerate goldens against
   astra-gothic in `oven/bun:1.3.14`; add the pinned-container `ci.yml` job sharing the render image's
   Chromium pin.

**Spec-sanctioned deferrals (consistent with prior frontends):** the `vellum.iridi.cc` **DNS record** +
`just caddy-reload` (outward-facing/manual, like strider/akasha/mouthpiece/orator/weal). Everything else —
incl. the VR gate (D4) and the render service — ships in 0013.

---

## 7. Hand-off to the Spec gate

Author the NLSpec at `thoughts/astra/specs/0013-vellum-frontend-spec.md` (`octo:spec`) building on this doc +
the sub-plan's settled O1–O3. Lock **D1–D6** with the user first (esp. D2 two-apps/Caddy routing, D3 base
image, D4 don't-defer-VR, D5 `canonicalToVss` home). Then drive `octo:embrace` against the spec, porting
faerrin verbatim where the contract is fixed (the render service, the editor internals) and adding only the
genuinely-new surface (telemetry, the SSR shell, the full-vellum palette, the VR CI job).

**Key source paths** — faerrin: `pkg/vellum/src/{app,server,render-entry}/`, `scripts/{render-server,
visual-regression}.ts`, `render.html`, `test/visual/`. astra deps: `libs/ts/{vellum-lang,gothic,site-kit}`.
Templates: `apps/strider` (editor `ssr:false` + `createServerFn` + Dockerfile/compose/Caddy),
`apps/akasha-frontend` (gothic `renderToStaticMarkup` + crossref). Memories: `[[strider-0016-gotchas]]`,
`[[akasha-frontend-0011-gotchas]]`, `[[mouthpiece-frontend-0012-gotchas]]`, `[[deploy-apply-with-just]]`,
`[[config-single-source]]`, `[[telemetry-built-in]]`, `[[verify-before-acting]]`, `[[no-silent-scope-cuts]]`.
