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
import { register } from "node:module";

const EXTENSION_FALLBACKS = [".ts", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw err;
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
