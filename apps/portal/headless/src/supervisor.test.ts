/**
 * Supervisor state-machine unit tests (spec 0027 S2 acceptance list) — a fake
 * `PageAdapter` drives every classification/failure path with `vi.useFakeTimers()`
 * (CI must not sleep; mirrors `apps/portal/module/src/bridgeClient.test.ts`'s idiom).
 * Zero Chromium, zero Foundry — the real `playwrightDriver.ts` is exercised only
 * live (S4), never in unit CI (mirrors vellum-render).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PageAdapter, PageClassification, SupervisorEvent } from "./supervisor";
import { Supervisor } from "./supervisor";

/** A fake `PageAdapter` — just enough surface to drive `Supervisor` deterministically.
 * `classifyImpl` is swappable mid-test so a scenario can change what the "page" would
 * report on the NEXT probe (mirrors a real kick/reload/shutdown/recovery). */
class FakePageAdapter implements PageAdapter {
  launches = 0;
  classifyCalls = 0;
  logins: Array<{ username: string; password: string }> = [];
  reloads = 0;
  closed = false;
  connected = true;
  loginShouldFail = false;
  reloadShouldFail = false;
  classifyImpl: () => PageClassification = () => {
    throw new Error("FakePageAdapter: classifyImpl not set for this test");
  };
  #consoleCb: ((level: "warn" | "error", text: string) => void) | null = null;

  async launch(): Promise<void> {
    this.launches++;
  }

  async classify(): Promise<PageClassification> {
    this.classifyCalls++;
    return this.classifyImpl();
  }

  async login(username: string, password: string): Promise<void> {
    this.logins.push({ username, password });
    if (this.loginShouldFail) throw new Error("login failed (fake)");
  }

  async reload(): Promise<void> {
    this.reloads++;
    if (this.reloadShouldFail) throw new Error("reload failed (fake)");
  }

  isBrowserConnected(): boolean {
    return this.connected;
  }

  onConsole(cb: (level: "warn" | "error", text: string) => void): void {
    this.#consoleCb = cb;
  }

