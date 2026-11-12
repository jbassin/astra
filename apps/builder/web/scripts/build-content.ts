// Pre-build content step (the strider pattern): joins the imported 5etools data
// (content/5etools/*.json, written by scripts/import-5etools.ts) with the hand-written curation
// (content/*.ts) and emits one typed module, src/generated/content.ts, which the engine and the
// UI import. The runtime never reads these files.
//
// The build fails, listing every problem, on: a curated id that isn't in the imported data, an
// imported level 1–2 feature or species trait with no summary (or explicit `hidden` reason), a
// shortlist smaller than its pick count, a spell that isn't on the class's list, a pick count
// the class table doesn't give, a shown feature, trait, option or feat with no activation, or a
// spell whose rules text rolls damage or healing dice its sheet entry doesn't carry, a spell or
// class option whose gist is missing or longer than GIST_MAX, or a class whose species
// sub-choices miss a species that has them or name one the species doesn't offer. Pick counts
// come from the class table, never from here.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContent, defineContentSource, emitModule } from "@astra/content-build";

import { LANGUAGE_FILL, TOOL_FALLBACK } from "../content/general";
import { ARCHETYPES } from "../src/domain/character";
import {
  type Ability,
  ACTIVATIONS,
  type Activation,
  type AlwaysPreparedSpell,
  BACKGROUND_IDS,
  type BackgroundContent,
  type BackgroundId,
  type BuilderContent,
  CLASS_IDS,
  type ClassContent,
  type ClassId,
  DAMAGE_ON,
  type DamageOn,
  type EquipmentLine,
  type FeatContent,
  GIST_MAX,
  type ItemContent,
  type OptionContent,
  type OptionGroupContent,
  type OptionGroupKey,
  type OptionKind,
  SPECIES_IDS,
  type SpeciesContent,
  type SpeciesId,
  type SpellList,
  type SpellContent,
  type SpellcastingContent,
  type Summarized,
  type Uses,
  type WeaponProficiency,
} from "../src/domain/contentTypes";
import type {
  CuratedCount,
  CuratedSpell,
  CuratedSpellList,
  CuratedUses,
} from "../src/domain/curationTypes";
import {
  IMPORT_FILES,
  type ImportedClass,
  type ImportedData,
  type ImportedEquipment,
} from "../src/domain/imported";
import { CURATION, type Curation } from "./curation";
import { iconSource } from "./icons";
import { unshownRolls } from "./spell-rolls";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const IMPORT_DIR = path.join(ROOT, "content", "5etools");
const OUT_DIR = path.join(ROOT, "src", "generated");

const GROUP_KIND: Record<OptionGroupKey, OptionKind> = {
  fightingStyle: "fighting-style",
  divineOrder: "divine-order",
  primalOrder: "primal-order",
  invocations: "invocation",
  metamagic: "metamagic",
};

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** How many of `a` also appear in `b`, at most `cap`. */
function overlap(a: SpellList, b: SpellList, cap: number): number {
  return Math.min(cap, a.filter((x) => b.includes(x)).length);
}

