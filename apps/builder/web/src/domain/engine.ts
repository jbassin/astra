// The rules engine: answers in, a fully derived level 2 character out. Pure and client-safe,
// so the player page and the printable sheet can call it on every change. A partial character
// still builds: whatever can't be worked out yet is left at a neutral value and named in
// `missing`.
//
// What the builder decides for the player (they never see the math):
// - ability scores: the standard array 15, 14, 13, 12, 10, 8 in the class's priority order,
//   then the background's boosts (+2 to the class's primary and +1 to the best other listed
//   ability when the background lists the primary; otherwise +1 to each listed ability);
// - skills: the background's two, then the class's best ones not already known, then any
//   species or feat skill the same way; expertise from the class's preference list;
// - weapon masteries, tools, languages and the human origin feat from the curation;
// - level 2 Hit Points: the hit die's maximum at level 1 and its fixed average (half + 1) at
//   level 2, each plus the Constitution modifier, plus species and feat bonuses;
// - every spell, from the curated lists in order (`spellPicks` in content.ts).

import type { Answers } from "./character";
import {
  backgroundOf,
  chosenOptions,
  CONTENT,
  classOf,
  speciesOf,
  speciesOptionOf,
  spellPicks,
} from "./content";
import type {
  Ability,
  Activation,
  ClassContent,
  DamageOn,
  EquipmentLine,
  ItemContent,
  OptionContent,
  SpellContent,
  Uses,
} from "./contentTypes";
import { ABILITIES } from "./imported";
import { stepStatuses } from "./steps";

const LEVEL = 2;
const PROFICIENCY_BONUS = 2;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

// ---- the character --------------------------------------------------------------------------

export interface AbilityScore {
  /** "Strength", "Dexterity", … */
  name: string;
  score: number;
  modifier: number;
  /** Where the score came from ("13 from the standard array, +2 from Soldier"). */
  breakdown: string;
  save: number;
  saveProficient: boolean;
}

export interface SkillLine {
  id: string;
  name: string;
  ability: Ability;
  bonus: number;
  proficient: boolean;
  expertise: boolean;
  /** Extra bonuses in plain words ("+1 Jack of All Trades"). */
  notes: string[];
}

export interface AttackLine {
  name: string;
  kind: "weapon" | "unarmed" | "cantrip";
  /** The attack roll bonus; absent for a cantrip that forces a save instead. */
  toHit?: number;
  save?: { ability: Ability; dc: number };
  /** Damage dice plus modifier, e.g. "1d8 + 3". */
  damage: string;
  damageType: string;
  range: string;
  properties: string[];
  mastery?: { name: string; summary: string };
  notes: string[];
}

export interface SpellEntry {
  id: string;
  name: string;
  level: number;
  summary: string;
  time: string;
  range: string;
  duration: string;
  components: string;
  concentration: boolean;
  ritual: boolean;
  /** Why the character has it, when it isn't an ordinary pick ("Always prepared (Druidic)"). */
  note?: string;
  /** Casts without a spell slot, in plain words ("2 per Long Rest"). */
  freeCasts?: string;
  /** When it is cast (from the spell's casting time). */
  activation: Activation;
  attack?: {
    toHit?: number;
    save?: { ability: Ability; dc: number };
    damage?: string;
    damageType?: string;
    /** How the damage lands (set whenever `damage` is). */
    damageOn?: DamageOn;
    /** A successful save halves the damage. */
    halfOnSave?: boolean;
  };
  /** Hit Points it restores, modifier included ("2d8 + 3"). */
  healing?: string;
  /** Plain words for the rolls beyond the first ("1d8 more if the target is a Fiend…"). */
  rollNote?: string;
}

export interface SpellcastingBlock {
  source: "class" | "fighting-style" | "species" | "feat";
  label: string;
  ability: Ability;
  saveDc: number;
  attackBonus: number;
  /** Spell slots per level (index 0 = level 1); class block only. */
  slots?: number[];
  /** Warlock Pact Magic: every slot is this level and returns on a Short Rest. */
  pactSlotLevel?: number;
  cantrips: SpellEntry[];
  spells: SpellEntry[];
  /** Wizard: every level 1 spell in the spellbook (the prepared ones included). */
  spellbook?: SpellEntry[];
}

export interface FeatureLine {
  id: string;
  name: string;
  source: "class" | "option" | "species" | "background" | "feat";
  summary: string;
  /** When it is used, which decides where the sheet lists it. */
  activation: Activation;
  /** How often, in plain words ("2 per Long Rest; regain one use on a Short Rest"). */
  uses?: string;
}

