// The first four screens: kind of hero, class, species (with its sub-choice) and background.
// Each shows its choices with Josh's plain summaries, so no player needs a rulebook.

import { ARCHETYPES, type Answers } from "@/domain/character";
import {
  backgroundsForClass,
  CONTENT,
  classesForArchetype,
  classOf,
  speciesOf,
} from "@/domain/content";
import { ABILITY_NAMES } from "@/domain/sheet";
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
}

export function ArchetypeScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup legend="Kind of hero" layout="tiles" quietLegend>
      {ARCHETYPES.map((a) => {
        const h = ARCHETYPE_HERALDRY[a.id];
        return (
          <Choice
            key={a.id}
            type="radio"
            name="archetype"
            value={a.id}
            checked={answers.archetype === a.id}
            onChange={() => update({ archetype: a.id })}
            title={a.label}
            size="tile"
            hue={hueStyle(h)}
            icon={<Crest icon={h.icon} />}
          >
            <span className="choice-blurb">{a.blurb}</span>
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}

export function ClassScreen({ answers, update }: ScreenProps) {
  return (
    <ChoiceGroup legend="Class" layout="grid" quietLegend>
      {classesForArchetype(answers.archetype).map((c) => {
        const h = CLASS_HERALDRY[c.id];
        return (
          <Choice
            key={c.id}
            type="radio"
            name="class"
            value={c.id}
            checked={answers.classId === c.id}
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

function SpeciesOption({ answers, update }: ScreenProps) {
  const species = speciesOf(answers);
  const option = species?.option;
  if (!species || !option) return null;
  return (
    <ChoiceGroup legend={option.label} prompt={option.prompt} layout="grid">
      {option.choices.map((c) => (
        <Choice
          key={c.id}
          type="radio"
          name="species-option"
          value={c.id}
          checked={answers.speciesOption === c.id}
          onChange={() => update({ speciesOption: c.id })}
          title={c.name}
          hue={classHue(answers)}
          icon={<Icon name={SPECIES_ICON[species.id]} className="emblem-icon" />}
          more={<p>{c.summary}</p>}
          moreLabel="Read all of it"
        >
          <span className="choice-blurb">{c.gist}</span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}

function SpeciesGifts({ answers }: { answers: Answers }) {
  const species = speciesOf(answers);
  if (!species) return null;
  return (
    <details className="gifts hued" style={classHue(answers)}>
      <summary>
        <Icon name={SPECIES_ICON[species.id]} className="gifts-icon" />
        <span>
          What being {/^[aeiou]/i.test(species.name) ? "an" : "a"} {species.name} gives you
        </span>
        <Icon name="ui-chevron-down" className="gifts-chevron" />
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
      <ChoiceGroup legend="Species" layout="grid">
        {Object.values(CONTENT.species).map((s) => (
          <Choice
            key={s.id}
            type="radio"
            name="species"
            value={s.id}
            checked={answers.speciesId === s.id}
            onChange={() => update({ speciesId: s.id })}
            title={s.name}
            hue={classHue(answers)}
            icon={<Icon name={SPECIES_ICON[s.id]} className="emblem-icon" />}
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
    <ChoiceGroup
      legend="Background"
      prompt="These backgrounds suit your class."
      layout="grid"
      quietLegend
    >
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
            hue={classHue(answers)}
            icon={<Icon name={BACKGROUND_ICON[b.id]} className="emblem-icon" />}
          >
            <span className="choice-blurb">{b.story}</span>
            {feat && (
              <span className="choice-talent">
                <strong>Special talent: {feat.name}.</strong> {feat.summary}
              </span>
            )}
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}
