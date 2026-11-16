// GLSL for the arm strip (see strip.ts for the attributes). The sandbox page in
// `apps/portal/arms/bench/` runs the same vertex shader and prelude, so a fragment shader written
// there drops into FRAGMENTS unchanged. The shared smear buffer's passes (smear.ts) are at the end.
// The bench page embeds this file (bench/sync-bench.mjs), so it runs exactly these shaders.

import { BURST_DECAY } from "./look";

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
 * Output is premultiplied alpha. uShimmer (0..1), uShatter (seconds since the arm shattered on
 * this client, -1 when it is not shattered, huge when it was already shattered when built) and
 * uBroken (0..1, how broken it looks) are the arm's shimmer and shatter state (shatter.ts);
 * uSheenSpeed, uShardPx and uBurstLen are the shared tuning (`tune` in shatter.ts). Only the ink
 * paint shader uses them.
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
uniform float uShimmer;
uniform float uShatter;
uniform float uBroken;
uniform float uSheenSpeed;
uniform float uShardPx;
uniform float uBurstLen;
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

/** The ink pattern's scale and drift, shared by the ink paint shader and the hand. */
const INK_PATTERN = `const float INK_PX = 90.;  // body pattern size, in pixels
const float FLOW = .35;    // how fast the body's pattern drifts toward the hand`;

/**
 * What the shimmer and the shatter share between the arm's paint pass and the hands in the buffer
 * pass (both include NOISE2 first, and declare uTime and uSheenSpeed).
 */
const INK_FX = `const float SHEEN_PERIOD = 300.;  // distance between the sheen's bands, in pixels
const float BURST_DECAY = ${BURST_DECAY.toFixed(2)};
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// Shards: a Voronoi pattern over p (one cell per unit). x is the gap between the nearest and the
// second nearest feature point (0 on a crack, growing into a cell), y a random 0..1 per cell.
vec2 shards(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float d1 = 8.;
  float d2 = 8.;
  float id = 0.;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + hash22(i + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash(i + g + 7.3); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}
// The shimmer's pattern, 0..1: a base glint, bands travelling toward larger x (toward the hand),
// and sparse twinkles at p (pixels).
float sheen(float x, vec2 p) {
  float bands = pow(.5 + .5 * sin(6.2832 * (x - uTime * uSheenSpeed) / SHEEN_PERIOD), 3.);
  float twinkle = pow(noise(p / 12. + vec2(uTime * 2., 0.)), 5.);
  return clamp(.3 + .7 * bands + 1.5 * twinkle, 0., 1.);
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
${INK_PATTERN}
${INK_FX}
// The arm's shimmer and shatter, in the arm's own pixels ap (along, across). fx is what goes in
// the arm texture's green, blue and alpha, as fractions of the ink: x the sheen (0 when the arm
// is not shimmering), y a crack code (.35 * broken for the dulled shard, rising to 1 on a crack
// line, whose half width in pixels is 5 * broken + 14 * burst), z the flash (burst cubed). Returns
// the factor the ink density is multiplied by: thinner when broken, and at the burst's peak the
// shards with a high random value are blasted away and come back as the burst dies down.
float armFx(vec2 ap, out vec3 fx) {
  fx = vec3(0.);
  float keep = 1.;
  if (uShimmer > 0.) fx.x = uShimmer * sheen(ap.x, ap);
  float burst = (uShatter < 0. || uShatter >= uBurstLen) ? 0. : exp(-uShatter * BURST_DECAY / uBurstLen);
  if (uBroken > 0. || burst > 0.) {
    vec2 s = shards(ap / uShardPx);
    float edge = s.x * uShardPx * .5;
    float w = 5. * uBroken + 14. * burst;
    float line = (1. - smoothstep(w - 2., w + 2., edge)) * smoothstep(0., 2., w);
    keep = (1. - .3 * uBroken) * (1. - burst * smoothstep(.35, .75, s.y));
    fx.y = .35 * uBroken + .65 * line;
    fx.z = burst * burst * burst * (.6 + .4 * s.y);
  }
  return keep;
}
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
  vec3 fx;
  float whole = paint;
  paint *= armFx(ap, fx);
  // Premultiplied by the density; the smear passes decode and fade these (see INK_BUFFER_FRAG).
  // The flash uses the density before the burst blasted shards away, so the ink that lingers
  // where a shard was still flares.
  gl_FragColor = vec4(paint, paint * fx.xy, whole * fx.z);
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

/** How many hands the buffer pass draws at most; ink arms past this many get no hand. */
export const MAX_HANDS = 8;

/**
 * The buffer pass (the Shadertoy shader's Buffer A, fixed to the map): reads the ink the arms
 * painted this frame (uArm, .r) and last frame's buffer (uBuffer), adds the hands, spreads and
 * swirls the ink, and fades it. uRegion is (x, y, size in map pixels, texture size in texels);
 * uDelta is seconds since the last frame. The first uHandCount entries of uHands (x, y in map
 * pixels, then the arm's unit direction at the hand) and uHandParams (radius in pixels, thumb
 * side ±1, finger curl 0..1, the hand's shimmer and shatter packed by `packFx`) are the hands.
 * Drawn with blending off. The buffer's channels: r the ink density, g the shimmer, b the crack
 * code, a the flash (each of the last three already multiplied by the density).
 */
export const INK_BUFFER_FRAG = `precision highp float;
#define MAX_HANDS ${MAX_HANDS}
uniform float uTime;
uniform float uDelta;
uniform sampler2D uBuffer;
uniform sampler2D uArm;
uniform vec4 uRegion;
uniform vec4 uHands[MAX_HANDS];
uniform vec4 uHandParams[MAX_HANDS];
uniform float uHandCount;
uniform float uSheenSpeed;
uniform float uShardPx;
varying vec2 vUv;

