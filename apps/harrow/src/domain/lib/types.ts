// Ported verbatim from harrow's src/types/tarot.ts (only the file location changes).
// The shared domain types: cards, drawn cards, spreads, readings, and the predicate
// AST. Imported by the generated content modules (cards/spreads), the parsers, and
// the runtime components.

export type CardOrientation = "upright" | "reversed";

export interface TarotCard {
  id: string;
  name: string;
  number: string;
  path?: string;
  viewBox?: number;
  deck: string;
  suit?: string;
  tags: string[];
  uprightMeaning: string;
  reversedMeaning: string;
  fortuneText: {
    upright: string;
    reversed: string;
  };
  flavor?: string;
}

export interface DrawnCard {
  card: TarotCard;
  orientation: CardOrientation;
  position?: string;
  isRevealed: boolean;
}

export type SpreadType = "cross";

export interface Spread {
  type: SpreadType;
  label: string;
  positions: string[];
  description: string;
}

export interface Reading {
  id: string;
  timestamp: number;
  spread: Spread;
  drawnCards: DrawnCard[];
  combinedFortune?: string;
}

export interface CustomSpreadEntry {
  card: TarotCard;
  orientation: CardOrientation;
  positionLabel: string;
}

export interface CustomSpreadReading {
  id: string;
  date: string;
  name: string;
  entries: CustomSpreadEntry[];
  reading: string;
}

export type Predicate =
  | { type: "and"; label: string; predicates: Predicate[] }
  | { type: "or"; label: string; predicates: Predicate[] }
  | { type: "haveTag"; label: string; count: number; tag: string }
  | { type: "haveTags"; label: string; tags: string[] };
