import { createRouter, type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Router-wide error + not-found boundaries (template defaults). Without these a
// thrown loader error renders the framework's bare fallback and unmatched URLs have
// no 404. Retry invalidates the router (re-runs loaders) rather than calling
// `reset()`, which only resets the React error boundary without refetching.
function DefaultErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <main role="alert" className="route-boundary">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button type="button" onClick={() => router.invalidate()}>
        Retry
      </button>
    </main>
  );
}

function DefaultNotFoundComponent() {
  return (
    <main className="center">
      <article className="popover-hint">
        <h1>404</h1>
        <p>No such change-set.</p>
        <Link to="/">Home</Link>
      </article>
    </main>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });
}
