// Build/test-time only: the absolute path of tsx's Node loader, for tooling that spawns
// `node --import <loader> file.ts` (the content-build vite plugin, the vitest content setup,
// the SSR smoke runner). tsx runs workspace TypeScript the way the bundlers resolve it:
// extensionless and directory imports, JSX, tsconfig paths. Resolved from site-kit, so it
// works from any cwd and in the image's build stage, which installs site-kit's dependencies
// but not the repo root's. A shell or package script uses `node --import tsx` instead.
// A function, not a module-scope constant: vitePlugins.ts imports this, the site-kit root
// re-exports vitePlugins, and so every server bundle carries this module; a top-level
// resolve would crash the image, which installs no tsx.

import { createRequire } from "node:module";

export function tsxLoader(): string {
  return createRequire(import.meta.url).resolve("tsx");
}
