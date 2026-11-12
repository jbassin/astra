// The marks on a sheet, for every part of it that shows one. `CharacterSheet` provides the saved
// state and, when the sheet is interactive, how to change it; a part read inside no provider
// shows nothing marked and no controls. Every pip and stepper reads the same state, so the turn
// entry, the spells section and the card agree.

import { createContext, useContext } from "react";

import type { PlayState } from "@/domain/character";

interface PlayValue {
  play: PlayState;
  /** Set on the player page and `/test`; without it the sheet is read-only. */
  onPlay?: (next: PlayState) => void;
}

export const PlayContext = createContext<PlayValue>({ play: {} });

export function usePlay(): PlayValue {
  return useContext(PlayContext);
}
