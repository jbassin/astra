import { describe, expect, it } from "vitest";

import { documentOwnership, packOwnershipLevel, sourceOf } from ".";

describe("ownership", () => {
  it("keeps numeric levels in stored order and drops the rest", () => {
    const src = sourceOf({ toObject: () => ({ ownership: { default: 2, u1: 3, u2: "OWNER" } }) });
    expect([...documentOwnership(src)]).toEqual([
      ["default", 2],
      ["u1", 3],
    ]);
  });

  it("reads a missing ownership as empty", () => {
    expect(documentOwnership(sourceOf({ toObject: () => ({}) })).size).toBe(0);
  });

  it("maps pack level names, reading an unknown or absent name as INHERIT", () => {
    expect(packOwnershipLevel("OBSERVER")).toBe(2);
    expect(packOwnershipLevel("toString")).toBe(-1);
    expect(packOwnershipLevel(undefined)).toBe(-1);
  });
});
