---
name: harrow-0017-gotchas
description: Building harrow (0017) — porting the external tarot reader into astra as a backend-less SSR frontend; the load-bearing gotchas
metadata:
  type: project
---

PROJECT 2026-06-26 — **0017 harrow COMPLETE + LIVE ON THE PUBLIC EDGE** (`1aa0c81`(s1)…`a2c9a5e`(s6) +
edge cutover `4b3ad33`). Ported the external app at `/ruby/data/experiments/tarot` (a React 18 + Vite 5 SPA
tarot deck reader, page-title "Harrow") into astra as a **backend-less SSR frontend on the strider
template** — a sibling of strider, NOT a read-surface. Net-new post-cutover product work (the faerrin
migration is done; this reused the 0011–0013 playbook). Live on **port 10369** / **`harrow.iridi.cc`**,
`service.name=astra.harrow` in SigNoz (0 errors, SSR spans for `/`, `/gallery`, `/spreads`,
`/spreads/history`). Scope/spec: `thoughts/shared/research/2026-06-26-harrow-0017-thoughts.md`,
`thoughts/astra/specs/0017-harrow-spec.md`. Builds on [[migration-guide]] + [[strider-0016-gotchas]] +
[[akasha-session-audio-dependency]] (the edge-decommission pattern).

**Decisions:** full gothic re-skin (A); app name `harrow` on `harrow.iridi.cc` (B — bare name like strider,
no `-frontend` suffix since no backend); build-time generated content (C); client-side draw/flip (D);
views→routes (E); no backend/DB/volume (F); deck hues as gothic **identity** colours (G); two spread routes (H);
deck + predicate parity gates (I); Safari flip fix applied (J).

**THE load-bearing gotchas:**

1. **Three SSR/hydration seams (the core risk of SSR-ifying a client-only SPA).** (a) the **`Math.random`
   draw** must run only post-hydration → the `/` route renders `ReadingSurface` behind `<ClientOnly>`
   (SSR shows a deterministic "Shuffling" fallback; no mismatch). (b) **`CardSpread`'s `window.matchMedia`**
   → swapped to the shell's SSR-safe `useIsMobile` (`useSyncExternalStore`, server snapshot `false`). (c)
   **reveal timers** are client effects (initial `revealed` all-false on both sides). The STATIC routes
   (`/gallery`, `/spreads`, `/spreads/history`) have no randomness → SSR cleanly; only `/` needs ClientOnly.

2. **astra's base tsconfig has `noUncheckedIndexedAccess` (harrow's source did NOT).** The verbatim ports
   tripped it everywhere: array index, regex match-group (`m[1]`), `Record` index, the Fisher-Yates tuple
   swap, the 5-tuple destructure. Fix = `as string`/`as T` assertions + `for (const [i, line] of
   lines.entries())` for the loop — **same logic, no behaviour change**. Pure verbatim ports rarely compile
   as-is here; budget for index-safety edits.

3. **Full gothic re-skin = remap harrow's bespoke Tailwind tokens** (`surface/well/rim/brass/mist/ghost` →
   gothic `panel/elevated/rule/accent-amber/ink-dim/ink-faint`). `parchment` + `font-display` exist in gothic
   directly (use as-is). harrow's **deck/flip/shimmer/hatch utilities ported VERBATIM into globals.css**
   (self-contained — only depend on a CSS var); the flip utilities already carry the `-webkit-` Safari fix (J).
   The reset MUST be `@layer base` (the cross-cutting gotcha, [[gothic-frontend-design-polish]]).

4. **Deck colours via gothic's identity seam (Decision G), not a fixed token.** The 4 deck hues
   (`#f4a261`/`#7dd3fc`/`#fca5a5`/`#a78bfa`) are the deck *taxonomy* (like faction colours) → the card root
   spreads `identityStyle(deck.color)` (sets `--identity-color`), and the `.deck-fg`/`.deck-hatch-*`
   utilities consume `var(--identity-color)`. Keeps the four hues as the one bespoke accent over the re-skin.

5. **A clickable card → a native `<button>`, not a div+handlers.** biome `lint/a11y/noStaticElementInteractions`
   flags a `<div onClick>` even with a *dynamic* `role={...}`/`tabIndex`. Rendering the clickable FlipCard as
   `<button type="button" class="appearance-none border-0 bg-transparent p-0">` gives free keyboard+focus a11y
   and is biome-clean (the unrevealed card is the only interactive element).

6. **Parity gates without the source repo in CI.** Deck gate: captured `deck.golden.json` by running
   harrow's ORIGINAL parser over its ORIGINAL `.card` files (an independent capture), then assert the
   generated `DECK` byte-equals it + structural invariants. Predicate gate: lock the **29 labels verbatim**
   (authoritative — they differ from prose summaries: *Devil/Godhome/Slip/Mortal Rising*, *Dissonant Pull*),
   hand-computed `evaluatePredicate` units on synthetic cards, + deterministic `matchedPredicate` scenarios
   by card id (3-diabolic+2-aetheric→*Allied Outlook*, all-aetheric→*Slip Rising*, 3-divine→*Dissonant Pull*).

7. **Content pipeline = coupled sources + RELATIVE imports.** `build-content.ts` parses `content/cards/<deck>/*.card`
   + `content/spreads/*.spread` → `src/generated/{cards,spreads}.ts`. `cards` + `spreads` are **coupled**
   (spreads resolve ids against the parsed deck) → share a closure `deck`, declaration-ordered. build-content
   imports `parseCard`/`parseSpread` via **relative path** (`../src/domain/lib/...`), NOT the `@/` alias — it
   runs under bun (no vite alias). Generated modules import types via `@/` (runtime resolves it).

