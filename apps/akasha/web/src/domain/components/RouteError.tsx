// The router's error component. A failure on a client navigation (most often a tab from
// before a deploy asking the new server for the old build's data or chunks) becomes one full
// page load of the target; see `staleBuild.ts`. Any other failure shows the same error page
// as site-kit's default.
import { type ErrorComponentProps, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { errorAction } from "@/domain/lib/staleBuild";

// The URL this document was loaded with, read once when the client bundle starts.
const LOADED_URL = typeof window === "undefined" ? null : new URL(window.location.href);

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const targetHref = useRouterState({ select: (s) => s.location.href });
  const action =
    LOADED_URL === null
      ? "show-error"
      : errorAction(
          new URL(targetHref, window.location.origin),
          new URL(window.location.href),
          LOADED_URL,
        );

  useEffect(() => {
    if (action === "reload") window.location.reload();
    else if (action === "load") window.location.assign(targetHref);
  }, [action, targetHref]);

  // The browser is about to replace the page; don't flash the error page first.
  if (action !== "show-error") return null;

  // Retry invalidates the router (re-runs loaders) rather than calling `reset()`, which only
  // resets the React error boundary without refetching. Same markup as site-kit's default.
  return (
    <main role="alert" className="route-boundary">
      <h1>Something went wrong</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <button type="button" onClick={() => router.invalidate()}>
        Retry
      </button>
    </main>
  );
}
