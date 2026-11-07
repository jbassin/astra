// Debounced auto-save: each change restarts a short timer, and when it fires the latest value
// is saved. Saves never overlap; a change made while one is in flight is saved right after it,
// so the server always ends on the newest value.

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

interface Autosave<T> {
  state: SaveState;
  /** The last failure's message, while `state` is `error`. */
  error: string | undefined;
  schedule: (value: T) => void;
}

export function useAutosave<T>(save: (value: T) => Promise<unknown>, delayMs = 700): Autosave<T> {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  // The value waiting to be saved; `undefined` when nothing is waiting.
  const queued = useRef<{ value: T } | undefined>(undefined);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async (): Promise<void> => {
    const next = queued.current;
    if (inFlight.current || !next) return;
    queued.current = undefined;
    inFlight.current = true;
    setState("saving");
    try {
      await saveRef.current(next.value);
      setError(undefined);
      setState(queued.current ? "saving" : "saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    } finally {
      inFlight.current = false;
    }
    // A change that arrived during the save goes out now.
    await flush();
  }, []);

  const schedule = useCallback(
    (value: T) => {
      queued.current = { value };
      setState("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { state, error, schedule };
}
