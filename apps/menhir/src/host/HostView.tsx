/**
 * The host's phase-rendering surface (spec §3) — the desktop/projection
 * counterpart to `player/PlayerView.tsx`, same shape: one pure component
 * switching over the full `HostSnapshot` union (§4a), fed by whatever
 * container owns the SSE connection + host-action dispatch.
 */
import { AnswerTile } from "../components/AnswerTile";
import { Countdown } from "../components/Countdown";
import { QRCodeImage } from "../components/QRCodeImage";
import type { HostSnapshot } from "../schema";
import { ActionBar } from "./ActionBar";

export interface HostViewProps {
  snapshot: HostSnapshot;
  receivedAt: number;
  hasHostToken: boolean;
  actionError: string | null;
  onStart: () => void;
  onNext: () => void;
  onEnd: () => void;
}

export function HostView({
  snapshot,
  receivedAt,
  hasHostToken,
  actionError,
  onStart,
  onNext,
  onEnd,
}: HostViewProps) {
  if (snapshot.phase === "gone") {
    return (
      <div className="host-shell">
        <section className="gone-screen">
          <h1>This game has ended</h1>
          <p>
            The room is no longer active (a redeploy ends any live game — D31-2). Start a new one.
          </p>
          <a className="btn" href="/host">
            Back to quiz picker
          </a>
        </section>
      </div>
    );
  }

  const isLastQuestion = snapshot.questionIndex >= snapshot.questionCount - 1;

  return (
    <div className="host-shell">
      <header>
        <h1 className="menhir-wordmark" style={{ textAlign: "center" }}>
          menhir
        </h1>
        {!hasHostToken && (
          <p className="host-token-banner">
            Read-only view — this browser doesn&apos;t hold host control for room {snapshot.code}.
          </p>
        )}
        {actionError && (
          <p className="host-error" role="alert">
            {actionError}
          </p>
        )}
      </header>

      {snapshot.phase === "lobby" && (
        <section className="player-screen">
          <div className="host-lobby-top">
            <span className="room-code">{snapshot.code}</span>
            <QRCodeImage value={snapshot.joinUrl} size={220} />
          </div>
          <p className="player-count">
            {snapshot.players.length} player{snapshot.players.length === 1 ? "" : "s"} joined
          </p>
          <ul className="name-wall">
            {snapshot.players.map((name) => (
              <li key={name} className="name-chip">
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {snapshot.phase === "question" && (
        <section className="player-screen">
          <div className="host-question-top">
            <span className="ticker">
              {snapshot.answeredCount}/{snapshot.connectedCount} answered
            </span>
            <Countdown
              endsAt={snapshot.endsAt}
              serverNow={snapshot.serverNow}
              receivedAt={receivedAt}
            />
          </div>
          <h2 className="host-question-text">{snapshot.questionText}</h2>
          <div className="answer-grid answer-grid--host">
            {snapshot.options.map((option) => (
              <AnswerTile
                key={option.shape}
                shape={option.shape}
                label={option.label}
                size="host"
                accessibleLabel={option.label}
              />
            ))}
          </div>
        </section>
      )}

      {snapshot.phase === "reveal" && (
        <section className="player-screen">
          <h2 className="host-question-text">{snapshot.questionText}</h2>
          <div className="answer-grid answer-grid--host">
            {snapshot.options.map((option) => (
              <AnswerTile
                key={option.shape}
                shape={option.shape}
                label={option.label}
                count={option.count}
                correct={option.correct}
                dim={!option.correct}
                size="host"
                accessibleLabel={`${option.label}${option.correct ? " — correct" : ""}`}
              />
            ))}
          </div>
        </section>
      )}

      {snapshot.phase === "scoreboard" && (
        <section className="player-screen">
          <h2>Scoreboard</h2>
          <ol className="scoreboard-list">
            {snapshot.top.map((row, index) => (
              <li key={row.name} className="scoreboard-row">
                <span className="scoreboard-rank">#{index + 1}</span>
                <span>{row.name}</span>
                <span className="scoreboard-score">{row.score}</span>
                <span
                  className={`scoreboard-delta${row.delta === 0 ? " scoreboard-delta--zero" : ""}`}
                >
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {snapshot.phase === "podium" && (
        <section className="player-screen">
          <h2>🏆 Final results</h2>
          {snapshot.aborted && <p className="aborted-banner">The host ended the game early.</p>}
          <div className="podium-stage">
            {(
              [
                { row: snapshot.standings[1], heightClass: "podium-pedestal--2", medal: "🥈" },
                { row: snapshot.standings[0], heightClass: "podium-pedestal--1", medal: "🥇" },
                { row: snapshot.standings[2], heightClass: "podium-pedestal--3", medal: "🥉" },
              ] as const
            ).map(({ row, heightClass, medal }) =>
              row ? (
                <div key={row.name} className={`podium-pedestal ${heightClass}`}>
                  <span className="podium-name">{row.name}</span>
                  <span className="podium-score">{row.score}</span>
                  <div className="podium-block">{medal}</div>
                </div>
              ) : null,
            )}
          </div>
          <ol className="standings-list">
            {snapshot.standings.map((row) => (
              <li key={row.name} className="standings-row">
                <span>{row.name}</span>
                <span>{row.score}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <ActionBar
        phase={snapshot.phase}
        isLastQuestion={isLastQuestion}
        onStart={onStart}
        onNext={onNext}
        onEnd={onEnd}
      />
    </div>
  );
}
