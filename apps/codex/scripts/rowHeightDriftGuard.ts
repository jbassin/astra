/**
 * P9 S1 (D29-83) — the row-pitch drift guard: a REAL-BROWSER probe asserting
 * `getBoundingClientRect().height === ROW_PITCH_PX` (24px) on a rendered
 * `.codex-listing-row`, at BOTH container tiers (FULL — every column, and
 * COMPACT — the narrow-container Name/Lvl/Source collapse, D29-78's
 * `NARROW_CONTAINER_WIDTH_PX`). Fixed-size windowing (`useWindowVirtualizer`,
 * `estimateSize: () => ROW_PITCH_PX`, no `measureElement`) never
 * self-corrects if the live rendered row height ever drifts off the token —
 * `tokens.css`'s "≈24px" comment already proved a live/token gap once (P8
 * measured 23.94px), so this is a REAL-CHROMIUM assertion, not a CSS/tokens
 * parse (the review's own "the proxy-pin class" finding, M4 — a parse-only
 * guard would have missed the exact drift it exists to catch).
 *
 * Mirrors `apps/vellum-render/scripts/visual-regression.ts`'s pattern (a
 * standalone script, not a `vitest` test — this repo's established posture
 * for a real-Playwright-Chromium check: `ssrSmoke.test.ts`'s own header
 * explains why the hermetic `test` lane deliberately avoids booting a real
 * browser, "no new CI infra"; this drift-guard is new, gated infra
 * on purpose, run as its OWN CI job the same way vellum-render's
 * `vellum-visual-regression` job is — see `.github/workflows/ci.yml`).
 *
 * Hermetic: runs against whatever corpus `resolveCorpusRoot()` resolves
 * (the committed FIXTURE corpus in CI/a fresh clone, D29-23's own
 * fallback — `/feat` still has >=1 real row there) — never asserts against
 * real-corpus DATA, only the CSS-driven geometry of whichever row renders.
 *
 * Requires a prior `pnpm run build` (serves the real built dist/, same
 * requirement as `visual-regression.ts`).
 *
 *   node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/rowHeightDriftGuard.ts
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createSsrServer } from "@astra/site-kit";
import { chromium } from "playwright";

// Duplicated, not imported: `columnDefs.tsx`/`virtualization.ts` both sit
// behind this app's `@/*` bundler-path-alias import graph (vite/tsc-only —
// Node's own resolver, even through the `nodeTsResolve.mjs` extensionless-
// relative-import hook every other `scripts/*.ts` file here uses, has no
// equivalent; see `apps/codex/scripts/build-search.ts`'s own all-relative
// import style for the established precedent). Both values are effectively
// frozen constants (`ROW_PITCH_PX` IS the density token this whole slice
// tunes CSS to hit exactly; `NARROW_CONTAINER_WIDTH_PX` is D29-78's
// long-settled 600px threshold) — a two-line duplication is cheaper than
// teaching this one script a bundler-aware resolve hook.
const ROW_PITCH_PX = 24;
const NARROW_CONTAINER_WIDTH_PX = 600;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SERVER_BUNDLE = `${ROOT}dist/server/server.js`;
const CLIENT_DIR = `${ROOT}dist/client`;
const PORT = Number(process.env.CODEX_ROW_HEIGHT_PORT ?? 5361);
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(SERVER_BUNDLE)) {
  throw new Error(`${SERVER_BUNDLE} not found — run \`pnpm run build\` first`);
}

/** Well above `NARROW_CONTAINER_WIDTH_PX` (600px) — the FULL column set
 * tier, and (per `.codex-browse-layout`'s own 56rem/896px breakpoint) also
 * wide enough that the listing pane itself is the narrower 58fr grid track,
 * not the whole viewport. */
const FULL_TIER_VIEWPORT = { width: 1600, height: 900 };
/** Well under `NARROW_CONTAINER_WIDTH_PX` at any viewport this narrow (the
 * `.codex-browse-layout` single-column collapse at <=56rem means the
 * listing pane IS the viewport here) — the COMPACT column tier + mobile
 * layout. */
const COMPACT_TIER_VIEWPORT = { width: 375, height: 800 };

async function measureRowHeight(
  browser: import("playwright").Browser,
  viewport: { width: number; height: number },
): Promise<number> {
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/feat`, { waitUntil: "load" });
    await page.waitForSelector(".codex-listing-row");
    return await page.evaluate(() => {
      const row = document.querySelector(".codex-listing-row");
      if (!row) throw new Error("no .codex-listing-row rendered");
      return row.getBoundingClientRect().height;
    });
  } finally {
    await context.close();
  }
}

const ssr = (await import(SERVER_BUNDLE)) as {
  default: { fetch: (req: Request) => Promise<Response> };
};
const server = createSsrServer({
  serviceName: "codex-row-height-drift-guard",
  port: PORT,
  ssr: ssr.default,
  clientDir: CLIENT_DIR,
});
await server.ready();

const browser = await chromium.launch({ args: ["--no-sandbox"] });

let failures = 0;
try {
  const fullHeight = await measureRowHeight(browser, FULL_TIER_VIEWPORT);
  console.log(`FULL tier   (${FULL_TIER_VIEWPORT.width}px): ${fullHeight}px`);
  if (fullHeight !== ROW_PITCH_PX) {
    console.error(`  FAIL — expected exactly ${ROW_PITCH_PX}px`);
    failures += 1;
  }

  const compactHeight = await measureRowHeight(browser, COMPACT_TIER_VIEWPORT);
  console.log(
    `COMPACT tier (${COMPACT_TIER_VIEWPORT.width}px, < ${NARROW_CONTAINER_WIDTH_PX}px pane): ${compactHeight}px`,
  );
  if (compactHeight !== ROW_PITCH_PX) {
    console.error(`  FAIL — expected exactly ${ROW_PITCH_PX}px`);
    failures += 1;
  }
} finally {
  await browser.close();
  await server.close(true);
}

if (failures > 0) {
  console.error(`\nrow-height drift guard: ${failures} tier(s) failed`);
  process.exit(1);
}
console.log("\nrow-height drift guard passed — both tiers exactly 24.00px");
