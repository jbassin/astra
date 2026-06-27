import { getDeck } from "@/domain/lib/decks";
import type { CardOrientation, TarotCard } from "@/domain/lib/types";
import { CardBack } from "./CardBack";
import { CardFront } from "./CardFront";

// Ported from harrow's src/components/FlipCard.tsx, re-skinned onto gothic (brass→
// accent-amber, ghost→ink-faint). The 3D flip (perspective/preserve-3d/rotate-y-180/
// backface-hidden utilities — Safari-prefixed in globals.css) is unchanged. A clickable
// unrevealed card gets button semantics (role + keyboard) for a11y.
interface FlipCardProps {
  card: TarotCard;
  orientation: CardOrientation;
  isRevealed: boolean;
  position?: string;
  onReveal?: () => void;
  size?: "sm" | "md" | "lg";
  showMeaning?: boolean;
}

const sizes = {
  sm: "w-28 h-44",
  md: "w-36 h-56",
  lg: "w-44 h-72",
};

export function FlipCard({
  card,
  orientation,
  isRevealed,
  position,
  onReveal,
  size = "md",
  showMeaning = true,
}: FlipCardProps) {
  const clickable = !isRevealed && !!onReveal;
  return (
    <div className="flex flex-col items-center gap-2">
      {position && (
        <span className="font-display text-accent-amber/60 text-xs tracking-widest uppercase">
          {position}
        </span>
      )}
      {/* A native <button> when clickable (free keyboard + focus a11y); a plain div
          otherwise. The perspective + flip classes apply to either. */}
      {(() => {
        const inner = (
          <div
            className={`relative w-full h-full transition-transform duration-500 preserve-3d ${
              isRevealed ? "rotate-y-180" : ""
            }`}
          >
            <div className="absolute inset-0 backface-hidden translate-z-0">
              <CardBack deck={getDeck(card.deck)} />
            </div>
            <div className="absolute inset-0 backface-hidden rotate-y-180">
              <CardFront
                card={card}
                orientation={orientation}
                size={size}
                showMeaning={showMeaning}
              />
            </div>
          </div>
        );
        return clickable ? (
          <button
            type="button"
            className={`${sizes[size]} perspective-1000 cursor-pointer appearance-none border-0 bg-transparent p-0`}
            onClick={onReveal}
          >
            {inner}
          </button>
        ) : (
          <div className={`${sizes[size]} perspective-1000`}>{inner}</div>
        );
      })()}
      {clickable && <span className="text-ink-faint text-[10px] tracking-wide">tap to reveal</span>}
    </div>
  );
}
