// The shape of the generated content module (`@/generated/content`), which
// scripts/build-content.ts writes by joining the imported 5etools data (content/5etools/) with
// the curation (content/*.ts). Types only, so the generator, the engine and the UI share them.

import type { Ability, WeaponProperty } from "./imported";

export type { Ability, WeaponProperty };

export const CLASS_IDS = [
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
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const SPECIES_IDS = [
  "aasimar",
  "dragonborn",
  "dwarf",
  "elf",
  "gnome",
  "goliath",
  "halfling",
  "human",
  "orc",
  "tiefling",
] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

export const BACKGROUND_IDS = [
  "acolyte",
  "artisan",
  "charlatan",
  "criminal",
  "entertainer",
  "farmer",
  "guard",
  "guide",
  "hermit",
  "merchant",
  "noble",
  "sage",
  "sailor",
  "scribe",
  "soldier",
  "wayfarer",
] as const;
export type BackgroundId = (typeof BACKGROUND_IDS)[number];

export const ARCHETYPE_IDS = ["warrior", "scoundrel", "mage", "healer"] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

/** The keys of a class's level 1–2 option groups (fighting style, Divine Order, …). */
export const OPTION_GROUP_KEYS = [
  "fightingStyle",
  "divineOrder",
  "primalOrder",
  "invocations",
  "metamagic",
] as const;
export type OptionGroupKey = (typeof OPTION_GROUP_KEYS)[number];

/**
 * How often a feature can be used. `count` is resolved to a number at build time where the
 * class table gives it; "pb" (Proficiency Bonus) and "cha" (Charisma modifier, minimum 1) are
 * resolved by the engine.
 */
export interface Uses {
  count: number | "pb" | "cha";
  /** The unit, when it isn't "use" ("Sorcery Point", "Hit Point"). */
  unit?: string;
}

/**
 * When a thing is used, which decides where the sheet lists it: on your action, bonus action or
 * reaction; "minute" for a minute or more (outside a fight); "passive" for always on, or used
 * when its own text says (a trigger with no action cost).
 */
export const ACTIVATIONS = ["action", "bonus", "reaction", "minute", "passive"] as const;
export type Activation = (typeof ACTIVATIONS)[number];

/** Something the sheet sorts by when it is used. */
interface Activated {
  activation: Activation;
}

/** Anything a player sees: a name, a plain-language summary and the full rules text. */
export interface Summarized {
  id: string;
  name: string;
  /** Plain words for a first-time player: what it does, when to use it, what to roll. */
  summary: string;
  /** The rules text it summarizes, as plain paragraphs (from 5etools). */
  rulesText: string[];
}

/** The longest a gist may be; the build fails on a longer one. */
export const GIST_MAX = 90;

/** Something with a one-line gist: a class option or a spell. */
interface Gisted {
  /** One short, plain line (at most GIST_MAX characters). A spell's card on the sheet shows
   * it as its text. */
  gist: string;
}

/** Something the content keeps that the sheet may leave out. */
interface Applied {
  /** Why the sheet makes no card and no "On your turn" entry for it: its whole effect already
   * shows in a number or a line ("Already in your Hit Points."). */
  applied?: string;
}

export interface FeatureContent extends Summarized, Activated {
  level: number;
  uses?: Uses;
}

/** Spell ids, best first; the builder takes the first ones it can (`CuratedSpellList`). */
export type SpellList = string[];

export type OptionKind =
  | "fighting-style"
  | "divine-order"
  | "primal-order"
  | "invocation"
  | "metamagic";

export interface OptionContent extends Summarized, Activated, Gisted, Applied {
  kind: OptionKind;
  uses?: Uses;
  /** Metamagic cost in Sorcery Points. */
  cost?: number;
  /** An option that teaches extra cantrips the builder picks (Blessed or Druidic Warrior). */
  grantsCantrips?: { list: ClassId; count: number; ability: Ability; cantrips: SpellList };
  /** An option that adds to the class's cantrip count (Thaumaturge, Magician). */
  extraCantrips?: number;
  /** A requirement the UI should show and the step status checks. */
  requires?: { damageCantrip?: boolean; attackCantrip?: boolean };
  /** A spell the option lets you cast, shown with the character's spells. */
  grantsSpell?: { id: string };
}

export interface OptionGroupContent {
  key: OptionGroupKey;
  label: string;
  /** One plain line the UI shows above the choices. */
  prompt: string;
  /** How many options the class has at level 2. */
  count: number;
  /** Option ids (keys of `BuilderContent.options`), best first. The builder gives the first
   * `count` (`chosenOptions` in content.ts); the rest are alternates, promoted by reordering. */
  choices: string[];
}

export interface AlwaysPreparedSpell {
  id: string;
  freeCasts?: Uses;
  /** What casting it costs, when that isn't a spell slot or a free cast. */
  cost?: string;
}

export interface SpellcastingContent {
  ability: Ability;
  /** "pact": Warlock slots, all of one level. */
  kind: "prepared" | "pact";
  /** Cantrips known at level 2 (before Thaumaturge or Magician). */
  cantripCount: number;
  /** Level 1 spells prepared at level 2. */
  preparedCount: number;
  /** Slots per spell level at level 2 (index 0 = level 1). */
  slots: number[];
  /** Pact Magic: the level of every slot. */
  pactSlotLevel?: number;
  cantrips: SpellList;
  level1: SpellList;
  alwaysPrepared: AlwaysPreparedSpell[];
}

export interface EquipmentLine {
  /** An item id (`BuilderContent.items`), when the thing has an item record. */
  item?: string;
  name: string;
  quantity: number;
}

export type WeaponProficiency = "all" | "finesse-or-light" | "light" | "none";

export interface ClassContent {
  id: ClassId;
  name: string;
  archetype: ArchetypeId;
  /** Josh's one-line pitch for the class. */
  blurb: string;
  /** The ability the class leans on, shown to the player. */
  primary: Ability;
  /** The standard array (15, 14, 13, 12, 10, 8) goes to these abilities in this order. */
  abilityPriority: Ability[];
  hitDie: number;
  saves: Ability[];
  armor: { light: boolean; medium: boolean; heavy: boolean; shield: boolean };
  weapons: { simple: boolean; martial: WeaponProficiency };
  /** Proficiency text as the rules print it. */
  armorText: string[];
  weaponText: string[];
  skillCount: number;
  /** The class's skill list, best first; the builder takes the first ones not already known. */
  skillPreference: string[];
  expertise: { count: number; preference: string[] };
  masteries: { count: number; weapons: string[] };
  tools: string[];
  equipment: EquipmentLine[];
  /** Gold pieces from the class's starting package. */
  gold: number;
  features: FeatureContent[];
  optionGroups: OptionGroupContent[];
  spellcasting?: SpellcastingContent;
  /** Backgrounds whose ability list includes `primary`, in display order. */
  backgrounds: BackgroundId[];
  /** The species sub-choice the builder gives (an Elf's lineage, a Dragonborn's colour), by
   * species id, for every species that has one. */
  speciesOptions: Partial<Record<SpeciesId, string>>;
  /** Human Versatile: the origin feat the builder gives, and the fallback when the background
   * already gives that feat. */
  humanFeat: [string, string];
  /** Languages beyond Common and two standard ones (Thieves' Cant, Druidic, Deft Explorer). */
  languages: { fixed: string[]; extra: number };
  /** The class table at levels 1 and 2, keyed by column label (from 5etools). */
  table: Record<string, [string, string]>;
}

export interface ArchetypeContent {
  id: ArchetypeId;
  label: string;
  blurb: string;
  classes: ClassId[];
}

export interface SpeciesOptionContent extends Summarized, Activated, Applied {
  /** The species trait this option replaces on the sheet. */
  replacesTrait: string;
  uses?: Uses;
  speed?: number;
  darkvision?: number;
  resist?: string[];
  cantrips: string[];
  innateSpells: Array<{ id: string; uses: Uses }>;
}

export interface SpeciesTraitContent extends Summarized, Activated, Applied {
  uses?: Uses;
}

export interface SpeciesContent {
  id: SpeciesId;
  name: string;
  blurb: string;
  size: string;
  speed: number;
  darkvision?: number;
  resist: string[];
  traits: SpeciesTraitContent[];
  /** The sub-choice ("Elven Lineage"), when the species has one. The builder picks it from
   * the class (`ClassContent.speciesOptions`). `inName` is false when it stays out of the
   * species name (a Goliath's giant ancestry is a trait, not a kind of Goliath). */
  option?: { label: string; inName: boolean; choices: SpeciesOptionContent[] };
  cantrips: string[];
  /** The fixed spellcasting ability for `cantrips` (Aasimar); otherwise the builder picks. */
  spellAbility?: Ability;
  /** A skill the species grants that the builder picks: from a list, or any skill. */
  skillChoice?: string[] | "any";
  /** Extra Hit Points per level (Dwarven Toughness). */
  hpPerLevel: number;
  /** Standard languages this species is likely to speak, best first. */
  languages: string[];
  /** Human Versatile: an origin feat. */
  originFeat: boolean;
}

export interface MagicInitiateContent {
  list: ClassId;
  cantripCount: number;
  spellCount: number;
  cantrips: SpellList;
  spells: SpellList;
}

export interface BackgroundContent {
  id: BackgroundId;
  name: string;
  /** One plain line of story. */
  story: string;
  abilities: Ability[];
  feat: string;
  skills: string[];
  tools: string[];
  equipment: EquipmentLine[];
  gold: number;
  initiate?: MagicInitiateContent;
}

export interface FeatContent extends Summarized, Activated, Applied {
  category: string;
  repeatable: boolean;
  uses?: Uses;
  /** Skilled: how many skills it grants (the builder picks them). */
  skills?: number;
  /** Crafter, Musician: the tools the builder picks for it. */
  tools?: string[];
}

/**
 * How a spell's damage lands: on a spell attack hit, on a failed save, with no roll at all, as
 * extra damage on your weapon hit, at the start of each of the target's turns while it lasts,
 * or as the weapon's new damage die (Shillelagh).
 */
export const DAMAGE_ON = [
  "attack",
  "save",
  "auto",
  "weapon-hit",
  "each-turn",
  "weapon-die",
] as const;
export type DamageOn = (typeof DAMAGE_ON)[number];

export interface SpellContent extends Summarized, Activated, Gisted {
  level: number;
  school: string;
  time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  higherLevel: string[];
  /** Damage dice at character level 2, for spells that deal damage: the first roll the text
   * gives (`rollNote` covers any others). */
  damage?: string;
  damageType?: string;
  /** How `damage` lands; set whenever `damage` is. */
  damageOn?: DamageOn;
  /** A successful save halves the damage instead of avoiding it. */
  halfOnSave?: boolean;
  /** Healing dice ("2d8"), for spells that restore Hit Points. */
  healing?: string;
  /** The healing adds the caster's spellcasting modifier. */
  healingAddsModifier?: boolean;
  /** Plain words for the rolls `damage` and `healing` can't say (a second roll, a bonus). */
  rollNote?: string;
  spellAttack?: "melee" | "ranged";
  save?: Ability;
}

export interface ItemContent {
  id: string;
  name: string;
  kind:
    | "weapon"
    | "armor"
    | "shield"
    | "gear"
    | "tool"
    | "instrument"
    | "gaming"
    | "focus"
    | "ammo";
  weapon?: {
    category: "simple" | "martial";
    ranged: boolean;
    damage: string;
    damageType: string;
    versatile?: string;
    range?: string;
    properties: WeaponProperty[];
    mastery?: string;
  };
  armor?: {
    type: "light" | "medium" | "heavy";
    ac: number;
    strength?: number;
    stealthDisadvantage: boolean;
  };
  shieldAc?: number;
}

export interface SkillContent {
  id: string;
  name: string;
  ability: Ability;
}

export interface BuilderContent {
  source: { repo: string; commit: string };
  archetypes: ArchetypeContent[];
  classes: Record<ClassId, ClassContent>;
  species: Record<SpeciesId, SpeciesContent>;
  backgrounds: Record<BackgroundId, BackgroundContent>;
  feats: Record<string, FeatContent>;
  options: Record<string, OptionContent>;
  spells: Record<string, SpellContent>;
  items: Record<string, ItemContent>;
  masteries: Record<string, Summarized>;
  skills: SkillContent[];
  /** Language names by id, and the standard languages in the order the builder fills them. */
  languages: { names: Record<string, string>; fill: string[] };
  /** Tools the builder falls back to, in order, when a pick would repeat one. */
  toolFallback: Record<"instrument" | "tool" | "gaming", string[]>;
}
