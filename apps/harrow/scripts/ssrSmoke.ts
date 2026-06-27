// SSR smoke runner — exercises the BUILT server bundle in real bun (production
// parity). Invoked by src/ssrSmoke.test.ts via a subprocess so vitest's module
// runner never re-bundles dist/server/server.js. Prints one result line and
// exits non-zero on any failure.
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, "../dist/server/server.js");

const mod = await import(SERVER);
const ssr = mod.default as { fetch?: (req: Request) => Promise<Response> } | undefined;

// Insurance: the custom server.ts relies on this internal export shape; if a
// TanStack Start bump changes it, fail loudly here rather than at runtime.
if (typeof ssr?.fetch !== "function") {
  console.error("FAIL: dist/server/server.js default export has no fetch()");
  process.exit(1);
}

const res = await ssr.fetch(new Request("http://localhost/"));
const html = await res.text();
const marker = html.includes("Harrow");

// /gallery is fully static (SSRs the deck from the generated module) — assert a known
// card name renders server-side, proving content + gothic render in the SSR pass.
const galleryRes = await ssr.fetch(new Request("http://localhost/gallery"));
const galleryHtml = await galleryRes.text();
const galleryMarker = galleryHtml.includes("Hierophant");

const ok = res.status === 200 && marker && galleryRes.status === 200 && galleryMarker;
console.log(
  `SSR_SMOKE status=${res.status} hasFetch=true marker=${marker} gallery=${galleryRes.status} galleryMarker=${galleryMarker}`,
);
process.exit(ok ? 0 : 1);
