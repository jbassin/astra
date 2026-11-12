// The builder's file store under `builder.data-dir`: `roster.json` (the invited players) and
// `characters/<id>.json` (each player's saved answers). Every write goes to a temp file in the
// same directory and is renamed into place, so a reader never sees half a file. Server-only:
// the server functions and the invite script import it, never a route or component.

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  type Answers,
  CharacterDoc,
  PlayerId,
  type PlayState,
  Roster,
  type RosterEntry,
} from "@/domain/character";

/** A save for an id that is not on the roster. */
class UnknownPlayerError extends Error {
  override name = "UnknownPlayerError";
}

/** Writes `data` as JSON to `file` atomically: a temp file beside it, then a rename. */
function writeJsonAtomic(file: string, data: unknown): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** The file's parsed JSON, or `undefined` when it does not exist. */
function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return undefined;
    throw err;
  }
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

/** A new player id: 128 random bits as base64url (22 characters). */
function newPlayerId(): string {
  return randomBytes(16).toString("base64url");
}

export interface BuilderStore {
  readRoster(): Roster;
  findPlayer(id: string): RosterEntry | undefined;
  addPlayer(name: string, now?: Date): RosterEntry;
  readCharacter(id: string): CharacterDoc | undefined;
  /** Writes the answers and, when it has anything in it, the play state. */
  saveCharacter(id: string, answers: Answers, play?: PlayState, now?: Date): CharacterDoc;
}

export function builderStore(dataDir: string): BuilderStore {
  const rosterFile = path.join(dataDir, "roster.json");
  // Only ids that pass PlayerId reach a path, so an id can never leave characters/.
  const characterFile = (id: PlayerId) => path.join(dataDir, "characters", `${id}.json`);

  function readRoster(): Roster {
    return Roster.parse(readJson(rosterFile) ?? []);
  }

  function findPlayer(id: string): RosterEntry | undefined {
    if (!PlayerId.safeParse(id).success) return undefined;
    return readRoster().find((p) => p.id === id);
  }

  return {
    readRoster,
    findPlayer,

    addPlayer(name, now = new Date()) {
      const entry: RosterEntry = {
        id: newPlayerId(),
        name: name.trim(),
        createdAt: now.toISOString(),
      };
      const roster = readRoster();
      writeJsonAtomic(rosterFile, Roster.parse([...roster, entry]));
      return entry;
    },

    readCharacter(id) {
      const player = findPlayer(id);
      // No player, or no file yet: both read as "nothing saved".
      const raw = player ? readJson(characterFile(player.id)) : undefined;
      return raw === undefined ? raw : CharacterDoc.parse(raw);
    },

    saveCharacter(id, answers, play, now = new Date()) {
      const player = findPlayer(id);
      if (!player) throw new UnknownPlayerError("unknown player id");
      // An empty play state stays out of the file.
      const marked = play && (play.hp !== undefined || Object.keys(play.spent ?? {}).length > 0);
      const doc = CharacterDoc.parse({
        schemaVersion: 1,
        updatedAt: now.toISOString(),
        answers,
        ...(marked && { play }),
      });
      writeJsonAtomic(characterFile(player.id), doc);
      return doc;
    },
  };
}
