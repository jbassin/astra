/**
 * P9 S2 (D29-84/-85/-90) — the listing-virtualization INTERACTION guard: a
 * real-Chromium Playwright probe covering the gate C/D/E cases a hermetic
 * `jsdom` unit test structurally can't (real scroll, real wheel events, real
 * keyboard-vs-synthetic-click `detail` semantics, real `window.scrollTo`
 * timing against TanStack's pre-hydration scroll-restoration inline
 * `<script>`). Mirrors `rowHeightDriftGuard.ts`'s own pattern exactly (a
 * standalone script, not a `vitest` test, run as its own pinned-container CI
 * job — see that script's header for why a real browser stays OUT of the
 * hermetic `test` lane) — reusing its server-boot idiom verbatim.
 *
 * Hermetic + fixture-only: runs against the committed FIXTURE corpus
 * (`resolveCorpusRoot()`'s D29-23 fallback — CI/a fresh clone has no
 * `apps/codex/data/`). The fixture's `ritual` category was grown (additively
 * — no other fixture file touched, no existing entity file modified) from 6
 * to 96 rows (`fixtures/entities/ritual/virt-{001..090}.json` + the matching
 * `_index.json`/`manifest.json` entries) SPECIFICALLY so this guard has a
 * real category comfortably past `SSR_WINDOW` (60, `virtualization.ts`) to
 * drive — every other fixture category tops out at 7 rows, nowhere near
 * enough to exercise "walks past the SSR window" or "deep-link centers a row
 * far from the top" for real.
 *
 * Deliberately CORPUS-SIZE-AGNOSTIC (never hardcodes a row count or a
 * specific slug): `TOTAL_ROWS` below is read live off the rendered table's
 * own `aria-rowcount` (D29-83/R5), and the deep-link target is discovered by
 * j-scanning to ~85% depth and reading back whichever slug landed there —
 * the same mechanism that lets this script ALSO run correctly against a real
 * `codex.data-path` mount (a dev box with the genuine corpus, where `ritual`
 * has 201 rows, not 96) without a single assertion changing shape. Fails
 * loudly up front if `TOTAL_ROWS <= 60` — that would mean the fixture
 * growth this script depends on is missing/reverted, not that these cases
 * don't apply.
 *
 * Requires a prior `pnpm run build` (serves the real built dist/, same
 * requirement as `rowHeightDriftGuard.ts`/`visual-regression.ts`).
 *
 *   node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/virtualizationInteractionGuard.ts
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createSsrServer } from "@astra/site-kit";
import { chromium, type Page } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SERVER_BUNDLE = `${ROOT}dist/server/server.js`;
const CLIENT_DIR = `${ROOT}dist/client`;
const PORT = Number(process.env.CODEX_VIRT_INTERACTION_PORT ?? 5362);
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(SERVER_BUNDLE)) {
  throw new Error(`${SERVER_BUNDLE} not found — run \`pnpm run build\` first`);
}

// Well above `NARROW_CONTAINER_WIDTH_PX` (600) AND `SPLIT_VIEW_MEDIA`
// (56.0625rem/897px, `BrowseListing.tsx`) — every case below needs desktop
// split-view semantics (row click intercepts into `?entry=` rather than
// fully navigating; the FULL column set is mounted, matching the drift-
// guard's own `FULL_TIER_VIEWPORT`).
const VIEWPORT = { width: 1600, height: 900 };

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  PASS — ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL — ${label}${detail ? ` (${detail})` : ""}`);
  }
}

async function focusedRowIndex(page: Page): Promise<{ index: number | null; slug: string | null }> {
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

function entryParam(url: string): string | null {
  return new URL(url).searchParams.get("entry");
}

async function pressJ(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press("j");
}

/** Waits until the page is genuinely INTERACTIVE (React has hydrated and
 * `BrowseListing`'s own keydown listener is attached), returning only once a
 * probe "j" press has actually landed focus. `page.locator(...).first()
 * .waitFor()` alone is NOT this: the SSR HTML (and therefore the row
 * elements) exists the instant the document is parsed, well before React
 * hydration attaches any listener — a `page.keyboard.press("j")` fired in
 * that window dispatches a real native keydown with NOTHING listening for
 * it, and it is gone forever (never replayed once hydration catches up).
 * Found live running this guard repeatedly: on a loaded box, a plain
 * `.first().waitFor()` before pressing "j" a few times intermittently
 * (~25-50% of runs) landed ZERO focus at all, even after several seconds of
 * polling afterward — every native "j" keydown fired, confirmed via a
 * capture-phase listener, but not ONE `focusin` ever followed, because none
 * of them were dispatched after hydration finished. This is a GAP IN THE
 * TEST, not the app — a real user's first keypress always arrives well
 * after the page visually looks interactive; only a synthetic, fixed-delay
 * script can race hydration this way. Every case below calls this ONCE,
 * right after `.first().waitFor()`, before its OWN intended burst — it
 * consumes exactly one "j" (lands on row 1), which every case already
 * accounts for by pressing one fewer afterward. */
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
      // Drain this probe's OWN side effects before handing control back —
      // its focus move schedules BOTH a FOCUS_SETTLE_MS (180ms) `?entry=`
      // preview-commit AND an rAF-scheduled `scrollToIndex` reconcile.
      // Without waiting for these here, they land at some ARBITRARY point
      // during the caller's OWN test logic — found live: the probe's own
      // settle-commit landed mid-case and got conflated with a text-
      // selection-drag case's before/after `?entry=` comparison, and its
      // pending scroll reconcile clobbered a deliberate `window.scrollTo`
      // in the reload case a moment after it ran. Every case should start
      // from a genuinely settled, side-effect-free state.
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

