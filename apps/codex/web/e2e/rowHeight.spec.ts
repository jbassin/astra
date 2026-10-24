/**
 * Listing row geometry in real Chromium, at both container tiers.
 *
 * Row pitch: a rendered `.codex-listing-row` is exactly `ROW_PITCH_PX` tall. The listing uses
 * fixed-size windowing (`estimateSize: () => ROW_PITCH_PX`, no `measureElement`), which never
 * corrects itself if the live row height drifts off the token, and a CSS or token parse
 * cannot see that drift (the live row once measured 23.94px), so this measures it.
 *
 * Cell fit: in the max-bounded columns, every `<td>` fits its content
 * (`scrollWidth <= clientWidth`). The ellipsis columns (Name, Cast, Range, Type) clip by design
 * and are left out, as are `<th>` labels. `/feat` and `/creature` together render seven of the
 * eight columns; no category renders Rarity alongside either. Any mounted row shows a padding
 * deficit, so the default (unsorted) view is enough.
 *
 * The geometry is CSS-driven, so these pass against any corpus.
 */
import type { Page } from "@playwright/test";

import { check, expect, test } from "./fixtures";

// Duplicated from `virtualization.ts`, which sits behind the `@/*` alias: a settled constant.
const ROW_PITCH_PX = 24;

/** The scoped cell-fit columns, matched against `td.codex-listing-col-{key}`. */
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

const ROUTES = ["/feat", "/creature"];
const TIERS = [
  // Well above the 600px narrow-container width: the full column set, in the split view.
  { label: "FULL", viewport: { width: 1600, height: 900 } },
  // Well under it: the single-column layout, so the listing pane is the viewport.
  { label: "COMPACT", viewport: { width: 375, height: 800 } },
];

interface CellFit {
  /** One message per overflowing cell. */
  failures: string[];
  /** The scoped columns this route rendered at least one `<td>` for. */
  checkedColumns: string[];
}

async function openListing(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForSelector(".codex-listing-row");
}

// oxlint-disable-next-line require-await -- async so a throw reaches the caller as a rejection
async function measureRowHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const row = document.querySelector(".codex-listing-row");
    if (!row) throw new Error("no .codex-listing-row rendered");
    return row.getBoundingClientRect().height;
  });
}

// oxlint-disable-next-line require-await -- async so a throw reaches the caller as a rejection
async function measureCellFit(page: Page): Promise<CellFit> {
  return page.evaluate((columns: readonly string[]) => {
    const failures: string[] = [];
    const checkedColumns: string[] = [];
    for (const col of columns) {
      const cells = document.querySelectorAll<HTMLTableCellElement>(`td.codex-listing-col-${col}`);
      if (cells.length === 0) continue;
      checkedColumns.push(col);
      for (const cell of cells) {
        if (cell.scrollWidth > cell.clientWidth) {
          failures.push(
            `${col}: scrollWidth ${cell.scrollWidth}px > clientWidth ${cell.clientWidth}px (cell text: "${(cell.textContent ?? "").trim()}")`,
          );
        }
      }
    }
    return { failures, checkedColumns };
  }, CELL_FIT_COLUMNS);
}

for (const { label, viewport } of TIERS) {
  test.describe(`${label} tier (${viewport.width}px)`, () => {
    test.use({ viewport });

    // Row pitch is one table-wide CSS rule, so /feat alone proves it.
    test(`/feat: row height is exactly ${ROW_PITCH_PX}px`, async ({ page }) => {
      await openListing(page, "/feat");
      expect(await measureRowHeight(page)).toBe(ROW_PITCH_PX);
    });

    for (const path of ROUTES) {
      test(`${path}: every scoped column's cells fit their content`, async ({ page }) => {
        await openListing(page, path);
        const fit = await measureCellFit(page);
        test.info().annotations.push({
          type: "cell-fit checked",
          description: fit.checkedColumns.join(", ") || "none",
        });
        expect(fit.failures).toEqual([]);
      });
    }
  });
}

// Guards against a vacuous run, such as a selector typo that matches no column anywhere.
test("cell fit matched at least one scoped column across the routes and tiers", async ({
  browser,
  baseURL,
}) => {
  const checked = new Set<string>();
  for (const path of ROUTES) {
    for (const { viewport } of TIERS) {
      const context = await browser.newContext({ viewport, baseURL });
      try {
        const page = await context.newPage();
        await openListing(page, path);
        for (const col of (await measureCellFit(page)).checkedColumns) checked.add(col);
      } finally {
        await context.close();
      }
    }
  }
  await check(`checked [${[...checked].join(", ")}]`, () => expect([...checked]).not.toEqual([]));
});