8. **`/spreads/history` via flat-file routing, no layout file.** `spreads.index.tsx` (`/spreads/`) +
   `spreads.history.tsx` (`/spreads/history`) — TanStack auto-synthesizes the virtual `/spreads` parent;
   no `spreads.tsx` Outlet layout needed.

9. **Deploy = the simplest frontend** (no backend snapshot, no audio/asset volume — glyphs are inline SVG).
   The **new-member ripple**: add `COPY apps/harrow/package.json apps/harrow/` to ALL sibling Dockerfiles
   (the root `apps/*` globs resolve the full workspace → `--frozen-lockfile` breaks on a partial manifest set).
   8 siblings updated. Deferred: `harrow.iridi.cc` DNS + `just caddy-reload` (outward-facing).

10. **Verifying the live SSR HTML: `grep -a`.** The SSR output has UTF-8 glyphs (✦, em-dash) → grep treats
    it as binary and silently prints nothing without `-a` (false "marker absent"). Cost me a confused minute.

11. **Edge cutover = a host TAKEOVER, not a new host (`4b3ad33`).** The old standalone harrow already owned
    `harrow.iridi.cc` (parent reverse-proxy → `localhost:10204`), so DNS already existed — the spec's
    "deferred DNS" note was moot; the go-live was a pure proxy-config swap. **THE conflict:** the shared
    `/ruby/data/reverse-proxy/Caddyfile` *imports* astra's `sites.caddyfile` (which already defines
    `harrow.iridi.cc` → 10369), so the old parent stanza made it **defined twice** → a duplicate-site error.
    Fix = remove the old parent block (backed up to `Caddyfile.bak-harrow-<date>` first), then `just
    caddy-validate` (validates the MERGED edge so `import astra_site`/`local_only` snippets resolve — a
    fragment-only validate fails) → confirm `harrow.iridi.cc` appears **once** in the cert-subjects list →
    `just caddy-reload` (zero-downtime). Live-verified `https://harrow.iridi.cc` serves the migrated app
    (SSR title + gothic gallery, all routes 200). The proxy + astra stack are co-located on saffron, so
    `reverse_proxy localhost:10369` reaches the container. **LEFTOVER (not done):** the old harrow container
    is still running unrouted on `localhost:10204` (saffron `/emerald/data/experiments`, image
    `reg.iridi.cc/tarot`) — the deferred old-deploy teardown.

**Post-0017 product — animated yellow/black starfield background (2026-06-26, `5f3865f`, DONE + LIVE).**
A fixed full-viewport pixi shader background behind every harrow page (user: "a shader background like
strider's, yellow and black like a starfield"). **Ported strider's balatro page-background mounting idiom,
NOT reinvented** ([[strider-tithe-pixi-gotchas]] / [[strider-balatro-timeline-gotchas]] for the pixi-v8
recipe): a reusable `Filter` (`GlProgram.from({vertex: defaultFilterVert, fragment})`) on a full-screen
`Graphics().rect().fill()` scaled to `renderer.screen` each frame, `uTime` from `app.ticker`, uniform-driven
palette, and the **high-DPR fix — derive screen coords from `vTextureCoord`, not `gl_FragCoord`** (else the
pattern desyncs/corners on retina). The *shader* is new (drifting 3-layer parallax starfield: hashed
star-grid + per-star twinkle + an fbm amber nebula on warm-black space; gold star `[1,0.86,0.45]`).
- **Harrow ≪ strider → self-contained, no PixiContext.** Strider's `PixiHost` exposes `panel`/`world`
  containers via context for the hex map; harrow has **no on-canvas content**, so `StarfieldBackground.tsx`
  just owns one `Application` + the shader mesh (no context/children). Files:
  `apps/harrow/src/components/StarfieldBackground/{StarfieldBackground.tsx,starfieldBackground.ts,*.module.css}`.
  Canvas `position:fixed; inset:0; z-index:-1; pointer-events:none`.
- **SSR-safety = dynamic import + `<ClientOnly>`.** pixi is `await import("pixi.js")` inside the effect and the
  component is mounted inside `<ClientOnly>` in `__root.tsx` → nothing WebGL evaluates during SSR; the canvas
  is correctly ABSENT from SSR HTML. Harrow's `body` is already transparent (only `html` paints
  `--color-void`), so the field shows through with content readable; no globals.css change needed.
- **Deps/biome:** add `pixi.js@^8.18.1` (match strider; NO `pixi-filters` — core `Filter`/`GlProgram` only).
  The `(filter.resources.<group> as {uniforms:{uTime:number}}).uniforms.uTime` cast passes biome with **no
  override** (strider's `balatroBackground.ts` has none either). Build code-splits the shader into its own
  chunk; pixi stays out of the SSR bundle.
- **Deploy:** harrow is backend-less (no SOPS) → a plain targeted `docker compose up -d --build harrow` (from
  `deploy/`) is safe (the silent-MOCK/SOPS-env trap only bites secret-needing services, [[deploy-sops-injection]]);
  no edge change (`harrow.iridi.cc` already routes to :10369). Verified visually in a real WebGL browser
  (Playwright + `--use-gl=swiftshader`) BEFORE deploy — the established frontend-visual-verify path; the temp
  playwright devDep + scripts were removed after (`bun.lock` net diff = just the `pixi.js` line).
