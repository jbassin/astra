/**
 * The SSE client (spec §3/D31-2): one `EventSource` per mounted connection,
 * every frame parsed through the shared Zod union (`schema.ts` — the single
 * S1/S2 wire contract) before it ever reaches a component, and a manual
 * resubscribe when the browser gives up on the connection (native
 * auto-retry only fires while the source is still CONNECTING; once it flips
 * to CLOSED — which srvx's `.unref()`'d heartbeat/GC don't trigger, but a
 * menhir redeploy or a flaky network hop can — nothing reconnects on its
 * own unless we do).
 */
import { useEffect, useState } from "react";
import type { z } from "zod";

const RESUBSCRIBE_DELAY_MS = 1000;

export interface EventStreamState<S> {
  /** The last frame that parsed clean, or `null` before the first one arrives. */
  snapshot: S | null;
  /** `performance.now()` at the moment `snapshot` was received — the anchor
   * countdown math re-derives "now" from, every animation frame, instead of
   * trusting the client's wall clock (D31-2). */
  receivedAt: number;
}

export function useEventStream<S>(url: string | null, schema: z.ZodType<S>): EventStreamState<S> {
  const [state, setState] = useState<EventStreamState<S>>({ snapshot: null, receivedAt: 0 });

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let source: EventSource | null = null;
    let resubscribeTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (disposed) return;
      const es = new EventSource(url as string);
      source = es;
      es.addEventListener("message", (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data as string);
        } catch {
          return; // malformed frame — never crash the stream over one bad packet
        }
        const result = schema.safeParse(parsed);
        if (!result.success) return; // schema mismatch — ignore, keep the last good snapshot
        setState({ snapshot: result.data, receivedAt: performance.now() });
      });
      es.addEventListener("error", () => {
        if (disposed) return;
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          resubscribeTimer = setTimeout(connect, RESUBSCRIBE_DELAY_MS);
        }
        // else: still CONNECTING — the browser's own auto-retry is in flight.
      });
    }

    connect();
    return () => {
      disposed = true;
      if (resubscribeTimer !== null) clearTimeout(resubscribeTimer);
      source?.close();
    };
  }, [url, schema]);

  return state;
}
