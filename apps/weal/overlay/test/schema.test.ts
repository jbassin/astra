import { expect, test } from "vitest";

import { parseRollEvent } from "../src/schema";

const NOW = new Date("2026-06-09T21:48:01Z");

/** The body weal-bot posts for `d20 + 7` (the shape before this release also sent `value`). */
const roll = {
  v: 1,
  user: "Kethra",
  expression: "1d20+7",
  total: 27,
  is_crit: true,
  is_fumble: false,
  display: "27",
};

test("maps the wire message to the camelCase feed event", () => {
  expect(parseRollEvent(roll, NOW)).toEqual({
    v: 1,
    user: "Kethra",
    expression: "1d20+7",
    total: 27,
    display: "27",
    isCrit: true,
    isFumble: false,
    ts: "2026-06-09T21:48:01.000Z",
  });
});

test("accepts the previous bot's body, which still carries value", () => {
  expect(parseRollEvent({ ...roll, value: 27 }, NOW)?.total).toBe(27);
});

test("carries the display headline of an atom roll", () => {
  const e = parseRollEvent(
    { ...roll, expression: "dl([:fine, :good, :great])", display: ":great", total: 0 },
    NOW,
  );
  expect(e?.display).toBe(":great");
  expect(e?.total).toBe(0);
});

test("normalizes a blank display to null", () => {
  expect(parseRollEvent({ ...roll, display: "" }, NOW)?.display).toBeNull();
});

test("trims the player name", () => {
  expect(parseRollEvent({ ...roll, user: "  Morrow " }, NOW)?.user).toBe("Morrow");
});

test("stamps the receive time", () => {
  const e = parseRollEvent(roll);
  expect(Number.isNaN(Date.parse(e?.ts ?? ""))).toBe(false);
});

test("rejects bodies the wire schema rejects", () => {
  expect(parseRollEvent(null)).toBeNull();
  expect(parseRollEvent(42)).toBeNull();
  expect(parseRollEvent({})).toBeNull();
  expect(parseRollEvent({ ...roll, user: "" })).toBeNull();
  expect(parseRollEvent({ ...roll, total: undefined })).toBeNull();
  expect(parseRollEvent({ ...roll, total: "NaN" })).toBeNull();
  expect(parseRollEvent({ ...roll, total: Number.POSITIVE_INFINITY })).toBeNull();
  expect(parseRollEvent({ ...roll, display: 7 })).toBeNull();
  expect(parseRollEvent({ user: "A", value: 5 })).toBeNull(); // the v0 shape
});
