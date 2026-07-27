/**
 * The player's phase-rendering surface (spec §3) — one pure component
 * switching over the full `PlayerSnapshot` union (§4a: lobby, question,
 * reveal, scoreboard, podium, gone), fed by whatever container connects the
 * SSE feed. Kept presentational (snapshot + callbacks in, JSX out) so it's
 * directly unit-testable against hand-built fixtures for every phase.
 *
 * Composition rule for this screen: it's a phone held at arm's length while
 * its owner is really looking at the projected host screen. So the question
 * phase gives the whole viewport to thumb-sized tiles (no chrome competing
 * for it), and every other phase is one big verdict the player can read in the
 * half-second they glance down — the reveal floods the screen with its result
 * colour rather than reporting it in a stat card.
 */
import { useEffect, useRef, useState } from "react";

import { AnswerTile } from "../components/AnswerTile";
import { TimeBar } from "../components/Countdown";
import { CheckMark, CrossMark, FlameMark, MenhirMark } from "../marks";
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
        <section className="player-screen player-screen--lobby">
          <MenhirMark className="lobby-stone" />
          <h1 className="player-verdict">You&apos;re in, {snapshot.you.name}!</h1>
          <p className="player-lede">Watch the big screen.</p>
          <p className="player-count">
            {snapshot.playerCount} player{snapshot.playerCount === 1 ? "" : "s"} in the room
          </p>
        </section>
      );

    case "question": {
      const showWait = snapshot.hasAnswered || chosen !== null;
      return (
        <section className="player-screen player-screen--question">
          <TimeBar
            withNumber
            endsAt={snapshot.endsAt}
            serverNow={snapshot.serverNow}
            receivedAt={receivedAt}
          />
          {showWait ? (
            <div className="locked-in">
              <span className="locked-in-seal">
                {chosen !== null && (
                  <AnswerTile
                    shape={shapeAt(chosen)}
                    selected
                    size="phone"
                    accessibleLabel={`Your answer: ${shapeAt(chosen)}`}
                  />
                )}
              </span>
              <p className="player-verdict player-verdict--muted">Answer locked in</p>
              <p className="player-lede">Watch the big screen!</p>
            </div>
          ) : (
            <>
              <p className="player-prompt">Tap your answer</p>
              <div className="answer-grid answer-grid--phone" data-testid="answer-grid">
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
        <section
          className={`player-screen player-screen--verdict ${
            snapshot.correct ? "player-screen--correct" : "player-screen--wrong"
          }`}
        >
          <span className="verdict-mark">{snapshot.correct ? <CheckMark /> : <CrossMark />}</span>
          <p className="reveal-banner">{snapshot.correct ? "Correct!" : "Not quite"}</p>
          {/* A "+0" is noise on a wrong answer — the flood colour already said it. */}
          {snapshot.pointsGained > 0 && (
            <p className="reveal-points">
              <span className="reveal-points-sign">+</span>
              <strong>{snapshot.pointsGained}</strong>
            </p>
          )}
          {snapshot.streak >= 2 && (
            <p className="streak-flame">
              <FlameMark className="streak-flame-mark" />
              {snapshot.streak} in a row!
            </p>
          )}
          <div className="reveal-stats">
            <div className="reveal-stat">
              <span>Total</span>
              <strong>{snapshot.score}</strong>
            </div>
            <div className="reveal-stat">
              <span>Rank</span>
              <strong>#{snapshot.rank}</strong>
            </div>
          </div>
        </section>
      );

    case "scoreboard":
      return (
        <section className="player-screen">
          <h2 className="stage-heading">Scoreboard</h2>
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
          <p className="player-lede">Waiting for the host to continue…</p>
        </section>
      );

    case "podium":
      return (
        <section className="player-screen player-screen--podium">
          <h1 className="stage-heading stage-heading--podium">Final results</h1>
          {snapshot.aborted && <p className="aborted-banner">The host ended the game early.</p>}
          <p className="your-placement">
            <span>You finished</span>
            <strong className="your-placement-rank">#{snapshot.you.rank}</strong>
            <span>
              with <strong>{snapshot.you.score}</strong> points
            </span>
          </p>
          <ol className="standings-list">
            {snapshot.standings.map((row, index) => (
              <li
                key={row.name}
                className={`standings-row${
                  index + 1 === snapshot.you.rank ? " standings-row--you" : ""
                }`}
              >
                <span className="standings-rank">{index + 1}</span>
                <span className="standings-name">{row.name}</span>
                <span className="standings-score">{row.score}</span>
              </li>
            ))}
          </ol>
        </section>
      );

    case "gone":
      return (
        <section className="gone-screen">
          <MenhirMark className="gone-stone" />
          <h1>This game has ended</h1>
          <p>The room is no longer active — rejoin with a fresh code when the next one starts.</p>
          <button type="button" className="btn" onClick={onRejoin}>
            Back to join screen
          </button>
        </section>
      );
  }
}
