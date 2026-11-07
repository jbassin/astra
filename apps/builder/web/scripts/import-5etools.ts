// Imports the XPHB (D&D 2024 Player's Handbook) content the builder uses from a checkout of
// the 5etools data (https://github.com/5etools-mirror-3/5etools-src, its `data/` dir) and
// writes trimmed, plain-text JSON to content/5etools/. Run it by hand when re-pinning:
//
//   just builder-import <path-to-5etools-data> <commit-sha>
//
// The 5etools checkout is untrusted data: this script only reads JSON files from it. It never
// runs git there (a repo's config can run commands), which is why the commit comes as an
// argument. The output is committed; scripts/build-content.ts joins it with the curation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type Ability,
  IMPORT_FILES,
  type ImportedBackground,
  type ImportedClass,
  type ImportedData,
  type ImportedEquipment,
  type ImportedFeat,
  type ImportedFeature,
  type ImportedItem,
  type ImportedMastery,
  type ImportedOptionalFeature,
  type ImportedSkill,
  type ImportedSpecies,
  type ImportedSpeciesOption,
  type ImportedSpell,
  type WeaponProperty,
} from "../src/domain/imported";
import { cellText, flattenEntries, slugify, stripTags } from "../src/domain/markup";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../content/5etools");
const REPO = "https://github.com/5etools-mirror-3/5etools-src";
const SOURCE = "XPHB";

const CLASS_FILES = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];

// 5etools JSON is loosely typed; the importer reads it through this alias and checks shapes
// as it goes, failing loudly on anything unexpected.
// oxlint-disable-next-line no-explicit-any -- 5etools data is untyped JSON, checked as it is read
type Json = any;

