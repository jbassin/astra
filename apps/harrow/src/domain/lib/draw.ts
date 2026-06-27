// Ported from harrow's src/lib/draw.ts (imports re-pointed: DECK → @/generated/cards,
// CROSS_SPREAD → ./spreads, fortune → ./fortune; the Fisher-Yates swap rewritten with
// a temp for astra's strict indexing — same logic). Client-side only: Math.random +
// Date.now run after hydration (the draw never executes during SSR — Decision D).

import { DECK } from "@/generated/cards";
import { generateCombinedFortune } from "./fortune";
import { CROSS_SPREAD } from "./spreads";
import type { DrawnCard, Reading, Spread, TarotCard } from "./types";

export function drawCards(
  deck: TarotCard[],
  count: number,
  spread: Spread,
  allowReversed = true,
): DrawnCard[] {
  if (count > deck.length) {
    throw new Error(`Cannot draw ${count} cards from a deck of ${deck.length}`);
  }

  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i] as TarotCard;
    shuffled[i] = shuffled[j] as TarotCard;
    shuffled[j] = tmp;
  }

  return shuffled.slice(0, count).map((card, index) => ({
    card,
    orientation: allowReversed && Math.random() < 0.5 ? "reversed" : "upright",
    position: spread.positions[index],
    isRevealed: false,
  }));
}

export function generateReadingId(): string {
  return `reading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createReading(): Reading {
  const drawnCards = drawCards(DECK, CROSS_SPREAD.positions.length, CROSS_SPREAD);
  const combinedFortune = generateCombinedFortune(drawnCards, CROSS_SPREAD);
  return {
    id: generateReadingId(),
    timestamp: Date.now(),
    spread: CROSS_SPREAD,
    drawnCards,
    combinedFortune,
  };
}