export interface Character {
  level: number;
  proficiencyBonus: number;
  name: string;
  look: string;
  personality: string;
  archetype?: { id: string; label: string };
  class?: { id: string; name: string; hitDie: number };
  species?: { id: string; name: string; option?: string; size: string };
  background?: { id: string; name: string };
  abilities: Record<Ability, AbilityScore>;
  hitPoints: { max: number; hitDice: string; breakdown: string };
  armorClass: {
    value: number;
    breakdown: string;
    alternatives: Array<{ value: number; label: string }>;
  };
  speed: { walk: number; breakdown: string };
  initiative: number;
  passivePerception: number;
  darkvision?: number;
  resistances: string[];
  skills: SkillLine[];
  attacks: AttackLine[];
  spellcasting: SpellcastingBlock[];
  features: FeatureLine[];
  equipment: Array<{ name: string; quantity: number }>;
  gold: number;
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  /** Weapon kinds whose mastery property the character can use. */
  masteries: string[];
  /** Plain-language list of what the player still has to choose. Empty when complete. */
  missing: string[];
}

// ---- small helpers --------------------------------------------------------------------------

/** The data's one-word proficiency names, as the sheet prints them. */
const PROFICIENCY_LABELS: Record<string, string> = {
  light: "Light armor",
  medium: "Medium armor",
  heavy: "Heavy armor",
  shield: "Shields",
  simple: "Simple weapons",
  martial: "Martial weapons",
};

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** "1d8" plus a modifier: "1d8 + 3", "1d8 − 1", "1d8". */
function damageWith(dice: string, mod: number): string {
  if (mod === 0) return dice;
  return mod > 0 ? `${dice} + ${mod}` : `${dice} − ${Math.abs(mod)}`;
}

/** A spell's attack roll, save and damage with the caster's numbers, if it has any. */
function spellAttack(
  s: SpellContent,
  attackBonus: number,
  saveDc: number,
  damageBonus: number,
): SpellEntry["attack"] {
  if (!s.damage && !s.spellAttack && !s.save) return undefined;
  const damage = s.damage
    ? {
        damage: damageWith(s.damage, damageBonus),
        ...(s.damageType && { damageType: s.damageType }),
        ...(s.damageOn && { damageOn: s.damageOn }),
        ...(s.halfOnSave && { halfOnSave: true }),
      }
    : {};
  return {
    ...(s.spellAttack && { toHit: attackBonus }),
    ...(s.save && { save: { ability: s.save, dc: saveDc } }),
    ...damage,
  };
}

/**
 * A spell as the character casts it: its numbers worked out from the caster's attack bonus,
 * save DC and spellcasting modifier (`damageBonus` adds to damage: Agonizing Blast).
 */
export function spellEntry(
  s: SpellContent,
  caster: {
    attackBonus: number;
    saveDc: number;
    modifier: number;
    damageBonus?: number;
    note?: string;
    freeCasts?: string;
  },
): SpellEntry {
  const { attackBonus, saveDc, modifier, damageBonus = 0, ...extra } = caster;
  const attack = spellAttack(s, attackBonus, saveDc, damageBonus);
  return {
    id: s.id,
    name: s.name,
    level: s.level,
    summary: s.summary,
    time: s.time,
    range: s.range,
    duration: s.duration,
    components: s.components,
    concentration: s.concentration,
    ritual: s.ritual,
    activation: s.activation,
    ...extra,
    ...(attack && { attack }),
    ...(s.healing && {
      healing: s.healingAddsModifier ? damageWith(s.healing, modifier) : s.healing,
    }),
    ...(s.rollNote && { rollNote: s.rollNote }),
  };
}

/** A cantrip that belongs on the attack list: it deals damage with an attack roll or a save. */
export function isAttackCantrip(s: SpellEntry): boolean {
  return (
    s.level === 0 &&
    s.attack?.damage !== undefined &&
    (s.attack.damageOn === "attack" || s.attack.damageOn === "save")
  );
}

function dieFaces(dice: string): number {
  return Number(dice.match(/d(\d+)/)?.[1] ?? 0);
}

/** Resolves a use count ("pb", "cha") for this character. */
function resolveCount(u: Uses, mods: Record<Ability, number>): number {
  if (u.count === "pb") return PROFICIENCY_BONUS;
  if (u.count === "cha") return Math.max(1, mods.cha);
  return u.count;
}

/** "2 per Long Rest; regain one use when you finish a Short Rest." */
function formatUses(u: Uses, mods: Record<Ability, number>): string {
  const n = resolveCount(u, mods);
  const unit = u.unit ? ` ${u.unit}${n === 1 ? "" : "s"}` : "";
  const per = u.per === "short" ? "per Short or Long Rest" : "per Long Rest";
  return `${n}${unit} ${per}${u.note ? `; ${u.note.charAt(0).toLowerCase()}${u.note.slice(1)}` : ""}`;
}

function item(id: string | undefined): ItemContent | undefined {
  return id ? CONTENT.items[id] : undefined;
}

function hasOption(options: OptionContent[], id: string): boolean {
  return options.some((o) => o.id === id);
}