  /** Test helper: simulate a captured `page.on("console")` line (D27-9). */
  emitConsole(level: "warn" | "error", text: string): void {
    this.#consoleCb?.(level, text);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe("Supervisor (spec 0027 S2 — hermetic)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("join -> login -> in-world, carrying the resolved username + password to login()", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "join";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "s3cr3t",
      reloadIntervalMs: 0,
    });

    await sup.start();

    expect(page.launches).toBe(1);
    expect(page.logins).toEqual([{ username: "Portal", password: "s3cr3t" }]);
    expect(sup.state).toBe("in-world");
    expect(sup.joins).toBe(1);
    expect(sup.lastJoinAt).not.toBeNull();

    sup.stop();
    expect(page.closed).toBe(true);
  });

  it("in-world -> join on the next probe (a kick, reload, or shutdown all just reclassify)", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    const classification: PageClassification = "join";
    page.classifyImpl = () => classification;
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
      pollIntervalMs: 5_000,
    });

    await sup.start();
    expect(sup.state).toBe("in-world");
    expect(page.logins).toHaveLength(1);

    // The next probe finds the page back at /join (kicked/reloaded/shutdown-then-back
    // — `classification` never changed, so this proves the supervisor RE-classifies
    // every probe rather than trusting the cached "in-world" state).
    await vi.advanceTimersByTimeAsync(5_000);

    expect(page.logins).toHaveLength(2);
    expect(sup.state).toBe("in-world");
    expect(sup.joins).toBe(2);

    sup.stop();
  });

  it("world-down never attempts a login, and idles on backoff", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "world-down";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
    });

    await sup.start();
    expect(sup.state).toBe("world-down");
    expect(page.logins).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000); // base backoff
    expect(page.classifyCalls).toBe(2);
    expect(page.logins).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_000); // doubled backoff
    expect(page.classifyCalls).toBe(3);
    expect(page.logins).toHaveLength(0);
    expect(sup.state).toBe("world-down");

    sup.stop();
  });

  it("a thrown classify() (crash/nav-error) relaunches (re-seeding noCanvas via launch())", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    let shouldCrash = true;
    page.classifyImpl = () => {
      if (shouldCrash) throw new Error("page crashed");
      return "in-world";
    };
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
    });

    await sup.start();
    expect(sup.state).toBe("broken");
    expect(page.launches).toBe(1); // the initial launch only — no relaunch yet
    expect(sup.relaunches).toBe(0);

    shouldCrash = false;
    await vi.advanceTimersByTimeAsync(1_000); // base backoff before the recovery probe

    // Recovering from `broken` calls launch() again (the ONLY place noCanvas is
    // re-seeded, D27-7) before re-classifying.
    expect(page.launches).toBe(2);
    expect(sup.relaunches).toBe(1);
    expect(sup.state).toBe("in-world");

    sup.stop();
  });

  it("backoff doubles 1s -> 30s and never gives up (mirrors bridgeClient's cap)", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "world-down";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
    });

    await sup.start();
    const expectedDelays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const delay of expectedDelays) {
      const before = page.classifyCalls;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(page.classifyCalls).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(page.classifyCalls).toBe(before + 1);
    }

    sup.stop();
  });

  it("resets backoff to base after a healthy hold (>=10s in-world), not merely on reaching it", async () => {
    vi.useFakeTimers(); // fakes Date too — the healthy-hold clock advances with the timers
    const page = new FakePageAdapter();
    let classification: PageClassification = "world-down";
    page.classifyImpl = () => classification;
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
      pollIntervalMs: 5_000,
    });

    // t=0: 1st world-down — backoff 1000 used NOW, stored climbs to 2000 for next time.
    await sup.start();

    // t=1000 (the scheduled backoff): classify -> join -> login succeeds -> in-world.
    // This path never touches backoffMs (only a FAILURE calls nextBackoff()), so the
    // climbed 2000 is still sitting there, unresolved, until the hold check fires.
    classification = "join";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sup.state).toBe("in-world");

    // Hold in-world for >= HEALTHY_HOLD_MS (10s) across two poll intervals (5s each).
    classification = "in-world";
    await vi.advanceTimersByTimeAsync(5_000); // t=6000: hold=5000ms, not yet
    await vi.advanceTimersByTimeAsync(5_000); // t=11000: hold=10000ms -> backoff reset to 1000

    // Fail again — if the hold reset the backoff, THIS failure schedules its retry at
    // base (1000ms), not the still-climbed 2000ms from before the hold.
    classification = "world-down";
    const beforeWorldDown = page.classifyCalls;
    await vi.advanceTimersByTimeAsync(5_000); // t=16000: the pending in-world poll fires
    expect(sup.state).toBe("world-down");
    expect(page.classifyCalls).toBe(beforeWorldDown + 1);
    const afterWorldDown = page.classifyCalls;

    await vi.advanceTimersByTimeAsync(999);
    expect(page.classifyCalls).toBe(afterWorldDown); // not yet — proves it's not instant
    await vi.advanceTimersByTimeAsync(1);
    expect(page.classifyCalls).toBe(afterWorldDown + 1); // fired at exactly 1000ms: reset proven

    sup.stop();
  });

  it("the reload knob fires at the configured interval while in-world", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "in-world";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 10_000,
      pollIntervalMs: 5_000,
    });

    await sup.start();
    expect(page.reloads).toBe(0);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(page.reloads).toBe(0);

    await vi.advanceTimersByTimeAsync(5_000); // total 10s since start — the interval
    expect(page.reloads).toBe(1);

    sup.stop();
  });

  it("reloadIntervalMs: 0 disables the reload knob entirely", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "in-world";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
      pollIntervalMs: 5_000,
    });

    await sup.start();
    await vi.advanceTimersByTimeAsync(5_000 * 50); // ~4 days of polls
    expect(page.reloads).toBe(0);

    sup.stop();
  });

  it("never logs the password, even across a failed login retry (D27-14)", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "join";
    page.loginShouldFail = true;
    const password = "hunter2-super-secret-value";
    const logs: string[] = [];
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => password,
      reloadIntervalMs: 0,
      log: (_level, message) => logs.push(message),
    });

    await sup.start();
    await vi.advanceTimersByTimeAsync(1_000); // one retry

    expect(page.logins.length).toBeGreaterThanOrEqual(2);
    expect(page.logins.every((l) => l.password === password)).toBe(true); // login DID get it
    expect(logs.some((line) => line.includes(password))).toBe(false); // but no log line does

    sup.stop();
  });

  it("re-emits a captured page-console warn/error line as both a log and an event (D27-9)", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "in-world";
    const logs: Array<{ level: string; message: string }> = [];
    const events: SupervisorEvent[] = [];
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
      log: (level, message) => logs.push({ level, message }),
      onEvent: (event) => events.push(event),
    });

    await sup.start();
    page.emitConsole("warn", "bridge-user-id set but no matching game.users entry");

    expect(
      logs.some((l) => l.level === "warn" && l.message.includes("bridge-user-id set but no")),
    ).toBe(true);
    expect(events).toContainEqual({
      type: "console",
      level: "warn",
      text: "bridge-user-id set but no matching game.users entry",
    });

    sup.stop();
  });

  it("stop() tears down the page and cancels any pending probe", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    page.classifyImpl = () => "world-down";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
    });

    await sup.start();
    sup.stop();
    expect(page.closed).toBe(true);

    const before = page.classifyCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.classifyCalls).toBe(before); // no more probes after stop()
  });

  it("an initial launch() failure enters broken and recovers on the next backoff tick", async () => {
    vi.useFakeTimers();
    const page = new FakePageAdapter();
    let launchShouldFail = true;
    const realLaunch = page.launch.bind(page);
    page.launch = async () => {
      if (launchShouldFail) throw new Error("chromium.launch() failed (fake)");
      await realLaunch();
    };
    page.classifyImpl = () => "in-world";
    const sup = new Supervisor({
      page,
      username: "Portal",
      resolvePassword: () => "pw",
      reloadIntervalMs: 0,
    });

    await sup.start();
    expect(sup.state).toBe("broken");
    expect(page.classifyCalls).toBe(0); // never got far enough to classify

    launchShouldFail = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sup.state).toBe("in-world");
    expect(sup.relaunches).toBe(1);

    sup.stop();
  });
});
