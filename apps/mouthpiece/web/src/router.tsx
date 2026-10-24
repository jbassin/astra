import { siteRouterOptions } from "@astra/site-kit/router";
import { createRouter, Link } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

// mouthpiece's 404 is a card (`.popover-hint` in globals.css), not the default layout.
function NotFound() {
  return (
    <main className="center">
      <article className="popover-hint">
        <h1>404</h1>
        <p>This episode is private or doesn&rsquo;t exist.</p>
        <Link to="/">Home</Link>
      </article>
    </main>
  );
}

export function getRouter() {
  return createRouter({ routeTree, ...siteRouterOptions({ notFound: NotFound }) });
}
