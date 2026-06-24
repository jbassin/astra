---
name: strider-tithe-pixi-gotchas
description: strider `tithe` transient layer-change + the load-bearing pixi v8 rendering gotchas hit building its flipping-tile shader wave
metadata:
  type: project
---

The strider `tithe` layer change (2026-06-23, COMPLETE + pushed): a **transient
visual event** — a wave of flipping purple-shader tiles emanates from the map
center to the edges then flips back, changing **no** persistent state. New
`{ op: "tithe" }` Change variant; every fold ignores it (it's not a region/skein/
claim/banner op), so it surfaces only as `LayerAnimation.tithe` when the timeline
plays forward onto it. Editor: an `event` kind → `tithe` mode (no selection).
Commits `62ddf4e`(model) `ae1b85f`(render) `83f5f75`(editor).

## The shader

`balatroBackground.ts` is the page-background balatro shader. Refactored so the
3 palette stops are **uniforms** (`uColour1/2/3`, vec3) instead of `#define`s, and
`createBalatroFilter(palette)` is extracted. Page bg keeps the teal/amber default;
the tithe uses `TITHE_PALETTE` (purples/blacks). Same shader, two palettes.

## Load-bearing pixi v8 gotchas (cost hours — heed these for any pixi effect)

1. **Filters + masks DO NOT compose.** A `Graphics`/`Container` with a live
   `filter` that is also masked (`.mask = g`, on the object OR its parent) renders
   **nothing** — the mask drops the filtered output entirely. Confirmed both ways.
2. **Rendering to a RenderTexture from inside the ticker yields a BLANK target.**
   `app.renderer.render({ container, target })` called inside an `app.ticker` /
   animation `update()` callback produces an empty texture. **Bake once up front**
   (before starting the animation) — a static field is fine; the motion carries it.
3. **The working recipe for "shader clipped to flipping tiles":** bake the
   filtered shader rect to a `RenderTexture` ONCE (off-screen rect, not added to
   the world), then draw **each hex as its own `Graphics`** filled with that
   texture via a **per-hex fill matrix** (`new Matrix(sx,0,0,sy, (cx+halfW)*sx,
   (cy+halfH)*sy)`) so adjacent tiles sample one continuous field. Flip each tile
   with `scale.y` (drawn with origin-centered local verts; pivots at the hex
   center). No mask, no live filter on the rendered tiles. Tiles are created
   per-ring as the wave front arrives (staggered by axial ring distance) and
   destroyed once they flip back — bounds the active count.
4. **Headless capture caveat (verification, not a runtime bug):** headless
   Chromium throttles `requestAnimationFrame`, so screenshotting a ~1–2 s pixi
   animation at wall-clock offsets almost always misses the frames (the wave's
   ticks don't align with playwright waits). To verify a fast pixi animation:
   temporarily bump its duration to ~4–5 s, then screenshot — it renders fine.
   Also set `reducedMotion: 'no-preference'` on the playwright context, else
   `prefersReducedMotion()` short-circuits `startAnimation` (no animation at all).

## Wave shape

`scaleYAt(d, now)`: per ring d (axial distance from center), flip-in (220ms) →
hold (160ms) → flip-out (220ms), staggered by `d * waveStep`. Total ∈ [2000,
2600]ms. The trailing flip-out makes the purple a traveling ring that expands to
the edges and reveals the map behind it — "emanates from center, expands to the
edges, before fading back." Reduced-motion: skipped (no state lost).

Related: [[strider-banner-alliance-gotchas]], [[strider-0016-gotchas]].