/** A record with one value per ability. */
function byAbility<T>(f: (a: Ability) => T): Record<Ability, T> {
  return {
    str: f("str"),
    dex: f("dex"),
    con: f("con"),
    int: f("int"),
    wis: f("wis"),
    cha: f("cha"),
  };
}

// ---- the derivation, step by step -----------------------------------------------------------

/** Standard array by class priority, then background boosts. */
function deriveAbilities(
  cls: ClassContent | undefined,
  answers: Answers,
): Record<Ability, { score: number; breakdown: string }> {
  const out = byAbility(() => ({ score: 10, breakdown: "10 (no class yet)" }));
  if (!cls) return out;
  cls.abilityPriority.forEach((a, i) => {
    const base = STANDARD_ARRAY[i] ?? 10;
    out[a] = { score: base, breakdown: `${base} from the standard array` };
  });
  const bg = backgroundOf(answers);
  if (!bg) return out;
  const boosts: Partial<Record<Ability, number>> = {};
  if (bg.abilities.includes(cls.primary)) {
    boosts[cls.primary] = 2;
    const others = bg.abilities.filter((a) => a !== cls.primary);
    others.sort((x, y) => cls.abilityPriority.indexOf(x) - cls.abilityPriority.indexOf(y));
    if (others[0]) boosts[others[0]] = 1;
  } else {
    for (const a of bg.abilities) boosts[a] = 1;
  }
  for (const a of ABILITIES) {
    const b = boosts[a];
    if (b)
      out[a] = { score: out[a].score + b, breakdown: `${out[a].breakdown}, +${b} from ${bg.name}` };
  }
  return out;
}

/** The origin feats: the background's, and Human Versatile's (the builder's pick). */
function deriveFeats(cls: ClassContent | undefined, answers: Answers): string[] {
  const feats: string[] = [];
  const bg = backgroundOf(answers);
  if (bg) feats.push(bg.feat);
  const species = speciesOf(answers);
  if (species?.originFeat && cls) {
    const [first, fallback] = cls.humanFeat;
    feats.push(feats.includes(first) && !CONTENT.feats[first]?.repeatable ? fallback : first);
  }
  return feats;
}

function deriveSkills(
  cls: ClassContent | undefined,
  answers: Answers,
  feats: string[],
): { proficient: string[]; expertise: string[] } {
  const known: string[] = [];
  const add = (id: string | undefined): void => {
    if (id && !known.includes(id)) known.push(id);
  };
  const allSkills = CONTENT.skills.map((s) => s.id);
  const preference = [...(cls?.skillPreference ?? []), ...allSkills];
  backgroundOf(answers)?.skills.forEach(add);
  if (cls)
    cls.skillPreference
      .filter((s) => !known.includes(s))
      .slice(0, cls.skillCount)
      .forEach(add);
  const choice = speciesOf(answers)?.skillChoice;
  if (choice) {
    const from = choice === "any" ? allSkills : choice;
    add(preference.find((s) => from.includes(s) && !known.includes(s)) ?? from[0]);
  }
  for (const f of feats) {
    const n = CONTENT.feats[f]?.skills ?? 0;
    for (let i = 0; i < n; i++) add(preference.find((s) => !known.includes(s)));
  }
  const expertise: string[] = [];
  if (cls) {
    for (const s of [...cls.expertise.preference, ...cls.skillPreference]) {
      if (expertise.length >= cls.expertise.count) break;
      // Wizard's Scholar only allows the knowledge skills in its preference list.
      if (cls.id === "wizard" && !cls.expertise.preference.includes(s)) continue;
      if (known.includes(s) && !expertise.includes(s)) expertise.push(s);
    }
  }
  return { proficient: known, expertise };
}

/** Picks `n` distinct tools from a preference list, skipping ones already known and falling
 * back to the content's list for the same kind. */
