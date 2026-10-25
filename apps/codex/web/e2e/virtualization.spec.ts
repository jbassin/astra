/**
 * Listing virtualization and the filter pane, in real Chromium: real scroll, wheel events,
 * keyboard-versus-synthetic-click `detail`, and `window.scrollTo` timing against the router's
 * pre-hydration scroll-restoration script. None of it is observable in jsdom.
 *
 * Every case drives `/ritual`. The fixture corpus grows it to 96 rows with synthetic
 * `ritual/virt-*` rows (`SYNTHETIC_ROWS` in the ingest package's `fixtureCorpus.ts`) so it
 * clears `SSR_WINDOW` (60, `virtualization.ts`); every other fixture category has at most 7
 * rows. Every fourth synthetic row is a Legacy ritual, so the listing shows both editions and
 * the Edition facet has something to narrow. The cases read the row count off
 * `aria-rowcount` and discover their deep-link slug, so they also pass against the real corpus.
 *
 * Each `test` is one case; each `check` step inside it is one assertion.
 */
import {
  DESKTOP_VIEWPORT,
  check,
  entryParam,
  expect,
  focusedRowIndex,
  openRitualInteractive,
  poll,
  pressJ,
  test,
} from "./fixtures";

test.use({ viewport: DESKTOP_VIEWPORT });

