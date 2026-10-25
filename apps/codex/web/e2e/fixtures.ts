/**
 * Shared fixtures and helpers for the codex e2e suite.
 *
 * `baseURL` points at the server `playwright.config.ts` started. Each check from a case is a
 * named `check()` step holding a soft assertion, so one failed check still lets the case's
 * later checks run and report, and the list reporter prints every step by name.
 */
import { test as base, type Browser, type Page } from "@playwright/test";

/** Well above the 600px narrow-container width and the ~897px split-view breakpoint: the full
 * column set, and a row click previews into `?entry=` instead of navigating. */
export const DESKTOP_VIEWPORT = { width: 1600, height: 900 };

/** What the worker-scoped discovery visit read off a plain `/ritual` load. */
interface RitualDiscovery {
  /** The live `aria-rowcount`: the true row count, however many rows are mounted. */
  totalRows: number;
  /** The slug of the row at ~85% depth, for the deep-link case. */
  deepLinkSlug: string;
}

function codexOrigin(): string {
  const port = process.env.CODEX_E2E_PORT;
  if (!port) throw new Error("CODEX_E2E_PORT is unset: run the suite through playwright.config.ts");
  return `http://127.0.0.1:${port}`;
}

export const test = base.extend<object, { ritualDiscovery: RitualDiscovery }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their dependencies
  baseURL: async ({}, provide) => {
    await provide(codexOrigin());
  },
  ritualDiscovery: [
    async ({ browser }, provide) => {
      await provide(await discoverRitual(browser));
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";

/** One named check: a step holding a soft assertion. */
export async function check(label: string, assertion: () => unknown): Promise<void> {
  await test.step(label, async () => {
    await assertion();
  });
}

/** Reads the row count and a ~85%-depth slug off a plain `/ritual` visit, so every case scales
 * to whichever corpus is mounted instead of a hand-pinned count or slug. */
async function discoverRitual(browser: Browser): Promise<RitualDiscovery> {
  const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(`${codexOrigin()}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await page.waitForTimeout(300); // let the post-hydration full-array fetch land before trusting aria-rowcount
    const totalRows = await readTotalRows(page);
    await waitInteractiveViaProbe(page); // lands row 1, so the burst presses one fewer
    const deepIndex1Based = Math.round(totalRows * 0.85);
    await pressJ(page, deepIndex1Based - 1);
    await page.waitForTimeout(300);
    const found = await focusedRowIndex(page);
    if (found.slug === null || found.index !== deepIndex1Based) {
      throw new Error(
        `deep-link discovery failed: wanted index=${deepIndex1Based}, got ${JSON.stringify(found)}`,
      );
    }
    return { totalRows, deepLinkSlug: found.slug };
  } finally {
    await context.close();
  }
}

/** The focused listing row's 1-based `aria-rowindex` and slug, or nulls when focus is not on
 * a row's name anchor. */
// oxlint-disable-next-line require-await -- async so a throw reaches the caller as a rejection
export async function focusedRowIndex(
  page: Page,
): Promise<{ index: number | null; slug: string | null }> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("codex-listing-name")) {
      return { index: null, slug: null };
    }
    const tr = active.closest("tr");
    const idxAttr = tr?.getAttribute("aria-rowindex");
    return {
      index: idxAttr ? Number(idxAttr) : null,
      slug: active.dataset.entrySlug ?? null,
    };
  });
}

export function entryParam(url: string): string | null {
  return new URL(url).searchParams.get("entry");
}

export async function pressJ(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press("j");
}

/** Polls `probe()` until `isReady` holds or `timeoutMs` passes, returning the last value
 * either way. Use this instead of one fixed sleep before a check: a fixed budget is too short
 * on a loaded machine and wastefully long elsewhere. */
export async function poll<T>(
  probe: () => Promise<T>,
  isReady: (value: T) => boolean,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (isReady(value)) return value;
    if (Date.now() - start > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Returns once the listing is interactive: React has hydrated and the listing's keydown
 * listener is attached. SSR rows exist before hydration, so waiting for a row is not enough:
 * a "j" pressed before hydration is dropped, never replayed. This presses "j" until one lands
 * focus (on row 1, so callers press one fewer afterwards), then waits for that press's own
 * `?entry=` settle-commit and scroll reconcile, so they can't land in the middle of the
 * caller's case. */
async function waitInteractiveViaProbe(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.keyboard.press("j");
    const { slug } = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
      250,
      25,
    );
    if (slug !== null) {
      await poll(
        () => Promise.resolve(entryParam(page.url())),
        (e) => e === slug,
      );
      await page.waitForTimeout(100);
      return;
    }
  }
  throw new Error("page never became interactive — no 'j' press ever landed focus");
}

/** Loads `/ritual` and waits until it is interactive. */
export async function openRitualInteractive(page: Page): Promise<void> {
  await page.goto("/ritual", { waitUntil: "load" });
  await page.locator(".codex-listing-row").first().waitFor();
  await waitInteractiveViaProbe(page);
}

async function readTotalRows(page: Page): Promise<number> {
  const attr = await page.locator(".codex-listing-table").getAttribute("aria-rowcount");
  if (!attr) throw new Error("no aria-rowcount on .codex-listing-table");
  return Number(attr);
}
