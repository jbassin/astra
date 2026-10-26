import { siteRouterOptions } from "@astra/site-kit/router";
import { createRouter } from "@tanstack/react-router";

import { RouteError } from "@/domain/components/RouteError";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    ...siteRouterOptions({
      notFound: {
        heading: "404",
        message: "Either this page is private or doesn’t exist.",
        homeLabel: "Home",
      },
    }),
    // Page data changes only with a deploy, so a page loaded once is never refetched:
    // back/forward and revisits render from the router's cache.
    defaultStaleTime: Infinity,
    // A client navigation that fails (a tab from before a deploy, most often) falls back to
    // a full page load; other failures show site-kit's error page.
    defaultErrorComponent: RouteError,
  });
}
