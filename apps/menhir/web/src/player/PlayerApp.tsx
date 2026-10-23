/**
 * The player container (`/` — spec §3): owns the join flow, localStorage
 * re-attach (D31-9 branch 1 — silent, on mount, off whatever `menhir:room`
 * holds), and the SSE connection once joined. `PlayerView` stays pure;
 * this is the only place that touches `api.ts`/`storage.ts`/network.
 */
import { useEffect, useMemo, useState } from "react";

import { joinGame, sendAnswer } from "../api";
import { codeFromQuery } from "../router";
import { PlayerSnapshotSchema } from "../schema";
import { clearStoredRoom, loadStoredRoom, saveStoredRoom, type StoredRoom } from "../storage";
import { useEventStream } from "../useEventStream";
import { JoinCard } from "./JoinCard";
import { PlayerView } from "./PlayerView";

type ClientState =
  | { kind: "join"; pending: boolean; error: string | null }
  | { kind: "playing"; room: StoredRoom };

function ConnectingScreen() {
  return <div className="connecting-screen">Connecting…</div>;
}

function PlayerGameConnection({ room, onGone }: { room: StoredRoom; onGone: () => void }) {
  const url = useMemo(
    () =>
      `/api/events/${encodeURIComponent(room.code)}?role=player&playerId=${encodeURIComponent(room.playerId)}`,
    [room.code, room.playerId],
  );
  const { snapshot, receivedAt } = useEventStream(url, PlayerSnapshotSchema);

  if (!snapshot) return <ConnectingScreen />;
  return (
    <PlayerView
      snapshot={snapshot}
      receivedAt={receivedAt}
      onAnswer={(option) => {
        void sendAnswer(room.code, { playerId: room.playerId, option });
      }}
      onRejoin={onGone}
    />
  );
}

export function PlayerApp() {
  const [initialRoom] = useState(() => loadStoredRoom());
  const [state, setState] = useState<ClientState>(() =>
    initialRoom
      ? { kind: "playing", room: initialRoom }
      : { kind: "join", pending: false, error: null },
  );

  // D31-9 branch 1 — silent re-attach on mount for whatever room was stored,
  // one shot (this effect never re-runs; `initialRoom` is a stable useState
  // value). A failed re-attach (unknown code / rejected) drops back to a
  // fresh join card rather than surfacing an error — the stored identity is
  // simply stale.
  useEffect(() => {
    if (!initialRoom) return;
    let cancelled = false;
    void joinGame(initialRoom.code, {
      name: initialRoom.name,
      playerId: initialRoom.playerId,
      roomNonce: initialRoom.roomNonce,
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        clearStoredRoom();
        setState({ kind: "join", pending: false, error: null });
        return;
      }
      const room: StoredRoom = {
        code: initialRoom.code,
        roomNonce: res.data.roomNonce,
        playerId: res.data.playerId,
        name: initialRoom.name,
      };
      saveStoredRoom(room);
      setState({ kind: "playing", room });
    });
    return () => {
      cancelled = true;
    };
  }, [initialRoom]);

  if (state.kind === "join") {
    return (
      <div className="player-shell">
        <JoinCard
          initialCode={codeFromQuery(window.location.search)}
          pending={state.pending}
          error={state.error}
          onJoin={(code, name) => {
            setState({ kind: "join", pending: true, error: null });
            void joinGame(code, { name }).then((res) => {
              if (!res.ok) {
                setState({ kind: "join", pending: false, error: res.error });
                return;
              }
              const room: StoredRoom = {
                code,
                roomNonce: res.data.roomNonce,
                playerId: res.data.playerId,
                name,
              };
              saveStoredRoom(room);
              setState({ kind: "playing", room });
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="player-shell">
      <PlayerGameConnection
        room={state.room}
        onGone={() => {
          clearStoredRoom();
          setState({ kind: "join", pending: false, error: null });
        }}
      />
    </div>
  );
}
