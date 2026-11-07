// One pickable card: a radio or checkbox with a title, an optional badge and a plain summary.
// The input is visually hidden; the whole card is the touch target.

import type { ReactNode } from "react";

export function Choice({
  type,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  title,
  badge,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label className={`choice${disabled ? " is-disabled" : ""}`}>
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="choice-title">
        <span className="choice-label">{title}</span>
        {badge}
      </span>
      {children}
    </label>
  );
}

/** A group of choices with a visible question and an optional live "pick N" counter. */
export function ChoiceGroup({
  legend,
  prompt,
  counter,
  children,
}: {
  legend: string;
  prompt?: string;
  counter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="choice-group">
      <legend className="group-legend">{legend}</legend>
      {(prompt ?? counter) && (
        <p className="group-prompt">
          {prompt} {counter}
        </p>
      )}
      <div className="choices">{children}</div>
    </fieldset>
  );
}

/** "Pick 2 · 1 picked", announced politely as it changes. */
export function PickCounter({ count, picked }: { count: number; picked: number }) {
  return (
    <output className="pick-count" data-full={picked === count ? "" : undefined} aria-live="polite">
      Pick {count} · {picked} picked
    </output>
  );
}
