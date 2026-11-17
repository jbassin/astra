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
  holds a sandbox page for writing new ones, and a boss demo (see Bench).
- `src/look.ts` runs the per-client animation behind the
  shimmer and shatter looks (below). It is pure, so it has unit tests.
- `src/smear.ts` is the shared smear buffer for ink arms (below); `src/region.ts` works out the
  square of map it covers.
- `src/main.ts` is the Foundry glue: it builds an arm on `drawToken`, re-poses it on
  `refreshToken`, rebuilds it when `flags.world.ikArm` or the elevation changes, advances every
  arm's `uTime` and shimmer/shatter look and the smear buffer on the canvas ticker, registers the buffer size setting, and exposes `globalThis.ikArms`.
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
2. **Buffer.** One quad reads the arm texture and last frame's buffer, draws the arms' hands
   (below), spreads, swirls and fades the ink, and writes the other buffer texture; the two then
   swap.
3. **Image.** One quad over the whole square lights the buffer. It sits in a container in
   `canvas.primary` at sortLayer 690 and the lowest ink arm's elevation, so it is lit and fogged
   like the map.

- **The square** covers every ink arm's reach: anchor ± (segments × segment length × 1.1 + the
  arm's widest width + 2 grid squares, + 2 hand radii when the arm has a hand), as one square
  around all of them, so texels are square.
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

## Shimmer and shatter

A boss fight can mark an arm with a second token flag, `flags.world.ikShatter`, which only changes
how the arm looks. Another part of the world (the fight logic) writes it; this module only reads it.

```js
flags.world.ikShatter = { state: "shimmer" | "shattered", since: Date.now() }; // absent: a normal arm
```

- **`shimmer`**: the whole ink arm and its hand turn kaleidoscopic. The image pass tiles the map
  with hexagonal cells (`uKaleidoPx` wide), mirror-folds each into wedges around its centre and
  fills the fold with a four-step iterated domain warp: warm (mixed toward the arm's `glow`,
  `uColorC`) in the middle of a cell, teal at its edge, with hard bright facets. Every `uSnapEvery`
  seconds a cell's fold snaps a sixth of a turn over half a second (cubic ease), zooming in 25% and
  flashing, with the red channel split off wider during the snap. Cells snap at their own times
  (`uSnapSpread` 1; 0 snaps them together). The pattern shows only where the arm's sheen (g) is,
  so sweeping bands and twinkles from the paint pass still modulate it. It costs the image pass one
  hex lookup and a 4-iteration warp, twice (red is sampled apart), only on shimmering texels.
- **`shattered`**: a burst of about a second, then a settled look until the flag clears. In the
  burst the kaleidoscope flares across the whole arm and hand at full strength, shimmering or not,
  with every cell turning together while the fold zooms in; a Voronoi crack pattern opens in the
  arm's own pixels, some shards are blasted away and ink is thrown outward (the flare still shows on
  the ink that lingers where a shard was). A small white flash adds to it. The settled look is
  cracked, dead stained glass: thinner, greyer ink whose shards hold the kaleidoscope dark and
  frozen at a fixed time, with see-through crack lines edged in its colours (`uGlassGain` sets how
  strongly). Clearing the flag heals it back to normal over 0.6 seconds.
- **No rebuild.** A change to `ikShatter` does not rebuild the arm; only `ikArm` or the elevation
  does. `flagTouched` in `src/look.ts` reads Foundry's change object, including an unset
  (`{"flags": {"world": {"-=ikShatter": null}}}`).
- **Client time.** Each client times the animation from when it sees the change, never from
  `since` (clients' clocks differ). An arm that is already `shattered` when it is built (a page
  load mid-fight) starts in the settled look, with no burst. The shimmer eases in and out over
  0.4 seconds.

