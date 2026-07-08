/**
 * The headless-GM supervisor state machine (spec 0027 D27-6) — a coarse loop over one
 * persistent Chromium page: classify by URL + a couple of DOM probes, then act. Every
 * environment touchpoint (the browser, the clock, timers, logging, metrics) is an
 * injected dependency ({@link SupervisorDeps}), so the whole classify/login/backoff/
 * reload/relaunch loop is unit-testable with a fake {@link PageAdapter} and fake timers
 * — zero Chromium involved (S2's hermetic constraint; the real Playwright driver in
 * `playwrightDriver.ts` is deliberately thin and untested in unit CI, mirroring
 * vellum-render). Shaped after the module's `bridgeClient.ts` (same injected-timer /
 * injected-clock / capped-exponential-backoff idiom, applied here to Foundry's `/join`
 * instead of the bridge WS).
 *
 * States (D27-6): `in-world` (idle/monitor) · `join` (drive login) · `world-down`
 * (backoff-idle, NEVER a login/setup interaction) · `broken` (crash/hang/nav-error →
 * relaunch). The state machine doesn't hardcode *why* a probe classifies as `join` vs
 * `world-down` (kick, reload, world shutdown, cold boot all just reclassify on the next
 * probe) — that nuance lives entirely in the injected {@link PageAdapter.classify}.
 */
import {
  BASE_BACKOFF_MS,
  DEFAULT_POLL_INTERVAL_MS,
  HEALTHY_HOLD_MS,
  MAX_BACKOFF_MS,
} from "./constants";

/** What one probe of the live page looks like, from the browser's URL + DOM alone. */
export type PageClassification = "join" | "in-world" | "world-down";

/** The supervisor's own state — `broken` is not a classification (the page can't be
 * classified at all right now); it's what a thrown `classify()`/initial `launch()`
 * failure maps to. */
export type SupervisorState = PageClassification | "broken";

/** The page-driving seam (D27-6/-7/-9/-10). Production: `playwrightDriver.ts`'s
 * `createPlaywrightPageAdapter`. Tests: a fake implementing just this surface — no
 * Foundry, no Chromium. */
export interface PageAdapter {
  /** (Re)launch the browser (or reset an existing one), reseed `core.noCanvas=true`
   * (D27-7 — client-scoped localStorage, must be set before the app loads on EVERY
   * (re)launch, not just the first), and navigate to the Foundry origin. Called once at
   * supervisor start, and again every time the supervisor recovers from `broken` — so a
   * single method covers both "first launch" and "relaunch after a crash" (D27-10's
   * noCanvas-reseed requirement holds identically for both). */
  launch(): Promise<void>;
  /** Classify the current page state. Throws (or rejects) to signal a crash/hang/nav
   * error — the supervisor maps that to `broken` and relaunches. */
  classify(): Promise<PageClassification>;
  /** Drive the real `/join` flow in-page: resolve the user select entry by name, submit
   * `{userid, password, action:"join"}`, follow the redirect. Throws on failure (wrong
   * password, unresolvable username, a `/join` DOM that doesn't match expectations). */
  login(username: string, password: string): Promise<void>;
  /** Force a page reload (D27-10's periodic hygiene knob) while healthy. */
  reload(): Promise<void>;
  /** Whether the underlying browser process is still connected — the ONLY thing
   * `/health`'s `ok` field asserts alongside process-up (D27-11). */
  isBrowserConnected(): boolean;
  /** Register the callback the adapter invokes for every captured `page.on("console")`
   * warn/error line (D27-9). Called once, at supervisor start, before the first
   * `launch()` — so no console line is ever missed. */
  onConsole(cb: (level: "warn" | "error", text: string) => void): void;
  /** Tear everything down (SIGTERM path). */
  close(): Promise<void>;
}

/** Emitted for every state transition + counted event — the telemetry seam. The
 * entrypoint (`index.ts`) is the only place these become spans/`lazyCounter`s/logs;
 * `supervisor.ts` itself imports nothing from `@astra/observe`, keeping it hermetic. */
export type SupervisorEvent =
  | { type: "transition"; state: SupervisorState }
  | { type: "join" }
  | { type: "relaunch" }
  | { type: "world-down-dwell"; ms: number }
  | { type: "console"; level: "warn" | "error"; text: string };

export type LogLevel = "info" | "warn" | "error";
export type LogFn = (level: LogLevel, message: string) => void;

