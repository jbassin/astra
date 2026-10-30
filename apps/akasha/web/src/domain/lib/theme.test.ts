import { runInThisContext } from "node:vm";

import { afterEach, describe, expect, it } from "vitest";

import { applyChoice, parseChoice, readChoice, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

// The pre-paint script is a string the head runs as-is; run it the same way, against the
// test environment's document and localStorage.
const runScript = () => runInThisContext(THEME_SCRIPT);

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme", () => {
  it("treats anything but light or dark as following the system", () => {
    expect(parseChoice("light")).toBe("light");
    expect(parseChoice("dark")).toBe("dark");
    expect(parseChoice(null)).toBe("system");
    expect(parseChoice("sepia")).toBe("system");
  });

  it("the pre-paint script applies a stored choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("the pre-paint script leaves the attribute off without a valid choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    runScript();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("applies, stores and clears a choice", () => {
    applyChoice("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(readChoice()).toBe("light");
    applyChoice("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readChoice()).toBe("system");
  });
});
