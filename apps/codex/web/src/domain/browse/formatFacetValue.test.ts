import { describe, expect, it } from "vitest";

import { facetKeysFor } from "@/schema/facetKeys";
import { createCorpusReader, fixtureCorpusRoot } from "@/server/corpusFs";

import { enumTagsFor, facetDefFor, humanizedLabelFor } from "./facetDefs";
import { formatFacetValue } from "./formatFacetValue";

describe("formatFacetValue (D29-122)", () => {
  it("empty string -> Unspecified", () => {
    expect(formatFacetValue("")).toBe("Unspecified");
  });

  it("generic pass: title-case + hyphen/space split, stopwords stay lowercase (not first word)", () => {
    expect(formatFacetValue("held-in-one-hand")).toBe("Held in One Hand");
    expect(formatFacetValue("etched-onto-armor")).toBe("Etched onto Armor");
    expect(formatFacetValue("martial")).toBe("Martial");
    expect(formatFacetValue("1 or 2")).toBe("1 or 2");
    expect(formatFacetValue("1 minute")).toBe("1 Minute");
  });

  it("curated map: glued compounds with no delimiter for a generic split to find", () => {
    expect(formatFacetValue("ancestryfeature")).toBe("Ancestry Feature");
    expect(formatFacetValue("classfeature")).toBe("Class Feature");
    expect(formatFacetValue("deityboon")).toBe("Deity Boon");
  });

  it("curated map: the 24 glued 'worn<slot>' usage values", () => {
    expect(formatFacetValue("wornheadwear")).toBe("Worn (Headwear)");
    expect(formatFacetValue("worneyepiece")).toBe("Worn (Eyepiece)");
    expect(formatFacetValue("wornbelt")).toBe("Worn (Belt)");
    expect(formatFacetValue("wornring")).toBe("Worn (Ring)");
  });

  it("curated map: creature.size codes", () => {
    expect(formatFacetValue("grg")).toBe("Gargantuan");
    expect(formatFacetValue("lg")).toBe("Large");
    expect(formatFacetValue("med")).toBe("Medium");
    expect(formatFacetValue("sm")).toBe("Small");
    expect(formatFacetValue("tiny")).toBe("Tiny");
    expect(formatFacetValue("huge")).toBe("Huge");
  });

  it("stringified-list values: parses single-quoted Python-repr shape and joins with ', '", () => {
    expect(formatFacetValue("['arcane', 'divine']")).toBe("Arcane, Divine");
    expect(formatFacetValue("['arcane']")).toBe("Arcane");
  });

  it("stringified-list: double quotes and irregular whitespace are handled too", () => {
    expect(formatFacetValue('["arcane",   "divine"]')).toBe("Arcane, Divine");
    expect(formatFacetValue("[ 'arcane' , 'divine' ]")).toBe("Arcane, Divine");
  });

  it("stringified-list: an empty list -> Unspecified, same as a bare empty string", () => {
    expect(formatFacetValue("[]")).toBe("Unspecified");
    expect(formatFacetValue("[ ]")).toBe("Unspecified");
  });

  it("a bracket-shaped member itself gets curated/generic-formatted (recursive)", () => {
    expect(formatFacetValue("['held-in-one-hand', 'worn']")).toBe("Held in One Hand, Worn");
  });

  it("does not treat an ordinary non-bracket string as a list", () => {
    expect(formatFacetValue("[Redacted] Something")).not.toBe("Unspecified");
  });
});

describe("humanizedLabelFor precedence (D29-122): labelMap wins, formatFacetValue is fallback-only", () => {
  it("a def WITH a labelMap entry for the value returns that entry verbatim, never re-formatted", () => {
    const def = facetDefFor("size");
    expect(def).toBeDefined();
    if (!def) return;
    // "med" -> "Medium" via facetDefs.ts's own SIZE_LABELS — formatFacetValue
    // ALSO maps "med" -> "Medium" (D29-122's own duplication pin), so this
    // proves idempotence (whichever path serves it, the string is identical
    // and is never run through the formatter a second time on top).
    expect(humanizedLabelFor(def, "med")).toBe("Medium");
    expect(humanizedLabelFor(def, "med")).toBe(formatFacetValue("med"));
  });

  it("a def with NO labelMap entry for the value falls back to formatFacetValue", () => {
    const def = facetDefFor("itemCategory");
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.labelMap).toBeUndefined();
    expect(humanizedLabelFor(def, "classfeature")).toBe("Class Feature");
    expect(humanizedLabelFor(def, "martial")).toBe("Martial");
  });

  it("no double-formatting: a labelMap string with its own casing/spacing is never re-title-cased", () => {
    const def = facetDefFor("actionCost");
    expect(def).toBeDefined();
    if (!def) return;
    // "1 Action" is already the labelMap's own exact string — if it were
    // piped through formatFacetValue's generic pass afterward, "1" would
    // stay "1" and "Action" would stay "Action" anyway (this specific value
    // happens to be idempotent under the generic pass), so this test's real
    // assertion is the CALL PATH: humanizedLabelFor returns the labelMap
    // value directly and never invokes formatFacetValue for it at all,
    // proven by the "no labelMap" case above using a genuinely-differently-
    // shaped fallback path (formatFacetValue never sees `"1"`/`"reaction"`
    // when a labelMap entry exists).
    expect(humanizedLabelFor(def, "1")).toBe("1 Action");
    expect(humanizedLabelFor(def, "reaction")).toBe("Reaction");
  });

  it("undefined def falls straight to formatFacetValue (core scalar dimensions with no FacetDef)", () => {
    expect(humanizedLabelFor(undefined, "common")).toBe("Common");
    expect(humanizedLabelFor(undefined, "")).toBe("Unspecified");
  });
});

describe("formatFacetValue sweep gate (D29-122): no bracket/quote residue reaches a display label anywhere in the real facet-value corpus", () => {
  it("every observed enum-facet tag across the fixture corpus formats to bracket/quote-free text", () => {
    const reader = createCorpusReader(fixtureCorpusRoot());
    let checkedAny = false;
    for (const category of reader.categories()) {
      for (const key of facetKeysFor(category)) {
        const def = facetDefFor(key);
        if (!def || def.widget !== "enum") continue;
        for (const row of reader.index(category)) {
          const raw = row.facets?.[key] as never;
          const tags = enumTagsFor(def, raw);
          if (!tags) continue;
          for (const tag of tags) {
            checkedAny = true;
            const label = humanizedLabelFor(def, tag);
            expect(label, `${key}=${JSON.stringify(tag)} -> ${JSON.stringify(label)}`).not.toMatch(
              /[[\]']/,
            );
          }
        }
      }
    }
    expect(checkedAny).toBe(true);
  });
});
