import { CROSS_SPREAD } from "@/domain/lib/spreads";
import type { DrawnCard } from "@/domain/lib/types";
import { useCardReveal } from "@/domain/lib/useCardReveal";
import { CUSTOM_SPREADS } from "@/generated/spreads";

import { CardSpread } from "./CardSpread";

// Ported from harrow's SpreadView — features the most-recent curated spread
// (CUSTOM_SPREADS[0]), revealing on load. Re-skinned onto gothic (brass→accent-amber,
// parchment kept). Deterministic content, so it SSRs (the reveal animates client-side).
export function SpreadFeatured() {
  const spread = CUSTOM_SPREADS[0];
  const { revealed, allRevealed } = useCardReveal(5);

  if (!spread) return null;

  const drawnCards: DrawnCard[] = spread.entries.map((entry, i) => ({
    card: entry.card,
    orientation: entry.orientation,
    position: entry.positionLabel,
    isRevealed: revealed[i] ?? false,
  }));

  return (
    <div className="flex flex-col items-center gap-6 py-8 px-4">
      <div className="text-center">
        <h2 className="font-display text-accent-amber/80 text-lg tracking-widest uppercase mb-1">
          {spread.name}
        </h2>
      </div>

      <div className="overflow-hidden w-full flex justify-center">
        <CardSpread drawnCards={drawnCards} spread={CROSS_SPREAD} />
      </div>

      <div
        className={`w-full max-w-2xl border border-accent-amber/20 rounded-lg p-6 text-parchment/80 text-sm leading-relaxed whitespace-pre-wrap transition-opacity duration-700 ${
          allRevealed ? "opacity-100" : "opacity-0"
        }`}
      >
        {spread.reading}
      </div>
    </div>
  );
}
