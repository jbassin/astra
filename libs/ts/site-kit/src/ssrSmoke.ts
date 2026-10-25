// The SSR smoke test every frontend runs (`@astra/site-kit/ssrSmoke`): build the app when its
// `dist/server/server.js` is missing or older than its sources, then render routes through the
// built bundle in a real Node process and check each page's status and text. Test-only: it
// imports vitest.
//
// The build is an async child process: a long synchronous one blocks the vitest worker until it
// misses its heartbeat ("Timeout calling onTaskUpdate"). The routes render in a subprocess
// (`ssrSmokeRunner.ts`) so vitest's module runner never re-bundles the built server.

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { findRepoRoot } from "@astra/config";
import { beforeAll, describe, expect, it } from "vitest";

import type { SmokeResult } from "./ssrSmokeRunner";
import { tsxLoader } from "./tsxLoader";

const execFileAsync = promisify(execFile);
const RUNNER = path.join(import.meta.dirname, "ssrSmokeRunner.ts");

/** Newest mtime of the non-test files under `p` (0 when `p` is absent). */
function newestSourceMtime(p: string): number {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return /\.test\.tsx?$/.test(p) ? 0 : st.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    newest = Math.max(newest, newestSourceMtime(path.join(p, entry.name)));
  }
  return newest;
}

/**
 * Whether `<appRoot>/dist/server/server.js` is missing or older than anything it is built from:
 * the app's sources, scripts, content and configs, and the workspace libs it inlines.
 */
export function bundleIsStale(appRoot: string): boolean {
  const bundle = path.join(appRoot, "dist", "server", "server.js");
  if (!existsSync(bundle)) return true;
  const built = statSync(bundle).mtimeMs;
  const inputs = [
    ...["src", "scripts", "content", "server.ts", "vite.config.ts", "package.json"].map((p) =>
      path.join(appRoot, p),
    ),
    path.join(findRepoRoot(import.meta.dirname), "libs", "ts"),
  ];
  return inputs.some((p) => newestSourceMtime(p) > built);
}

export interface SmokeRoute {
  path: string;
  /** Expected status; 200 when omitted. */
  status?: number;
  /** Text the rendered page must contain. */
  contains: ReadonlyArray<string>;
}

export interface SsrSmokeOptions {
  /** The app dir. */
  appRoot: string;
  routes: ReadonlyArray<SmokeRoute>;
  /**
   * The build command (run with `pnpm`) when the bundle is stale. Default: the vite build alone,
   * which skips post-build steps such as akasha's search index.
   */
  build?: ReadonlyArray<string>;
}

const DEFAULT_BUILD = ["exec", "vite", "build", "--configLoader", "runner"];

/** Declares the `SSR smoke` suite: one test per route. */
export function describeSsrSmoke(opts: SsrSmokeOptions): void {
  const { appRoot, routes } = opts;
  const bundle = path.join(appRoot, "dist", "server", "server.js");
  let results = new Map<string, SmokeResult>();

  describe("SSR smoke", () => {
    beforeAll(async () => {
      if (bundleIsStale(appRoot)) {
        // vitest sets NODE_ENV=test, and vite builds a dev bundle (import.meta.env.DEV true)
        // under it; the smoke checks the production bundle, so build it as one.
        await execFileAsync("pnpm", [...(opts.build ?? DEFAULT_BUILD)], {
          cwd: appRoot,
          env: { ...process.env, NODE_ENV: "production" },
          maxBuffer: 256 * 1024 * 1024,
        });
      }
      const paths = routes.map((r) => r.path);
      const { stdout } = await execFileAsync(
        "node",
        ["--import", tsxLoader(), RUNNER, bundle, JSON.stringify(paths)],
        { cwd: appRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout) as SmokeResult[];
      results = new Map(parsed.map((r) => [r.path, r]));
    }, 300_000);

    for (const route of routes) {
      it(`renders ${route.path} (${route.status ?? 200})`, () => {
        const result = results.get(route.path);
        expect(result, `no result for ${route.path}`).toBeDefined();
        expect(result?.status).toBe(route.status ?? 200);
        for (const text of route.contains) {
          expect(result?.html, `${route.path} lacks ${JSON.stringify(text)}`).toContain(text);
        }
      });
    }
  });
}
