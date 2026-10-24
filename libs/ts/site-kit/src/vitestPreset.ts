// The vitest config every TanStack Start frontend shares (`@astra/site-kit/vitest`).
//
// vitest loads `vitest.config.ts` with its default loader, under which Node runs this file as
// raw TS: it may import only packages and Node builtins, never a relative or workspace module
// (their extensionless imports fail outside the resolve hook). The global setup it names is
// loaded later through vite, so that file can import freely.

import path from "node:path";

import viteReact from "@vitejs/plugin-react";
import type { ViteUserConfig } from "vitest/config";

/**
 * The `vitest.config.ts` of an astra SSR frontend: jsdom, globals, the `@` alias and
 * plugin-react, kept apart from `vite.config.ts` so TanStack Start's plugin never loads under
 * the test runner. A global setup runs `scripts/build-content.ts` when `src/generated/` holds no
 * module yet, so tests that import `@/generated/*` work in a fresh checkout.
 */
export function defineSiteVitestConfig(opts: { root: string }): ViteUserConfig {
  return {
    plugins: [viteReact()],
    resolve: {
      alias: { "@": path.resolve(opts.root, "./src") },
    },
    test: {
      environment: "jsdom",
      globals: true,
      globalSetup: [path.join(import.meta.dirname, "generatedContentSetup.ts")],
      exclude: ["**/node_modules/**", "**/e2e/**"],
    },
  };
}
