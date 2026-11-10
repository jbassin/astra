# ik-arms: shader-drawn arms with shared smear buffer (2026-11-09)

Josh agreed this plan in the conversation on 2026-11-09. It changes how the `ik-arms` Foundry
module (`apps/portal/arms`) draws arms, for the six-handed Esoterica boss on the "esoterica"
scene. The look was designed in a sandbox page; this file is the plan and section 1 is the
checklist.

## 0. What and why

Today each arm is a `PIXI.Graphics`: one tapered polygon per segment, joint discs on top, flat
colours. Image textures were tried and dropped. Josh wants the arms drawn with shaders, and
settled on an "iridescent ink" look adapted from a Shadertoy shader: an ink body that fills the
arm, smears that drift off its edges, and lighting with a rainbow rim.

The sandbox is the reference for every behaviour below:

- Published: https://claude.ai/artifact/TD2PLnB9mKiWRxfW9Nyx3p (private to Josh).
- In the repo: `apps/portal/arms/bench/arm-shader-bench.html`. It runs PIXI 7.4.3 (the version in
  the live Foundry container) and the module's own solver. The starter "Iridescent ink, free
  smears (Buffer A on the map)" is the target look; its shaders are `WORLD_INK_BUFFER` and
  `WORLD_INK_IMAGE` in that file.

Decisions made in the conversation:

- **Smooth curve.** An arm is one continuous strip along a Catmull-Rom curve through the joints,
  pinched on the inside of tight bends so it never folds (`buildPath` and `updateArm` in the
  bench). The old straight-segment strip folded at each bend, which made segments read as
  separate pieces.
- **One shared buffer.** The smear buffer is fixed to the map, covers every arm's reach, and is
  shared by all arms on the scene (six separate buffers would cost six times as much and would
  overlap anyway). Arms paint their ink body into it each frame; one buffer pass smears and
  fades; one image pass lights the whole area.
- **Named shaders, not shader code in flags.** A flag field picks a shader built into the module.
- **No image textures.** The `texture` field and its sprite code go.
- **Alternating bend** stays on the list: an option where joints bend alternately left and
  right, so 3- and 4-segment arms make S-curves.

## 1. Checklist

- [x] Sandbox built and the look agreed (2026-11-09).
- [x] Plan and sandbox committed.
- [ ] **Slice 1: mesh drawing.** Replace the `Graphics` arm with a `PIXI.Mesh` strip on the
      smooth curve, shader inputs as in the bench (`vUv`, `vDist`, `vSeg`, `vHalf`, `uTime`,
      `uLength`, `uSegments`, `uColorA/B/C`). Flag fields: `shader` (default `"flat"`, the
      current fill-and-outline look), `smooth` (default `true`), `rings` (joint discs, default
      `false`), `glow` (third colour). Remove `texture`. Pure strip builder with unit tests.
- [ ] **Slice 2: alternating bend.** A `bendPattern` field (`"arc"` default, `"alternate"`) in
      the solver and flag parser, with unit tests. Independent of slice 1.
- [ ] **Slice 3: shared smear buffer and the ink shader** (after slice 1). One map-fixed buffer
      per scene, ping-pong render textures, arms with `shader: "ink"` paint into it, the image
      pass is drawn over the buffer's area in `canvas.primary`. Buffer size is a client setting
      (1024 default, 512 for weak machines). Hidden tokens' arms paint only for GMs.
- [ ] **Live:** install the module, check it in the GM client, set the six Implements to
      `shader: "ink"`, Josh checks a player client.
- [ ] Wrap up: README, `docs/now.md`, `docs/backlog.md`.

## 2. Notes for the slices

- The canvas glue has no unit tests (README trap); check it in the live world after each slice.
- Foundry 14 ships PIXI 7.4.3; this package uses the global `PIXI` through hand-written stubs in
  `src/types/foundry.d.ts`, so new PIXI classes need stubs there.
- In the bench, the buffer pass also paints the body. With one buffer for several arms, each
  arm's length and width differ, so the body pattern moves into a per-arm paint pass (drawn
  with that arm's uniforms into the arm texture), and the buffer pass reads the painted density.