/** Reads the imported JSON from content/5etools/. */
export function loadImported(dir = IMPORT_DIR): ImportedData {
  const out: Partial<Record<keyof ImportedData, unknown>> = {};
  for (const [key, file] of Object.entries(IMPORT_FILES)) {
    out[key as keyof ImportedData] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return out as ImportedData;
}

/** Joins imported data and curation, collecting every problem; throws if there are any. */
export function joinContent(data: ImportedData, curation: Curation = CURATION): BuilderContent {
  const errors: string[] = [];
  const fail = (msg: string): void => {
    errors.push(msg);
  };

  const items = new Map(data.items.map((i) => [i.id, i]));
  const skills = new Set(data.skills.map((s) => s.id));
  const importedSpells = new Map(data.spells.map((s) => [s.id, s]));
  const languageNames = Object.fromEntries(data.languages.map((l) => [l.id, l.name]));
  const standardLanguages = new Set(
    data.languages.filter((l) => l.type === "standard").map((l) => l.id),
  );
  const usedSpells = new Set<string>();

  // ---- helpers ----------------------------------------------------------------------------

  function tableNumber(cls: ImportedClass, label: string, ctx: string): number {
    const cell = cls.table[label]?.[1];
    const n = cell === undefined ? Number.NaN : Number.parseInt(cell.replace(/^\+/, ""), 10);
    if (!Number.isFinite(n))
      fail(`${ctx}: class table of ${cls.id} has no numeric "${label}" at level 2`);
    return Number.isFinite(n) ? n : 0;
  }

  function count(c: CuratedCount, cls: ImportedClass | undefined, ctx: string): Uses["count"] {
    if (typeof c === "number" || c === "pb" || c === "cha") return c;
    if (!cls) {
      fail(`${ctx}: a class-table count needs a class`);
      return 0;
    }
    return tableNumber(cls, c.table, ctx);
  }

  function uses(
    u: CuratedUses | undefined,
    cls: ImportedClass | undefined,
    ctx: string,
  ): Uses | undefined {
    if (!u) return undefined;
    return { ...u, count: count(u.count, cls, ctx) };
  }

  /** A curated activation, checked: the sheet sorts by it, so a missing one fails the build. */
  function activation(a: Activation | undefined, ctx: string): Activation {
    if (a === undefined || !(ACTIVATIONS as readonly string[]).includes(a)) {
      fail(`${ctx}: no activation (want one of ${ACTIVATIONS.join(", ")})`);
      return "passive";
    }
    return a;
  }

  /** A pick card's gist, checked: a missing or over-long one fails the build. */
  function gist(g: string | undefined, ctx: string): string {
    if (!g?.trim()) fail(`${ctx}: no gist (one short line for its pick card)`);
    else if (g.length > GIST_MAX) fail(`${ctx}: gist has ${g.length} characters (max ${GIST_MAX})`);
    return g ?? "";
  }

  function spellList(
    ids: CuratedSpellList,
    ctx: string,
    want: { level: number; list?: string; min: number },
  ): SpellList {
    const seen = new Set<string>();
    for (const id of ids) {
      const s = importedSpells.get(id);
      if (!s) fail(`${ctx}: spell "${id}" is not in the imported data`);
      else {
        if (s.level !== want.level) fail(`${ctx}: "${id}" is level ${s.level}, not ${want.level}`);
        if (want.list && !s.classes.includes(want.list))
          fail(`${ctx}: "${id}" is not on the ${want.list} list`);
      }
      if (seen.has(id)) fail(`${ctx}: "${id}" is listed twice`);
      seen.add(id);
      usedSpells.add(id);
    }
    if (ids.length < want.min) fail(`${ctx}: list has ${ids.length}, needs at least ${want.min}`);
    return [...ids];
  }

  function equipment(
    list: ImportedEquipment[],
    choices: Record<string, string> | undefined,
    ctx: string,
    swaps: Record<string, { item: string; name: string }> = {},
  ): { lines: EquipmentLine[]; gold: number } {
    const lines: EquipmentLine[] = [];
    let cp = 0;
    for (const e of list) {
      if (e.valueCp !== undefined) cp += e.valueCp;
      else if (e.special) lines.push({ name: e.special, quantity: e.quantity ?? 1 });
      else {
        const id = e.item ?? (e.choice ? choices?.[e.choice] : undefined);
        if (!id) {
          fail(`${ctx}: no fill for equipment placeholder "${e.choice}"`);
          continue;
        }
        const swap = swaps[id];
        const item = items.get(swap?.item ?? id);
        if (!item) fail(`${ctx}: item "${swap?.item ?? id}" is not in the imported data`);
        lines.push({
          item: swap?.item ?? id,
          name: swap?.name ?? e.displayName ?? item?.name ?? id,
          quantity: e.quantity ?? 1,
        });
      }
    }
    return { lines, gold: cp / 100 };
  }

  function checkItems(ids: string[], kinds: ItemContent["kind"][], ctx: string): void {
    for (const id of ids) {
      const item = items.get(id);
      if (!item) fail(`${ctx}: item "${id}" is not in the imported data`);
      else if (!kinds.includes(item.kind))
        fail(`${ctx}: "${id}" is a ${item.kind}, not ${kinds.join("/")}`);
    }
  }

  function checkSkills(ids: string[], ctx: string): void {
    for (const id of ids) if (!skills.has(id)) fail(`${ctx}: unknown skill "${id}"`);
  }

  // ---- options ----------------------------------------------------------------------------

  const classFeatureById = new Map(
    data.classes.flatMap((c) => c.features.map((f) => [f.id, f] as const)),
  );
  const featById = new Map(data.feats.map((f) => [f.id, f]));
  const optionalById = new Map(data.optionalFeatures.map((o) => [o.id, o]));

  const options: Record<string, OptionContent> = {};
  for (const [id, o] of Object.entries(curation.options)) {
    const ctx = `option ${id}`;
    let name = id;
    let rulesText: string[] = [];
    if ("feat" in o.from) {
      const f = featById.get(o.from.feat);
      if (!f) fail(`${ctx}: feat "${o.from.feat}" is not in the imported data`);
      else ({ name, text: rulesText } = f);
    } else if ("optionalFeature" in o.from) {
      const f = optionalById.get(o.from.optionalFeature);
      if (!f)
        fail(`${ctx}: optional feature "${o.from.optionalFeature}" is not in the imported data`);
      else {
        ({ name, text: rulesText } = f);
        if (f.minLevel !== undefined && f.minLevel > 2)
          fail(`${ctx}: needs Warlock level ${f.minLevel}`);
        if (o.kind === "metamagic" && o.cost !== f.cost)
          fail(`${ctx}: cost ${o.cost} but the data says ${f.cost}`);
      }
    } else {
      const f = classFeatureById.get(o.from.classFeature);
      if (!f) fail(`${ctx}: class feature "${o.from.classFeature}" is not in the imported data`);
      else ({ name, text: rulesText } = f);
    }
    const out: OptionContent = {
      id,
      name,
      kind: o.kind,
      gist: gist(o.gist, ctx),
      summary: o.summary,
      rulesText,
      activation: activation(o.activation, ctx),
    };
    const u = uses(o.uses, undefined, ctx);
    if (u) out.uses = u;
    if (o.cost !== undefined) out.cost = o.cost;
    if (o.grantsCantrips) {
      const g = o.grantsCantrips;
      out.grantsCantrips = {
        ...g,
        cantrips: spellList(g.cantrips, `${ctx} cantrips`, {
          level: 0,
          list: g.list,
          min: g.count,
        }),
      };
    }
    if (o.extraCantrips) out.extraCantrips = o.extraCantrips;
    if (o.requires) out.requires = o.requires;
    if (o.grantsSpell) {
      if (!importedSpells.has(o.grantsSpell.id))
        fail(`${ctx}: granted spell "${o.grantsSpell.id}" not imported`);
      usedSpells.add(o.grantsSpell.id);
      out.grantsSpell = o.grantsSpell;
    }
    options[id] = out;
  }

  // ---- classes ----------------------------------------------------------------------------

  const backgroundsFor = (primary: Ability): BackgroundId[] =>
    BACKGROUND_IDS.filter((b) =>
      data.backgrounds.find((x) => x.id === b)?.abilities.includes(primary),
    );

  const classes = {} as Record<ClassId, ClassContent>;
  for (const id of CLASS_IDS) {
    const cur = curation.classes.find((c) => c.id === id);
    const imp = data.classes.find((c) => c.id === id);
    const ctx = `class ${id}`;
    if (!cur || !imp) {
      fail(`${ctx}: missing from ${cur ? "the import" : "content/classes.ts"}`);
      continue;
    }

    // Features: every imported level 1–2 feature must be summarized or hidden on purpose.
    for (const f of imp.features)
      if (!(f.id in cur.features)) fail(`${ctx}: feature "${f.id}" has no summary`);
    for (const key of Object.keys(cur.features)) {
      if (!imp.features.some((f) => f.id === key))
        fail(`${ctx}: curated feature "${key}" is not imported`);
    }
    const features = imp.features.flatMap((f) => {
      const c = cur.features[f.id];
      if (!c || c.hidden !== undefined) return [];
      const u = uses(c.uses, imp, `${ctx} ${f.id}`);
      return [
        {
          id: f.id,
          name: f.name,
          level: f.level,
          summary: c.summary,
          rulesText: f.text,
          activation: activation(c.activation, `${ctx} ${f.id}`),
          ...(u && { uses: u }),
        },
      ];
    });

    // Skills.
    checkSkills(cur.skillPreference, ctx);
    let skillCount: number;
    if ("from" in imp.skillChoice) {
      skillCount = imp.skillChoice.count;
      const allowed = new Set(imp.skillChoice.from);
      const missing = [...allowed].filter((s) => !cur.skillPreference.includes(s));
      const extra = cur.skillPreference.filter((s) => !allowed.has(s));
      if (missing.length > 0 || extra.length > 0) {
        fail(
          `${ctx}: skillPreference must list exactly the class skills (missing ${missing}, extra ${extra})`,
        );
      }
    } else {
      skillCount = imp.skillChoice.any;
      if (cur.skillPreference.length < skillCount + 2)
        fail(`${ctx}: skillPreference too short for "any"`);
    }

    // Expertise: the count comes from the feature text.
    let expertiseCount = 0;
    for (const f of imp.features) {
      const text = f.text.join(" ");
      const m = text.match(/You gain Expertise in (\w+) of your skill proficiencies/);
      if (m) expertiseCount += NUMBER_WORDS[m[1] ?? ""] ?? 0;
      else if (/You gain Expertise in that skill|You have Expertise in the chosen skill/.test(text))
        expertiseCount += 1;
    }
    const expertisePreference = cur.expertisePreference ?? [];
    checkSkills(expertisePreference, ctx);
    if (expertisePreference.length < expertiseCount) {
      fail(
        `${ctx}: needs ${expertiseCount} expertise picks, preference lists ${expertisePreference.length}`,
      );
    }

    // Weapon masteries.
    const masteryCount = imp.masteries[1];
    const masteryWeapons = cur.masteryWeapons ?? [];
    checkItems(masteryWeapons, ["weapon"], `${ctx} masteries`);
    if (masteryWeapons.length < masteryCount) fail(`${ctx}: needs ${masteryCount} mastery weapons`);

    // Tools: as many as the rules text grants.
    checkItems(cur.tools, ["tool", "instrument", "gaming"], `${ctx} tools`);
    const toolText = imp.tools.join(" ");
    const toolCount =
      imp.tools.length === 0
        ? 0
        : (NUMBER_WORDS[toolText.match(/Choose (\w+)/)?.[1] ?? ""] ?? imp.tools.length);
    if (cur.tools.length !== toolCount)
      fail(`${ctx}: ${cur.tools.length} tools, the rules grant ${toolCount}`);

    // Option groups.
    const optionGroups: OptionGroupContent[] = (cur.optionGroups ?? []).map((g) => {
      const gctx = `${ctx} ${g.key}`;
      let n = 0;
      if (typeof g.count === "number") n = g.count;
      else if ("table" in g.count) n = tableNumber(imp, g.count.table, gctx);
      else if ("optionalFeature" in g.count) {
        const name = g.count.optionalFeature;
        const p = imp.optionalFeatureProgression.find((x) => x.name === name);
        if (!p) fail(`${gctx}: no optional-feature progression "${name}"`);
        n = p?.counts[1] ?? 0;
      } else {
        const name = g.count.featProgression;
        const ps = imp.featProgression.filter((x) => x.name === name);
        if (ps.length === 0) fail(`${gctx}: no feat progression "${name}"`);
        n = ps.reduce((sum, p) => sum + p.count, 0);
        const categories = new Set(ps.flatMap((p) => p.categories));
        for (const c of g.choices) {
          const o = curation.options[c];
          if (o && "feat" in o.from) {
            const cat = featById.get(o.from.feat)?.category;
            if (cat && !categories.has(cat)) fail(`${gctx}: "${c}" (${cat}) isn't open to ${id}`);
          }
        }
      }
      for (const c of g.choices) {
        if (!options[c]) fail(`${gctx}: option "${c}" is not in content/options.ts`);
        else if (options[c].kind !== GROUP_KIND[g.key])
          fail(`${gctx}: "${c}" is a ${options[c].kind}`);
      }
      const min = n === 1 ? 2 : n + 1;
      if (g.choices.length < min)
        fail(`${gctx}: ${g.choices.length} choices for ${n} picks (want ≥ ${min})`);
      return { key: g.key, label: g.label, prompt: g.prompt, count: n, choices: g.choices };
    });

    // Spellcasting.
    let spellcasting: SpellcastingContent | undefined;
    if (imp.spellcastingAbility) {
      const pact = imp.casterProgression === "pact";
      const cantripCount = imp.table.Cantrips ? tableNumber(imp, "Cantrips", ctx) : 0;
      const preparedCount = tableNumber(imp, "Prepared Spells", ctx);
      let slots: number[] = [];
      let pactSlotLevel: number | undefined;
      if (pact) {
        const n = tableNumber(imp, "Spell Slots", ctx);
        pactSlotLevel = tableNumber(imp, "Slot Level", ctx);
        const level = pactSlotLevel;
        slots = Array.from({ length: level }, (_, i) => (i === level - 1 ? n : 0));
      } else if (imp.spellSlots) {
        slots = [...imp.spellSlots[1]];
        while (slots.length > 0 && slots.at(-1) === 0) slots.pop();
      } else fail(`${ctx}: a spellcaster with no spell slots`);
      const extra = Math.max(
        0,
        ...optionGroups.flatMap((g) => g.choices.map((c) => options[c]?.extraCantrips ?? 0)),
      );
      const sp = cur.spells;
      if (!sp) fail(`${ctx}: spellcaster with no spell shortlists`);
      if (cantripCount > 0 && !sp?.cantrips) fail(`${ctx}: needs a cantrip shortlist`);
      if (cantripCount === 0 && sp?.cantrips) fail(`${ctx}: has no cantrips but lists some`);
      const alwaysPrepared = (sp?.alwaysPrepared ?? []).map((a) => {
        if (!imp.alwaysPrepared.some((x) => x.spell === a.id))
          fail(`${ctx}: "${a.id}" isn't always prepared in the data`);
        if (!importedSpells.has(a.id)) fail(`${ctx}: always-prepared "${a.id}" not imported`);
        usedSpells.add(a.id);
        const out: AlwaysPreparedSpell = { id: a.id, note: a.note };
        const fc = uses(a.freeCasts, imp, `${ctx} ${a.id}`);
        if (fc) out.freeCasts = fc;
        return out;
      });
      for (const x of imp.alwaysPrepared) {
        if (!alwaysPrepared.some((a) => a.id === x.spell))
          fail(`${ctx}: always-prepared "${x.spell}" not curated`);
      }
      let spellbookSize: number | undefined;
      if (sp?.spellbookSize !== undefined) {
        const text = imp.features.map((f) => f.text.join(" ")).join(" ");
        const start =
          NUMBER_WORDS[text.match(/It starts with (\w+) level 1 Wizard spells/)?.[1] ?? ""];
        const add = NUMBER_WORDS[text.match(/after 1, add (\w+) Wizard spells/)?.[1] ?? ""];
        if (start === undefined || add === undefined || start + add !== sp.spellbookSize) {
          fail(`${ctx}: spellbookSize ${sp.spellbookSize} doesn't match the Spellbook text`);
        }
        spellbookSize = sp.spellbookSize;
      }
      spellcasting = {
        ability: imp.spellcastingAbility,
        kind: pact ? "pact" : "prepared",
        cantripCount,
        preparedCount,
        slots,
        ...(pactSlotLevel !== undefined && { pactSlotLevel }),
        cantrips: spellList(sp?.cantrips ?? [], `${ctx} cantrips`, {
          level: 0,
          list: id,
          min: cantripCount === 0 ? 0 : cantripCount + extra,
        }),
        level1: spellList(sp?.level1 ?? [], `${ctx} level 1`, {
          level: 1,
          list: id,
          min: Math.max(preparedCount, spellbookSize ?? 0),
        }),
        alwaysPrepared,
        ...(spellbookSize !== undefined && { spellbookSize }),
      };
    } else if (cur.spells) fail(`${ctx}: not a spellcaster but lists spells`);

    const weaponText = imp.weapons.join("; ").toLowerCase();
    let martial: WeaponProficiency = "none";
    if (new Set(imp.weapons.map((w) => w.toLowerCase())).has("martial")) martial = "all";
    else if (weaponText.includes("finesse or light")) martial = "finesse-or-light";
    else if (weaponText.includes("light property")) martial = "light";
    const armor = new Set(imp.armor.map((a) => a.toLowerCase()));

    for (const from of Object.keys(cur.equipmentSwaps ?? {})) {
      if (!imp.equipmentA.some((e) => e.item === from))
        fail(`${ctx}: swap of "${from}" not in the package`);
    }
    const eq = equipment(imp.equipmentA, cur.equipmentChoices, ctx, cur.equipmentSwaps);
    const languages = cur.languages ?? { fixed: [], extra: 0 };
    for (const l of languages.fixed) if (!languageNames[l]) fail(`${ctx}: unknown language "${l}"`);

    for (const f of cur.humanFeat)
      if (!curation.feats[f] || f === "magic-initiate") fail(`${ctx}: bad human feat "${f}"`);
    // The species sub-choice the builder gives: one the species offers, for each species with any.
    for (const sid of SPECIES_IDS) {
      const offered = data.species.find((s) => s.id === sid)?.options.map((o) => o.id) ?? [];
      const pick = cur.speciesOptions[sid];
      const want = offered.length > 0 ? `one of ${offered.join(", ")}` : "none (no sub-choices)";
      if (offered.length > 0 ? !pick || !offered.includes(pick) : pick !== undefined)
        fail(`${ctx}: speciesOptions.${sid} is ${pick ? `"${pick}"` : "missing"}, want ${want}`);
    }
    if (!imp.primaryAbility.some((p) => p[cur.primary]))
      fail(`${ctx}: ${cur.primary} isn't a primary ability in the data`);
    if (new Set(cur.abilityPriority).size !== 6 || cur.abilityPriority[0] !== cur.primary) {
      fail(`${ctx}: abilityPriority must list all six abilities, primary first`);
    }

    classes[id] = {
      id,
      name: imp.name,
      archetype: cur.archetype,
      blurb: cur.blurb,
      primary: cur.primary,
      abilityPriority: cur.abilityPriority,
      hitDie: imp.hitDie,
      saves: imp.saves,
      armor: {
        light: armor.has("light"),
        medium: armor.has("medium"),
        heavy: armor.has("heavy"),
        shield: armor.has("shield"),
      },
      weapons: { simple: weaponText.includes("simple"), martial },
      armorText: imp.armor,
      weaponText: imp.weapons,
      skillCount,
      skillPreference: cur.skillPreference,
      expertise: { count: expertiseCount, preference: expertisePreference },
      masteries: { count: masteryCount, weapons: masteryWeapons },
      tools: cur.tools,
      equipment: eq.lines,
      gold: eq.gold,
      features,
      optionGroups,
      ...(spellcasting && { spellcasting }),
      backgrounds: backgroundsFor(cur.primary),
      speciesOptions: cur.speciesOptions,
      humanFeat: cur.humanFeat,
      languages,
      table: imp.table,
    };
  }
  for (const c of curation.classes)
    if (!(CLASS_IDS as readonly string[]).includes(c.id)) fail(`unknown class "${c.id}"`);

  // ---- species ----------------------------------------------------------------------------

  const species = {} as Record<SpeciesId, SpeciesContent>;
  for (const id of SPECIES_IDS) {
    const cur = curation.species.find((s) => s.id === id);
    const imp = data.species.find((s) => s.id === id);
    const ctx = `species ${id}`;
    if (!cur || !imp) {
      fail(`${ctx}: missing from ${cur ? "the import" : "content/species.ts"}`);
      continue;
    }
    for (const t of imp.traits)
      if (!(t.id in cur.traits)) fail(`${ctx}: trait "${t.id}" has no summary`);
    for (const k of Object.keys(cur.traits))
      if (!imp.traits.some((t) => t.id === k)) fail(`${ctx}: curated trait "${k}" not imported`);
    const traits = imp.traits.flatMap((t) => {
      const c = cur.traits[t.id];
      if (!c || c.hidden !== undefined) return [];
      const u = uses(c.uses, undefined, `${ctx} ${t.id}`);
      return [
        {
          id: t.id,
          name: t.name,
          summary: c.summary,
          rulesText: t.text,
          activation: activation(c.activation, `${ctx} ${t.id}`),
          ...(u && { uses: u }),
        },
      ];
    });
    let option: SpeciesContent["option"];
    if (imp.options.length > 0) {
      const choices = imp.options.map((o) => {
        const c = cur.option?.choices[o.id];
        if (!c) fail(`${ctx}: option "${o.id}" has no summary`);
        for (const s of o.cantrips) {
          if (importedSpells.get(s)?.level !== 0)
            fail(`${ctx} ${o.id}: cantrip "${s}" not imported`);
          usedSpells.add(s);
        }
        const innate = (o.innateSpells ?? []).map((x) => {
          usedSpells.add(x.spell);
          const n = x.uses === "pb" ? "pb" : Number(x.uses);
          const u: Uses = { count: n, per: "long" };
          return { id: x.spell, uses: u };
        });
        return {
          id: o.id,
          name: o.name,
          summary: c?.summary ?? "",
          rulesText: o.text,
          activation: c ? activation(c.activation, `${ctx} ${o.id}`) : ("passive" as const),
          replacesTrait: o.replacesTrait,
          ...(o.speed !== undefined && { speed: o.speed }),
          ...(o.darkvision !== undefined && { darkvision: o.darkvision }),
          ...(o.resist && { resist: o.resist }),
          cantrips: o.cantrips,
          innateSpells: innate,
        };
      });
      for (const k of Object.keys(cur.option?.choices ?? {})) {
        if (!imp.options.some((o) => o.id === k))
          fail(`${ctx}: curated option "${k}" not imported`);
      }
      const label = imp.options[0]?.replacesTrait ?? "";
      option = { label, inName: cur.option?.inName !== false, choices };
    } else if (cur.option) fail(`${ctx}: curated option but the species has none`);
    for (const s of imp.cantrips) usedSpells.add(s);
    if (Array.isArray(cur.skillChoice)) checkSkills(cur.skillChoice, ctx);
    for (const l of cur.languages)
      if (!standardLanguages.has(l)) fail(`${ctx}: "${l}" isn't a standard language`);
    const sizeCode = cur.size === "Medium" ? "M" : cur.size === "Small" ? "S" : "";
    if (!imp.size.includes(sizeCode)) fail(`${ctx}: size ${cur.size} not allowed`);
    const toughness = imp.traits.find((t) => t.id === "dwarven-toughness")?.text.join(" ");
    const hpPerLevel = Number(toughness?.match(/maximum increases by (\d+)/)?.[1] ?? 0);
    species[id] = {
      id,
      name: imp.name,
      blurb: cur.blurb,
      size: cur.size,
      speed: imp.speed,
      ...(imp.darkvision !== undefined && { darkvision: imp.darkvision }),
      resist: imp.resist,
      traits,
      ...(option && { option }),
      cantrips: imp.cantrips,
      ...(imp.spellAbility && { spellAbility: imp.spellAbility }),
      ...(cur.skillChoice && { skillChoice: cur.skillChoice }),
      hpPerLevel,
      languages: cur.languages,
      originFeat: imp.traits.some((t) => t.id === "versatile"),
    };
  }

  // ---- feats and backgrounds ----------------------------------------------------------------

  const feats: Record<string, FeatContent> = {};
  for (const [id, cur] of Object.entries(curation.feats)) {
    const imp = featById.get(id);
    const ctx = `feat ${id}`;
    if (!imp || imp.category !== "O") {
      fail(`${ctx}: not an imported origin feat`);
      continue;
    }
    if (cur.tools) checkItems(cur.tools, ["tool", "instrument"], ctx);
    const skillsGranted =
      NUMBER_WORDS[imp.text.join(" ").match(/any combination of (\w+) skills/i)?.[1] ?? ""];
    const u = uses(cur.uses, undefined, ctx);
    feats[id] = {
      id,
      name: imp.name,
      summary: cur.summary,
      rulesText: imp.text,
      activation: activation(cur.activation, ctx),
      category: imp.category,
      repeatable: imp.repeatable,
      ...(u && { uses: u }),
      ...(skillsGranted && { skills: skillsGranted }),
      ...(cur.tools && { tools: cur.tools }),
    };
  }

  const backgrounds = {} as Record<BackgroundId, BackgroundContent>;
  for (const id of BACKGROUND_IDS) {
    const cur = curation.backgrounds.find((b) => b.id === id);
    const imp = data.backgrounds.find((b) => b.id === id);
    const ctx = `background ${id}`;
    if (!cur || !imp) {
      fail(`${ctx}: missing from ${cur ? "the import" : "content/backgrounds.ts"}`);
      continue;
    }
    if (!feats[imp.feat]) fail(`${ctx}: feat "${imp.feat}" has no summary in content/feats.ts`);
    checkSkills(imp.skills, ctx);
    const tools = imp.tools.map((t) => (t.startsWith("any") ? (cur.toolChoices?.[t] ?? "") : t));
    for (const [i, t] of tools.entries())
      if (!t) fail(`${ctx}: no fill for tool "${imp.tools[i]}"`);
    checkItems(tools.filter(Boolean), ["tool", "instrument", "gaming"], ctx);
    const eq = equipment(imp.equipmentA, cur.equipmentChoices, ctx);
    let initiate: BackgroundContent["initiate"];
    if (imp.feat === "magic-initiate") {
      const list = imp.featList as ClassId | undefined;
      const text = featById.get("magic-initiate")?.text.join(" ") ?? "";
      const cantripCount = NUMBER_WORDS[text.match(/You learn (\w+) cantrips/)?.[1] ?? ""] ?? 0;
      const spellCount = /Choose a level 1 spell/.test(text) ? 1 : 0;
      if (!list || !cur.initiate)
        fail(`${ctx}: Magic Initiate needs a list and curated shortlists`);
      initiate = {
        list: list ?? "wizard",
        cantripCount,
        spellCount,
        cantrips: spellList(cur.initiate?.cantrips ?? [], `${ctx} initiate cantrips`, {
          level: 0,
          ...(list && { list }),
          min: cantripCount,
        }),
        spells: spellList(cur.initiate?.spells ?? [], `${ctx} initiate spells`, {
          level: 1,
          ...(list && { list }),
          min: spellCount,
        }),
      };
    } else if (cur.initiate) fail(`${ctx}: initiate shortlists without Magic Initiate`);
    backgrounds[id] = {
      id,
      name: imp.name,
      story: cur.story,
      abilities: imp.abilities,
      feat: imp.feat,
      skills: imp.skills,
      tools,
      equipment: eq.lines,
      gold: eq.gold,
      ...(initiate && { initiate }),
    };
  }

  // ---- spells, items, the rest ----------------------------------------------------------------

  const summaries: Record<string, CuratedSpell> = { ...curation.cantrips, ...curation.level1 };
  const spells: Record<string, SpellContent> = {};
  for (const id of [...usedSpells].sort()) {
    const s = importedSpells.get(id);
    if (!s) {
      fail(`spell "${id}" is not in the imported data`);
      continue;
    }
    const ctx = `spell ${id}`;
    const summary = summaries[id]?.summary;
    if (!summary) fail(`spell "${id}" has no summary in content/spells/`);
    const text = s.text.join(" ");
    const roll = curation.spellRolls[id] ?? {};
    // Damage: a cantrip's scaling dice (character levels 1–4), else the first damage roll the
    // text gives; Eldritch Blast's beams have no scaling field, so it falls back to the text.
    const fromText = text.match(/(\d+d\d+(?: \+ \d+)?) (\w+) damage/);
    const damage =
      (s.level === 0 ? s.cantripDice : undefined) ?? s.damageDice?.[0] ?? fromText?.[1];
    const firstDie = damage?.split(" or ")[0] ?? "";
    const typed = text.match(new RegExp(`${firstDie.replaceAll("+", "\\+")} (\\w+) damage`));
    const damageType = damage ? (typed?.[1] ?? s.damageTypes[0]) : undefined;
    let damageOn: DamageOn | undefined;
    if (damage) {
      if (roll.on) damageOn = roll.on;
      else if (s.spellAttack) damageOn = "attack";
      else if (s.attackRider) damageOn = "weapon-hit";
      else if (s.save?.[0]) damageOn = "save";
      else damageOn = "auto";
    } else if (roll.on) fail(`${ctx}: a curated "on" but the spell deals no damage`);
    if (roll.on && !(DAMAGE_ON as readonly string[]).includes(roll.on))
      fail(`${ctx}: unknown "on" value "${roll.on}"`);
    const halfOnSave = damageOn === "save" && /half as much damage/.test(text);
    const healing = s.healDice?.[0];
    const healingAddsModifier =
      healing !== undefined && /plus your spellcasting ability modifier/.test(text);
    const spellActivation = s.activation;
    if (!(ACTIVATIONS as readonly string[]).includes(spellActivation))
      fail(`${ctx}: no activation in the import (re-run the importer)`);
    const out: SpellContent = {
      id,
      name: s.name,
      gist: gist(summaries[id]?.gist, ctx),
      summary: summary ?? "",
      rulesText: s.text,
      activation: spellActivation,
      level: s.level,
      school: s.school,
      time: s.time,
      range: s.range,
      components: s.components,
      duration: s.duration,
      concentration: s.concentration,
      ritual: s.ritual,
      higherLevel: s.higherLevel,
      ...(damage && { damage }),
      ...(damageType && { damageType: damageType.charAt(0).toUpperCase() + damageType.slice(1) }),
      ...(damageOn && { damageOn }),
      ...(halfOnSave && { halfOnSave }),
      ...(healing && { healing }),
      ...(healingAddsModifier && { healingAddsModifier }),
      ...(roll.note && { rollNote: roll.note }),
      ...(s.spellAttack && { spellAttack: s.spellAttack }),
      ...(s.save?.[0] && { save: s.save[0] }),
    };
    for (const problem of unshownRolls(out, [...(s.damageDice ?? []), ...(s.healDice ?? [])]))
      fail(`${ctx}: ${problem}`);
    spells[id] = out;
  }
  for (const id of Object.keys(summaries))
    if (!usedSpells.has(id)) fail(`spell summary "${id}" is never used`);
  for (const id of Object.keys(curation.spellRolls))
    if (!usedSpells.has(id)) fail(`spell roll "${id}" in content/spells/rolls.ts is never used`);

  const masteries: Record<string, Summarized> = {};
  for (const m of data.masteries) {
    const summary = curation.masteries[m.id];
    if (!summary) fail(`mastery "${m.id}" has no summary`);
    masteries[m.id] = { id: m.id, name: m.name, summary: summary ?? "", rulesText: m.text };
  }

  for (const l of LANGUAGE_FILL)
    if (!standardLanguages.has(l)) fail(`LANGUAGE_FILL: "${l}" isn't standard`);
  for (const [kind, ids] of Object.entries(TOOL_FALLBACK)) {
    checkItems(ids, [kind as ItemContent["kind"]], `TOOL_FALLBACK ${kind}`);
  }

  // Worst case: a player can always fill every spell list, even when earlier picks and the
  // species' cantrips already cover part of a later shortlist (repeats are wasted, so
  // pruneAnswers drops them and the UI greys them out).
  const speciesCantripSets = Object.values(species).flatMap((sp) =>
    sp.option ? sp.option.choices.map((o) => [...sp.cantrips, ...o.cantrips]) : [sp.cantrips],
  );
  const speciesOverlap = (ids: string[]): number =>
    Math.max(0, ...speciesCantripSets.map((set) => set.filter((id) => ids.includes(id)).length));
  for (const c of Object.values(classes)) {
    const sc = c.spellcasting;
    const extra = Math.max(
      0,
      ...c.optionGroups.flatMap((g) => g.choices.map((id) => options[id]?.extraCantrips ?? 0)),
    );
    const classCount = (sc?.cantripCount ?? 0) + (sc && sc.cantripCount > 0 ? extra : 0);
    const classCantrips = sc?.cantrips ?? [];
    if (sc && classCantrips.length - speciesOverlap(classCantrips) < classCount) {
      fail(`class ${c.id}: cantrip list can run out once a species cantrip repeats one`);
    }
    // Agonizing and Repelling Blast need a damaging (or attack-roll) class cantrip. The builder
    // always gives the first one no species teaches, so one of those must qualify.
    const sure = classCantrips
      .slice(0, sc?.cantripCount ?? 0)
      .filter((id) => !speciesCantripSets.some((set) => set.includes(id)))
      .flatMap((id) => (spells[id] ? [spells[id]] : []));
    for (const g of c.optionGroups) {
      for (const id of g.choices) {
        const req = options[id]?.requires;
        if (req?.damageCantrip && !sure.some((s) => s.damage && (s.spellAttack || s.save)))
          fail(`class ${c.id}: ${id} needs a damaging cantrip the builder always gives`);
        if (req?.attackCantrip && !sure.some((s) => s.damage && s.spellAttack))
          fail(`class ${c.id}: ${id} needs an attack cantrip the builder always gives`);
      }
    }
    const styles = c.optionGroups.flatMap((g) =>
      g.choices.flatMap((id) => {
        const grant = options[id]?.grantsCantrips;
        return grant ? [grant] : [];
      }),
    );
    for (const g of styles) {
      const left =
        g.cantrips.length -
        overlap(g.cantrips, classCantrips, classCount) -
        speciesOverlap(g.cantrips);
      if (left < g.count)
        fail(`class ${c.id}: ${g.list} style cantrips can run out (${left} left for ${g.count})`);
    }
    for (const b of c.backgrounds) {
      const mi = backgrounds[b]?.initiate;
      if (!mi) continue;
      const styleTaken = Math.max(
        0,
        ...styles.map((g) => overlap(mi.cantrips, g.cantrips, g.count)),
      );
      const left =
        mi.cantrips.length -
        overlap(mi.cantrips, classCantrips, classCount) -
        styleTaken -
        speciesOverlap(mi.cantrips);
      if (left < mi.cantripCount)
        fail(`${c.id} + ${b}: Magic Initiate cantrips can run out (${left} left)`);
      const spellsLeft =
        mi.spells.length - overlap(mi.spells, sc?.level1 ?? [], sc?.preparedCount ?? 0);
      if (spellsLeft < mi.spellCount) fail(`${c.id} + ${b}: Magic Initiate spells can run out`);
    }
  }

  const archetypes = ARCHETYPES.map((a) => ({
    id: a.id,
    label: a.label,
    blurb: a.blurb,
    classes: curation.classes.filter((c) => c.archetype === a.id).map((c) => c.id),
  }));

  if (errors.length > 0) {
    throw new Error(`content has ${errors.length} problem(s):\n  - ${errors.join("\n  - ")}`);
  }

  return {
    source: { repo: data.meta.repo, commit: data.meta.commit },
    archetypes,
    classes,
    species,
    backgrounds,
    feats,
    options,
    spells,
    items: Object.fromEntries(
      data.items.map((i) => {
        const { text: _text, weight: _weight, valueCp: _value, contents: _contents, ...rest } = i;
        return [i.id, rest];
      }),
    ),
    masteries,
    skills: data.skills,
    languages: { names: languageNames, fill: LANGUAGE_FILL },
    toolFallback: TOOL_FALLBACK,
  };
}

const contentSource = defineContentSource({
  name: "content",
  build: () => {
    const content = joinContent(loadImported());
    emitModule(
      OUT_DIR,
      "content.ts",
      `import type { BuilderContent } from "../domain/contentTypes";\n\n` +
        `export const CONTENT: BuilderContent = ${JSON.stringify(content, null, 1)};\n`,
    );
    return `${Object.keys(content.classes).length} classes, ${Object.keys(content.species).length} species, ${Object.keys(content.spells).length} spells (5etools ${content.source.commit.slice(0, 8)})`;
  },
});

async function main(): Promise<void> {
  const summaries = await buildContent(OUT_DIR, [contentSource, iconSource(OUT_DIR)]);
  console.log(`[build-content] ${summaries.join(", ")}`);
}

// Only run when invoked directly (the build and typecheck scripts, contentWatchPlugin, the
// vitest global setup); importing this module from a test must not regenerate content.
if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error("[build-content] failed:", err);
    process.exit(1);
  });
}
