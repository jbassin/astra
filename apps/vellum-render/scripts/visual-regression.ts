/**
 * Golden-image visual regression (D4). Renders each fixture through the real
 * RenderService and compares the PNG to a committed golden with a perceptual
 * tolerance. Goldens are authoritative ONLY in the pinned CI container
 * (`node:24-slim` + the Chromium the `playwright` lock pins, 0022 S11 — was
 * `oven/bun:1.3.14` through S9/S10) — cross-render AA/hinting drift exceeds the
 * tolerance otherwise — so they are (re)generated there with `--update`. This is a
 * NEW-BASELINE regression gate against astra's own gothic render, NOT a byte-match
 * to faerrin's (the void palette differs).
 *
 * Runtime-agnostic (node:fs + srvx only — R3, 0022 S9): runs under host Node 24 and
 * the pinned `node:24-slim` CI container (0022 S11 — the bun-container CI job is
 * gone; the golden contract is pinned to this Node image now).
 *
 *   node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/visual-regression.ts            # compare (exit 1 on drift)
 *   node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/visual-regression.ts --update   # (re)write goldens
 *
 * Requires a prior `pnpm run build` (the render service serves dist/).
 */
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveFile } from "@astra/site-kit";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { serve } from "srvx";
import { RenderService } from "../src/renderService";
import { FIXTURES } from "../test/visual/fixtures";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = resolve(ROOT, "dist");
const GOLDEN = resolve(ROOT, "test/visual/golden");
const PORT = Number(process.env.VELLUM_VR_PORT ?? 5350);
const BASE = `http://127.0.0.1:${PORT}`;
const UPDATE = process.argv.includes("--update");
/** Allow up to 0.5% of pixels to differ (cross-render AA/hinting slack). */
const MAX_DIFF_RATIO = 0.005;

if (!existsSync(resolve(DIST, "render.html"))) {
  throw new Error(`${DIST}/render.html not found — run \`pnpm run build\` first`);
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

// Minimal static server (this Chromium only ever fetches dist/ assets) — srvx +
// @astra/site-kit's `serveFile` (runtime-agnostic, R3, 0022 S9). Reuses the same
// `send`-backed bridge server.ts does so JS/CSS assets get the right content-type
// (a bare node:fs read left `/assets/*.js` untyped and Chromium refused to
// execute the module script — found only by RUNNING this).
const server = serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    const full = resolve(DIST, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!full.startsWith(DIST)) return new Response("forbidden", { status: 403 });
    if (!(await isFile(full))) return new Response("not found", { status: 404 });
    return serveFile(req, full);
  },
});
await server.ready();

const service = new RenderService(BASE);
await service.start();

let failures = 0;
try {
  for (const fx of FIXTURES) {
    const png = Buffer.from(
      await service.render({ source: fx.source, mode: fx.mode, scale: fx.scale ?? 2 }),
    );
    const goldenPath = resolve(GOLDEN, `${fx.name}.png`);

    if (UPDATE) {
      await writeFile(goldenPath, png);
      console.log(`updated  ${fx.name}`);
      continue;
    }

    if (!(await isFile(goldenPath))) {
      console.error(`MISSING  ${fx.name} (run --update in the CI container)`);
      failures += 1;
      continue;
    }

    const actual = PNG.sync.read(png);
    const golden = PNG.sync.read(await readFile(goldenPath));
    if (actual.width !== golden.width || actual.height !== golden.height) {
      console.error(
        `DIM      ${fx.name}: ${actual.width}x${actual.height} vs golden ${golden.width}x${golden.height}`,
      );
      failures += 1;
      continue;
    }

    const diff = new PNG({ width: actual.width, height: actual.height });
    const changed = pixelmatch(actual.data, golden.data, diff.data, actual.width, actual.height, {
      threshold: 0.1,
    });
    const ratio = changed / (actual.width * actual.height);
    if (ratio > MAX_DIFF_RATIO) {
      console.error(`FAIL     ${fx.name}: ${(ratio * 100).toFixed(3)}% changed`);
      failures += 1;
    } else {
      console.log(`ok       ${fx.name}: ${(ratio * 100).toFixed(3)}% changed`);
    }
  }
} finally {
  await service.close();
  await server.close(true);
}

if (!UPDATE && failures > 0) {
  console.error(`\nvisual regression: ${failures} fixture(s) failed`);
  process.exit(1);
}
console.log(UPDATE ? "\ngoldens updated" : "\nvisual regression passed");
