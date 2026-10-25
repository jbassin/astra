# @astra/backdrop — animated shader page backgrounds

backdrop is astra's signature page background: a fixed, full-viewport pixi shader behind the
content. An app mounts `<ShaderBackground spec={…} />` once in its root route's `<body>` and picks
a catalog entry or passes its own `BackdropSpec`. Users: harrow (`starfield`), ledger
(`ledgerAurora`) and mouthpiece-frontend (`mouthpieceInterference`); `mouthpieceResonance` is an
unused alternative. akasha-frontend and strider don't use it (see Traps).

## How it works

- `ShaderBackground` renders `null` until mounted, then dynamic-imports pixi and
  `createShaderBackground`. The canvas never appears in SSR HTML, and pixi stays out of the SSR
  bundle and loads in its own chunk.
- `createShaderBackground(app, spec)` draws a full-screen rect with a `Filter` built from the
  spec's fragment shader, resizes it to the renderer each frame and advances `uTime`. Uniforms
  bind as one group named `${name}Uniforms`; inner keys must match the GLSL `uniform` names.
- Every catalog shader has a `uIntensity` uniform: the one knob for how strong it looks.
- A viewer with `prefers-reduced-motion: reduce` gets one still frame (the shader at `uTime` 0):
  the ticker stops, and a resize redraws the still frame. `followMotionPreference`
  (`src/motion.ts`) follows the preference live, so toggling it needs no reload. Keep every
  shader's time-0 frame presentable (no fade-in from black).
- Shared noise code and the gothic palette (as RGB floats) are in `src/shaders/common.ts`. Keep the
  palette in step with `libs/ts/gothic/src/theme.css`.
- `backdrop.test.ts` checks that every declared uniform appears in its fragment shader. Nothing
  here can render under vitest.

## Traps

- **One pixi Application per page.** Two live WebGL apps on one page conflict. akasha's force
  graph already owns one, so akasha uses a CSS-only nebula (`.site-backdrop` in its
  `globals.css`). strider's background shares one Application with the hex map through
  `PixiHost`, so it isn't migrated here.
- **Derive screen coordinates from `vTextureCoord`, not `gl_FragCoord`,** or the pattern
  misaligns on high-DPI screens.
- **Check a background by eye in a real WebGL browser.** SSR HTML can't show it. For headless
  checks launch Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
  set `reducedMotion: "no-preference"`, wait about 5 s (headless throttles animation frames), then
  screenshot. SwiftShader under-renders brightness; allow for that when tuning `uIntensity`.
- **A new TS lib or app needs no Dockerfile change**: `deploy/node.Dockerfile` copies `libs/ts`
  whole and finds every workspace `package.json` itself.
