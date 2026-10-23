/**
 * A path-routed SPA with no router lib (spec §3) — reads `location.pathname`
 * directly. `navigate()` wraps `history.pushState`/`replaceState` and fires a
 * synthetic `popstate` (which neither native call does) so `usePathname`'s
 * listener picks up same-tab navigations, not just browser back/forward.
 */
import { useEffect, useState } from "react";

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return pathname;
}

export function navigate(path: string, opts?: { replace?: boolean }): void {
  if (opts?.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** `?code=` prefill (D31-12) — uppercased to match the code alphabet, empty
 * string (not null) when absent so callers can feed it straight into a
 * controlled input's initial value. */
export function codeFromQuery(search: string): string {
  const code = new URLSearchParams(search).get("code");
  return code ? code.toUpperCase() : "";
}
