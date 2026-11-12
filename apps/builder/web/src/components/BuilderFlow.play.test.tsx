// The flow holds the play marks next to the answers and hands both to `persist`.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Answers, PlayState } from "@/domain/character";

import { BuilderFlow } from "./BuilderFlow";

afterEach(cleanup);

const CLERIC: Answers = {
  archetype: "healer",
  classId: "cleric",
  speciesId: "human",
  backgroundId: "acolyte",
  name: "Ada",
  look: "Tall.",
  personality: "Kind.",
};

function renderFlow(initial: Answers, initialPlay?: PlayState) {
  const persist = vi.fn<(v: { answers: Answers; play: PlayState }) => void>();
  render(
    <BuilderFlow
      initial={initial}
      initialPlay={initialPlay}
      persist={persist}
      title="Hi"
      intro="x"
    />,
  );
  return persist;
}

describe("BuilderFlow's play marks", () => {
  it("persists the answers and the marks together when a mark changes", () => {
    const persist = renderFlow(CLERIC);
    fireEvent.click(screen.getByRole("button", { name: "Lower Hit Points" }));
    const last = persist.mock.lastCall?.[0];
    expect(last?.answers).toEqual(CLERIC);
    expect(last?.play.hp).toBeGreaterThan(0);
    expect(Object.keys(last?.play ?? {})).toEqual(["hp"]);
  });

  it("starts from the saved marks", () => {
    renderFlow(CLERIC, { hp: 3 });
    expect(screen.getByRole("status", { name: /^Hit Points: 3 of/ })).toBeTruthy();
  });

  it("keeps the marks when an answer that doesn't change the build changes", () => {
    const persist = renderFlow(CLERIC, { hp: 3 });
    fireEvent.click(screen.getByRole("button", { name: /^About you/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bo" } });
    expect(persist.mock.lastCall?.[0]).toMatchObject({ answers: { name: "Bo" }, play: { hp: 3 } });
  });

  it("clears the marks when the class changes", () => {
    const persist = renderFlow(CLERIC, { hp: 3, spent: { slots: 1 } });
    fireEvent.click(screen.getByRole("button", { name: /^Class \(/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Paladin/ }));
    expect(persist.mock.lastCall?.[0]).toMatchObject({
      answers: { classId: "paladin" },
      play: {},
    });
  });
});
