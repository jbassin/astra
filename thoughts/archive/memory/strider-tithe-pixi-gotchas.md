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
   animation `update()` callback produces an empty texture. (A RenderTexture baked
   ONCE up front works — but for the tithe a baked field is *frozen* and the
   per-hex sampling *looks tiled*, so we abandoned RenderTextures entirely — see #3.)
3. **THE working recipe — "a live, continuous, animated shader clipped to flipping
   tiles" = a filter on a container of coverage tiles.** The balatro shader
   computes its color in **screen space and ignores its input**, so make `main()`
   multiply the result by the input's alpha (`texture(uTexture, vTextureCoord).a`)
   — a full opaque rect (the page bg) is unchanged, but now the shader shows only
   where the filtered content is opaque. Then: put plain **white** hex `Graphics`
   (flipping via `scale.y`, origin-centered verts → pivots at the hex center) in a
   container, and apply the filter to the **container** (NO mask — filters+masks
   don't compose, #1). The field is continuous + animated (advance `uTime` each
   frame) because the shader is one screen-space pass over the whole container,
   masked by tile coverage. Add an invisible (`alpha:0`) full-grid rect to the
   container so the filter bounds stay stable (else the field shifts as tiles
   flip). Attach the filter only while playing (`titheLayer.filters = [f]` on
   start, `= []` on cleanup) so there's no full-map shader pass at rest. Tiles are
   created per-ring as the wave front arrives (staggered by axial ring distance),
   held, then destroyed once they flip back.
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
