import type { ReactElement } from "react";

/**
 * D29-46 — moved verbatim from the gothic lib's `render/glyphs/actions.tsx` (the
 * spec's own instruction: "moved, not rewritten"). Theme-agnostic (`fill:
 * currentColor`), so nothing here needed to change for the parchment system —
 * only its import path moved, to `@/ui` (`domain/render/actionGlyph.tsx`'s
 * AoN/Foundry vocabulary shim re-points its import here, unchanged
 * otherwise).
 *
 * Stakeholder directive ("use the icons in pathfinder-icons.ttf for the
 * action icons") — this file now renders the REAL Paizo "Pathfinder-Icons"
 * compatibility font (`public/pathfinder-icons.ttf`, self-served via the
 * `@font-face` in `globals.css`) instead of the R5 traced-SVG outlines it
 * shipped with before (see `./ACTIONS-GLYPH-SOURCE.md` for the full
 * provenance/switch record). Each `ActionCost` maps to ONE Private-Use-Area
 * character in that font — its own `[one-action]`/`[two-actions]`/
 * `[three-actions]`/`[reaction]`/`[free-action]` GSUB ligatures resolve to
 * these SAME 6 codepoints (`fontTools` GSUB dump, ACTIONS-GLYPH-SOURCE.md),
 * used directly here rather than depending on `liga`-substitution support
 * — a plain literal character is portable everywhere, including
 * `renderToStaticMarkup` (no DOM, no font shaping engine available). Plain
 * text server/client-identical — no hydration hazard. The public contract
 * (prop signature, `role="img"`/`aria-label`/`title` a11y equivalents) is
 * unchanged from the SVG era; only the render target (`<span>` + a
 * character instead of an `<svg>` + `<use>`) is new — no downstream call
 * site (`statblock.tsx`, `facetHeader.tsx`, `nodes.tsx`, `columnDefs.tsx`,
 * `text.ts`) changes, since every one of them consumes `ActionGlyph`/
 * `normalizeActionCost` only, never the SVG internals.
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
 * The font's own Private-Use-Area codepoints (`fontTools` cmap dump,
 * `./ACTIONS-GLYPH-SOURCE.md`) — one PRE-COMPOSED glyph per cost, including
 * the two/three-action shapes (unlike the old SVG's single reused pip
 * chevron repeated N times at a fixed spacing, this font already ships
 * "two-actions"/"three-actions" as their own wider multi-chevron glyphs, so
 * no manual N-pip composition/spacing math is needed here at all).
 */
const GLYPH_CHARS: Record<ActionCost, string> = {
  "1": "\uE902", // [one-action]
  "2": "\uE901", // [two-actions]
  "3": "\uE900", // [three-actions]
  reaction: "\uE904", // [reaction]
  free: "\uE903", // [free-action]
};

/**
 * The action-icon-font glyph, rendered as a plain character (`GLYPH_CHARS`)
 * inside a `.codex-action-glyph` `<span>` (`globals.css` — the self-hosted
 * `@font-face` + that class's own `font-family`/sizing rule). `role`/
 * `aria-label` come from a plain object spread (not literal JSX attributes)
 * — the same `EditionIcon.tsx` convention, which sidesteps oxlint's
 * `jsx-a11y/prefer-tag-over-role` false positive (the rule can't see past a
 * literal `role="img"` string to know this is an icon-font glyph, not a
 * raster-`<img>` candidate). `title` is the plain-DOM equivalent of the old
 * SVG `<title>` child — a native hover tooltip, same accessible name.
 */
export function ActionGlyph({ cost }: { cost: ActionCost }): ReactElement {
  const label = LABELS[cost];
  const common = { role: "img" as const, "aria-label": label, title: label };
  return (
    <span {...common} className="codex-action-glyph">
      {GLYPH_CHARS[cost]}
    </span>
  );
}
