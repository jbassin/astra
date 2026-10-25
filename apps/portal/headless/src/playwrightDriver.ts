/**
 * The real Chromium `PageAdapter` — one warm, persistent
 * page for process life (vellum-render's browser-lifecycle pattern, `--no-sandbox`),
 * driving the actual Foundry v13.351 `/join` mechanics verified in the scope doc
 * (`thoughts/archive/research/2026-07-08-headless-gm-0027-thoughts.md`, read from
 * the live server's own `scripts/foundry.mjs`). Deliberately thin and NOT exercised in
 * unit CI (no Chromium there, mirroring vellum-render) — all the branching logic lives
 * in `supervisor.ts`, which IS unit-tested via a fake `PageAdapter`. Verify the DOM
 * selectors below against a live world (the scope doc's own "not verified" section:
 * the `/join` network shape is source-proven, its exact select-element markup is not).
 */
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

import type { PageAdapter, PageClassification } from "./supervisor";

export interface PlaywrightDriverOptions {
  /** The Foundry origin to navigate to (the public edge, e.g.
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
    // recovery) — an ephemeral profile per launch, so there's never a stale
    // localStorage to worry about; the noCanvas seed below still runs fresh every time
    // because it must be re-seeded on every (re)launch.
    await teardown();
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    // Playwright's default 1280x720 is below Foundry's 1366x768 minimum (it logs a
    // loud console error and disclaims feature breakage below that).
    context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    // Seed core.noCanvas=true BEFORE any page script runs, via an init script —
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
    // Re-emit warn/error console lines through the supervisor's own telemetry —
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
    let path = new URL(p.url()).pathname;
    if (path === "/join") return "join";
    // In-world is identified POSITIVELY (Foundry's in-world route is /game) — never by
    // elimination, so an unexpected landing page can't masquerade as healthy in /health.
    if (path === "/game") return "in-world";
    // Anything else can be a STALE DOM: a server outage/restart tears the client off
    // /game onto a page whose socket is dead, and nothing server-side can ever navigate
    // it again (Foundry pushes only reach live sockets) — passively classifying it
    // would report world-down forever while the world is actually back (observed live,
    // 2026-07-09: the acceptance-E container bounce). Re-navigate so the classification
    // reflects the server's CURRENT state; if the server is unreachable this goto
    // throws → the supervisor maps it to `broken` → bounded relaunch backoff (the
    // tested unreachable-origin path). A plain GET of the origin is read-only —
    // the "never interfere with /setup" rule is untouched.
    await p.goto(opts.origin, { waitUntil: "load" });
    path = new URL(p.url()).pathname;
    if (path === "/join") return "join";
    if (path === "/game") return "in-world";
    // /setup, /auth, and / (a shut-down world's post-redirect landing page,
    // per the scope doc) all mean "the world isn't up" — back off, never interfere.
    if (path === "/setup" || path === "/auth" || path === "/") return "world-down";
    // Belt-and-suspenders DOM probe for the rarer
    // case a redirect lands somewhere unexpected but the join form is still present.
    const joinFormVisible = (await p.locator(JOIN_FORM_SELECTOR).count()) > 0;
    // Unknown page, no join form → world-down (safe backoff + re-probe): with
    // the join UI absent, classifying it in-world would idle forever on e.g. an
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

    // The password is passed as a page.evaluate argument (typed/POSTed inside
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
