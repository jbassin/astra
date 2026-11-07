// The shapes of the trimmed 5etools JSON under content/5etools/, written by
// scripts/import-5etools.ts and read by scripts/build-content.ts. Every rules text here is
// already plain (see markup.ts). Ids are slugs of the 5etools name (`slugify`).

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: readonly Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export interface ImportMeta {
  repo: string;
  commit: string;
  source: "XPHB";
}

/** One item of a starting-equipment package. Exactly one of the fields is set. */
export interface ImportedEquipment {
  /** An item id (`items.json`). */
  item?: string;
  quantity?: number;
  /** A placeholder the builder fills: `instrumentMusical`, `toolArtisan`, `setGaming`. */
  choice?: string;
  /** A named thing with no item record (the Wizard's "Spellbook"). */
  special?: string;
  /** Coins, in copper pieces. */
  valueCp?: number;
  /** A display name the data gives the item ("Book (Prayers)"). */
  displayName?: string;
}

export interface ImportedFeature {
  id: string;
  name: string;
  level: number;
  text: string[];
}

export interface ImportedClass {
  id: string;
  name: string;
  hitDie: number;
  saves: Ability[];
  /** 5etools `primaryAbility`: each object lists abilities that together count as primary. */
  primaryAbility: Array<Partial<Record<Ability, true>>>;
  skillChoice: { from: string[]; count: number } | { any: number };
  weapons: string[];
  armor: string[];
  tools: string[];
  equipmentA: ImportedEquipment[];
  equipmentText: string;
  /** Class-table columns at levels 1 and 2, keyed by the plain column label. */
  table: Record<string, [string, string]>;
  /** Spell slots per spell level (index 0 = level 1 slots) at levels 1 and 2. */
  spellSlots?: [number[], number[]];
  spellcastingAbility?: Ability;
  casterProgression?: string;
  /** Feats granted by level (Fighting Style). */
  featProgression: Array<{ name: string; categories: string[]; level: number; count: number }>;
  /** Optional-feature picks (invocations, metamagic) at levels 1 and 2. */
  optionalFeatureProgression: Array<{
    name: string;
    featureTypes: string[];
    counts: [number, number];
  }>;
  /** Weapon Mastery kinds at levels 1 and 2 (`itemMasteriesProgression`). */
  masteries: [number, number];
  /** Spells the class always has prepared, by the level that grants them (levels 1–2). */
  alwaysPrepared: Array<{ level: number; spell: string }>;
  features: ImportedFeature[];
}

export interface ImportedSpeciesOption {
  id: string;
  name: string;
  /** The trait this option replaces (Elven Lineage, Draconic Ancestry, …). */
  replacesTrait: string;
  /** The replaced trait's text for this option. */
  text: string[];
  speed?: number;
  darkvision?: number;
  resist?: string[];
  /** Cantrips this option teaches at level 1. */
  cantrips: string[];
  /** Level 1 spells this option grants with free casts (`uses`: "pb" or a number). */
  innateSpells?: Array<{ spell: string; uses: string }>;
  /** Variables of a templated option (Dragonborn colour and damage type). */
  vars?: Record<string, string>;
}

export interface ImportedSpecies {
  id: string;
  name: string;
  size: string[];
  speed: number;
  darkvision?: number;
  resist: string[];
  traits: Array<{ id: string; name: string; text: string[] }>;
  options: ImportedSpeciesOption[];
  /** Cantrips every member knows (Aasimar's Light). */
  cantrips: string[];
  /** The fixed spellcasting ability for those cantrips (Aasimar: Charisma). Lineage and legacy
   * spells let the player choose Intelligence, Wisdom or Charisma instead. */
  spellAbility?: Ability;
}

export interface ImportedBackground {
  id: string;
  name: string;
  abilities: Ability[];
  feat: string;
  /** For Magic Initiate: the spell list (cleric, druid, wizard). */
  featList?: string;
  skills: string[];
  /** Tool proficiencies: an item id, or a placeholder (`anyArtisansTool`, `anyGamingSet`, …). */
  tools: string[];
  equipmentA: ImportedEquipment[];
}

export interface ImportedFeat {
  id: string;
  name: string;
  category: string;
  repeatable: boolean;
  text: string[];
}

export interface ImportedOptionalFeature {
  id: string;
  name: string;
  featureType: "EI" | "MM";
  /** Minimum Warlock level, when the option has one. */
  minLevel?: number;
  /** Other prerequisites in plain words. */
  prerequisite?: string;
  /** Sorcery Point cost, for Metamagic. */
  cost?: number;
  text: string[];
}

export interface ImportedSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  text: string[];
  higherLevel: string[];
  classes: string[];
  /** Cantrip damage dice at character levels 1–4 (5etools `scalingLevelDice` "1"; "1d8 or 1d12"
   * when the spell has alternatives). */
  cantripDice?: string;
  spellAttack?: "melee" | "ranged";
  save?: Ability[];
  damageTypes: string[];
}

export type WeaponProperty =
  | "ammunition"
  | "finesse"
  | "heavy"
  | "light"
  | "loading"
  | "reach"
  | "thrown"
  | "two-handed"
  | "versatile";

export interface ImportedItem {
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
  weight?: number;
  valueCp?: number;
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
  /** A pack's contents. */
  contents?: Array<{ item: string; quantity: number }>;
  text: string[];
}

export interface ImportedMastery {
  id: string;
  name: string;
  text: string[];
}

export interface ImportedSkill {
  id: string;
  name: string;
  ability: Ability;
}

export interface ImportedData {
  meta: ImportMeta;
  classes: ImportedClass[];
  species: ImportedSpecies[];
  backgrounds: ImportedBackground[];
  feats: ImportedFeat[];
  optionalFeatures: ImportedOptionalFeature[];
  spells: ImportedSpell[];
  items: ImportedItem[];
  masteries: ImportedMastery[];
  skills: ImportedSkill[];
  languages: Array<{ id: string; name: string; type: "standard" | "rare" }>;
}

/** The file each `ImportedData` key is written to under content/5etools/. */
export const IMPORT_FILES: Record<keyof ImportedData, string> = {
  meta: "meta.json",
  classes: "classes.json",
  species: "species.json",
  backgrounds: "backgrounds.json",
  feats: "feats.json",
  optionalFeatures: "optional-features.json",
  spells: "spells.json",
  items: "items.json",
  masteries: "masteries.json",
  skills: "skills.json",
  languages: "languages.json",
};