const float fade = .5;        // how fast smears fade, per second (lower: longer smears)
const float PUSH_PX = 150.;   // how fast turbulence pushes ink, in pixels per second
const float SWIRL_PX = 400.;  // size of the turbulence pattern, in pixels
const float SWIRL_SPEED = .05;// how fast the turbulence pattern changes
const float SPREAD_PX = 8.;   // how far the spreading looks for the ink's slope
const float HAND_CLEAR = 10.; // smears fade this many times faster in and around a hand
const float HAND_CLEAR_R = .6;// how far around the hand that reaches, in hand radii
// A texel farther than this from a hand's centre, in hand radii, skips that hand. The hand
// reaches about 2 radii (fingertips at curl 0, the wrist) and its clearing zone 0.6 beyond.
const float HAND_REACH = 2.6;
const float FX_FADE = 10.;    // the arm texture's green, blue and alpha fade this fast, per second
const float FLASH_SPREAD = 8.;// how much harder the flash pushes ink down its slope
${INK_PATTERN}

#define TEX1(uv) texture2D(uBuffer, uv).r

${NOISE2}
${INK_FX}

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

// ---- The hand: an upturned hand under the token, as a signed distance field. ----
// Ported from the bench's WORLD_INK_BUFFER. Local coordinates are in hand radii: x points on
// from the arm toward the fingers, y toward the thumb. Negative distance is inside the hand.
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - r;
}
float sdEllipse(vec2 p, vec2 r) { return (length(p / r) - 1.) * min(r.x, r.y); }
// Smooth union, so palm, fingers and wrist melt together like one piece of ink.
float smin(float a, float b, float k) {
  float h = clamp(.5 + .5 * (b - a) / k, 0., 1.);
  return mix(b, a, h) - k * h * (1. - h);
}
const float FINGER_W = 1.0;    // finger and thumb thickness (1 = as drawn below)
const float FINGER_L = 1.0;    // finger and thumb length
const float CURL_RISE = 1.0;   // how high curled fingers rise above the palm (shows as shading)
const float CURL_CLOSE = .55;  // how far curled fingertips turn in toward the middle (radians)

vec2 rot(vec2 v, float a) { return vec2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)); }

