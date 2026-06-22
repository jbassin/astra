import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Darkmode } from "./Darkmode";
import { ReaderMode } from "./ReaderMode";

afterEach(() => {
  document.documentElement.removeAttribute("saved-theme");
  document.documentElement.removeAttribute("reader-mode");
  localStorage.clear();
});

describe("Darkmode island (dark-only, emits themechange)", () => {
  it("flips saved-theme, persists, and dispatches themechange on click", () => {
    document.documentElement.setAttribute("saved-theme", "dark"); // the FOUC pre-paint state
    const { container } = render(<Darkmode />);
    const btn = container.querySelector(".darkmode");
    expect(btn).toBeTruthy();

    let emitted: string | undefined;
    const onChange = (e: Event) => {
      emitted = (e as CustomEvent<{ theme: string }>).detail.theme;
    };
    document.addEventListener("themechange", onChange);

    fireEvent.click(btn as Element);
    expect(document.documentElement.getAttribute("saved-theme")).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(emitted).toBe("light");

    document.removeEventListener("themechange", onChange);
  });

  it("removes its listener on unmount (N5)", () => {
    document.documentElement.setAttribute("saved-theme", "dark");
    const { container, unmount } = render(<Darkmode />);
    const btn = container.querySelector(".darkmode") as Element;
    unmount();
    // After unmount the (now-detached) button click must not mutate the theme.
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("saved-theme")).toBe("dark");
  });
});

describe("ReaderMode island", () => {
  it("toggles html[reader-mode] and dispatches readermodechange", () => {
    const { container } = render(<ReaderMode />);
    expect(document.documentElement.getAttribute("reader-mode")).toBe("off");
    const btn = container.querySelector(".readermode") as Element;

    let mode: string | undefined;
    const onChange = (e: Event) => {
      mode = (e as CustomEvent<{ mode: string }>).detail.mode;
    };
    document.addEventListener("readermodechange", onChange);

    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("reader-mode")).toBe("on");
    expect(mode).toBe("on");
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("reader-mode")).toBe("off");

    document.removeEventListener("readermodechange", onChange);
  });
});
