// Standalone route-tree regeneration — lifted from strider's
// `scripts/generate-routes.ts`. The Vite TanStack Start plugin regenerates
// `src/routeTree.gen.ts` during dev and build, but a production build strips
// editor-style routes via `routeFileIgnorePattern`, which then breaks
// `tsc --noEmit` (the route file's `createFileRoute("/editor")` can no longer find
// "/editor" in the typed route map). This writes a route tree that ALWAYS includes
// every route (i.e. matches dev). Run it before typecheck.

import { Generator, getConfig } from "@tanstack/router-generator";

export interface RouteTreeOptions {
  /** App root. */
  root: string;
  /** Absolute path to the routes dir (default `<root>/src/routes`). */
  routesDirectory?: string;
  /** Absolute path to the generated tree (default `<root>/src/routeTree.gen.ts`). */
  generatedRouteTree?: string;
}

export async function generateRouteTree(opts: RouteTreeOptions): Promise<void> {
  const { root } = opts;
  const config = getConfig(
    {
      routesDirectory: opts.routesDirectory ?? `${root}/src/routes`,
      generatedRouteTree: opts.generatedRouteTree ?? `${root}/src/routeTree.gen.ts`,
    },
    root,
  );
  const generator = new Generator({ config, root });
  await generator.run();
}
