/**
 * The theme controls. They write `data-theme` on <html> and localStorage directly
 * (`theme.ts`); React never renders the attribute, so the inline head script and these
 * controls are its only writers. What a control shows for the current theme is CSS
 * (`.ak-when-light` / `.ak-when-dark` in shell.css), so the server render is the same for
 * every reader and hydration never mismatches.
 */
import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/domain/components/icons";
import { applyChoice, effectiveTheme, readChoice, type ThemeChoice } from "@/domain/lib/theme";

/** The desktop header's button: flips between light and dark. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="ak-iconbtn ak-theme-toggle"
      onClick={() => applyChoice(effectiveTheme() === "dark" ? "light" : "dark")}
    >
      <span className="ak-when-light">
        <MoonIcon />
        <span className="ak-visually-hidden">Switch to the dark theme</span>
      </span>
      <span className="ak-when-dark">
        <SunIcon />
        <span className="ak-visually-hidden">Switch to the light theme</span>
      </span>
    </button>
  );
}

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** The phone menu's Light / Dark / System control. */
export function ThemeSegments() {
  // Read the stored choice after mount (README trap: localStorage only in effects).
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => setChoice(readChoice()), []);

  return (
    <fieldset className="ak-theme-row">
      {/* A legend can't sit in a flex row, so the visible label is a plain span. */}
      <legend className="ak-visually-hidden">Theme</legend>
      <span aria-hidden="true">Theme</span>
      <div className="ak-segments">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={choice === c.value}
            onClick={() => {
              applyChoice(c.value);
              setChoice(c.value);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
