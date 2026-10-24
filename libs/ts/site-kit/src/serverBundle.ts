// The production build of a Node service's server entry (`tsdown.config.ts` in every app the
// image runs). tsdown bundles the entry and every workspace package it imports into
// `dist-server/main.mjs`, so production runs plain JavaScript: no TypeScript, no resolve hook.
// The image runs
//
//   node --import ./dist-server/register.mjs dist-server/main.mjs
//
// `register.mjs` is `@astra/observe/register`, built in the same bundle so it shares one copy
// of `@astra/observe` (its shutdown hooks and loggers) with the app code in a common chunk.
// `--import` evaluates it before the entry graph loads, so telemetry and the `node:http` patch
// are in place before any app module runs.
//
// The externals rule is the SSR bundles' rule (./ssrExternals.ts): the app's own non-workspace
// `dependencies` stay external (the image's `pnpm install --prod` puts them in the app's
// node_modules), and everything else is inlined: workspace packages and the third-party
// packages they import. `just ssr-externals-check` checks every built `dist-server/` against it.
//
// Build-time only: the runtime image never imports this file.

import { createRequire } from "node:module";
import path from "node:path";

import { defineConfig, type UserConfig } from "tsdown";

import { notOneOf, runtimeDependencies } from "./ssrExternals";

/** Where every server bundle lands, relative to the app root. */
export const SERVER_BUNDLE_DIR = "dist-server";

export interface ServerBundleOptions {
  /** The app root (`import.meta.dirname` of its `tsdown.config.ts`). */
  root: string;
  /** The server entry, relative to `root` (`server.ts`, `src/index.ts`). */
  entry: string;
}

/** The tsdown config of one app's server bundle. */
export function serverBundleConfig(opts: ServerBundleOptions): UserConfig {
  const { root, entry } = opts;
  const register = createRequire(path.join(root, "package.json")).resolve(
    "@astra/observe/register",
  );
  return {
    cwd: root,
    entry: { main: path.join(root, entry), register },
    outDir: path.join(root, SERVER_BUNDLE_DIR),
    format: "esm",
    platform: "node",
    target: "node24",
    fixedExtension: true,
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
    // The vite build (`dist/server/server.js`, which a frontend's server.ts loads) and the
    // weal-engine glue stay files on disk; they are loaded by path at runtime, not bundled.
    deps: { alwaysBundle: notOneOf(runtimeDependencies(root)), onlyBundle: false },
    // A tsconfig lookup per app would pick up the frontends' `@/*` alias; the server entries
    // use none, and the base config's options are what the bundler needs.
    tsconfig: path.join(root, "tsconfig.json"),
    report: false,
  };
}

/** `export default defineServerBundle({ root: import.meta.dirname, entry: "server.ts" })`. */
export function defineServerBundle(opts: ServerBundleOptions): UserConfig {
  return defineConfig(serverBundleConfig(opts));
}