/** Polls `probe()` until it returns a non-null/non-undefined value or
 * `timeoutMs` elapses (returning whatever the LAST probe call produced
 * either way) — used everywhere below INSTEAD OF a single fixed
 * `waitForTimeout` before one check: a flat sleep is either wastefully long
 * (the common case) or, under real system load (a busy CI runner, or this
 * very sandbox mid-session), too short — found live running this guard
 * repeatedly: a fixed "8 presses + 700ms" wait still intermittently saw
 * focus not yet landed, not because the mechanism is broken (a LONGER wait
 * always eventually saw it land correctly) but because the fixed budget
 * wasn't generous enough on a loaded box. Polling gives every case as much
 * time as it genuinely needs, up to a real bound, instead of guessing one
 * fixed number for every environment. */
async function poll<T>(
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

/** `aria-rowcount` (D29-83/R5) — the live, TRUE row count under the current
 * URL, independent of how many rows are actually mounted. The one number
 * every corpus-size-agnostic case below is scaled off. */
async function readTotalRows(page: Page): Promise<number> {
  const attr = await page.locator(".codex-listing-table").getAttribute("aria-rowcount");
  if (!attr) throw new Error("no aria-rowcount on .codex-listing-table");
  return Number(attr);
}

const ssr = (await import(SERVER_BUNDLE)) as {
  default: { fetch: (req: Request) => Promise<Response> };
};
const server = createSsrServer({
  serviceName: "codex-virtualization-interaction-guard",
  port: PORT,
  ssr: ssr.default,
  clientDir: CLIENT_DIR,
});
await server.ready();

const browser = await chromium.launch({ args: ["--no-sandbox"] });

try {
  // --- Discovery: the TRUE row count, + a ~85%-depth slug for the deep-link
  // case below — both read off a plain, ordinary `/ritual` visit so every
  // later case scales to whichever corpus is actually mounted (the 96-row
  // fixture in CI, or a real `codex.data-path`'s 201-row `ritual` here on a
  // dev box) instead of a hand-pinned row count/slug.
  let totalRows: number;
  let deepLinkSlug: string;
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await page.waitForTimeout(300); // let the post-hydration full-array fetch land (D29-89) before trusting aria-rowcount
    totalRows = await readTotalRows(page);
    check(
      "precondition — /ritual has > SSR_WINDOW=60 rows to drive this guard",
      totalRows > 60,
      `aria-rowcount=${totalRows}`,
    );
    await waitInteractiveViaProbe(page); // lands row 1 — every burst below presses one fewer to compensate
    const deepIndex1Based = Math.round(totalRows * 0.85);
    await pressJ(page, deepIndex1Based - 1);
    await page.waitForTimeout(300);
    const found = await focusedRowIndex(page);
    if (found.slug === null || found.index !== deepIndex1Based) {
      throw new Error(
        `deep-link discovery failed: wanted index=${deepIndex1Based}, got ${JSON.stringify(found)}`,
      );
    }
    deepLinkSlug = found.slug;
    await context.close();
  }

  // --- Case: frontier j/k on a COLD load, D29-89 fetch-race covered -------
  // A large j-burst fired IMMEDIATELY on a fresh `page.goto` (no wait for
  // the post-hydration full-array fetch) must never throw/hang even while
  // `visible.length` is still the 60-row SSR window; a further burst after
  // settling must reach the TRUE last row — proving both that the fetch
  // race is handled gracefully (D29-89's own accepted risk window) and that
  // j/k genuinely walks past `SSR_WINDOW` (60), not just to its edge.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    // `waitInteractiveViaProbe` only confirms HYDRATION is done (React's own
    // keydown listener is attached) — a materially different, unrelated
    // concern from the D29-89 fetch race this case exists to cover, and one
    // any real user's first keypress is naturally well past anyway. The
    // burst below is STILL fired with no settle wait afterward — THAT'S the
    // actual race: a burst this size takes well under 300ms wall-clock (a
    // fast synchronous keydown/re-render loop), so the D29-89 background
    // fetch is NOT guaranteed to have landed before the LAST of these
    // presses fires — every press beyond wherever the pre-fetch 60-row
    // window clamps is expected to be a same-index no-op DURING this burst
    // specifically (never a crash/hang — that's the thing being proven
    // here), not a guarantee this burst alone reaches the true end.
    await waitInteractiveViaProbe(page);
    await pressJ(page, totalRows + 14);
    await page.waitForTimeout(500); // let the D29-89 background fetch land
    // A SECOND burst, sized to the full row count with margin — guarantees
    // reaching the true last row regardless of how many of the FIRST
    // burst's presses were spent clamped at the pre-fetch 60-row window
    // (unlike the first burst, timing no longer matters here: the fetch is
    // long since resolved by now).
    await pressJ(page, totalRows + 15);
    await page.waitForTimeout(300);
    const { index } = await focusedRowIndex(page);
    check(
      "cold-load frontier j-burst reaches the true last row (past SSR_WINDOW=60)",
      index === totalRows,
      `got index=${String(index)}, wanted ${totalRows}`,
    );
    await context.close();
  }

  // --- Case: Enter opens the focused row (full navigation) ----------------
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page);
    await pressJ(page, 2);
    const focused = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    check("j-scan lands real focus before Enter is pressed", focused.slug !== null);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/ritual\/[^/?]+$/, { timeout: 5000 });
    check("Enter fully navigates off the listing to the entity page", true);
    await context.close();
  }

  // --- Case: preview-follows-focus, replace-only, zero history growth -----
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page);
    const historyBefore = await page.evaluate(() => history.length);
    await pressJ(page, 7); // several MORE rows — a single settle-commit only, per FOCUS_SETTLE_MS
    const { slug: expectedSlug } = await focusedRowIndex(page); // focus itself is synchronous, not debounced
    // Poll for the settle-commit to reach THIS specific row (> the 180ms
    // FOCUS_SETTLE_MS window) — never merely "?entry= is non-null", which
    // `waitInteractiveViaProbe`'s own settle-commit (row 1) already made
    // true before this case even started.
    await poll(
      () => Promise.resolve(entryParam(page.url())),
      (e) => e === expectedSlug,
    );
    const historyAfter = await page.evaluate(() => history.length);
    const entry = entryParam(page.url());
    const { slug: focusedSlug } = await focusedRowIndex(page);
    check(
      "preview-follow zero history growth across an 8-row j-scan",
      historyAfter === historyBefore,
    );
    check(
      "preview-follow commits ?entry= for the LAST focused row via replace",
      entry !== null && entry === focusedSlug,
      `entry=${String(entry)} focused=${String(focusedSlug)}`,
    );
    await context.close();
  }

  // --- Case: wheel-scroll unmounts the focused row, next j/k resumes ------
  // (no snap-to-top) ---------------------------------------------------
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page);
    await pressJ(page, 9);
    const before = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    check("the 10-row j-scan lands real focus before the wheel-scroll", before.slug !== null);
    // Scroll far enough that row 10's anchor unmounts (overscan is 20 rows
    // either side, ~24px pitch — comfortably clears that window); a couple
    // of separate wheel dispatches rather than one giant delta (steadier
    // under Playwright's own wheel-event coalescing than a single huge
    // scroll), then a real settle wait before polling.
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(150);
    await page.mouse.wheel(0, 3000);
    const afterWheel = await poll(
      () =>
        page.evaluate(
          () => document.activeElement === document.body || document.activeElement === null,
        ),
      (unmounted) => unmounted,
      8000,
    );
    await page.keyboard.press("j");
    // scrollToIndex -> mount -> focus-after-mount effect; poll rather than a
    // fixed sleep, same reasoning as `poll()`'s own comment.
    const after = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    check(
      "wheel-scroll moves focus off the row (unmount), confirming the race this case covers",
      afterWheel,
    );
    check(
      "next j/k RESUMES from the persisted slug, not row 1 (no snap-to-top)",
      before.index !== null && after.index === before.index + 1,
      `before=${String(before.index)} after=${String(after.index)}`,
    );
    await context.close();
  }

  // --- Case: wheel-back REMOUNT of the focused row never yanks scroll -----
  // (orchestrator review): the focus-after-mount effect fires the moment the
  // persisted row re-enters the OVERSCAN range on a wheel-scroll BACK toward
  // it — at which point the row is mounted but still up to OVERSCAN×pitch
  // (~480px) OUTSIDE the viewport. A bare `.focus()` there makes the browser
  // scroll the anchor into view — a sudden jump out of the user's hands
  // mid-gesture. `focusAnchorForSlug`'s `preventScroll: true` is the fix;
  // this case drives the exact scenario: focus a row near the top, wheel far
  // away (unmount), wheel back UP in small steps past its position, and
  // assert every step's scroll delta is (a) never AGAINST the wheel
  // direction and (b) never larger than the wheel step itself (the pre-fix
  // yank is the whole remount-to-viewport distance, ~480-720px in one step —
  // far beyond the threshold); then a j-press still resumes from the
  // persisted slug.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page);
    await pressJ(page, 9); // row 10 — near the top, in-view at scrollY 0
    const before = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    check("wheel-back case: the j-scan lands real focus first", before.slug !== null);
    // Far enough down that row 10 unmounts (clears the 20-row overscan).
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(150);
    await page.mouse.wheel(0, 3000);
    await poll(
      () =>
        page.evaluate(
          () => document.activeElement === document.body || document.activeElement === null,
        ),
      (unmounted) => unmounted,
      8000,
    );
    // Slow wheel BACK UP past the row's position, watching scrollY at every
    // step. `WHEEL_STEP` is a realistic per-gesture scroll; the assertion
    // threshold leaves slack for engine rounding but sits far below the
    // pre-fix yank magnitude.
    const WHEEL_STEP = 240;
    const MAX_DELTA = WHEEL_STEP + 150;
    let prevY = await page.evaluate(() => window.scrollY);
    let monotonic = true;
    let maxObservedDelta = 0;
    for (let step = 0; step < 60 && prevY > 0; step++) {
      await page.mouse.wheel(0, -WHEEL_STEP);
      await page.waitForTimeout(60);
      const y = await page.evaluate(() => window.scrollY);
      const delta = prevY - y; // positive = moved up (with the gesture)
      if (delta < 0) monotonic = false; // moved DOWN against an up-wheel
      if (Math.abs(delta) > maxObservedDelta) maxObservedDelta = Math.abs(delta);
      prevY = y;
    }
    check("wheel-back remount: scroll never moves AGAINST the wheel direction", monotonic);
    check(
      "wheel-back remount: no per-step jump beyond the wheel step (no focus yank)",
      maxObservedDelta <= MAX_DELTA,
      `maxObservedDelta=${maxObservedDelta} (allowed ${MAX_DELTA})`,
    );
    // (b) — the persisted slug still owns the position: the next j resumes
    // from it, not row 1.
    await page.keyboard.press("j");
    const resumed = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null && r.slug !== before.slug,
    );
    check(
      "wheel-back remount: a subsequent j still resumes from the persisted slug",
      before.index !== null && resumed.index === before.index + 1,
      `before=${String(before.index)} resumed=${String(resumed.index)}`,
    );
    await context.close();
  }

  // --- Case: deep-link ?entry= centers the row post-mount ------------------
  // (fresh arrival — no scroll-restoration entry exists yet for this URL)
  // `deepLinkSlug` (~85% depth, discovered above) is the fixture-scaled
  // analog of the spec's "~row 7000 of ~8485" (~82% depth).
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const res = await page.goto(`${BASE}/ritual?entry=${deepLinkSlug}`, { waitUntil: "load" });
    const ssrHtml = (await res?.text()) ?? "";
    check(
      "gate D — the entry pane SSRs server-side (not a client-only fetch flash)",
      ssrHtml.includes("codex-entry-pane") && ssrHtml.includes("codex-entity-page"),
    );
    await page.waitForTimeout(600); // post-mount scrollToIndex(align:"center") + reconcile
    const box = await page.locator(`[data-entry-slug="${deepLinkSlug}"]`).boundingBox();
    check(
      "the deep-linked row is MOUNTED and scrolled into the viewport post-mount",
      box !== null && box.y >= 0 && box.y <= VIEWPORT.height,
      box ? `y=${box.y}` : "not mounted",
    );
    await context.close();
  }

  // --- Case: scroll-deep, then a tab RELOAD still shows real rows ---------
  // (no blank-spacer flash beyond one frame — gate E)
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page); // hydration done before trusting any scroll-restoration behavior below
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(200);
    const scrollBeforeReload = await page.evaluate(() => window.scrollY);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(300); // the D29-84 mount-sync layout effect settles within ~1 frame; a generous margin here
    const scrollAfterReload = await page.evaluate(() => window.scrollY);
    const realRowNear = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".codex-listing-row"));
      return rows.some((r) => {
        const rect = r.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });
    });
    check(
      // A generous tolerance (~8 rows): the invariant gate E actually cares
      // about is "restores to the SAME AREA with real rows" (the very next
      // check), not byte-exact pixels — some single-digit-row drift is
      // possible depending on exactly when `pagehide`'s own scroll snapshot
      // fires relative to any in-flight layout settling.
      "reload restores the same deep scroll position (within ~8 rows)",
      Math.abs(scrollAfterReload - scrollBeforeReload) < 200,
      `before=${scrollBeforeReload} after=${scrollAfterReload}`,
    );
    check("reload shows REAL rows in the restored viewport, not blank spacer", realRowNear);
    await context.close();
  }

  // --- Case: row-body click selects (D29-90) -------------------------------
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    // Playwright's own `.click()` auto-waits for the element to be
    // ACTIONABLE (visible/stable) — that's true of SSR'd markup well before
    // React hydrates and attaches `onClick`, so a click fired too early
    // would just hit the DOM with nothing listening. Same hydration-race
    // class `waitInteractiveViaProbe` exists for — see its own comment.
    await waitInteractiveViaProbe(page);
    const row = page.locator(".codex-listing-row").nth(2);
    const slug = await row.locator(".codex-listing-name").getAttribute("data-entry-slug");
    // Click the SOURCE cell — never the name anchor — the whole-row target.
    await row.locator(".codex-listing-col-source").click();
    await page.waitForTimeout(100);
    const entry = entryParam(page.url());
    const { slug: focusedSlug } = await focusedRowIndex(page);
    check(
      "a click on a non-anchor cell selects the row (?entry= updates)",
      entry === slug,
      `entry=${String(entry)} expected=${String(slug)}`,
    );
    check(
      "focus moves to the clicked row's name anchor (j/k continues from here)",
      focusedSlug === slug,
    );
    await context.close();
  }

  // --- Case: a text-selection drag does NOT select the row -----------------
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page);
    const row = page.locator(".codex-listing-row").nth(3);
    const cell = row.locator(".codex-listing-col-source");
    const box = await cell.boundingBox();
    if (!box) throw new Error("source cell not mounted");
    const entryBefore = entryParam(page.url());
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const selectionCollapsed = await page.evaluate(
      () => window.getSelection()?.isCollapsed ?? true,
    );
    const entryAfter = entryParam(page.url());
    check("the mouse drag actually produced a real text selection", !selectionCollapsed);
    check(
      "concluding a text-selection drag on a row does NOT select it",
      entryAfter === entryBefore,
      `before=${String(entryBefore)} after=${String(entryAfter)}`,
    );
    await context.close();
  }

  // --- Case: a ctrl/cmd-click on the NAME ANCHOR still opens a new tab ----
  // (the D29-90 tr handler must YIELD — target-inside-<a> guard) -----------
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${BASE}/ritual`, { waitUntil: "load" });
    await page.locator(".codex-listing-row").first().waitFor();
    await waitInteractiveViaProbe(page);
    const anchor = page.locator(".codex-listing-name").first();
    const slug = await anchor.getAttribute("data-entry-slug");
    const entryBefore = entryParam(page.url());
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 3000 }).catch(() => null),
      anchor.click({ modifiers: [modifier] }),
    ]);
    await page.waitForTimeout(100);
    const entryAfter = entryParam(page.url());
    check(
      "modifier-click opens a NEW TAB (native default survives — the row/name handlers yielded)",
      popup !== null,
    );
    check(
      "the CURRENT page never intercepted the modified click into ?entry=",
      entryAfter === entryBefore,
      `before=${String(entryBefore)} after=${String(entryAfter)} slug=${String(slug)}`,
    );
    if (popup) await popup.close();
    await context.close();
  }
} finally {
  await browser.close();
  await server.close(true);
}

if (failures > 0) {
  console.error(`\nvirtualization interaction guard: ${failures} case(s) failed`);
  process.exit(1);
}
console.log("\nvirtualization interaction guard passed — all gate C/D/E cases green");
