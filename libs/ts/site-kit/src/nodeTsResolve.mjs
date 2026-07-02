// Node ESM resolve hook — load via `node --import <this file>` before any app entry.
//
// The whole astra TS workspace (`tsconfig.base.json`'s `moduleResolution: "bundler"`)
// writes extensionless relative imports (`from "./config"`), matching Vite's and
// Bun's bundler-style resolution. Node's native ESM resolver requires an explicit
// extension on relative specifiers and has no equivalent flag (the old
// `--experimental-specifier-resolution=node` was removed) — so `node server.ts`
// fails on the FIRST such import it walks into (e.g. `@astra/config`'s
// `export … from "./config"`), well before Node's `.ts` type-stripping is even in
// play. This hook retries a failed relative-specifier resolution with `.ts` (then
// `/index.ts`) appended — the same two-step fallback bundler resolvers use — so the
// Node runtime walks the exact same on-disk source tree Bun already runs unmodified.
// Bare/package specifiers (workspace `@astra/*`, npm deps) are untouched: this only
// engages when Node's own resolver already rejected a relative specifier.
//
// Two DISTINCT failure shapes need two different retries (found via weal-bot, R3,
// 0022 S5 — `gateway.ts`'s `from "./roller"` where `roller/` is a directory with an
// `index.ts`): a nonexistent-as-written path (e.g. `"./config"` meaning
// `"./config.ts"`) throws `ERR_MODULE_NOT_FOUND`, but a path that DOES exist as a
// directory (e.g. `"./roller"` meaning `"./roller/index.ts"`) throws the unrelated
// `ERR_UNSUPPORTED_DIR_IMPORT` — Node's ESM resolver does no directory-index lookup
// at all (unlike CJS), so it fails differently depending on whether the bare path
// exists on disk. Both retries land on the same `/index.ts` fallback; only the
// triggering error code differs.
import { register } from "node:module";

const EXTENSION_FALLBACKS = [".ts", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith(".")) throw err;
    if (err?.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      try {
        return await nextResolve(`${specifier}/index.ts`, context);
      } catch {
        throw err;
      }
    }
    if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
    for (const ext of EXTENSION_FALLBACKS) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // try the next fallback
      }
    }
    throw err;
  }
}

register(import.meta.url, import.meta.url);
