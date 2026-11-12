// The marks on the sheet: Hit Points, pips and pools, all reading one state.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Answers, PlayState } from "@/domain/character";
import { buildCharacter } from "@/domain/engine";

import { CharacterSheet } from "./CharacterSheet";

afterEach(cleanup);

const DONE = { name: "Brakka", look: "Broad.", personality: "Loud." };
const BARBARIAN: Answers = {
  archetype: "warrior",
  classId: "barbarian",
  speciesId: "orc",
  backgroundId: "soldier",
  ...DONE,
};
const CLERIC: Answers = {
  archetype: "healer",
  classId: "cleric",
  speciesId: "human",
  backgroundId: "acolyte",
  ...DONE,
};
const PALADIN: Answers = {
  archetype: "healer",
  classId: "paladin",
  speciesId: "human",
  backgroundId: "noble",
  ...DONE,
};

/** An interactive sheet that keeps its own marks, like the flow does. */
function Playable({ answers, first }: { answers: Answers; first?: PlayState }) {
  const [play, setPlay] = useState<PlayState>(first ?? {});
  return <CharacterSheet character={buildCharacter(answers)} play={play} onPlay={setPlay} />;
}

function box(title: string): HTMLElement {
  const el = screen.getByRole("heading", { name: title }).parentElement;
  if (!el) throw new Error(`no box ${title}`);
  return el;
}

/** The hidden count text each pip group carries ("Rage: 2 of 2 uses left"). */
const counts = (name: RegExp) => screen.getAllByText(name).map((e) => e.textContent);
const hitPoints = () =>
  screen.getByRole("status", { name: /^Hit Points:/ }).getAttribute("aria-label");

describe("Hit Points", () => {
  it("step down and up, held at 0 and at the maximum", () => {
    const max = buildCharacter(BARBARIAN).hitPoints.max;
    render(<Playable answers={BARBARIAN} first={{ hp: 1 }} />);
    const lower = screen.getByRole("button", { name: "Lower Hit Points" });
    const raise = screen.getByRole("button", { name: "Raise Hit Points" });
    expect(hitPoints()).toBe(`Hit Points: 1 of ${max}`);
    fireEvent.click(lower);
    expect(hitPoints()).toBe(`Hit Points: 0 of ${max}`);
    expect(lower.hasAttribute("disabled")).toBe(true);
    for (let n = 0; n < max; n++) fireEvent.click(raise);
    expect(hitPoints()).toBe(`Hit Points: ${max} of ${max}`);
    expect(raise.hasAttribute("disabled")).toBe(true);
    fireEvent.click(lower);
    expect(hitPoints()).toBe(`Hit Points: ${max - 1} of ${max}`);
  });

  it("show a saved number held to the maximum, with no buttons when read-only", () => {
    const c = buildCharacter(BARBARIAN);
    render(<CharacterSheet character={c} play={{ hp: 900 }} />);
    expect(screen.queryByRole("button", { name: /Hit Points/ })).toBeNull();
    expect(screen.getByRole("status", { name: /^Hit Points:/ }).getAttribute("aria-label")).toBe(
      `Hit Points: ${c.hitPoints.max} of ${c.hitPoints.max}`,
    );
  });
});

describe("pips", () => {
  it("use one when a filled pip is pressed and give it back when a hollow one is, in step", () => {
    render(<Playable answers={BARBARIAN} />);
    // Rage shows on the turn and on its card.
    expect(counts(/^Rage:/)).toHaveLength(2);
    for (const t of counts(/^Rage:/)) expect(t).toBe("Rage: 2 of 2 uses left");
    const turnPips = within(box("Your bonus action")).getAllByRole("button", {
      name: /^Rage, use/,
    });
    expect(turnPips).toHaveLength(2);
    fireEvent.click(turnPips[0] as HTMLElement);
    for (const t of counts(/^Rage:/)) expect(t).toBe("Rage: 1 of 2 uses left");
    const hollow = within(box("Your bonus action")).getAllByRole("button", {
      name: /^Rage, use/,
    })[1];
    expect(hollow?.getAttribute("aria-pressed")).toBe("true");
    // The card's pips are the same state.
    const cardPips = screen.getAllByRole("button", { name: /^Rage, use/ });
    expect(cardPips).toHaveLength(4);
    fireEvent.click(cardPips[3] as HTMLElement);
    for (const t of counts(/^Rage:/)) expect(t).toBe("Rage: 2 of 2 uses left");
  });

  it("mark spell slots in Your spells", () => {
    const c = buildCharacter(CLERIC);
    const slots = c.spellcasting[0]?.slots?.[0] ?? 0;
    render(<Playable answers={CLERIC} />);
    const slotsLeft = () =>
      within(box("Cleric spells")).getByText(/^Level 1 spell slots:/).textContent;
    expect(slotsLeft()).toBe(`Level 1 spell slots: ${slots} of ${slots} spell slots left`);
    const pips = within(box("Cleric spells")).getAllByRole("button", {
      name: /^Level 1 spell slots/,
    });
    expect(pips).toHaveLength(slots);
    fireEvent.click(pips[0] as HTMLElement);
    expect(slotsLeft()).toBe(`Level 1 spell slots: ${slots - 1} of ${slots} spell slots left`);
  });

  it("make a pool of a big count, a stepper instead of pips", () => {
    render(<Playable answers={PALADIN} />);
    const turn = screen.getAllByRole("button", { name: "Lower Lay on Hands" })[0];
    expect(turn).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Lay on Hands, / })).toBeNull();
    fireEvent.click(turn as HTMLElement);
    const labels = screen
      .getAllByRole("status", { name: /^Lay on Hands:/ })
      .map((o) => o.getAttribute("aria-label"));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).toBe("Lay on Hands: 9 of 10");
  });

  it("show as plain dots with no buttons when the sheet is read-only", () => {
    render(
      <CharacterSheet
        character={buildCharacter(BARBARIAN)}
        play={{ spent: { "use-barbarian-rage": 1 } }}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Rage, use/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Hit Points/ })).toBeNull();
    const dots = counts(/^Rage:/);
    expect(dots).toHaveLength(2);
    for (const d of dots) expect(d).toBe("Rage: 1 of 2 uses left");
  });
});

describe("the marks are valid HTML", () => {
  it("raise no React warning in an interactive or a read-only sheet (pips sit in paragraphs)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const answers of [PALADIN, CLERIC, BARBARIAN]) {
        const c = buildCharacter(answers);
        const first = render(<Playable answers={answers} />);
        first.unmount();
        const second = render(<CharacterSheet character={c} play={{ hp: 3 }} />);
        second.unmount();
      }
      expect(spy.mock.calls).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
