import { describe, expect, it } from "vitest";

import { DECK } from "@/generated/cards";

import goldenDeck from "./__fixtures__/deck.golden.json";
import type { TarotCard } from "./types";

// THE deck parity gate (spec 0017 gate I.1). `deck.golden.json` was captured by
// running harrow's ORIGINAL parser (/ruby/data/experiments/tarot/src/lib/parseCard.ts)
// over its ORIGINAL .card files — an independent capture from the source repo. The
// generated DECK (this repo's ported parser over the copied content) must reproduce
// it EXACTLY. A drift in the content copy or the parser port reds this.
const golden = goldenDeck as TarotCard[];

describe("deck parity", () => {
  it("generated DECK byte-equals the source-captured golden", () => {
    expect(DECK).toEqual(golden);
  });

  // Structural invariants — catch a bad port independently of the golden lock.
  it("has 24 cards with the expected per-deck counts", () => {
    expect(DECK).toHaveLength(24);
    const byDeck: Record<string, number> = {};
    for (const c of DECK) byDeck[c.deck] = (byDeck[c.deck] ?? 0) + 1;
    expect(byDeck).toEqual({ aetheric: 5, divine: 7, diabolic: 6, hierophant: 6 });
  });

  it("is roman-numeral sorted ascending with unique ids", () => {
    const roman: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    const fromRoman = (s: string): number => {
      let r = 0;
      for (let i = 0; i < s.length; i++) {
        const cur = roman[s[i] as string] as number;
        const next = roman[s[i + 1] as string];
        r += next !== undefined && next > cur ? -cur : cur;
      }
      return r;
    };
    const values = DECK.map((c) => fromRoman(c.number));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(DECK.map((c) => c.id)).size).toBe(DECK.length);
  });

  it("every card carries the required fields + a deck: tag", () => {
    for (const c of DECK) {
      expect(c.name).toBeTruthy();
      expect(c.number).toBeTruthy();
      expect(c.uprightMeaning).toBeTruthy();
      expect(c.reversedMeaning).toBeTruthy();
      expect(c.fortuneText.upright).toBeTruthy();
      expect(c.fortuneText.reversed).toBeTruthy();
      expect(c.tags).toContain(`deck:${c.deck}`);
    }
  });
});
