import { useCallback, useSyncExternalStore } from "react";

// SSR-safe responsive hook (copied from the strider template). Returns the
// server-snapshot `false` during SSR, then corrects on hydrate — used by CardSpread
// (slice 5) instead of a raw `window.matchMedia` read so the desktop-circle vs
// mobile-stack layout doesn't trip a hydration mismatch.
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;

  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