test.describe("listing virtualization", () => {
  test("precondition: /ritual has more rows than the SSR window", async ({ ritualDiscovery }) => {
    await check("precondition — /ritual has > SSR_WINDOW=60 rows to drive this guard", () =>
      expect.soft(ritualDiscovery.totalRows, "aria-rowcount").toBeGreaterThan(60),
    );
  });

  // A large j-burst right after load, before the post-hydration full-array fetch lands, must
  // not throw or hang while only the 60-row SSR window is loaded: presses past the window are
  // same-index no-ops during that burst. A second burst after settling must reach the true
  // last row, past SSR_WINDOW.
  test("cold-load frontier j-burst", async ({ page, ritualDiscovery }) => {
    const { totalRows } = ritualDiscovery;
    await openRitualInteractive(page);
    await pressJ(page, totalRows + 14);
    await page.waitForTimeout(500); // let the background full-array fetch land
    await pressJ(page, totalRows + 15);
    await page.waitForTimeout(300);
    const { index } = await focusedRowIndex(page);
    await check("cold-load frontier j-burst reaches the true last row (past SSR_WINDOW=60)", () =>
      expect.soft(index).toBe(totalRows),
    );
  });

  test("Enter opens the focused row", async ({ page }) => {
    await openRitualInteractive(page);
    await pressJ(page, 2);
    const focused = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    await check("j-scan lands real focus before Enter is pressed", () =>
      expect.soft(focused.slug).not.toBeNull(),
    );
    await page.keyboard.press("Enter");
    await check("Enter fully navigates off the listing to the entity page", () =>
      page.waitForURL(/\/ritual\/[^/?]+$/, { timeout: 5000 }),
    );
  });

  test("preview follows focus, replace-only", async ({ page }) => {
    await openRitualInteractive(page);
    const historyBefore = await page.evaluate(() => history.length);
    await pressJ(page, 7); // several more rows: one settle-commit only
    const { slug: expectedSlug } = await focusedRowIndex(page); // focus itself is synchronous
    // Wait for the settle-commit of this row, not just any `?entry=`: the probe's own
    // commit (row 1) already set one.
    await poll(
      () => Promise.resolve(entryParam(page.url())),
      (e) => e === expectedSlug,
    );
    const historyAfter = await page.evaluate(() => history.length);
    const entry = entryParam(page.url());
    const { slug: focusedSlug } = await focusedRowIndex(page);
    await check("preview-follow zero history growth across an 8-row j-scan", () =>
      expect.soft(historyAfter).toBe(historyBefore),
    );
    await check("preview-follow commits ?entry= for the LAST focused row via replace", () => {
      expect.soft(entry).not.toBeNull();
      expect.soft(entry).toBe(focusedSlug);
    });
  });

  test("wheel-scroll unmounts the focused row; the next j resumes", async ({ page }) => {
    await openRitualInteractive(page);
    await pressJ(page, 9);
    const before = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    await check("the 10-row j-scan lands real focus before the wheel-scroll", () =>
      expect.soft(before.slug).not.toBeNull(),
    );
    // Far enough that row 10 unmounts (20 rows of overscan at a 24px pitch). Two wheel
    // dispatches are steadier under Playwright's wheel coalescing than one huge delta.
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
    // scrollToIndex, then mount, then the focus-after-mount effect.
    const after = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    await check(
      "wheel-scroll moves focus off the row (unmount), confirming the race this case covers",
      () => expect.soft(afterWheel).toBe(true),
    );
    await check("next j/k RESUMES from the persisted slug, not row 1 (no snap-to-top)", () => {
      expect.soft(before.index).not.toBeNull();
      expect.soft(after.index).toBe((before.index ?? Number.NaN) + 1);
    });
  });

  // The focus-after-mount effect fires as soon as the persisted row re-enters the overscan
  // range on a wheel back toward it, while the row is still up to ~480px outside the
  // viewport. A bare `.focus()` there would scroll the anchor into view mid-gesture;
  // `focusAnchorForSlug` passes `preventScroll: true`. Wheel back up in small steps: no step
  // may move against the wheel or jump further than the step itself (the yank this prevents
  // is the whole remount-to-viewport distance in one step).
  test("wheel-back remount never yanks scroll", async ({ page }) => {
    await openRitualInteractive(page);
    await pressJ(page, 9); // row 10: near the top, in view at scrollY 0
    const before = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    await check("wheel-back case: the j-scan lands real focus first", () =>
      expect.soft(before.slug).not.toBeNull(),
    );
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
    // A realistic per-gesture step; the threshold leaves slack for engine rounding.
    const WHEEL_STEP = 240;
    const MAX_DELTA = WHEEL_STEP + 150;
    let prevY = await page.evaluate(() => window.scrollY);
    let monotonic = true;
    let maxObservedDelta = 0;
    for (let step = 0; step < 60 && prevY > 0; step++) {
      await page.mouse.wheel(0, -WHEEL_STEP);
      await page.waitForTimeout(60);
      const y = await page.evaluate(() => window.scrollY);
      const delta = prevY - y; // positive = moved up, with the gesture
      if (delta < 0) monotonic = false;
      if (Math.abs(delta) > maxObservedDelta) maxObservedDelta = Math.abs(delta);
      prevY = y;
    }
    await check("wheel-back remount: scroll never moves AGAINST the wheel direction", () =>
      expect.soft(monotonic).toBe(true),
    );
    await check("wheel-back remount: no per-step jump beyond the wheel step (no focus yank)", () =>
      expect.soft(maxObservedDelta, `allowed ${MAX_DELTA}`).toBeLessThanOrEqual(MAX_DELTA),
    );
    await page.keyboard.press("j");
    const resumed = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null && r.slug !== before.slug,
    );
    await check("wheel-back remount: a subsequent j still resumes from the persisted slug", () => {
      expect.soft(before.index).not.toBeNull();
      expect.soft(resumed.index).toBe((before.index ?? Number.NaN) + 1);
    });
  });

  // A fresh arrival: no scroll-restoration entry exists for this URL yet.
  test("deep-link ?entry= centers the row after mount", async ({ page, ritualDiscovery }) => {
    const { deepLinkSlug } = ritualDiscovery;
    const res = await page.goto(`/ritual?entry=${deepLinkSlug}`, { waitUntil: "load" });
    const ssrHtml = (await res?.text()) ?? "";
    await check("the entry pane SSRs server-side (not a client-only fetch flash)", () => {
      expect.soft(ssrHtml).toContain("codex-entry-pane");
      expect.soft(ssrHtml).toContain("codex-entity-page");
    });
    await page.waitForTimeout(600); // post-mount scrollToIndex(align: "center") and reconcile
    const box = await page.locator(`[data-entry-slug="${deepLinkSlug}"]`).boundingBox();
    await check("the deep-linked row is MOUNTED and scrolled into the viewport post-mount", () => {
      expect.soft(box, "not mounted").not.toBeNull();
      expect.soft(box?.y).toBeGreaterThanOrEqual(0);
      expect.soft(box?.y).toBeLessThanOrEqual(DESKTOP_VIEWPORT.height);
    });
  });

  // No blank-spacer flash beyond one frame after a reload deep in the list.
  test("scroll deep, then reload, still shows real rows", async ({ page }) => {
    await openRitualInteractive(page);
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(200);
    const scrollBeforeReload = await page.evaluate(() => window.scrollY);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(300); // the mount-sync layout effect settles within about a frame
    const scrollAfterReload = await page.evaluate(() => window.scrollY);
    const realRowNear = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".codex-listing-row"));
      return rows.some((r) => {
        const rect = r.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });
    });
    // About 8 rows of tolerance: what matters is the same area with real rows, and the
    // `pagehide` scroll snapshot can land a few rows off during layout settling.
    await check("reload restores the same deep scroll position (within ~8 rows)", () =>
      expect
        .soft(
          Math.abs(scrollAfterReload - scrollBeforeReload),
          `before=${scrollBeforeReload} after=${scrollAfterReload}`,
        )
        .toBeLessThan(200),
    );
    await check("reload shows REAL rows in the restored viewport, not blank spacer", () =>
      expect.soft(realRowNear).toBe(true),
    );
  });

  test("a row-body click selects the row", async ({ page }) => {
    // A locator click waits only for actionability, which SSR markup has before React
    // attaches `onClick`; openRitualInteractive waits for hydration first.
    await openRitualInteractive(page);
    const row = page.locator(".codex-listing-row").nth(2);
    const slug = await row.locator(".codex-listing-name").getAttribute("data-entry-slug");
    // The source cell, never the name anchor: the whole row is the target.
    await row.locator(".codex-listing-col-source").click();
    await page.waitForTimeout(100);
    const entry = entryParam(page.url());
    const { slug: focusedSlug } = await focusedRowIndex(page);
    await check("a click on a non-anchor cell selects the row (?entry= updates)", () =>
      expect.soft(entry).toBe(slug),
    );
    await check("focus moves to the clicked row's name anchor (j/k continues from here)", () =>
      expect.soft(focusedSlug).toBe(slug),
    );
  });

  test("a text-selection drag does not select the row", async ({ page }) => {
    await openRitualInteractive(page);
    const cell = page.locator(".codex-listing-row").nth(3).locator(".codex-listing-col-source");
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
    await check("the mouse drag actually produced a real text selection", () =>
      expect.soft(selectionCollapsed).toBe(false),
    );
    await check("concluding a text-selection drag on a row does NOT select it", () =>
      expect.soft(entryAfter).toBe(entryBefore),
    );
  });

  // The row's click handler must yield when the target is inside the anchor.
  test("a modifier-click on the name anchor still opens a new tab", async ({ page, context }) => {
    await openRitualInteractive(page);
    const anchor = page.locator(".codex-listing-name").first();
    const entryBefore = entryParam(page.url());
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 3000 }).catch(() => null),
      anchor.click({ modifiers: [modifier] }),
    ]);
    await page.waitForTimeout(100);
    const entryAfter = entryParam(page.url());
    await check(
      "modifier-click opens a NEW TAB (native default survives — the row/name handlers yielded)",
      () => expect.soft(popup).not.toBeNull(),
    );
    await check("the CURRENT page never intercepted the modified click into ?entry=", () =>
      expect.soft(entryAfter).toBe(entryBefore),
    );
    if (popup) await popup.close();
  });
});