// Distance along a capsule's spine, 0 at a and 1 at b.
float along(vec2 p, vec2 a, vec2 b) { vec2 ba = b - a; return clamp(dot(p - a, ba) / dot(ba, ba), 0., 1.); }

// Signed distance to the hand with fingers curled by curl (0..1); h returns how high the hand is
// there (0 palm, up to 1 at a fully curled fingertip). Height becomes ink density, which the
// image pass lights as relief.
float hand(vec2 q, float curl, out float h) {
  float d = sdEllipse(q - vec2(-.05, 0.), vec2(.85, .78));              // palm, under the token
  d = smin(d, sdCapsule(q, vec2(-1.4, 0.), vec2(-.5, 0.), .4), .25);    // wrist, into the arm
  h = 0.;
  float nearest = 1e3;
  for (int i = 0; i < 4; i++) {
    float f = float(i) - 1.5;
    float a = f * .46;                                                  // fingers fan out
    vec2 dir = vec2(cos(a), sin(a));
    vec2 base = dir * .65;
    vec2 knuckle = dir * (.65 + (.6 - .08 * abs(f)) * FINGER_L);        // middle fingers longest
    // Curled fingers bend up toward the viewer (shorter from above) and close in.
    vec2 tipDir = rot(dir, -sign(f) * curl * CURL_CLOSE * (abs(f) / 1.5));
    vec2 tip = knuckle + tipDir * .55 * FINGER_L * (1. - curl * .6);
    float d1 = sdCapsule(q, base, knuckle, .24 * FINGER_W);
    float d2 = sdCapsule(q, knuckle, tip, (.2 + .05 * curl) * FINGER_W);
    if (d1 < nearest) { nearest = d1; h = .5 * curl * along(q, base, knuckle); }
    if (d2 < nearest) { nearest = d2; h = curl * (.5 + .5 * along(q, knuckle, tip)); }
    d = smin(d, d1, .14);
    d = smin(d, d2, .07);
  }
  vec2 tb = vec2(-.2, .6);                                              // thumb
  vec2 tk = tb + normalize(vec2(.55, .6)) * .6 * FINGER_L;
  vec2 tt = tk + rot(normalize(vec2(1., -.3)), -curl * CURL_CLOSE) * .5 * FINGER_L * (1. - curl * .5);
  float t1 = sdCapsule(q, tb, tk, .28 * FINGER_W);
  float t2 = sdCapsule(q, tk, tt, .23 * FINGER_W);
  if (t1 < nearest) { nearest = t1; h = .4 * curl * along(q, tb, tk); }
  if (t2 < nearest) { nearest = t2; h = curl * (.4 + .5 * along(q, tk, tt)); }
  d = smin(d, t1, .16);
  d = smin(d, t2, .07);
  // Height only where a finger is the nearest part (not over the palm).
  h *= 1. - smoothstep(-.05, .1, nearest - d);
  return d;
}

