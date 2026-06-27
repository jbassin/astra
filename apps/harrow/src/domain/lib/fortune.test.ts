import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCombinedFortune } from "./fortune";
import { CROSS_SPREAD } from "./spreads";
import type { DrawnCard, TarotCard } from "./types";

// Fortune-template gate (spec 0017 gate I.2). Math.random is stubbed so `pick` always
// selects template index 0 — making the output deterministic — then we assert the
// interpolation (cardName reversed-suffix, meaning-by-orientation, fortune text) is
// woven into each position's template-0 string in order.

function card(name: string): TarotCard {
  return {
    id: name.toLowerCase(),
    name,
    number: "I",
    deck: "test",
    tags: [],
    uprightMeaning: `${name}-up-meaning`,
    reversedMeaning: `${name}-rev-meaning`,
    fortuneText: { upright: `${name}-up-text`, reversed: `${name}-rev-text` },
  };
}
const drawn = (name: string, orientation: "upright" | "reversed"): DrawnCard => ({
  card: card(name),
  orientation,
  isRevealed: true,
});

afterEach(() => vi.restoreAllMocks());

describe("generateCombinedFortune (cross)", () => {
  it("interpolates each position's template-0 with name/meaning/text", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // pick → index 0 for every bank
    const cards = [
      drawn("Found", "upright"),
      drawn("Chal", "reversed"),
      drawn("Past", "upright"),
      drawn("Futr", "reversed"),
      drawn("Outc", "upright"),
    ];
    const out = generateCombinedFortune(cards, CROSS_SPREAD);
    expect(out).toBe(
      [
        "The weight beneath all of this is Found, Found-up-meaning. Found-up-text",
        "Chal (reversed) stands against this. Chal-rev-text",
        "What brought you here is Past. Past-up-text",
        "What approaches is Futr (reversed). Futr-rev-text",
        "The outcome is Outc. Outc-up-text",
      ].join(" "),
    );
  });
});
