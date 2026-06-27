// Ported verbatim from harrow's src/lib/tags.ts (import path changed to ./types).
// Tag helpers: every tag is `kind:value` (or bare); expandTag yields both the full
// tag and its kind so a query can match either.

import type { TarotCard } from "./types";

export function expandTag(tag: string): string[] {
  const colon = tag.indexOf(":");
  if (colon === -1) return [tag];
  return [tag, tag.slice(0, colon)];
}

export function cardHasTag(card: TarotCard, query: string): boolean {
  return card.tags.some((t) => expandTag(t).includes(query));
}

export function getDeckTagKindValues(deck: TarotCard[], kind: string): string[] {
  const values = new Set<string>();
  for (const card of deck) {
    for (const tag of card.tags) {
      const colon = tag.indexOf(":");
      if (colon !== -1 && tag.slice(0, colon) === kind) {
        values.add(tag.slice(colon + 1));
      }
    }
  }
  return [...values];
}
