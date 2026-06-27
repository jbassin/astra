import type { BackdropSpec } from "../types";
import { NOISE_GLSL, PREAMBLE, vec3 } from "./common";

// harrow's drifting yellow/black starfield (3-layer parallax stars + twinkle + an
// amber fbm nebula haze on warm-black space). Relocated from harrow verbatim — the
// FIRST astra backdrop, now a catalog entry so every site shares the scaffold.
// Palette stays harrow's warm gold (NOT the gothic teal) — it's harrow's signature.
const FRAGMENT = `${PREAMBLE}
uniform vec3 uStarColour;   // warm gold star core
uniform vec3 uGlowColour;   // amber nebula haze
uniform vec3 uSpaceColour;  // deep warm-black space
${NOISE_GLSL}
// One parallax layer of stars: one candidate star per grid cell, sampled over a
// 3x3 neighbourhood so stars near a cell edge still render; twinkle via uTime.
float starLayer(vec2 uv, float density) {
  float total = 0.0;
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offs = vec2(float(x), float(y));
      vec2 rnd = hash22(id + offs);
      if (rnd.x > density) continue;
      vec2 starPos = offs + (rnd - 0.5) * 0.7;
      float d = length(gv - starPos);
      float size = mix(0.012, 0.05, rnd.y);
      float glow = smoothstep(size, 0.0, d);
      glow += smoothstep(size * 6.0, 0.0, d) * 0.25;
      float tw = 0.55 + 0.45 * sin(uTime * mix(0.8, 3.0, rnd.x) + rnd.y * 6.2831);
      total += glow * tw;
    }
  }
  return total;
}

void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  float coverage = src.a;

  vec2 res = uInputSize.xy;
  vec2 uv = (vTextureCoord * res - 0.5 * res) / res.y;

  vec3 col = uSpaceColour;
  float neb = fbm(uv * 1.6 + vec2(uTime * 0.012, uTime * 0.006));
  neb = pow(clamp(neb, 0.0, 1.0), 3.0);
  col += uGlowColour * neb * 0.35;

  float stars = 0.0;
  stars += starLayer(uv * 6.0 + vec2(uTime * 0.010, uTime * 0.004), 0.45);
  stars += starLayer(uv * 11.0 + vec2(uTime * 0.020, -uTime * 0.006), 0.35) * 0.8;
  stars += starLayer(uv * 18.0 + vec2(-uTime * 0.030, uTime * 0.010), 0.28) * 0.6;
  col += uStarColour * stars;

  finalColor = vec4(col, 1.0) * coverage;
}
`;

export const starfield: BackdropSpec = {
  name: "starfield",
  fragment: FRAGMENT,
  uniforms: {
    uStarColour: { value: vec3([1.0, 0.86, 0.45]), type: "vec3<f32>" },
    uGlowColour: { value: vec3([0.55, 0.4, 0.12]), type: "vec3<f32>" },
    uSpaceColour: { value: vec3([0.02, 0.018, 0.012]), type: "vec3<f32>" },
  },
};
