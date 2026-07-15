import { describe, expect, it } from "vitest";

import { traitBucket } from "./traitBucket";

describe("traitBucket (D29-46's 3-bucket trait-pill color scheme)", () => {
  it.each(["common", "uncommon", "rare", "unique"])("rarity %s -> amber", (name) => {
    expect(traitBucket(name)).toBe("amber");
  });

  it.each(["arcane", "divine", "occult", "primal"])("tradition %s -> purple", (name) => {
    expect(traitBucket(name)).toBe("purple");
  });

  it.each(["lawful", "chaotic", "good", "evil"])("alignment %s -> purple", (name) => {
    expect(traitBucket(name)).toBe("purple");
  });

  it("an unrecognized/general trait falls back to umber", () => {
    expect(traitBucket("agile")).toBe("umber");
    expect(traitBucket("magical")).toBe("umber");
    expect(traitBucket("Reach 15")).toBe("umber");
  });

  it("is case-insensitive and trims whitespace (TraitPill receives humanized display names)", () => {
    expect(traitBucket("Uncommon")).toBe("amber");
    expect(traitBucket("Arcane")).toBe("purple");
    expect(traitBucket(" Evil ")).toBe("purple");
  });
});
