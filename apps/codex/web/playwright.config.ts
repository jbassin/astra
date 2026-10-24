import { defineConfig } from "@playwright/test";

// The codex e2e suite (`just codex-e2e`): real-Chromium checks jsdom can't make (row geometry,
// scroll, wheel, keyboard, reload). `e2e/server.ts` serves the built `dist/` against the
// generated fixture corpus on an ephemeral loopback port; the `wait` regex reads that port
// into CODEX_E2E_PORT for `e2e/fixtures.ts`. A failing test keeps its trace and a screenshot
// under test-results/, and the HTML report goes to playwright-report/ (CI uploads both).
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // The interaction cases time real scroll and focus settling; a single worker keeps CPU
  // contention from turning their fixed budgets into flakes.
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list", { printSteps: true }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    browserName: "chromium",
    launchOptions: { args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node --import tsx e2e/server.ts",
    wait: { stdout: /codex e2e server listening on port (?<codex_e2e_port>\d+)/ },
    // The first run also generates the fixture corpus.
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
