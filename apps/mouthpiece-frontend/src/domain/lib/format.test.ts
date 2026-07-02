import { describe, expect, test } from "vitest";

import { formatRuntime, sumRuntimeMs } from "./format";

describe("formatRuntime", () => {
  test("M:SS under an hour", () => {
    expect(formatRuntime(0)).toBe("0:00");
    expect(formatRuntime(90_000)).toBe("1:30");
    expect(formatRuntime(5_000)).toBe("0:05");
  });

  test("H:MM:SS past an hour", () => {
    expect(formatRuntime(3_661_000)).toBe("1:01:01");
    expect(formatRuntime(3_600_000)).toBe("1:00:00");
  });
});

describe("sumRuntimeMs", () => {
  test("sums durationMs, tolerating 0", () => {
    expect(sumRuntimeMs([{ durationMs: 1000 }, { durationMs: 2000 }])).toBe(3000);
    expect(sumRuntimeMs([{ durationMs: 0 }, { durationMs: 0 }])).toBe(0);
    expect(sumRuntimeMs([])).toBe(0);
  });
});
