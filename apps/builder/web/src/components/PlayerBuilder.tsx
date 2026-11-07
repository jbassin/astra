// The player page's builder: the shared flow with a debounced server save and its indicator.

import type { Answers } from "@/domain/character";
import { saveAnswers } from "@/server/builderFns";

import { BuilderFlow } from "./BuilderFlow";
import { type SaveState, useAutosave } from "./useAutosave";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  pending: "Saving…",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn’t save. Check your connection; your next change tries again.",
};

export function PlayerBuilder({
  id,
  playerName,
  initial,
}: {
  id: string;
  playerName: string;
  initial: Answers;
}) {
  const autosave = useAutosave((next: Answers) => saveAnswers({ data: { id, answers: next } }));
  return (
    <BuilderFlow
      initial={initial}
      persist={autosave.schedule}
      title={`Hi, ${playerName}`}
      intro={
        <>
          Everything saves as you go, so you can close this page and come back to the same link any
          time.{" "}
          <output className="save-state" data-state={autosave.state} title={autosave.error}>
            {SAVE_LABEL[autosave.state]}
          </output>
        </>
      }
    />
  );
}
