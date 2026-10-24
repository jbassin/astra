// The router options every SSR frontend's `src/router.tsx` uses (`@astra/site-kit/router`):
// intent preloading, scroll restoration, and router-wide error and not-found boundaries.
// Without the boundaries a thrown loader error renders the framework's bare fallback and an
// unmatched URL has no 404.

import {
  type ErrorComponentProps,
  Link,
  type NotFoundRouteProps,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

/** A 404 component of the app's own. */
export type NotFoundComponent = (props: NotFoundRouteProps) => ReactNode;

// Retry invalidates the router (re-runs loaders) rather than calling `reset()`, which only
// resets the React error boundary without refetching.
function SiteErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter();
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

/** The text of the default 404 page: a heading, one sentence, and a link home. */
export interface NotFoundText {
  heading: string;
  message: string;
  homeLabel: string;
}

function notFoundComponent(text: NotFoundText): NotFoundComponent {
  return function SiteNotFoundComponent() {
    return (
      <main className="route-boundary">
        <h1>{text.heading}</h1>
        <p>{text.message}</p>
        <Link to="/">{text.homeLabel}</Link>
      </main>
    );
  };
}

/**
 * The router options every frontend shares, spread into the app's own `createRouter` call, so
 * the router's type is still inferred from the app's route tree:
 * `createRouter({ routeTree, ...siteRouterOptions({ notFound }) })`.
 */
export function siteRouterOptions(opts: {
  /** The 404 page: its text in the default layout, or a component of the app's own. */
  notFound: NotFoundText | NotFoundComponent;
}) {
  return {
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: SiteErrorComponent,
    defaultNotFoundComponent:
      typeof opts.notFound === "function" ? opts.notFound : notFoundComponent(opts.notFound),
  } as const;
}
