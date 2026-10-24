import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build).
export default defineSiteConfig({
  root: import.meta.dirname,
  generated: ["site.ts", "cards.ts", "spreads.ts"],
});
