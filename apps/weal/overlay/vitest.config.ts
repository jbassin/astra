import { defineConfig } from "vitest/config";

// Standalone vitest config, separate from vite.config so the test runner never loads the
// dev-proxy setup (which reads config.kdl through @astra/site-kit and needs vite's
// `--configLoader runner`). The tests are plain Node: server, hub, schema and ticker logic.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
