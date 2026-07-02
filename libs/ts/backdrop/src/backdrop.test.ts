import { describe, expect, it } from "vitest";
import { BACKDROPS } from "./shaders";

// Pure-data checks on the catalog — no pixi/WebGL (can't run a real GL context under
// bun test). The load-bearing invariant: every uniform a spec declares must actually
// be referenced in its fragment, and the fragment must follow the Pixi-v8 convention.
describe("backdrop catalog", () => {
  it("exposes the three pixi backdrops", () => {
    expect(Object.keys(BACKDROPS).sort()).toEqual([
      "ledgerAurora",
      "mouthpieceInterference",
      "mouthpieceResonance",
      "starfield",
    ]);
  });

  for (const [key, spec] of Object.entries(BACKDROPS)) {
    describe(key, () => {
      it("has a Pixi-v8 fragment (no #version, has main + uTime)", () => {
        expect(spec.name.length).toBeGreaterThan(0);
        expect(spec.fragment).not.toContain("#version");
        expect(spec.fragment).toContain("void main");
        expect(spec.fragment).toContain("uTime");
      });

      it("declares every uniform it ships in the fragment", () => {
        for (const [name, u] of Object.entries(spec.uniforms)) {
          expect(spec.fragment).toContain(name);
          if (u.type === "vec3<f32>") {
            expect(u.value).toBeInstanceOf(Float32Array);
            expect((u.value as Float32Array).length).toBe(3);
          } else {
            expect(typeof u.value).toBe("number");
          }
        }
      });
    });
  }
});
