// Classes another player holds: greyed out on the class screen, an archetype with none left
// greyed out too, and a class that turns up taken after a save is cleared with a notice.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Answers, PlayState } from "@/domain/character";
import { CONTENT } from "@/domain/content";

import { BuilderFlow } from "./BuilderFlow";

afterEach(cleanup);

function radio(name: RegExp): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("radio", { name });
}

function renderFlow(initial: Answers, taken: Record<string, string>) {
  const persist = vi.fn<(v: { answers: Answers; play: PlayState }) => void>();
  render(
    <BuilderFlow initial={initial} persist={persist} title="Hi" intro="Intro" taken={taken} />,
  );
  return persist;
}

describe("taken classes", () => {
  it("disables a taken class card and shows who holds it", () => {
    renderFlow({ archetype: "warrior" }, { fighter: "Ada" });
    const card = radio(/^Fighter/);
    expect(card.disabled).toBe(true);
    expect(card.closest("label")?.textContent).toContain("Taken by Ada");
    expect(radio(/^Barbarian/).disabled).toBe(false);
  });

  it("disables an archetype whose classes are all taken", () => {
    const warrior = CONTENT.archetypes.find((a) => a.id === "warrior");
    const taken = Object.fromEntries((warrior?.classes ?? []).map((c) => [c, "Ada"]));
    renderFlow({}, taken);
    const tile = radio(/^Warrior/);
    expect(tile.disabled).toBe(true);
    expect(tile.closest("label")?.textContent).toContain("All taken");
    expect(radio(/^Healer/).disabled).toBe(false);
  });

  it("clears a class that shows up as taken and says so", () => {
    const persist = renderFlow({ archetype: "warrior", classId: "fighter" }, { fighter: "Ada" });
    expect(screen.getByRole("status").textContent).toBe(
      "Ada picked Fighter first. Pick another class.",
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0].answers.classId).toBeUndefined();
  });

  it("greys out nothing without a taken map (test mode)", () => {
    render(
      <BuilderFlow initial={{ archetype: "warrior" }} persist={vi.fn()} title="Hi" intro="x" />,
    );
    expect(radio(/^Fighter/).disabled).toBe(false);
  });
});
