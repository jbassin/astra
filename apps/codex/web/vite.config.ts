import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build).
//
// - No `generated` (D29-31): codex's content is the corpus release, which routes read from
//   disk at request time (`src/server/corpusFs.ts`), not a build-time content module.
// - `theme: false` (D29-46): codex self-hosts its parchment fonts through @fontsource imports
//   in `__root.tsx` and styles itself with plain CSS, so it needs neither gothic's fonts nor
//   Tailwind.
//
// The release-pinning server entry is `src/server.ts`, which TanStack Start finds by name.
export default defineSiteConfig({ root: import.meta.dirname, theme: false });
