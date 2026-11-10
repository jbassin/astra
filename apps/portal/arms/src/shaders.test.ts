import { describe, expect, it } from "vitest";

import { FRAGMENT_PRELUDE, FRAGMENTS, fragmentSource } from "./shaders";

describe("fragmentSource", () => {
  it("puts the prelude in front of the named shader", () => {
    expect(fragmentSource("flat")).toBe(`${FRAGMENT_PRELUDE}\n${FRAGMENTS.flat}`);
  });

  it.each(["no-such-shader", "toString", "constructor"])("falls back to flat for %s", (name) => {
    expect(fragmentSource(name)).toBe(fragmentSource("flat"));
  });
});
