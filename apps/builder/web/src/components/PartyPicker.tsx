// The group page's list: one button-like link per player. A tap remembers the player in this
// browser; a later visit forwards straight to them unless `switching` (the "Not <name>?" link).

import { useEffect } from "react";

import { forget, type PartyMember, readRemembered, remember } from "@/domain/party";

export function PartyPicker({
  word,
  players,
  switching,
  onForward,
  onForgot,
}: {
  word: string;
  players: PartyMember[];
  switching: boolean;
  /** Called with the remembered player's id (the route replaces the URL). Must be stable. */
  onForward: (id: string) => void;
  /** Called after `switching` cleared the remembered player (the route drops `?switch=1`). Stable. */
  onForgot: () => void;
}) {
  // After mount only: the server and the first browser render both show the list.
  useEffect(() => {
    if (switching) {
      forget();
      onForgot();
      return;
    }
    const remembered = readRemembered();
    if (remembered && players.some((p) => p.id === remembered.id)) {
      // Keep the phrase current: a replaced phrase must not leave "Not <name>?" on a dead link.
      remember({ id: remembered.id, word });
      onForward(remembered.id);
    }
  }, [switching, players, word, onForward, onForgot]);

  return (
    <main className="party">
      <h1>Who are you?</h1>
      <ul className="party-list">
        {players.map((p) => (
          <li key={p.id}>
            <a className="button" href={`/c/${p.id}`} onClick={() => remember({ id: p.id, word })}>
              {p.name}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
