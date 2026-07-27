// @vitest-environment jsdom
/**
 * Shape-button count mapping (spec S2 test list): the player question screen
 * must render exactly `optionCount` answer tiles, for every option count the
 * quiz schema allows (2-4, D31-4). Each tile's shape comes from the fixed
 * `SHAPES` index mapping (triangle/diamond/circle/square) so this also pins
 * that a 2-option question shows triangle+diamond, not some other pair.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlayerView } from "../../src/player/PlayerView";
import type { PlayerSnapshot } from "../../src/schema";

afterEach(cleanup);

function questionSnapshot(optionCount: number): PlayerSnapshot {
  return {
    type: "state",
    phase: "question",
    code: "ABCD",
    quizTitle: "Test Quiz",
    questionIndex: 0,
    questionCount: 3,
    serverNow: 1000,
    optionCount,
    endsAt: 21000,
    hasAnswered: false,
  };
}

describe("PlayerView question screen — shape-button count mapping", () => {
  it.each([2, 3, 4])("renders exactly %i answer tiles", (optionCount) => {
    render(
      <PlayerView
        snapshot={questionSnapshot(optionCount)}
        receivedAt={performance.now()}
        onAnswer={() => {}}
        onRejoin={() => {}}
      />,
    );
    const grid = screen.getByTestId("answer-grid");
    expect(grid.querySelectorAll("button")).toHaveLength(optionCount);
  });

  it("maps option index to the fixed shape order (triangle, diamond, circle, square)", () => {
    render(
      <PlayerView
        snapshot={questionSnapshot(4)}
        receivedAt={performance.now()}
        onAnswer={() => {}}
        onRejoin={() => {}}
      />,
    );
    const buttons = screen.getByTestId("answer-grid").querySelectorAll("button");
    expect(buttons[0]?.className).toContain("answer-tile--triangle");
    expect(buttons[1]?.className).toContain("answer-tile--diamond");
    expect(buttons[2]?.className).toContain("answer-tile--circle");
    expect(buttons[3]?.className).toContain("answer-tile--square");
  });
});
