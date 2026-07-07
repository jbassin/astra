import { defineConfig } from "tsdown";

/**
 * Bundles the Foundry module into the single self-contained ESM file `module.json`
 * declares (`esmodules: ["dist/main.js"]`, D11) — Foundry's browser fetches + `import()`s
 * this file directly, with no `node_modules` alongside it, so every dependency
 * (including the workspace-linked `@astra/portal-shared` envelope + its own `zod`
 * transitive dep) must be inlined, never left as a bare specifier the browser can't
 * resolve. No decorators here (contrast `orator-controller`), so plain `tsdown` straight
 * off the TS source is enough — no tsc pre-pass needed.
 */
export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist",
  format: "esm",
  // Foundry 13 runs its client in Electron/modern Chromium — no legacy-browser
  // transpile target needed, unlike a public-web-facing bundle.
  platform: "browser",
  target: "es2022",
  dts: false,
  clean: true,
  treeshake: true,
  // tsdown externalizes package.json "dependencies" by default (library-bundler
  // convention) — @astra/portal-shared is listed there because this package needs it
  // at typecheck/test time, but the browser has no node_modules to resolve a bare
  // "@astra/portal-shared" import from, so it must be force-inlined instead.
  deps: { alwaysBundle: ["@astra/portal-shared"] },
});
