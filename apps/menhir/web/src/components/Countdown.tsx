/**
 * The countdown (spec §3 host + player question screens).
 *
 * Two presentations off ONE piece of math (`useCountdownState`): a ring with a
 * numeric readout, and a full-width draining bar. The bar exists because the
 * ring alone doesn't create urgency on a projected screen — a 6 rem circle is
 * a detail, a 1440 px line collapsing toward zero is peripheral vision. The
 * host shows both; the phone shows the bar plus the numeral, which keeps the
 * whole viewport for thumb-sized answer tiles.
 *
 * The "total" duration for the percentage is captured from the FIRST
 * remaining-time reading for a given `endsAt` (a fresh question, or a
 * mid-question re-attach — either way the ring always starts full relative to
 * what THIS client first observed).
 */
import { useRef } from "react";

import { useRemainingMs } from "../clock";

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const URGENT_THRESHOLD_MS = 5000;

export interface CountdownProps {
  endsAt: number;
  serverNow: number;
  receivedAt: number;
}

function useCountdownState({ endsAt, serverNow, receivedAt }: CountdownProps) {
  const remainingMs = useRemainingMs(endsAt, serverNow, receivedAt);

  const totalRef = useRef<{ endsAt: number; total: number } | null>(null);
  if (!totalRef.current || totalRef.current.endsAt !== endsAt) {
    totalRef.current = { endsAt, total: Math.max(remainingMs, 1) };
  }

  return {
    pct: Math.min(1, Math.max(0, remainingMs / totalRef.current.total)),
    seconds: Math.ceil(remainingMs / 1000),
    urgent: remainingMs > 0 && remainingMs <= URGENT_THRESHOLD_MS,
  };
}

export function Countdown(props: CountdownProps) {
  const { pct, seconds, urgent } = useCountdownState(props);

  return (
    <div
      className={`countdown${urgent ? " countdown--urgent" : ""}`}
      role="timer"
      aria-label={`${seconds} seconds remaining`}
    >
      <svg viewBox="0 0 100 100" className="countdown-ring" aria-hidden="true">
        <circle className="countdown-ring-bg" cx="50" cy="50" r={RADIUS} />
        <circle
          className="countdown-ring-fg"
          cx="50"
          cy="50"
          r={RADIUS}
          style={{
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: CIRCUMFERENCE * (1 - pct),
          }}
        />
      </svg>
      <span className="countdown-number">{seconds}</span>
    </div>
  );
}

export interface TimeBarProps extends CountdownProps {
  /** Adds the seconds readout beside the line — the phone's only clock, since
   * it doesn't render the ring. */
  withNumber?: boolean;
}

/** The draining line: peripheral-vision urgency for a projected screen. */
export function TimeBar({ withNumber = false, ...props }: TimeBarProps) {
  const { pct, seconds, urgent } = useCountdownState(props);
  const labelProps = withNumber
    ? { role: "timer", "aria-label": `${seconds} seconds remaining` }
    : { "aria-hidden": true };

  return (
    <div className={`time-bar${urgent ? " time-bar--urgent" : ""}`} {...labelProps}>
      <div className="time-bar-track">
        <div className="time-bar-fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
      {withNumber && <span className="time-bar-number">{seconds}</span>}
    </div>
  );
}
