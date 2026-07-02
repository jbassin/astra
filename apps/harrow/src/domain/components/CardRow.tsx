import { identityStyle } from "@astra/gothic";

import { getDeck } from "@/domain/lib/decks";
import type { TarotCard } from "@/domain/lib/types";

import { CardFront } from "./CardFront";
import { CardName } from "./CardName";

// Ported from harrow's src/components/CardRow.tsx, re-skinned onto gothic (Decision A):
// surface/well/rim/brass/mist/ghost tokens → gothic panel/rule/accent-amber/ink-dim/
// ink-faint; deck colour via identityStyle (Decision G). The gallery encyclopedia row.
interface CardRowProps {
  card: TarotCard;
}

export function CardRow({ card }: CardRowProps) {
  const deck = getDeck(card.deck);

  return (
    <div className="flex gap-5 border-b border-rule pb-6" style={identityStyle(deck.color)}>
      {/* Thumbnail */}
      <div className="shrink-0 w-40 aspect-[5/8]">
        <CardFront card={card} orientation="upright" showMeaning={false} />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header */}
        <div>
          <h3 className="font-display font-semibold tracking-wide text-sm deck-fg">
            <CardName name={card.name} />
          </h3>
          <span className="font-display text-xs deck-fg-60">{deck.label}</span>
        </div>

        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.tags
              .filter((tag) => !tag.includes("deck"))
              .map((tag) => {
                const colonIdx = tag.indexOf(":");
                const hasKey = colonIdx !== -1;
                const key = hasKey ? tag.slice(0, colonIdx).trim() : null;
                const value = hasKey ? tag.slice(colonIdx + 1).trim() : tag;
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 bg-elevated/40 border border-rule/60 rounded-sm px-2 py-0.5"
                  >
                    {key && (
                      <span className="font-display text-[9px] tracking-widest uppercase text-ink-faint">
                        {key}
                      </span>
                    )}
                    {key && <span className="text-ink-faint/60 select-none leading-none">·</span>}
                    <span className="font-display text-xs text-parchment/70">{value}</span>
                  </span>
                );
              })}
          </div>
        )}

        {/* Meanings */}
        <dl className="text-xs space-y-0.5 text-ink-dim">
          <div>
            <dt className="inline opacity-60">Upright: </dt>
            <dd className="inline italic">{card.uprightMeaning}</dd>
          </div>
          <div>
            <dt className="inline opacity-60">Reversed: </dt>
            <dd className="inline italic">{card.reversedMeaning}</dd>
          </div>
        </dl>

        {card.flavor && <p className="text-ink-faint text-xs italic">{card.flavor}</p>}

        {/* Fortune texts */}
        <div className="space-y-3 pt-1">
          <div>
            <h4 className="font-display text-accent-amber text-xs tracking-widest uppercase font-semibold mb-1">
              Upright
            </h4>
            <p className="text-parchment/80 text-sm leading-relaxed">{card.fortuneText.upright}</p>
          </div>
          <hr className="border-rule" />
          <div>
            <h4 className="font-display text-accent-amber text-xs tracking-widest uppercase font-semibold mb-1">
              Reversed
            </h4>
            <p className="text-parchment/80 text-sm leading-relaxed">{card.fortuneText.reversed}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
