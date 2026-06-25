---
name: strider-balatro-timeline-gotchas
description: strider map — per-faction balatro hex tint (the filter-resolution gotcha) + the timeline UX overhaul (current-first, bounded play-once, scrubber, precomputed fold snapshots)
metadata:
  type: project
---

Three strider map product changes, 2026-06-24 (`82aa7e2`, `de13a02`, `e052694`), all LIVE on
`strider.iridi.cc`. Net-new features, not in faerrin. Related: [[strider-tithe-pixi-gotchas]] (the balatro
shader + filter recipe this builds on), [[strider-layers-kdl]], [[strider-factions-vellum]].

## Per-faction balatro field (`82aa7e2`)

The hex map shimmers with a faction-tinted copy of the page balatro swirl. **Architecture: ONE filter over
`factionHexLayer`, NOT one filter per hex** (per-hex = thousands of GPU filters, don't). The shader gained a
**`tintFromTexture`** mode (`createBalatroFilter(palette, { tintFromTexture: true })`): instead of the fixed
`uColour1/2/3` uniforms, it recovers each pixel's own faction colour from the (premultiplied) input
(`src.rgb / coverage`) and builds the 3 stops from it. Final tuned values (in `balatroBackground.ts` main):
saturation lift `mix(vec3(luma), base, 1.35)`, stops `c1=base`, `c2=base*1.03`, `c3=base*0.72` (low
contrast), and `uLightScale=0.18→0.08` for the additive crest. Page background + tithe keep the
uniform-palette path (`uTintFromTexture`/`uLightScale` default to the old behaviour) and are byte-unchanged.

- **THE load-bearing gotcha — thin horizontal grid lines drop out at certain zooms.** A pixi filter
  round-trips the whole layer through an offscreen texture; if that texture renders below device resolution,
  thin strokes vanish/flicker. strider hexes are **flat-top** (`hexCornersAtPixel` → top/bottom are
  horizontal edges), so stacked hexes form long horizontal grid lines that are the first to go. Fix (in
  `HexMap.tsx` where the filter is created): `factionTintFilter.resolution = app.renderer.resolution` +
  `factionTintFilter.antialias = "on"`. The smooth-vs-pixelated swirl is NOT the cause (tried, reverted).
- **Grid stays readable** two ways: the deep-shadow stop keeps the dark `#090c10` per-hex strokes near-black
  under the swirl, and `factionBorderLayer` sits **above** the filter unfiltered (crisp faction borders).
  Per-hex stroke width nudged `0.2 → 0.3`. Unowned hexes are a separate unfiltered layer (stay flat grey).
- **Stable field:** an invisible full-grid anchor (alpha 0, same trick as the tithe) is added to
  `factionHexLayer` so the screen-space swirl doesn't drift/rescale as territory changes; `uTime` advanced
  from the existing persistent `tickerCb`. Filter is **always on** (continuous full-map shader pass each
  frame — fine on desktop; a "reduce motion / pause when idle" guard is a possible future nicety).

## Timeline UX overhaul (`de13a02` + `e052694`)

The home map used to **replay the entire vox-log from layer 0 on every visit** — an accelerating cinematic
that grew unbounded (~18s at 52 layers, +≥220ms/layer) and **locked the controls** while playing. Replaced
with current-first + bounded play-once + a scrubber, all in `MapView/` + `domain/lib/timeline.ts`.

- **Current-first + bounded play-once** (`useTimelinePlayback.ts`, rewritten). Default = the **current
  state**. On client mount it reads `localStorage["strider:vox-log-seen"]` (the layer count last watched)
  and, if there are unseen layers, auto-plays a **play-once** catch-up of just those — capped to the last
  `MAX_PLAYBACK_LAYERS = 10` (older layers snap in instantly; first-ever visit counts as "all new" → last
  10). Nothing new → land on current, no animation. The `?seen` URL param (faction back-link) still forces
  current. **SSR-safe:** `useState(layerCount)` is the deterministic initial (no localStorage in
  render/initializer — only in the mount effect), so no hydration mismatch.
- **Speed-up removed:** `stepDwellMs` (accelerating, 900→220) deleted → constant `LAYER_DWELL_MS = 1100`
  (tithe layers still hold `TITHE_DWELL_MS` for the wave). It only plays once + is bounded, so a constant
  readable dwell is fine. (Updated/removed the `stepDwellMs` test accordingly.)
- **Controls:** `skipToEnd()` (footer **`SKIP ⏭`** while playing) and `replay()` (footer **`⟲ REPLAY`**
  when at rest on current — the opt-in **full**-history cinematic from layer 0). Arrows unlocked — any
  manual `setIndex` cancels the in-flight timer (imperative `timeoutRef`/`cancelledRef`, not the old
  closure-`cancelled`).
- **Scrubber** (`TimelineStrip.tsx`): the dot/ellipsis indicator (`dotIndices`/`Dot`/`MAX_VISIBLE_DOTS` —
  all deleted) → a styled `<input type="range">` (amber track + glowing thumb, `.scrubber`/`.scrubRow` CSS)
  + the `index/total` count. Dragging interrupts playback and scrubs.
- **Precomputed fold snapshots** (`domain/lib/timelineFrames.ts`, new + tested). `buildTimelineFrames(layers,
  factions, factionSlugs)` derives frame[0..layerCount] — each = `{regions, skein, effectiveFactionHexes,
  unownedHexes, renderFactions, renderFactionHexes, factionBorders, territoryBorders, activeBanners}` — once,
  memoized on the layer set. MapView dropped its per-index `foldRegions/foldSkein/foldFactionOverrides/
  foldBanners + compute*` memos for an **O(1) `frames[layerIndex]`** lookup (was O(index)/step → O(n²) over a
  replay); the flip animation reads `frames[layerIndex-1]` for prev-owner lookup. `bannerPseudoFaction` moved
  out of MapView into `timelineFrames.ts`.

## Conventions touched

- A new file using `!` needs adding to the **biome `noNonNullAssertion: off` override glob** in root
  `biome.json` (test files are listed individually — added `timelineFrames.test.ts`). See
  [[strider-0016-gotchas]].
- Local iteration loop used this session: `bun --filter '@astra/strider' dev` (Vite picks 10369 since the
  Compose stack holds 10360–10368) → HMR live-edit the shader/components → screenshot-by-eye → then
  `docker compose up -d --build strider` + verify health + local 10360 + public edge (per
  [[deploy-apply-with-just]]). WebGL shaders only render in a real browser (no headless screenshot here).
