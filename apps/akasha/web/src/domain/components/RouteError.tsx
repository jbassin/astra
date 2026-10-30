// The router's error and not-found pages, inside the site shell. A failure on a client
// navigation (most often a tab from before a deploy asking the new server for the old build's
// data or chunks) becomes one full page load of the target; see `staleBuild.ts`. Any other
// failure shows the error page.
import { type ErrorComponentProps, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import { SearchTrigger } from "@/domain/components/islands/Search";
import { ListingHead } from "@/domain/components/ListingHead";
import { PageLayout } from "@/domain/components/PageLayout";
import { errorAction } from "@/domain/lib/staleBuild";

// The URL this document was loaded with, read once when the client bundle starts.
const LOADED_URL = typeof window === "undefined" ? null : new URL(window.location.href);

/**
 * The shell when the root loader has run (the header and rails read its section counts);
 * the bare message when the root itself failed.
 */
function Shell({ children }: { children: ReactNode }) {
  const rootLoaded = useRouterState({ select: (s) => s.matches[0]?.loaderData !== undefined });
  if (!rootLoaded) return <main className="ak-error ak-error-bare">{children}</main>;
  return (
    <PageLayout graph={false}>
      <div className="ak-error">{children}</div>
    </PageLayout>
  );
}

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

  const message = error instanceof Error ? error.message : String(error);
  // Try again invalidates the router (re-runs loaders) rather than calling `reset()`, which
  // only resets the React error boundary without refetching.
  return (
    <Shell>
      <div role="alert">
        <ListingHead title="This page didn’t load">
          <p className="ak-list-lede">
            Something went wrong on our side. Try again, or start from the home page.
          </p>
          {message && <p className="ak-error-detail">The error was: {message}</p>}
        </ListingHead>
      </div>
      <div className="ak-actions">
        <button
          type="button"
          className="ak-button ak-button-primary"
          onClick={() => router.invalidate()}
        >
          Try again
        </button>
        <a className="ak-button ak-button-quiet" href="/">
          Go to the home page
        </a>
      </div>
    </Shell>
  );
}

/** The router's 404 page (`router.tsx`). */
export function NotFound() {
  return (
    <Shell>
      <ListingHead title="This page doesn’t exist">
        <p className="ak-list-lede">
          The link may be old or mistyped. Search for what you were looking for, or start from the
          home page.
        </p>
      </ListingHead>
      <div className="ak-actions">
        <SearchTrigger />
        <a className="ak-button ak-button-quiet" href="/">
          Go to the home page
        </a>
      </div>
    </Shell>
  );
}
