/**
 * The light / dark theme switch. The choice lives in localStorage `akasha-theme` (`light`,
 * `dark`, or absent for "follow the system") and shows as `data-theme` on `<html>`. The
 * inline `THEME_SCRIPT` in the document head applies it before first paint, so a reload
 * never flashes the other theme. React never renders that attribute: the theme controls
 * write it directly, and CSS (`tokens.css`) does the rest.
 */

import { withStorage } from "./storage";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "akasha-theme";

/**
 * Runs in the head before the body parses. Kept tiny and defensive: storage can throw in a
 * private window, and then the page simply follows the system.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export function parseChoice(raw: string | null): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/** The stored choice. Call only in effects and event handlers (README trap: storage in render). */
export function readChoice(): ThemeChoice {
  return withStorage((s) => parseChoice(s.getItem(THEME_STORAGE_KEY)), "system");
}

/**
 * Stores the choice and applies it to `<html>` at once. With storage blocked, the choice lasts
 * for this page only.
 */
export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  withStorage((s) => {
    if (choice === "system") s.removeItem(THEME_STORAGE_KEY);
    else s.setItem(THEME_STORAGE_KEY, choice);
  }, undefined);
}

/** The theme on screen now: the explicit choice, else the system preference. */
export function effectiveTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Calls `onChange` whenever the theme on screen may have changed: a new `data-theme`, or a
 * system switch while no explicit choice is set. Returns the teardown.
 */
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}