function pickTools(known: string[], preference: string[], n: number): string[] {
  const out: string[] = [];
  const kind = item(preference[0])?.kind;
  const fallback =
    kind === "instrument" || kind === "tool" || kind === "gaming" ? CONTENT.toolFallback[kind] : [];
  for (const id of [...preference, ...fallback]) {
    if (out.length >= n) break;
    if (!known.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function deriveTools(cls: ClassContent | undefined, answers: Answers, feats: string[]): string[] {
  const tools: string[] = [];
  const addDistinct = (id: string): void => {
    if (!tools.includes(id)) tools.push(id);
    else tools.push(...pickTools(tools, [id], 1));
  };
  for (const t of cls?.tools ?? []) addDistinct(t);
  for (const t of backgroundOf(answers)?.tools ?? []) addDistinct(t);
  for (const f of feats) {
    const pref = CONTENT.feats[f]?.tools;
    if (pref) tools.push(...pickTools(tools, pref, 3));
  }
  return tools;
}

function deriveLanguages(cls: ClassContent | undefined, answers: Answers): string[] {
  const langs = ["common"];
  const fill = (n: number): void => {
    const pref = [...(speciesOf(answers)?.languages ?? []), ...CONTENT.languages.fill];
    for (let i = 0; i < n; i++) {
      const next = pref.find((l) => !langs.includes(l));
      if (next) langs.push(next);
    }
  };
  fill(2);
  for (const l of cls?.languages.fixed ?? []) if (!langs.includes(l)) langs.push(l);
  fill(cls?.languages.extra ?? 0);
  return langs.map((l) => CONTENT.languages.names[l] ?? l);
}

function mergeEquipment(
  lists: EquipmentLine[][],
): Array<{ name: string; quantity: number; item?: string }> {
  const out: Array<{ name: string; quantity: number; item?: string }> = [];
  for (const line of lists.flat()) {
    const same = out.find((o) => o.name === line.name);
    if (same) same.quantity += line.quantity;
    else
      out.push({ name: line.name, quantity: line.quantity, ...(line.item && { item: line.item }) });
  }
  return out;
}

/** The ability a species or feat spell uses when the player may choose Int, Wis or Cha: the
 * class's spellcasting ability if it is one of those, else the highest of the three. */
function chosenCastingAbility(
  cls: ClassContent | undefined,
  scores: Record<Ability, number>,
): Ability {
  const ability = cls?.spellcasting?.ability;
  if (ability === "int" || ability === "wis" || ability === "cha") return ability;
  const three: Ability[] = ["int", "wis", "cha"];
  const order = cls?.abilityPriority ?? three;
  return three.reduce((best, a) =>
    scores[a] > scores[best] ||
    (scores[a] === scores[best] && order.indexOf(a) < order.indexOf(best))
      ? a
      : best,
  );
}

// ---- buildCharacter -------------------------------------------------------------------------

/** Derives the full level 2 character from a player's answers. Never throws. */
export function buildCharacter(answers: Answers): Character {
  const cls = classOf(answers);
  const species = speciesOf(answers);
  const speciesOption = speciesOptionOf(answers);
  const background = backgroundOf(answers);
  const options = chosenOptions(answers);
  const picks = spellPicks(answers);
  const feats = deriveFeats(cls, answers);
  const pb = PROFICIENCY_BONUS;

  // Abilities and saves.
  const raw = deriveAbilities(cls, answers);
  const scores = byAbility((a) => raw[a].score);
  const mods = byAbility((a) => abilityModifier(scores[a]));
  const abilities = byAbility((a): AbilityScore => {
    const prof = cls?.saves.includes(a) ?? false;
    return {
      name: ABILITY_NAMES[a],
      score: scores[a],
      modifier: mods[a],
      breakdown: raw[a].breakdown,
      save: mods[a] + (prof ? pb : 0),
      saveProficient: prof,
    };
  });

  // Skills.
  const { proficient, expertise } = deriveSkills(cls, answers, feats);
  const jack = cls?.features.some((f) => f.id === "bard-jack-of-all-trades") ?? false;
  const orderBonus = hasOption(options, "thaumaturge")
    ? { skills: ["arcana", "religion"], name: "Thaumaturge" }
    : hasOption(options, "magician")
      ? { skills: ["arcana", "nature"], name: "Magician" }
      : undefined;
  const skills: SkillLine[] = CONTENT.skills.map((s) => {
    const prof = proficient.includes(s.id);
    const exp = expertise.includes(s.id);
    const notes: string[] = [];
    let bonus = mods[s.ability] + (prof ? (exp ? 2 * pb : pb) : 0);
    if (!prof && jack) {
      const half = Math.floor(pb / 2);
      bonus += half;
      notes.push(`${signed(half)} Jack of All Trades`);
    }
    if (orderBonus?.skills.includes(s.id)) {
      const b = Math.max(1, mods.wis);
      bonus += b;
      notes.push(`${signed(b)} ${orderBonus.name}`);
    }
    return {
      id: s.id,
      name: s.name,
      ability: s.ability,
      bonus,
      proficient: prof,
      expertise: exp,
      notes,
    };
  });
  const perception = skills.find((s) => s.id === "perception")?.bonus ?? mods.wis;

  // Hit points.
  let hitPoints: Character["hitPoints"] = { max: 0, hitDice: "", breakdown: "Pick a class first." };
  if (cls) {
    const first = cls.hitDie + mods.con;
    const second = cls.hitDie / 2 + 1 + mods.con;
    let max = Math.max(1, first) + Math.max(1, second);
    const parts = [
      `${cls.hitDie} ${signed(mods.con)} Con at level 1`,
      `${cls.hitDie / 2 + 1} ${signed(mods.con)} Con at level 2`,
    ];
    if (species && species.hpPerLevel > 0) {
      max += species.hpPerLevel * LEVEL;
      parts.push(`+${species.hpPerLevel * LEVEL} ${species.name}`);
    }
    if (feats.includes("tough")) {
      max += 2 * LEVEL;
      parts.push(`+${2 * LEVEL} Tough`);
    }
    hitPoints = { max, hitDice: `${LEVEL}d${cls.hitDie}`, breakdown: parts.join(", ") };
  }

  // Equipment, armor and Armor Class.
  const equipment = mergeEquipment([cls?.equipment ?? [], background?.equipment ?? []]);
  const gold = (cls?.gold ?? 0) + (background?.gold ?? 0);
  const trained = {
    light: cls?.armor.light ?? false,
    medium: (cls?.armor.medium ?? false) || hasOption(options, "warden"),
    heavy: (cls?.armor.heavy ?? false) || hasOption(options, "protector"),
    shield: cls?.armor.shield ?? false,
  };
  const armors = equipment
    .map((e) => item(e.item))
    .filter((i): i is ItemContent => !!i?.armor && trained[i.armor.type]);
  const hasShield = trained.shield && equipment.some((e) => item(e.item)?.kind === "shield");
  const shieldAc = hasShield
    ? (equipment.map((e) => item(e.item)).find((i) => i?.kind === "shield")?.shieldAc ?? 2)
    : 0;
  const defense = hasOption(options, "defense");
  type AcOption = { value: number; breakdown: string; armor?: ItemContent; shield: boolean };
  const acOptions: AcOption[] = [];
  for (const a of armors) {
    const armor = a.armor;
    if (!armor) continue;
    const dex =
      armor.type === "light" ? mods.dex : armor.type === "medium" ? Math.min(2, mods.dex) : 0;
    let value = armor.ac + dex + shieldAc + (defense ? 1 : 0);
    const parts = [`${a.name} ${armor.ac}`];
    if (armor.type !== "heavy")
      parts.push(`${signed(dex)} Dex${armor.type === "medium" ? " (max +2)" : ""}`);
    if (hasShield) parts.push(`+${shieldAc} Shield`);
    if (defense) parts.push("+1 Defense");
    if (value < 0) value = 0;
    acOptions.push({ value, breakdown: parts.join(" "), armor: a, shield: hasShield });
  }
  const barbarianUd = cls?.features.some((f) => f.id === "barbarian-unarmored-defense");
  const monkUd = cls?.features.some((f) => f.id === "monk-unarmored-defense");
  if (barbarianUd) {
    acOptions.push({
      value: 10 + mods.dex + mods.con + shieldAc,
      breakdown: `10 ${signed(mods.dex)} Dex ${signed(mods.con)} Con (Unarmored Defense)${hasShield ? ` +${shieldAc} Shield` : ""}`,
      shield: hasShield,
    });
  } else if (monkUd) {
    acOptions.push({
      value: 10 + mods.dex + mods.wis,
      breakdown: `10 ${signed(mods.dex)} Dex ${signed(mods.wis)} Wis (Unarmored Defense)`,
      shield: false,
    });
  } else {
    acOptions.push({
      value: 10 + mods.dex + shieldAc,
      breakdown: `10 ${signed(mods.dex)} Dex (no armor)${hasShield ? ` +${shieldAc} Shield` : ""}`,
      shield: hasShield,
    });
  }
  const worn = acOptions.reduce((best, o) => (o.value > best.value ? o : best));
  const alternatives: Character["armorClass"]["alternatives"] = [];
  const mageArmorFrom = hasOption(options, "armor-of-shadows")
    ? "Armor of Shadows: cast Mage Armor on yourself for free"
    : picks.spells.includes("mage-armor")
      ? "Mage Armor: costs a level 1 spell slot, lasts 8 hours"
      : undefined;
  if (mageArmorFrom) {
    const value = 13 + mods.dex + (trained.shield && hasShield ? shieldAc : 0);
    if (value > worn.value || worn.armor)
      alternatives.push({ value, label: `${value} with no armor on (${mageArmorFrom})` });
  }

  // Speed and initiative.
  let walk = speciesOption?.speed ?? species?.speed ?? 30;
  const speedParts = [
    `${walk} ft. ${species ? (speciesOption?.speed ? speciesOption.name : species.name) : "(no species yet)"}`,
  ];
  const monkMove = cls?.table["Unarmored Movement"]?.[1];
  if (monkMove && !worn.armor && !worn.shield) {
    const bonus = Number(monkMove.match(/\d+/)?.[0] ?? 0);
    walk += bonus;
    speedParts.push(`+${bonus} ft. Unarmored Movement`);
  }
  if (worn.armor?.armor?.strength && scores.str < worn.armor.armor.strength) {
    walk -= 10;
    speedParts.push(`−10 ft. (${worn.armor.name} needs Strength ${worn.armor.armor.strength})`);
  }
  const alert = feats.includes("alert");
  const initiative = mods.dex + (alert ? pb : 0);

  // Weapon proficiency and masteries.
  const martialAll =
    cls?.weapons.martial === "all" ||
    hasOption(options, "protector") ||
    hasOption(options, "warden");
  const proficientWith = (w: NonNullable<ItemContent["weapon"]>): boolean => {
    if (w.category === "simple") return cls?.weapons.simple ?? false;
    if (martialAll) return true;
    if (cls?.weapons.martial === "finesse-or-light")
      return w.properties.includes("finesse") || w.properties.includes("light");
    if (cls?.weapons.martial === "light") return w.properties.includes("light");
    return false;
  };
  const masteries = cls ? cls.masteries.weapons.slice(0, cls.masteries.count) : [];

  // Weapon attacks.
  const attacks: AttackLine[] = [];
  const isMonk = cls?.id === "monk";
  const martialDie = cls?.table["Martial Arts"]?.[1];
  const raging = cls?.id === "barbarian" ? cls.table["Rage Damage"]?.[1] : undefined;
  const sneak = cls?.table["Sneak Attack"]?.[1];
  const seen = new Set<string>();
  for (const e of equipment) {
    const it = item(e.item);
    const w = it?.weapon;
    if (!it || !w || seen.has(it.id)) continue;
    seen.add(it.id);
    const prof = proficientWith(w);
    const finesse = w.properties.includes("finesse");
    const monkWeapon =
      isMonk && !w.ranged && (w.category === "simple" || w.properties.includes("light"));
    let ability: Ability = w.ranged ? "dex" : "str";
    if (!w.ranged && (finesse || monkWeapon) && mods.dex > mods.str) ability = "dex";
    let die = w.damage;
    if (monkWeapon && martialDie && dieFaces(martialDie) > dieFaces(die)) die = martialDie;
    const mod = mods[ability];
    const notes: string[] = [];
    let toHit = mod + (prof ? pb : 0);
    if (!prof) notes.push("You aren't proficient: no Proficiency Bonus to hit.");
    if (w.ranged && hasOption(options, "archery")) {
      toHit += 2;
      notes.push("Includes +2 from Archery.");
    }
    let dmgMod = mod;
    const twoHanded = w.properties.includes("two-handed");
    // Dueling: one-handed melee only; a thrown weapon's main use is a ranged attack, so it's left out.
    if (
      !w.ranged &&
      !twoHanded &&
      !w.properties.includes("thrown") &&
      hasOption(options, "dueling")
    ) {
      dmgMod += 2;
      notes.push("Includes +2 from Dueling (only while it's the one weapon in your hands).");
    }
    if (
      !w.ranged &&
      (twoHanded || w.properties.includes("versatile")) &&
      hasOption(options, "great-weapon-fighting")
    ) {
      notes.push("Great Weapon Fighting: with two hands, treat any 1 or 2 on a damage die as a 3.");
    }
    if (w.versatile) notes.push(`Two-handed: ${damageWith(w.versatile, dmgMod)}.`);
    if (w.properties.includes("thrown") && hasOption(options, "thrown-weapon-fighting")) {
      notes.push(`Thrown: ${damageWith(die, dmgMod + 2)} (Thrown Weapon Fighting).`);
    }
    if (w.properties.includes("light") && hasOption(options, "two-weapon-fighting")) {
      notes.push(
        "With a Light weapon in your other hand, the extra attack adds your modifier (Two-Weapon Fighting).",
      );
    }
    if (raging && ability === "str") notes.push(`${raging} damage while raging.`);
    if (sneak && (finesse || w.ranged))
      notes.push(`Sneak Attack: +${sneak} once per turn when it applies.`);
    if (monkWeapon) notes.push("Monk weapon: uses your Martial Arts die and Dexterity.");
    let range = w.properties.includes("reach") ? "10 ft." : "5 ft.";
    if (w.ranged) range = `${w.range ?? "?"} ft.`;
    else if (w.properties.includes("thrown") && w.range) range = `5 ft. or thrown ${w.range} ft.`;
    const masteryId = w.mastery && masteries.includes(it.id) ? w.mastery : undefined;
    const mastery = masteryId ? CONTENT.masteries[masteryId] : undefined;
    attacks.push({
      name: e.quantity > 1 ? `${it.name} (×${e.quantity})` : it.name,
      kind: "weapon",
      toHit,
      damage: damageWith(die, dmgMod),
      damageType: w.damageType,
      range,
      properties: w.properties.map((p) => p.charAt(0).toUpperCase() + p.slice(1)),
      ...(mastery && { mastery: { name: mastery.name, summary: mastery.summary } }),
      notes,
    });
  }
  attacks.sort((x, y) => Number(x.range.includes("/")) - Number(y.range.includes("/")));
  if (isMonk && martialDie) {
    const ability: Ability = mods.dex > mods.str ? "dex" : "str";
    attacks.unshift({
      name: "Unarmed Strike",
      kind: "unarmed",
      toHit: mods[ability] + pb,
      damage: damageWith(martialDie, mods[ability]),
      damageType: "Bludgeoning",
      range: "5 ft.",
      properties: [],
      notes: ["You can make one as a bonus action (Martial Arts), or two with Flurry of Blows."],
    });
  } else if (feats.includes("tavern-brawler")) {
    attacks.push({
      name: "Unarmed Strike",
      kind: "unarmed",
      toHit: mods.str + pb,
      damage: damageWith("1d4", mods.str),
      damageType: "Bludgeoning",
      range: "5 ft.",
      properties: [],
      notes: [
        "Tavern Brawler: reroll a 1 on the damage die; once per turn you can also push the target 5 feet.",
      ],
    });
  }

  // Spellcasting.
  const spellcasting: SpellcastingBlock[] = [];
  const dcFor = (a: Ability): number => 8 + mods[a] + pb;
  const atkFor = (a: Ability): number => mods[a] + pb;
  const agonizing = hasOption(options, "agonizing-blast");
  const entry = (
    id: string,
    a: Ability,
    extra: { note?: string; freeCasts?: string } = {},
  ): SpellEntry | undefined => {
    const s: SpellContent | undefined = CONTENT.spells[id];
    if (!s) return undefined;
    return spellEntry(s, {
      attackBonus: atkFor(a),
      saveDc: dcFor(a),
      modifier: mods[a],
      damageBonus: agonizing && id === "eldritch-blast" ? mods.cha : 0,
      ...extra,
    });
  };
  const entries = (ids: string[], a: Ability, extra?: Parameters<typeof entry>[2]): SpellEntry[] =>
    ids.flatMap((id) => {
      const e = entry(id, a, extra);
      return e ? [e] : [];
    });

  const sc = cls?.spellcasting;
  if (cls && sc) {
    const a = sc.ability;
    const spells = [
      ...entries(picks.spells, a),
      ...sc.alwaysPrepared.flatMap((ap) =>
        entries([ap.id], a, {
          note: ap.note,
          ...(ap.freeCasts && { freeCasts: formatUses(ap.freeCasts, mods) }),
        }),
      ),
      ...options.flatMap((o) =>
        o.grantsSpell ? entries([o.grantsSpell.id], a, { note: o.grantsSpell.note }) : [],
      ),
    ];
    let spellbook: SpellEntry[] | undefined;
    if (sc.spellbookSize) {
      spellbook = entries(sc.level1.slice(0, sc.spellbookSize), a);
    }
    spellcasting.push({
      source: "class",
      label: `${cls.name} spells`,
      ability: a,
      saveDc: dcFor(a),
      attackBonus: atkFor(a),
      slots: sc.slots,
      ...(sc.pactSlotLevel !== undefined && { pactSlotLevel: sc.pactSlotLevel }),
      cantrips: entries(picks.cantrips, a),
      spells,
      ...(spellbook && { spellbook }),
    });
  }
  const style = options.find((o) => o.grantsCantrips);
  if (style?.grantsCantrips) {
    const g = style.grantsCantrips;
    spellcasting.push({
      source: "fighting-style",
      label: `${style.name} cantrips`,
      ability: g.ability,
      saveDc: dcFor(g.ability),
      attackBonus: atkFor(g.ability),
      cantrips: entries(picks.bonusCantrips, g.ability),
      spells: [],
    });
  }
  const speciesCantrips = [...(species?.cantrips ?? []), ...(speciesOption?.cantrips ?? [])];
  if (species && (speciesCantrips.length > 0 || (speciesOption?.innateSpells.length ?? 0) > 0)) {
    const a =
      species.spellAbility && !speciesOption
        ? species.spellAbility
        : chosenCastingAbility(cls, scores);
    spellcasting.push({
      source: "species",
      label: `${speciesOption?.name ?? species.name} magic`,
      ability: a,
      saveDc: dcFor(a),
      attackBonus: atkFor(a),
      cantrips: entries(speciesCantrips, a),
      spells: (speciesOption?.innateSpells ?? []).flatMap((s) =>
        entries([s.id], a, {
          note: `${speciesOption?.name}: always prepared.`,
          freeCasts: formatUses(s.uses, mods),
        }),
      ),
    });
  }
  const initiate = background?.initiate;
  if (initiate) {
    const a = chosenCastingAbility(cls, scores);
    spellcasting.push({
      source: "feat",
      label: "Magic Initiate spells",
      ability: a,
      saveDc: dcFor(a),
      attackBonus: atkFor(a),
      cantrips: entries(picks.initiateCantrips, a),
      spells: entries(picks.initiateSpell, a, {
        note: "Magic Initiate: always prepared.",
        freeCasts: "1 per Long Rest",
      }),
    });
  }
  // Cantrips that attack go on the attack list too.
  for (const block of spellcasting) {
    for (const c of block.cantrips) {
      if (!isAttackCantrip(c) || !c.attack?.damage) continue;
      attacks.push({
        name: c.name,
        kind: "cantrip",
        ...(c.attack.toHit !== undefined && { toHit: c.attack.toHit }),
        ...(c.attack.save && { save: c.attack.save }),
        damage: c.attack.damage,
        damageType: c.attack.damageType ?? "",
        range: c.range,
        properties: [],
        notes:
          c.id === "eldritch-blast" && agonizing
            ? [`Includes ${signed(mods.cha)} from Agonizing Blast.`]
            : [],
      });
    }
  }

  // Features.
  const features: FeatureLine[] = [];
  for (const f of cls?.features ?? []) {
    features.push({
      id: f.id,
      name: f.name,
      source: "class",
      summary: f.summary,
      activation: f.activation,
      ...(f.uses && { uses: formatUses(f.uses, mods) }),
    });
  }
  for (const o of options) {
    features.push({
      id: o.id,
      name: o.name,
      source: "option",
      summary: o.summary,
      activation: o.activation,
      ...(o.uses && { uses: formatUses(o.uses, mods) }),
    });
  }
  for (const t of species?.traits ?? []) {
    if (speciesOption && t.name === speciesOption.replacesTrait) {
      features.push({
        id: `${t.id}-${speciesOption.id}`,
        name: `${t.name} (${speciesOption.name})`,
        source: "species",
        summary: speciesOption.summary,
        activation: speciesOption.activation,
      });
    } else {
      features.push({
        id: t.id,
        name: t.name,
        source: "species",
        summary: t.summary,
        activation: t.activation,
        ...(t.uses && { uses: formatUses(t.uses, mods) }),
      });
    }
  }
  for (const id of feats) {
    const f = CONTENT.feats[id];
    if (f)
      features.push({
        id: f.id,
        name: f.name,
        source: id === background?.feat ? "background" : "feat",
        summary: f.summary,
        activation: f.activation,
        ...(f.uses && { uses: formatUses(f.uses, mods) }),
      });
  }

  // Proficiencies.
  const armorProf = (cls?.armorText ?? []).map((a) => PROFICIENCY_LABELS[a.toLowerCase()] ?? a);
  if (hasOption(options, "protector")) armorProf.push("Heavy armor (Protector)");
  if (hasOption(options, "warden")) armorProf.push("Medium armor (Warden)");
  const weaponProf = (cls?.weaponText ?? []).map((w) => PROFICIENCY_LABELS[w.toLowerCase()] ?? w);
  if (hasOption(options, "protector") || hasOption(options, "warden"))
    weaponProf.push("Martial weapons");
  const tools = deriveTools(cls, answers, feats).map((id) => item(id)?.name ?? id);

  const missing = stepStatuses(answers)
    .filter((s) => s.applicable && !s.complete)
    .flatMap((s) =>
      s.issues.length > 0 ? s.issues : [`${s.label}: answer the earlier steps first.`],
    );

  return {
    level: LEVEL,
    proficiencyBonus: pb,
    name: answers.name?.trim() ?? "",
    look: answers.look?.trim() ?? "",
    personality: answers.personality?.trim() ?? "",
    ...(answers.archetype && {
      archetype: {
        id: answers.archetype,
        label:
          CONTENT.archetypes.find((a) => a.id === answers.archetype)?.label ?? answers.archetype,
      },
    }),
    ...(cls && { class: { id: cls.id, name: cls.name, hitDie: cls.hitDie } }),
    ...(species && {
      species: {
        id: species.id,
        name: species.name,
        size: species.size,
        ...(speciesOption && { option: speciesOption.name }),
      },
    }),
    ...(background && { background: { id: background.id, name: background.name } }),
    abilities,
    hitPoints,
    armorClass: { value: worn.value, breakdown: worn.breakdown, alternatives },
    speed: { walk, breakdown: speedParts.join(", ") },
    initiative,
    passivePerception: 10 + perception,
    ...((speciesOption?.darkvision ?? species?.darkvision) !== undefined && {
      darkvision: speciesOption?.darkvision ?? species?.darkvision,
    }),
    resistances: [...(species?.resist ?? []), ...(speciesOption?.resist ?? [])].map(
      (r) => r.charAt(0).toUpperCase() + r.slice(1),
    ),
    skills,
    attacks,
    spellcasting,
    features,
    equipment: equipment.map((e) => ({ name: e.name, quantity: e.quantity })),
    gold,
    proficiencies: {
      armor: armorProf,
      weapons: weaponProf,
      tools,
      languages: deriveLanguages(cls, answers),
    },
    masteries: masteries.map((id) => item(id)?.name ?? id),
    missing,
  };
}