function readJson(dataDir: string, rel: string): Json {
  const file = path.join(dataDir, rel);
  if (!fs.existsSync(file)) throw new Error(`missing 5etools file: ${rel}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isXphb(x: Json): boolean {
  return typeof x?.source === "string" && x.source.toUpperCase() === SOURCE;
}

/** "chain mail|xphb" → "chain-mail" (and checks the source is XPHB). */
function refId(ref: string): string {
  const [name, source] = ref.split("|");
  if (source && source.split("#")[0]?.toUpperCase() !== SOURCE) {
    throw new Error(`reference outside XPHB: ${ref}`);
  }
  return slugify(name ?? ref);
}

const ABILITY_KEYS: readonly Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
function asAbility(x: unknown): Ability {
  if (typeof x === "string" && (ABILITY_KEYS as readonly string[]).includes(x)) return x as Ability;
  throw new Error(`not an ability: ${String(x)}`);
}

// ---- classes -------------------------------------------------------------------------------

function equipmentList(raw: Json[]): ImportedEquipment[] {
  return raw.map((e: Json): ImportedEquipment => {
    if (typeof e === "string") return { item: refId(e), quantity: 1 };
    if (e.item) {
      return {
        item: refId(e.item),
        quantity: e.quantity ?? 1,
        ...(e.displayName && { displayName: stripTags(e.displayName) }),
      };
    }
    if (e.equipmentType) return { choice: e.equipmentType, quantity: e.quantity ?? 1 };
    if (e.equipmentTypes) return { choice: e.equipmentTypes.join("|"), quantity: 1 };
    if (e.special) return { special: stripTags(e.special), quantity: e.quantity ?? 1 };
    if (typeof e.value === "number") return { valueCp: e.value };
    throw new Error(`unknown equipment entry: ${JSON.stringify(e)}`);
  });
}

function masteriesAt(progression: Record<string, number> | undefined, level: number): number {
  let n = 0;
  for (const [k, v] of Object.entries(progression ?? {})) if (Number(k) <= level) n = v;
  return n;
}

function importClass(dataDir: string, file: string): ImportedClass {
  const data = readJson(dataDir, `class/class-${file}.json`);
  const cls = data.class.find(isXphb);
  if (!cls) throw new Error(`no XPHB class in class-${file}.json`);
  const id = slugify(cls.name);

  const table: Record<string, [string, string]> = {};
  let spellSlots: [number[], number[]] | undefined;
  for (const group of cls.classTableGroups ?? []) {
    const rows: Json[][] = group.rows ?? group.rowsSpellProgression;
    if (group.rowsSpellProgression) {
      spellSlots = [rows[0] as number[], rows[1] as number[]];
      continue;
    }
    group.colLabels.forEach((label: Json, i: Json) => {
      table[stripTags(label)] = [cellText(rows[0]?.[i]), cellText(rows[1]?.[i])];
    });
  }

  const sp = cls.startingProficiencies ?? {};
  const skills = sp.skills?.[0];
  const skillChoice = skills?.choose
    ? { from: skills.choose.from.map(slugify), count: skills.choose.count as number }
    : { any: (skills?.any as number) ?? 0 };

  const featureRefs = new Set<string>();
  for (const f of cls.classFeatures) {
    const ref: string = typeof f === "string" ? f : f.classFeature;
    featureRefs.add(ref);
  }
  const features: ImportedFeature[] = data.classFeature
    .filter(
      (f: Json) =>
        isXphb(f) && f.className === cls.name && f.classSource === cls.source && f.level <= 2,
    )
    .map((f: Json) => ({
      id: `${id}-${slugify(f.name)}`,
      name: f.name,
      level: f.level,
      text: flattenEntries(f.entries),
    }));

  const prepared = (cls.additionalSpells?.[0]?.prepared ?? {}) as Record<string, string[]>;
  const alwaysPrepared = Object.entries(prepared)
    .filter(([lvl]) => Number(lvl) <= 2)
    .flatMap(([lvl, spells]) => spells.map((s) => ({ level: Number(lvl), spell: refId(s) })));

  return {
    id,
    name: cls.name,
    hitDie: cls.hd.faces,
    saves: cls.proficiency.map(asAbility),
    primaryAbility: cls.primaryAbility,
    skillChoice,
    weapons: ((sp.weapons ?? []) as string[]).map(stripTags),
    armor: ((sp.armor ?? []) as string[]).map(stripTags),
    tools: ((sp.tools ?? []) as string[]).map(stripTags),
    equipmentA: equipmentList(cls.startingEquipment.defaultData[0].A),
    equipmentText: stripTags(cls.startingEquipment.entries[0]),
    table,
    ...(spellSlots && { spellSlots }),
    ...(cls.spellcastingAbility && { spellcastingAbility: asAbility(cls.spellcastingAbility) }),
    ...(cls.casterProgression && { casterProgression: cls.casterProgression }),
    featProgression: (cls.featProgression ?? []).flatMap((fp: Json) =>
      Object.entries(fp.progression as Record<string, number>)
        .filter(([lvl]) => Number(lvl) <= 2)
        .map(([lvl, count]) => ({
          name: fp.name,
          categories: fp.category,
          level: Number(lvl),
          count,
        })),
    ),
    optionalFeatureProgression: (cls.optionalfeatureProgression ?? []).map((op: Json) => {
      const prog = op.progression;
      const at = (lvl: number): number => {
        if (Array.isArray(prog)) return prog[lvl - 1] ?? 0;
        let n = 0;
        for (const [k, v] of Object.entries(prog as Record<string, number>))
          if (Number(k) <= lvl) n = v;
        return n;
      };
      return { name: op.name, featureTypes: op.featureType, counts: [at(1), at(2)] };
    }),
    masteries: [
      masteriesAt(cls.itemMasteriesProgression, 1),
      masteriesAt(cls.itemMasteriesProgression, 2),
    ],
    alwaysPrepared,
    features,
  };
}

// ---- species -------------------------------------------------------------------------------

function namedEntries(entries: Json[]): Map<string, Json> {
  const m = new Map<string, Json>();
  for (const e of entries)
    if (e && typeof e === "object" && typeof e.name === "string") m.set(e.name, e);
  return m;
}

function darkvisionFrom(text: string[] | undefined): number | undefined {
  const m = text?.join(" ").match(/Darkvision with a range of (\d+) feet/);
  return m ? Number(m[1]) : undefined;
}

function spellRefsIn(raw: Json): string[] {
  const out: string[] = [];
  const re = /\{@spell ([^|}]+)(?:\|[^}]*)?\}/g;
  for (const m of JSON.stringify(raw).matchAll(re)) out.push(slugify(m[1] ?? ""));
  return out;
}

function knownCantrips(additional: Json, cantripIds: Set<string>, fallbackText: Json): string[] {
  const known = additional?.known?.["1"];
  const fromKnown = Array.isArray(known)
    ? known.filter((s) => typeof s === "string").map((s) => refId(s.replace(/#c$/, "")))
    : [];
  if (fromKnown.length > 0) return fromKnown;
  // A "choose" entry (High Elf): the text names the default cantrip.
  return spellRefsIn(fallbackText).filter((s) => cantripIds.has(s));
}

function innateSpells(additional: Json): Array<{ spell: string; uses: string }> {
  const out: Array<{ spell: string; uses: string }> = [];
  for (const [lvl, v] of Object.entries((additional?.innate ?? {}) as Record<string, Json>)) {
    if (Number(lvl) > 2) continue;
    for (const [uses, spells] of Object.entries((v.daily ?? {}) as Record<string, string[]>)) {
      for (const s of spells) out.push({ spell: refId(s), uses });
    }
  }
  return out;
}

function importSpecies(dataDir: string, cantripIds: Set<string>): ImportedSpecies[] {
  const data = readJson(dataDir, "races.json");
  return data.race.filter(isXphb).map((race: Json): ImportedSpecies => {
    const baseTraits = race.entries.filter((e: Json) => e?.name);
    const traits = baseTraits.map((e: Json) => ({
      id: slugify(e.name),
      name: e.name,
      text: flattenEntries(e.entries),
    }));
    const options: ImportedSpeciesOption[] = [];
    for (const v of race._versions ?? []) {
      if (v._abstract) {
        // A templated version (Dragonborn): one option per implementation.
        const mods = v._abstract._mod.entries;
        const removed = mods.find((m: Json) => m.mode === "removeArr")?.names as string;
        for (const impl of v._implementations) {
          const vars = impl._variables as Record<string, string>;
          const fill = (s: string): string =>
            s.replaceAll(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
          const text = mods
            .filter((m: Json) => m.mode === "replaceArr")
            .flatMap((m: Json) => flattenEntries([m.items]).map(fill));
          const option: ImportedSpeciesOption = {
            id: slugify(vars.color ?? ""),
            name: vars.color ?? "",
            replacesTrait: removed,
            text,
            cantrips: [],
            vars,
          };
          if (impl.resist) option.resist = impl.resist;
          options.push(option);
        }
        continue;
      }
      const name =
        String(v.name)
          .split("; ")[1]
          ?.replace(/ (Lineage|Legacy|Ancestry)$/, "") ?? v.name;
      const mods = Array.isArray(v._mod.entries) ? v._mod.entries : [v._mod.entries];
      const replaced = mods.filter((m: Json) => m.mode === "replaceArr");
      const trait = replaced.find((m: Json) => m.replace !== "Darkvision") ?? replaced[0];
      const dvMod = replaced.find((m: Json) => m.replace === "Darkvision");
      const additional = v.additionalSpells?.[0];
      const innate = innateSpells(additional);
      const option: ImportedSpeciesOption = {
        id: slugify(name),
        name,
        replacesTrait: trait.replace,
        text: flattenEntries(trait.items.entries),
        cantrips: knownCantrips(additional, cantripIds, trait.items.entries),
      };
      if (v.speed) option.speed = typeof v.speed === "number" ? v.speed : v.speed.walk;
      if (dvMod) option.darkvision = darkvisionFrom(flattenEntries(dvMod.items.entries));
      if (v.resist) option.resist = v.resist;
      if (innate.length > 0) option.innateSpells = innate;
      options.push(option);
    }
    const baseAdditional = race.additionalSpells;
    const sharedCantrips =
      Array.isArray(baseAdditional) && baseAdditional.length === 1 && !baseAdditional[0].name
        ? knownCantrips(baseAdditional[0], cantripIds, [])
        : [];
    const dv = darkvisionFrom(
      namedEntries(baseTraits).has("Darkvision")
        ? flattenEntries(namedEntries(baseTraits).get("Darkvision").entries)
        : undefined,
    );
    const species: ImportedSpecies = {
      id: slugify(race.name),
      name: race.name,
      size: race.size,
      speed: typeof race.speed === "number" ? race.speed : race.speed.walk,
      resist: (race.resist ?? []).filter((r: Json) => typeof r === "string"),
      traits,
      options,
      cantrips: sharedCantrips,
    };
    if (dv) species.darkvision = dv;
    if (typeof baseAdditional?.[0]?.ability === "string") {
      species.spellAbility = asAbility(baseAdditional[0].ability);
    }
    return species;
  });
}

// ---- backgrounds, feats, optional features --------------------------------------------------

function importBackgrounds(dataDir: string): ImportedBackground[] {
  const data = readJson(dataDir, "backgrounds.json");
  return data.background.filter(isXphb).map((bg: Json): ImportedBackground => {
    const featKey = Object.keys(bg.feats[0])[0] ?? "";
    const [featName, list] = featKey.split("|")[0]?.split("; ") ?? [];
    const tools = Object.entries(bg.toolProficiencies[0] as Record<string, Json>).map(([k]) =>
      k.startsWith("any") ? k : slugify(k),
    );
    const background: ImportedBackground = {
      id: slugify(bg.name),
      name: bg.name,
      abilities: bg.ability[0].choose.weighted.from.map(asAbility),
      feat: slugify(featName ?? ""),
      skills: Object.keys(bg.skillProficiencies[0]).map(slugify),
      tools,
      equipmentA: equipmentList(bg.startingEquipment[0].A),
    };
    if (list) background.featList = list;
    return background;
  });
}

const FEAT_CATEGORIES = new Set(["O", "FS", "FS:P", "FS:R"]);

function importFeats(dataDir: string): ImportedFeat[] {
  const data = readJson(dataDir, "feats.json");
  return data.feat
    .filter((f: Json) => isXphb(f) && FEAT_CATEGORIES.has(f.category))
    .map((f: Json) => ({
      id: slugify(f.name),
      name: f.name,
      category: f.category,
      repeatable: f.repeatable === true,
      text: flattenEntries(f.entries),
    }));
}

function importOptionalFeatures(dataDir: string): ImportedOptionalFeature[] {
  const data = readJson(dataDir, "optionalfeatures.json");
  return data.optionalfeature
    .filter((o: Json) => isXphb(o) && o.featureType.some((t: Json) => t === "EI" || t === "MM"))
    .map((o: Json): ImportedOptionalFeature => {
      const pre = o.prerequisite?.[0];
      const other: string[] = [];
      if (pre?.spell) other.push(...pre.spell.map((s: Json) => String(s.entry ?? s)));
      if (pre?.optionalfeature)
        other.push(...pre.optionalfeature.map((s: Json) => stripTags(s.split("|")[0] ?? s)));
      const option: ImportedOptionalFeature = {
        id: slugify(o.name),
        name: o.name,
        featureType: o.featureType.includes("EI") ? "EI" : "MM",
        text: flattenEntries(o.entries),
      };
      if (pre?.level?.level) option.minLevel = pre.level.level;
      if (other.length > 0) option.prerequisite = other.join("; ");
      if (o.consumes) option.cost = o.consumes.amount ?? 1;
      return option;
    });
}

// ---- spells --------------------------------------------------------------------------------

const SCHOOLS: Record<string, string> = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  V: "Evocation",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
};

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function spellTime(time: Json[]): string {
  return time
    .map((t) => {
      const unit = t.unit === "bonus" ? "bonus action" : t.unit;
      const base = plural(t.number, unit);
      return t.condition ? `${base}, ${stripTags(t.condition)}` : base;
    })
    .join(" or ");
}

/** The casting unit of the first `time` entry; a minute or an hour both read "minute". */
function spellActivation(time: Json[]): ImportedSpell["activation"] {
  const unit = time[0]?.unit;
  if (unit === "action" || unit === "bonus" || unit === "reaction") return unit;
  if (unit === "minute" || unit === "hour") return "minute";
  throw new Error(`unknown spell casting unit "${String(unit)}"`);
}

/** The rolls in `{@tag roll}` or `{@tag roll|display}` markup anywhere in `raw`, in order,
 * spaced the way the text prints them ("1d4 + 1"). */
function rollsIn(raw: Json, tag: string): string[] {
  const re = new RegExp(String.raw`\{@${tag} ([^|}]+)(?:\|[^}]*)?\}`, "g");
  return [...JSON.stringify(raw).matchAll(re)].map((m) =>
    (m[1] ?? "").replaceAll(/\s*([+-])\s*/g, " $1 ").trim(),
  );
}

function spellRange(r: Json): string {
  const d = r.distance ?? {};
  const dist = d.amount ? `${d.amount} ${d.type === "feet" ? "feet" : d.type}` : "";
  if (r.type === "point") {
    if (d.type === "self") return "Self";
    if (d.type === "touch") return "Touch";
    if (d.type === "sight") return "Sight";
    if (d.type === "unlimited") return "Unlimited";
    return dist;
  }
  if (r.type === "special") return "Special";
  // An area centred on the caster: "Self (15-foot Cone)".
  const shape = String(r.type);
  return `Self (${d.amount}-foot ${shape.charAt(0).toUpperCase()}${shape.slice(1)})`;
}

function spellComponents(c: Json): string {
  const parts: string[] = [];
  if (c.v) parts.push("V");
  if (c.s) parts.push("S");
  if (c.m) parts.push(`M (${stripTags(typeof c.m === "string" ? c.m : c.m.text)})`);
  return parts.join(", ");
}

function spellDuration(duration: Json[]): string {
  return duration
    .map((d) => {
      if (d.type === "instant") return "Instantaneous";
      if (d.type === "permanent") return "Until dispelled";
      if (d.type === "special") return "Special";
      const span = plural(d.duration.amount, d.duration.type);
      return d.concentration ? `Concentration, up to ${span}` : span;
    })
    .join(" or ");
}

function importSpells(dataDir: string): ImportedSpell[] {
  const data = readJson(dataDir, "spells/spells-xphb.json");
  const lookup = readJson(dataDir, "generated/gendata-spell-source-lookup.json").xphb as Record<
    string,
    Json
  >;
  return data.spell
    .filter((s: Json) => isXphb(s) && s.level <= 1)
    .map((s: Json): ImportedSpell => {
      const classes = Object.keys(lookup[s.name.toLowerCase()]?.class?.XPHB ?? {}).map(slugify);
      const attack = s.spellAttack?.[0];
      const spell: ImportedSpell = {
        id: slugify(s.name),
        name: s.name,
        level: s.level,
        school: SCHOOLS[s.school] ?? s.school,
        time: spellTime(s.time),
        range: spellRange(s.range),
        components: spellComponents(s.components),
        duration: spellDuration(s.duration),
        concentration: s.duration.some((d: Json) => d.concentration),
        ritual: s.meta?.ritual === true,
        text: flattenEntries(s.entries),
        higherLevel: flattenEntries(s.entriesHigherLevel ?? []),
        classes,
        damageTypes: s.damageInflict ?? [],
        activation: spellActivation(s.time),
      };
      const damageDice = rollsIn(s.entries, "damage");
      if (damageDice.length > 0) spell.damageDice = damageDice;
      const tags: string[] = s.miscTags ?? [];
      if (tags.includes("HL")) {
        const healDice = rollsIn(s.entries, "dice");
        if (healDice.length > 0) spell.healDice = healDice;
      }
      if (tags.includes("AAD")) spell.attackRider = true;
      if (s.scalingLevelDice) {
        spell.cantripDice = Array.isArray(s.scalingLevelDice)
          ? s.scalingLevelDice.map((x: Json) => x.scaling["1"]).join(" or ")
          : s.scalingLevelDice.scaling["1"];
      }
      if (attack) spell.spellAttack = attack === "M" ? "melee" : "ranged";
      if (s.savingThrow) {
        spell.save = s.savingThrow.map((x: Json) => asAbility(x.slice(0, 3).toLowerCase()));
      }
      return spell;
    });
}

// ---- items ---------------------------------------------------------------------------------

const PROPERTY: Record<string, WeaponProperty> = {
  A: "ammunition",
  F: "finesse",
  H: "heavy",
  L: "light",
  LD: "loading",
  R: "reach",
  T: "thrown",
  "2H": "two-handed",
  V: "versatile",
};
const DAMAGE: Record<string, string> = { S: "Slashing", P: "Piercing", B: "Bludgeoning" };
const ITEM_KIND: Record<string, ImportedItem["kind"]> = {
  M: "weapon",
  R: "weapon",
  LA: "armor",
  MA: "armor",
  HA: "armor",
  S: "shield",
  A: "ammo",
  AT: "tool",
  T: "tool",
  INS: "instrument",
  GS: "gaming",
  SCF: "focus",
};

function toItem(x: Json): ImportedItem {
  const type = String(x.type ?? "G").split("|")[0] ?? "G";
  const kind = ITEM_KIND[type] ?? "gear";
  const item: ImportedItem = {
    id: slugify(x.name),
    name: x.name,
    kind,
    ...(typeof x.weight === "number" && { weight: x.weight }),
    ...(typeof x.value === "number" && { valueCp: x.value }),
    text: flattenEntries(x.entries ?? []),
  };
  if (kind === "weapon") {
    item.weapon = {
      category: x.weaponCategory,
      ranged: type === "R",
      damage: x.dmg1,
      damageType: DAMAGE[x.dmgType] ?? x.dmgType,
      ...(x.dmg2 && { versatile: x.dmg2 }),
      ...(x.range && { range: x.range }),
      properties: ((x.property ?? []) as string[])
        .map((p) => PROPERTY[(typeof p === "string" ? p : (p as Json).uid).split("|")[0] ?? ""])
        .filter((p): p is WeaponProperty => p !== undefined),
      ...(x.mastery && { mastery: slugify(String(x.mastery[0]).split("|")[0] ?? "") }),
    };
  }
  if (kind === "armor") {
    item.armor = {
      type: type === "LA" ? "light" : type === "MA" ? "medium" : "heavy",
      ac: x.ac,
      ...(x.strength && { strength: Number(x.strength) }),
      stealthDisadvantage: x.stealth === true,
    };
  }
  if (kind === "shield") item.shieldAc = x.ac;
  if (x.packContents) {
    item.contents = x.packContents.map((c: Json) =>
      typeof c === "string"
        ? { item: refId(c), quantity: 1 }
        : { item: refId(c.item), quantity: c.quantity ?? 1 },
    );
  }
  return item;
}

function importItems(dataDir: string, wanted: Set<string>): ImportedItem[] {
  const base = readJson(dataDir, "items-base.json");
  const items = readJson(dataDir, "items.json");
  const all = new Map<string, Json>();
  for (const x of [...base.baseitem, ...items.item, ...items.itemGroup]) {
    if (isXphb(x) && !all.has(slugify(x.name))) all.set(slugify(x.name), x);
  }
  // Every XPHB weapon, armor, shield, tool, instrument and gaming set, plus whatever the
  // equipment packages name (and the contents of any pack among them).
  const keep = new Set<string>(wanted);
  for (const [id, x] of all) {
    const type = String(x.type ?? "").split("|")[0] ?? "";
    if (["M", "R", "LA", "MA", "HA", "S", "AT", "T", "INS", "GS"].includes(type) && !x.age)
      keep.add(id);
  }
  const out = new Map<string, ImportedItem>();
  const queue = [...keep];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (out.has(id)) continue;
    const x = all.get(id);
    if (!x) throw new Error(`item not found in XPHB data: ${id}`);
    const item = toItem(x);
    out.set(id, item);
    for (const c of item.contents ?? []) queue.push(c.item);
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function importMasteries(dataDir: string): ImportedMastery[] {
  const base = readJson(dataDir, "items-base.json");
  return base.itemMastery
    .filter(isXphb)
    .map((m: Json) => ({ id: slugify(m.name), name: m.name, text: flattenEntries(m.entries) }));
}

function importSkills(dataDir: string): ImportedSkill[] {
  const data = readJson(dataDir, "skills.json");
  return data.skill
    .filter(isXphb)
    .map((s: Json) => ({ id: slugify(s.name), name: s.name, ability: asAbility(s.ability) }));
}

function importLanguages(dataDir: string): ImportedData["languages"] {
  const data = readJson(dataDir, "languages.json");
  return data.language.filter(isXphb).map((l: Json) => ({
    id: slugify(l.name),
    name: l.name,
    type: l.type === "standard" ? "standard" : "rare",
  }));
}

// ---- main ----------------------------------------------------------------------------------

export function importAll(dataDir: string, commit: string): ImportedData {
  const spells = importSpells(dataDir);
  const cantripIds = new Set(spells.filter((s) => s.level === 0).map((s) => s.id));
  const classes = CLASS_FILES.map((f) => importClass(dataDir, f));
  const backgrounds = importBackgrounds(dataDir);
  const wanted = new Set<string>();
  for (const e of [
    ...classes.flatMap((c) => c.equipmentA),
    ...backgrounds.flatMap((b) => b.equipmentA),
  ]) {
    if (e.item) wanted.add(e.item);
  }
  for (const b of backgrounds) for (const t of b.tools) if (!t.startsWith("any")) wanted.add(t);
  return {
    meta: { repo: REPO, commit, source: SOURCE },
    classes,
    species: importSpecies(dataDir, cantripIds),
    backgrounds,
    feats: importFeats(dataDir),
    optionalFeatures: importOptionalFeatures(dataDir),
    spells,
    items: importItems(dataDir, wanted),
    masteries: importMasteries(dataDir),
    skills: importSkills(dataDir),
    languages: importLanguages(dataDir),
  };
}

function main(): void {
  const [dataDir, commit] = process.argv.slice(2);
  if (!dataDir || !commit || !/^[0-9a-f]{40}$/.test(commit)) {
    console.error("usage: import-5etools.ts <5etools data dir> <40-char commit sha>");
    process.exit(2);
  }
  const data = importAll(path.resolve(dataDir), commit);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, file] of Object.entries(IMPORT_FILES) as Array<[keyof ImportedData, string]>) {
    fs.writeFileSync(path.join(OUT_DIR, file), `${JSON.stringify(data[key], null, 1)}\n`);
  }
  console.log(
    `[import-5etools] ${data.classes.length} classes, ${data.species.length} species, ` +
      `${data.backgrounds.length} backgrounds, ${data.feats.length} feats, ` +
      `${data.optionalFeatures.length} options, ${data.spells.length} spells, ${data.items.length} items`,
  );
}

if (import.meta.main) main();
