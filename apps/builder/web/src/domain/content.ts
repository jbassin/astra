// The builder's game content (the generated module) and the lookups that turn a player's
// answers into "what can they pick, and how many". Pure and client-safe; steps.ts and
// engine.ts build on it, and so can the UI.

import { CONTENT } from "@/generated/content";

import type { Answers } from "./character";
import {
  BACKGROUND_IDS,
  type BackgroundContent,
  CLASS_IDS,
  type ClassContent,
  type OptionContent,
  type SpeciesContent,
  type SpeciesOptionContent,
} from "./contentTypes";

export { CONTENT };

export function classOf(answers: Answers): ClassContent | undefined {
  return answers.classId ? CONTENT.classes[answers.classId] : undefined;
}

export function speciesOf(answers: Answers): SpeciesContent | undefined {
  return answers.speciesId ? CONTENT.species[answers.speciesId] : undefined;
}

/**
 * The species sub-choice (an Elf's lineage, a Dragonborn's colour). The player never picks it:
 * the builder gives the one the class names, so there is none until both are picked.
 */
export function speciesOptionOf(answers: Answers): SpeciesOptionContent | undefined {
  const species = speciesOf(answers);
  const id = species && classOf(answers)?.speciesOptions[species.id];
  return species?.option?.choices.find((c) => c.id === id);
}

/**
 * The one species name a player sees. The sub-choice goes in front ("Red Dragonborn", "Drow
 * Elf") unless its own name already says the species ("High Elf", "Forest Gnome"). The plain
 * species name stands when there is no sub-choice yet, or when the curation keeps it out of
 * the name (a Goliath's giant ancestry is a trait on the sheet).
 */
export function speciesName(species: SpeciesContent, option?: SpeciesOptionContent): string {
  if (!option || !species.option?.inName) return species.name;
  return option.name.endsWith(` ${species.name}`) ? option.name : `${option.name} ${species.name}`;
}

export function backgroundOf(answers: Answers): BackgroundContent | undefined {
  return answers.backgroundId ? CONTENT.backgrounds[answers.backgroundId] : undefined;
}

/** The classes an archetype offers (all classes when no archetype is picked). */
export function classesForArchetype(archetype: Answers["archetype"]): ClassContent[] {
  const ids = archetype
    ? (CONTENT.archetypes.find((a) => a.id === archetype)?.classes ?? [])
    : CLASS_IDS;
  return ids.map((id) => CONTENT.classes[id]);
}

/** The backgrounds a player may pick for their class (all of them before a class is picked). */
export function backgroundsForClass(answers: Answers): BackgroundContent[] {
  const cls = classOf(answers);
  const ids = cls ? cls.backgrounds : BACKGROUND_IDS;
  return ids.map((id) => CONTENT.backgrounds[id]);
}

/**
 * Every option the builder gives the class: the first `count` of each option group's
 * shortlist (best first; entries past the count are alternates). The player picks none.
 */
export function chosenOptions(answers: Answers): OptionContent[] {
  const cls = classOf(answers);
  if (!cls) return [];
  return cls.optionGroups.flatMap((g) =>
    g.choices.slice(0, g.count).flatMap((id) => (CONTENT.options[id] ? [CONTENT.options[id]] : [])),
  );
}

/** The spells the builder chose for the character, by where they come from. */
interface SpellPicks {
  /** Class cantrips (Thaumaturge and Magician add one). */
  cantrips: string[];
  /** Class level 1 spells, prepared (for a Wizard, the prepared ones from the spellbook). */
  spells: string[];
  /** Cantrips from a fighting style (Blessed Warrior, Druidic Warrior). */
  bonusCantrips: string[];
  /** Magic Initiate (Acolyte, Guide, Sage backgrounds). */
  initiateCantrips: string[];
  initiateSpell: string[];
}

/** Cantrips the species (and its sub-choice) already teaches. */
function speciesCantripIds(answers: Answers): string[] {
  return [...(speciesOf(answers)?.cantrips ?? []), ...(speciesOptionOf(answers)?.cantrips ?? [])];
}

/** The first `count` ids of `list` that aren't in `known`. */
function firstNew(list: string[], count: number, known: Set<string>): string[] {
  return list.filter((id) => !known.has(id)).slice(0, count);
}

/**
 * Every spell the builder gives the character, chosen from the curated lists in order: class
 * cantrips, fighting-style cantrips, then Magic Initiate. A cantrip the character already has
 * (from the species or an earlier list) is skipped for the next one on the list, as is a Magic
 * Initiate spell the class already prepares. Counts come from the class table plus any option
 * that adds cantrips (Thaumaturge); a list waits (stays empty) until its class, option or
 * background is chosen.
 */
export function spellPicks(answers: Answers): SpellPicks {
  const picks: SpellPicks = {
    cantrips: [],
    spells: [],
    bonusCantrips: [],
    initiateCantrips: [],
    initiateSpell: [],
  };
  const known = new Set(speciesCantripIds(answers));
  const learn = (ids: string[]) => {
    for (const id of ids) known.add(id);
    return ids;
  };
  const sc = classOf(answers)?.spellcasting;
  const options = chosenOptions(answers);
  if (sc) {
    const extra = sc.cantripCount > 0 ? options.reduce((n, o) => n + (o.extraCantrips ?? 0), 0) : 0;
    picks.cantrips = learn(firstNew(sc.cantrips, sc.cantripCount + extra, known));
    picks.spells = sc.level1.slice(0, sc.preparedCount);
  }
  const grant = options.find((o) => o.grantsCantrips)?.grantsCantrips;
  if (grant) picks.bonusCantrips = learn(firstNew(grant.cantrips, grant.count, known));
  const initiate = backgroundOf(answers)?.initiate;
  if (initiate) {
    picks.initiateCantrips = learn(firstNew(initiate.cantrips, initiate.cantripCount, known));
    picks.initiateSpell = firstNew(initiate.spells, initiate.spellCount, new Set(picks.spells));
  }
  return picks;
}
