// The group page's list and the player page's "Not <name>?" link, against a jsdom localStorage.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartyMember } from "@/domain/party";

import { NotYou } from "./NotYou";
import { PartyPicker } from "./PartyPicker";

const WORD = "red-fox-lantern";
const KEY = "builder.party";
const ADA = "A".repeat(22);
const BO = "B".repeat(22);
const players: PartyMember[] = [
  { id: ADA, name: "Ada" },
  { id: BO, name: "Bo" },
];

// jsdom cannot navigate; stop a tapped link from trying.
const stopNavigation = (e: Event) => e.preventDefault();

const onForgot = vi.fn();

beforeEach(() => {
  onForgot.mockClear();
  window.localStorage.clear();
  document.addEventListener("click", stopNavigation);
});
afterEach(() => {
  document.removeEventListener("click", stopNavigation);
  cleanup();
  vi.restoreAllMocks();
});

function renderPicker(opts: { switching?: boolean } = {}) {
  const onForward = vi.fn();
  render(
    <PartyPicker
      word={WORD}
      players={players}
      switching={opts.switching ?? false}
      onForward={onForward}
      onForgot={onForgot}
    />,
  );
  return onForward;
}

describe("the group page", () => {
  it("lists every name as a link to that player's page", () => {
    const onForward = renderPicker();
    expect(screen.getByRole("heading", { name: "Who are you?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ada" }).getAttribute("href")).toBe(`/c/${ADA}`);
    expect(screen.getByRole("link", { name: "Bo" }).getAttribute("href")).toBe(`/c/${BO}`);
    expect(onForward).not.toHaveBeenCalled();
  });

  it("remembers the player and the phrase when a name is tapped", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("link", { name: "Bo" }));
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ id: BO, word: WORD });
  });

  it("forwards a remembered player", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: BO, word: WORD }));
    const onForward = renderPicker();
    expect(onForward).toHaveBeenCalledWith(BO);
  });

  it("rewrites a remembered phrase that differs from the page's phrase when it forwards", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: BO, word: "old-phrase" }));
    renderPicker();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ id: BO, word: WORD });
  });

  it("does not forward a remembered id that is not on the list", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: "C".repeat(22), word: WORD }));
    const onForward = renderPicker();
    expect(onForward).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Ada" })).toBeTruthy();
  });

  it("shows the list and forgets the player when switching", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: BO, word: WORD }));
    const onForward = renderPicker({ switching: true });
    expect(onForward).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Ada" })).toBeTruthy();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    // The route drops `?switch=1` from the URL once the player is forgotten.
    expect(onForgot).toHaveBeenCalledTimes(1);
  });

  it("does not ask to drop ?switch=1 on a normal visit", () => {
    renderPicker();
    expect(onForgot).not.toHaveBeenCalled();
  });

  it("still shows the list when localStorage throws", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    const onForward = renderPicker();
    expect(onForward).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Ada" }));
    cleanup();
    renderPicker({ switching: true });
    expect(screen.getByRole("link", { name: "Bo" })).toBeTruthy();
  });
});

describe("Not <name>?", () => {
  it("shows nothing when no phrase is remembered", () => {
    render(<NotYou id={ADA} name="Ada" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links to the group page with switch=1 when a phrase is remembered", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: ADA, word: WORD }));
    render(<NotYou id={ADA} name="Ada" />);
    expect(screen.getByRole("link", { name: "Not Ada?" }).getAttribute("href")).toBe(
      `/p/${WORD}?switch=1`,
    );
  });

  it("remembers this page's player when another was remembered, keeping the phrase", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: BO, word: WORD }));
    render(<NotYou id={ADA} name="Ada" />);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ id: ADA, word: WORD });
  });

  it("remembers nothing on a page opened by a private link with nothing remembered", () => {
    render(<NotYou id={ADA} name="Ada" />);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("shows nothing when the remembered data is bad or storage throws", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: ADA, word: "../evil" }));
    render(<NotYou id={ADA} name="Ada" />);
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<NotYou id={ADA} name="Ada" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
