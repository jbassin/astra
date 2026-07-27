/**
 * The host's phase-rendering surface (spec §3) — the desktop/projection
 * counterpart to `player/PlayerView.tsx`, same shape: one pure component
 * switching over the full `HostSnapshot` union (§4a), fed by whatever
 * container owns the SSE connection + host-action dispatch.
 *
 * Composition rule for this screen: it is READ FROM ACROSS A ROOM. Every phase
 * is a three-band layout — a thin rail (who / where / how far along), one stage
 * that fills the remaining viewport, and the controls — so the eye lands in the
 * same place every time and nothing important floats in the middle of empty
 * parchment. The rail carries the quiz title and question progress, which the
 * first pass never showed anywhere.
 */
import { AnswerTile } from "../components/AnswerTile";
import { Countdown, TimeBar } from "../components/Countdown";
import { QRCodeImage } from "../components/QRCodeImage";
import { CrownMark } from "../marks";
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

/** "https://menhir.iridi.cc/?code=ABCD" → "menhir.iridi.cc" — the one thing a
 * player in the room needs when they can't scan the QR, and the thing the
 * first pass never put on screen at all. */
function joinHost(joinUrl: string): string | null {
  try {
    return new URL(joinUrl).host;
  } catch {
    return null;
  }
}

function progressLabel(snapshot: Exclude<HostSnapshot, { phase: "gone" }>): string {
  if (snapshot.phase === "lobby") return "Lobby";
  if (snapshot.phase === "podium") return "Final";
  return `Question ${snapshot.questionIndex + 1} of ${snapshot.questionCount}`;
}

const PEDESTALS = ["podium-pedestal--1", "podium-pedestal--2", "podium-pedestal--3"] as const;

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
      <div className="host-shell host-shell--gone">
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
  const revealTotal =
    snapshot.phase === "reveal" ? snapshot.options.reduce((sum, o) => sum + o.count, 0) : 0;

  return (
    <div className={`host-shell host-shell--${snapshot.phase}`}>
      <header className="host-rail">
        <span className="host-rail-mark menhir-wordmark">menhir</span>
        <span className="host-rail-title">{snapshot.quizTitle}</span>
        <span className="host-rail-progress">{progressLabel(snapshot)}</span>
        {snapshot.phase !== "lobby" && snapshot.phase !== "podium" && (
          <span className="host-rail-code">{snapshot.code}</span>
        )}
      </header>

      {(!hasHostToken || actionError) && (
        <div className="host-notices">
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
        </div>
      )}

      {snapshot.phase === "lobby" && (
        <section className="host-stage host-stage--lobby">
          <div className="lobby-invite">
            <p className="lobby-step">
              <span className="lobby-step-index">1</span>
              <span>
                Go to{" "}
                <strong className="lobby-origin">{joinHost(snapshot.joinUrl) ?? "menhir"}</strong>
              </span>
            </p>
            <p className="lobby-step">
              <span className="lobby-step-index">2</span>
              <span>Enter the code</span>
            </p>
            <span className="room-code">{snapshot.code}</span>
          </div>
          <div className="lobby-qr">
            <QRCodeImage value={snapshot.joinUrl} size={380} />
            <p className="lobby-qr-caption">…or scan to join</p>
          </div>
          <div className="lobby-roster">
            <p className="player-count">
              {snapshot.players.length} player{snapshot.players.length === 1 ? "" : "s"} joined
            </p>
            {snapshot.players.length === 0 ? (
              <p className="lobby-empty">Waiting for the first stone to be set…</p>
            ) : (
              <ul className="name-wall">
                {snapshot.players.map((name) => (
                  <li key={name} className="name-chip">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {snapshot.phase === "question" && (
        <section className="host-stage host-stage--question">
          <TimeBar
            endsAt={snapshot.endsAt}
            serverNow={snapshot.serverNow}
            receivedAt={receivedAt}
          />
          <div className="question-head">
            <h2 className="host-question-text">{snapshot.questionText}</h2>
            <div className="question-clock">
              <Countdown
                endsAt={snapshot.endsAt}
                serverNow={snapshot.serverNow}
                receivedAt={receivedAt}
              />
              <span className="ticker">
                {snapshot.answeredCount}/{snapshot.connectedCount} answered
              </span>
            </div>
          </div>
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
        <section className="host-stage host-stage--reveal">
          <div className="question-head question-head--reveal">
            <h2 className="host-question-text host-question-text--reveal">
              {snapshot.questionText}
            </h2>
            <p className="reveal-callout">
              <span className="reveal-callout-label">The answer</span>
              <strong>{snapshot.options.find((o) => o.correct)?.label}</strong>
            </p>
          </div>
          <div className="answer-grid answer-grid--host answer-grid--reveal">
            {snapshot.options.map((option) => (
              <AnswerTile
                key={option.shape}
                shape={option.shape}
                label={option.label}
                count={option.count}
                share={revealTotal > 0 ? option.count / revealTotal : 0}
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
        <section className="host-stage host-stage--scoreboard">
          <h2 className="stage-heading">Scoreboard</h2>
          <ol className="scoreboard-list">
            {snapshot.top.map((row, index) => (
              <li
                key={row.name}
                className={`scoreboard-row${index === 0 ? " scoreboard-row--leader" : ""}`}
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <span className="scoreboard-rank">{index + 1}</span>
                <span className="scoreboard-name">{row.name}</span>
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
        <section className="host-stage host-stage--podium">
          <h2 className="stage-heading stage-heading--podium">Final results</h2>
          {snapshot.aborted && <p className="aborted-banner">The host ended the game early.</p>}
          <div className="podium-stage">
            {(
              [
                { row: snapshot.standings[1], place: 1 },
                { row: snapshot.standings[0], place: 0 },
                { row: snapshot.standings[2], place: 2 },
              ] as const
            ).map(({ row, place }) =>
              row ? (
                <div key={row.name} className={`podium-pedestal ${PEDESTALS[place]}`}>
                  {place === 0 && <CrownMark className="podium-crown" />}
                  <span className="podium-name">{row.name}</span>
                  <span className="podium-score">{row.score}</span>
                  <div className="podium-block">
                    <span className="podium-place">{place + 1}</span>
                  </div>
                </div>
              ) : null,
            )}
          </div>
          <ol className="standings-list">
            {snapshot.standings.map((row, index) => (
              <li key={row.name} className="standings-row">
                <span className="standings-rank">{index + 1}</span>
                <span className="standings-name">{row.name}</span>
                <span className="standings-score">{row.score}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="host-controls">
        <ActionBar
          phase={snapshot.phase}
          isLastQuestion={isLastQuestion}
          onStart={onStart}
          onNext={onNext}
          onEnd={onEnd}
        />
      </footer>
    </div>
  );
}
