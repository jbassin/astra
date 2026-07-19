// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (`vitest.config.ts`); this file
// needs a real DOM (`fireEvent`, `document.body`), so it opts into jsdom
// per-file (same convention as `HeaderNav.test.tsx`).
//
// D29-105a (S3) — ZERO prior coverage existed for `Popover.tsx`. Per the
// spec: computed `pointer-events` is NOT assertable here (`globals.css`
// never loads under jsdom/vitest) — every assertion below is class-based or
// behavioral (DOM presence, `.active-popover` toggling, timer-driven
// open/close), never a computed style. `fetch` is hand-mocked as a plain
// duck-typed object (not the real `Response`/`Headers` classes, which are
// not guaranteed present under vitest's jsdom environment) so these tests
// don't depend on which fetch polyfill (if any) the environment supplies.

import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initPopovers } from "./Popover";

/** A minimal stand-in for the fetched target page's SSR HTML — just enough
 * shape (`.popover-hint` wrapper, a `.codex-entity-name` h1) to exercise the
 * clone-and-extract path `Popover.tsx` actually runs, and to prove the B1
 * case the spec's review flagged: the cloned title must survive into the
 * popover, never get stripped. */
const POPOVER_HTML = `<article class="popover-hint">
  <h1 class="codex-entity-name">Test Entity</h1>
  <p>Body copy for the hover preview.</p>
</article>`;

/** Duck-typed `Response` — only the members `fetchCanonical`/`onEnter`
 * actually call (`headers.get`, `clone`, `text`). Avoids any dependency on
 * a real `Response`/`Headers` global existing under jsdom. */
function fakeHtmlResponse(html: string): Response {
  const headers = {
    get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null),
  };
  const response = {
    headers,
    clone: () => response,
    text: () => Promise.resolve(html),
  };
  return response as unknown as Response;
}

function stubFetch(html: string = POPOVER_HTML) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(fakeHtmlResponse(html))),
  );
}

/** Flushes the pending fetch/parse microtask chain `onEnter` runs before it
 * ever touches a timer — real `setTimeout(…, 0)`, called BEFORE
 * `vi.useFakeTimers()` in every test below, so it isn't itself faked. */
function flushFetch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountTrigger(): HTMLAnchorElement {
  document.body.innerHTML = '<a data-crossref="" href="/target">Target</a>';
  return document.querySelector("a") as HTMLAnchorElement;
}

describe("initPopovers (D29-105a — grace-delay close + panel hover bridge)", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("hovering a crossref link opens the popover with a visible title (the B1 case)", async () => {
    stubFetch();
    const link = mountTrigger();
    const cleanup = initPopovers();

    fireEvent.mouseEnter(link, { clientX: 5, clientY: 5 });
    await flushFetch();

    const popover = document.getElementById(`popover-${link.pathname}`);
    expect(popover).not.toBeNull();
    expect(popover?.classList.contains("active-popover")).toBe(true);
    // the cloned page's h1 must survive — D29-105b's compact CSS scopes to
    // exactly this selector, and the review's headline catch was a draft
    // that would have deleted it site-wide.
    expect(popover?.querySelector(".codex-entity-name")?.textContent).toBe("Test Entity");

    cleanup();
  });

  it("leaving the trigger without reaching the panel closes only after the grace delay, not instantly", async () => {
    stubFetch();
    const link = mountTrigger();
    const cleanup = initPopovers();

    fireEvent.mouseEnter(link, { clientX: 5, clientY: 5 });
    await flushFetch();
    const popover = document.getElementById(`popover-${link.pathname}`) as HTMLElement;
    expect(popover.classList.contains("active-popover")).toBe(true);

    vi.useFakeTimers();
    fireEvent.mouseLeave(link);
    // still open immediately after mouseleave — the pre-D29-105a behavior
    // (instant `clearActivePopover()`, no timer at all) would fail this.
    expect(popover.classList.contains("active-popover")).toBe(true);
    vi.advanceTimersByTime(199);
    expect(popover.classList.contains("active-popover")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(popover.classList.contains("active-popover")).toBe(false);

    cleanup();
  });

  it("reaching the panel within the grace window cancels the close (the hover bridge)", async () => {
    stubFetch();
    const link = mountTrigger();
    const cleanup = initPopovers();

    fireEvent.mouseEnter(link, { clientX: 5, clientY: 5 });
    await flushFetch();
    const popover = document.getElementById(`popover-${link.pathname}`) as HTMLElement;
    expect(popover.classList.contains("active-popover")).toBe(true);

    vi.useFakeTimers();
    fireEvent.mouseLeave(link);
    vi.advanceTimersByTime(100); // partway through the grace window
    fireEvent.mouseEnter(popover); // the mouse reached the panel in time
    vi.advanceTimersByTime(5000); // well past the original window
    expect(popover.classList.contains("active-popover")).toBe(true);

    cleanup();
  });

  it("leaving the panel re-schedules the close, which then fires", async () => {
    stubFetch();
    const link = mountTrigger();
    const cleanup = initPopovers();

    fireEvent.mouseEnter(link, { clientX: 5, clientY: 5 });
    await flushFetch();
    const popover = document.getElementById(`popover-${link.pathname}`) as HTMLElement;

    vi.useFakeTimers();
    fireEvent.mouseLeave(link);
    fireEvent.mouseEnter(popover);
    expect(popover.classList.contains("active-popover")).toBe(true);

    fireEvent.mouseLeave(popover);
    expect(popover.classList.contains("active-popover")).toBe(true); // grace window, not instant
    vi.advanceTimersByTime(200);
    expect(popover.classList.contains("active-popover")).toBe(false);

    cleanup();
  });
});
