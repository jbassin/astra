// The About you screen. Class options and spells have no screen: the builder chooses them
// (`chosenOptions` and `spellPicks` in content.ts).

import type { ScreenProps } from "./OriginScreens";

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
