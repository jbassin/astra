// Ported verbatim from harrow's src/lib/fortune.ts (import path → ./types; `pick`
// result + the 5-tuple destructure asserted for astra's strict indexing — same
// logic). Per-position template banks for the `cross` spread; one random template per
// position, interpolated with the drawn card's name/meaning/fortune text.

import type { DrawnCard, Spread } from "./types";

function cardName(c: DrawnCard): string {
  return c.orientation === "reversed" ? `${c.card.name} (reversed)` : c.card.name;
}

function meaning(c: DrawnCard): string {
  return c.orientation === "upright" ? c.card.uprightMeaning : c.card.reversedMeaning;
}

function cardText(c: DrawnCard): string {
  return c.card.fortuneText[c.orientation];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

type PositionTemplate = (card: DrawnCard) => string;

const foundationTemplates: PositionTemplate[] = [
  (c) => `The weight beneath all of this is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `This starts with ${cardName(c)}. ${cardText(c)}`,
  (c) => `At the base sits ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `${cardName(c)} is the floor here. ${cardText(c)}`,
  (c) => `What everything else stands on is ${cardName(c)}. ${cardText(c)}`,
  (c) => `The first truth in this reading is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `Before the rest: ${cardName(c)}. ${cardText(c)}`,
  (c) => `The root of all of this is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
];

const challengeTemplates: PositionTemplate[] = [
  (c) => `${cardName(c)} stands against this. ${cardText(c)}`,
  (c) => `The obstacle is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `What presses back here is ${cardName(c)}. ${cardText(c)}`,
  (c) => `The crossing force is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `Against this: ${cardName(c)}. ${cardText(c)}`,
  (c) => `${cardName(c)} is the knot to be worked. ${cardText(c)}`,
  (c) => `The difficulty here is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `What complicates this is ${cardName(c)}. ${cardText(c)}`,
];

const pastTemplates: PositionTemplate[] = [
  (c) => `What brought you here is ${cardName(c)}. ${cardText(c)}`,
  (c) => `Behind you, ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `The past shows ${cardName(c)}. ${cardText(c)}`,
  (c) => `This came from ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `What has already settled is ${cardName(c)}. ${cardText(c)}`,
  (c) => `Looking back: ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `${cardName(c)} is what preceded this. ${cardText(c)}`,
  (c) => `The trail behind you shows ${cardName(c)}. ${cardText(c)}`,
];

const futureTemplates: PositionTemplate[] = [
  (c) => `What approaches is ${cardName(c)}. ${cardText(c)}`,
  (c) => `Ahead: ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `The path runs toward ${cardName(c)}. ${cardText(c)}`,
  (c) => `${cardName(c)} gathers ahead. ${cardText(c)}`,
  (c) => `The next thing to arrive is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `What is coming is ${cardName(c)}. ${cardText(c)}`,
  (c) => `The current carries toward ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `In front of this, ${cardName(c)}. ${cardText(c)}`,
];

const outcomeTemplates: PositionTemplate[] = [
  (c) => `The outcome is ${cardName(c)}. ${cardText(c)}`,
  (c) => `Where this ends: ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `This resolves into ${cardName(c)}. ${cardText(c)}`,
  (c) => `${cardName(c)} closes the reading. ${cardText(c)}`,
  (c) => `The final word here is ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
  (c) => `What this settles into is ${cardName(c)}. ${cardText(c)}`,
  (c) => `The end of this thread is ${cardName(c)}. ${cardText(c)}`,
  (c) => `All of this moves toward ${cardName(c)}, ${meaning(c)}. ${cardText(c)}`,
];

const templates: Record<"cross", (cards: DrawnCard[]) => string> = {
  cross: (cards) => {
    const [foundation, challenge, past, future, outcome] = cards as [
      DrawnCard,
      DrawnCard,
      DrawnCard,
      DrawnCard,
      DrawnCard,
    ];
    return [
      pick(foundationTemplates)(foundation),
      pick(challengeTemplates)(challenge),
      pick(pastTemplates)(past),
      pick(futureTemplates)(future),
      pick(outcomeTemplates)(outcome),
    ].join(" ");
  },
};

export function generateCombinedFortune(drawnCards: DrawnCard[], spread: Spread): string {
  return templates[spread.type](drawnCards);
}
