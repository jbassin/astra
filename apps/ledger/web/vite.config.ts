import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build).
// ledger's "content" is the site registry joined to each target's public-origin from
// config.kdl, so build-content re-runs at build start rather than on content edits.
export default defineSiteConfig({
  root: import.meta.dirname,
  generated: ["site.ts", "sites.ts"],
});
