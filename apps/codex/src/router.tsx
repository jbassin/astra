import {
  createRouter,
  type ErrorComponentProps,
  Link,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

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

/** D29-109e (P11 S5, #20) — pure slug derivation from an attempted pathname,
 * decoupled from `useRouterState()`'s own hook (same "pure fn + thin
 * router-coupled wrapper" split `HeaderTitle.tsx`'s `deriveHeaderTitle`
 * established, D29-112) so it's directly unit-testable with plain strings,
 * no router mount required. Strips leading/trailing slashes and
 * percent-decodes; `""` (the bare root, or a pathname that decodes to
 * nothing at all) means "no slug worth searching for" — the caller omits
 * the search link entirely rather than linking a bare `/search?q=`. A
 * malformed percent-escape falls back to the raw (still-encoded) text
 * rather than throwing — a 404 page must never itself error. */
export function slugFromPathname(pathname: string): string {
  const stripped = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

/** Exported (not just used inline below) so `router.test.tsx` can mount it
 * against a small SYNTHETIC route tree — the real `routeTree` below is
 * server-fn-backed (loaders call `createServerFn` handlers, which throw "No
 * Start context found in AsyncLocalStorage" outside the actual TanStack
 * Start request runtime, `entityPageData.ts`'s own documented gotcha), so a
 * bare-vitest mount of `getRouter()` itself can only exercise a genuinely
 * UNMATCHED path (no route/loader involved at all) — this export lets the
 * test also prove the component in isolation without that constraint. */
export function DefaultNotFoundComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const slug = slugFromPathname(pathname);
  return (
    <main className="center">
      <article className="popover-hint">
        <h1>404</h1>
        <p>That entity isn&rsquo;t in the codex.</p>
        {slug.length > 0 ? (
          <p>
            <Link to="/search" search={{ q: slug }}>
              Search for &ldquo;{slug}&rdquo; &rarr;
            </Link>
          </p>
        ) : null}
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
