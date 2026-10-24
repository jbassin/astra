import { BRIDGE_METHOD_PREFIX } from "@astra/portal-shared";
import { describe, expect, it } from "vitest";

import { COMPATIBILITY_MINIMUM, MODULE_ID, MODULE_TITLE } from "./constants";

describe("portal-module identity constants", () => {
  it("uses a lowercase, path-safe package id", () => {
    expect(MODULE_ID).toBe("portal");
    expect(MODULE_ID).toMatch(/^[a-z0-9-]+$/);
  });

  it("is the bridge method namespace the server sends queries under", () => {
    expect(BRIDGE_METHOD_PREFIX).toBe(MODULE_ID);
  });

  it("carries a non-empty title and the D2-verified compatibility floor", () => {
    expect(MODULE_TITLE.length).toBeGreaterThan(0);
    expect(COMPATIBILITY_MINIMUM).toBe("13");
  });
});
