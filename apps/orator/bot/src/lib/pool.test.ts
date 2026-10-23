import { describe, expect, test } from "vitest";

import { runPool } from "./pool";

describe("runPool", () => {
  test("runs every item exactly once", async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await runPool(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  test("handles an empty list", async () => {
    let calls = 0;
    await runPool([], 4, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});
