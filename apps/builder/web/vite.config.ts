import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build).
// `generated` names what scripts/build-content.ts writes (see the README's content pipeline).
// `theme: false`: builder has its own look and self-hosts its fonts (src/routes/__root.tsx),
// so it skips gothic's theme, fonts and Tailwind.
export default defineSiteConfig({
  root: import.meta.dirname,
  generated: ["content.ts", "icons.ts"],
  theme: false,
});
