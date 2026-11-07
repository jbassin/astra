import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build). Add
// `generated: [...]` once the app has a `scripts/build-content.ts` (see the site-kit README).
export default defineSiteConfig({ root: import.meta.dirname });
