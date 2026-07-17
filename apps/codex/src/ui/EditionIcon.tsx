import type { ReactElement } from "react";

/**
 * The stakeholder's "History vs. Spark" icon pass — replaces every
 * user-visible "Remaster"/"Legacy" TEXT pill site-wide with a compact
 * square inline SVG glyph (NOT an icon font — icon fonts blank out in
 * rasterized PNG export, same reasoning `actionGlyph.tsx` already
 * documents). Both glyphs share one `0 0 100 100` viewBox so they occupy
 * identical bounding boxes; `fill`/`stroke: currentColor` so the existing
 * `.codex-edition-remaster` amber hook (and the default
 * `--color-ink-dim`) keep working unchanged.
 */
export type Edition = "remaster" | "legacy";

const LABELS: Record<Edition, string> = {
  remaster: "Remaster",
  legacy: "Legacy",
};

/**
 * The Four-Point Spark (Remaster) — a crisp four-pointed star (a diamond
 * with concave curved edges), stakeholder-specified path verbatim.
 */
const SPARK_PATH_D = "M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z";

/**
 * The History Ring (Legacy) — a thick circular arc that doesn't quite
 * close at the top (a 40°-wide gap centered on 12 o'clock), drawn the long
 * way around (320°) so the open end sits at top. `RING_ARROWHEAD_D` caps
 * the arc's left-of-gap end in a filled triangle tangent to the circle at
 * that point, so it reads as a classic undo/rewind counter-clockwise
 * arrow — the tip points down-and-left, the direction the arrow would
 * keep sweeping if it continued past the gap.
 */
const RING_ARC_D = "M 61 20 A 32 32 0 1 1 39 20";
const RING_ARROWHEAD_D = "M 39 20 L 50 9 L 55 22 Z";

/**
 * Inline SVG edition icon. `role="img"` + `aria-label` + a `<title>` child
 * keep the "Remaster"/"Legacy" meaning discoverable (hover tooltip,
 * screen readers) even though the text no longer renders directly.
 * `className` carries both a shared hook (`codex-edition-icon`, sizing +
 * default color) and a per-edition hook (`codex-edition-remaster` /
 * `codex-edition-legacy`, color only) — the same two-class convention the
 * old pill spans used.
 */
export function EditionIcon({ edition }: { edition: Edition }): ReactElement {
  const label = LABELS[edition];
  // `role`/`aria-label` spread from a plain object (not literal JSX
  // attributes) — the same `actionGlyph.tsx` convention, which also
  // sidesteps oxlint's `jsx-a11y/prefer-tag-over-role` false positive on
  // an icon `<svg>` (the rule can't see past a literal `role="img"` on the
  // tag itself to know it isn't a raster `<img>` candidate).
  const common = { role: "img" as const, "aria-label": label };
  return (
    <svg
      {...common}
      viewBox="0 0 100 100"
      className={`codex-edition-icon codex-edition-${edition}`}
    >
      <title>{label}</title>
      {edition === "remaster" ? (
        <path d={SPARK_PATH_D} fill="currentColor" />
      ) : (
        <>
          <path
            d={RING_ARC_D}
            fill="none"
            stroke="currentColor"
            strokeWidth={11}
            strokeLinecap="round"
          />
          <path d={RING_ARROWHEAD_D} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
