// The vite config every TanStack Start frontend shares (`@astra/site-kit/vite`).
// Build-time only: the build tools it imports (TanStack Start's vite plugin, plugin-react,
// @tailwindcss/vite) are site-kit devDependencies, so this module must never be imported by
// runtime code. The root export (`@astra/site-kit`, which `server.ts` loads) doesn't re-export it.

import { readFileSync } from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { mergeConfig, type UserConfig } from "vite";

import { loadSiteConfig } from "./config";
import { ssrExternalsPlugin } from "./ssrExternals";
import { contentWatchPlugin, gothicFontsPlugin } from "./vitePlugins";

function camel(kebab: string): string {
  return kebab.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The config.kdl block the app's `package.json` names in `"astra": { "config": "<namespace>" }`
 * (the same field `@astra/observe/register` reads the service name from).
 */
export function appConfigBlock(root: string): { port: number; serviceName: string } {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { astra?: { config?: unknown } };
  const namespace = pkg.astra?.config;
  if (typeof namespace !== "string") {
    throw new Error(`${pkgPath} has no "astra": { "config": "<namespace>" } field`);
  }
  const block = (loadSiteConfig(root) as Record<string, unknown>)[camel(namespace)] as
    | { port?: unknown; serviceName?: unknown }
    | undefined;
  if (typeof block?.port !== "number" || typeof block.serviceName !== "string") {
    throw new Error(`config.kdl block ${JSON.stringify(namespace)} has no port or service-name`);
  }
  return { port: block.port, serviceName: block.serviceName };
}

export interface SiteConfigOptions {
  /** The app dir (`import.meta.dirname` in its `vite.config.ts`). */
  root: string;
  /**
   * The modules `scripts/build-content.ts` writes into `src/generated/`, by basename. A content
   * edit in dev invalidates them. Omit it for an app with no build-time content step (codex
   * reads its corpus at request time; vellum's documents are authored live): the preset then
   * leaves out `contentWatchPlugin`.
   */
  generated?: ReadonlyArray<string>;
  /**
   * Whether the app uses gothic's theme (`@astra/site-kit/theme`). Default true. False leaves
   * out `gothicFontsPlugin` and `@tailwindcss/vite`, for an app that styles itself (codex).
   */
  theme?: boolean;
  /** App-specific vite settings (a dev proxy, say), merged over the preset with `mergeConfig`. */
  vite?: UserConfig;
}

/**
 * The whole `vite.config.ts` of an astra SSR frontend: the dev port from the app's config.kdl
 * block, the `@` → `src/` alias, and the plugins in their required order. Run vite with
 * `--configLoader runner` (see the README).
 *
 * - `contentWatchPlugin` (when `generated` is set) runs `scripts/build-content.ts` at build
 *   start and on content edits in dev, so the content pipeline never reaches the client bundle.
 * - `gothicFontsPlugin` (unless `theme: false`) serves gothic's fonts in dev and copies them to
 *   `dist/client/fonts`.
 * - `@tailwindcss/vite` (unless `theme: false`) compiles gothic's theme.css; without it the
 *   theme ships raw.
 * - `ssrExternalsPlugin` keeps the SSR bundle to the app's own dependencies.
 * - `tanstackStart()` must come before `viteReact()`. No `prerender` block: the apps run as
 *   SSR servers (ADR 0009).
 */
export function defineSiteConfig(opts: SiteConfigOptions): UserConfig {
  const { root } = opts;
  const { port } = appConfigBlock(root);
  const preset: UserConfig = {
    server: { port, host: true },
    resolve: {
      alias: { "@": path.resolve(root, "./src") },
    },
    plugins: [
      ...(opts.generated
        ? [
            contentWatchPlugin({
              root,
              script: path.join(root, "scripts", "build-content.ts"),
              contentDir: path.join(root, "content"),
              generatedDir: path.join(root, "src", "generated"),
              invalidate: opts.generated,
            }),
          ]
        : []),
      ...(opts.theme === false
        ? []
        : [gothicFontsPlugin({ clientOutDir: path.join(root, "dist", "client") }), tailwindcss()]),
      ssrExternalsPlugin({ root }),
      tanstackStart(),
      viteReact(),
    ],
  };
  return opts.vite ? mergeConfig(preset, opts.vite) : preset;
}
