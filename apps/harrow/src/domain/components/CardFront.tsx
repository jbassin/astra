import { identityStyle } from "@astra/gothic";
import { getDeck } from "@/domain/lib/decks";
import type { CardOrientation, TarotCard } from "@/domain/lib/types";
import { CardName } from "./CardName";
import { Icon } from "./Icon";

// Ported from harrow's src/components/CardFront.tsx, re-skinned onto gothic (Decision
// A): the well/deck tokens → gothic panel + the deck IDENTITY colour (Decision G,
// applied via identityStyle → --identity-color, consumed by the .deck-* utilities).
// Structure + the golden SVG frame + glyph render unchanged; the gold is gothic
// gold-leaf.

const GOLD = "#b4842f"; // gothic --color-gold-leaf

interface CardFrontProps {
  card: TarotCard;
  orientation: CardOrientation;
  showMeaning?: boolean;
  size?: "sm" | "md" | "lg";
}

const ICON_SIZES = { sm: 56, md: 96, lg: 128 };

export function CardFront({ card, orientation, showMeaning = true, size = "md" }: CardFrontProps) {
  const isReversed = orientation === "reversed";
  const meaning = isReversed ? card.reversedMeaning : card.uprightMeaning;
  const deck = getDeck(card.deck);
  const filterId = `card-glow-${card.id}`;

  return (
    <div
      className="relative w-full h-full rounded-xl bg-elevated flex flex-col overflow-hidden"
      style={identityStyle(deck.color)}
    >
      {/* Golden SVG decoration layer */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 160"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer border */}
        <rect
          x="1"
          y="1"
          width="98"
          height="158"
          rx="8"
          ry="8"
          fill="none"
          stroke={GOLD}
          strokeWidth="0.75"
          strokeOpacity="0.50"
          filter={`url(#${filterId})`}
        />

        {/* Inner border */}
        <rect
          x="3"
          y="3"
          width="94"
          height="154"
          rx="6"
          ry="6"
          fill="none"
          stroke={GOLD}
          strokeWidth="0.5"
          strokeOpacity="0.30"
        />

        {/* Corner diamonds */}
        <polygon points="2.5,5 5,2.5 7.5,5 5,7.5" fill={GOLD} fillOpacity="0.55" />
        <polygon points="92.5,5 95,2.5 97.5,5 95,7.5" fill={GOLD} fillOpacity="0.55" />
        <polygon points="2.5,155 5,152.5 7.5,155 5,157.5" fill={GOLD} fillOpacity="0.55" />
        <polygon points="92.5,155 95,152.5 97.5,155 95,157.5" fill={GOLD} fillOpacity="0.55" />
      </svg>

      <div className="absolute inset-0 opacity-10 deck-hatch-front" />

      {/* Header */}
      <div className="relative z-10 px-2 pt-2 pb-1 text-center">
        <span className="block font-display text-sm font-bold tracking-widest leading-none deck-fg">
          {card.number}
        </span>
        <CardName
          name={card.name}
          className="font-display text-sm font-semibold tracking-widest uppercase leading-none mt-0.5 deck-fg"
        />
        <span className="block font-display text-[10px] tracking-wider mt-0.5 deck-fg-60">
          {deck.label}
        </span>
        {isReversed && (
          <span className="block font-display text-[11px] tracking-wider mt-0.5 deck-fg-40">
            reversed
          </span>
        )}
      </div>

      {/* Icon */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-2">
        {card.path && (
          <Icon
            color={deck.color}
            path={card.path}
            reversed={isReversed}
            viewBox={card.viewBox}
            size={ICON_SIZES[size]}
          />
        )}
      </div>

      {/* Meaning */}
      {showMeaning && (
        <div className="relative z-10 px-2 pb-2 text-center">
          <p className="text-[11px] italic leading-tight line-clamp-2 deck-fg-60">{meaning}</p>
        </div>
      )}
    </div>
  );
}
