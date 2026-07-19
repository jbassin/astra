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
 * P11 S2 (D29-102) extends this SAME script with a second, SCOPED assert:
 * `td.scrollWidth <= td.clientWidth` for the max-bounded columns the width
 * fix targets (level/hp/ac/size/rarity/actionCost/source/icon) — NEVER the
 * by-design ellipsis truncators (Name; the p99-sized Cast/Range/Type
 * columns, which intentionally clip their own long tail behind `title=`).
 * Checked against BOTH tier viewports on BOTH `/feat` and `/creature` (the
 * union of the two routes' own column sets covers level/actionCost/source/
 * icon (`/feat`) and level/size/hp/ac/source/icon (`/creature`) — 7 of the
 * 8 scoped keys; no real category renders a scoped Rarity column alongside
 * either of these two specific routes, so rarity rides on the SAME
 * `td.scrollWidth <= td.clientWidth` code path via whichever columns ARE
 * present, unexercised by name here — see this slice's own build report).
 * A DEFAULT-view (unsorted, whatever the windowed mount happens to show)
 * check is sufficient, not just a convenience: the pre-fix bug measured
 * live (spec: "Level th = 19px with 16px padding → ~3px content box") was a
 * SYSTEMIC content-box deficit from the missing-padding accounting, not a
 * p99/max-content-length edge case — even the shortest real value in an
 * affected column overflowed its own cell, so any mounted row reproduces
 * (and, once fixed, disproves) it.
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
 * This slice's own build report additionally records a LOCAL run against
 * the real corpus (present on this dev host) proving the new asserts pass
 * there too, not just against the thin fixture.
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

/** P11 S2 (D29-102) — the scoped cell-fit assert's column allowlist (see
 * this file's own header comment for why by-design ellipsis truncators —
 * Name, Cast/Range/Type — are deliberately excluded). Matched against each
 * `<td class="codex-listing-col-{key}">` — `<th>` is never checked (header
 * labels are short fixed English words that never need ellipsis, the SAME
 * exclusion `globals.css`'s own `.codex-listing-table td` comment states). */
const CELL_FIT_COLUMNS: readonly string[] = [
  "level",
  "hp",
  "ac",
  "size",
  "rarity",
  "actionCost",
  "source",
  "icon",
];

interface RowMetrics {
  rowHeight: number;
  /** Human-readable failure strings, one per overflowing cell found. */
  cellFitFailures: string[];
  /** Which of `CELL_FIT_COLUMNS` this route/viewport actually rendered at
   * least one `<td>` for — an empty result here (a column this ROUTE never
   * carries at all, e.g. Rarity on `/feat`/`/creature`) is expected and not
   * itself a failure; logged so a truly vacuous run (e.g. a selector typo)
   * is visible rather than silently passing everything. */
  checkedColumns: string[];
}

async function measureRowMetrics(
  browser: import("playwright").Browser,
  viewport: { width: number; height: number },
  path: string,
): Promise<RowMetrics> {
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await page.waitForSelector(".codex-listing-row");
    const rowHeight = await page.evaluate(() => {
      const row = document.querySelector(".codex-listing-row");
      if (!row) throw new Error("no .codex-listing-row rendered");
      return row.getBoundingClientRect().height;
    });
    const { cellFitFailures, checkedColumns } = await page.evaluate(
      (columns: readonly string[]) => {
        const failures: string[] = [];
        const checked: string[] = [];
        for (const col of columns) {
          const cells = document.querySelectorAll<HTMLTableCellElement>(
            `td.codex-listing-col-${col}`,
          );
          if (cells.length === 0) continue;
          checked.push(col);
          for (const cell of cells) {
            if (cell.scrollWidth > cell.clientWidth) {
              failures.push(
                `${col}: scrollWidth ${cell.scrollWidth}px > clientWidth ${cell.clientWidth}px (cell text: "${(cell.textContent ?? "").trim()}")`,
              );
            }
          }
        }
        return { cellFitFailures: failures, checkedColumns: checked };
      },
      CELL_FIT_COLUMNS,
    );
    return { rowHeight, cellFitFailures, checkedColumns };
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

/** P11 S2 (D29-102) — the two routes the spec names: `/feat`'s column set
 * (level/actionCost/Type/source + icon) and `/creature`'s (level/size/hp/ac/
 * source + icon) together exercise every `CELL_FIT_COLUMNS` entry except
 * Rarity (no real category shares BOTH a scoped Rarity column and one of
 * these two routes — see the header comment). */
const ROUTES = ["/feat", "/creature"];
const VIEWPORTS = [
  { label: "FULL", viewport: FULL_TIER_VIEWPORT },
  { label: "COMPACT", viewport: COMPACT_TIER_VIEWPORT },
];

let failures = 0;
const allCheckedColumns = new Set<string>();
try {
  for (const path of ROUTES) {
    for (const { label, viewport } of VIEWPORTS) {
      const metrics = await measureRowMetrics(browser, viewport, path);
      for (const col of metrics.checkedColumns) allCheckedColumns.add(col);
      const tierLabel = `${label} tier (${viewport.width}px) ${path}`;

      // The row-pitch height assert (D29-83) only needs proving once — kept
      // on `/feat` at both viewports, same as before this slice (row pitch
      // is a table-wide CSS rule, not per-category).
      if (path === "/feat") {
        console.log(`${tierLabel}: row height ${metrics.rowHeight}px`);
        if (metrics.rowHeight !== ROW_PITCH_PX) {
          console.error(`  FAIL — expected exactly ${ROW_PITCH_PX}px`);
          failures += 1;
        }
      }

      console.log(
        `${tierLabel}: cell-fit checked [${metrics.checkedColumns.join(", ") || "none"}]`,
      );
      for (const failure of metrics.cellFitFailures) {
        console.error(`  FAIL — ${tierLabel}: ${failure}`);
        failures += 1;
      }
    }
  }
} finally {
  await browser.close();
  await server.close(true);
}

if (allCheckedColumns.size === 0) {
  console.error(
    "\nrow-height drift guard: cell-fit assert never matched a single column — vacuous run",
  );
  failures += 1;
}

if (failures > 0) {
  console.error(`\nrow-height drift guard: ${failures} failure(s)`);
  process.exit(1);
}
console.log(
  `\nrow-height drift guard passed — row pitch exactly ${ROW_PITCH_PX}.00px, cell-fit OK for [${[...allCheckedColumns].join(", ")}] (NARROW_CONTAINER_WIDTH_PX=${NARROW_CONTAINER_WIDTH_PX})`,
);
