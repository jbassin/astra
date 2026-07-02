import type { Browser } from "playwright";
import { chromium } from "playwright";

import { RENDER_LIMITS, type RenderRequest } from "./caps";
import { Semaphore } from "./semaphore";

/** Error carrying an HTTP status, for caps hit mid-render (SEC-4). */
export class RenderCapError extends Error {
  readonly status: number;
  constructor(message: string, status = 413) {
    super(message);
    this.name = "RenderCapError";
    this.status = status;
  }
}

/**
 * Warm-browser render service (OQ-1). Holds one Chromium for the life of the
 * process; each request gets a fresh, isolated context (per-request isolation),
 * with all network egress blocked except same-origin render assets (SEC-3) and
 * a concurrency gate in front of the shared browser (SEC-5). Ported verbatim
 * from faerrin pkg/vellum (now renders @astra/gothic's DocumentView via the
 * render-entry page).
 */
export class RenderService {
  private browser: Browser | null = null;
  private readonly gate: Semaphore;
  // Not a TS parameter property (`constructor(private readonly x, …)`) — Node's
  // `--experimental-strip-types` (R3, 0022 S9) only erases types, it doesn't emit
  // code, so a parameter property (which needs a real `this.x = x` assignment
  // generated) throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` when Node runs this file
  // directly (see [[weal-bot gateway.ts]], S5; discord-voice.ts, S8).
  private readonly baseUrl: string;

  constructor(baseUrl: string, concurrency = 2) {
    this.baseUrl = baseUrl;
    this.gate = new Semaphore(concurrency);
  }

  get queued(): number {
    return this.gate.queued;
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({ args: ["--no-sandbox"] });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  isReady(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  async render(req: RenderRequest): Promise<Buffer> {
    const browser = this.browser;
    if (!browser) throw new RenderCapError("render service not started", 503);

    return this.gate.run(async () => {
      const context = await browser.newContext({
        deviceScaleFactor: req.scale,
      });
      try {
        // SEC-3: block ALL network except same-origin render assets + data URIs.
        // Author-supplied URLs (images, remote fonts) never reach the network.
        await context.route("**/*", (route) => {
          const url = route.request().url();
          if (url.startsWith(this.baseUrl) || url.startsWith("data:")) {
            void route.continue();
          } else {
            void route.abort();
          }
        });

        const page = await context.newPage();
        page.setDefaultTimeout(RENDER_LIMITS.renderTimeoutMs);

        await page.goto(`${this.baseUrl}/render.html`, { waitUntil: "load" });
        await page.evaluate(
          ([source, mode]) =>
            (
              window as unknown as {
                vellumRender: (s: string, m: string) => Promise<void>;
              }
            ).vellumRender(source, mode),
          [req.source, req.mode] as const,
        );

        const target = page.locator("[data-vellum-export]");
        await target.waitFor({ state: "visible" });

        // SEC-4: reject pathologically large rasters before screenshotting.
        const box = await target.boundingBox();
        if (box && box.width * box.height * req.scale * req.scale > RENDER_LIMITS.maxPixelArea) {
          throw new RenderCapError("rendered output exceeds pixel cap", 422);
        }

        return await target.screenshot({ type: "png" });
      } finally {
        await context.close();
      }
    });
  }
}
