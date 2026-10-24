import { describe, expect, test } from "vitest";

import { HttpError, intParam, json } from "./router";

// Route matching lives in @astra/service-kit (`matchPath`, tested there).

describe("intParam", () => {
  test("parses a positive integer", () => {
    expect(intParam({ id: "7" }, "id")).toBe(7);
  });
  test("rejects non-positive / non-integer", () => {
    expect(() => intParam({ id: "0" }, "id")).toThrow(HttpError);
    expect(() => intParam({ id: "-3" }, "id")).toThrow(HttpError);
    expect(() => intParam({ id: "x" }, "id")).toThrow(HttpError);
  });
});

describe("json", () => {
  test("serializes with a JSON content-type", async () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
