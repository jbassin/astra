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
  every fragment shader can use) and the named fragment shaders the `shader` field picks from:
  `flat` and `ink`. It also holds the shared smear buffer's passes. `apps/portal/arms/bench/`
  holds a sandbox page for writing new ones.
- `src/smear.ts` is the shared smear buffer for ink arms (below); `src/region.ts` works out the
  square of map it covers.
- `src/main.ts` is the Foundry glue: it builds an arm on `drawToken`, re-poses it on
  `refreshToken`, rebuilds it when the flag changes, advances every arm's `uTime` and the smear
  buffer on the canvas ticker, registers the buffer size setting, and exposes `globalThis.ikArms`.
- The arm is a `PIXI.Mesh` (plus a `PIXI.Graphics` for `rings`) in a `PIXI.Container` in
  `canvas.primary` with `sortLayer` 690, just under tokens (700), so it is lit and fogged like the
  map. Each arm has its own shader instance, since its uniforms differ. A hidden token's arm shows
  only to GMs, at half opacity.

## Ink arms and the shared smear buffer

An arm with `shader: "ink"` is not drawn on its own. Its mesh stays hidden (joint `rings` still
draw), and every ink arm on the scene feeds one smear buffer fixed to the map, as in the bench's
"world" mode. Each frame, while at least one ink arm exists:

1. **Paint.** Each ink arm draws its strip into the arm texture with the `ink` fragment shader,
   which works out the ink body's density in the arm's own pixels with that arm's uniforms.
   Overlapping arms combine as `a + b - ab` (normal premultiplied blending), so draw order does
   not matter.
2. **Buffer.** One quad reads the arm texture and last frame's buffer, spreads, swirls and fades
   the ink, and writes the other buffer texture; the two then swap.
3. **Image.** One quad over the whole square lights the buffer. It sits in a container in
   `canvas.primary` at sortLayer 690 and the lowest ink arm's elevation, so it is lit and fogged
   like the map.

- **The square** covers every ink arm's reach: anchor ± (segments × segment length × 1.1 + the
  arm's widest width + 2 grid squares), as one square around all of them, so texels are square.
  It is worked out when an ink arm is built or removed, not every frame; when it changes, the
  buffer is cleared.
- **Colours.** The image pass has one set of colours: `fill` (`uColorA`) and `glow` (`uColorC`)
  of the ink arm whose token id sorts first. The lighting uses only `uColorA` today.
- **Hidden tokens.** A hidden token's ink arm paints only on GM clients, at full strength.
- **Buffer size** is the client setting `ik-arms.bufferSize` (Configure Settings, Module
  Settings): 1024 (default) or 512 texels a side, for weak machines. Changing it remakes the
  textures, which clears the ink.
- The textures and the image quad exist only while an ink arm does: they are freed on the first
  frame with no ink arm, on `teardown()`, and when the canvas is torn down (scene change).

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
| `shader` | `"flat"` | fragment shader name (`src/shaders.ts`): `"flat"`, or `"ink"` for the shared smear buffer; an unknown name draws `flat` |
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
- **Ink can only be where the square is.** The square allows 10% beyond full reach, but a hand
  dragged further stretches the arm past it, and the buffer's border cuts that ink off.
- **Rebuilding an ink arm keeps its ink; removing the last one loses it.** A flag or elevation
  change removes the arm and adds it straight back, which keeps the textures. With no ink arm
  left at the next frame, the textures are freed.
- **The paint pass ignores `uAlpha`.** It writes ink density, not colour; the image pass, which is
  visible, multiplies by its own `uAlpha` (always 1).
- **The setting's `onChange` goes through `globalThis.ikArms`.** Foundry keeps the callback from
  the first registration, and re-importing the module (the dev-load macro) does not register the
  setting again, so the callback must find the running instance.
- **Only the solver, the strip, the flag parser, the smear square and the shader registry have
  unit tests.** The canvas glue in `src/main.ts` and `src/smear.ts` must be checked against the
  live world after changing it. The shaders compile and link in WebGL 1 (checked in Chromium), but
  the smear passes have never run inside Foundry.
