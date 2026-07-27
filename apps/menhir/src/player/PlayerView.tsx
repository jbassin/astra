/**
 * The player's phase-rendering surface (spec §3) — one pure component
 * switching over the full `PlayerSnapshot` union (§4a: lobby, question,
 * reveal, scoreboard, podium, gone), fed by whatever container connects the
 * SSE feed. Kept presentational (snapshot + callbacks in, JSX out) so it's
 * directly unit-testable against hand-built fixtures for every phase.
 */
import { useEffect, useRef, useState } from "react";

import { AnswerTile } from "../components/AnswerTile";
import { Countdown } from "../components/Countdown";
import type { PlayerSnapshot } from "../schema";
import { shapeAt } from "../shapes";

export interface PlayerViewProps {
  snapshot: PlayerSnapshot;
  receivedAt: number;
  onAnswer: (option: number) => void;
  onRejoin: () => void;
}

export function PlayerView({ snapshot, receivedAt, onAnswer, onRejoin }: PlayerViewProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const lastIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (snapshot.phase !== "question") return;
    if (lastIndexRef.current === snapshot.questionIndex) return;
    lastIndexRef.current = snapshot.questionIndex;
    setChosen(null);
  }, [snapshot]);

  switch (snapshot.phase) {
    case "lobby":
      return (
        <section className="player-screen">
          <h1 className="menhir-wordmark">menhir</h1>
          <p>You&apos;re in, {snapshot.you.name}! Watch the big screen.</p>
          <p className="player-count">
            {snapshot.playerCount} player{snapshot.playerCount === 1 ? "" : "s"} in the room
          </p>
        </section>
      );

    case "question": {
      const showWait = snapshot.hasAnswered || chosen !== null;
      return (
        <section className="player-screen">
          <Countdown
            endsAt={snapshot.endsAt}
            serverNow={snapshot.serverNow}
            receivedAt={receivedAt}
          />
          {showWait ? (
            <p>Answer locked in — watch the big screen!</p>
          ) : (
            <>
              <p>Tap your answer</p>
              <div className="answer-grid" data-testid="answer-grid">
                {Array.from({ length: snapshot.optionCount }, (_, index) => {
                  const shape = shapeAt(index);
                  return (
                    <AnswerTile
                      key={shape}
                      shape={shape}
                      size="phone"
                      accessibleLabel={`Answer ${index + 1}: ${shape}`}
                      onClick={() => {
                        setChosen(index);
                        onAnswer(index);
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </section>
      );
    }

    case "reveal":
      return (
        <section className="player-screen">
          <p
            className={`reveal-banner ${snapshot.correct ? "reveal-banner--correct" : "reveal-banner--wrong"}`}
          >
            {snapshot.correct ? "Correct!" : "Not quite"}
          </p>
          <div className="reveal-stats">
            <div className="reveal-stat">
              <span>+points</span>
              <strong>{snapshot.pointsGained}</strong>
            </div>
            <div className="reveal-stat">
              <span>Total</span>
              <strong>{snapshot.score}</strong>
            </div>
            <div className="reveal-stat">
              <span>Rank</span>
              <strong>#{snapshot.rank}</strong>
            </div>
          </div>
          {snapshot.streak >= 2 && <p className="streak-flame">🔥 {snapshot.streak} in a row!</p>}
        </section>
      );

    case "scoreboard":
      return (
        <section className="player-screen">
          <h2>Scoreboard</h2>
          <div className="reveal-stats">
            <div className="reveal-stat">
              <span>Score</span>
              <strong>{snapshot.score}</strong>
            </div>
            <div className="reveal-stat">
              <span>Rank</span>
              <strong>#{snapshot.rank}</strong>
            </div>
          </div>
          <p>Waiting for the host to continue…</p>
        </section>
      );

    case "podium":
      return (
        <section className="player-screen">
          <h1>🏆 Final results</h1>
          {snapshot.aborted && <p className="aborted-banner">The host ended the game early.</p>}
          <p className="reveal-stat">
            You finished <strong>#{snapshot.you.rank}</strong> with{" "}
            <strong>{snapshot.you.score}</strong> points
          </p>
          <ol className="standings-list">
            {snapshot.standings.map((row) => (
              <li key={row.name} className="standings-row">
                <span>{row.name}</span>
                <span>{row.score}</span>
              </li>
            ))}
          </ol>
        </section>
      );

    case "gone":
      return (
        <section className="gone-screen">
          <h1>This game has ended</h1>
          <p>The room is no longer active — rejoin with a fresh code when the next one starts.</p>
          <button type="button" className="btn" onClick={onRejoin}>
            Back to join screen
          </button>
        </section>
      );
  }
}
