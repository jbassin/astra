// Ported from harrow's src/lib/predicates.ts (imports re-pointed: DECK →
// @/generated/cards, tags → ./tags, types → ./types; switch-case `const`s wrapped in
// blocks for biome; `matched[0]` asserted for astra's strict indexing — same logic).
//
// The tag-predicate engine: evaluatePredicate decides if a drawn card set satisfies a
// predicate; matchedPredicate returns the LOWEST-COMPLEXITY (rarest, by a combinatoric
// proxy over the real deck) matching predicate — the title shown on a reading.

import { DECK } from "@/generated/cards";

import { expandTag } from "./tags";
import type { Predicate, TarotCard } from "./types";

export function evaluatePredicate(predicate: Predicate, cards: TarotCard[]): boolean {
  switch (predicate.type) {
    case "and":
      return predicate.predicates.every((p) => evaluatePredicate(p, cards));
    case "or":
      return predicate.predicates.some((p) => evaluatePredicate(p, cards));
    case "haveTag":
      return (tagCount(cards).get(predicate.tag) ?? 0) >= predicate.count;
    case "haveTags": {
      const counts = tagCount(cards);
      return (
        predicate.tags.filter((t) => (counts.get(t) ?? 0) > 0).length === predicate.tags.length
      );
    }
  }
}

function tagCount(cards: TarotCard[]): Map<string, number> {
  const res = new Map<string, number>();
  for (const card of cards) {
    for (const tag of card.tags) {
      for (const t of expandTag(tag)) {
        const curr = res.get(t) ?? 0;
        res.set(t, curr + 1);
      }
    }
  }
  return res;
}

export function matchedPredicate(predicates: Predicate[], cards: TarotCard[]): Predicate | null {
  const matched = predicates.filter((p) => evaluatePredicate(p, cards));
  if (matched.length === 0) {
    return null;
  }

  matched.sort((l, r) => predicateComplexity(l) - predicateComplexity(r));

  return matched[0] ?? null;
}

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n / 2) k = n - k;

  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return res;
}

function predicateComplexity(predicate: Predicate): number {
  const counts = tagCount(DECK);

  const chooseCard = (tag: string, count: number) => {
    const tagCountForTag = counts.get(tag) ?? 0;
    if (tagCountForTag === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return choose(tagCountForTag, count);
  };

  switch (predicate.type) {
    case "and":
      return predicate.predicates
        .map((p) => predicateComplexity(p))
        .reduce((l, r) => (l / 100) * (r / 100) * 100);
    case "or":
      return predicate.predicates.map((p) => predicateComplexity(p)).reduce((l, r) => l + r);
    case "haveTag":
      return (chooseCard(predicate.tag, predicate.count) / choose(DECK.length, 5)) * 100;
    case "haveTags": {
      let numerator = 1;
      for (const tag of predicate.tags) {
        numerator *= chooseCard(tag, 1);
      }

      return (numerator / choose(DECK.length, 5)) * 100;
    }
  }
}
