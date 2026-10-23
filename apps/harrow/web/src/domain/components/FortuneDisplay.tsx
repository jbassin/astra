import type { DrawnCard, Spread } from "@/domain/lib/types";

import { CardName } from "./CardName";

// Ported from harrow's src/components/FortuneDisplay.tsx, re-skinned onto gothic
// (rim→rule, surface→panel, brass→accent-amber, ghost→ink-faint, mist→ink-dim). The
// per-card fortune list, fading in once all cards are revealed.
interface FortuneDisplayProps {
  drawnCards: DrawnCard[];
  spread: Spread;
  combinedFortune?: string;
  isVisible: boolean;
}

export function FortuneDisplay({ drawnCards, isVisible }: FortuneDisplayProps) {
  return (
    <div
      className={`transition-opacity duration-1000 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="mt-8 max-w-2xl mx-auto space-y-6">
        <div className="space-y-3">
          {drawnCards.map((drawn) => (
            <div key={drawn.card.id} className="rounded-xl border border-rule/60 bg-panel/40 p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <CardName
                      name={drawn.card.name}
                      className="font-display text-accent-amber text-sm font-semibold"
                    />
                    {drawn.position && (
                      <span className="text-ink-faint text-xs">· {drawn.position}</span>
                    )}
                    {drawn.orientation === "reversed" && (
                      <span className="text-ink-dim/70 text-xs italic">reversed</span>
                    )}
                  </div>
                  <p className="text-parchment/80 text-sm leading-relaxed">
                    {drawn.card.fortuneText[drawn.orientation]}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
