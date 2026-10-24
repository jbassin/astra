import { siteRouterOptions } from "@astra/site-kit/router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    ...siteRouterOptions({
      notFound: { heading: "404", message: "That page doesn’t exist.", homeLabel: "Home" },
    }),
  });
}
