import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { BlockNode, InlineNode } from "../schema/nodes";
import {
  type EnricherContext,
  type UuidResolution,
  EnricherGrammarError,
  decodeEntities,
  formatDamageDisplay,
  matchEnricher,
  mergeLocalizeMaps,
  parseActionArg,
  parseCheckArg,
  parseDamageArg,
  parseEnrichedText,
  parseTemplateArg,
} from "./enrichers";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "fixtures");

function readFixture(name: string): { name: string; description?: string; noteText?: string } {
  return JSON.parse(readFileSync(join(FIXTURES, "foundry", name), "utf8")) as {
    name: string;
    description?: string;
    noteText?: string;
  };
}

const langSubset = JSON.parse(readFileSync(join(FIXTURES, "lang-subset.json"), "utf8")) as {
  en: Record<string, string>;
  reEn: Record<string, string>;
  collision: { key: string; en: string; sf2eOverrides: string };
};

/** A stub `EnricherContext` for isolated unit tests: `resolveUuid` never fails
 * (crossref echoing the uuid as both id/display) unless a test overrides it;
 * `parseBlockHtml` is a minimal stand-in (real block parsing is
 * `foundryHtml.test.ts`'s job — this file tests `enrichers.ts` in isolation). */
function makeCtx(overrides: Partial<EnricherContext> = {}): EnricherContext {
  const reports: Array<{ cls: string; detail: string }> = [];
  const ctx: EnricherContext = {
    resolveUuid: (uuid: string): UuidResolution => ({ kind: "crossref", id: uuid, display: uuid }),
    localize: new Map(),
    report: (cls, detail) => reports.push({ cls, detail }),
    parseBlockHtml: (): BlockNode[] => {
      throw new Error("parseBlockHtml stub not wired for this test");
    },
    ...overrides,
  };
  Object.defineProperty(ctx, "reports", { value: reports });
  return ctx;
}
function getReports(ctx: EnricherContext): Array<{ cls: string; detail: string }> {
  return (ctx as unknown as { reports: Array<{ cls: string; detail: string }> }).reports;
}

const text = (content: string): InlineNode => ({
  kind: "text",
  content,
  marks: { bold: false, italic: false, superscript: false },
});

describe("matchEnricher: low-level scanning", () => {
  it("finds the earliest of an @Tag[ and a [[/x form", () => {
    const s = "before [[/r 1d4]] and @Check[flat|dc:5] after";
    const m1 = matchEnricher(s, 0);
    expect(m1?.form).toBe("roll");
    expect(m1?.rollKind).toBe("r");
    const m2 = matchEnricher(s, m1?.end ?? 0);
    expect(m2?.form).toBe("Check");
  });

  it("does not trip on a plain @ in prose (no bracket immediately after)", () => {
    const s = "contact us at gm@example.com for questions";
    expect(matchEnricher(s, 0)).toBeNull();
  });

  it("returns null past the end of input", () => {
    expect(matchEnricher("no enrichers here", 0)).toBeNull();
  });

  it("hard-fails on an unknown @Tag[ form (the drift tripwire)", () => {
    expect(() => matchEnricher("@Foo[bar]", 0)).toThrow(EnricherGrammarError);
  });

  it("hard-fails on an unknown [[/x roll form", () => {
    expect(() => matchEnricher("[[/xyz 1d4]]", 0)).toThrow(EnricherGrammarError);
  });

  it("is depth-aware for nested @Damage type brackets (not scan-to-first-])", () => {
    const s = "@Damage[(floor((@actor.level+1)/2)+1)d6[poison]] trailing text";
    const m = matchEnricher(s, 0);
    expect(m?.form).toBe("Damage");
    expect(m?.arg).toBe("(floor((@actor.level+1)/2)+1)d6[poison]");
    expect(s.slice(m?.end)).toBe(" trailing text");
  });

  it("is depth-aware for a [[/r ...]] formula containing a [type] annotation", () => {
    const s = "[[/r 4d8[healing] #Treat Wounds]] rest";
    const m = matchEnricher(s, 0);
    expect(m?.form).toBe("roll");
    expect(m?.arg).toBe("4d8[healing] #Treat Wounds");
    expect(s.slice(m?.end)).toBe(" rest");
  });

  it("parses the {label} suffix on both an @Tag[ and a [[/x form", () => {
    const m1 = matchEnricher("@UUID[Compendium.pf2e.x.Item.abc]{Nice Label}", 0);
    expect(m1?.label).toBe("Nice Label");
    const m2 = matchEnricher("[[/r 1d4]]{rounds}", 0);
    expect(m2?.label).toBe("rounds");
  });

  it("real corpus finding: labels never nest another enricher — verified exhaustively, so a label is always taken as opaque plain text", () => {
    // A label CAN contain plain braces-free prose; nesting `@Tag[`/`[[/x` inside
    // one has never been observed in the pinned snapshot. This is a documentation
    // test, not a parser behavior test — matchEnricher doesn't recurse into label
    // content at all (see the "always opaque" doc comment on matchLabel).
    const m = matchEnricher("@UUID[Compendium.pf2e.x.Item.abc]{Just plain prose}", 0);
    expect(m?.label).toBe("Just plain prose");
  });
});

