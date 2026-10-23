/**
 * Countdown math (D31-2): "every frame carries `serverNow`; `question`
 * frames carry `endsAt`; clients render the difference" — and per the S2
 * brief, recompute the offset every animation frame, never trust the client
 * clock. `useRemainingMs` anchors on `performance.now()` (monotonic, immune
 * to wall-clock adjustments) at the moment a snapshot arrived, then re-derives
 * "server now" on every `requestAnimationFrame` tick as
 * `serverNow + (performance.now() - receivedAt)` — the client's own clock
 * value (`Date.now()`) never enters the calculation.
 */
import { useEffect, useState } from "react";

export function useRemainingMs(endsAt: number, serverNow: number, receivedAt: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - serverNow));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsedSincePacket = performance.now() - receivedAt;
      const projectedServerNow = serverNow + elapsedSincePacket;
      setRemaining(Math.max(0, endsAt - projectedServerNow));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt, serverNow, receivedAt]);

  return remaining;
}
