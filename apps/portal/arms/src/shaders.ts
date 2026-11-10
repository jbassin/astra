// GLSL for the arm strip (see strip.ts for the attributes). The sandbox page in
// `apps/portal/arms/bench/` runs the same vertex shader and prelude, so a fragment shader written
// there drops into FRAGMENTS unchanged. The shared smear buffer's passes (smear.ts) are at the end.

export const ARM_VERT = `precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aUv;
attribute float aDist;
attribute float aSeg;
attribute float aHalf;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUv;
varying float vDist;
varying float vSeg;
varying float vHalf;
void main() {
  vUv = aUv; vDist = aDist; vSeg = aSeg; vHalf = aHalf;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

/**
 * Put in front of every fragment shader. uTime is seconds, uLength the centre line's length in
 * pixels, uSegments the segment count, uColorA/B/C the flag's fill, outline and glow colours,
 * uOutlineWidth the flag's outline width in pixels. uAlpha is the arm's opacity (a hidden token's
 * arm is half transparent): PIXI does not apply it to a custom shader, so the shader must.
 * Output is premultiplied alpha.
 */
export const FRAGMENT_PRELUDE = `precision highp float;
#define PI 3.14159265
uniform float uTime;
uniform float uLength;
uniform float uSegments;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uOutlineWidth;
uniform float uAlpha;
varying vec2 vUv;
varying float vDist;
varying float vSeg;
varying float vHalf;`;

/**
 * The shader name that draws through the shared smear buffer (smear.ts) instead of on the arm
 * itself. Its `FRAGMENTS` entry is the paint pass: the arm's own mesh stays hidden, and a second
 * mesh on the same geometry draws that shader into the smear's arm texture.
 */
export const SMEAR_SHADER = "ink";

const NOISE2 = `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p) {
  float r = 0.;
  float a = .5;
  for (int i = 0; i < 4; i++) {
    r += noise(p) * a;
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= .5;
  }
  return r;
}`;

/** Fragment shader bodies by the name the flag's `shader` field gives. */
export const FRAGMENTS: Readonly<Record<string, string>> = {
  // Body in the fill colour with an outline-coloured edge: the module's original look.
  flat: `void main() {
  float edge = (1.0 - abs(vUv.y)) * vHalf;  // pixels in from the edge
  float rim = uOutlineWidth > 0.0
    ? 1.0 - smoothstep(uOutlineWidth - 1.0, uOutlineWidth + 1.0, edge)
    : 0.0;
  gl_FragColor = vec4(mix(uColorA, uColorB, rim), 1.0) * uAlpha;
}`,
  // The ink arm's paint pass (see SMEAR_SHADER): the ink body's density, patterned in the arm's
  // own pixels so it flows from shoulder to hand. It is drawn into the smear's arm texture with
  // normal (premultiplied) blending, so where arms overlap the densities combine as a + b - ab,
  // whatever order the arms are drawn in. It is density, not colour, so it ignores uAlpha.
  // Ported from the body code of the bench's WORLD_INK_BUFFER.
  [SMEAR_SHADER]: `${NOISE2}
const float INK_PX = 90.;  // body pattern size, in pixels
const float FLOW = .35;    // how fast the body's pattern drifts toward the hand
void main() {
  float across = abs(vUv.y);
  float body = 1. - across * across;
  vec2 ap = vec2(vDist, vUv.y * vHalf);
  vec2 q = ap / INK_PX;
  vec2 drift = vec2(uTime * FLOW, 0.);
  float angle = fbm2(q * .8 - drift) * 6.28 * 2. + uTime;
  vec2 warp = vec2(cos(angle), sin(angle)) * .35;
  float n = fbm2(q + warp - drift * 1.3);
  float paint = clamp(body * 1.25 + (n - .5) * 1.6 - .1, 0., 1.) * smoothstep(0., .2, body);
  gl_FragColor = vec4(paint);
}`,
};

const DEFAULT_SHADER = "flat";

/** The full fragment source for a shader name; an unknown name gets `flat`. */
export function fragmentSource(name: string): string {
  const body = Object.hasOwn(FRAGMENTS, name) ? FRAGMENTS[name] : FRAGMENTS[DEFAULT_SHADER];
  return `${FRAGMENT_PRELUDE}\n${body}`;
}

// ---- The shared smear buffer's passes (smear.ts), ported from the bench's "world" mode ----

/** Vertex shader for the smear's square quads; `aUv` runs 0..1 across the square. */
export const QUAD_VERT = `precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aUv;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

/**
 * The buffer pass (the Shadertoy shader's Buffer A, fixed to the map): reads the ink the arms
 * painted this frame (uArm, .r) and last frame's buffer (uBuffer), spreads and swirls the ink,
 * and fades it. uRegion is (x, y, size in map pixels, texture size in texels); uDelta is seconds
 * since the last frame. Drawn with blending off.
 */
