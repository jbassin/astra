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
  the ordinary elbow solution. A hand beyond reach straightens the arm and stretches it.
- `src/config.ts` validates the flag. A flag without a usable `anchor` means no arm; any other bad
  field falls back to its default.
- `src/main.ts` is the Foundry glue: it builds an arm on `drawToken`, re-poses it on
  `refreshToken`, rebuilds it when the flag changes, and exposes `globalThis.ikArms`.
- The arm is a `PIXI.Container` in `canvas.primary` with `sortLayer` 690, just under tokens (700),
  so it is lit and fogged like the map. A hidden token's arm shows only to GMs, at half opacity.

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
| `shoulderWidth`, `wristWidth` | 0.7, 0.4 | thickness at each end, in grid squares |
| `fill`, `outline`, `outlineWidth` | dark, gold, 5 | colours (numbers) and stroke of the drawn arm |
| `texture` | none | image path; each segment is then this image, drawn pointing right |

## Build, test, install

```sh
pnpm --filter @astra/portal-arms test
just arms-module-install     # tsdown build, then copy into Data/modules/ik-arms in Foundry
```

The module has no manifest URL; the file drop is its only install path. The first install needs the
world relaunched from Foundry's setup screen before the module appears in Manage Modules. An update
needs each client to reload.

## Traps

- **`Token#center` is the wrong position.** It reports where a move will end. The arm reads the
  token's drawn position (`token.position` plus half its size) so that it tracks the animation.
- **Foundry 14 ships PIXI 7.** The `pixi.js` in the pnpm catalog is v8, for another app. This
  package uses Foundry's global `PIXI` through the hand-written stubs in `src/types/foundry.d.ts`.
- **Only the solver and the flag parser have unit tests.** The canvas glue in `src/main.ts` was
  checked against the live world; check it there again after changing it.
