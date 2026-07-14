import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodexEntitySchema } from "../../schema/entity";
import { noEmbeds, rootRenderCtx } from "./nodes";
import { CreatureStatblock, EmbeddedItemSections, HazardStatblock } from "./statblock";

const FIXTURE_ROOT = join(import.meta.dirname, "../../../fixtures/entities");

function loadEntity(relPath: string) {
  return CodexEntitySchema.parse(JSON.parse(readFileSync(join(FIXTURE_ROOT, relPath), "utf8")));
}

const ctx = rootRenderCtx({ resolveEmbed: noEmbeds(), knownTraitIds: new Set() });

describe("CreatureStatblock (against the real adamantine-dragon-adult fixture)", () => {
  const dragon = loadEntity("creature/adamantine-dragon-adult.json");

  it("renders perception/senses, languages, skills, ability mods, AC/saves, HP/immunities, speeds", () => {
    const out = renderToStaticMarkup(<CreatureStatblock entity={dragon} />);
    expect(out).toContain("Perception");
    expect(out).toContain("darkvision");
    expect(out).toContain("Languages");
    expect(out).toContain("Common"); // humanized from "common"
    expect(out).toContain("Skills");
    expect(out).toContain("Athletics +27");
    expect(out).toContain("STR +8");
    expect(out).toContain("AC 33");
    expect(out).toContain("Fort +25");
    expect(out).toContain("HP 220");
    expect(out).toContain("paralyzed");
    expect(out).toContain("Speed");
    expect(out).toContain("30 feet");
    expect(out).toContain("burrow 40 feet");
  });

  it("absent fields are simply omitted (fail-soft), never 'undefined'", () => {
    const out = renderToStaticMarkup(<CreatureStatblock entity={dragon} />);
    expect(out).not.toContain("undefined");
  });
});

describe("EmbeddedItemSections (dragon strikes/actions + spellcaster variant's spellcasting)", () => {
  const dragon = loadEntity("creature/adamantine-dragon-adult.json");
  const spellcaster = loadEntity("creature/adamantine-dragon-adult-spellcaster.json");

  it("renders strikes with an action glyph, attack bonus, traits, and damage", () => {
    expect(dragon.embeddedItems).toBeDefined();
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={dragon.embeddedItems ?? []} ctx={ctx} />,
    );
    expect(out).toContain("Jaws");
    expect(out).toContain("+27");
    expect(out).toContain("3d12+14 piercing");
    expect(out).toContain("<svg"); // the strike's action glyph
    expect(out).not.toContain("undefined");
  });

  it("renders actions/abilities with a glyph where the actionCost is knowable, plain for 'passive'", () => {
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={dragon.embeddedItems ?? []} ctx={ctx} />,
    );
    expect(out).toContain("Frightful Presence");
    expect(out).toContain("Grab");
  });

  it("B2 (adversarial) surfaces naturally here: the real Grab ability body renders without nested <p>", () => {
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={dragon.embeddedItems ?? []} ctx={ctx} />,
    );
    expect(out).not.toContain("<p><p");
  });

  it("renders a spellcasting entry with DC/attack/tradition + grouped spell links", () => {
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={spellcaster.embeddedItems ?? []} ctx={ctx} />,
    );
    expect(out).toContain("Primal Prepared Spells");
    expect(out).toContain("DC 34");
    expect(out).toContain("+27 to hit");
    expect(out).toContain("Primal");
    expect(out).toContain('href="/spell/petrify"');
    expect(out).toContain("Petrify");
  });

  it("empty embeddedItems -> null", () => {
    expect(renderToStaticMarkup(<EmbeddedItemSections items={[]} ctx={ctx} />)).toBe("");
  });
});

describe("HazardStatblock (against the real gravehall-trap complex hazard fixture)", () => {
  const hazard = loadEntity("hazard/gravehall-trap.json");

  it("renders AC/saves/HP, complexity, and disable/routine block content", () => {
    const out = renderToStaticMarkup(<HazardStatblock entity={hazard} ctx={ctx} />);
    expect(out).toContain("AC 20");
    expect(out).toContain("HP 60");
    expect(out).toContain("Complex");
    expect(out).toContain("Disable");
    expect(out).toContain("Thievery");
    expect(out).toContain("Routine");
    expect(out).not.toContain("undefined");
  });
});
