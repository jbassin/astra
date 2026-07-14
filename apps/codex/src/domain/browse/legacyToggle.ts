// P3 S3 (D29-35) — the site-wide legacy toggle's live state store. A single
// module-scope value + a `useSyncExternalStore` subscription (React 19's
// built-in external-store hook — no new dependency) so the header control in
// `__root.tsx` and every browse/`/search` route share ONE live boolean
// without prop drilling through the router tree.
//
// SSR-safe by the same pattern as akasha-frontend's `Explorer.tsx` island
// (this file's own header comment there): the server snapshot is always
// `false` (there is no light/dark-style branch to get wrong — every page
// SSRs as if legacy were off, then a client-only effect reconciles the real
// value), so hydration never mismatches.
//
// **Precedence (adversarial M4 — no toggle flap):** the URL's `legacy=1`
// param wins ONLY on the very first document load; every subsequent
// client-side navigation preserves the LIVE toggle (internal links never
// carry a `legacy` param to begin with, so there's nothing to re-seed from).
// Browse/`/search` routes are responsible for reflecting the live value back
// into their OWN url via a search replace (their own route file) — this
// module only owns the value, never touches the router.
//
// **Why the initial seed happens at MODULE-EVAL time, not a `useEffect`:**
// React fires mount effects bottom-up (children before parents) — so a
// browse route's OWN "sync the live toggle into my URL" effect could run
// BEFORE `__root.tsx`'s effect if seeding lived there, and would then read
// the toggle's un-seeded `false` default and strip a freshly-shared
// `?legacy=1` link's param before the real value ever loads. ES module
// evaluation has no such ordering hazard: this module is imported (directly
// or transitively) by every component that touches the toggle, so the
// guarded block at the bottom of this file always runs before any of them
// can possibly render.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "codex:legacy";

let current = false;
let initialized = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function readStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // private-mode/disabled storage -> fail soft, default off
  }
}

function writeStorage(value: boolean): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore — the live toggle still works for this tab, just unpersisted */
  }
}

/** Client-only, called once on the first document load (`__root.tsx`'s mount
 * effect). `urlHasLegacyParam` is whether the INITIAL url carried
 * `legacy=1` — our codec never encodes an explicit "off" (`legacy=0`), so
 * presence is the only signal; when present it wins over the stored
 * preference for this load (M4), without overwriting that stored
 * preference (a shared link shouldn't silently flip someone's saved
 * default). Idempotent — a second call is a no-op, so remounts (e.g.
 * `<ClientOnly>` boundaries elsewhere on the page) can't re-run the
 * URL-wins step after the user has already interacted. */
export function initLegacyToggle(urlHasLegacyParam: boolean): void {
  if (initialized) return;
  initialized = true;
  current = urlHasLegacyParam || readStorage();
  emit();
}

export function getLegacySnapshot(): boolean {
  return current;
}

export function getLegacyServerSnapshot(): boolean {
  return false;
}

export function subscribeLegacy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The header toggle's write path — persists to storage and broadcasts. */
export function setLegacyToggle(value: boolean): void {
  current = value;
  writeStorage(value);
  emit();
}

export function useLegacyToggle(): boolean {
  return useSyncExternalStore(subscribeLegacy, getLegacySnapshot, getLegacyServerSnapshot);
}

/** Test-only reset (module state otherwise persists across a test file's
 * whole run, which would let one test's toggle leak into the next). */
export function _resetLegacyToggleForTests(): void {
  current = false;
  initialized = false;
  listeners.clear();
}

// The eager, order-independent seed itself — see the file header. `window`
// is absent during SSR (the guard is the whole SSR-safety story here; the
// server ALWAYS gets the `false` default via `getLegacyServerSnapshot`).
if (typeof window !== "undefined") {
  const legacyParam = new URLSearchParams(window.location.search).get("legacy");
  initLegacyToggle(legacyParam === "1" || legacyParam === "true");
}
