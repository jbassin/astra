// The marks for one limited thing. A filled pip is one left, a hollow pip is one used; pressing a
// filled pip uses one and pressing a hollow pip gives one back. A tracker with many uses (Lay on
// Hands' 10 Hit Points) is a number with − and + instead. Without `onPlay` the same dots show as
// plain marks and the number has no buttons (the DM page); on paper every pip prints as left.

import {
  currentHp,
  leftOf,
  MAX_PIPS,
  type Tracker,
  withHp,
  withLeft,
  withSpent,
} from "@/domain/play";
import { Icon } from "@/ui/Icon";

import { usePlay } from "./PlayContext";

function plural(n: number, unit: string): string {
  return `${unit}${n === 1 ? "" : "s"}`;
}

/** − [number] + for a count that can be stepped. */
function Stepper({
  label,
  value,
  max,
  onChange,
  className,
}: {
  /** What it counts, for a screen reader ("Hit Points"). */
  label: string;
  value: number;
  max: number;
  /** Absent: read-only, so no buttons. */
  onChange?: (next: number) => void;
  className?: string;
}) {
  return (
    <span className={className ? `counter ${className}` : "counter"}>
      {onChange && (
        <button
          type="button"
          className="counter-btn"
          aria-label={`Lower ${label}`}
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
        >
          <Icon name="ui-minus" />
        </button>
      )}
      <output className="counter-value" aria-label={`${label}: ${value} of ${max}`}>
        <span className="counter-now">{value}</span>
        <span className="counter-max">/ {max}</span>
        <span className="counter-print">{max}</span>
      </output>
      {onChange && (
        <button
          type="button"
          className="counter-btn"
          aria-label={`Raise ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Icon name="ui-plus" />
        </button>
      )}
    </span>
  );
}

/** The current Hit Points as a stepper. */
export function HitPointStepper({ max }: { max: number }) {
  const { play, onPlay } = usePlay();
  return (
    <Stepper
      label="Hit Points"
      className="hp-counter"
      value={currentHp(max, play)}
      max={max}
      onChange={onPlay && ((n) => onPlay(withHp(play, max, n)))}
    />
  );
}

export function Pips({ tracker, className }: { tracker: Tracker; className?: string }) {
  const { play, onPlay } = usePlay();
  const left = leftOf(tracker, play);
  const unit = plural(tracker.max, tracker.unit);
  const classes = className ? `pips ${className}` : "pips";
  if (tracker.max > MAX_PIPS) {
    return (
      <Stepper
        label={tracker.label}
        className={classes}
        value={left}
        max={tracker.max}
        onChange={onPlay && ((n) => onPlay(withLeft(play, tracker, n)))}
      />
    );
  }
  const group = `${tracker.label}: ${left} of ${tracker.max} ${unit} left`;
  const pips = Array.from({ length: tracker.max }, (_, n) => n);
  // A span, not a fieldset or a role: pips sit inside paragraphs. The hidden text says the count.
  if (!onPlay) {
    return (
      <span className={classes}>
        <span className="sr-only">{group}</span>
        {pips.map((n) => (
          <span key={n} className="pip" aria-hidden="true" data-used={n >= left ? "" : undefined} />
        ))}
      </span>
    );
  }
  return (
    <span className={classes}>
      <span className="sr-only">{group}</span>
      {pips.map((n) => {
        const used = n >= left;
        return (
          <button
            key={n}
            type="button"
            className="pip"
            data-used={used ? "" : undefined}
            aria-pressed={used}
            aria-label={`${tracker.label}, ${tracker.unit} ${n + 1} of ${tracker.max}`}
            // A filled pip uses one; a hollow one gives one back.
            onClick={() => onPlay(withSpent(play, tracker, tracker.max - left + (used ? -1 : 1)))}
          />
        );
      })}
    </span>
  );
}
