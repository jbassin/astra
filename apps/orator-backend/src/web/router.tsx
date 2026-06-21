/**
 * The operator UI router (M3): a `@tanstack/react-router` CLIENT SPA — NOT
 * react-start/SSR (orator-backend must keep its hand-rolled Bun.serve REST
 * surface for the Stream Deck controller, and the pinned react-start has no file
 * server routes; see the orator spec M3 + [[tanstack-start-skill]]). Code-based
 * routing keeps a single console page without a generated routeTree. Built by
 * Vite to a static `dist/`, served by orator-backend's `serveStatic`.
 */
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Console } from "./App";
import { RootLayout } from "./RootLayout";

const rootRoute = createRootRoute({ component: RootLayout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Console });
const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
