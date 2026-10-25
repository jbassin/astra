// Vite plugins shared by the astra frontend template — lifted from strider's
// `scripts/{contentWatchPlugin,gothicFontsDevPlugin}.ts` and parameterized so each
// app supplies only its own content layout. Build-time only (these never reach the
// client bundle).

import { spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import { fontsDir } from "@astra/gothic/fontsDir";
import type { Plugin, ViteDevServer } from "vite";

import { tsxLoader } from "./tsxLoader";

// `build-content.ts` scripts run as a Node subprocess under tsx (`./tsxLoader.ts`), never a
// binary looked up on PATH: a hardcoded `bun` here once failed silently in
// the node:24-slim Docker build stage, masked on a dev host by a stale `src/generated/*`.

export interface ContentWatchOptions {
  /** App root (cwd for the build-content subprocess). */
  root: string;
  /** Absolute path to the app's `build-content.ts`. */
  script: string;
  /**
   * Absolute paths (files or dirs) the build script reads: the app's `content/` and `scripts/`,
   * config.kdl, and any data outside the app (a snapshot, a corpus). A dev edit to any file
   * under one of them regenerates the content. A function is called only when the dev server
   * starts, so a build never resolves paths it does not watch.
   */
  inputs: ReadonlyArray<string> | (() => ReadonlyArray<string>);
  /** Absolute path to the app's generated-modules dir (`src/generated`). */
  generatedDir: string;
  /** Generated module basenames to invalidate on a content edit (app-domain). */
  invalidate: ReadonlyArray<string>;
}

/**
 * Whether a changed file is one of the build script's inputs: the input itself or a file under
 * an input dir. Files in the generated dir (the script's own output) and dotfiles (editor swap
 * files, `.gitkeep`) never count. Pure.
 */
export function isContentInput(
  file: string,
  inputs: ReadonlyArray<string>,
  generatedDir: string,
): boolean {
  if (file === generatedDir || file.startsWith(generatedDir + path.sep)) return false;
  if (path.basename(file).startsWith(".")) return false;
  return inputs.some((input) => file === input || file.startsWith(input + path.sep));
}

/** How long dev waits after the last input change before regenerating, so a burst of edits
 * (a pull of the data clone) runs the script once. */
const REBUILD_DEBOUNCE_MS = 100;

/**
 * Runs the app's `build-content.ts` (content → src/generated/*.ts) at buildStart and re-runs it
 * in dev when any of its inputs changes. The script runs as a subprocess so its
 * fs/remark/gray-matter imports never reach the client bundle.
 */
export function contentWatchPlugin(opts: ContentWatchOptions): Plugin {
  const { root, script, inputs, generatedDir, invalidate } = opts;

  function rebuild(): void {
    const result = spawnSync("node", ["--import", tsxLoader(), script], {
      cwd: root,
      stdio: "inherit",
    });
    // oxlint-disable-next-line no-console -- dev-server build output
    if (result.status !== 0) console.error("[content-watch] build-content failed");
  }

  return {
    name: "site-kit:content-watch",
    buildStart() {
      // Ensures src/generated/*.ts exist before any module resolves them.
      rebuild();
    },
    configureServer(server: ViteDevServer) {
      const watched = typeof inputs === "function" ? inputs() : inputs;
      server.watcher.add([...watched]);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const regenerate = () => {
        timer = undefined;
        rebuild();
        // Invalidate generated modules so the next HMR cycle picks up new data.
        for (const name of invalidate) {
          const mod = server.moduleGraph.getModuleById(path.join(generatedDir, name));
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
      };
      const onChange = (file: string) => {
        if (!isContentInput(path.resolve(file), watched, generatedDir)) return;
        clearTimeout(timer);
        timer = setTimeout(regenerate, REBUILD_DEBOUNCE_MS);
      };

      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

const FONT_CONTENT_TYPE: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface GothicFontsOptions {
  /** Build output dir to copy fonts into (e.g. `<app>/dist/client`); `/fonts/*` is served from there. */
  clientOutDir: string;
}

/**
 * gothic owns the webfonts (theme.css references absolute /fonts/*); gothic stays
 * the single source of truth (resolved via the `@astra/gothic/fontsDir` package
 * export, not a path climb), no frontend vendors a copy into git. This (a) serves
 * /fonts in `vite dev` and (b) copies the gothic fonts into `clientOutDir/fonts`
 * at build, so the SSR container self-serves them (server static-serves the client
 * dir) — no host-Caddy `gothic_fonts` dependency, matching orator/weal-overlay.
 */
export function gothicFontsPlugin(opts: GothicFontsOptions): Plugin {
  return {
    name: "site-kit:gothic-fonts",
    configureServer(server) {
      server.middlewares.use("/fonts", (req, res, next) => {
        const name = path.basename(req.url ?? "");
        const file = path.join(fontsDir, name);
        if (!name || !file.startsWith(fontsDir) || !existsSync(file)) return next();
        res.setHeader(
          "Content-Type",
          FONT_CONTENT_TYPE[path.extname(name)] ?? "application/octet-stream",
        );
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = path.join(opts.clientOutDir, "fonts");
      mkdirSync(out, { recursive: true });
      for (const name of readdirSync(fontsDir)) {
        copyFileSync(path.join(fontsDir, name), path.join(out, name));
      }
    },
  };
}
