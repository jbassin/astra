// Ported verbatim from harrow's src/data/spreads.ts. The only built-in spread
// (CROSS_SPREAD) — the 5-position cross used by the live draw.

import type { Spread } from "./types";

export const CROSS_SPREAD: Spread = {
  type: "cross",
  label: "Cross Spread",
  positions: ["Foundation", "Challenge", "Past", "Future", "Outcome"],
  description: "A deeper look at the forces at play in your life.",
};
