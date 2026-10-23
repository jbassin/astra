import { describe, expect, it, vi } from "vitest";

import { createThrottle } from "./throttle";

describe("createThrottle", () => {
  it("does not delay the first call", async () => {
    const delay = vi.fn(async () => {});
    const throttle = createThrottle(250, delay);
    await throttle();
    expect(delay).not.toHaveBeenCalled();
  });

  it("awaits the injected delay before every subsequent call", async () => {
    const delay = vi.fn(async () => {});
    const throttle = createThrottle(250, delay);
    await throttle();
    await throttle();
    await throttle();
    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenNthCalledWith(1, 250);
    expect(delay).toHaveBeenNthCalledWith(2, 250);
  });

  it("is a fresh cadence per throttle() instance", async () => {
    const delay = vi.fn(async () => {});
    const a = createThrottle(250, delay);
    const b = createThrottle(250, delay);
    await a();
    await b();
    expect(delay).not.toHaveBeenCalled();
  });
});
