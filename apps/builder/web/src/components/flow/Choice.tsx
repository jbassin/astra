// One pickable card: a radio or checkbox with an icon, a title and a plain
// summary. The input is visually hidden and the label is the touch target; the tick in the
// corner (absolutely placed, so picking never shifts the layout) shows it is picked. `more`
// adds a "full rules" disclosure below the label, outside it, so opening it never picks.

import type { CSSProperties, ReactNode } from "react";

import { Icon } from "@/ui/Icon";

export function Choice({
  type,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  title,
  icon,
  hue,
  size = "row",
  more,
  moreLabel = "Read the full rules",
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  /** The emblem on the card's left (or top, for a tile). */
  icon?: ReactNode;
  /** `hueStyle(...)` from heraldry.ts: tints the emblem and the picked state. */
  hue?: CSSProperties;
  /** "tile": the big emblem-first card; "row": emblem beside the text. */
  size?: "tile" | "row";
  /** The full text, behind a disclosure under the card. */
  more?: ReactNode;
  moreLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`choice hued${disabled ? " is-disabled" : ""}`}
      data-size={size}
      data-type={type}
      style={hue}
    >
      <label className="choice-hit">
        <input
          type={type}
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        {icon && <span className="choice-emblem">{icon}</span>}
        <span className="choice-main">
          <span className="choice-title">
            <span className="choice-label">{title}</span>
          </span>
          {children}
        </span>
        <span className="choice-tick" aria-hidden="true">
          <Icon name="ui-check" />
        </span>
      </label>
      {more && (
        <details className="choice-more">
          <summary>
            <span className="more-close" aria-hidden="true">
              Less
            </span>
            <span className="sr-only">{`${moreLabel}: ${title}`}</span>
            <Icon name="ui-chevron-down" className="more-chevron" />
          </summary>
          <div className="choice-more-body">{more}</div>
        </details>
      )}
    </div>
  );
}

/** A group of choices with a visible question and an optional live, sticky "pick N" counter. */
export function ChoiceGroup({
  legend,
  prompt,
  counter,
  layout = "list",
  quietLegend = false,
  children,
}: {
  legend: string;
  /** Hide the legend visually when the screen's heading already says it (still read aloud). */
  quietLegend?: boolean;
  prompt?: string;
  counter?: ReactNode;
  /** "tiles": a 2×2 (phone) to 4-across grid of tiles; "grid": two across from tablet up. */
  layout?: "tiles" | "grid" | "list";
  children: ReactNode;
}) {
  return (
    <fieldset className="choice-group">
      {/* With a counter, the sticky row below shows the name, so the legend is read, not seen. */}
      <legend className={quietLegend || counter ? "group-legend sr-only" : "group-legend"}>
        {legend}
      </legend>
      {prompt && <p className="group-prompt">{prompt}</p>}
      {counter && (
        // Sticks under the top of the screen while the list scrolls, so the count stays in view.
        <div className="group-sticky">
          <span className="group-sticky-name" aria-hidden="true">
            {legend}
          </span>
          {counter}
        </div>
      )}
      <div className="choices" data-layout={layout}>
        {children}
      </div>
    </fieldset>
  );
}

/** "Pick 2 · 1 picked", announced politely as it changes, with a pip per pick. */
export function PickCounter({ count, picked }: { count: number; picked: number }) {
  return (
    <span className="pick-count" data-full={picked === count ? "" : undefined}>
      <span className="pips" aria-hidden="true">
        {Array.from({ length: count }, (_, n) => n).map((n) => (
          <span key={n} className="pip" data-on={n < picked ? "" : undefined} />
        ))}
      </span>
      <output aria-live="polite">
        Pick {count} · {picked} picked
      </output>
    </span>
  );
}
