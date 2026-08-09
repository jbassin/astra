import { expect, test } from "vitest";

import { parseRollEvent } from "../src/schema";

test("parses the v1 (rich) payload in full", () => {
  const e = parseRollEvent({
    v: 1,
    user: "Kethra",
    expression: "1d20+7",
    total: 27,
    dice: [20],
    modifier: 7,
    is_crit: true,
    is_fumble: false,
    ts: "2026-06-09T21:48:01Z",
  });
  expect(e).toMatchObject({
    v: 1,
    user: "Kethra",
    expression: "1d20+7",
    total: 27,
    dice: [20],
    modifier: 7,
    isCrit: true,
    isFumble: false,
    ts: "2026-06-09T21:48:01Z",
  });
});

test("carries the v2 display headline when present (atom roll shape)", () => {
  const e = parseRollEvent({
    v: 1,
    user: "Kethra",
    expression: "dl([:fine, :good, :great])",
    display: ":great",
    total: 0,
    is_crit: true,
    is_fumble: false,
  });
  expect(e?.display).toBe(":great");
  expect(e?.total).toBe(0);
  expect(e?.isCrit).toBe(true);
});

test("normalizes a missing/blank/non-string display to null", () => {
  expect(parseRollEvent({ user: "A", total: 5 })?.display).toBeNull();
  expect(parseRollEvent({ user: "A", total: 5, display: "" })?.display).toBeNull();
  expect(parseRollEvent({ user: "A", total: 5, display: 7 })?.display).toBeNull();
});

test("defaults v to 1 when omitted (total present)", () => {
  const e = parseRollEvent({ user: "A", expression: "3d8", total: 14 });
  expect(e?.v).toBe(1);
  expect(e?.expression).toBe("3d8");
});

test("stamps a timestamp when weal-bot omits one", () => {
  const e = parseRollEvent({ user: "Morrow", total: 1, is_crit: false, is_fumble: true });
  expect(typeof e?.ts).toBe("string");
  expect(Number.isNaN(Date.parse(e?.ts ?? ""))).toBe(false);
  expect(e?.isFumble).toBe(true);
});

test("rejects unusable bodies (v1 requires user + finite total)", () => {
  expect(parseRollEvent(null)).toBeNull();
  expect(parseRollEvent(42)).toBeNull();
  expect(parseRollEvent({})).toBeNull();
  expect(parseRollEvent({ user: "", total: 1 })).toBeNull(); // blank user
  expect(parseRollEvent({ user: "A" })).toBeNull(); // no total
  expect(parseRollEvent({ user: "A", total: "NaN" })).toBeNull(); // non-numeric
  expect(parseRollEvent({ user: "A", total: Number.POSITIVE_INFINITY })).toBeNull(); // non-finite
  expect(parseRollEvent({ user: "A", value: 5 })).toBeNull(); // v0 dropped — `value` ignored
});
