import type { BackdropSpec } from "../types";
import { PAL, PREAMBLE, vec3 } from "./common";

// mouthpiece alternative — "interference": two ripple SOURCES (amber + teal, the two
// hosts) sit left and right and emit concentric waves that overlap into a slowly
// breathing interference moiré. Thematically a two-host debate: two voices meeting in
// the middle. Each point is coloured by whichever voice's wave dominates there.
const FRAGMENT = `${PREAMBLE}
uniform vec3 uVoiceA;     // amber — host on the left
uniform vec3 uVoiceB;     // teal  — host on the right
uniform vec3 uSpace;      // void base
uniform float uIntensity; // overall presence (tune to taste)
uniform float uSpeed;     // animation rate (tune to taste; lower = slower)

void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  float coverage = src.a;

  // Aspect-correct, centred coords (normalised by height).
  vec2 res = uInputSize.xy;
  vec2 uv = (vTextureCoord * res - 0.5 * res) / res.y;

  // Single time scalar so the whole field's pace is one knob (uSpeed).
  float t = uTime * uSpeed;

  // Two sources, drifting a touch so the pattern never freezes.
  vec2 sa = vec2(-0.55 + 0.04 * sin(t * 0.13), -0.04);
  vec2 sb = vec2(0.55 + 0.04 * sin(t * 0.11 + 2.0), 0.04);
  float da = length(uv - sa);
  float db = length(uv - sb);

  // Two concentric ripple fields at slightly different rates.
  float k = 17.0;
  float wa = sin(da * k - t * 1.4);
  float wb = sin(db * k - t * 1.2 + 1.5);

  // Constructive crests of the summed field = the bright interference bands.
  float interf = (wa + wb) * 0.5;            // -1 .. 1
  float crest = smoothstep(0.30, 1.0, interf);

  // Fade with distance from the two sources (concentrated where the voices are,
  // softer at the far corners) + a gentle overall vignette.
  float atten = exp(-da * 0.85) + exp(-db * 0.85);
  float vignette = smoothstep(1.25, 0.2, length(uv));
  crest *= clamp(atten, 0.0, 1.5) * vignette;

  // Colour each point by whichever voice's wave leads there.
  float mixAB = clamp(0.5 + 0.6 * (wa - wb), 0.0, 1.0);
  vec3 voice = mix(uVoiceB, uVoiceA, mixAB);

  vec3 col = uSpace + voice * crest * uIntensity;
  finalColor = vec4(col, 1.0) * coverage;
}
`;

export const mouthpieceInterference: BackdropSpec = {
  name: "mouthpieceInterference",
  fragment: FRAGMENT,
  uniforms: {
    uVoiceA: { value: vec3(PAL.amber), type: "vec3<f32>" },
    uVoiceB: { value: vec3(PAL.teal), type: "vec3<f32>" },
    uSpace: { value: vec3(PAL.void), type: "vec3<f32>" },
    uIntensity: { value: 0.9, type: "f32" },
    uSpeed: { value: 0.2, type: "f32" },
  },
};
