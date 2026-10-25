/**
 * Serves the Foundry module as an installable package (Foundry installs it by
 * Manifest URL): `GET /module/module.json` — the module's manifest, rendered at
 * request time with **absolute** `manifest`/`download` URLs from
 * `cfg.portal.publicOrigin` (config-single-source — no hardcoded host) — and
 * `GET /module/portal.zip` — `module.json` (the SAME rendered copy, so the installed
 * package's own manifest carries the update-check URL) + `dist/main.js` (+ `styles/`
 * if the module ever grows one) zipped with `fflate` (tiny, zero-dep `zipSync`, no
 * system zip binary needed).
 *
 * The Docker build already produced `moduleDir/module.json` +
 * `moduleDir/dist/main.js` — nothing is built here, only packaged, and the zip is
 * cached in memory after the first request (keyed by `moduleDir`, so tests using
 * distinct temp dirs don't cross-pollute). If the module hasn't been built yet
 * (local dev before `just portal-module-build`, or a dist wipe), both routes return a
 * typed 503 rather than crashing.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { json } from "@astra/service-kit";
import { strToU8, zipSync, type Zippable } from "fflate";

interface ModulePackageOptions {
  /** `cfg.portal.publicOrigin` — e.g. `https://portal.iridi.cc`. */
  publicOrigin: string;
  /** Directory containing `module.json` + a built `dist/main.js` (and optionally
   * `styles/`) — `apps/portal/module` both locally and in the built image (see
   * `index.ts`'s `MODULE_DIR` resolution). */
  moduleDir: string;
}

interface RenderedManifest {
  text: string;
}

/** Renders `moduleDir/module.json` with absolute `manifest`/`download` URLs, or
 * `null` if the module hasn't been built (no `module.json` on disk). */
function renderManifest(opts: ModulePackageOptions): RenderedManifest | null {
  const manifestPath = join(opts.moduleDir, "module.json");
  if (!existsSync(manifestPath)) return null;
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  const rendered = {
    ...raw,
    manifest: `${opts.publicOrigin}/module/module.json`,
    download: `${opts.publicOrigin}/module/portal.zip`,
  };
  return { text: JSON.stringify(rendered, null, 2) };
}

// Keyed by moduleDir (not a single flat cache) so distinct configs/tests don't
// share a stale zip; a 503 (nothing built yet) is never cached, so a later request
// after a build completes packages the real thing.
const zipCache = new Map<string, Uint8Array>();

function buildZip(opts: ModulePackageOptions): Uint8Array | null {
  const cached = zipCache.get(opts.moduleDir);
  if (cached) return cached;

  const rendered = renderManifest(opts);
  const distPath = join(opts.moduleDir, "dist", "main.js");
  if (!rendered || !existsSync(distPath)) return null;

  const files: Zippable = {
    "module.json": strToU8(rendered.text),
    "dist/main.js": readFileSync(distPath),
  };
  const stylesDir = join(opts.moduleDir, "styles");
  if (existsSync(stylesDir)) {
    for (const name of readdirSync(stylesDir)) {
      files[`styles/${name}`] = readFileSync(join(stylesDir, name));
    }
  }

  const zip = zipSync(files);
  zipCache.set(opts.moduleDir, zip);
  return zip;
}

const NOT_BUILT = (): Response => json({ error: "module_not_built" }, 503);

/** `GET /module/module.json` handler. */
export function moduleJsonResponse(opts: ModulePackageOptions): Response {
  const rendered = renderManifest(opts);
  if (!rendered) return NOT_BUILT();
  return new Response(rendered.text, { headers: { "content-type": "application/json" } });
}

/** `GET /module/portal.zip` handler. */
export function portalZipResponse(opts: ModulePackageOptions): Response {
  const zip = buildZip(opts);
  if (!zip) return NOT_BUILT();
  return new Response(new Uint8Array(zip), { headers: { "content-type": "application/zip" } });
}
