// The first four screens: kind of hero, class, species (with its sub-choice) and background.
// Each shows its choices with Josh's plain summaries, so no player needs a rulebook.

import { ARCHETYPES, type Answers } from "@/domain/character";
import { backgroundsForClass, CONTENT, classesForArchetype, speciesOf } from "@/domain/content";
import { ABILITY_NAMES } from "@/domain/sheet";

import { Choice, ChoiceGroup } from "./Choice";

export interface ScreenProps {
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
}

export function ArchetypeScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup legend="Kind of hero">
      {ARCHETYPES.map((a) => (
        <Choice
          key={a.id}
          type="radio"
          name="archetype"
          value={a.id}
          checked={answers.archetype === a.id}
          onChange={() => update({ archetype: a.id })}
          title={a.label}
        >
          <span className="choice-blurb">{a.blurb}</span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}

export function ClassScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup legend="Class">
      {classesForArchetype(answers.archetype).map((c) => (
        <Choice
          key={c.id}
          type="radio"
          name="class"
          value={c.id}
          checked={answers.classId === c.id}
          onChange={() => update({ classId: c.id })}
          title={c.name}
        >
          <span className="choice-blurb">{c.blurb}</span>
          <span className="choice-meta">Main ability: {ABILITY_NAMES[c.primary]}</span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}

function SpeciesOption({ answers, update }: ScreenProps) {
  const option = speciesOf(answers)?.option;
  if (!option) return null;
  return (
    <ChoiceGroup legend={option.label} prompt={option.prompt}>
      {option.choices.map((c) => (
        <Choice
          key={c.id}
          type="radio"
          name="species-option"
          value={c.id}
          checked={answers.speciesOption === c.id}
          onChange={() => update({ speciesOption: c.id })}
          title={c.name}
        >
          <span className="choice-blurb">{c.summary}</span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}

function SpeciesGifts({ answers }: { answers: Answers }) {
  const species = speciesOf(answers);
  if (!species) return null;
  return (
    <details className="gifts">
      <summary>
        What being {/^[aeiou]/i.test(species.name) ? "an" : "a"} {species.name} gives you
      </summary>
      <ul>
        {species.traits.map((t) => (
          <li key={t.id}>
            <strong>{t.name}.</strong> {t.summary}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SpeciesScreen({ answers, update }: ScreenProps) {
  return (
    <>
      <ChoiceGroup legend="Species">
        {Object.values(CONTENT.species).map((s) => (
          <Choice
            key={s.id}
            type="radio"
            name="species"
            value={s.id}
            checked={answers.speciesId === s.id}
            onChange={() => update({ speciesId: s.id })}
            title={s.name}
          >
            <span className="choice-blurb">{s.blurb}</span>
          </Choice>
        ))}
      </ChoiceGroup>
      <SpeciesGifts answers={answers} />
      <SpeciesOption answers={answers} update={update} />
    </>
  );
}

export function BackgroundScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup legend="Background" prompt="These backgrounds suit your class.">
      {backgroundsForClass(answers).map((b) => {
        const feat = CONTENT.feats[b.feat];
        return (
          <Choice
            key={b.id}
            type="radio"
            name="background"
            value={b.id}
            checked={answers.backgroundId === b.id}
            onChange={() => update({ backgroundId: b.id })}
            title={b.name}
          >
            <span className="choice-blurb">{b.story}</span>
            {feat && (
              <span className="choice-meta">
                Special talent: {feat.name}. {feat.summary}
              </span>
            )}
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}
