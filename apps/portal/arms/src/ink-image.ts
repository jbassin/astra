// The smear buffer's image pass: lights the buffer and draws the shimmer's kaleidoscope, the
// cracks and the flash. Split from shaders.ts for size; shaders.ts re-exports it.

/**
 * The image pass (the Shadertoy shader's Image tab): lights the buffer across the whole square,
 * so smears show wherever they drift. uColorA is the body colour and uColorC (glow) the shimmer's
 * and the cracks' glow. Output is premultiplied and multiplied by uAlpha, as every visible
 * shader's must be. The buffer's g, b and a (shimmer, crack code, flash; see INK_BUFFER_FRAG)
 * are divided by the density r to get fractions of the ink: shimmer shows a kaleidoscope (hexagonal
 * mirror-folded cells that snap round, warm toward glow and teal at the edges), a broken arm is greyer and thinner with see-through crack lines edged in glow, and the
 * flash whitens it. uShimmerGain scales the shimmer; uCrackDark is how much a crack line cuts
 * away.
 */
export const INK_IMAGE_FRAG = `precision highp float;
uniform sampler2D uBuffer;
uniform vec4 uRegion;
uniform vec3 uColorA;
uniform vec3 uColorC;
uniform float uAlpha;
uniform float uTime;
uniform float uShimmerGain;
uniform float uCrackDark;
uniform float uKaleidoPx;
uniform float uSnapEvery;
uniform float uSnapSpread;  // 0: every cell snaps together; 1: each at its own time
uniform float uGlassGain;   // how strongly a shattered arm shows its frozen kaleidoscope
varying vec2 vUv;

#define TEX(uv) texture2D(uBuffer, uv).r
#define ss(a, b, t) smoothstep(a, b, t)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

const float PI = 3.14159265;
const float SNAP_LEN = .5;        // seconds a snap takes

// The nearest hexagonal cell to p (one cell is 1 wide and 1.73 tall): xy is p from the cell's
// centre, zw the cell's id.
vec4 hexCell(vec2 p) {
  const vec2 r = vec2(1., 1.7320508);
  const vec2 h = r * .5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  return vec4(g, p - g);
}
float easeCubic(float x) { return x < .5 ? 4. * x * x * x : 1. - pow(-2. * x + 2., 3.) / 2.; }

// The shimmer's kaleidoscope at map position p (pixels): hexagonal cells uKaleidoPx wide, each
// mirror-folded into wedges around its centre, filled with a cheap iterated domain warp (warm
// toward the glow colour in the middle of a cell, teal at its edge, hard bright facets). Every
// uSnapEvery seconds a cell's fold snaps a sixth of a turn over SNAP_LEN with a cubic ease, zooming
// in a little and flashing; pulse (0..1) is that snap's strength. tm is the time to evaluate at
// (uTime for the live pattern, a fixed time for a shattered arm's frozen glass), live 1 lets
// the snaps happen and 0 holds the fold still, and burst (0..1, a shattering arm's flash) forces
// every cell into a snap together: the fold turns a whole wedge (which looks the same as where it
// started) as the burst dies away, zoomed in and with the pulse at full strength.
vec3 kaleido(vec2 p, float tm, float live, float burst, out float pulse) {
  vec4 cell = hexCell(p / uKaleidoPx);
  vec2 l = cell.xy;
  float u = tm / uSnapEvery + hash(cell.zw) * uSnapSpread;
  float e = easeCubic(clamp(fract(u) * uSnapEvery / SNAP_LEN, 0., 1.));
  pulse = max(sin(e * PI) * live, burst);
  float period = PI / 3.;
  float a = mod(atan(l.y, l.x) + (floor(u) + e * live + (1. - burst)) * period, period);
  a = abs(a - period * .5);
  vec2 q = vec2(cos(a), sin(a)) * length(l) * mix(1., 1.25, pulse) * 7.;
  float t = tm * .5;
  for (int i = 0; i < 4; i++) {
    q += cos(q.yx * 1.3 + vec2(2. * t, t) + float(i) * 1.7) * .6;
    q -= abs(dot(sin(q * .9 + t), vec2(.5)));
  }
  float v = length(q);
  float edge = smoothstep(.1, .55, length(l));
  vec3 warm = mix(vec3(1., .55, .25), uColorC * 1.5, .55);
  vec3 teal = vec3(0., .85, .7);
  vec3 bands = .5 + .5 * cos(6.2832 * (vec3(0., .12, .25) + v * .22));
  vec3 color = mix(warm, teal, edge) * (.3 + bands);
  float facet = smoothstep(.0, .06, abs(fract(v * .8) - .5) - .36);
  color += vec3(.9) * facet * .45;
  return color / (1. + .3 * color);
}

void main() {
  vec2 uv = vUv;
  vec4 data = texture2D(uBuffer, uv);
  float gray = data.r;
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

  // Shimmer, shatter and flash, as fractions of the ink.
  float inv = 1. / max(gray, .05);
  float sh = clamp(data.g * inv, 0., 1.);
  float code = clamp(data.b * inv, 0., 1.);
  float flash = clamp(data.a * inv, 0., 1.);
  float dull = ss(0., .3, code);                     // a shard of a broken arm
  float cut = ss(.5, .95, code);                     // the middle of a crack line
  float rim = ss(.4, .6, code) * (1. - ss(.8, 1., code));  // a crack line's glowing edge

  color = mix(color, vec3(dot(color, vec3(.333))) * .6, dull * .7);
  vec3 glass = uColorC * 1.3;  // what a crack line's edge glows with
  float glassMix = 0.;         // how much of it is the kaleidoscope's colours
  vec2 wpx = uRegion.xy + uv * uRegion.z;
  if (sh > .02 || flash > .02) {
    // The live kaleidoscope: where the arm shimmers, and across the whole arm in a shatter's
    // burst, at full strength whether or not it was shimmering. The red channel splits off by an
    // amount that widens on a snap, only while there is one.
    float pulse;
    float pulseRed;
    vec3 kal = kaleido(wpx, uTime, 1., flash, pulse);
    if (pulse > .02) kal.r = kaleido(wpx + vec2(uKaleidoPx * (.012 + .05 * pulse), 0.), uTime, 1., flash, pulseRed).r;
    kal *= 1. + .5 * pulse;
    color = mix(color, kal, clamp(max(sh * uShimmerGain * .85, flash), 0., 1.));
    glass = kal * 1.6;
    glassMix = 1.;
  } else if (dull > .02 || rim > .02) {
    // A shattered arm's frozen glass: the same pattern at a fixed time, with no snaps. The
    // shards hold it dark and nearly grey, the crack edges glow with it.
    float pulse;
    vec3 frozen = kaleido(wpx, 7.3, 0., 0., pulse);
    float grey = dot(frozen, vec3(.333));
    color = mix(color, mix(vec3(grey), frozen, .5) * .65, dull * uGlassGain);
    glass = frozen * 1.8;
    glassMix = uGlassGain;
  }
  color += vec3(1.) * pow(sh, 4.) * .45 * uShimmerGain;
  color += mix(uColorC * 1.3, glass, glassMix) * rim * .8;
  color += mix(vec3(1.), uColorC, .3) * flash * .35;
  color -= hash(gl_FragCoord.xy) * .1;

  float a = ss(.03, .35, gray);
  a *= 1. - cut * uCrackDark;
  a = max(a, flash * .5);
  gl_FragColor = vec4(clamp(color, 0., 1.) * a, a) * uAlpha;
}`;
