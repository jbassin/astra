import { defineSiteVitestConfig } from "@astra/site-kit/vitest";

// The default environment stays "node": a jsdom default broke
// `fileURLToPath(new URL(..., import.meta.url))` only under the full concurrent test run. The
// interactive islands' tests opt into a DOM with a `// @vitest-environment jsdom` docblock.
// The global setup builds the fixture corpus; the setup file points every test at it.
export default defineSiteVitestConfig({
  root: import.meta.dirname,
  environment: "node",
  generatedContent: false,
  globalSetup: ["./vitest.globalSetup.ts"],
  setupFiles: ["./vitest.setup.ts"],
});
