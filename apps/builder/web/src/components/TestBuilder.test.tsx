// Test mode must never reach the server. The save server function is replaced by a spy, and
// the player page's builder is the control: the same clicks there do save.

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveAnswers = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ updatedAt: "2026-11-07T00:00:00.000Z", taken: {} })),
);
vi.mock("@/server/builderFns", () => ({ saveAnswers }));

import { PlayerBuilder } from "./PlayerBuilder";
import { TestBuilder } from "./TestBuilder";

beforeEach(() => {
  vi.useFakeTimers();
  saveAnswers.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function pickAFewThings() {
  fireEvent.click(screen.getByRole("radio", { name: /^Warrior/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
  fireEvent.click(screen.getByRole("radio", { name: /^Fighter/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Your sheet/ }));
  await act(() => vi.advanceTimersByTimeAsync(5000));
}

describe("test mode", () => {
  it("runs the flow without ever calling the save server function", async () => {
    render(<TestBuilder />);
    expect(screen.getByText("Test mode — nothing is saved.")).toBeTruthy();
    await pickAFewThings();
    expect(screen.getByText("Still to choose")).toBeTruthy();
    expect(saveAnswers).not.toHaveBeenCalled();
  });

  it("starts over with empty answers", () => {
    render(<TestBuilder />);
    fireEvent.click(screen.getByRole("radio", { name: /^Warrior/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    const warrior = screen.getByRole("radio", { name: /^Warrior/ });
    expect(warrior instanceof HTMLInputElement && warrior.checked).toBe(false);
    expect(saveAnswers).not.toHaveBeenCalled();
  });

  it("doesn't import the server functions at all", () => {
    const source = readFileSync(path.join(import.meta.dirname, "TestBuilder.tsx"), "utf8");
    expect(source).not.toMatch(/server\/builderFns|createServerFn/);
  });
});

describe("the player page, for contrast", () => {
  it("saves the same clicks for the player's id", async () => {
    render(<PlayerBuilder id="SmokeTestPlayer0000000" playerName="Ada" initial={{}} taken={{}} />);
    await pickAFewThings();
    expect(saveAnswers).toHaveBeenCalledWith({
      data: { id: "SmokeTestPlayer0000000", answers: { archetype: "warrior", classId: "fighter" } },
    });
  });
});
