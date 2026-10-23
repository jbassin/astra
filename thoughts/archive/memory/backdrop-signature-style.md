---
name: backdrop-signature-style
description: PROJECT — @astra/backdrop, the shared animated-shader page background made an astra signature style (harrow/mouthpiece/ledger pixi shaders + akasha CSS nebula); the one-pixi-app-per-page constraint + how to verify a bg visually
metadata:
  type: project
---

PROJECT 2026-06-26 **COMPLETE + LIVE**: made the animated abstract page background
(harrow's starfield, strider's balatro) an **astra signature style** via a new shared
lib **`@astra/backdrop`**, and added one to **mouthpiece, ledger** (pixi shaders) +
**akasha** (CSS). 6 commits (`6858066` lib+harrow … `4232fc7` tuning), all CI-green,
deployed, live-verified by Playwright screenshots + SigNoz 0-error SSR spans. Builds
on [[harrow-0017-gotchas]] + [[strider-tithe-pixi-gotchas]] + [[ledger-0018-gotchas]].

**The lib (`libs/ts/backdrop`):**
- **`ShaderBackground`** (React) — the SSR-safe mounter, generalised from harrow's
  StarfieldBackground. **Self-contained: renders `null` until mounted** (folds in the
  ClientOnly guard), so the `<canvas>` is ABSENT from SSR HTML (no hydration mismatch);
  pixi + the factory are **dynamic-imported** in the effect (pixi never reaches the SSR
  bundle, code-splits into its own ~2 MB lazy chunk). Mount once: `<ShaderBackground
  spec={…}>` in `__root` body. Canvas is `position:fixed; inset:0; z-index:-1;
  pointer-events:none`.
- **`createShaderBackground(app, spec)`** — the pixi-v8 idiom (full-screen `Graphics`
  rect + a `Filter` from `GlProgram.from({vertex: defaultFilterVert, fragment})`,
  scaled to the renderer each frame, `uTime` from the ticker), parameterised by a
  `BackdropSpec` (fragment + uniforms). Uniforms bind under one group keyed
  `${name}Uniforms`; inner keys must match the GLSL `uniform` names.
- **Catalog** (`shaders/`): `starfield` (harrow, relocated verbatim — palette stays
  warm gold, harrow's signature), `mouthpieceResonance` (amber waveform lines + teal
  ripples), `ledgerAurora` (teal→amber→parchment domain-warped aurora). Shared
  noise/fbm GLSL + the **gothic palette as RGB 0–1** in `shaders/common.ts` (keep in
  sync with theme.css `--color-*`). Each shader has a **`uIntensity` f32** = one-knob
  tuning. A new TS lib needs ≥1 test → `backdrop.test.ts` (pure-data: every declared
  uniform appears in its fragment; no WebGL under bun test).
- Deps: `pixi.js` is a dep of backdrop; react/react-dom are peerDeps. harrow now
  depends on `@astra/backdrop` and **dropped its direct pixi.js dep** (transitive).

**THE load-bearing constraint — ONE pixi Application per page.** Two live pixi
Applications on the same page CONFLICT (the user confirmed from strider; strider's
PixiHost disables the bg on `/editor` for exactly this — "two live WebGL contexts").
So a page that already runs pixi can't also stack a backdrop Application:
- mouthpiece, ledger, harrow have **no other pixi** → the pixi shader is fine.
- **akasha already runs a WebGL/webgpu force-graph** (local + global, `Graph.tsx` does
  `new Application()`) → it gets a **CSS-only animated nebula instead** (a `.site-backdrop`
  div + `@keyframes nebula-drift`, two drifting layers of low-alpha teal/parchment/amber
  radial-gradient clouds over the void, `prefers-reduced-motion` aware) — no second
  context, graph untouched. (The "one full-screen app + two containers" alternative —
  hosting the graph IN the backdrop app — was rejected: the graph is an inline,
  slot-sized, interactive, verbatim-ported widget; too risky to refactor.)

**strider is LEFT as-is** — its balatro is entangled with the on-canvas faction-tint
via `PixiContext` (one app, layered Containers: bg rect + panel + world); not migrated.

**Verify a background VISUALLY in a real WebGL browser** — SSR HTML can't prove it
(pixi canvas absent until mount; the CSS div is present but motion is invisible in
static HTML). Recipe: temp Playwright + chromium, launch with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
`reducedMotion:"no-preference"`, `waitForTimeout(~5000)` (headless RAF throttles fast
frames), screenshot the LIVE public URL. **First pass was far too faint** (swiftshader
under-renders + diffuse fbm spreads thin) → tuned: `ledgerAurora` uIntensity 0.8→1.5,
akasha nebula alphas raised (teal 14→26%, parchment 9→17%, amber 8→15%) + blur 48→40px.
mouthpiece (0.7) + harrow (unchanged) read well first try.

**Deploy:** all four are secret-less frontends → targeted `docker compose build/up
<svc>` is safe (no SOPS-env-drop trap). A **new TS lib needs NO Dockerfile ripple** —
the frontend Dockerfiles `COPY libs/ts` wholesale (unlike a new app's package.json,
which does ripple). Live on harrow/mouthpiece/ledger/akasha .iridi.cc, SigNoz spans 0
errors.
