import { CUSTOM_SPREADS } from "@/generated/spreads";

import { FlipCard } from "./FlipCard";

// Ported from harrow's SpreadHistoryView — every curated spread, reverse-chronological,
// cards shown face-up (no reveal timers → fully static/SSR). Re-skinned onto gothic
// (rim→rule, brass→accent-amber, ghost→ink-faint, parchment kept).
export function SpreadHistory() {
  return (
    <div className="py-8 px-4 max-w-4xl mx-auto">
      {CUSTOM_SPREADS.map((spread) => (
        <section key={spread.id} className="border-b border-rule pb-8 mb-8 last:border-0">
          <div className="mb-4">
            <h3 className="font-display text-accent-amber/80 text-xs tracking-widest uppercase">
              {spread.name}
            </h3>
            <p className="text-ink-faint text-xs">{spread.date}</p>
          </div>

          <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
            {spread.entries.map((entry) => (
              <div
                key={`${entry.positionLabel}-${entry.card.id}`}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <FlipCard
                  card={entry.card}
                  orientation={entry.orientation}
                  isRevealed={true}
                  size="md"
                  showMeaning={false}
                />
                <span className="text-ink-faint text-xs">{entry.positionLabel}</span>
              </div>
            ))}
          </div>

          <p className="text-parchment/80 text-sm leading-relaxed whitespace-pre-wrap max-w-2xl">
            {spread.reading}
          </p>
        </section>
      ))}
    </div>
  );
}
