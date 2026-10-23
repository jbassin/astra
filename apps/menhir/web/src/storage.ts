/**
 * localStorage persistence (D31-8/D31-9): the player identity `{code,
 * roomNonce, playerId, name}` under `menhir:room` (so a recycled room code
 * can't false-match a stale identity — the nonce is the guard) and the host
 * credential `{code, hostToken}` under `menhir:host`. Every read is
 * defensively shape-checked (a hand-edited or stale-schema localStorage value
 * must never crash the app) and every write is best-effort (private-mode
 * browsers can throw on `setItem`).
 */

const ROOM_KEY = "menhir:room";
const HOST_KEY = "menhir:host";

export interface StoredRoom {
  code: string;
  roomNonce: string;
  playerId: string;
  name: string;
}

export interface StoredHost {
  code: string;
  hostToken: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isStoredRoom(x: unknown): x is StoredRoom {
  return (
    isRecord(x) &&
    typeof x.code === "string" &&
    typeof x.roomNonce === "string" &&
    typeof x.playerId === "string" &&
    typeof x.name === "string"
  );
}

function isStoredHost(x: unknown): x is StoredHost {
  return isRecord(x) && typeof x.code === "string" && typeof x.hostToken === "string";
}

function safeGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort — private-mode/quota errors degrade to "no persistence"
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

export function loadStoredRoom(): StoredRoom | null {
  const value = safeGet(ROOM_KEY);
  return isStoredRoom(value) ? value : null;
}

export function saveStoredRoom(room: StoredRoom): void {
  safeSet(ROOM_KEY, room);
}

export function clearStoredRoom(): void {
  safeRemove(ROOM_KEY);
}

export function loadStoredHost(): StoredHost | null {
  const value = safeGet(HOST_KEY);
  return isStoredHost(value) ? value : null;
}

export function saveStoredHost(host: StoredHost): void {
  safeSet(HOST_KEY, host);
}

export function clearStoredHost(): void {
  safeRemove(HOST_KEY);
}
