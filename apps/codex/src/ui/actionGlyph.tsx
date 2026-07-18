import type { ReactElement } from "react";

import { GLYPH_IDS } from "./GlyphDefs";

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
 *
 * P8-follow-up dedupe (`GlyphDefs.tsx`) — every instance below now emits
 * `<use href="#codex-glyph-...">` against the ONE shared `<symbol>` set
 * mounted once in `src/routes/__root.tsx`, instead of re-emitting the same
 * path `d=` string per instance (measured: 2,936 uses of these 3 shapes on
 * a single `/feat` SSR). The public contract — prop signatures, `role`/
 * `aria-label`/`<title>`, sizing, `fill: currentColor` — is unchanged; only
 * the internal `<path>` became a `<use>` against the shared defs.
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
 * font) lives as `<symbol id={GLYPH_IDS.pip}>` in `GlyphDefs.tsx` (exact
 * traced-path provenance: `./ACTIONS-GLYPH-SOURCE.md`). Natural bounding
 * box x:0–7.5, y:3–13 (a 16-tall viewBox) — i.e. the SAME box the old
 * placeholder triangle's FIRST pip occupied shifted left by 1 (the old
 * triangle was `M${x} 3 L${x+7} 8 L${x} 13`, so its x:1–8 first-pip box;
 * this path is that box translated to start at 0). `Pip` below re-applies
 * that `-1` via the `<use>` element's own `x` attribute (SVG2: `x`/`y` on a
 * `<use>` translate the referenced content exactly like the old
 * `transform="translate(dx,0)"` did) so the existing `count * 9 + 1` width /
 * `i * 9 + 1` offset composition math needed no change — the multi-pip
 * layout is untouched, only the shape moved into the shared defs.
 */
const PIP_WIDTH = 7.5;
const PIP_HEIGHT = 16;

/** A single filled "action pip" chevron, offset `x` units along the shared strip. */
function Pip({ x }: { x: number }): ReactElement {
  const dx = x - 1;
  return <use href={`#${GLYPH_IDS.pip}`} x={dx} width={PIP_WIDTH} height={PIP_HEIGHT} />;
}

/**
 * Inline SVG action glyph (NOT an icon font — icon fonts blank out in
 * rasterized PNG export). `fill: currentColor` so theme CSS controls color.
 * Each instance is now a thin `<use>` wrapper against the shared `<symbol>`
 * defs (`GlyphDefs.tsx`, mounted once in `src/routes/__root.tsx`) instead of
 * re-emitting the traced path data per instance.
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
        <use href={`#${GLYPH_IDS.reaction}`} width={16} height={16} />
      </svg>
    );
  }
  if (cost === "free") {
    return (
      <svg {...common} viewBox="0 0 16 16" width="1em">
        <title>{label}</title>
        <use href={`#${GLYPH_IDS.free}`} width={16} height={16} />
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
