import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sluggify } from "./sluggify";

interface Vector {
  name: string;
  slug: string;
  note?: string;
}

const vectorsPath = fileURLToPath(new URL("./sluggify.vectors.json", import.meta.url));
const vectorsFile = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
  _methodology: string[];
  vectors: Vector[];
};

describe("sluggify vector gate (D29-1, real corpus filenames)", () => {
  it("loaded a non-trivial fixture", () => {
    expect(vectorsFile.vectors.length).toBeGreaterThan(100);
  });

  it.each(vectorsFile.vectors)("sluggify($name) === $slug", ({ name, slug }) => {
    expect(sluggify(name)).toBe(slug);
  });
});

describe("sluggify hand-picked hard cases (verbatim against the real Foundry snapshot)", () => {
  it.each([
    ["Heal", "heal"],
    ["Will-o'-the-Deep", "will-o-the-deep"],
    ["Ixamè's Eye", "ixamès-eye"],
    ["Déjà Vu", "déjà-vu"],
    ["Dragon Breath (Dragon Form)", "dragon-breath-dragon-form"],
    ["Press-Ganged (G&G)", "press-ganged-g-g"],
    ["Animist & Apparition Spellcasting", "animist-apparition-spellcasting"],
    ["+1 Status to All Saves vs. Magic", "1-status-to-all-saves-vs-magic"],
    ["Armor Potency (+1)", "armor-potency-1"],
    ['Bshez "Sand Claws" Shak', "bshez-sand-claws-shak"],
    ["Jewel‑encrusted gold altar", "jewel-encrusted-gold-altar"],
    ["Effect: Magnificent…!", "effect-magnificent"],
    ["I Defy You!", "i-defy-you"],
    ["Pop, Drop, and Lock", "pop-drop-and-lock"],
    ["Administer First Aid - Stabilize: Medicine", "administer-first-aid-stabilize-medicine"],
    // A hyphen alone is a special-cased passthrough in upstream's own function.
    ["-", "-"],
  ])("sluggify(%j) === %j", (name, slug) => {
    expect(sluggify(name)).toBe(slug);
  });

  it("throws on a non-string input (upstream logs a warning; this port fails loudly)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => sluggify(42 as any)).toThrow(TypeError);
  });

  it("throws on an unrecognized camel option", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => sluggify("Foo", { camel: "camel" as any })).toThrow();
  });

  it("dromedary/bactrian camel variants (ported for completeness, unused by identity)", () => {
    expect(sluggify("Animal Companion", { camel: "dromedary" })).toBe("animalCompanion");
    expect(sluggify("Animal Companion", { camel: "bactrian" })).toBe("AnimalCompanion");
  });
});