// The filter pane on the two-column tier, and the bottom sheet on the narrow tier. jsdom can't
// drive `<dialog>`'s native Escape-to-cancel or show the absence of a scroll jump.
test.describe("filter pane", () => {
  test("opening the pane doesn't move the listing's scroll", async ({ page }) => {
    await openRitualInteractive(page);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(150);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const filtersButton = page.getByRole("button", { name: /^Filters/ });
    // An in-page click: a locator click would first scroll the (non-sticky) header button into
    // view, which is the very movement this case measures.
    await filtersButton.evaluate((el) => (el as HTMLElement).click());
    await page.locator(".codex-filter-pane").waitFor();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    await check(
      "opening Filters on the two-column tier swaps in .codex-filter-pane (no <dialog> modal)",
      async () => expect.soft(await page.locator(".codex-filter-pane").isVisible()).toBe(true),
    );
    await check("opening the pane never moves the listing's own window scroll position", () =>
      expect
        .soft(Math.abs(scrollAfter - scrollBefore), `before=${scrollBefore} after=${scrollAfter}`)
        .toBeLessThan(4),
    );
    await check("the Filters button reflects aria-expanded=true while the pane is open", async () =>
      expect.soft(await filtersButton.getAttribute("aria-expanded")).toBe("true"),
    );
    const closeButton = page.getByRole("button", { name: "Close filters" });
    await check("opening the pane moves focus onto its own ✕ button", async () =>
      expect.soft(await closeButton.evaluate((el) => el === document.activeElement)).toBe(true),
    );
  });

  test("toggling a facet inside the pane narrows the listing live", async ({ page }) => {
    await openRitualInteractive(page);
    const countBefore = await page.locator(".codex-listing-count").textContent();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.locator(".codex-filter-pane").waitFor();
    // The Edition chips are always present, but toggling one narrows the listing only when
    // the visible rows carry both editions; check that shape first, so a fixture regression
    // fails here with a clear reason.
    const editionChips = page
      .locator(".codex-filter-pane .codex-toggle-chip")
      .filter({ hasText: /Remaster|Legacy/ });
    const editionChipCount = await editionChips.count();
    await check(
      "precondition — /ritual's visible rows carry both editions (two Edition chips)",
      () => expect.soft(editionChipCount, "edition chips").toBeGreaterThanOrEqual(2),
    );
    await editionChips.first().click();
    await page.waitForTimeout(200);
    const countAfter = await page.locator(".codex-listing-count").textContent();
    await check("toggling a facet inside the open pane updates the toolbar count row live", () =>
      expect.soft(countAfter).not.toBe(countBefore),
    );
  });

  test("a row click while filtering closes the pane and shows the preview", async ({ page }) => {
    await openRitualInteractive(page);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.locator(".codex-filter-pane").waitFor();
    const name = page.locator(".codex-listing-row").nth(4).locator(".codex-listing-name");
    const slug = await name.getAttribute("data-entry-slug");
    await name.click();
    await page.waitForTimeout(150);
    await check("row click while filtering closes the pane", async () =>
      expect.soft(await page.locator(".codex-filter-pane").isVisible()).toBe(false),
    );
    await check("...and shows that entry's preview instead", async () => {
      expect.soft(entryParam(page.url())).toBe(slug);
      expect.soft(await page.locator(".codex-entry-pane-content").isVisible()).toBe(true);
    });
  });

  test("j/k is inert inside the pane and normal from the list", async ({ page }) => {
    await openRitualInteractive(page); // lands row 1
    const filtersButton = page.getByRole("button", { name: /^Filters/ });
    await filtersButton.click();
    await page.locator(".codex-filter-pane").waitFor();
    const closeButton = page.getByRole("button", { name: "Close filters" });
    const closeFocused = () => closeButton.evaluate((el) => el === document.activeElement);
    await check("focus lands on the pane's ✕ at open", async () =>
      expect.soft(await closeFocused()).toBe(true),
    );
    await page.keyboard.press("j");
    await check(
      "j/k with focus inside the pane is inert (focus stays on ✕, no row stole it)",
      async () => expect.soft(await closeFocused()).toBe(true),
    );
    await page.keyboard.press("Escape");
    await check("Esc (pane, no OptionSearch expanded) closes the pane", () =>
      page.locator(".codex-filter-pane").waitFor({ state: "detached" }),
    );
    await check("closing returns focus to the Filters button", async () =>
      expect.soft(await filtersButton.evaluate((el) => el === document.activeElement)).toBe(true),
    );
    // From the list side, j moves the selection and does not reopen the pane.
    await page.keyboard.press("j");
    const { slug } = await poll(
      () => focusedRowIndex(page),
      (r) => r.slug !== null,
    );
    await check("j/k from the list moves real focus and does not swap in the pane", async () => {
      expect.soft(slug).not.toBeNull();
      expect.soft(await page.locator(".codex-filter-pane").isVisible()).toBe(false);
    });
  });

  test("Esc collapses an expanded OptionSearch before closing the pane", async ({ page }) => {
    await openRitualInteractive(page);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.locator(".codex-filter-pane").waitFor();
    const searchToggle = page.locator(".codex-filter-pane .codex-option-search-toggle").first();
    test.skip(
      (await searchToggle.count()) === 0,
      "no OptionSearch cleared the threshold on this category",
    );
    await searchToggle.click();
    const input = page.locator(".codex-filter-pane .codex-option-search-input").first();
    await input.waitFor();
    await input.focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await check("first Esc collapses the expanded OptionSearch, pane stays open", async () => {
      expect
        .soft(await page.locator(".codex-filter-pane .codex-option-search-input").count())
        .toBe(0);
      expect.soft(await page.locator(".codex-filter-pane").isVisible()).toBe(true);
    });
    await page.keyboard.press("Escape");
    await check("second Esc closes the pane", () =>
      page.locator(".codex-filter-pane").waitFor({ state: "detached" }),
    );
  });

  // The pane's Superseded toggle and the toolbar's reveal write through the same handler with
  // `resetScroll: false`, so they must land at the same scroll position. Revealing a run of
  // superseded rows while scrolled deep does move scrollY by a few hundred px through either
  // control (ordinary reflow); a `resetScroll: true` divergence would snap one of them back
  // toward 0, so this compares the two rather than asserting no movement.
  test("the pane's Superseded toggle has scroll parity with the toolbar reveal", async ({
    browser,
    baseURL,
  }) => {
    async function scrollAfterSupersededToggle(via: "pane" | "toolbar"): Promise<number | null> {
      const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT, baseURL });
      try {
        const page = await context.newPage();
        await openRitualInteractive(page);
        await page.evaluate(() => window.scrollTo(0, 1200));
        await page.waitForTimeout(150);
        let control;
        if (via === "pane") {
          // In-page click, for the same reason as the pane-open case.
          await page
            .getByRole("button", { name: /^Filters/ })
            .evaluate((el) => (el as HTMLElement).click());
          await page.locator(".codex-filter-pane").waitFor();
          control = page.getByLabel("Include superseded content");
        } else {
          control = page.locator(".codex-rules-superseded-toggle").first();
        }
        if ((await control.count()) === 0) return null;
        await control.evaluate((el) => (el as HTMLElement).click());
        await page.waitForTimeout(200);
        return await page.evaluate(() => window.scrollY);
      } finally {
        await context.close();
      }
    }

    const viaPane = await scrollAfterSupersededToggle("pane");
    const viaToolbar = await scrollAfterSupersededToggle("toolbar");
    test.skip(viaPane === null || viaToolbar === null, "/ritual has no superseded rows to reveal");
    await check(
      "the pane's Superseded toggle has scroll PARITY with the toolbar reveal (behavioral identity)",
      () =>
        expect
          .soft(
            Math.abs((viaPane ?? 0) - (viaToolbar ?? 0)),
            `viaPane=${viaPane} viaToolbar=${viaToolbar}`,
          )
          .toBeLessThan(4),
    );
  });

  test("crossing to the narrow tier while open closes the pane", async ({ page }) => {
    await openRitualInteractive(page);
    const filtersButton = page.getByRole("button", { name: /^Filters/ });
    await filtersButton.click();
    await page.locator(".codex-filter-pane").waitFor();
    // Below the 56.0625rem (~897px) split-view breakpoint.
    await page.setViewportSize({ width: 500, height: 900 });
    await page.waitForTimeout(300);
    await check(
      "narrowing the viewport past the split-view breakpoint while open closes the panel",
      async () => {
        expect.soft(await page.locator(".codex-filter-pane").isVisible()).toBe(false);
        expect.soft(await filtersButton.getAttribute("aria-expanded")).toBe("false");
      },
    );
  });

  test.describe("narrow tier", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the narrow tier gets the bottom sheet, not the pane", async ({ page }) => {
      await page.goto("/ritual", { waitUntil: "load" });
      await page.locator(".codex-listing-row").first().waitFor();
      await page.getByRole("button", { name: /^Filters/ }).click();
      await page.locator(".codex-filter-drawer[open]").waitFor();
      await check(
        "the narrow (390px) tier opens the <dialog> sheet, not .codex-filter-pane",
        async () => expect.soft(await page.locator(".codex-filter-pane").isVisible()).toBe(false),
      );
      await check("...and the sheet's sticky footer Done button is present", async () =>
        expect.soft(await page.getByRole("button", { name: "Done" }).isVisible()).toBe(true),
      );
    });
  });
});
