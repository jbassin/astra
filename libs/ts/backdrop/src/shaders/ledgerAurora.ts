import type { BackdropSpec } from "../types";
import { NOISE_GLSL, PAL, PREAMBLE, vec3 } from "./common";

// ledger's backdrop — "aurora": a slow domain-warped flow field forms drifting
// aurora curtains, brighter toward the top, shimmering in bands, with the colour
// sweeping teal → amber → parchment across the field. ledger is the front door, so
// this is the most "summary" of the family — present but still behind content.
const FRAGMENT = `${PREAMBLE}
uniform vec3 uAuroraA;    // teal
uniform vec3 uAuroraB;    // amber
uniform vec3 uAuroraC;    // parchment
uniform vec3 uSpace;      // void base
uniform float uIntensity; // overall presence (tune to taste)
${NOISE_GLSL}
void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  float coverage = src.a;

  vec2 res = uInputSize.xy;
  vec2 uv = (vTextureCoord * res - 0.5 * res) / res.y;

  // Domain-warp the noise field → flowing curtains that drift slowly upward.
  vec2 q = vec2(
    fbm(uv * 1.5 + vec2(0.0, uTime * 0.05)),
    fbm(uv * 1.5 + vec2(5.2, 1.3) + uTime * 0.03)
  );
  float f = fbm(uv * 2.0 + q * 1.8 + vec2(uTime * 0.04, 0.0));

  float curtain = pow(clamp(f, 0.0, 1.0), 1.8);
  float vGrad = smoothstep(-0.9, 0.7, uv.y);        // brighter higher up
  float band = 0.5 + 0.5 * sin(f * 6.2831 + uTime * 0.2);
  float aurora = curtain * mix(0.4, 1.0, band) * mix(0.3, 1.0, vGrad);

  // Colour sweep across the field.
  vec3 ac = mix(uAuroraA, uAuroraB, clamp(f * 1.3, 0.0, 1.0));
  ac = mix(ac, uAuroraC, clamp((f - 0.6) * 2.0, 0.0, 1.0));

  vec3 col = uSpace + ac * aurora * uIntensity;
  finalColor = vec4(col, 1.0) * coverage;
}
`;

export const ledgerAurora: BackdropSpec = {
  name: "ledgerAurora",
  fragment: FRAGMENT,
  uniforms: {
    uAuroraA: { value: vec3(PAL.teal), type: "vec3<f32>" },
    uAuroraB: { value: vec3(PAL.amber), type: "vec3<f32>" },
    uAuroraC: { value: vec3(PAL.parchment), type: "vec3<f32>" },
    uSpace: { value: vec3(PAL.void), type: "vec3<f32>" },
    uIntensity: { value: 1.5, type: "f32" },
  },
};
