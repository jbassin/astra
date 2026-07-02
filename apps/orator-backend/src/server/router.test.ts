import { describe, expect, test } from "vitest";
import { type ApiRoute, HttpError, intParam, json, matchRoute } from "./router";

const routes: ApiRoute[] = [
  { method: "GET", path: "/api/v1/tracks", handler: () => json({}) },
  { method: "GET", path: "/api/v1/tracks/:id", handler: () => json({}) },
  { method: "DELETE", path: "/api/v1/tracks/:id", handler: () => json({}) },
];

describe("matchRoute", () => {
  test("matches a static path", () => {
    expect(matchRoute(routes, "GET", "/api/v1/tracks")?.route.path).toBe("/api/v1/tracks");
  });
  test("matches a :param path and decodes the value", () => {
    const m = matchRoute(routes, "GET", "/api/v1/tracks/42");
    expect(m?.route.path).toBe("/api/v1/tracks/:id");
    expect(m?.params).toEqual({ id: "42" });
  });
  test("respects the method", () => {
    expect(matchRoute(routes, "DELETE", "/api/v1/tracks/7")?.route.method).toBe("DELETE");
  });
  test("no match → null", () => {
    expect(matchRoute(routes, "GET", "/api/v1/nope")).toBeNull();
    expect(matchRoute(routes, "POST", "/api/v1/tracks")).toBeNull();
  });
});

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
