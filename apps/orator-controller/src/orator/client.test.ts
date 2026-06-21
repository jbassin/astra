import { describe, expect, test } from "bun:test";

import { tracksPath } from "./client";

describe("orator client helpers", () => {
  test("tracksPath emits only defined filters", () => {
    expect(tracksPath()).toBe("/api/v1/tracks");
    expect(tracksPath({})).toBe("/api/v1/tracks");
    expect(tracksPath({ collection: 7 })).toBe("/api/v1/tracks?collection=7");
    expect(tracksPath({ collection: 7, tag: 3 })).toBe("/api/v1/tracks?collection=7&tag=3");
    expect(tracksPath({ limit: 500 })).toBe("/api/v1/tracks?limit=500");
  });

  test("tracksPath skips empty q", () => {
    expect(tracksPath({ q: "" })).toBe("/api/v1/tracks");
    expect(tracksPath({ q: "boss" })).toBe("/api/v1/tracks?q=boss");
  });
});
