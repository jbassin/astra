import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// P2 S1 (adversarial M8): codex gains its first .tsx sources this slice — no jsdom
// needed yet (the renderer is tested via `renderToStaticMarkup`, the same
// `@astra/gothic` recipe, not DOM interaction), so this stays the minimal shape:
// the react plugin for JSX transform + a plain "node" test environment. S2/S3 can
// widen to jsdom if a route/island test needs it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
  },
});
