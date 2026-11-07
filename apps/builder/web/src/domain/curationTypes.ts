// The shapes of the hand-written curation under content/*.ts. scripts/build-content.ts joins
// these with the imported 5etools data and fails on any id that doesn't resolve, any feature
// without a summary, or any shortlist smaller than its pick count.

import type {
  Ability,
  Activation,
  ArchetypeId,
  BackgroundId,
  ClassId,
  DamageOn,
  OptionGroupKey,
  OptionKind,
  SpeciesId,
  Uses,
} from "./contentTypes";

/**
 * A use count the build resolves: a number, "pb"/"cha" for the engine, or a class-table
 * column label (`{ table: "Rages" }`, read at level 2).
 */
export type CuratedCount = number | "pb" | "cha" | { table: string };

export interface CuratedUses extends Omit<Uses, "count"> {
  count: CuratedCount;
}

/** A summary for an imported feature or trait, or `hidden` with the reason it isn't shown. */
export type CuratedSummary =
  | { summary: string; activation: Activation; uses?: CuratedUses; hidden?: undefined }
  | { hidden: string; summary?: undefined; activation?: undefined; uses?: undefined };

export interface CuratedSpellPick {
  id: string;
  recommended?: boolean;
}

export interface CuratedOptionGroup {
  key: OptionGroupKey;
  label: string;
  prompt: string;
  /**
   * The pick count: a number the feature text states (Divine Order: "one of the following"),
   * a class-table column, an optional-feature progression name, or a feat progression name.
   */
  count: number | { table: string } | { optionalFeature: string } | { featProgression: string };
  choices: string[];
}

export interface CuratedClass {
  id: ClassId;
  archetype: ArchetypeId;
  blurb: string;
  primary: Ability;
  abilityPriority: [Ability, Ability, Ability, Ability, Ability, Ability];
  /** Every skill on the class list, best first. */
  skillPreference: string[];
  expertisePreference?: string[];
  /** Weapon kinds for Weapon Mastery, best first (item ids). */
  masteryWeapons?: string[];
  /** The class's tool proficiencies, resolved (item ids). */
  tools: string[];
  /** Fills for equipment placeholders (`instrumentMusical` → an item id). */
  equipmentChoices?: Record<string, string>;
  /** Package items the rules text names more exactly than the data does ("Druidic Focus
   * (Quarterstaff)"): the item id to use instead, and the name to show. */
  equipmentSwaps?: Record<string, { item: string; name: string }>;
  humanFeat: [string, string];
  languages?: { fixed: string[]; extra: number };
  /** Every imported level 1–2 feature id of the class, keyed by id. */
  features: Record<string, CuratedSummary>;
  optionGroups?: CuratedOptionGroup[];
  spells?: {
    cantrips?: CuratedSpellPick[];
    level1: CuratedSpellPick[];
    alwaysPrepared?: Array<{ id: string; note: string; freeCasts?: CuratedUses }>;
    spellbookSize?: number;
  };
}

export interface CuratedOption {
  kind: OptionKind;
  /** Where the rules text comes from. */
  from: { feat: string } | { optionalFeature: string } | { classFeature: string };
  /** One short line for the pick card (see `gist` in contentTypes.ts). */
  gist: string;
  summary: string;
  activation: Activation;
  uses?: CuratedUses;
  /** Metamagic: the Sorcery Point cost (the build checks it against the data). */
  cost?: number;
  grantsCantrips?: { list: ClassId; count: number; ability: Ability; choices: CuratedSpellPick[] };
  extraCantrips?: number;
  requires?: { damageCantrip?: boolean; attackCantrip?: boolean };
  /** A spell the option lets you cast (Armor of Shadows → Mage Armor), with plain words on how. */
  grantsSpell?: { id: string; note: string };
}

export interface CuratedSpeciesOption {
  /** One short line for the pick card (see `gist` in contentTypes.ts). */
  gist: string;
  summary: string;
  activation: Activation;
  uses?: CuratedUses;
}

export interface CuratedSpecies {
  id: SpeciesId;
  blurb: string;
  /** The size the builder gives when the species may pick (Medium). */
  size: string;
  traits: Record<string, CuratedSummary>;
  option?: { prompt: string; choices: Record<string, CuratedSpeciesOption> };
  skillChoice?: string[] | "any";
  languages: string[];
}

/** A spell's curated words: the pick card's one line and the plain summary. */
export interface CuratedSpell {
  gist: string;
  summary: string;
}

export interface CuratedBackground {
  id: BackgroundId;
  story: string;
  /** Fills for tool placeholders (`anyGamingSet` → an item id). */
  toolChoices?: Record<string, string>;
  equipmentChoices?: Record<string, string>;
  initiate?: { cantrips: CuratedSpellPick[]; spells: CuratedSpellPick[] };
}

export interface CuratedFeat {
  summary: string;
  activation: Activation;
  uses?: CuratedUses;
  tools?: string[];
}

/**
 * What the build can't read from a spell's data about its rolls: how the damage lands, when
 * the default (spell attack, else weapon rider, else save, else no roll) is wrong, and plain
 * words for any roll beyond the first.
 */
export interface CuratedSpellRoll {
  on?: DamageOn;
  note?: string;
}
