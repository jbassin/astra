/**
 * One shape-colored answer identity (D31-6) — the single component both the
 * host's labeled option cards (question/reveal) and the player's label-free
 * shape buttons (question) render through, so the shape→color mapping never
 * drifts between the two roles. Always a `<button>` (oxlint's
 * `no-static-element-interactions` — a non-interactive tile is simply a
 * `disabled` button, never a clickable-looking `<div>`).
 *
 * Layout is a 3-slot grid — glyph · label · trailing badge/count — because the
 * first pass absolutely-positioned the reveal checkmark into the top-right
 * corner, which is exactly where the answer count sits: on every correct tile
 * the ✓ and the count drew on top of each other. Slots can't collide.
 */
import { CheckMark } from "../marks";
import { ShapeGlyph, type Shape } from "../shapes";

export interface AnswerTileProps {
  shape: Shape;
  /** Host cards show the option text; the player projection never carries it
   * (spec §4a — no answer-leaking full state to devtools). */
  label?: string;
  /** Reveal-phase per-option answer count (host only). */
  count?: number;
  /** Reveal-phase share of all answers, 0–1 — drives the bar behind the label
   * so the spread of a question reads at a glance from across the room. */
  share?: number;
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
  share,
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
      {share !== undefined && (
        <span
          className="answer-tile-share"
          style={{ transform: `scaleX(${Math.max(0.015, share)})` }}
        />
      )}
      <span className="answer-tile-glyph">
        <ShapeGlyph shape={shape} />
      </span>
      {label && <span className="answer-tile-label">{label}</span>}
      {correct && (
        <span className="answer-tile-badge">
          <CheckMark />
        </span>
      )}
      {count !== undefined && <span className="answer-tile-count">{count}</span>}
    </button>
  );
}
