import type { ReactElement } from "react";

/**
 * SVG `<symbol>`/`<use>` dedupe (P8 follow-up, flagged ready in the P8 S4
 * build record — `/feat` measured 8.04 MB/630 KB gz, +35% gz vs P3, "the
 * per-row Cast-glyph inline SVGs are the growth"). Originally deduped 5
 * shapes (`actionGlyph.tsx`'s pip chevron/reaction hook/free-action diamond
 * + `EditionIcon.tsx`'s Four-Point Spark/History Ring); the 3 action-glyph
 * shapes are GONE now — a later stakeholder directive ("use the icons in
 * pathfinder-icons.ttf") switched `actionGlyph.tsx` to the real Paizo icon
 * font (self-hosted `@font-face`, `globals.css`) instead of inline-traced
 * SVG, so this host only carries the 2 `EditionIcon.tsx` shapes now (still
 * genuinely deduped — `/feat` alone SSRs thousands of edition-icon `<use>`s
 * against these same 2 symbols).
 *
 * This component renders the shapes ONCE as `<symbol>` definitions inside
 * one hidden host `<svg>`; every call site emits a tiny `<svg><use
 * href="#..."/></svg>` instead of re-emitting the path data. It must be
 * mounted exactly once, early in `<body>` (see `src/routes/__root.tsx`), so
 * the symbol defs are already in the DOM/HTML before any `<use>` that
 * references them parses — `<use href="#id">` resolves against the whole
 * document regardless of where the defining `<svg>` sits, but placing it
 * first keeps SSR streaming order sane and avoids a same-document
 * forward-reference footgun.
 *
 * `display: none` (not `visibility: hidden` or a 0×0 viewport trick) is
 * deliberate: per the SVG spec a `display: none` ancestor still lets its
 * descendant `<symbol>` definitions be referenced by `<use>` elsewhere in
 * the document (unlike some `visibility`/clip tricks in older browsers),
 * and it removes the host from layout/hit-testing entirely.
 */

const SPARK_PATH_D = "M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z";

const RING_ARC_D = "M 61 20 A 32 32 0 1 1 39 20";
const RING_ARROWHEAD_D = "M 39 20 L 50 9 L 55 22 Z";

/** Stable `<symbol id>` values — `EditionIcon.tsx` `<use>`s against these;
 * also the pin surface `GlyphDefs.test.tsx` checks the traced path data
 * against. */
export const GLYPH_IDS = {
  remaster: "codex-glyph-remaster",
  legacy: "codex-glyph-legacy",
} as const;

/** Mount ONCE, near the top of `<body>` — see `src/routes/__root.tsx`. */
export function GlyphDefs(): ReactElement {
  return (
    <svg aria-hidden="true" focusable="false" style={{ display: "none" }}>
      <defs>
        {/* EditionIcon.tsx — both share one 0 0 100 100 viewBox. */}
        <symbol id={GLYPH_IDS.remaster} viewBox="0 0 100 100">
          <path d={SPARK_PATH_D} fill="currentColor" />
        </symbol>
        <symbol id={GLYPH_IDS.legacy} viewBox="0 0 100 100">
          <path
            d={RING_ARC_D}
            fill="none"
            stroke="currentColor"
            strokeWidth={11}
            strokeLinecap="round"
          />
          <path d={RING_ARROWHEAD_D} fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  );
}
