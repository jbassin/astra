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
        <p>That entity isn&rsquo;t in the codex.</p>
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
    // D29-22/M9: `@legacy`-suffixed ids (`spell/heal@legacy`) are real, verbatim
    // corpus ids in the `$slug` param. The router's OWN param decode already
    // round-trips `@` fine either way, but `<Link params={...}>` INTERPOLATION
    // percent-encodes any character not on this allowlist — without it, a Link
    // built from `{ slug: "heal@legacy" }` would render `href="/spell/heal%40legacy"`.
    pathParamsAllowedCharacters: ["@"],
  });
}
