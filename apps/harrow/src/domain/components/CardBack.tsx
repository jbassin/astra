import { identityStyle } from "@astra/gothic";

import type { Deck } from "@/domain/lib/decks";

// Ported from harrow's src/components/CardBack.tsx, re-skinned onto gothic (Decision
// A): surface→panel, the deck colour via identityStyle (Decision G) consumed by the
// .deck-* utilities.
interface CardBackProps {
  deck: Deck;
  className?: string;
}

export function CardBack({ deck, className = "" }: CardBackProps) {
  return (
    <div
      className={`w-full h-full rounded-xl bg-panel flex items-center justify-center overflow-hidden border deck-border-30 ${className}`}
      style={identityStyle(deck.color)}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="absolute inset-0 opacity-20 deck-hatch-back" />
        <div className="relative z-10 flex flex-col items-center gap-1">
          <span className="text-4xl deck-fg">✦</span>
          <span className="font-display text-sm tracking-widest uppercase deck-fg-60">
            {deck.label}
          </span>
        </div>
      </div>
    </div>
  );
}
