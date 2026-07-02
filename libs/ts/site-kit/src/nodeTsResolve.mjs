// Node ESM resolve hook — load via `node --import <this file>` before any app entry.
//
// The whole astra TS workspace (`tsconfig.base.json`'s `moduleResolution: "bundler"`)
// writes extensionless relative imports (`from "./config"`), matching Vite's and
// Bun's bundler-style resolution. Node's native ESM resolver requires an explicit
// extension on relative specifiers and has no equivalent flag (the old
// `--experimental-specifier-resolution=node` was removed) — so `node server.ts`
// fails on the FIRST such import it walks into (e.g. `@astra/config`'s
// `export … from "./config"`), well before Node's `.ts` type-stripping is even in
// play. This hook retries a failed relative-specifier resolution with `.ts`/`.tsx`
// (then `/index.ts`/`/index.tsx`) appended — the same fallback order bundler
// resolvers use — so the Node runtime walks the exact same on-disk source tree Bun
// already runs unmodified. Bare/package specifiers (workspace `@astra/*`, npm deps)
// are untouched: this only engages when Node's own resolver already rejected a
// relative specifier.
//
// Two DISTINCT failure shapes need the SAME retry chain (found via weal-bot, R3,
// 0022 S5 — `gateway.ts`'s `from "./roller"` where `roller/` is a directory with an
// `index.ts`): a nonexistent-as-written path (e.g. `"./config"` meaning
// `"./config.ts"`) throws `ERR_MODULE_NOT_FOUND`, but a path that DOES exist as a
// directory (e.g. `"./roller"` meaning `"./roller/index.ts"`) throws the unrelated
// `ERR_UNSUPPORTED_DIR_IMPORT` — Node's ESM resolver does no directory-index lookup
// at all (unlike CJS), so it fails differently depending on whether the bare path
// exists on disk.
//
// Both branches retry the FULL `EXTENSION_FALLBACKS` chain, sibling-file extensions
// BEFORE `/index.*` (0022 S11 — found running akasha-frontend's `build-search.ts`:
// `src/generated/transcripts` exists as BOTH a directory (`transcripts/`, with an
// `index.ts`) AND a sibling file (`transcripts.ts`) — a bundler resolves the sibling
// FILE first, but Node's resolver sees the directory on disk and throws
// `ERR_UNSUPPORTED_DIR_IMPORT` immediately, without ever considering the sibling file.
// Retrying only `/index.ts` on that error — the original fix, scoped to weal-bot's
// index-only `roller/` case — silently picks the WRONG module when a same-named
// sibling file also exists. Trying the sibling-file extensions first on EITHER error
// code restores correct bundler precedence regardless of which error Node throws.
//
// `.tsx` fallbacks (0022 S11 — found running akasha-frontend/strider/ledger/
// mouthpiece-frontend's `build-content.ts` under `node` for the first time: it
// imports a component from a bare `./renderBody` path backed by `renderBody.tsx`,
// which the `.ts`-only fallback chain never tried) are appended AFTER the `.ts`
// fallbacks so a same-named `.ts` file always wins, matching bundler-resolver order.
//
// The `load` hook below is a SEPARATE gotcha found in the same run: once resolution
// lands on a `.tsx` file, Node's own loader throws `ERR_UNKNOWN_FILE_EXTENSION` —
// Node's native type-stripping (the reason plain `.ts` needs no hook here) explicitly
// does not cover JSX syntax, only erasable TS types. `@astra/gothic`'s DocumentView
// tree (`.tsx`, used by every content-pipeline `build-content.ts`) needs an actual
// JSX transform, not just stripping. `esbuild` is already resident in the workspace
// (every frontend's vite devDependency) and pnpm-approved to run its install script
// (`onlyBuiltDependencies`, root package.json) — imported LAZILY here so a process
// that never touches a `.tsx` file (e.g. a plain server.ts entry) never pays for it.
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const EXTENSION_FALLBACKS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
const RETRY_CODES = new Set(["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"]);
const JSX_EXTENSIONS = [".tsx", ".jsx"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith(".")) throw err;
    if (!RETRY_CODES.has(err?.code)) throw err;
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

export async function load(url, context, nextLoad) {
  const ext = JSX_EXTENSIONS.find((candidate) => url.endsWith(candidate));
  if (!ext) return nextLoad(url, context);

  const { transform } = await import("esbuild");
  const filePath = fileURLToPath(url);
  const source = await readFile(filePath, "utf8");
  // jsx: "automatic" matches every app tsconfig's `"jsx": "react-jsx"` (the React 19
  // automatic runtime, no `import React` needed) — esbuild's default "transform" mode
  // emits `React.createElement` and throws `React is not defined` otherwise (found
  // running akasha-frontend's build-content.ts, which — unlike harrow/ledger's, whose
  // content pipeline never reaches a DocumentView render — actually calls it).
  const { code } = await transform(source, {
    loader: ext === ".tsx" ? "tsx" : "jsx",
    format: "esm",
    target: "esnext",
    jsx: "automatic",
    sourcefile: filePath,
  });
  return { format: "module", source: code, shortCircuit: true };
}

register(import.meta.url, import.meta.url);
