import {
  type Application,
  type Container,
  defaultFilterVert,
  Filter,
  GlProgram,
  Graphics,
} from "pixi.js";

// Pixi v8 filter convention: NO `#version` directive (Pixi prepends it), use
// `in`/`out` for varyings + individual top-level uniforms; the resource key
// (`balatroUniforms`) is the logical group name Pixi binds them under.
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uTime;

// Palette is uniform-driven so one shader serves both the page background
// (teal/amber) and the tithe wave (purple/black) — see BalatroPalette.
uniform vec3 uColour1;
uniform vec3 uColour2;
uniform vec3 uColour3;

// When > 0.5 the three palette stops are derived per-pixel from the input
// texture's own colour (the faction-coloured hexes) instead of the uniforms,
// so one filter tints every hex by its faction's colour. See createBalatroFilter.
uniform float uTintFromTexture;

// Scales the additive "light" crest (the bright highlight the swirl adds on top).
// 1.0 = full strength (page background / tithe); the faction-tint mode dials it
// way down so the swirl stays subtle and the dark hex borders aren't washed out.
uniform float uLightScale;

#define SPIN_ROTATION -2.0
#define SPIN_SPEED 4.0
#define OFFSET vec2(0.0)
#define COLOUR_1 vec4(uColour1, 1.0)
#define COLOUR_2 vec4(uColour2, 1.0)
#define COLOUR_3 vec4(uColour3, 1.0)
#define CONTRAST 2.5
#define LIGTHING 0.25
#define SPIN_AMOUNT 0.25
#define PIXEL_FILTER 745.0
#define SPIN_EASE 1.0
#define PI 3.14159265359
#define IS_ROTATE false

vec4 effect(vec2 screenSize, vec2 screen_coords, vec4 c1, vec4 c2, vec4 c3) {
  float pixel_size = length(screenSize.xy) / PIXEL_FILTER;
  vec2 uv = (floor(screen_coords.xy * (1.0 / pixel_size)) * pixel_size - 0.5 * screenSize.xy) / length(screenSize.xy) - OFFSET;
  float uv_len = length(uv);

  float speed = (SPIN_ROTATION * SPIN_EASE * 0.2);
  if (IS_ROTATE) {
    speed = uTime * speed;
  }
  speed += 302.2;
  float new_pixel_angle = atan(uv.y, uv.x) + speed - SPIN_EASE * 20.0 * (1.0 * SPIN_AMOUNT * uv_len + (1.0 - 1.0 * SPIN_AMOUNT));
  vec2 mid = (screenSize.xy / length(screenSize.xy)) / 2.0;
  uv = (vec2((uv_len * cos(new_pixel_angle) + mid.x), (uv_len * sin(new_pixel_angle) + mid.y)) - mid);

  uv *= 30.0;
  speed = uTime * (SPIN_SPEED);
  vec2 uv2 = vec2(uv.x + uv.y);

  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * vec2(cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121), sin(uv2.x - 0.113 * speed));
    uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
  }

  float contrast_mod = (0.25 * CONTRAST + 0.5 * SPIN_AMOUNT + 1.2);
  float paint_res = min(2.0, max(0.0, length(uv) * (0.035) * contrast_mod));
  float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  float c3p = 1.0 - min(1.0, c1p + c2p);
  float light = (LIGTHING - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + LIGTHING * max(c2p * 5.0 - 4.0, 0.0);
  return (0.3 / CONTRAST) * c1
    + (1.0 - 0.3 / CONTRAST) * (c1 * c1p + c2 * c2p + vec4(c3p * c3.rgb, c3p * c1.a))
    + light * uLightScale;
}

