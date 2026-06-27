import { ledgerAurora } from "./ledgerAurora";
import { mouthpieceInterference } from "./mouthpieceInterference";
import { mouthpieceResonance } from "./mouthpieceResonance";
import { starfield } from "./starfield";

// The astra backdrop catalog — the signature animated-pixi-background family. Each
// site picks one (or passes its own BackdropSpec to <ShaderBackground>).
export const BACKDROPS = {
  starfield, // harrow
  mouthpieceResonance, // mouthpiece-frontend (single-centre waveform + ripples)
  mouthpieceInterference, // mouthpiece-frontend (two-voice interference)
  ledgerAurora, // ledger
} as const;

export type BackdropName = keyof typeof BACKDROPS;
