import type { BackdropSpec } from "../types";
import { PAL, PREAMBLE, vec3 } from "./common";

// mouthpiece's backdrop — "resonance": a few drifting oscilloscope-like waveform
// lines (amber) whose amplitude breathes like speech, over faint concentric ripples
// (teal) emanating from centre, on the gothic void. Evokes voice/audio. Subtle by
// default (uIntensity); the void base always shows through behind text.
const FRAGMENT = `${PREAMBLE}
uniform vec3 uWave;       // amber waveform lines
uniform vec3 uRipple;     // teal concentric ripples
uniform vec3 uSpace;      // void base
uniform float uIntensity; // overall presence (tune to taste)

void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  float coverage = src.a;

  // Aspect-correct, centred coords (normalised by height).
  vec2 res = uInputSize.xy;
  vec2 uv = (vTextureCoord * res - 0.5 * res) / res.y;

  vec3 add = vec3(0.0);

  // Stacked travelling waveform lines; amplitude modulated so they "breathe".
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float freq = 2.5 + fi * 1.7;
    float speed = 0.6 + fi * 0.35;
    float amp = 0.12 - fi * 0.025;
    float env = 0.6 + 0.4 * sin(uTime * (0.5 + fi * 0.2) + uv.x * 1.5 + fi);
    float y = sin(uv.x * freq + uTime * speed + fi * 2.1) * amp * env;
    float d = abs(uv.y - y);
    add += uWave * smoothstep(0.02, 0.0, d) * (1.0 - fi * 0.22);
  }

  // Slow concentric ripples from centre, faded out toward the edges.
  float r = length(uv);
  float ripple = sin(r * 14.0 - uTime * 1.6);
  ripple = smoothstep(0.6, 1.0, ripple) * smoothstep(1.1, 0.2, r);
  add += uRipple * ripple * 0.5;

  vec3 col = uSpace + add * uIntensity;
  finalColor = vec4(col, 1.0) * coverage;
}
`;

export const mouthpieceResonance: BackdropSpec = {
  name: "mouthpieceResonance",
  fragment: FRAGMENT,
  uniforms: {
    uWave: { value: vec3(PAL.amber), type: "vec3<f32>" },
    uRipple: { value: vec3(PAL.teal), type: "vec3<f32>" },
    uSpace: { value: vec3(PAL.void), type: "vec3<f32>" },
    uIntensity: { value: 0.7, type: "f32" },
  },
};