void main() {
  // gl_FragCoord is in framebuffer pixels (CSS px * resolution), but uInputSize.xy
  // is in CSS pixels — using gl_FragCoord directly desyncs the pattern from the
  // viewport on high-DPR devices and pushes it into the bottom-left corner. Derive
  // screen coords from vTextureCoord instead so both are in the same units.
  // Gate by the input's alpha so the shader shows only where the filtered content
  // is opaque: the page background is a full opaque rect (alpha 1 → unchanged),
  // while the tithe applies this filter to a container of flipping tiles so the
  // continuous, animated field shows through the tile shapes.
  vec4 src = texture(uTexture, vTextureCoord);
  float coverage = src.a;
  vec4 c1 = COLOUR_1;
  vec4 c2 = COLOUR_2;
  vec4 c3 = COLOUR_3;
  if (uTintFromTexture > 0.5) {
    // Pixi filter input is premultiplied; recover the hex's true faction colour,
    // then build a lit highlight + a deep shadow around it. The deep shadow keeps
    // the dark per-hex strokes near-black so the grid still reads through the swirl.
    vec3 base = coverage > 0.001 ? src.rgb / coverage : src.rgb;
    // Push saturation up a touch (mix away from luminance grey).
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    base = clamp(mix(vec3(luma), base, 1.35), 0.0, 1.0);
    c1 = vec4(base, 1.0);
    // Keep the lightest and darkest stops close to the base colour so the swirl
    // stays low-contrast (small spread between brightest and darkest patches).
    c2 = vec4(clamp(base * 1.03, 0.0, 1.0), 1.0);
    c3 = vec4(base * 0.72, 1.0);
  }
  finalColor = effect(uInputSize.xy, vTextureCoord * uInputSize.xy, c1, c2, c3) * coverage;
}
`;

// RGB triples (0–1) for the shader's three palette stops. The page background
// uses the teal/amber default; the tithe wave uses the purple/black variant.
export interface BalatroPalette {
  colour1: readonly [number, number, number];
  colour2: readonly [number, number, number];
  colour3: readonly [number, number, number];
}

export const DEFAULT_PALETTE: BalatroPalette = {
  colour1: [0.27, 0.42, 0.4],
  colour2: [0.42, 0.32, 0.18],
  colour3: [0.035, 0.047, 0.063],
};

export const TITHE_PALETTE: BalatroPalette = {
  colour1: [0.3, 0.1, 0.45],
  colour2: [0.55, 0.2, 0.65],
  colour3: [0.02, 0.01, 0.04],
};

export interface BalatroFilter {
  filter: Filter;
  setTime: (elapsedMs: number) => void;
}

export interface BalatroFilterOptions {
  // Derive the palette per-pixel from the filtered content's own colour instead
  // of the `palette` argument — used to tint the faction hexes by faction colour
  // (the `palette` arg is then ignored).
  tintFromTexture?: boolean;
}

// The shader as a reusable Filter (palette-parameterized). Callers own the mesh
// it's applied to — the page background scales a full-screen rect, the tithe wave
// applies it to a world-space rect masked to flipping hexes, and the faction-tint
// variant (tintFromTexture) applies it to the faction-hex layer.
export function createBalatroFilter(
  palette: BalatroPalette = DEFAULT_PALETTE,
  opts: BalatroFilterOptions = {},
): BalatroFilter {
  const glProgram = GlProgram.from({
    vertex: defaultFilterVert,
    fragment: FRAGMENT_SHADER,
    name: "balatro-filter",
  });

  const filter = new Filter({
    glProgram,
    resources: {
      balatroUniforms: {
        uTime: { value: 0, type: "f32" },
        uTintFromTexture: { value: opts.tintFromTexture ? 1 : 0, type: "f32" },
        uLightScale: { value: opts.tintFromTexture ? 0.08 : 1, type: "f32" },
        uColour1: { value: Float32Array.from(palette.colour1), type: "vec3<f32>" },
        uColour2: { value: Float32Array.from(palette.colour2), type: "vec3<f32>" },
        uColour3: { value: Float32Array.from(palette.colour3), type: "vec3<f32>" },
      },
    },
  });

  const setTime = (elapsedMs: number) => {
    (filter.resources.balatroUniforms as { uniforms: { uTime: number } }).uniforms.uTime =
      elapsedMs / 1000;
  };

  return { filter, setTime };
}

export interface BalatroBackground {
  mesh: Container;
  update: (elapsedMs: number) => void;
  destroy: () => void;
}

export function createBalatroBackground(app: Application): BalatroBackground {
  const { filter, setTime } = createBalatroFilter();

  const rect = new Graphics().rect(0, 0, 1, 1).fill(0x000000);
  rect.label = "balatroBackground";
  rect.filters = [filter];

  const sync = () => {
    const { width, height } = app.renderer.screen;
    rect.scale.set(width, height);
  };
  sync();

  const update = (elapsedMs: number) => {
    sync();
    setTime(elapsedMs);
  };

  const destroy = () => {
    rect.destroy();
    filter.destroy();
  };

  return { mesh: rect, update, destroy };
}
