// Which packages a frontend's SSR bundle may leave as bare `import`s. The runtime image
// (deploy/node.Dockerfile) installs only the app's own production dependencies
// (`pnpm install --prod --filter ./apps/<app>...`), so a bare import of anything else fails
// at startup with ERR_MODULE_NOT_FOUND.
//
// Vite's default externalises every bare import it can resolve from the app dir. In a
// checkout (and in the image's build stage) that includes the repo root's devDependencies,
// because Node resolution walks up to /repo/node_modules. 2026-10-24: the root gained a
// `yaml` devDependency (for vitest.config.ts), so codex's bundle externalised the `yaml` that
// @astra/config imports, and the image crash-looped. `ssrExternalsPlugin` makes the rule
// explicit (externalise the app's declared dependencies, bundle everything else), and
// `undeclaredSsrImports` (run by `just ts-build`) checks every built bundle against it.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

import type { Plugin } from "vite";

interface Manifest {
  dependencies?: Record<string, string>;
}

/** The app's production dependencies that are real packages (workspace links are bundled). */
export function runtimeDependencies(root: string): string[] {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Manifest;
  return Object.entries(pkg.dependencies ?? {})
    .filter(([, spec]) => !spec.startsWith("workspace:"))
    .map(([name]) => name)
    .toSorted();
}

/** The app's production dependencies that are workspace links. */
export function workspaceDependencies(root: string): string[] {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Manifest;
  return Object.entries(pkg.dependencies ?? {})
    .filter(([, spec]) => spec.startsWith("workspace:"))
    .map(([name]) => name)
    .toSorted();
}

/** A specifier naming a built JavaScript or JSON file, never a package's TS entry. */
const BUILT_FILE = /\.(?:[cm]?js|json)$/;

/** Matches every bare specifier whose package is not one of `deps`. */
export function notOneOf(deps: ReadonlyArray<string>): RegExp {
  const names = deps.map((d) => d.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return names ? new RegExp(`^(?!(?:${names})(?:/|$))`) : /^/;
}

/**
 * Build-time only: inline every package that is not one of the app's declared production
 * dependencies into the SSR bundle, so the bundle never depends on what happens to be
 * resolvable from the checkout. The declared ones keep vite's default (external, unless a
 * plugin such as TanStack Start's marks them noExternal). Dev keeps vite's default.
 */
export function ssrExternalsPlugin(opts: { root: string }): Plugin {
  return {
    name: "site-kit:ssr-externals",
    apply: "build",
    config: () => ({ ssr: { noExternal: [notOneOf(runtimeDependencies(opts.root))] } }),
  };
}

const BUILTINS = new Set(builtinModules);

/** `react-dom/server` → `react-dom`, `@scope/pkg/sub` → `@scope/pkg`. */
export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

// Static `import … from "x"` / `export … from "x"` / `import "x"` at a line start (how rollup
// emits them), dynamic `import("x")` on any line that isn't a comment (bundled libraries
// keep JSDoc such as `@typedef {import('unified').Processor}`), and the `require("x")` /
// `__require("x")` calls of bundled CommonJS (rolldown's `__require` is a `createRequire`).
const STATIC_IMPORT = /^(?:import|export)\s(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/gm;
const BARE_IMPORT = /^import\s*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE = /(?<![\w$.])(?:__)?require\(\s*["']([^"']+)["']\s*\)/g;
const PACKAGE_SPECIFIER = /^(?:@[\w.-]+\/)?\w[\w.-]*(?:\/\S*)?$/;
const COMMENT_LINE = /^\s*(?:\*|\/\*|\/\/).*$/gm;

/** Every bare (package) specifier a chunk imports. */
export function bareImports(source: string): string[] {
  const found = new Set<string>();
  const code = source.replace(COMMENT_LINE, "");
  for (const re of [STATIC_IMPORT, BARE_IMPORT, DYNAMIC_IMPORT, REQUIRE]) {
    for (const m of code.matchAll(re)) {
      const spec = m[1];
      // A package name, so a `require('%s')` inside a bundled log message is not one.
      if (!spec || !PACKAGE_SPECIFIER.test(spec) || spec.includes(":")) {
        continue;
      }
      found.add(spec);
    }
  }
  return [...found];
}

// Optional packages a bundled library probes inside a try/catch, so a missing one is fine:
// `debug` (under the OTel SDK and express) requires supports-color only to pick colours.
const OPTIONAL_REQUIRES = new Set(["supports-color"]);

/** The bundle dirs the check reads, relative to the app root: vite's SSR build and the
 * tsdown server bundle (./serverBundle.ts). */
export const BUNDLE_DIRS = [path.join("dist", "server"), "dist-server"] as const;

function jsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.[cm]?js$/.test(f))
    .map((f) => path.join(dir, f));
}

/**
 * The bare imports in the app's bundles (`<root>/dist/server` and `<root>/dist-server`) that
 * a production install of the app can't resolve: not a Node builtin and not one of the app's
 * production dependencies. Each entry is `<file relative to root>: <specifier>`.
 */
export function undeclaredSsrImports(root: string): string[] {
  const allowed = new Set(runtimeDependencies(root));
  const workspace = new Set(workspaceDependencies(root));
  const problems: string[] = [];
  for (const file of BUNDLE_DIRS.flatMap((dir) => jsFiles(path.join(root, dir)))) {
    for (const spec of bareImports(readFileSync(file, "utf8"))) {
      const name = packageName(spec);
      if (BUILTINS.has(name) || allowed.has(name) || OPTIONAL_REQUIRES.has(name)) continue;
      // A built file of a workspace dependency, loaded by path at runtime (weal-engine's
      // wasm glue): the image keeps the app's @astra/* links. The package's TS is inlined.
      if (workspace.has(name) && BUILT_FILE.test(spec)) continue;
      problems.push(`${path.relative(root, file)}: ${spec}`);
    }
  }
  return problems.toSorted();
}
