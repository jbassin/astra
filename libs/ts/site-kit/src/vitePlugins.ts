// Vite plugins shared by the astra frontend template — lifted from strider's
// `scripts/{contentWatchPlugin,gothicFontsDevPlugin}.ts` and parameterized so each
// app supplies only its own content layout. Build-time only (these never reach the
// client bundle).

import { spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fontsDir } from "@astra/gothic/fontsDir";
import type { Plugin, ViteDevServer } from "vite";

export interface ContentWatchOptions {
  /** App root (cwd for the build-content subprocess). */
  root: string;
  /** Absolute path to the app's `build-content.ts`. */
  script: string;
  /** Absolute path to the app's `content/` dir (watched in dev). */
  contentDir: string;
  /** Absolute path to the app's generated-modules dir (`src/generated`). */
  generatedDir: string;
  /** Generated module basenames to invalidate on a content edit (app-domain). */
  invalidate: ReadonlyArray<string>;
}

/**
 * Runs the app's `build-content.ts` (content/*.md → src/generated/*.ts) at
 * buildStart and re-runs it on content edits in dev. The script runs as a
 * subprocess so its fs/remark/gray-matter imports never reach the client bundle.
 */
export function contentWatchPlugin(opts: ContentWatchOptions): Plugin {
  const { root, script, contentDir, generatedDir, invalidate } = opts;

  function rebuild(): void {
    const result = spawnSync("bun", ["run", script], { cwd: root, stdio: "inherit" });
    if (result.status !== 0) console.error("[content-watch] build-content failed");
  }

  const isContentMarkdown = (file: string) =>
    file.startsWith(contentDir + path.sep) && file.endsWith(".md");

  return {
    name: "site-kit:content-watch",
    buildStart() {
      // Ensures src/generated/*.ts exist before any module resolves them.
      rebuild();
    },
    configureServer(server: ViteDevServer) {
      server.watcher.add(contentDir);

      const onChange = (file: string) => {
        if (!isContentMarkdown(file)) return;
        rebuild();
        // Invalidate generated modules so the next HMR cycle picks up new data.
        for (const name of invalidate) {
          const mod = server.moduleGraph.getModuleById(path.join(generatedDir, name));
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
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
