---
name: vellum-frontend-0013-gotchas
description: building 0013 vellum-frontend (the document-forge editor) + vellum-render (the PNG service) — the final frontend; load-bearing gotchas for the editor port, the first browser-in-a-container, and the visual-regression gate
metadata:
  type: project
---

0013 vellum-frontend — faerrin's `vellum` (CodeMirror editor + Playwright PNG render service) ported to
astra as **two Compose units**. **COMPLETE — all 7 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
(`3835dae`(s1)…`f1171fd`(s7), 2026-06-23). The fourth/final 0011–0013 frontend. Scope+spec gates done
(`ab04539`/`0dba4ef` scope, `5bf93b8` spec); **D2/D4/D5 locked with the user, D1/D3/D6 accepted** — see the
spec `thoughts/astra/specs/0013-vellum-frontend-spec.md`. Pairs with [[strider-0016-gotchas]],
[[akasha-frontend-0011-gotchas]], [[mouthpiece-frontend-0012-gotchas]].

**Two apps (D2):** `apps/vellum-frontend` (SSR editor, **10367**) + `apps/vellum-render` (Bun + Playwright,
**10368**) — separate Compose units, mirroring weal/orator's split. The browser POSTs **same-origin
`/render`** (`RENDER_URL=""`); **Caddy `vellum.iridi.cc` routes `/render`+`/health` → 10368, `/editor`
(local_only) + everything else → 10367** (mirrors faerrin's old two-handle block). Dev uses a **Vite proxy**
(`/render`+`/health` → `localhost:<vellumRender.port>`, config-sourced) so dev + prod share the same-origin
contract with no env var. The SSR server itself does NOT proxy `/render` — Caddy/the dev-proxy does.

**Editor (slice 2) — ssr:false + ~verbatim React port:** the editor lives under an `ssr:false` `/editor`
route (strider precedent) so CodeMirror + the gothic preview never hit the SSR path (no `<ClientOnly>` gate
needed). faerrin `src/app/` ports nearly 1:1 into `src/domain/editor/` (React 19 already): the uncontrolled
CM6 host (doc-switch = remount via `key={loadKey}`), `Preview` (`parseDocument`→gothic `DocumentView`, **no
`resolveCrossref`** → crossref placeholders, the authoring default), the localStorage multi-doc store,
lz-string share links, templates, slash palette, the VSS `@lezer/markdown` grammar + directive/sigil
highlight. **gothic var remap:** faerrin's bare vars (`--bg-void`/`--ink`/`--accent`/`--rule-bright`…) →
astra's `--color-*` (the editor CM theme + the one **CSS module** `editor.module.css`, the only module in any
frontend — kept because it's a verbatim port + scoped under the client-only route). **D5: the ⇄ Syntax button
is DROPPED** (no `canonicalToVss` port) — VSS authoring still works (typed VSS compiles inside
`parseDocument`; the palette emits VSS; the grammar highlights it); `compileVss` is never called directly.

**Full-vellum authoring (slice 3, D6):** added `:::fields`/`:::timeline`/`[[crossref]]` palette snippets +
templates + a `[[…]]` highlight decoration. **fields/timeline are canonical-only** (VSS knows only the 6
block `DOCUMENT_KINDS`, so there's no `@fields`/`@timeline` sugar). **R2 sync gate** `sigilSync.test.ts`:
export the editor's `SIGIL` regex and assert every sigil it highlights (`@<action>` ×15 tokens, `#trait`,
`||redact||`) is actually lowered by `parseDocument` — catches `surface.ts` ↔ editor drift.

**vellum-render = the FIRST browser-in-a-container in astra (slices 4/6).** Lift faerrin's
`renderService.ts` (warm Chromium, per-request contexts, **SEC-3 egress block** = only same-origin/`data:`
URLs, **Semaphore(2)**), `caps.ts`, the Bun.serve server (`/health`, `POST /render`→`image/png`, per-IP rate
limit, CORS) ~verbatim. The **render-entry is a SEPARATE plain-Vite build** (`render.html` single input, NOT
TanStack) — `window.vellumRender(source,mode)` renders gothic `DocumentView`, settles **rAF →
`document.fonts.ready` → rAF** (determinism), screenshots `[data-vellum-export]` (1344px @ scale 2).
**Fonts MUST be same-origin** (the egress block aborts network fonts → blank glyphs): `gothicFontsPlugin`
copies gothic's fonts into `dist/fonts`, ibm-plex via fontsource → `dist/assets`. **Dockerfile (D3):**
`oven/bun:1.3.14-slim` + `bunx playwright install --with-deps chromium` (root RUN — no USER directive, like
orator's apt), `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, `--no-sandbox` at launch. **The Chromium version is
pinned by the `playwright` version in bun.lock** — the render image + the CI VR container install the same
build, so goldens don't drift. Telemetry net-new: `initTelemetry` + a span per render
(mode/scale/source_bytes/png_bytes) + SIGTERM flush.

**Visual-regression gate (slice 7, D4):** ported faerrin's `visual-regression.ts` (pixelmatch threshold 0.1,
**fail >0.5%**) + fixtures + **fields/timeline fixtures** (7 total, both skins). **Goldens are container-
bound** — regenerate ONLY in `oven/bun:1.3.14` + `PLAYWRIGHT_BROWSERS_PATH` with `visual-regression:update`
(I generated them via `docker run --user root -v $PWD:/w oven/bun:1.3.14 …`; chown the bind-mounted output
back to 1000:1000 after). It's a **new-baseline gate against astra-gothic's void palette, NOT a faerrin
byte-match** (different skin). The new `ci.yml` job `vellum-visual-regression` runs **in that pinned
container** (apt-install git → checkout → install → `playwright install --with-deps chromium` → build →
compare), gated on a `vellumRender` paths-filter (vellum-render ∪ gothic ∪ vellum-lang — any can shift the
render). Compare passes **0.000% drift** on all 7.

**Deploy ripple + edge:** every sibling frontend/service Dockerfile (7) now COPYs the vellum-frontend +
vellum-render manifests (else `bun install --frozen-lockfile` fails after the lock gained the two members).
Two compose units on signoz-net (10367/10368, healthchecks — vellum-render's checks `/health` `ready` with a
`start_period: 25s` for Chromium warmup). **Faerrin's `vellum.iridi.cc` block decommissioned on-disk**
(commented + pointer, like its strider block) — left UNCOMMITTED in faerrin's jj working copy on purpose (that
copy is owned by the running live pipeline's auto-generated content; the on-disk edit is what `caddy-reload`
reads).

