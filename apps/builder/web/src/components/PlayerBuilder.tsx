// The player page's builder: the shared flow with a debounced server save and its indicator.

import { useState } from "react";

import type { Answers, PlayState } from "@/domain/character";
import type { IconName } from "@/generated/icons";
import type { TakenClasses } from "@/server/builder";
import { saveAnswers } from "@/server/builderFns";
import { Icon } from "@/ui/Icon";

import { BuilderFlow } from "./BuilderFlow";
import { NotYou } from "./NotYou";
import { type SaveState, useAutosave } from "./useAutosave";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Saves as you go",
  pending: "Saving…",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn’t save. Check your connection; your next change tries again.",
};

const SAVE_ICON: Record<SaveState, IconName> = {
  idle: "ui-cloud-check",
  pending: "ui-loader-circle",
  saving: "ui-loader-circle",
  saved: "ui-cloud-check",
  error: "ui-cloud-off",
};

export function PlayerBuilder({
  id,
  playerName,
  initial,
  initialPlay,
  taken: firstTaken,
}: {
  id: string;
  playerName: string;
  initial: Answers;
  initialPlay?: PlayState;
  taken: TakenClasses;
}) {
  // Every save answers with the fresh map, so a class someone just took greys out here too.
  const [taken, setTaken] = useState(firstTaken);
  const autosave = useAutosave(async (next: { answers: Answers; play: PlayState }) => {
    const res = await saveAnswers({ data: { id, ...next } });
    setTaken(res.taken);
  });
  return (
    <BuilderFlow
      initial={initial}
      initialPlay={initialPlay}
      taken={taken}
      persist={autosave.schedule}
      title={`Hi, ${playerName}`}
      intro={
        <>
          <p>
            Everything saves as you go, so you can close this page and come back to the same link
            any time.
          </p>
          <NotYou id={id} name={playerName} />
        </>
      }
      status={
        <output className="save-state" data-state={autosave.state} title={autosave.error}>
          <Icon name={SAVE_ICON[autosave.state]} />
          <span>{SAVE_LABEL[autosave.state]}</span>
        </output>
      }
    />
  );
}
