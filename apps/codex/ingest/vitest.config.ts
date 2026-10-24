import { defineConfig } from "vitest/config";

// The search-index and release tests read the generated fixture corpus; build it once per
// run, before any test file loads.
export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./vitest.globalSetup.ts"],
  },
});
