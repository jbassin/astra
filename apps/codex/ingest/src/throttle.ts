export type Delay = (ms: number) => Promise<void>;

export const realDelay: Delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fixed-interval throttle for the AoN fetcher's etiquette ceiling (D29-5: ≤4 req/s →
 * `intervalMs >= 250`). The first call returns immediately; every call after that
 * awaits `delay(intervalMs)`. No wall-clock bookkeeping — "a simple awaited delay
 * between requests" is the whole contract (spec) — so tests inject a spy `delay` and
 * assert call count/args without ever actually sleeping.
 */
export function createThrottle(intervalMs: number, delay: Delay = realDelay): () => Promise<void> {
  let first = true;
  return async function throttle(): Promise<void> {
    if (first) {
      first = false;
      return;
    }
    await delay(intervalMs);
  };
}
