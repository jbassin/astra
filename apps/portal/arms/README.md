# @astra/portal-arms — the ik-arms Foundry module (id `ik-arms`)

A FoundryVTT module that draws a jointed arm from a fixed anchor point on the map to a token, and
re-poses the arm whenever the token moves. The token is the hand. It was built for a boss whose six
hands are six tokens. It has nothing to do with portal's MCP bridge; it lives in `apps/portal`
because that is where astra's Foundry code is.

## How it works

- An arm is configured by one flag on the token document, `flags.world.ikArm` (fields below). The
  flag is the only thing Foundry syncs. Every client draws the arm itself from where the token is
  on its own screen, so the arm follows move animations and the GM's drag preview.
- `src/solve.ts` poses the arm: the joints lie on a circular arc from anchor to hand, so the pose
  depends only on the two end points and every client draws the same arm. With two segments this is
  the ordinary elbow solution. With `bendPattern: "alternate"` the joints instead sit on alternate
  sides of the anchor-hand line, so arms of 3+ segments zigzag across it. A hand beyond reach straightens the arm and stretches it.
- `src/config.ts` validates the flag. A flag without a usable `anchor` means no arm; any other bad
  field falls back to its default.
- `src/strip.ts` turns the joints into a triangle strip: it samples a Catmull-Rom curve through
  the joints (or straight lines, when `smooth` is off), tapers the width from shoulder to wrist,
  pinches the inner side of tight bends so the strip never folds, and mitres straight joints.
- `src/shaders.ts` holds the strip's vertex shader, the fragment prelude (attributes and uniforms
  every fragment shader can use) and the named fragment shaders the `shader` field picks from.
  Only `flat` ships. `apps/portal/arms/bench/` holds a sandbox page for writing new ones.
- `src/main.ts` is the Foundry glue: it builds an arm on `drawToken`, re-poses it on
  `refreshToken`, rebuilds it when the flag changes, advances every arm's `uTime` on the canvas
  ticker, and exposes `globalThis.ikArms`.
- The arm is a `PIXI.Mesh` (plus a `PIXI.Graphics` for `rings`) in a `PIXI.Container` in
  `canvas.primary` with `sortLayer` 690, just under tokens (700), so it is lit and fogged like the
  map. Each arm has its own shader instance, since its uniforms differ. A hidden token's arm shows
  only to GMs, at half opacity.

## Using it

Run these in the browser console or a script macro, as a GM:

```js
ikArms.pickAnchor(); // select hand tokens first, then click the map once per token
ikArms.attach(token, { segments: 3, length: 700 }); // change fields on an existing arm
ikArms.attach(token, { anchor: { x: 980, y: 6160 } }); // or set the anchor by coordinates
ikArms.detach(token);
```

| Field | Default | Meaning |
| --- | --- | --- |
| `anchor` | required | `{x, y}` canvas point the shoulder is pinned to |
| `segments` | 2 | rigid segments (1 to 12); 2 is an upper arm and a forearm |
| `length` | fitted | pixels per segment; fitted so the arm is 1.25 times the current distance |
| `bend` | 1 | 1 or -1: which way the joints bend |
| `bendPattern` | `"arc"` | `"arc"` bends every joint the same way (a C); `"alternate"` zigzags across the anchor-hand line; the same pose for 2 segments |
| `shoulderWidth`, `wristWidth` | 0.7, 0.4 | thickness at each end, in grid squares |
| `fill`, `outline`, `glow` | dark, gold, pink | colours (numbers): `uColorA`, `uColorB`, `uColorC` |
| `outlineWidth` | 5 | edge thickness in pixels (`uOutlineWidth`), for the strip and the rings |
| `shader` | `"flat"` | fragment shader name (`src/shaders.ts`); an unknown name draws `flat` |
| `smooth` | true | curve through the joints; false draws straight segments |
| `rings` | false | draw a disc over each joint, 1.25 times the arm's width there |

## Build, test, install

```sh
pnpm --filter @astra/portal-arms test
just arms-module-install     # tsdown build, then copy into Data/modules/ik-arms in Foundry
```

The module has no manifest URL; the file drop is its only install path. The first install needs the
world relaunched from Foundry's setup screen before the module appears in Manage Modules. An update
needs each client to reload.

## Traps

- **A 3-segment alternate arm cannot reach closer than one segment.** Inside that it folds flat on
  the anchor-hand line and its last segment shortens to keep the hand attached. Alternate arms of 4
  or more segments, and all `arc` arms, reach all the way in.
- **`Token#center` is the wrong position.** It reports where a move will end. The arm reads the
  token's drawn position (`token.position` plus half its size) so that it tracks the animation.
- **Foundry 14 ships PIXI 7.** The `pixi.js` in the pnpm catalog is v8, for another app. This
  package uses Foundry's global `PIXI` through the hand-written stubs in `src/types/foundry.d.ts`.
- **A custom shader gets no alpha from PIXI.** `PIXI.Mesh` ignores the container's `alpha` for a
  plain `PIXI.Shader`, so the arm passes it as `uAlpha` and every fragment shader must multiply its
  (premultiplied) output by it, or a hidden token's arm draws fully opaque.
- **The pinch is per sample.** On a very tight bend the inner edge can still step back a pixel or
  two between samples. An opaque shader hides it; a translucent one may show a seam there.
- **Only the solver, the strip, the flag parser and the shader registry have unit tests.** The
  canvas glue in `src/main.ts` must be checked against the live world after changing it.
