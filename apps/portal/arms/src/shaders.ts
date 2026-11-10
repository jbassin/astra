// GLSL for the arm strip (see strip.ts for the attributes). The sandbox page in
// `apps/portal/arms/bench/` runs the same vertex shader and prelude, so a fragment shader written
// there drops into FRAGMENTS unchanged.

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
};

const DEFAULT_SHADER = "flat";

/** The full fragment source for a shader name; an unknown name gets `flat`. */
export function fragmentSource(name: string): string {
  const body = Object.hasOwn(FRAGMENTS, name) ? FRAGMENTS[name] : FRAGMENTS[DEFAULT_SHADER];
  return `${FRAGMENT_PRELUDE}\n${body}`;
}
