# Action-glyph asset provenance (D29-65 / R5)

**Legal posture:** stakeholder-cleared on the record ("I've checked with our lawyers and we have
permission" — 0029 P6 scope doc, R5). Not re-litigated here; this file records only the technical
provenance the decision requires.

## Source

- **Repo:** `foundryvtt/pf2e` (the official Foundry VTT Pathfinder Second Edition system)
- **Asset:** `static/fonts/pathfinder-2e-actions.woff2` — the system's own action-icon font
- **Tag fetched:** `pf2e-8.3.0` — the exact same release our existing Foundry snapshot
  (`data/snapshots/foundry/pf2e-8.3.0/`) already pins, so the glyph shapes match the corpus's own
  action-cost data vintage exactly
- **Commit:** `bebe55ad9f5e0b7184fd019bc1e410fdbb2e934e`
- **Fetch URL:**
  `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.3.0/static/fonts/pathfinder-2e-actions.woff2`
- **Fetch date:** 2026-07-15
- **Fetched file SHA-256:** `235ad1a4540736c4521e07d5c8d3445b68dbe1398e8b32b7d7a5b2551a15fcee`
- **Font metadata (from its own `name` table):** `Pathfinder2eActions`, "Version 001.000",
  "FontForge 2.0 : Pathfinder2eActions : 23-9-2019" — a hand-built icon font, not a generated one

## Codepoint → cost mapping (cross-checked against the system's own source)

The pf2e system's `getActionGlyph()` helper (`src/util/misc.ts`, same `pf2e-8.3.0` tag) maps an
action cost to a single character rendered in this font:

| Cost       | Character | Font glyph name (from the font's own `cmap`/`post` tables) |
|------------|-----------|--------------------------------------------------------------|
| 1 action   | `"1"`     | `one` (identical outline to glyph `A`/`a`)                    |
| 2 actions  | `"2"`     | `two` (identical outline to glyph `D`/`d`)                    |
| 3 actions  | `"3"`     | `three` (identical outline to glyph `T`/`t`)                  |
| Free       | `"F"`     | `F`/`f` (identical outline to glyph `four`)                   |
| Reaction   | `"R"`     | `R`/`r` (identical outline to glyph `five`)                   |

(The font ships digit-glyphs and letter-glyphs as literal geometric duplicates of each other —
verified via `fontTools`' `BoundsPen`, matching advance widths and contour counts pairwise — so
either codepoint traces to the identical outline; the mapping above is the one the system's own
code actually emits.)

## Glyphs pulled (the 5 `ActionCost` values `actionGlyph.tsx`'s type already names)

- **One action** — glyph `one` (≡ `A`) → `PIP_PATH_D` in `actionGlyph.tsx`, reused 1–3× for the
  1/2/3-action counts (the file's own pre-existing composition scheme, unchanged by this swap).
- **Two/three actions** — NOT pulled as separate composite glyphs (`two`/`three` exist in the font
  as wider multi-pip-in-one-glyph shapes, but `actionGlyph.tsx`'s existing design repeats the
  single one-action pip glyph N times at a fixed spacing rather than embedding N distinct
  pre-composed glyphs — kept as-is per D29-65's "pure asset swap" instruction; only the pip's own
  outline is real-traced, not the multi-pip composition).
- **Reaction** — glyph `R` (≡ `five`) → `REACTION_PATH_D`.
- **Free action** — glyph `F` (≡ `four`) → `FREE_PATH_D`.

## Conversion (one-time, offline — no runtime font dependency added)

1. Decoded the WOFF2 → glyf outlines with `fontTools` (`TTFont`, Python; `brotli` extra for WOFF2
   decompression).
2. For each of the 3 glyphs pulled, computed its native bounding box (`BoundsPen`) and built an
   affine transform (uniform scale + Y-flip, since TrueType is Y-up/font-units and SVG is
   Y-down/pixels) mapping that bounding box onto a small integer-ish coordinate space matching
   `actionGlyph.tsx`'s existing viewBox conventions: the pip → x:0–7.5,y:3–13 (the exact box the
   old placeholder triangle already occupied, so the `count * 9 + 1` / `i * 9 + 1` composition math
   needed zero changes); reaction/free → x:2–14,y:2–14 inside the existing `0 0 16 16` viewBox.
3. Drove `fontTools.pens.transformPen.TransformPen` wrapping `fontTools.pens.svgPathPen.SVGPathPen`
   with that transform, so the font's own quadratic-curve emission (including TrueType's
   "implied on-curve point" contours, e.g. the reaction hook) is handled by fontTools itself, not
   hand-rolled — avoids the curve-segment bugs a naive point-flattening approach hits.
4. Coordinates rounded to 2 decimal places for a compact `d` string.
5. Visually verified each path by rasterizing to PNG (`cairosvg`) before pasting into the
   component — the pip renders as the expected concave chevron, free as a diamond with its
   characteristic notch cutout, reaction as the hooked circular arrow — all recognizable as the
   real pf2e action icons, not the prior placeholder approximations (a plain triangle, an
   unfilled diamond outline, a hand-drawn hook).

No font-to-SVG conversion tool is a runtime/build dependency — this was a one-shot script run
locally, and only the resulting `d` attribute strings are committed (`actionGlyph.tsx`).

## What did NOT change

Every prop signature, the `role="img"`/`aria-label`/`<title>` accessibility contract, and the
inline-SVG-not-a-font mechanism (D29-46 — icon fonts blank out in the vellum-render PNG export
path) are byte-identical to the prior implementation. No downstream call site (`statblock.tsx`,
`facetHeader.tsx`'s `CodexActionGlyph`, `nodes.tsx`'s inline `actionGlyph` case, `text.ts`'s
plain-text fallback) changed at all — this is a pure asset swap, per D29-65.