**Per-arm uniforms** (declared in every fragment shader's prelude; `flat` ignores them):

| Uniform | Meaning |
| --- | --- |
| `uShimmer` | 0..1, eased on the client |
| `uBroken` | 0..1, how broken the arm looks: up in 0.1 s when shattered, down in 0.6 s on reset |
| `uShatter` | seconds since this client saw the arm shatter; -1 when it is not shattered; 1000 when it was already shattered at build |

**Tuning uniforms** (the same on every arm, from `tune` in `src/look.ts`, and set on the buffer
and image passes too): `uSheenSpeed` (px/s), `uShimmerGain`, `uShardPx`, `uBurstLen` (s),
`uCrackDark`, `uKaleidoPx`, `uSnapEvery` (s), `uSnapSpread` and `uGlassGain`. The module never changes `tune`; the bench's sliders do, and its defaults are the
module's.

**Channel encoding.** Overlapping arms must combine without depending on draw order, so the paint
meshes use screen blending (`src + dst * (1 - src)`, per channel, alpha included), and each arm
paints premultiplied by its density `p`:

| Channel | Arm texture and buffer | Image pass reads |
| --- | --- | --- |
| r | ink density `p` | the ink |
| g | `p` * shimmer sheen (0..1) | glint colour and brightness |
| b | `p` * crack code | `.35 * broken` on a dulled shard, rising to 1 on a crack line |
| a | `p` * flash, using the density before the burst dropped shards | the burst's kaleidoscope flare and white flash |

The image pass divides g, b and a by r to get fractions of the ink. The buffer pass keeps g, b and a
from each frame's paint, but does not advect or spread them: they fade at 10 per second so they hug
the arm and keep their crisp edges, while r smears and fades as before. The flash also makes ink
spread down its slope up to 9 times as hard, which throws ink outward.

**Hands** carry the same look through the fourth float of `uHandParams`, packed 5 bits each as
`shimmer + 32 * broken + 1024 * burst` (`packFx`/`unpackFx` in `src/look.ts`, decoded in
`INK_BUFFER_FRAG`); the burst's strength is worked out on the CPU, and the hand's flash is the burst
cubed, as the arm's is.

## Hand

An ink arm with `hand: true` gets an upturned hand in ink at its end, under the token: a palm
beneath the token, four fingers and a thumb curling around it, ported from the bench's "ink4"
preset. The buffer pass draws it from a signed distance field, in map coordinates, so the hand
does not smear with the arm's flow; smears fade 11 times as fast in and just around it, so the
hand stays crisp. It sits at the token centre (the strip's last point) facing the way the arm
arrives (the last two strip samples). `handSize` sets its radius in token radii (the token's
width / 2 × `handSize`), `curl` how far the fingers close (0 flat, 1 curled), and the thumb goes
on the side the joints bend to (`bend`). Hands are drawn only for `shader: "ink"` arms; any
other shader ignores the hand fields.

The buffer pass takes up to 8 hands per frame as uniform arrays (`uHands`, `uHandParams`,
`uHandCount`), filled from the ink arms that paint this frame in token id order. A texel more
than 2.6 hand radii from a hand skips that hand, and the hands share one noise lookup per texel.

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
| `hand` | false | draw an ink hand holding the token (`shader: "ink"` only; see Hand) |
| `handSize` | 1 | hand radius in token radii: the token's width / 2 × `handSize` |
| `curl` | 1 | 0 to 1 (clamped): how far the fingers curl around the token |

## Shatter mechanic

A boss-fight mechanic that runs on the arms (`src/shatter.ts`; the rules are pure code in
`src/shatter-state.ts`). Four of the six arms shimmer. A hit on a shimmering arm shatters it. On
the third shatter every arm in the fight shatters (the hit arms stay shattered, every other arm
shatters at that moment), and each arm's actor gets a "Shattered" effect (Weakness 10 to all
damage). All arms stay shattered for the window. When the window ends, every arm returns to normal, the effects
go, and four new arms shimmer.

**API** (GM client, on `globalThis.ikArms.shatter`):

- `start({ arms? })` writes the fight flag on the viewed scene and picks the first four. `arms`
  (tokens, token documents or ids) defaults to every token on the scene with an `ikArm` flag. It
  stops a fight that is already running first.
- `stop()` clears every arm flag, deletes our effects and sets the fight inactive.
- `reroll()` resets now and picks four new arms.
- `status()` returns each arm's state and eligibility, the shatter count, and whether a window is
  open.

**Flags.**

- `flags.world.ikShatter = { state: "shimmer" | "shattered", since }` on each arm token. Absent
  means a normal arm. The token flags are the truth: after a reload the fight resumes from them.
  `since` is `Date.now()` on the writer. The shaders read this flag.
- `flags.world.ikShatterFight = { arms, shimmer: 4, needed: 3, weakness: 10, effectUuids, window,
  active }` on the scene. `effectUuids` lists the six effects while a window is open. `window` is
  `{ combat, round, turn }` when the third shatter happened, or null outside combat. Each effect
  item carries `flags.world.ikShatterEffect = true`.

**Trigger.** Only the active GM client acts (`game.users.activeGM?.isSelf`), so there is one
writer. A hit is an `updateActor` call with `options.damageTaken > 0` and no `options.damageUndo`
(pf2e's `applyDamage` passes `damageTaken`; undo passes `damageUndo`). The arms are unlinked, and
Foundry 14's `ActorDelta#_onUpdate` fires `updateActor` for the synthetic actor with the options
spread over, so `actor.token.id` names the arm. A hit on an arm that is not shimmering does nothing,
and neither does any hit after the third shatter. Arms at 0 HP or defeated are not picked; with
fewer than four eligible, all of them shimmer and `needed` drops to the number picked (at most 3).

**Reset.** The effects are created with an unlimited duration, on purpose. pf2e would expire a
"1 round, turn-start" effect only at the start of that arm's own turn (it requires the current
combatant's actor to be the effect's actor), so the six effects would end one at a time. Instead
the module stores the combat's round and turn at the third shatter and ends the window, in
`updateCombat`, when combat reaches that turn index in the next round or later. It also ends it
when the combat is deleted or replaced, or when any one of our effects is deleted by hand. Ending
removes the remaining effects, clears the arm flags and picks again. The steps are queued and
idempotent, so six `deleteItem` events produce one reset. A window opened outside combat has no
timer: delete an effect (or call `reroll()`) to end it.

**Traps.**

- **The damage redirect macro.** The world's "ESOTERICA damage redirect" macro resets an arm's HP
  with a plain update that has no `damageTaken`, so it is not a hit. Its `updateActor` hook runs
  on the client that applied the damage; ours runs on the active GM. Neither depends on the
  other's order.
- **Weakness lives on the arms, not the boss.** pf2e works out IWR on the arm's actor before the
  macro redirects the damage.
- **All six arms must be in the combat tracker** for the window timer to mean one round.
  Reordering or removing combatants changes the turn index; the window compares indexes only.
- **Scene flag writes merge.** `effectUuids` and `window` are written as `[]` and `null`, not unset.
- **Untested against the live world.** Only the state machine and the flag parser have unit tests.

## Active Implements

A second boss-fight mechanic (`src/implements.ts`; the rules are pure code in
`src/implements-state.ts`) that thins the boss's turns as its health bars fall. The world's macro
"ESOTERICA: active Implements (toggle)" turns it on and off.

- Every Implement starts active. Each threshold the health bars cross moves one random active
  Implement to the inactive set. Each bar has two thresholds: half its max, and 0. One Implement
  always stays active. Healing a bar back over a threshold makes a random inactive one active.
- From round 2 on, the top of each round reshuffles the sets (same sizes), clears the inactive
  Implements' initiative, rolls the active ones' initiative (whispered to the GM, no dialog), and
  puts the turn on whoever now has the highest initiative.
  Round 1 keeps the initiative rolled to start the fight.
- An inactive Implement's turn is skipped: when combat lands on it, the module calls `nextTurn()`
  (or `previousTurn()` when the GM stepped back). It stays in the combat with its HP, effects and
  flags. Its token symbol draws in greyscale (a `ColorMatrixFilter` on the token mesh) and its
  combat tracker row is greyed, on every client. The arm is unchanged.
- The shatter mechanic ignores the sets: an inactive Implement can still shimmer and shatter, and
  damage to it still drains the bars through the redirect macro.

**API** (GM client, on `globalThis.ikArms.implements`): `start({ bars, implements? })` (bars are
required; implements default to every `ikArm` token on the viewed scene), `stop()`,
`reshuffle()`, `setInactive(tokens)` (a GM override, kept until the next threshold or round) and
`status()`.

**Flags.** `flags.world.ikInactive = true` on an inactive Implement's token is the truth.
`flags.world.ikImplements = { bars, implements, active }` on the scene names the tokens. Only the
active GM client writes (`game.users.activeGM?.isSelf`), which is usually the headless portal
client, so the module reports threshold changes and each round's active set as GM whispers, not
notifications.

**Traps.**

- **The first turn of a reshuffled round.** Foundry moves to turn 0 before the module rerolls,
  and pf2e's `setMultipleInitiatives` then moves the turn to follow that combatant to its new
  place. The module sets the turn back to 0 afterwards, so the round starts with the new highest
  initiative. Turn-start processing (pf2e effects that expire at turn start) runs for whoever was
  first under the old order, and again for the new first combatant when the reset changes the turn.
- **Mid-round changes don't reorder.** An Implement that goes inactive mid-round keeps its
  initiative until the next round; its remaining turn is skipped. One made active mid-round has no
  initiative, so it sorts last and acts at the end of the round.
- **Checked live on a throwaway encounter** (thresholds, healing, skip, round 2 reshuffle and
  reroll) through the headless GM client; the greyscale was checked in a browser client.

## Bench

`bench/arm-shader-bench.html` is one self-contained page. Its **Boss demo** (the default) shows six
ink arms with hands around a centre, so normal, shimmering and shattered arms sit side by side. It
has per-arm Shimmer, Shatter and Reset buttons (clicking a shimmering hand shatters it), a Run the
cycle button (four of six shimmer, a hit on each shatters its arm, the third hit shatters all six at once, a pause, then a reset), and sliders for the tuning
uniforms with a copy button for the values. Its **Shader editor** is the older single-arm playground
with its own starter shaders.

The boss demo runs the module's own code. `src/benchSync.ts` transpiles `solve`, `region`, `strip`,
`config`, `look`, `ink-image`, `shaders` and `smear` into one `ArmsLib` script between the page's
`BEGIN generated` and `END generated` comments, and `benchSync.test.ts` fails when that block is out
of date. After changing any of those files, run `pnpm --filter @astra/portal-arms sync-bench` and
commit the page. Only the Foundry glue (token flag, hooks) is rewritten in the page, as buttons.

## Build, test, install

```sh
pnpm --filter @astra/portal-arms test
pnpm --filter @astra/portal-arms sync-bench   # refresh the bench page's copy of the module's code
just arms-module-install     # tsdown build, then copy into Data/modules/ik-arms in Foundry
```

The module has no manifest URL; the file drop is its only install path. The first install needs the
world relaunched from Foundry's setup screen before the module appears in Manage Modules. An update
needs each client to reload.

## Traps

- **Only the active GM's client runs the shatter logic, and it runs whatever module it loaded.**
  After `just arms-module-install`, a GM tab that has not reloaded still runs the old code, so
  hits do nothing even though `start()` from another GM client (the headless Portal GM) worked.
  Reload the active GM's tab (`game.users.activeGM`) before testing hits.
- **At most 8 hands.** The buffer pass has room for 8; with more ink arms with hands painting,
  the ones whose token ids sort last get no hand.
- **The hand draws under the token.** It is ink in the smear buffer at sortLayer 690, so the
  token art covers the palm and any finger it overlaps; fingers cannot wrap over the token.
- **Hands are ink-only.** `hand` does nothing on a `flat` arm.
- **The square uses the hand radius from when the arm was built.** Resizing a token resizes its
  hand on the next pose, but the square grows only when the arm is rebuilt (a flag change).

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
- **Edit the buffer's channels together.** The arm texture's r, g, b and a each mean something
  (Shimmer and shatter); a shader that writes `vec4(paint)` there reads as shimmering and cracked.
  The paint mesh must keep screen blending, or overlapping arms stop combining per channel.
- **Shimmer, cracks and flash are not advected.** They show where the arm and hand are now; a
  smear left behind by a moving arm is plain ink. They also run at the buffer's resolution (about
  3 to 4 map pixels per texel for a large boss), so a crack line under about 8 pixels wide is only a
  texel or two.
- **A shard blasted away comes back.** At the burst's peak, shards with a high random value are
  dropped from the paint, and they return as the burst dies down, so the shards do not travel; the
  ink spreading outward sells the throw.
- **The hand's palm sits under the token.** Its cracks and shimmer show on the fingers and the
  edge of the palm only.
- **The paint pass ignores `uAlpha`.** It writes ink density, not colour; the image pass, which is
  visible, multiplies by its own `uAlpha` (always 1).
- **The setting's `onChange` goes through `globalThis.ikArms`.** Foundry keeps the callback from
  the first registration, and re-importing the module (the dev-load macro) does not register the
  setting again, so the callback must find the running instance.
- **Only the solver, the strip, the flag parser, the active-Implements rules, the shatter look, the smear square, the shader
  registry and the bench sync have unit tests.** The canvas glue in `src/main.ts` must be checked
  against the live world after changing it. The shaders compile and link in WebGL 1 (checked in
  Chromium), and the bench's boss demo runs the module's smear passes, hands, shimmer and shatter in
  headless Chromium; none of it has run inside Foundry yet, and the `updateToken` hook that reads
  `ikShatter` has only been exercised through its pure helper.
