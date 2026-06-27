import { ledgerAurora } from "./ledgerAurora";
import { mouthpieceResonance } from "./mouthpieceResonance";
import { starfield } from "./starfield";

// The astra backdrop catalog — the signature animated-pixi-background family. Each
// site picks one (or passes its own BackdropSpec to <ShaderBackground>).
export const BACKDROPS = {
  starfield, // harrow
  mouthpieceResonance, // mouthpiece-frontend
  ledgerAurora, // ledger
} as const;

export type BackdropName = keyof typeof BACKDROPS;
