// Builder-wide curation that belongs to no one class, species or background.

/**
 * Every character speaks Common plus two standard languages. The builder takes the species'
 * preferred languages first (content/species.ts), then fills from this list in order.
 */
export const LANGUAGE_FILL = [
  "elvish",
  "dwarvish",
  "halfling",
  "draconic",
  "gnomish",
  "giant",
  "orc",
  "goblin",
  "common-sign-language",
];

/** Instruments, artisan's tools and gaming sets the builder falls back to, in order, when a
 * pick would repeat a proficiency the character already has. */
export const TOOL_FALLBACK: Record<"instrument" | "tool" | "gaming", string[]> = {
  instrument: [
    "lute",
    "flute",
    "drum",
    "lyre",
    "horn",
    "viol",
    "bagpipes",
    "dulcimer",
    "pan-flute",
    "shawm",
  ],
  tool: [
    "smiths-tools",
    "carpenters-tools",
    "tinkers-tools",
    "leatherworkers-tools",
    "woodcarvers-tools",
  ],
  gaming: ["dice-set", "playing-cards", "dragonchess-set", "three-dragon-ante-set"],
};
