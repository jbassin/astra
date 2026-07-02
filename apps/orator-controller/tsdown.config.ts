import { defineConfig } from "tsdown";

/**
 * Bundles the plugin into the single self-contained file the Stream Deck
 * runtime loads directly (`CodePath` in manifest.json) — no `node_modules`
 * ships alongside it, so every non-builtin dependency must be inlined.
 *
 * Ported from the former `rollup.config.mjs` (rollup → tsdown, D5): same
 * entry/output path, same ESM+minified-in-production contract, same
 * `package.json` sidecar so Node treats `bin/plugin.js` as a module despite
 * living outside this workspace member's own `"type": "module"` scope.
 *
 * The entry is `.tsbuild/plugin.js`, NOT `src/plugin.ts`, because rolldown's
 * TS transform (unlike the old `@rollup/plugin-typescript`, which shelled to
 * the real `tsc`) does not lower TC39 standard class decorators — it passes
 * `@action(...)` (used by `src/actions/slot.ts`, the Elgato SDK's action
 * decorator) through untouched, and Node has no native decorator support
 * (verified: `node --check` rejects it, even undecorated-through-minify).
 * `bundle`/`package` (package.json) run `tsc -p tsconfig.json --outDir
 * .tsbuild` first — the same tsconfig, so the SAME decorator lowering
 * (`__esDecorate`/`Symbol.metadata`, ES2022-target) the old rollup build
 * produced — then point tsdown at the already-decorator-free plain JS.
 */
const sdPlugin = "com.astra.orator.sdPlugin";

export default defineConfig((config) => {
  const isWatching = !!config.watch;

  return {
    entry: ["./.tsbuild/plugin.js"],
    outDir: `${sdPlugin}/bin`,
    format: "esm",
    platform: "node",
    // The Stream Deck app bundles its own embedded Node.js runtime — pinned
    // in manifest.json's `Nodejs.Version` (20) and mirrored by tsconfig.json's
    // `@tsconfig/node20` base. This is NOT the repo-wide Node 24 dev target.
    target: "node20",
    minify: !isWatching,
    sourcemap: isWatching,
    clean: false,
    treeshake: true,
    // Force a plain `.js` extension (tsdown defaults ESM+node to a fixed
    // `.mjs`) to keep the manifest's `CodePath: bin/plugin.js` unchanged.
    outExtensions: () => ({ js: ".js" }),
    // tsdown externalizes package.json "dependencies" by default (library
    // bundler convention). The Stream Deck runtime never runs `npm install`
    // next to the bundle, so the one production dep must be inlined too.
    deps: { alwaysBundle: ["@elgato/streamdeck"] },
    plugins: [
      {
        name: "watch-manifest",
        buildStart() {
          this.addWatchFile(`${sdPlugin}/manifest.json`);
        },
      },
      {
        name: "emit-module-package-file",
        generateBundle() {
          this.emitFile({
            fileName: "package.json",
            source: `{ "type": "module" }`,
            type: "asset",
          });
        },
      },
    ],
  };
});
