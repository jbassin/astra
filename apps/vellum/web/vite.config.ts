import { loadSiteConfig } from "@astra/site-kit";
import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build). No
// `generated`: vellum's documents are authored live in CodeMirror, so there is no build-time
// content step.
const ROOT = import.meta.dirname;
const renderTarget = `http://localhost:${loadSiteConfig(ROOT).vellumRender.port}`;

export default defineSiteConfig({
  root: ROOT,
  vite: {
    // Dev only: proxy the editor's same-origin PNG export (`POST /render`) and /health to the
    // vellum-render service. In production Caddy routes them, so dev keeps the same
    // same-origin contract without an env var.
    server: {
      proxy: {
        "/render": { target: renderTarget, changeOrigin: true },
        "/health": { target: renderTarget, changeOrigin: true },
      },
    },
  },
});
