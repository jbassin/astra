import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodexEntitySchema, type EmbeddedItem } from "../../schema/entity";
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

  it("D29-74 (P7): a merged lore-skill slug renders HUMANIZED — 'Mining Lore +24', never first-char-only 'Mining-lore'", () => {
    const out = renderToStaticMarkup(<CreatureStatblock entity={dragon} />);
    expect(out).toContain("Mining Lore +24");
    expect(out).not.toContain("Mining-lore");
    // single-word core skills render identically to the pre-humanizer output
    expect(out).toContain("Athletics +27");
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
    expect(out).toContain("codex-action-glyph"); // the strike's action glyph
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

  it("D29-73 (P7): a strike's transform-baked range renders as a parenthetical after the trait pills (the spellcaster's Rock, range increment 120)", () => {
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={spellcaster.embeddedItems ?? []} ctx={ctx} />,
    );
    expect(out).toContain("(range increment 120 feet)");
    expect(out).toContain("codex-strike-range");
  });

  it("D29-73 (P7): a range-less melee strike renders no range parenthetical (Jaws)", () => {
    const jaws = (dragon.embeddedItems ?? []).filter((i) => i.name === "Jaws");
    expect(jaws).toHaveLength(1);
    const out = renderToStaticMarkup(<EmbeddedItemSections items={jaws} ctx={ctx} />);
    expect(out).not.toContain("codex-strike-range");
  });

  it("D29-75 (P7): lore items are EXCLUDED from the abilities bucket — the bonus lives in the Skills row instead", () => {
    const items = spellcaster.embeddedItems ?? [];
    expect(items.some((i) => i.type === "lore")).toBe(true); // fixture pin: Mining Lore exists
    const out = renderToStaticMarkup(<EmbeddedItemSections items={items} ctx={ctx} />);
    expect(out).not.toContain('data-ability-slug="mining-lore"');
  });
});

describe("D29-76 (P7): empty-stub filter in the abilities bucket (synthetic items)", () => {
  function item(overrides: Partial<EmbeddedItem> & { name: string; slug: string }): EmbeddedItem {
    return { type: "action", traits: [], body: [], ...overrides };
  }

  const stub = item({ name: "Bottle", slug: "bottle", type: "equipment" });
  const realAbility = item({
    name: "Frightful Presence",
    slug: "frightful-presence",
    actionCost: "passive",
  });

  it("a body-less, trait-less, cost-less other-bucket item is skipped; a real ability survives", () => {
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={[stub, realAbility]} ctx={ctx} />,
    );
    expect(out).not.toContain("Bottle");
    expect(out).toContain("Frightful Presence");
  });

  it("an item with ONLY traits, or ONLY an actionCost, or ONLY a body is NOT a stub", () => {
    const traitsOnly = item({ name: "Traity", slug: "traity", traits: ["magical"] });
    const costOnly = item({ name: "Costy", slug: "costy", actionCost: "reaction" });
    const bodyOnly = item({
      name: "Bodied",
      slug: "bodied",
      body: [
        {
          kind: "paragraph",
          children: [
            {
              kind: "text",
              content: "real text",
              marks: { bold: false, italic: false, superscript: false },
            },
          ],
        },
      ],
    });
    const out = renderToStaticMarkup(
      <EmbeddedItemSections items={[traitsOnly, costOnly, bodyOnly]} ctx={ctx} />,
    );
    expect(out).toContain("Traity");
    expect(out).toContain("Costy");
    expect(out).toContain("Bodied");
  });

  it("strikes and spellcasting entries are NOT stub-filtered (a bare melee item still renders)", () => {
    const bareStrike = item({ name: "Fist", slug: "fist", type: "melee", attackBonus: 5 });
    const out = renderToStaticMarkup(<EmbeddedItemSections items={[bareStrike]} ctx={ctx} />);
    expect(out).toContain("Fist");
    expect(out).toContain("+5");
  });

  it("ALL items filtered away (lore + stubs only) -> null, never an empty codex-embedded-items shell", () => {
    const lore = item({ name: "Mining Lore", slug: "mining-lore", type: "lore" });
    const out = renderToStaticMarkup(<EmbeddedItemSections items={[stub, lore]} ctx={ctx} />);
    expect(out).toBe("");
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