export interface SupervisorDeps {
  page: PageAdapter;
  /** The Foundry username to select on `/join` ("Portal", D27-4). Not a secret. */
  username: string;
  /** Resolves the GM password fresh at EVERY login call (D27-14) — never cached,
   * never logged. A `SecretRef.resolve()` closure in production; a plain closure in
   * tests. */
  resolvePassword: () => string;
  /** 0 disables the periodic reload knob (D27-10); otherwise the interval in ms. */
  reloadIntervalMs: number;
  /** How often to re-probe while `in-world` (default {@link DEFAULT_POLL_INTERVAL_MS}
   * from `constants.ts`, injectable so tests don't need to advance 30s of fake time). */
  pollIntervalMs?: number;
  /** Injectable clock (healthy-hold backoff reset + reload-interval bookkeeping);
   * defaults to `Date.now`. */
  now?: () => number;
  /** Injectable timers — production uses the real globals; tests use
   * `vi.useFakeTimers()` (which patches the same globals, so these defaults suffice
   * there too — mirrors `bridgeClient.ts`). */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  log?: LogFn;
  onEvent?: (event: SupervisorEvent) => void;
}

const defaultSetTimeout: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms);
const defaultClearTimeout: (handle: unknown) => void = (handle) => {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Drives the classify → act → schedule-next loop forever (D27-6 — never gives up).
 * Call {@link start} once; {@link stop} tears down the page and cancels any pending
 * probe.
 */
export class Supervisor {
  readonly #deps: SupervisorDeps;
  // "join" is a neutral pre-classification placeholder, not a real observed state —
  // the very first probe() always calls classify() (not the `broken` relaunch branch),
  // so this default never causes a spurious relaunch attempt.
  #state: SupervisorState = "join";
  #backoffMs = BASE_BACKOFF_MS;
  #inWorldSince: number | null = null;
  #worldDownSince: number | null = null;
  #lastReloadAt = 0;
  #lastJoinAt: number | null = null;
  #joins = 0;
  #relaunches = 0;
  #timer: unknown = null;
  #stopped = true;

  constructor(deps: SupervisorDeps) {
    this.#deps = deps;
  }

  get state(): SupervisorState {
    return this.#state;
  }

  get lastJoinAt(): number | null {
    return this.#lastJoinAt;
  }

  get joins(): number {
    return this.#joins;
  }

  get relaunches(): number {
    return this.#relaunches;
  }

  get browserConnected(): boolean {
    return this.#deps.page.isBrowserConnected();
  }

  /** Launches the browser, wires the console capture (D27-9), and starts probing. */
  async start(): Promise<void> {
    this.#stopped = false;
    this.#lastReloadAt = this.#now();
    this.#deps.page.onConsole((level, text) => this.#onConsole(level, text));
    try {
      await this.#deps.page.launch();
    } catch (err) {
      this.#log("error", `initial launch failed: ${errMsg(err)}`);
      this.#setState("broken");
      this.#scheduleNext(this.#nextBackoff());
      return;
    }
    await this.#probe();
  }

  /** Tears down the page and cancels any pending probe. Idempotent. */
  stop(): void {
    this.#stopped = true;
    const clear = this.#deps.clearTimeoutFn ?? defaultClearTimeout;
    if (this.#timer !== null) clear(this.#timer);
    this.#timer = null;
    void this.#deps.page.close();
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }

  #log(level: LogLevel, message: string): void {
    this.#deps.log?.(level, `portal-headless supervisor: ${message}`);
  }

  #emit(event: SupervisorEvent): void {
    this.#deps.onEvent?.(event);
  }

  #onConsole(level: "warn" | "error", text: string): void {
    // Always logged at warn: page-console lines are Foundry/world-module output, not
    // supervisor faults, and an in-page console.error would otherwise land at ERROR
    // severity and page ops via the Class-A error/fatal-logs alert (it did, live —
    // Foundry's screen-resolution complaint, 2026-07-08). The event keeps the real
    // level, so the module_console counter still distinguishes warn from error.
    this.#log("warn", `page console: ${text}`);
    this.#emit({ type: "console", level, text });
  }

  /** Returns the delay to use NOW, then doubles the stored backoff for next time
   * (mirrors `bridgeClient.ts`'s `#scheduleReconnect` exactly). */
  #nextBackoff(): number {
    const delay = this.#backoffMs;
    this.#backoffMs = Math.min(this.#backoffMs * 2, MAX_BACKOFF_MS);
    return delay;
  }

  #scheduleNext(delayMs: number): void {
    if (this.#stopped) return;
    const set = this.#deps.setTimeoutFn ?? defaultSetTimeout;
    this.#timer = set(() => {
      this.#timer = null;
      void this.#probe();
    }, delayMs);
  }

  /** Transitions state, firing the dwell metric on the way out of `world-down` and
   * clearing the `in-world` healthy-hold clock on the way out of `in-world`. A no-op if
   * already in `next` (so re-entering the same state via {@link enterInWorld}
   * doesn't re-fire the transition event every probe). */
  #setState(next: SupervisorState): void {
    if (this.#state === next) return;
    if (this.#state === "in-world") this.#inWorldSince = null;
    if (this.#state === "world-down" && this.#worldDownSince !== null) {
      this.#emit({ type: "world-down-dwell", ms: this.#now() - this.#worldDownSince });
      this.#worldDownSince = null;
    }
    this.#state = next;
    this.#log("info", `state -> ${next}`);
    this.#emit({ type: "transition", state: next });
  }

  #enterInWorld(): void {
    this.#setState("in-world");
    if (this.#inWorldSince === null) this.#inWorldSince = this.#now();
  }

  #enterWorldDown(): void {
    this.#setState("world-down");
    if (this.#worldDownSince === null) this.#worldDownSince = this.#now();
  }

  /** The core cycle: recover from `broken` if needed, classify, act, schedule the next
   * probe. Always re-classifies rather than trusting the previous state — a kick,
   * reload, or world shutdown just shows up as a different classification on the next
   * probe (D27-6's deliberate coarseness). */
  async #probe(): Promise<void> {
    if (this.#stopped) return;

    if (this.#state === "broken") {
      try {
        await this.#deps.page.launch();
        this.#relaunches++;
        this.#emit({ type: "relaunch" });
      } catch (err) {
        this.#log("error", `relaunch failed: ${errMsg(err)}`);
        this.#scheduleNext(this.#nextBackoff());
        return;
      }
    }

    let classification: PageClassification;
    try {
      classification = await this.#deps.page.classify();
    } catch (err) {
      this.#log("error", `classify failed (treating as broken): ${errMsg(err)}`);
      this.#setState("broken");
      this.#scheduleNext(this.#nextBackoff());
      return;
    }

    switch (classification) {
      case "world-down":
        // D27-6: NEVER touch /setup — just idle-backoff and reclassify later.
        this.#enterWorldDown();
        this.#scheduleNext(this.#nextBackoff());
        return;

      case "join":
        await this.#attemptLogin();
        return;

      case "in-world":
        await this.#monitorInWorld();
        return;
    }
  }

  async #attemptLogin(): Promise<void> {
    this.#setState("join");
    const password = this.#deps.resolvePassword();
    try {
      // `password` never touches a log line or thrown-error message we construct —
      // it exists only in this local binding and the argument to `login()` (D27-14).
      await this.#deps.page.login(this.#deps.username, password);
    } catch (err) {
      this.#log("warn", `login attempt failed for ${this.#deps.username}: ${errMsg(err)}`);
      this.#scheduleNext(this.#nextBackoff());
      return;
    }
    this.#joins++;
    this.#lastJoinAt = this.#now();
    this.#emit({ type: "join" });
    this.#enterInWorld();
    this.#scheduleNext(this.#deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  }

  async #monitorInWorld(): Promise<void> {
    this.#enterInWorld();
    // Healthy-hold backoff reset (mirrors bridgeClient's HEALTHY_HOLD_MS) — a session
    // that's been stable a while earns back the fast backoff for its NEXT outage.
    const inWorldSince = this.#inWorldSince;
    if (inWorldSince !== null && this.#now() - inWorldSince >= HEALTHY_HOLD_MS) {
      this.#backoffMs = BASE_BACKOFF_MS;
    }

    const reloadMs = this.#deps.reloadIntervalMs;
    if (reloadMs > 0 && this.#now() - this.#lastReloadAt >= reloadMs) {
      try {
        await this.#deps.page.reload();
        this.#lastReloadAt = this.#now();
      } catch (err) {
        this.#log("warn", `periodic reload failed: ${errMsg(err)}`);
      }
    }

    this.#scheduleNext(this.#deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  }
}
