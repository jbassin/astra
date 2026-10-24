import { siteRouterOptions } from "@astra/site-kit/router";
import { createRouter, Link } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

function NotFound() {
  return (
    <main className="center">
      <article className="popover-hint">
        <h1>404</h1>
        <p>That page isn&rsquo;t in the ledger.</p>
        <Link to="/">Home</Link>
      </article>
    </main>
  );
}

export function getRouter() {
  return createRouter({ routeTree, ...siteRouterOptions({ notFound: NotFound }) });
}
