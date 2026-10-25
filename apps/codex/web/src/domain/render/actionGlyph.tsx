import type { ReactElement } from "react";

/**
 * Action-cost glyphs: the one module that knows the corpus's action-cost vocabulary and how
 * each cost renders.
 *
 * The corpus speaks two vocabularies. Index facets (`castTime`, `actionCost`) and embedded
 * items use short tokens ("1"/"2"/"3"/"reaction"/"free", plus "r"/"f" in either case); node
 * bodies use AoN/Foundry long forms ("Single Action", "Two Actions", ...), the one-letter
 * Foundry font token "A"/"a", and composites ("Single Action to Three Actions", "... or ...").
 * `normalizeActionCost` handles the short tokens; `normalizeCodexActionGlyph` adds the long
 * forms and composites on top. Verified against the real corpus: every token maps except
 * "T", "d" and "Two Actions to 2 rounds", which fall back to plain text.
 */

/** PF2e action-economy costs. Purely visual — no rules meaning attached. */
export type ActionCost = "1" | "2" | "3" | "reaction" | "free";

const SHORT_FORM_TO_COST: Readonly<Record<string, ActionCost>> = {
  "1": "1",
  "2": "2",
  "3": "3",
  r: "reaction",
  reaction: "reaction",
  f: "free",
  free: "free",
};

/** A short action-cost token (case-insensitive, trimmed) to a cost, or null. */
export function normalizeActionCost(raw: string): ActionCost | null {
  return SHORT_FORM_TO_COST[raw.trim().toLowerCase()] ?? null;
}

/** AoN/Foundry long forms. "One Action" appears only as the right-hand side of a composite. */
const LONG_FORM_TO_COST: Readonly<Record<string, ActionCost>> = {
  "Single Action": "1",
  "Two Actions": "2",
  "Three Actions": "3",
  "One Action": "1",
  Reaction: "reaction",
  "Free Action": "free",
  A: "1",
  a: "1",
};

/** One side of a token (a bare form or one half of a composite). */
function parseActionSide(token: string): ActionCost | null {
  return LONG_FORM_TO_COST[token] ?? normalizeActionCost(token);
}

const CONNECTIVES: ReadonlyArray<{ token: string; label: "to" | "or" }> = [
  { token: " to ", label: "to" },
  { token: " or ", label: "or" },
];

/** The right-hand phrase of the one open-ended composite ("Single Action or more Actions"). */
const OPEN_ENDED_SUFFIX = "more Actions";

type NormalizedActionGlyph =
  | { kind: "single"; cost: ActionCost }
  | { kind: "composite"; left: ActionCost; connective: "to" | "or"; right: ActionCost }
  | { kind: "openEnded"; left: ActionCost; connective: "to" | "or" }
  | { kind: "unknown"; raw: string };

/** Pure, total — never throws. */
export function normalizeCodexActionGlyph(raw: string): NormalizedActionGlyph {
  const trimmed = raw.trim();

  const single = parseActionSide(trimmed);
  if (single !== null) return { kind: "single", cost: single };

  for (const { token, label } of CONNECTIVES) {
    const idx = trimmed.indexOf(token);
    if (idx === -1) continue;
    const leftRaw = trimmed.slice(0, idx);
    const rightRaw = trimmed.slice(idx + token.length);
    const left = parseActionSide(leftRaw);
    if (left === null) continue; // try the other connective before giving up
    if (rightRaw === OPEN_ENDED_SUFFIX) return { kind: "openEnded", left, connective: label };
    const right = parseActionSide(rightRaw);
    if (right === null) continue;
    return { kind: "composite", left, connective: label, right };
  }

  return { kind: "unknown", raw };
}

const LABELS: Record<ActionCost, string> = {
  "1": "one action",
  "2": "two actions",
  "3": "three actions",
  reaction: "reaction",
  free: "free action",
};

/**
 * The Private-Use-Area codepoints of `public/pathfinder-icons.ttf`, one pre-composed glyph per
 * cost (`src/ui/ACTIONS-GLYPH-SOURCE.md`). A literal character rather than `liga` substitution,
 * so `renderToStaticMarkup` and plain-text extraction need no font-shaping engine.
 */
const GLYPH_CHARS: Record<ActionCost, string> = {
  "1": "", // [one-action]
  "2": "", // [two-actions]
  "3": "", // [three-actions]
  reaction: "", // [reaction]
  free: "", // [free-action]
};

/**
 * One action-font glyph inside a `.codex-action-glyph` span (`globals.css` holds the
 * `@font-face`). `role`/`aria-label` come from an object spread, which sidesteps oxlint's
 * `jsx-a11y/prefer-tag-over-role` false positive on a literal `role="img"`; `title` gives the
 * hover tooltip.
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

/**
 * Renders a raw action-cost string (`actionGlyph.cost`, `EmbeddedItem.actionCost`, a feat's
 * `facets.actionCost`). Composites render as glyph, connective, glyph (the PF2e "◆ to ◆◆◆"
 * idiom); unknown tokens fall back to visible plain text, not the `data-render-error` chip.
 */
export function CodexActionGlyph({ raw }: { raw: string }): ReactElement {
  const normalized = normalizeCodexActionGlyph(raw);
  switch (normalized.kind) {
    case "single":
      return <ActionGlyph cost={normalized.cost} />;
    case "composite":
      return (
        <span className="codex-action-glyph-composite">
          <ActionGlyph cost={normalized.left} /> {normalized.connective}{" "}
          <ActionGlyph cost={normalized.right} />
        </span>
      );
    case "openEnded":
      return (
        <span className="codex-action-glyph-composite">
          <ActionGlyph cost={normalized.left} /> {normalized.connective} more
        </span>
      );
    case "unknown":
      return <span className="codex-action-glyph-unknown">{normalized.raw}</span>;
  }
}
