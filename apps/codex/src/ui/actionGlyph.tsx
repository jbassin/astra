import type { ReactElement } from "react";

/**
 * D29-46 — moved verbatim from the gothic lib's `render/glyphs/actions.tsx` (the
 * spec's own instruction: "moved, not rewritten"). Theme-agnostic (`fill:
 * currentColor`), so nothing here needed to change for the parchment system —
 * only its import path moved, to `@/ui` (`domain/render/actionGlyph.tsx`'s
 * AoN/Foundry vocabulary shim re-points its import here, unchanged
 * otherwise).
 *
 * R5 (D29-65) — the 3 `<path>`-producing sites below now draw the REAL
 * traced pf2e action-icon outlines (see `./ACTIONS-GLYPH-SOURCE.md` for the
 * exact source/version/conversion provenance) instead of the placeholder
 * approximations this file shipped with at D29-46. Pure asset swap: every
 * prop signature, `role="img"`/`aria-label`/`<title>`, and the inline-SVG
 * (never a font) mechanism are byte-identical — no downstream call site
 * (`statblock.tsx`, `facetHeader.tsx`, `nodes.tsx`, `text.ts`) changes.
 */

/** PF2e action-economy costs. Purely visual — no rules meaning attached. */
export type ActionCost = "1" | "2" | "3" | "reaction" | "free";

const ALIASES: Record<string, ActionCost> = {
  "1": "1",
  one: "1",
  single: "1",
  "2": "2",
  two: "2",
  double: "2",
  "3": "3",
  three: "3",
  triple: "3",
  r: "reaction",
  reaction: "reaction",
  react: "reaction",
  "0": "free",
  f: "free",
  free: "free",
};

/** Normalize an author token (`:action[2]`, `:action[reaction]`) to a cost, or null. */
export function normalizeActionCost(raw: string): ActionCost | null {
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}

const LABELS: Record<ActionCost, string> = {
  "1": "one action",
  "2": "two actions",
  "3": "three actions",
  reaction: "reaction",
  free: "free action",
};

/**
 * The real traced pf2e action-pip chevron (glyph `one`/`A` in the source
 * font), exact-traced to SVG `<path>` data — see `./ACTIONS-GLYPH-SOURCE.md`.
 * Natural bounding box is x:0–7.5, y:3–13 (a 16-tall viewBox) — i.e. the
 * SAME box the old placeholder triangle's FIRST pip occupied shifted left
 * by 1 (the old triangle was `M${x} 3 L${x+7} 8 L${x} 13`, so its x:1–8
 * first-pip box; this path is that box translated to start at 0). `Pip`
 * below re-applies that `-1` via `translate` so the existing `count * 9 + 1`
 * width / `i * 9 + 1` offset composition math needed no change — the
 * multi-pip layout is untouched, only the shape is real.
 */
const PIP_PATH_D =
  "M3.72 3ZM3.72 3 7.5 7.99 3.72 13 1.9 10.56 3.86 8.01 1.9 5.44ZM1.32 6.23 2.67 7.99 1.32 9.78 0 7.99Z";

/** The real traced reaction-hook glyph (`five`/`R`), fit to a 0 0 16 16 viewBox. */
const REACTION_PATH_D =
  "M8.85 8.78 8.29 11.62Q8.56 11.52 8.85 11.35Q9.51 11.02 9.98 10.55Q10.51 10.03 10.8 9.36Q10.99 9 11.09 8.61Q11.15 8.29 11.15 7.93Q11.15 7.87 11.15 7.81Q11.15 7.76 11.15 7.7Q11.09 6.97 10.75 6.24Q10.3 5.31 9.4 4.73Q8.71 4.27 7.84 4Q7.29 3.86 6.7 3.79Q6.61 3.79 6.5 3.78Q6.39 3.77 6.31 3.79Q5.78 3.79 5.22 3.89Q4.46 4.08 3.77 4.38Q3.14 4.69 2.69 5.14Q2.5 5.28 2.32 5.49Q2.16 5.68 2 5.85Q2.29 5.04 2.79 4.38Q3.14 3.86 3.61 3.46Q4.27 2.93 5.04 2.59Q5.73 2.28 6.57 2.12Q7.26 2.02 7.89 2Q7.95 2 8.01 2Q8.08 2 8.16 2Q8.71 2 9.35 2.12Q9.98 2.23 10.54 2.48Q11.04 2.71 11.57 3.04Q12.12 3.4 12.55 3.83Q13 4.3 13.31 4.84Q13.58 5.26 13.74 5.69Q14 6.42 14 7.11Q14 7.62 13.84 8.14Q13.68 8.66 13.44 9.22Q13.15 9.79 12.73 10.2Q12.41 10.57 11.81 11.02Q11.3 11.38 10.88 11.62Q10.14 11.98 9.19 12.15Q8.82 12.21 8.45 12.21L9.48 14L3.82 12.53Z";

/** The real traced free-action diamond glyph (`four`/`F`), fit to a 0 0 16 16 viewBox. */
const FREE_PATH_D =
  "M8.05 2 14 7.94 7.96 14 2 8.06ZM5.47 6.54 4.17 7.81 5.47 9.07 6.72 7.82ZM8.05 3.65 6.6 5.12 9.45 7.99 6.53 10.94 7.83 12.24 12.27 7.85Z";

/** A single filled "action pip" chevron, offset `x` units along the shared strip. */
function Pip({ x }: { x: number }): ReactElement {
  const dx = x - 1;
  return <path transform={dx === 0 ? undefined : `translate(${dx},0)`} d={PIP_PATH_D} />;
}

/**
 * Inline SVG action glyph (NOT an icon font — icon fonts blank out in
 * rasterized PNG export). `fill: currentColor` so theme CSS controls color.
 */
export function ActionGlyph({ cost }: { cost: ActionCost }): ReactElement {
  const label = LABELS[cost];
  const common = {
    role: "img" as const,
    "aria-label": label,
    height: "1em",
    fill: "currentColor",
    style: { verticalAlign: "-0.12em" as const },
  };

  if (cost === "reaction") {
    return (
      <svg {...common} viewBox="0 0 16 16" width="1em">
        <title>{label}</title>
        <path d={REACTION_PATH_D} />
      </svg>
    );
  }
  if (cost === "free") {
    return (
      <svg {...common} viewBox="0 0 16 16" width="1em">
        <title>{label}</title>
        <path d={FREE_PATH_D} />
      </svg>
    );
  }

  const count = Number(cost);
  const width = count * 9 + 1;
  return (
    <svg {...common} viewBox={`0 0 ${width} 16`} width={`${width / 16}em`}>
      <title>{label}</title>
      {Array.from({ length: count }, (_, i) => (
        <Pip key={i} x={i * 9 + 1} />
      ))}
    </svg>
  );
}