void main() {
  // The ink bodies the arms painted this frame: density in r, and in g, b and a the shimmer, crack
  // code and flash, each already multiplied by the density (see the ink paint shader).
  vec4 armData = texture2D(uArm, vUv);
  float paint = armData.r;
  vec3 fx = armData.gba;

  // The hands, in the same ink, with their pattern in map coordinates. Their edges are firmer
  // and their noise weaker than the arms', so the fingers read as fingers. Hands combine by max.
  vec2 wpx = uRegion.xy + vUv * uRegion.z;
  float handPaint = 0.;
  float handZone = 0.;  // 1 in and just around a hand, where smears are cleared fast
  float hn = -1.;       // the hands' shared noise, worked out only for a texel inside a hand
  vec3 handFx = vec3(0.);
  for (int i = 0; i < MAX_HANDS; i++) {
    if (float(i) >= uHandCount) break;
    vec4 at = uHands[i];
    vec4 params = uHandParams[i];
    vec2 rel = wpx - at.xy;
    float reach = HAND_REACH * params.x;
    if (dot(rel, rel) > reach * reach) continue;
    vec2 hq = vec2(dot(rel, at.zw), dot(rel, vec2(-at.w, at.z)) * params.y) / params.x;
    float height;
    float d = hand(hq, params.z, height);
    handZone = max(handZone, 1. - smoothstep(0., HAND_CLEAR_R, d));
    float density = clamp(-d / .15, 0., 1.);
    if (density <= 0.) continue;
    if (hn < 0.) {
      vec2 drift = vec2(uTime * FLOW, 0.);
      vec2 h2 = wpx / INK_PX;
      float ha = fbm2(h2 * .8 - drift) * 6.28 * 2. + uTime;
      hn = fbm2(h2 + vec2(cos(ha), sin(ha)) * .35 - drift * 1.3);
    }
    // The palm sits low (denser ink reads higher), curled fingers rise toward full density.
    float level = mix(.55, 1., clamp(height * CURL_RISE, 0., 1.));
    float ink = clamp(density * level + (hn - .5) * .3, 0., 1.) * smoothstep(0., .1, density);
    float whole = ink;  // before a burst blasts shards away

    // The hand's shimmer and shatter, packed in the fourth param (see packFx in shatter.ts):
    // 5 bits each of shimmer, broken and burst. Same look as the arm's, in hand radii.
    float pk = params.w;
    float hs = mod(pk, 32.) / 31.;
    float hb = mod(floor(pk / 32.), 32.) / 31.;
    float hu = floor(pk / 1024.) / 31.;
    vec3 hfx = vec3(0.);
    if (hs > 0.) hfx.x = hs * sheen(dot(rel, at.zw), wpx);
    if (hb > 0. || hu > 0.) {
      float cell = .55 * uShardPx / 80.;
      vec2 s = shards(hq / cell);
      float edge = s.x * cell * .5;
      float w = .05 * hb + .13 * hu;
      float line = (1. - smoothstep(w - .03, w + .03, edge)) * smoothstep(0., .03, w);
      ink *= (1. - .3 * hb) * (1. - hu * smoothstep(.35, .75, s.y));
      hfx.y = .35 * hb + .65 * line;
      hfx.z = hu * hu * hu * (.6 + .4 * s.y);
    }
    handPaint = max(handPaint, ink);
    handFx = max(handFx, vec3(ink * hfx.xy, whole * hfx.z));
  }
  paint = max(paint, handPaint);
  fx = max(fx, handFx);

  // Spreading: push ink down its own slope, so edges creep outward.
  float px = uRegion.z;  // pixels per unit of vUv
  vec3 unit = vec3(vec2(SPREAD_PX / px), 0.);
  vec4 data = texture2D(uBuffer, vUv);
  vec3 normal = normalize(vec3(
    TEX1(vUv - unit.xz) - TEX1(vUv + unit.xz),
    TEX1(vUv - unit.zy) - TEX1(vUv + unit.zy),
    data.x * data.x) + .001);
  vec2 offset = -normal.xy * (1. + FLASH_SPREAD * data.a);

  // Turbulence, in map pixels.
  vec2 wp = vUv * px;
  float spice = fbm3(vec3(wp / SWIRL_PX, uTime * SWIRL_SPEED)) * 6.28 * 2. + uTime;
  offset += vec2(cos(spice), sin(spice));

  vec2 uv = vUv + offset * PUSH_PX * uDelta / px;
  float frame = texture2D(uBuffer, uv).x;
  paint = max(paint, frame - uDelta * fade * (1. + HAND_CLEAR * handZone));

  // Keep the square's border empty.
  float border = min(min(vUv.x, vUv.y), min(1. - vUv.x, 1. - vUv.y));
  float keepBorder = smoothstep(0., .02, border);
  paint *= keepBorder;
  // The shimmer, crack code and flash are not advected: they are stamped fresh each frame where
  // the arms and hands are now, and what they left behind fades fast, so they hug the ink body.
  fx = max(fx, data.gba - uDelta * FX_FADE) * keepBorder;
  gl_FragColor = vec4(clamp(paint, 0., 1.), clamp(fx, 0., 1.));
}`;

export { INK_IMAGE_FRAG } from "./ink-image";
