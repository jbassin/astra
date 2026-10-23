// Ported verbatim from harrow's src/data/decks.ts. The four deck taxonomy entries —
// id, label, and the identity colour (Decision G: kept as the one bespoke accent the
// full gothic re-skin preserves; applied via gothic's identityStyle seam in the
// components, not inlined). Static config, not derived from content.

export interface Deck {
  id: string;
  label: string;
  color: string;
}

export const DECKS: Record<string, Deck> = {
  hierophant: {
    id: "hierophant",
    label: "Hierophant",
    color: "#f4a261",
  },
  divine: {
    id: "divine",
    label: "Divine",
    color: "#7dd3fc",
  },
  diabolic: {
    id: "diabolic",
    label: "Diabolic",
    color: "#fca5a5",
  },
  aetheric: {
    id: "aetheric",
    label: "Ætheric",
    color: "#a78bfa",
  },
};

export function getDeck(id: string): Deck {
  const deck = DECKS[id];
  if (!deck) throw new Error(`Unknown deck id: "${id}"`);
  return deck;
}