describe("decodeEntities", () => {
  it("decodes every named entity found in the real snapshot", () => {
    expect(decodeEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeEntities("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeEntities("em&mdash;dash")).toBe("em—dash");
    expect(decodeEntities("en&ndash;dash")).toBe("en–dash");
    expect(decodeEntities("5 &times; 3")).toBe("5 × 3");
    expect(decodeEntities("a &gt; b")).toBe("a > b");
  });

  it("decodes numeric decimal and hex entities", () => {
    expect(decodeEntities("&#8212;")).toBe("—");
    expect(decodeEntities("&#x2014;")).toBe("—");
  });

  it("hard-fails on an unmapped named entity", () => {
    expect(() => decodeEntities("&notreal;")).toThrow(/unmapped HTML entity/);
  });
});

describe("parseCheckArg", () => {
  it("parses type + dc + basic + traits", () => {
    const parsed = parseCheckArg("reflex|dc:35|basic|traits:hazard,complex,environmental");
    expect(parsed).toEqual({
      type: "reflex",
      dc: 35,
      basic: true,
      traits: ["hazard", "complex", "environmental"],
      extra: {},
    });
  });

  it("captures unknown keys/flags into `extra` instead of hard-failing (D29-6: unknown KEYS in a known form don't fail)", () => {
    const parsed = parseCheckArg("fortitude|dc:32|traits:curse,holy|overrideTraits");
    expect(parsed.extra).toEqual({ overrideTraits: true });
  });

  it("real doc: society|dc:30|immutable — a bare flag beyond 'basic' becomes extra[flag]=true", () => {
    const parsed = parseCheckArg("society|dc:30|immutable");
    expect(parsed).toEqual({ type: "society", dc: 30, extra: { immutable: true } });
  });

  it("real doc (spit-ambient-magic): 'against' is an unknown key captured in extra, 'basic' stays a named flag", () => {
    const parsed = parseCheckArg("reflex|against:class-spell|basic");
    expect(parsed.type).toBe("reflex");
    expect(parsed.basic).toBe(true);
    expect(parsed.extra).toEqual({ against: "class-spell" });
  });
});

describe("parseTemplateArg", () => {
  it("parses the bare-positional-shape ordering", () => {
    expect(parseTemplateArg("burst|distance:20")).toEqual({ shape: "burst", distance: 20 });
  });

  it("parses the type:/distance: key ordering (both orders occur at real scale)", () => {
    expect(parseTemplateArg("type:burst|distance:10")).toEqual({ shape: "burst", distance: 10 });
    expect(parseTemplateArg("distance:10|type:burst")).toEqual({ shape: "burst", distance: 10 });
  });

  it("real doc: width/traits/etc are dropped, shape+distance still resolve", () => {
    expect(parseTemplateArg("line|distance:100|width:10")).toEqual({
      shape: "line",
      distance: 100,
    });
  });
});

describe("parseDamageArg + formatDamageDisplay", () => {
  it("keeps the RAW formula (parens intact) but strips the paren for display", () => {
    const { parts } = parseDamageArg("(2d8+4)[slashing]");
    expect(parts).toEqual([{ formula: "(2d8+4)", type: "slashing" }]);
    expect(formatDamageDisplay(parts)).toBe("2d8+4 slashing");
  });

  it("does NOT strip parens that close before the formula ends (actor-relative torture case)", () => {
    const { parts } = parseDamageArg("(floor((@actor.level+1)/2)+1)d6[poison]");
    expect(parts).toEqual([{ formula: "(floor((@actor.level+1)/2)+1)d6", type: "poison" }]);
    expect(formatDamageDisplay(parts)).toBe("(floor((@actor.level+1)/2)+1)d6 poison");
  });

  it("handles a bare untyped formula (67 real uses have no [type] at all)", () => {
    const { parts } = parseDamageArg("40");
    expect(parts).toEqual([{ formula: "40" }]);
    expect(formatDamageDisplay(parts)).toBe("40");
  });

  it("real multi-part doc (ioseff-xarwin): comma-separated parts each keep their own type", () => {
    const { parts, rawFormula } = parseDamageArg("8d6[slashing],2d6[bleed]");
    expect(rawFormula).toBe("8d6[slashing],2d6[bleed]");
    expect(parts).toEqual([
      { formula: "8d6", type: "slashing" },
      { formula: "2d6", type: "bleed" },
    ]);
    expect(formatDamageDisplay(parts)).toBe("8d6 slashing, 2d6 bleed");
  });

  it("real multi-part doc (hellfire-tornado routine field): parenthesized multi-part formula", () => {
    const { parts } = parseDamageArg("(4d10)[bludgeoning],(4d6)[fire]");
    expect(formatDamageDisplay(parts)).toBe("4d10 bludgeoning, 4d6 fire");
  });

  it("a pipe-suffix (options:area-damage, the dominant real key at 3,824 uses) is dropped from the formula", () => {
    const { rawFormula, parts } = parseDamageArg("4d8[piercing]|options:area-damage");
    expect(rawFormula).toBe("4d8[piercing]");
    expect(parts).toEqual([{ formula: "4d8", type: "piercing" }]);
  });

  it("joins a multi-trait [type] annotation with a space for display", () => {
    const { parts } = parseDamageArg("(5)[persistent,mental]");
    expect(formatDamageDisplay(parts)).toBe("5 persistent mental");
  });
});

describe("parseActionArg", () => {
  it("parses the action slug + space-separated key=value options", () => {
    expect(parseActionArg("administer-first-aid dc=29")).toEqual({
      action: "administer-first-aid",
      options: { dc: "29" },
    });
  });

  it("parses an action with no options at all", () => {
    expect(parseActionArg("avert-gaze")).toEqual({ action: "avert-gaze", options: {} });
  });

  it("parses multiple options (real doc: aid skill=occultism traits=auditory,linguistic)", () => {
    expect(parseActionArg("aid skill=occultism traits=auditory,linguistic")).toEqual({
      action: "aid",
      options: { skill: "occultism", traits: "auditory,linguistic" },
    });
  });
});

describe("mergeLocalizeMaps (D29-5 precedence)", () => {
  it("re-en.json wins over en.json for a key present in both with differing text", () => {
    // Ascending precedence: earlier files lose to later ones.
    const merged = mergeLocalizeMaps([{ K: "from en" }, { K: "from re-en" }]);
    expect(merged.get("K")).toBe("from re-en");
  });

  it("flattens nested objects into dot-joined keys", () => {
    const merged = mergeLocalizeMaps([{ PF2E: { NPC: { Glossary: { Foo: "bar" } } } }]);
    expect(merged.get("PF2E.NPC.Glossary.Foo")).toBe("bar");
  });

  it("real collision finding: en.json and sf2e-overrides-en.json share exactly 3 keys with DIFFERING text (PF2E.TraitDescriptionDeadly is one) — merging [sf2e-overrides, en] ascending (en last) makes the plain PF2e text win, which is correct since this pipeline never fetches the sf2e pack tree", () => {
    const merged = mergeLocalizeMaps([
      { [langSubset.collision.key]: langSubset.collision.sf2eOverrides },
      { [langSubset.collision.key]: langSubset.collision.en },
    ]);
    expect(merged.get(langSubset.collision.key)).toBe(langSubset.collision.en);
    expect(merged.get(langSubset.collision.key)).not.toBe(langSubset.collision.sf2eOverrides);
  });
});

describe("parseEnrichedText: hard-fail posture", () => {
  it("throws EnricherGrammarError on an unknown @Tag[ form, carrying the source span", () => {
    const ctx = makeCtx();
    try {
      parseEnrichedText("Some prose @Foo[bar] more prose.", ctx);
      expect.fail("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnricherGrammarError);
      const err = e as EnricherGrammarError;
      expect(err.source.slice(err.start, err.end)).toContain("@Foo[");
    }
  });

  it("throws on an unknown [[/x roll form", () => {
    const ctx = makeCtx();
    expect(() => parseEnrichedText("[[/what 1d4]]", ctx)).toThrow(EnricherGrammarError);
  });

  it("throws on an unresolved @Localize key (fetch/merge bug posture)", () => {
    const ctx = makeCtx();
    expect(() => parseEnrichedText("@Localize[PF2E.Nonexistent.Key]", ctx)).toThrow(
      EnricherGrammarError,
    );
  });
});

describe("parseEnrichedText: real fixture — spit-ambient-magic (depth-nested @Damage torture + @Check extra key)", () => {
  it("parses the raw formula verbatim and computes the display string, plus reports the extra @Check key", () => {
    const fixture = readFixture("spit-ambient-magic.json");
    const ctx = makeCtx();
    // Strip the surrounding <p>/<hr>/<strong> HTML — this file tests enrichers.ts
    // in isolation; the same raw string round-trips through parseFoundryHtml in
    // foundryHtml.test.ts.
    const inner =
      "This magical dart deals @Damage[((1+floor((@actor.level -2)/4))d6)[piercing]] damage (@Check[reflex|against:class-spell|basic] save against the higher of your class DC or spell DC).";
    expect(fixture.description).toContain(inner.slice(0, 40));
    const nodes = parseEnrichedText(inner, ctx);
    const damage = nodes.find((n) => n.kind === "damage");
    const check = nodes.find((n) => n.kind === "check");
    expect(damage).toEqual({
      kind: "damage",
      formula: "((1+floor((@actor.level -2)/4))d6)[piercing]",
      display: "(1+floor((@actor.level -2)/4))d6 piercing",
    });
    expect(check).toEqual({
      kind: "check",
      type: "reflex",
      basic: true,
      extra: { against: "class-spell" },
    });
    expect(getReports(ctx)).toContainEqual({ cls: "checkExtraKey", detail: "against" });
  });
});

describe("parseEnrichedText: real fixture — phantasmal-amputation (multi-part @Damage with a {label})", () => {
  it("keeps the {label} on the multi-part damage node", () => {
    const ctx = makeCtx();
    const snippet =
      "takes @Damage[8d6[slashing],2d6[bleed]]{8d6 slashing damage and 2d6 bleed damage} as their left hand";
    const nodes = parseEnrichedText(snippet, ctx);
    const damage = nodes.find((n) => n.kind === "damage");
    expect(damage).toEqual({
      kind: "damage",
      formula: "8d6[slashing],2d6[bleed]",
      display: "8d6 slashing, 2d6 bleed",
      label: "8d6 slashing damage and 2d6 bleed damage",
    });
    expect(getReports(ctx)).toContainEqual({
      cls: "damageMultiPart",
      detail: "8d6[slashing],2d6[bleed]",
    });
  });

  it("resolves the fixture's @UUID labels via the injected resolveUuid callback", () => {
    const ctx = makeCtx({
      resolveUuid: (uuid) => ({
        kind: "crossref",
        id: `condition/${uuid.split(".").pop()}`,
        display: uuid,
      }),
    });
    const nodes = parseEnrichedText(
      "The creature is @UUID[Compendium.pf2e.conditionitems.Item.Sickened]{Sickened 1} by pain.",
      ctx,
    );
    expect(nodes.find((n) => n.kind === "crossref")).toEqual({
      kind: "crossref",
      targetId: "condition/Sickened",
      display: "Sickened 1",
    });
  });
});

describe("parseEnrichedText: real fixture — diabolic-pact ([[/gmr ...]] with a {label})", () => {
  it("parses the gmr roll form with its label, keeping the #comment inside the raw formula", () => {
    const ctx = makeCtx();
    const nodes = parseEnrichedText("serve you for [[/gmr 1d4 #Weeks]]{1d4 weeks}.", ctx);
    expect(nodes.find((n) => n.kind === "inlineRoll")).toEqual({
      kind: "inlineRoll",
      rollKind: "gmr",
      formula: "1d4 #Weeks",
      label: "1d4 weeks",
    });
  });
});

describe("parseEnrichedText: real @Localize fixtures", () => {
  it("resolves a plain-text value (re-en.json) with NO wrapping <p> as inline content directly, and recurses into its own nested @UUID", () => {
    const ctx = makeCtx({
      localize: new Map(Object.entries(langSubset.reEn)),
      resolveUuid: () => ({
        kind: "crossref",
        id: "effect/debilitating-strike",
        display: "the effect",
      }),
    });
    const fixture = readFixture("debilitating-strike-note.json");
    expect(fixture.noteText).toContain("SpeedPenalty.Note");
    const nodes = parseEnrichedText(
      "@Localize[PF2E.SpecificRule.Rogue.Debilitation.SpeedPenalty.Note]",
      ctx,
    );
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node?.kind).toBe("localizedBoilerplate");
    if (node?.kind !== "localizedBoilerplate") throw new Error("unreachable");
    expect(node.sourceKey).toBe("PF2E.SpecificRule.Rogue.Debilitation.SpeedPenalty.Note");
    // The resolved value has no block tags -> parsed as bare inline content, and
    // its own nested @UUID recursed through the SAME resolveUuid callback.
    expect(node.children.some((c) => c.kind === "crossref")).toBe(true);
    expect(node.children.some((c) => c.kind === "text" && c.content.includes("-10-foot"))).toBe(
      true,
    );
  });

  it("resolves a block-HTML value (en.json) by recursing through ctx.parseBlockHtml", () => {
    const blockCalls: string[] = [];
    const ctx = makeCtx({
      localize: new Map(Object.entries(langSubset.en)),
      parseBlockHtml: (html) => {
        blockCalls.push(html);
        return [{ kind: "divider" }];
      },
    });
    const nodes = parseEnrichedText(
      "@Localize[PF2E.NPC.Abilities.Glossary.AttackOfOpportunity]",
      ctx,
    );
    expect(nodes).toHaveLength(1);
    expect(blockCalls).toHaveLength(1);
    expect(blockCalls[0]).toContain("<p>");
    const node = nodes[0];
    if (node?.kind !== "localizedBoilerplate") throw new Error("unreachable");
    expect(node.children).toEqual([{ kind: "divider" }]);
  });

  it("real corpus finding: @Localize sitting inline next to a @Check within the same source <p> (3 real occurrences total) still produces a valid inline node sequence", () => {
    const ctx = makeCtx({
      localize: new Map([["PF2E.NPC.Abilities.Glossary.Buck", "<p>Bucks off riders.</p>"]]),
      parseBlockHtml: () => [{ kind: "divider" }], // stand-in; foundryHtml.test.ts covers the real block path
    });
    const nodes = parseEnrichedText(
      "@Check[reflex|dc:26] @Localize[PF2E.NPC.Abilities.Glossary.Buck]",
      ctx,
    );
    expect(nodes.map((n) => n.kind)).toEqual(["check", "text", "localizedBoilerplate"]);
  });
});

describe("parseEnrichedText: mixed plain text + enrichers", () => {
  it("interleaves text nodes and enricher nodes in source order, decoding entities in the text runs", () => {
    const ctx = makeCtx();
    const nodes = parseEnrichedText("Tom &amp; Jerry deal @Damage[1d4[fire]] damage.", ctx);
    expect(nodes).toEqual([
      text("Tom & Jerry deal "),
      { kind: "damage", formula: "1d4[fire]", display: "1d4 fire" },
      text(" damage."),
    ]);
  });

  it("returns a single text node for input with no enrichers at all", () => {
    const ctx = makeCtx();
    expect(parseEnrichedText("nothing special here", ctx)).toEqual([text("nothing special here")]);
  });

  it("handles an @Embed enricher, dropping its render-hint options (reported)", () => {
    const ctx = makeCtx();
    const nodes = parseEnrichedText(
      "@Embed[Compendium.pf2e.actionspf2e.Item.7GeguyqyD1TjoC4r inline hr=false]",
      ctx,
    );
    expect(nodes).toEqual([
      {
        kind: "embed",
        target: "Compendium.pf2e.actionspf2e.Item.7GeguyqyD1TjoC4r",
        resolved: false,
      },
    ]);
    expect(getReports(ctx)).toContainEqual({
      cls: "embedOptionsDropped",
      detail: "inline hr=false",
    });
  });

  it("reports excludedRef/brokenRef and renders as plain-text-shaped brokenRef nodes", () => {
    const ctx = makeCtx({
      resolveUuid: (uuid) =>
        uuid.includes("macros") ? { kind: "excluded", display: "a macro" } : { kind: "broken" },
    });
    const nodes = parseEnrichedText(
      "@UUID[Compendium.pf2e.macros.Macro.abc] and @UUID[Compendium.pf2e.x.Item.zzz]",
      ctx,
    );
    expect(nodes[0]).toEqual({
      kind: "brokenRef",
      target: "Compendium.pf2e.macros.Macro.abc",
      display: "a macro",
    });
    expect(nodes[2]).toEqual({
      kind: "brokenRef",
      target: "Compendium.pf2e.x.Item.zzz",
      display: "Compendium.pf2e.x.Item.zzz",
    });
    expect(getReports(ctx).map((r) => r.cls)).toEqual(["excludedRef", "brokenRef"]);
  });
});
