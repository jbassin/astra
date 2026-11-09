import { defineConfig } from "tsdown";

/**
 * Bundles the Foundry module into the one ESM file `module.json` declares
 * (`esmodules: ["dist/main.js"]`). Foundry's browser imports that file with no `node_modules`
 * beside it; this package has no runtime dependencies, so there is nothing to inline.
 */
export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist",
  format: "esm",
  platform: "browser",
  target: "es2022",
  dts: false,
  clean: true,
  treeshake: true,
});
