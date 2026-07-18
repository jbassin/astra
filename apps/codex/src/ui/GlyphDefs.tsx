import type { ReactElement } from "react";

/**
 * SVG `<symbol>`/`<use>` dedupe (P8 follow-up, flagged ready in the P8 S4
 * build record — `/feat` measured 8.04 MB/630 KB gz, +35% gz vs P3, "the
 * per-row Cast-glyph inline SVGs are the growth"). `/feat` alone SSRs 8,332
 * `<svg>` elements but only 5 DISTINCT shapes (`actionGlyph.tsx`'s pip
 * chevron/reaction hook/free-action diamond + `EditionIcon.tsx`'s
 * Four-Point Spark/History Ring) — every one of those 8,332 elements
 * repeated the same path `d=` string verbatim.
 *
 * This component renders the 5 shapes ONCE as `<symbol>` definitions inside
 * one hidden host `<svg>`; every call site now emits a tiny `<svg><use
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

const PIP_PATH_D =
  "M3.72 3ZM3.72 3 7.5 7.99 3.72 13 1.9 10.56 3.86 8.01 1.9 5.44ZM1.32 6.23 2.67 7.99 1.32 9.78 0 7.99Z";

const REACTION_PATH_D =
  "M8.85 8.78 8.29 11.62Q8.56 11.52 8.85 11.35Q9.51 11.02 9.98 10.55Q10.51 10.03 10.8 9.36Q10.99 9 11.09 8.61Q11.15 8.29 11.15 7.93Q11.15 7.87 11.15 7.81Q11.15 7.76 11.15 7.7Q11.09 6.97 10.75 6.24Q10.3 5.31 9.4 4.73Q8.71 4.27 7.84 4Q7.29 3.86 6.7 3.79Q6.61 3.79 6.5 3.78Q6.39 3.77 6.31 3.79Q5.78 3.79 5.22 3.89Q4.46 4.08 3.77 4.38Q3.14 4.69 2.69 5.14Q2.5 5.28 2.32 5.49Q2.16 5.68 2 5.85Q2.29 5.04 2.79 4.38Q3.14 3.86 3.61 3.46Q4.27 2.93 5.04 2.59Q5.73 2.28 6.57 2.12Q7.26 2.02 7.89 2Q7.95 2 8.01 2Q8.08 2 8.16 2Q8.71 2 9.35 2.12Q9.98 2.23 10.54 2.48Q11.04 2.71 11.57 3.04Q12.12 3.4 12.55 3.83Q13 4.3 13.31 4.84Q13.58 5.26 13.74 5.69Q14 6.42 14 7.11Q14 7.62 13.84 8.14Q13.68 8.66 13.44 9.22Q13.15 9.79 12.73 10.2Q12.41 10.57 11.81 11.02Q11.3 11.38 10.88 11.62Q10.14 11.98 9.19 12.15Q8.82 12.21 8.45 12.21L9.48 14L3.82 12.53Z";

const FREE_PATH_D =
  "M8.05 2 14 7.94 7.96 14 2 8.06ZM5.47 6.54 4.17 7.81 5.47 9.07 6.72 7.82ZM8.05 3.65 6.6 5.12 9.45 7.99 6.53 10.94 7.83 12.24 12.27 7.85Z";

const SPARK_PATH_D = "M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z";

const RING_ARC_D = "M 61 20 A 32 32 0 1 1 39 20";
const RING_ARROWHEAD_D = "M 39 20 L 50 9 L 55 22 Z";

/** Stable `<symbol id>` values — both `actionGlyph.tsx` and `EditionIcon.tsx`
 * `<use>` against these; also the pin surface `GlyphDefs.test.tsx` checks
 * the traced path data against. */
export const GLYPH_IDS = {
  pip: "codex-glyph-pip",
  reaction: "codex-glyph-reaction",
  free: "codex-glyph-free",
  remaster: "codex-glyph-remaster",
  legacy: "codex-glyph-legacy",
} as const;

/** Mount ONCE, near the top of `<body>` — see `src/routes/__root.tsx`. */
export function GlyphDefs(): ReactElement {
  return (
    <svg aria-hidden="true" focusable="false" style={{ display: "none" }}>
      <defs>
        {/* actionGlyph.tsx — natural bbox x:0-7.5, y:3-13 in a 16-tall box
            (see actionGlyph.tsx's own comment); symbol viewBox matches the
            original bare-path coordinate space 1:1 so `<use width height
            x>` reproduces the old `translate(dx,0)` pip layout exactly. */}
        <symbol id={GLYPH_IDS.pip} viewBox="0 0 7.5 16">
          <path d={PIP_PATH_D} />
        </symbol>
        <symbol id={GLYPH_IDS.reaction} viewBox="0 0 16 16">
          <path d={REACTION_PATH_D} />
        </symbol>
        <symbol id={GLYPH_IDS.free} viewBox="0 0 16 16">
          <path d={FREE_PATH_D} />
        </symbol>
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