export const INK_BUFFER_FRAG = `precision highp float;
uniform float uTime;
uniform float uDelta;
uniform sampler2D uBuffer;
uniform sampler2D uArm;
uniform vec4 uRegion;
varying vec2 vUv;

const float fade = .5;        // how fast smears fade, per second (lower: longer smears)
const float PUSH_PX = 150.;   // how fast turbulence pushes ink, in pixels per second
const float SWIRL_PX = 400.;  // size of the turbulence pattern, in pixels
const float SWIRL_SPEED = .05;// how fast the turbulence pattern changes
const float SPREAD_PX = 8.;   // how far the spreading looks for the ink's slope

#define TEX1(uv) texture2D(uBuffer, uv).r

float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3. - 2. * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1., 0., 0.)), u.x),
        mix(hash3(i + vec3(0., 1., 0.)), hash3(i + vec3(1., 1., 0.)), u.x), u.y),
    mix(mix(hash3(i + vec3(0., 0., 1.)), hash3(i + vec3(1., 0., 1.)), u.x),
        mix(hash3(i + vec3(0., 1., 1.)), hash3(i + vec3(1., 1., 1.)), u.x), u.y), u.z);
}
float fbm3(vec3 p) {
  float result = 0.;
  float amplitude = .5;
  for (int index = 0; index < 3; index++) {
    result += noise3(p / amplitude) * amplitude;
    amplitude /= 3.;
  }
  return result;
}

void main() {
  // The ink bodies the arms painted this frame.
  float paint = texture2D(uArm, vUv).r;

  // Spreading: push ink down its own slope, so edges creep outward.
  float px = uRegion.z;  // pixels per unit of vUv
  vec3 unit = vec3(vec2(SPREAD_PX / px), 0.);
  vec4 data = texture2D(uBuffer, vUv);
  vec3 normal = normalize(vec3(
    TEX1(vUv - unit.xz) - TEX1(vUv + unit.xz),
    TEX1(vUv - unit.zy) - TEX1(vUv + unit.zy),
    data.x * data.x) + .001);
  vec2 offset = -normal.xy;

  // Turbulence, in map pixels.
  vec2 wp = vUv * px;
  float spice = fbm3(vec3(wp / SWIRL_PX, uTime * SWIRL_SPEED)) * 6.28 * 2. + uTime;
  offset += vec2(cos(spice), sin(spice));

  vec2 uv = vUv + offset * PUSH_PX * uDelta / px;
  float frame = texture2D(uBuffer, uv).x;
  paint = max(paint, frame - uDelta * fade);

  // Keep the square's border empty.
  float border = min(min(vUv.x, vUv.y), min(1. - vUv.x, 1. - vUv.y));
  paint *= smoothstep(0., .02, border);
  gl_FragColor = vec4(clamp(paint, 0., 1.));
}`;

/**
 * The image pass (the Shadertoy shader's Image tab): lights the buffer across the whole square,
 * so smears show wherever they drift. uColorA is the body colour. uColorC (glow) is declared so
 * the pass has the same colour inputs as an arm, but this lighting, like the bench's, does not
 * use it. Output is premultiplied and multiplied by uAlpha, as every visible shader's must be.
 */
export const INK_IMAGE_FRAG = `precision highp float;
uniform sampler2D uBuffer;
uniform vec4 uRegion;
uniform vec3 uColorA;
uniform vec3 uColorC;
uniform float uAlpha;
varying vec2 vUv;

#define TEX(uv) texture2D(uBuffer, uv).r
#define ss(a, b, t) smoothstep(a, b, t)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  float gray = TEX(uv);
  if (gray < .01) { gl_FragColor = vec4(0.); return; }

  vec3 unit = vec3(vec2(3. / uRegion.w), 0.);
  vec3 normal = normalize(vec3(
    TEX(uv + unit.xz) - TEX(uv - unit.xz),
    TEX(uv - unit.zy) - TEX(uv + unit.zy),
    gray * gray * gray + .001));

  vec3 color = uColorA + vec3(.3) * (1. - abs(normal.z));
  vec3 dir = normalize(vec3(0., 1., 2.));
  float specular = pow(dot(normal, dir) * .5 + .5, 20.);
  color += vec3(.5) * ss(.2, 1., specular);
  vec3 tint = .5 + .5 * cos(vec3(1., 2., 3.) + dot(normal, dir) * 4. - uv.y * 3. - 3.);
  color += tint * smoothstep(.15, .0, gray);
  color -= hash(gl_FragCoord.xy) * .1;

  float a = ss(.03, .35, gray);
  gl_FragColor = vec4(clamp(color, 0., 1.) * a, a) * uAlpha;
}`;
