import { useCallback, useEffect, useRef, useState } from "react";

import { LAYER_DWELL_MS, MAX_PLAYBACK_LAYERS, TITHE_DWELL_MS } from "@/domain/lib/timeline";

// Lets the map frame finish its fade-in (and the dynamically-mounted HexMap
// settle) before the layer auto-advance starts ticking.
export const INITIAL_PAUSE_MS = 1400;

// localStorage key recording how many layers the visitor has already watched, so
// the auto catch-up only ever plays the layers added since their last visit.
const SEEN_KEY = "strider:vox-log-seen";

function readSeenCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeSeenCount(count: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, String(count));
  } catch {
    // private mode / storage disabled — playback still works, it just replays.
  }
}

interface Playback {
  layerIndex: number;
  prevLayerIndex: number | null;
  isPlaying: boolean;
  setIndex: (next: number) => void;
  skipToEnd: () => void;
  replay: () => void;
}

// Current-first playback: the map lands on the latest state by default. On the
// client, mount decides whether to play a *bounded, play-once* catch-up of the
// layers added since the visitor's last visit (older ones snap in instantly),
// or — when nothing is new — rest on the current state. `replay()` is the
// opt-in full-history cinematic from layer 0; `skipToEnd()` / any manual step
// cancels an in-flight catch-up.
//
// `seen` (from the ?seen URL param set by the faction back-link) forces the
// current state with no catch-up.
//
// Dwell is constant (LAYER_DWELL_MS), with tithe layers held for their full wave.
export function useTimelinePlayback(
  layerCount: number,
  seen = false,
  titheSteps?: ReadonlySet<number>,
): Playback {
  // SSR-deterministic initial value: the current (end) state. The client mount
  // effect below rewinds to play a catch-up when there are unseen layers.
  const [layerIndex, setLayerIndex] = useState(layerCount);
  const [isPlaying, setIsPlaying] = useState(false);

  // Read the latest tithe-step set inside the auto-advance timer without
  // restarting playback when its identity changes.
  const titheStepsRef = useRef(titheSteps);
  titheStepsRef.current = titheSteps;

  // Records the value layerIndex held before its most recent change. Animations
  // rely on this to detect forward-by-one transitions; multi-step jumps and
  // backward steps intentionally skip animations.
  const prevIndexRef = useRef<number | null>(null);
  const lastIndexRef = useRef<number>(layerIndex);
  if (lastIndexRef.current !== layerIndex) {
    prevIndexRef.current = lastIndexRef.current;
    lastIndexRef.current = layerIndex;
  }
  const prevLayerIndex = prevIndexRef.current;

  // Imperative timer handle so a manual step / skip can cancel the auto-advance
  // mid-flight.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = useCallback(() => {
    cancelledRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Auto-advance from `from` up to layerCount, one constant-dwell step at a time.
  // The jump to `from` is a backward/multi-step transition so it snaps (no
  // animation); each subsequent forward-by-one step animates.
  const runFrom = useCallback(
    (from: number) => {
      clearTimer();
      cancelledRef.current = false;
      setIsPlaying(true);
      setLayerIndex(from);

      const tick = (next: number): void => {
        if (cancelledRef.current) return;
        setLayerIndex(next);
        if (next >= layerCount) {
          setIsPlaying(false);
          writeSeenCount(layerCount);
          return;
        }
        // The layer just applied is `next - 1`; a tithe layer holds for the
        // whole wave so it completes before the next layer applies.
        const dwell = titheStepsRef.current?.has(next - 1) ? TITHE_DWELL_MS : LAYER_DWELL_MS;
        timeoutRef.current = setTimeout(() => tick(next + 1), dwell);
      };

      timeoutRef.current = setTimeout(() => tick(from + 1), INITIAL_PAUSE_MS);
    },
    [clearTimer, layerCount],
  );

  // Mount decision (client-only — localStorage is read here, never in render).
  useEffect(() => {
    if (layerCount === 0) {
      setLayerIndex(0);
      return;
    }
    if (seen) {
      // Returning from a faction page — land on current, mark it seen.
      setLayerIndex(layerCount);
      setIsPlaying(false);
      writeSeenCount(layerCount);
      return;
    }
    const newCount = Math.max(0, layerCount - readSeenCount());
    if (newCount === 0) {
      // Nothing new since last visit — current-first, no animation.
      setLayerIndex(layerCount);
      setIsPlaying(false);
      return;
    }
    // Play a bounded catch-up of just the unseen layers (older prefix snaps in).
    runFrom(Math.max(0, layerCount - Math.min(newCount, MAX_PLAYBACK_LAYERS)));
    return clearTimer;
  }, [layerCount, seen, runFrom, clearTimer]);

  const setIndex = useCallback(
    (next: number) => {
      if (next < 0 || next > layerCount) return;
      clearTimer();
      setIsPlaying(false);
      setLayerIndex(next);
      if (next >= layerCount) writeSeenCount(layerCount);
    },
    [clearTimer, layerCount],
  );

  const skipToEnd = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
    setLayerIndex(layerCount);
    writeSeenCount(layerCount);
  }, [clearTimer, layerCount]);

  // Opt-in full-history cinematic from the very beginning.
  const replay = useCallback(() => runFrom(0), [runFrom]);

  return { layerIndex, prevLayerIndex, isPlaying, setIndex, skipToEnd, replay };
}
