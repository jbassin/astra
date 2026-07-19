import { describe, expect, it } from "vitest";

import { displayCategoryName } from "./displayCategoryName";

describe("displayCategoryName (D29-109d seam, created early by P11 S4/D29-112)", () => {
  it("falls back to humanizeSlug for every category with no override", () => {
    expect(displayCategoryName("feat")).toBe("Feat");
    expect(displayCategoryName("creature-family")).toBe("Creature Family");
    expect(displayCategoryName("warfare-army")).toBe("Warfare Army");
  });

  it("hunters-edge overrides to the apostrophe form humanizeSlug can't reconstruct", () => {
    expect(displayCategoryName("hunters-edge")).toBe("Hunter's Edge");
  });

  it("rules stays the plain humanized form (no override needed)", () => {
    expect(displayCategoryName("rules")).toBe("Rules");
  });
});