**Verified live:** both containers healthy; frontend `/`+`/editor` 200; render `/health` ready; **a real
`POST /render` from the CONTAINERIZED Chromium returns a 1344×288 PNG** (gothic statblock, `:action` glyphs,
opaque bg); the dev editor→proxy→service round-trip returns a diegetic handout PNG (parchment + drop-cap +
seeded grime); restart-survives; **SigNoz has `astra.vellum-frontend` SSR spans + `astra.vellum-render`
render spans** (MCP-confirmed); `caddy validate` Valid.

**Gotchas worth remembering:** biome override for `**/vellum-frontend/src/domain/editor/**` (verbatim idioms:
non-null assertions, the `??=` test accumulator, `role=group`); **`@types/pixelmatch`** is needed (pixelmatch
v6 ships no types); importing `@astra/site-kit` from a render-app vite.config still needs `--configLoader
runner`; the editor's `.app` is a direct flex-child of `<body>` so it uses `flex:1` not `height:100%`.
**0013 is COMPLETE — fully live on `https://vellum.iridi.cc` (DNS set + `just caddy-reload` applied
2026-06-23): `/`+`/editor` 200, `/health` ready, `POST /render` returns a real PNG through the public TLS
edge; faerrin's block decommissioned.** The FIRST 0011–0013 frontend taken all the way to a public edge (the
others' DNS is still deferred). **No open items. Next: Phase-6 cutover (`0015-cutover.md`).**
