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
  type OptionGroupContent,
  type SpeciesContent,
  type SpeciesOptionContent,
  type SpellChoice,
} from "./contentTypes";

export { CONTENT };

export function classOf(answers: Answers): ClassContent | undefined {
  return answers.classId ? CONTENT.classes[answers.classId] : undefined;
}

export function speciesOf(answers: Answers): SpeciesContent | undefined {
  return answers.speciesId ? CONTENT.species[answers.speciesId] : undefined;
}

export function speciesOptionOf(answers: Answers): SpeciesOptionContent | undefined {
  return speciesOf(answers)?.option?.choices.find((c) => c.id === answers.speciesOption);
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

/** The option ids picked for a group, keeping only ones the group offers. */
export function pickedOptions(answers: Answers, group: OptionGroupContent): string[] {
  return (answers.options?.[group.key] ?? []).filter((id) => group.choices.includes(id));
}

/** Every option the player has picked for their class, resolved. */
export function chosenOptions(answers: Answers): OptionContent[] {
  const cls = classOf(answers);
  if (!cls) return [];
  return cls.optionGroups.flatMap((g) =>
    pickedOptions(answers, g)
      .slice(0, g.count)
      .flatMap((id) => (CONTENT.options[id] ? [CONTENT.options[id]] : [])),
  );
}

/** One list of spells the player picks from, with how many they pick. */
export interface SpellPickList {
  /** The `Answers` field these picks are saved in. */
  field: "cantrips" | "spells" | "bonusCantrips" | "initiateCantrips" | "initiateSpell";
  label: string;
  count: number;
  choices: SpellChoice[];
  picked: string[];
}

/**
 * Every spell list the player picks from right now, in the order the UI should show them:
 * class cantrips, class level 1 spells, fighting-style cantrips, Magic Initiate cantrips and
 * spell. Counts come from the class table plus any option that adds cantrips (Thaumaturge).
 */
export function spellPickLists(answers: Answers): SpellPickList[] {
  const lists: SpellPickList[] = [];
  const cls = classOf(answers);
  const sc = cls?.spellcasting;
  const options = chosenOptions(answers);
  if (cls && sc) {
    const extra = options.reduce((n, o) => n + (o.extraCantrips ?? 0), 0);
    if (sc.cantripCount > 0) {
      lists.push({
        field: "cantrips",
        label: `${cls.name} cantrips`,
        count: sc.cantripCount + extra,
        choices: sc.cantrips,
        picked: answers.cantrips ?? [],
      });
    }
    lists.push({
      field: "spells",
      label: cls.id === "wizard" ? "Prepared level 1 spells" : `${cls.name} level 1 spells`,
      count: sc.preparedCount,
      choices: sc.level1,
      picked: answers.spells ?? [],
    });
  }
  const grant = options.find((o) => o.grantsCantrips)?.grantsCantrips;
  const style = options.find((o) => o.grantsCantrips);
  if (grant && style) {
    lists.push({
      field: "bonusCantrips",
      label: `${style.name} cantrips`,
      count: grant.count,
      choices: grant.choices,
      picked: answers.bonusCantrips ?? [],
    });
  }
  const initiate = backgroundOf(answers)?.initiate;
  if (initiate) {
    lists.push({
      field: "initiateCantrips",
      label: "Magic Initiate cantrips",
      count: initiate.cantripCount,
      choices: initiate.cantrips,
      picked: answers.initiateCantrips ?? [],
    });
    lists.push({
      field: "initiateSpell",
      label: "Magic Initiate level 1 spell",
      count: initiate.spellCount,
      choices: initiate.spells,
      picked: answers.initiateSpell ? [answers.initiateSpell] : [],
    });
  }
  return lists;
}

/** Cantrips the species (and its sub-choice) already teaches; picking them again is wasted. */
export function speciesCantripIds(answers: Answers): string[] {
  return [...(speciesOf(answers)?.cantrips ?? []), ...(speciesOptionOf(answers)?.cantrips ?? [])];
}

/**
 * Spell ids a list can't offer right now because the character already has them from the
 * species or from an earlier list (class cantrips, then fighting-style cantrips, then Magic
 * Initiate). `pruneAnswers` drops such repeats; the UI should grey them out.
 */
export function unavailableSpellIds(answers: Answers, field: SpellPickList["field"]): string[] {
  const order: Array<SpellPickList["field"]> = ["cantrips", "bonusCantrips", "initiateCantrips"];
  if (field === "spells") return [];
  if (field === "initiateSpell") return answers.spells ?? [];
  const earlier = order.slice(0, order.indexOf(field));
  return [...speciesCantripIds(answers), ...earlier.flatMap((f) => answers[f] ?? [])];
}

/**
 * Plain-language problems with the picks that counts alone don't catch. Agonizing and Repelling
 * Blast need a damaging (or attack-roll) cantrip from the class's own list.
 */
export function optionRequirementIssues(answers: Answers): string[] {
  const issues: string[] = [];
  const cantrips = (answers.cantrips ?? []).flatMap((id) =>
    CONTENT.spells[id] ? [CONTENT.spells[id]] : [],
  );
  for (const o of chosenOptions(answers)) {
    if (o.requires?.damageCantrip && !cantrips.some((s) => s.damage && (s.spellAttack || s.save))) {
      issues.push(`${o.name} needs a cantrip that deals damage, such as Eldritch Blast.`);
    }
    if (o.requires?.attackCantrip && !cantrips.some((s) => s.damage && s.spellAttack)) {
      issues.push(`${o.name} needs a cantrip that makes an attack roll, such as Eldritch Blast.`);
    }
  }
  return issues;
}
