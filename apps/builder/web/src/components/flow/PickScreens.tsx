// The class choices and About you screens. Nothing is preselected and no class option is
// recommended (Josh's call); every option list shows "Pick N" with a live count. Spells have
// no screen: the builder chooses them (`spellPicks` in content.ts).

import type { Answers } from "@/domain/character";
import { CONTENT, classOf, pickedOptions } from "@/domain/content";
import type { OptionGroupContent, OptionGroupKey } from "@/domain/contentTypes";
import type { IconName } from "@/generated/icons";
import { CLASS_HERALDRY, hueStyle } from "@/ui/heraldry";
import { Icon } from "@/ui/Icon";

import { Choice, ChoiceGroup, PickCounter } from "./Choice";
import type { ScreenProps } from "./OriginScreens";

const GROUP_ICON: Record<OptionGroupKey, IconName> = {
  fightingStyle: "sword-brandish",
  divineOrder: "holy-symbol",
  primalOrder: "oak-leaf",
  invocations: "warlock-eye",
  metamagic: "magic-swirl",
};

/** The chosen class's hue, so the pick screens keep its colour. */
function classHue(answers: Answers) {
  const id = classOf(answers)?.id;
  return hueStyle(id ? CLASS_HERALDRY[id] : undefined);
}

/** The new array after toggling `id`; a pick-one list replaces instead of adding. */
function toggled(current: string[], id: string, count: number): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (count === 1) return [id];
  return current.length < count ? [...current, id] : current;
}

function OptionGroup({ group, answers, update }: ScreenProps & { group: OptionGroupContent }) {
  const picked = pickedOptions(answers, group);
  const type = group.count === 1 ? "radio" : "checkbox";
  const pick = (id: string) =>
    update({ options: { ...answers.options, [group.key]: toggled(picked, id, group.count) } });
  return (
    <ChoiceGroup
      legend={group.label}
      prompt={group.prompt}
      counter={<PickCounter count={group.count} picked={picked.length} />}
      layout="grid"
    >
      {group.choices.map((id) => {
        const o = CONTENT.options[id];
        if (!o) return null;
        const checked = picked.includes(id);
        return (
          <Choice
            key={id}
            type={type}
            name={group.key}
            value={id}
            checked={checked}
            disabled={type === "checkbox" && !checked && picked.length >= group.count}
            onChange={() => pick(id)}
            title={o.name}
            hue={classHue(answers)}
            icon={<Icon name={GROUP_ICON[group.key]} className="emblem-icon" />}
            more={<p>{o.summary}</p>}
            moreLabel="Read all of it"
          >
            <span className="choice-blurb">{o.gist}</span>
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}

export function OptionsScreen({ answers, update }: ScreenProps) {
  const cls = classOf(answers);
  return (
    <>
      {cls?.optionGroups.map((g) => (
        <OptionGroup key={g.key} group={g} answers={answers} update={update} />
      ))}
    </>
  );
}

export function AboutScreen({ answers, update }: ScreenProps) {
  return (
    <div className="about">
      <label className="about-field">
        <span className="field-label">Name</span>
        <input
          className="field"
          type="text"
          maxLength={80}
          autoComplete="off"
          value={answers.name ?? ""}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label className="about-field">
        <span className="field-label">What do they look like?</span>
        <span className="field-hint">
          A sentence or two is plenty: height, hair, clothes, a scar.
        </span>
        <textarea
          className="field"
          maxLength={2000}
          rows={3}
          value={answers.look ?? ""}
          onChange={(e) => update({ look: e.target.value })}
        />
      </label>
      <label className="about-field">
        <span className="field-label">What are they like?</span>
        <span className="field-hint">
          A habit, a fear, something they want. Cheerful and nosy? Quiet and loyal?
        </span>
        <textarea
          className="field"
          maxLength={2000}
          rows={3}
          value={answers.personality ?? ""}
          onChange={(e) => update({ personality: e.target.value })}
        />
      </label>
    </div>
  );
}
