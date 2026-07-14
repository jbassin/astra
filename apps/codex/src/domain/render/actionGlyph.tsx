import { ActionGlyph, type ActionCost, normalizeActionCost } from "@astra/gothic";
import type { ReactElement } from "react";

/**
 * D29-24 adversarial B1 — the actionGlyph shim. gothic's `normalizeActionCost`
 * only understands a handful of short aliases ("1"/"one"/"single", "r"/
 * "reaction"/"react", "0"/"f"/"free", ...) — the REAL corpus speaks AoN/Foundry
 * long-form vocabulary ("Single Action", "Two Actions", ...) plus composite
 * forms ("Single Action to Three Actions", "... or ..."). This module sits IN
 * FRONT of gothic's normalizer (spec D29-24) and is the ONLY place that
 * vocabulary is taught.
 *
 * Verified exhaustively against the real emitted corpus (all `actionGlyph.cost`
 * values across all ~46k entities + embedded items, 25 distinct tokens): every
 * token maps cleanly through the rules below EXCEPT two ("T" ×1, "Two Actions
 * to 2 rounds" ×3 — the spec's own named "genuinely unknown" residue), which
 * fall back to plain text (`{ kind: "unknown" }`).
 */

/** AoN/Foundry long forms gothic's own alias table doesn't know (its keys are
 * short letters/digits/"one"/"two"/"three"/"reaction"/"free" — none of these
 * exact phrases). "One Action" (distinct from "Single Action") only appears as
 * the right-hand side of a few composite tokens in the real corpus, never
 * bare — kept here regardless for that case. */
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

/** One side of a token (a bare form OR one half of a composite): codex's own
 * long-form map first, then gothic's short-alias table as the fallback. */
function parseActionSide(token: string): ActionCost | null {
  return LONG_FORM_TO_COST[token] ?? normalizeActionCost(token);
}

const CONNECTIVES: ReadonlyArray<{ token: string; label: "to" | "or" }> = [
  { token: " to ", label: "to" },
  { token: " or ", label: "or" },
];

/** The literal right-hand phrase in the one real "open-ended" composite
 * ("Single Action or more Actions", 8 real uses) — not a parseable single
 * side (there's no "more Actions" cost), so it gets its own branch instead of
 * falling to "unknown" like a genuine miss (D29-24). */
const OPEN_ENDED_SUFFIX = "more Actions";

export type NormalizedActionGlyph =
  | { kind: "single"; cost: ActionCost }
  | { kind: "composite"; left: ActionCost; connective: "to" | "or"; right: ActionCost }
  | { kind: "openEnded"; left: ActionCost; connective: "to" | "or" }
  | { kind: "unknown"; raw: string };

/** Pure, total — never throws. The B1 shim's entry point. */
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

/**
 * Renders a raw `actionGlyph.cost` (or any other action-cost-shaped string,
 * e.g. an `EmbeddedItem.actionCost`/feat `facets.actionCost`) to React.
 * Composites render as glyph–connective–glyph (the PF2e "◆ to ◆◆◆" idiom,
 * spec D29-24); genuinely unknown tokens fall back to visible plain text
 * (golden-visible, per spec — NOT the `data-render-error` chip, which is
 * reserved for the node-kind switch's own totality guarantee).
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
