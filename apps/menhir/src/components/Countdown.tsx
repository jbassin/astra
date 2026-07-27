/**
 * The countdown ring (spec §3 host + player question screens) — an SVG ring
 * whose `stroke-dashoffset` tracks remaining time via `useRemainingMs`
 * (clock.ts), plus the numeric seconds readout. The "total" duration for the
 * ring's percentage is captured from the FIRST remaining-time reading for a
 * given `endsAt` (a fresh question, or a mid-question re-attach — either way
 * the ring always starts full relative to what THIS client first observed).
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

export function Countdown({ endsAt, serverNow, receivedAt }: CountdownProps) {
  const remainingMs = useRemainingMs(endsAt, serverNow, receivedAt);

  const totalRef = useRef<{ endsAt: number; total: number } | null>(null);
  if (!totalRef.current || totalRef.current.endsAt !== endsAt) {
    totalRef.current = { endsAt, total: Math.max(remainingMs, 1) };
  }

  const pct = Math.min(1, Math.max(0, remainingMs / totalRef.current.total));
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = remainingMs > 0 && remainingMs <= URGENT_THRESHOLD_MS;

  return (
    <div
      className={`countdown${urgent ? " countdown--urgent" : ""}`}
      role="timer"
      aria-label={`${seconds} seconds remaining`}
    >
      <svg viewBox="0 0 100 100" className="countdown-ring">
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
