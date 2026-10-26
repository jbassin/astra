import { describe, expect, test } from "vitest";

import { RollMessageSchema, requestToken, tokenHeaders } from "./index";

describe("token headers", () => {
  test("weal-bot sends the token under x-weal-token only", () => {
    expect(tokenHeaders("s3cret")).toEqual({ "x-weal-token": "s3cret" });
  });

  test("weal-overlay reads x-weal-token and ignores the retired x-eerie-token", () => {
    expect(requestToken(new Headers(tokenHeaders("a")))).toBe("a");
    expect(requestToken(new Headers({ "x-eerie-token": "old" }))).toBeNull();
    expect(requestToken(new Headers({ "x-weal-token": "new", "x-eerie-token": "old" }))).toBe(
      "new",
    );
    expect(requestToken(new Headers())).toBeNull();
  });
});

const roll = {
  v: 1,
  user: "Jorge",
  expression: "d20 + 7",
  total: 24,
  is_crit: false,
  is_fumble: false,
  display: "24",
} as const;

describe("RollMessageSchema", () => {
  test("serializes a roll in the wire's field order", () => {
    expect(JSON.stringify(RollMessageSchema.parse(roll))).toBe(
      '{"v":1,"user":"Jorge","expression":"d20 + 7","total":24,"is_crit":false,"is_fumble":false,"display":"24"}',
    );
  });

  test("strips the retired value field an older bot still sends", () => {
    expect(RollMessageSchema.parse({ ...roll, value: 24 })).toEqual(roll);
  });

  test("accepts an atom roll (total 0, display carries the face)", () => {
    const atom = { ...roll, expression: "dl([:great])", total: 0, display: ":great" };
    expect(RollMessageSchema.parse(atom)).toEqual(atom);
  });

  test.each([
    ["a blank user", { ...roll, user: "  " }],
    ["a missing total", { ...roll, total: undefined }],
    ["a non-finite total", { ...roll, total: Number.POSITIVE_INFINITY }],
    ["a string total", { ...roll, total: "24" }],
    ["another wire version", { ...roll, v: 2 }],
    ["a missing display", { ...roll, display: undefined }],
    ["a missing crit flag", { ...roll, is_crit: undefined }],
    ["a non-object", 42],
  ])("rejects %s", (_name, body) => {
    expect(RollMessageSchema.safeParse(body).success).toBe(false);
  });
});
