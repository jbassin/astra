import {
  type Application,
  type Container,
  defaultFilterVert,
  Filter,
  GlProgram,
  Graphics,
} from "pixi.js";

// A yellow/black animated starfield, modelled on strider's balatro page
// background (apps/strider/src/components/PixiHost/balatroBackground.ts): the
// shader is a reusable Pixi Filter applied to a full-screen rect, driven by a
// `uTime` uniform from the app ticker. The effect differs (a drifting starfield,
// not the balatro swirl), but the Pixi-v8 mounting idiom is the same.
//
// Pixi v8 filter convention: NO `#version` directive (Pixi prepends it), use
// `in`/`out` for varyings + individual top-level uniforms; the resource key
// (`starfieldUniforms`) is the logical group name Pixi binds them under.
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uTime;

// Palette is uniform-driven (mirroring balatroBackground) so the yellow/black
// look lives in one place — see StarfieldPalette / DEFAULT_PALETTE.
uniform vec3 uStarColour;   // warm gold star core
uniform vec3 uGlowColour;   // amber nebula haze
uniform vec3 uSpaceColour;  // deep warm-black space

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
      // Only some cells host a star.
      if (rnd.x > density) continue;
      vec2 starPos = offs + (rnd - 0.5) * 0.7;
      float d = length(gv - starPos);
      float size = mix(0.012, 0.05, rnd.y);
      float glow = smoothstep(size, 0.0, d);
      glow += smoothstep(size * 6.0, 0.0, d) * 0.25; // soft halo
      // Twinkle: each star pulses at its own rate/phase.
      float tw = 0.55 + 0.45 * sin(uTime * mix(0.8, 3.0, rnd.x) + rnd.y * 6.2831);
      total += glow * tw;
    }
  }
  return total;
}

void main() {
  // gl_FragCoord is in framebuffer pixels (CSS px * resolution) but uInputSize.xy
  // is in CSS pixels — derive screen coords from vTextureCoord so both agree on
  // high-DPR devices (the same fix balatroBackground documents). Gate by the
  // input's alpha so the field composites correctly (the rect is fully opaque,
  // so coverage is 1 everywhere).
  vec4 src = texture(uTexture, vTextureCoord);
  float coverage = src.a;

  // Aspect-correct, centred coords (normalised by height so stars stay round).
  vec2 res = uInputSize.xy;
  vec2 uv = (vTextureCoord * res - 0.5 * res) / res.y;

  // Deep space base + a slow amber nebula haze.
  vec3 col = uSpaceColour;
  float neb = fbm(uv * 1.6 + vec2(uTime * 0.012, uTime * 0.006));
  neb = pow(clamp(neb, 0.0, 1.0), 3.0);
  col += uGlowColour * neb * 0.35;

  // Three drifting parallax star layers (nearer layers are sparser and faster).
  float stars = 0.0;
  stars += starLayer(uv * 6.0 + vec2(uTime * 0.010, uTime * 0.004), 0.45);
  stars += starLayer(uv * 11.0 + vec2(uTime * 0.020, -uTime * 0.006), 0.35) * 0.8;
  stars += starLayer(uv * 18.0 + vec2(-uTime * 0.030, uTime * 0.010), 0.28) * 0.6;
  col += uStarColour * stars;

  finalColor = vec4(col, 1.0) * coverage;
}
`;

// RGB triples (0–1) for the three palette stops — a warm gold star on warm-black
// space, with an amber nebula haze.
export interface StarfieldPalette {
  star: readonly [number, number, number];
  glow: readonly [number, number, number];
  space: readonly [number, number, number];
}

export const DEFAULT_PALETTE: StarfieldPalette = {
  star: [1.0, 0.86, 0.45],
  glow: [0.55, 0.4, 0.12],
  space: [0.02, 0.018, 0.012],
};

export interface StarfieldBackground {
  mesh: Container;
  update: (elapsedMs: number) => void;
  destroy: () => void;
}

// The starfield as a full-screen rect with the shader filter, scaled to the
// renderer each frame. Caller adds `mesh` to the stage, calls `update` from the
// ticker, and `destroy` on teardown.
export function createStarfieldBackground(
  app: Application,
  palette: StarfieldPalette = DEFAULT_PALETTE,
): StarfieldBackground {
  const glProgram = GlProgram.from({
    vertex: defaultFilterVert,
    fragment: FRAGMENT_SHADER,
    name: "starfield-filter",
  });

  const filter = new Filter({
    glProgram,
    resources: {
      starfieldUniforms: {
        uTime: { value: 0, type: "f32" },
        uStarColour: { value: Float32Array.from(palette.star), type: "vec3<f32>" },
        uGlowColour: { value: Float32Array.from(palette.glow), type: "vec3<f32>" },
        uSpaceColour: { value: Float32Array.from(palette.space), type: "vec3<f32>" },
      },
    },
  });

  const rect = new Graphics().rect(0, 0, 1, 1).fill(0x000000);
  rect.label = "starfieldBackground";
  rect.filters = [filter];

  const sync = () => {
    const { width, height } = app.renderer.screen;
    rect.scale.set(width, height);
  };
  sync();

  const update = (elapsedMs: number) => {
    sync();
    (filter.resources.starfieldUniforms as { uniforms: { uTime: number } }).uniforms.uTime =
      elapsedMs / 1000;
  };

  const destroy = () => {
    rect.destroy();
    filter.destroy();
  };

  return { mesh: rect, update, destroy };
}
