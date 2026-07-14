import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config: separate from vite.config so the TanStack Start server
// plugin doesn't load under the test runner. ESM — `import.meta.dirname`, not
// `__dirname` (the workspace is `"type": "module"`).
//
// P2 S2: gains the `@` alias for the new routes/server/observe layer (S1's render
// layer stayed on relative imports and still does — untouched).
//
// P3 S3: stays "node" as the DEFAULT (reverted an attempted app-wide widen to
// "jsdom" — the akasha-frontend/strider precedent — after it broke
// `src/ingest/sluggify.test.ts`'s `fileURLToPath(new URL(...,
// import.meta.url))` ONLY under `vp run -r test`'s full concurrent
// 26-package run, never in isolation: reproducible with the global default
// on jsdom, gone the instant it's reverted. Likely a real jsdom/vite-node
// `import.meta.url` interaction under heavy parallel load, not a fixable
// application bug — not worth chasing given the surgical alternative below).
// `FacetPanel.tsx`/`BrowseListing.tsx`/`legacyToggle.ts` ARE real interactive
// islands that need a DOM to test-render against via `@testing-library/react`
// — those 2 test files carry their own `// @vitest-environment jsdom`
// docblock instead (same per-file-override mechanism `ssrSmoke.test.ts` uses
// in the opposite direction), so only the files that actually need a DOM pay
// for one; everything else (incl. `sluggify.test.ts`) stays on plain "node".
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
