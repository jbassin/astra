import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

// gothic owns the webfonts (theme.css references absolute /fonts/*). The strider
// SSR template lets the host Caddy file-serve them straight from the gothic dir.
// orator-backend instead serves its operator SPA as a self-contained static
// `dist/` (M3, `serveStatic`), so this plugin (a) serves /fonts in `vite dev`
// and (b) copies the gothic fonts into `dist/fonts/` at build — gothic stays the
// single source of truth, no font copy is vendored into git.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(HERE, "../../../libs/ts/gothic/src/fonts");

const CONTENT_TYPE: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function gothicFontsPlugin(distDir: string): Plugin {
  return {
    name: "orator:gothic-fonts",
    configureServer(server) {
      server.middlewares.use("/fonts", (req, res, next) => {
        const name = path.basename(req.url ?? "");
        const file = path.join(FONTS_DIR, name);
        if (!name || !file.startsWith(FONTS_DIR) || !existsSync(file)) return next();
        res.setHeader(
          "Content-Type",
          CONTENT_TYPE[path.extname(name)] ?? "application/octet-stream",
        );
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = path.join(distDir, "fonts");
      mkdirSync(out, { recursive: true });
      for (const name of readdirSync(FONTS_DIR)) {
        copyFileSync(path.join(FONTS_DIR, name), path.join(out, name));
      }
    },
  };
}
