// @astra/backdrop — the astra "signature style": fixed, full-viewport animated
// pixi-shader page backgrounds. A site mounts <ShaderBackground spec={…}> once in its
// root and picks a catalog entry (or supplies its own BackdropSpec).
//
// SSR-safe: pixi is dynamic-imported inside the component, so neither the SSR bundle
// nor apps that don't mount a backdrop pay for it. ONE Application per page (one WebGL
// context) — for a page that already runs pixi, don't stack a second app.

export { ShaderBackground } from "./ShaderBackground";
export { BACKDROPS, type BackdropName } from "./shaders";
export { ledgerAurora } from "./shaders/ledgerAurora";
export { mouthpieceResonance } from "./shaders/mouthpieceResonance";
export { starfield } from "./shaders/starfield";
export type { BackdropSpec, UniformSpec } from "./types";
