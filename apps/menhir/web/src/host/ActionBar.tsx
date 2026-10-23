/**
 * Host controls (spec §3): start/next/end, disabled per phase — `next` is
 * always the D31-3 absolute action (force-closes a live question), `end`
 * works from any non-podium phase. Labels adapt so a room full of players
 * always knows what "next" is about to do.
 */
import type { Phase } from "../game";

export interface ActionBarProps {
  phase: Phase;
  isLastQuestion: boolean;
  onStart: () => void;
  onNext: () => void;
  onEnd: () => void;
}

function nextLabel(phase: Phase, isLastQuestion: boolean): string {
  if (phase === "question") return "Force reveal";
  if (phase === "reveal") return "Show scoreboard";
  if (phase === "scoreboard") return isLastQuestion ? "Show podium" : "Next question";
  return "Next";
}

export function ActionBar({ phase, isLastQuestion, onStart, onNext, onEnd }: ActionBarProps) {
  if (phase === "podium") return null;

  return (
    <div className="action-bar">
      {/* `End game` is destructive and lives one click from the primary control,
       * so it renders as a quiet outline, never a second filled button competing
       * with the action the host actually wants. */}
      <button type="button" className="btn btn-quiet" onClick={onEnd}>
        End game
      </button>
      {phase === "lobby" && (
        <button type="button" className="btn btn-primary" onClick={onStart}>
          Start game
        </button>
      )}
      {phase !== "lobby" && (
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {nextLabel(phase, isLastQuestion)}
        </button>
      )}
    </div>
  );
}
