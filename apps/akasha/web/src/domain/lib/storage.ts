/**
 * localStorage access for the islands. Storage can throw (blocked site data, some private
 * windows, a full quota); every caller then carries on without it, so the one catch lives
 * here. Call only in effects and event handlers (README trap: storage in render).
 */
export function withStorage<T>(access: (storage: Storage) => T, fallback: T): T {
  try {
    return access(window.localStorage);
  } catch {
    return fallback;
  }
}
