// Shared building blocks for the astra backdrop shaders: the vec3 uniform helper and the
// value-noise/fbm GLSL helpers (lifted from harrow's starfield so the look is preserved). Each
// shader composes `${NOISE_GLSL}` into its fragment. Palette colours come from
// `@astra/gothic/palette` (`gothic.rgb`), generated from gothic's token source.

type Triple = readonly [number, number, number];

/** A vec3 uniform value (RGB 0–1) as the Float32Array Pixi wants. */
export const vec3 = (c: Triple): Float32Array => Float32Array.from(c);

// Hashed value noise + 4-octave fbm — identical to harrow's starfield helpers, so
// the starfield renders pixel-for-pixel as before once it consumes these.
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return sum;
}
`;

// The shared fragment preamble: precision + varyings + the implicit Pixi filter
// uniforms (uTexture/uInputSize) + uTime. Each shader appends its own uniforms,
// NOISE_GLSL, and main().
export const PREAMBLE = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uTime;
`;
