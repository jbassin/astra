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

// The content routes SSR straight from the generated modules — assert each renders a
// known marker server-side (gallery a card name; the spreads the curated spread name),
// proving content + gothic render in the SSR pass. The `/` draw is client-only
// (Decision D), so it SSRs the deterministic "Shuffling" fallback, not a reading.
async function check(path: string, needle: string): Promise<boolean> {
  const r = await ssr.fetch(new Request(`http://localhost${path}`));
  const html = await r.text();
  return r.status === 200 && html.includes(needle);
}
const gallery = await check("/gallery", "Hierophant");
const spreads = await check("/spreads", "Pilgrimage");
const history = await check("/spreads/history", "Pilgrimage");
const home = await check("/", "Shuffling");

const ok = res.status === 200 && marker && gallery && spreads && history && home;
console.log(
  `SSR_SMOKE status=${res.status} marker=${marker} gallery=${gallery} spreads=${spreads} history=${history} home=${home}`,
);
process.exit(ok ? 0 : 1);
