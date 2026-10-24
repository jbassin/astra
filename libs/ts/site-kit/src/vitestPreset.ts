// The vitest config every TanStack Start frontend shares (`@astra/site-kit/vitest`).
//
// vitest loads `vitest.config.ts` with its default loader, under which Node runs this file as
// raw TS: it may import only packages and Node builtins, never a relative or workspace module
// (their extensionless imports fail outside the resolve hook). The global setup it names is
// loaded later through vite, so that file can import freely.

import path from "node:path";

import viteReact from "@vitejs/plugin-react";
import type { ViteUserConfig } from "vitest/config";

export interface SiteVitestOptions {
  /** The app dir (`import.meta.dirname` in its `vitest.config.ts`). */
  root: string;
  /**
   * The default test environment. Default `"jsdom"`. codex and menhir use `"node"` and opt
   * single files into a DOM with a `// @vitest-environment jsdom` docblock.
   */
  environment?: "jsdom" | "node";
  /**
   * Whether the app has a `scripts/build-content.ts` to run before tests. Default true. False
   * drops the generated-content global setup (codex, menhir and vellum have no such step).
   */
  generatedContent?: boolean;
  /** Extra global setup files, run after the generated-content one. */
  globalSetup?: ReadonlyArray<string>;
  /** Per-file setup files (vitest `setupFiles`). */
  setupFiles?: ReadonlyArray<string>;
}

/**
 * The `vitest.config.ts` of an astra SSR frontend: jsdom, globals, the `@` alias and
 * plugin-react, kept apart from `vite.config.ts` so TanStack Start's plugin never loads under
 * the test runner. A global setup runs `scripts/build-content.ts` when `src/generated/` holds no
 * module yet, so tests that import `@/generated/*` work in a fresh checkout.
 */
export function defineSiteVitestConfig(opts: SiteVitestOptions): ViteUserConfig {
  const globalSetup = [
    ...(opts.generatedContent === false
      ? []
      : [path.join(import.meta.dirname, "generatedContentSetup.ts")]),
    ...(opts.globalSetup ?? []),
  ];
  return {
    plugins: [viteReact()],
    resolve: {
      alias: { "@": path.resolve(opts.root, "./src") },
    },
    test: {
      environment: opts.environment ?? "jsdom",
      globals: true,
      ...(globalSetup.length > 0 && { globalSetup }),
      ...(opts.setupFiles && { setupFiles: [...opts.setupFiles] }),
      exclude: ["**/node_modules/**", "**/e2e/**"],
    },
  };
}
