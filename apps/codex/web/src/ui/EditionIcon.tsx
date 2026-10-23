import type { ReactElement } from "react";

import { GLYPH_IDS } from "./GlyphDefs";

/**
 * The stakeholder's "History vs. Spark" icon pass — replaces every
 * user-visible "Remaster"/"Legacy" TEXT pill site-wide with a compact
 * square inline SVG glyph. `actionGlyph.tsx`'s own action-cost glyphs later
 * switched TO an icon font on a separate stakeholder directive
 * (`ACTIONS-GLYPH-SOURCE.md`) — this component is untouched by that switch
 * (out of scope: "action icons" specifically) and stays inline SVG. Both
 * glyphs share one `0 0 100 100` viewBox so they occupy
 * identical bounding boxes; `fill`/`stroke: currentColor` so the existing
 * `.codex-edition-remaster` amber hook (and the default
 * `--color-ink-dim`) keep working unchanged.
 *
 * P8-follow-up dedupe (`GlyphDefs.tsx`) — the traced path data for both
 * shapes (Four-Point Spark / History Ring) now lives ONCE as `<symbol
 * id={GLYPH_IDS.remaster|legacy}>`, mounted once in `src/routes/__root.tsx`;
 * every instance below emits `<use href="#...">` instead of re-emitting the
 * path `d=` string (measured: 6,173 uses of these 2 shapes on a single
 * `/feat` SSR).
 */
export type Edition = "remaster" | "legacy";

const LABELS: Record<Edition, string> = {
  remaster: "Remaster",
  legacy: "Legacy",
};

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
  const symbolId = edition === "remaster" ? GLYPH_IDS.remaster : GLYPH_IDS.legacy;
  return (
    <svg
      {...common}
      viewBox="0 0 100 100"
      className={`codex-edition-icon codex-edition-${edition}`}
    >
      <title>{label}</title>
      <use href={`#${symbolId}`} width={100} height={100} />
    </svg>
  );
}
