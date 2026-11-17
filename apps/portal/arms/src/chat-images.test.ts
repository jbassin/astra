import { describe, expect, it } from "vitest";

import { stillFor } from "./chat-images";

describe("stillFor", () => {
  it("maps a JB2A video to its thumbnail", () => {
    expect(
      stillFor(
        "modules/jb2a_patreon/Library/Generic/Magic_Signs/Runes/AbjurationRuneLoop_01_Regular_Pink_400x400.webm",
      ),
    ).toBe(
      "modules/jb2a_patreon/Library/Generic/Magic_Signs/Runes/AbjurationRuneLoop_01_Regular_Pink_Thumb.webp",
    );
  });

  it("drops a cache-busting query", () => {
    expect(stillFor("a/Rune_400x400.webm?123")).toBe("a/Rune_Thumb.webp");
  });

  it.each(["a/rune.webm", "a/Rune_400x400.webp", "a/token.png"])("has no thumbnail for %s", (src) =>
    expect(stillFor(src)).toBeNull(),
  );
});
