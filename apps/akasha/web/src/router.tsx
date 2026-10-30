import { siteRouterOptions } from "@astra/site-kit/router";
import { createRouter } from "@tanstack/react-router";

import { NotFound, RouteError } from "@/domain/components/RouteError";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    // The 404 page sits inside the site shell, with search and a link home.
    ...siteRouterOptions({ notFound: NotFound }),
    // Page data changes only with a deploy, so a page loaded once is never refetched:
    // back/forward and revisits render from the router's cache.
    defaultStaleTime: Infinity,
    // A client navigation that fails (a tab from before a deploy, most often) falls back to
    // a full page load; other failures show the error page in the shell (RouteError.tsx).
    defaultErrorComponent: RouteError,
  });
}
