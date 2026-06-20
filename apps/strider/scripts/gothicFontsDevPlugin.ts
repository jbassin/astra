import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// gothic owns the webfonts (theme.css references absolute /fonts/*). In prod the
// host Caddy file-serves them straight from the gothic package dir (sites.caddyfile
// `gothic_fonts`); this dev-only middleware does the same for `vite dev`, so no
// frontend ever vendors a font copy — gothic stays the single source of truth.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(HERE, "../../../libs/ts/gothic/src/fonts");

const CONTENT_TYPE: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function gothicFontsDevPlugin(): Plugin {
  return {
    name: "strider:gothic-fonts-dev",
    apply: "serve",
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
  };
}
