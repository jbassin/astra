import { ledgerAurora } from "./ledgerAurora";
import { mouthpieceInterference } from "./mouthpieceInterference";
import { starfield } from "./starfield";

// The astra backdrop catalog — the signature animated-pixi-background family. Each
// site picks one (or passes its own BackdropSpec to <ShaderBackground>).
export const BACKDROPS = {
  starfield, // harrow
  mouthpieceInterference, // mouthpiece-frontend (two-voice interference)
  ledgerAurora, // ledger
} as const;

export type BackdropName = keyof typeof BACKDROPS;
