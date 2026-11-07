// The class choices and spells screens. Nothing is preselected and no class option is
// recommended (Josh's call); spells the curation recommends carry a visible marker. Every
// list shows "Pick N" with a live count, and a choice the character already has is greyed
// out with the reason.

import type { Answers } from "@/domain/character";
import {
  CONTENT,
  classOf,
  optionRequirementIssues,
  pickedOptions,
  type SpellPickList,
  spellPickLists,
  unavailableSpellIds,
} from "@/domain/content";
import type { OptionGroupContent, OptionGroupKey } from "@/domain/contentTypes";
import type { IconName } from "@/generated/icons";
import { CLASS_HERALDRY, hueStyle, schoolIcon } from "@/ui/heraldry";
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
          >
            <span className="choice-blurb">{o.summary}</span>
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

function picksOf(answers: Answers, field: SpellPickList["field"]): string[] {
  if (field === "initiateSpell") return answers.initiateSpell ? [answers.initiateSpell] : [];
  return answers[field] ?? [];
}

function SpellMeta({ id }: { id: string }) {
  const s = CONTENT.spells[id];
  if (!s) return null;
  const parts = [s.level === 0 ? "Cantrip" : "Level 1", s.time.split(",")[0] ?? s.time, s.range];
  if (s.concentration) parts.push("Concentration");
  return (
    <span className="chips">
      {parts.map((p) => (
        <span key={p} className="chip">
          {p}
        </span>
      ))}
    </span>
  );
}

function SpellList({ list, answers, update }: ScreenProps & { list: SpellPickList }) {
  const picked = picksOf(answers, list.field).filter((id) => list.choices.some((c) => c.id === id));
  const unavailable = new Set(unavailableSpellIds(answers, list.field));
  const reason =
    list.field === "initiateSpell"
      ? "Already one of your prepared spells."
      : "You already know this one.";
  const type = list.count === 1 ? "radio" : "checkbox";
  const pick = (id: string) => {
    const field = list.field;
    if (field === "initiateSpell") {
      update({ initiateSpell: id });
      return;
    }
    const patch: Partial<Answers> = {};
    patch[field] = toggled(picked, id, list.count);
    update(patch);
  };
  return (
    <ChoiceGroup
      legend={list.label}
      counter={<PickCounter count={list.count} picked={picked.length} />}
    >
      {list.choices.map((c) => {
        const s = CONTENT.spells[c.id];
        if (!s) return null;
        const checked = picked.includes(c.id);
        const taken = unavailable.has(c.id) && !checked;
        return (
          <Choice
            key={c.id}
            type={type}
            name={list.field}
            value={c.id}
            checked={checked}
            disabled={taken || (type === "checkbox" && !checked && picked.length >= list.count)}
            onChange={() => pick(c.id)}
            title={s.name}
            hue={classHue(answers)}
            icon={<Icon name={schoolIcon(s.school)} className="emblem-icon" />}
            badge={
              c.recommended && (
                <span className="badge">
                  <Icon name="ui-star" />
                  Recommended
                </span>
              )
            }
          >
            <SpellMeta id={c.id} />
            <span className="choice-blurb">{s.summary}</span>
            {taken && (
              <span className="choice-reason">
                <Icon name="ui-lock" />
                {reason}
              </span>
            )}
          </Choice>
        );
      })}
    </ChoiceGroup>
  );
}

export function SpellsScreen({ answers, update }: ScreenProps) {
  const issues = optionRequirementIssues(answers);
  return (
    <>
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i) => (
            <li key={i}>
              <Icon name="ui-info" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      )}
      {spellPickLists(answers).map((l) => (
        <SpellList key={l.field} list={l} answers={answers} update={update} />
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
