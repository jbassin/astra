// The first four screens: kind of hero, class, species and background. Each card shows one
// plain line and nothing folds out, so no player needs a rulebook.

import { ARCHETYPES, type Answers } from "@/domain/character";
import {
  backgroundsForClass,
  CONTENT,
  classesForArchetype,
  classOf,
  speciesName,
  speciesOptionOf,
} from "@/domain/content";
import { ABILITY_NAMES } from "@/domain/sheet";
import type { TakenClasses } from "@/server/builder";
import {
  ABILITY_ICON,
  ARCHETYPE_HERALDRY,
  BACKGROUND_ICON,
  CLASS_HERALDRY,
  hueStyle,
  SPECIES_ICON,
} from "@/ui/heraldry";
import { Crest, Icon } from "@/ui/Icon";

import { Choice, ChoiceGroup } from "./Choice";

export interface ScreenProps {
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  /** Class id to the name of the player who holds it; absent in test mode. */
  taken?: TakenClasses;
}

export function ArchetypeScreen({ answers, update, taken }: ScreenProps) {
  return (
    <ChoiceGroup legend="Kind of hero" layout="tiles" quietLegend>
      {ARCHETYPES.map((a) => {
        const h = ARCHETYPE_HERALDRY[a.id];
        const full = taken !== undefined && classesForArchetype(a.id).every((c) => c.id in taken);
        return (
          <Choice
            key={a.id}
            type="radio"
            name="archetype"
            value={a.id}
            checked={answers.archetype === a.id}
            disabled={full}
            onChange={() => update({ archetype: a.id })}
            title={a.label}
            size="tile"
            hue={hueStyle(h)}
            icon={<Crest icon={h.icon} />}
          >
            <span className="choice-blurb">{a.blurb}</span>
            {full && <span className="choice-taken">All taken</span>}
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}

export function ClassScreen({ answers, update, taken }: ScreenProps) {
  return (
    <ChoiceGroup legend="Class" layout="grid" quietLegend>
      {classesForArchetype(answers.archetype).map((c) => {
        const h = CLASS_HERALDRY[c.id];
        const holder = taken?.[c.id];
        return (
          <Choice
            key={c.id}
            type="radio"
            name="class"
            value={c.id}
            checked={answers.classId === c.id}
            disabled={holder !== undefined}
            onChange={() => update({ classId: c.id })}
            title={c.name}
            hue={hueStyle(h)}
            icon={<Crest icon={h.icon} />}
          >
            <span className="choice-blurb">{c.blurb}</span>
            <span className="choice-meta">
              <Icon name={ABILITY_ICON[c.primary]} />
              Main ability: {ABILITY_NAMES[c.primary]}
            </span>
            {holder !== undefined && <span className="choice-taken">Taken by {holder}</span>}
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}

/** The chosen class's hue, so later screens keep its colour. */
function classHue(answers: Answers) {
  const id = classOf(answers)?.id;
  return hueStyle(id ? CLASS_HERALDRY[id] : undefined);
}

/**
 * The builder picks a species' sub-choice from the class, so each card names the species this
 * class would be ("High Elf" for a Wizard). With no class yet it is the plain species name.
 */
export function SpeciesScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup legend="Species" layout="grid">
      {Object.values(CONTENT.species).map((s) => (
        <Choice
          key={s.id}
          type="radio"
          name="species"
          value={s.id}
          checked={answers.speciesId === s.id}
          onChange={() => update({ speciesId: s.id })}
          title={speciesName(s, speciesOptionOf({ ...answers, speciesId: s.id }))}
          hue={classHue(answers)}
          icon={<Icon name={SPECIES_ICON[s.id]} className="emblem-icon" />}
        >
          <span className="choice-blurb">{s.blurb}</span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}

export function BackgroundScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup
      legend="Background"
      prompt="These backgrounds suit your class."
      layout="grid"
      quietLegend
    >
      {backgroundsForClass(answers).map((b) => (
        <Choice
          key={b.id}
          type="radio"
          name="background"
          value={b.id}
          checked={answers.backgroundId === b.id}
          onChange={() => update({ backgroundId: b.id })}
          title={b.name}
          hue={classHue(answers)}
          icon={<Icon name={BACKGROUND_ICON[b.id]} className="emblem-icon" />}
        >
          <span className="choice-blurb">{b.story}</span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}
