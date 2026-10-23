// @vitest-environment jsdom
/**
 * Phase rendering across the union (spec S2 test list): `PlayerView` and
 * `HostView` each switch over the FULL snapshot union (§4a — lobby, question,
 * reveal, scoreboard, podium, gone). Every fixture here is parsed through the
 * real Zod schema before rendering, so a schema drift (a renamed/removed
 * field) fails this test instead of silently rendering `undefined`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HostView } from "../../src/host/HostView";
import { PlayerView } from "../../src/player/PlayerView";
import {
  HostSnapshotSchema,
  type HostSnapshot,
  PlayerSnapshotSchema,
  type PlayerSnapshot,
} from "../../src/schema";

afterEach(cleanup);

const noop = () => {};

function parsePlayer(raw: unknown): PlayerSnapshot {
  return PlayerSnapshotSchema.parse(raw);
}

function parseHost(raw: unknown): HostSnapshot {
  return HostSnapshotSchema.parse(raw);
}

const COMMON = {
  type: "state" as const,
  code: "ABCD",
  quizTitle: "Test Quiz",
  questionIndex: 1,
  questionCount: 3,
  serverNow: 5000,
};

describe("PlayerView — every phase in the union renders", () => {
  it("lobby", () => {
    render(
      <PlayerView
        snapshot={parsePlayer({
          ...COMMON,
          phase: "lobby",
          you: { name: "Ozzie" },
          playerCount: 4,
        })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={noop}
      />,
    );
    expect(screen.getByText(/You're in, Ozzie/)).toBeTruthy();
    expect(screen.getByText("4 players in the room")).toBeTruthy();
  });

  it("question (not yet answered)", () => {
    render(
      <PlayerView
        snapshot={parsePlayer({
          ...COMMON,
          phase: "question",
          optionCount: 3,
          endsAt: 20000,
          hasAnswered: false,
        })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={noop}
      />,
    );
    expect(screen.getByTestId("answer-grid").querySelectorAll("button")).toHaveLength(3);
  });

  it("question (already answered — the wait screen, not the tiles)", () => {
    render(
      <PlayerView
        snapshot={parsePlayer({
          ...COMMON,
          phase: "question",
          optionCount: 3,
          endsAt: 20000,
          hasAnswered: true,
        })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={noop}
      />,
    );
    expect(screen.queryByTestId("answer-grid")).toBeNull();
    expect(screen.getByText(/Answer locked in/)).toBeTruthy();
  });

  it("reveal", () => {
    render(
      <PlayerView
        snapshot={parsePlayer({
          ...COMMON,
          phase: "reveal",
          correct: true,
          pointsGained: 850,
          score: 1200,
          rank: 1,
          streak: 3,
        })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={noop}
      />,
    );
    expect(screen.getByText("Correct!")).toBeTruthy();
    expect(screen.getByText("850")).toBeTruthy();
    expect(screen.getByText(/in a row/)).toBeTruthy();
  });

  it("scoreboard", () => {
    render(
      <PlayerView
        snapshot={parsePlayer({ ...COMMON, phase: "scoreboard", score: 900, rank: 2 })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={noop}
      />,
    );
    expect(screen.getByText("#2")).toBeTruthy();
  });

  it("podium", () => {
    render(
      <PlayerView
        snapshot={parsePlayer({
          ...COMMON,
          phase: "podium",
          standings: [{ name: "Ozzie", score: 2000 }],
          aborted: false,
          you: { rank: 1, score: 2000 },
        })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={noop}
      />,
    );
    expect(screen.getByText(/Final results/)).toBeTruthy();
  });

  it("gone", () => {
    const onRejoin = vi.fn();
    render(
      <PlayerView
        snapshot={parsePlayer({ phase: "gone" })}
        receivedAt={performance.now()}
        onAnswer={noop}
        onRejoin={onRejoin}
      />,
    );
    screen.getByRole("button", { name: "Back to join screen" }).click();
    expect(onRejoin).toHaveBeenCalledOnce();
  });
});

const hostViewDefaults = {
  receivedAt: 0,
  hasHostToken: true,
  actionError: null,
  onStart: noop,
  onNext: noop,
  onEnd: noop,
};

describe("HostView — every phase in the union renders", () => {
  it("lobby", () => {
    render(
      <HostView
        snapshot={parseHost({
          ...COMMON,
          phase: "lobby",
          players: ["Ozzie", "Argyle"],
          joinUrl: "https://menhir.iridi.cc/?code=ABCD",
        })}
        {...hostViewDefaults}
      />,
    );
    expect(screen.getByText("ABCD")).toBeTruthy();
    expect(screen.getByText("Ozzie")).toBeTruthy();
    expect(screen.getByText("2 players joined")).toBeTruthy();
  });

  it("question", () => {
    render(
      <HostView
        snapshot={parseHost({
          ...COMMON,
          phase: "question",
          questionText: "Who yoinked the sandwich?",
          options: [
            { label: "Ozzie", shape: "triangle" },
            { label: "Argyle", shape: "diamond" },
          ],
          endsAt: 20000,
          answeredCount: 1,
          connectedCount: 2,
        })}
        {...hostViewDefaults}
      />,
    );
    expect(screen.getByText("Who yoinked the sandwich?")).toBeTruthy();
    expect(screen.getByText("1/2 answered")).toBeTruthy();
  });

  it("reveal", () => {
    render(
      <HostView
        snapshot={parseHost({
          ...COMMON,
          phase: "reveal",
          questionText: "Who yoinked the sandwich?",
          options: [
            { label: "Ozzie", shape: "triangle", correct: true, count: 3 },
            { label: "Argyle", shape: "diamond", correct: false, count: 1 },
          ],
        })}
        {...hostViewDefaults}
      />,
    );
    const correctTile = screen.getByRole("button", { name: "Ozzie — correct" });
    expect(correctTile.className).toContain("answer-tile--correct");
  });

  it("scoreboard", () => {
    render(
      <HostView
        snapshot={parseHost({
          ...COMMON,
          phase: "scoreboard",
          top: [{ name: "Ozzie", score: 900, delta: 850 }],
        })}
        {...hostViewDefaults}
      />,
    );
    expect(screen.getByText("+850")).toBeTruthy();
  });

  it("podium", () => {
    render(
      <HostView
        snapshot={parseHost({
          ...COMMON,
          phase: "podium",
          standings: [{ name: "Ozzie", score: 900 }],
          aborted: true,
        })}
        {...hostViewDefaults}
      />,
    );
    expect(screen.getByText(/ended the game early/)).toBeTruthy();
  });

  it("gone", () => {
    render(<HostView snapshot={parseHost({ phase: "gone" })} {...hostViewDefaults} />);
    expect(screen.getByText("This game has ended")).toBeTruthy();
  });
});
