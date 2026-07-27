/**
 * One shape-colored answer identity (D31-6) — the single component both the
 * host's labeled option cards (question/reveal) and the player's label-free
 * shape buttons (question) render through, so the shape→color mapping never
 * drifts between the two roles. Always a `<button>` (oxlint's
 * `no-static-element-interactions` — a non-interactive tile is simply a
 * `disabled` button, never a clickable-looking `<div>`).
 */
import { ShapeGlyph, type Shape } from "../shapes";

export interface AnswerTileProps {
  shape: Shape;
  /** Host cards show the option text; the player projection never carries it
   * (spec §4a — no answer-leaking full state to devtools). */
  label?: string;
  /** Reveal-phase per-option answer count (host only). */
  count?: number;
  /** Reveal-phase correctness highlight (host only). */
  correct?: boolean;
  /** True once reveal has run and this option was NOT the correct one — dims it. */
  dim?: boolean;
  /** The player's own optimistic pick, highlighted while waiting on the server. */
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: "phone" | "host";
  accessibleLabel: string;
}

export function AnswerTile({
  shape,
  label,
  count,
  correct,
  dim,
  selected,
  disabled = false,
  onClick,
  size = "phone",
  accessibleLabel,
}: AnswerTileProps) {
  const classes = [
    "answer-tile",
    `answer-tile--${shape}`,
    size === "host" ? "answer-tile--host" : null,
    selected ? "answer-tile--selected" : null,
    correct ? "answer-tile--correct" : null,
    dim ? "answer-tile--dim" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={accessibleLabel}
    >
      <ShapeGlyph shape={shape} />
      {label && <span>{label}</span>}
      {count !== undefined && <span className="answer-tile-count">{count}</span>}
    </button>
  );
}
