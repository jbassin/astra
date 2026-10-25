import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * gothic's component dev/preview env. The per-node vellum gallery is the visual
 * check that gothic renders the vellum AST. Fonts are served at
 * `/fonts/` (the absolute-URL gotcha); Tailwind v4 is wired via its Vite plugin.
 * No browser runs in CI — this is the local visual surface; the machine-checked
 * gate is the `react-dom/server` render smoke in `vitest`.
 */
const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  staticDirs: [{ from: "../src/fonts", to: "/fonts" }],
  addons: [],
  viteFinal: (cfg) => {
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
    return cfg;
  },
};

export default config;
