import { describe, expect, it } from "vitest";
import { DECK } from "@/generated/cards";
import { PREDICATES } from "../data/predicates";
import { evaluatePredicate, matchedPredicate } from "./predicates";
import type { TarotCard } from "./types";

// Predicate-selection gate (spec 0017 gate I.2). Three layers:
//   1. the 29 labels are locked VERBATIM against the source data/predicates.ts (the
//      authoritative list — catches a dropped/typo'd predicate);
//   2. evaluatePredicate is checked against HAND-COMPUTED expectations on synthetic
//      cards (independent of the deck — proves the engine logic);
//   3. matchedPredicate's lowest-complexity selection is locked on deterministic
//      real-DECK draws (by card id — no randomness).

// A minimal card carrying only the fields the engine reads (tags).
function mk(id: string, tags: string[]): TarotCard {
  return {
    id,
    name: id,
    number: "I",
    deck: "test",
    tags,
    uprightMeaning: "",
    reversedMeaning: "",
    fortuneText: { upright: "", reversed: "" },
  };
}

describe("PREDICATES (authoritative label list)", () => {
  it("has the 29 source labels verbatim", () => {
    expect(PREDICATES).toHaveLength(29);
    expect(PREDICATES.map((p) => p.label)).toEqual([
      "Dissonant Pull",
      "Devil Rising",
      "Godhome Rising",
      "Slip Rising",
      "Mortal Rising",
      "Allied Outlook",
      "Frosted Outlook",
      "Brisk Outlook",
      "Zyphric Outlook",
      "Melted Outlook",
      "Full Year",
      "Ashen Tide",
      "Loaming Reach",
      "Deepwater Pull",
      "Open Current",
      "Iron Confluence",
      "Root Hold",
      "Diamond Moment",
      "Ruby Hour",
      "Emerald Ground",
      "Sapphire Pull",
      "Topaz Drift",
      "Amethyst Watch",
      "Thornladen",
      "Pale Vigil",
      "Strange Bloom",
      "Turning Year",
      "Still Voice",
      "Full Bloom",
    ]);
  });
});

describe("evaluatePredicate (hand-computed on synthetic cards)", () => {
  const fire2water1 = [
    mk("a", ["element:fire", "deck:diabolic"]),
    mk("b", ["element:fire"]),
    mk("c", ["element:water"]),
  ];

  it("haveTag counts cards carrying the tag", () => {
    expect(
      evaluatePredicate({ type: "haveTag", label: "", tag: "element:fire", count: 2 }, fire2water1),
    ).toBe(true);
    expect(
      evaluatePredicate({ type: "haveTag", label: "", tag: "element:fire", count: 3 }, fire2water1),
    ).toBe(false);
  });

  it("haveTag matches on a bare tag-kind (expandTag)", () => {
    // every card with a `deck:*` tag also counts toward the bare `deck` kind.
    expect(
      evaluatePredicate({ type: "haveTag", label: "", tag: "deck", count: 1 }, fire2water1),
    ).toBe(true);
  });

  it("haveTags needs at least one of EACH tag", () => {
    expect(
      evaluatePredicate(
        { type: "haveTags", label: "", tags: ["element:fire", "element:water"] },
        fire2water1,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        { type: "haveTags", label: "", tags: ["element:fire", "element:air"] },
        fire2water1,
      ),
    ).toBe(false);
  });

  it("and / or compose sub-predicates", () => {
    const fire2 = { type: "haveTag", label: "", tag: "element:fire", count: 2 } as const;
    const water1 = { type: "haveTag", label: "", tag: "element:water", count: 1 } as const;
    const air1 = { type: "haveTag", label: "", tag: "element:air", count: 1 } as const;
    expect(
      evaluatePredicate({ type: "and", label: "", predicates: [fire2, water1] }, fire2water1),
    ).toBe(true);
    expect(
      evaluatePredicate({ type: "and", label: "", predicates: [fire2, air1] }, fire2water1),
    ).toBe(false);
    expect(
      evaluatePredicate({ type: "or", label: "", predicates: [air1, fire2] }, fire2water1),
    ).toBe(true);
    expect(evaluatePredicate({ type: "or", label: "", predicates: [air1] }, fire2water1)).toBe(
      false,
    );
  });
});

describe("matchedPredicate (deterministic real-DECK draws)", () => {
  const byId = Object.fromEntries(DECK.map((c) => [c.id, c]));
  const draw = (...ids: string[]): TarotCard[] =>
    ids.map((i) => {
      const c = byId[i];
      if (!c) throw new Error(`no card ${i}`);
      return c;
    });

  it("picks the rarest (lowest-complexity) matching title", () => {
    // 3 diabolic + 2 aetheric → Allied Outlook beats Devil Rising / Dissonant Pull.
    expect(
      matchedPredicate(
        PREDICATES,
        draw("the-harlequin", "the-forest", "the-hooded", "the-horizon", "the-wheel"),
      )?.label,
    ).toBe("Allied Outlook");
    // all 5 aetheric → Slip Rising.
    expect(
      matchedPredicate(
        PREDICATES,
        draw("the-author", "the-horizon", "the-wheel", "the-beacon", "the-world-tree"),
      )?.label,
    ).toBe("Slip Rising");
    // 3 divine + 2 diabolic → Dissonant Pull is the lowest-complexity match here.
    expect(
      matchedPredicate(
        PREDICATES,
        draw("the-pulse", "the-compelled", "the-heir", "the-harlequin", "the-forest"),
      )?.label,
    ).toBe("Dissonant Pull");
  });

  it("returns null when nothing matches (empty set)", () => {
    expect(matchedPredicate(PREDICATES, [])).toBeNull();
  });
});
