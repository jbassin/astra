/**
 * The real Chromium `PageAdapter` (spec 0027 D27-6/-7/-9/-10) — one warm, persistent
 * page for process life (vellum-render's browser-lifecycle pattern, `--no-sandbox`),
 * driving the actual Foundry v13.351 `/join` mechanics verified in the scope doc
 * (`thoughts/shared/research/2026-07-08-headless-gm-0027-thoughts.md` §2.3, read from
 * the live server's own `scripts/foundry.mjs`). Deliberately thin and NOT exercised in
 * unit CI (no Chromium there, mirroring vellum-render) — all the branching logic lives
 * in `supervisor.ts`, which IS unit-tested via a fake `PageAdapter`. Verify the DOM
 * selectors below live at S4 acceptance (the scope doc's own "not verified" section:
 * the `/join` network shape is source-proven, its exact select-element markup is not).
 */
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

import type { PageAdapter, PageClassification } from "./supervisor";

export interface PlaywrightDriverOptions {
  /** The Foundry origin to navigate to (D27-3 — the public edge, e.g.
   * `https://btl.iridi.cc`). */
  origin: string;
}

/** Foundry v13 `/join`'s user-select + submit markup (best-effort selectors — the
 * network contract `{userid,password,action:"join"} -> {redirect}` is the verified
 * part; these element queries are the unverified part, per the scope doc). */
const JOIN_FORM_SELECTOR = "#join-game, form#join-form, select[name=userid]";
const USER_SELECT_SELECTOR = "select[name=userid], select#userid";

export function createPlaywrightPageAdapter(opts: PlaywrightDriverOptions): PageAdapter {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let consoleCb: ((level: "warn" | "error", text: string) => void) | null = null;

  async function teardown(): Promise<void> {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    page = null;
    context = null;
    browser = null;
  }

  async function launch(): Promise<void> {
    // Full teardown-and-relaunch on every call (both the initial launch AND crash
    // recovery) — an ephemeral profile per launch (D27-10), so there's never a stale
    // localStorage to worry about; the noCanvas seed below still runs fresh every time
    // per D27-7's explicit "re-seeded on every (re)launch".
    await teardown();
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    context = await browser.newContext();
    // D27-7: seed core.noCanvas=true BEFORE any page script runs, via an init script —
    // this applies on every navigation in this context regardless of what a prior
    // session might have left in localStorage (moot here since the profile is
    // ephemeral, but it's the correct primitive either way: Canvas.initialize() reads
    // this at boot, so it must land before Foundry's own scripts execute).
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("core.noCanvas", "true");
      } catch {
        // Ignored — sticks once the page is actually same-origin, which is what
        // Canvas.initialize() reads.
      }
    });
    const p = await context.newPage();
    // D27-9: re-emit warn/error console lines through the supervisor's own telemetry —
    // nobody watches a headless devtools console, so this is the only way a
    // misconfigured bridge-user-id (which only logs a module warning) becomes visible.
    p.on("console", (msg) => {
      const type = msg.type();
      if (consoleCb && (type === "warning" || type === "error")) {
        consoleCb(type === "warning" ? "warn" : "error", msg.text());
      }
    });
    page = p;
    await p.goto(opts.origin, { waitUntil: "load" });
  }

  function currentPage(): Page {
    if (!page) throw new Error("portal-headless: page adapter used before launch()");
    return page;
  }

  async function classify(): Promise<PageClassification> {
    const p = currentPage();
    const path = new URL(p.url()).pathname;
    if (path === "/join") return "join";
    // In-world is identified POSITIVELY (Foundry's in-world route is /game) — never by
    // elimination, so an unexpected landing page can't masquerade as healthy in /health.
    if (path === "/game") return "in-world";
    // D27-6: /setup, /auth, and / (a shut-down world's post-redirect landing page,
    // scope doc §2.3) all mean "the world isn't up" — back off, never interfere.
    if (path === "/setup" || path === "/auth" || path === "/") return "world-down";
    // Belt-and-suspenders DOM probe (D27-6's "a couple of DOM probes") for the rarer
    // case a redirect lands somewhere unexpected but the join form is still present.
    const joinFormVisible = (await p.locator(JOIN_FORM_SELECTOR).count()) > 0;
    // Unknown page, no join form → world-down (safe backoff + re-probe), per D27-6's
    // "join UI absent" clause — classifying it in-world would idle forever on e.g. an
    // unexpected /license page while reporting healthy.
    return joinFormVisible ? "join" : "world-down";
  }

  async function login(username: string, password: string): Promise<void> {
    const p = currentPage();
    await p.waitForSelector(USER_SELECT_SELECTOR, { state: "attached" });
    const userId = await p
      .locator(USER_SELECT_SELECTOR)
      .locator("option")
      .filter({ hasText: username })
      .first()
      .getAttribute("value");
    if (!userId) {
      throw new Error(`no /join user-select option matches configured gm-username`);
    }

    // D27-14: the password is passed as a page.evaluate argument (typed/POSTed inside
    // the page, exactly like a human typing it) — never interpolated into a log line
    // or error message we construct.
    const redirect = await p.evaluate(
      async ([joinUserId, joinPassword]) => {
        const res = await fetch("/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userid: joinUserId, password: joinPassword, action: "join" }),
        });
        const json = (await res.json()) as { redirect?: string; error?: string };
        if (!res.ok || !json.redirect) {
          throw new Error(json.error ?? `/join responded ${res.status}`);
        }
        return json.redirect;
      },
      [userId, password] as const,
    );
    await p.goto(new URL(redirect, opts.origin).toString(), { waitUntil: "load" });
  }

  async function reload(): Promise<void> {
    await currentPage().reload({ waitUntil: "load" });
  }

  function isBrowserConnected(): boolean {
    return browser?.isConnected() ?? false;
  }

  function onConsole(cb: (level: "warn" | "error", text: string) => void): void {
    consoleCb = cb;
  }

  async function close(): Promise<void> {
    await teardown();
  }

  return { launch, classify, login, reload, isBrowserConnected, onConsole, close };
}
