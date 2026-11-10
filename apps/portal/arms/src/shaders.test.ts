import { describe, expect, it } from "vitest";

import {
  ARM_VERT,
  FRAGMENT_PRELUDE,
  FRAGMENTS,
  fragmentSource,
  INK_BUFFER_FRAG,
  INK_IMAGE_FRAG,
  QUAD_VERT,
  SMEAR_SHADER,
} from "./shaders";

describe("fragmentSource", () => {
  it("puts the prelude in front of the named shader", () => {
    expect(fragmentSource("flat")).toBe(`${FRAGMENT_PRELUDE}\n${FRAGMENTS.flat}`);
  });

  it.each(["no-such-shader", "toString", "constructor"])("falls back to flat for %s", (name) => {
    expect(fragmentSource(name)).toBe(fragmentSource("flat"));
  });

  it("knows the ink shader", () => {
    expect(SMEAR_SHADER).toBe("ink");
    expect(fragmentSource(SMEAR_SHADER)).toBe(`${FRAGMENT_PRELUDE}\n${FRAGMENTS[SMEAR_SHADER]}`);
  });
});

describe("shader sources", () => {
  it.each(Object.entries(FRAGMENTS))("registered shader %s is a main() body", (_, body) => {
    expect(typeof body).toBe("string");
    expect(body).toContain("void main()");
  });

  it.each([
    ["ARM_VERT", ARM_VERT],
    ["QUAD_VERT", QUAD_VERT],
    ["INK_BUFFER_FRAG", INK_BUFFER_FRAG],
    ["INK_IMAGE_FRAG", INK_IMAGE_FRAG],
  ])("%s is a complete shader", (_, source) => {
    expect(source.startsWith("precision highp float;")).toBe(true);
    expect(source).toContain("void main()");
  });

  it("multiplies the visible ink pass by uAlpha", () => {
    expect(INK_IMAGE_FRAG).toContain("* uAlpha;");
  });
});
