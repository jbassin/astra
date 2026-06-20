/**
 * Pure message classification + embed/overlay builders — TS port of the formatting in
 * faerrin's `discord/src/handler.rs` (send_die/send_number/handle_save/reseed) and the
 * thumbnail map. No I/O: the gateway ([[gateway.ts]]) feeds these into discord.js.
 *
 * Note: the GSR/Rex/Els/Whiskers goodness banks live in the ontology (K8). The small
 * Knife-host UI strings (number/reseed flavor) are NOT goodness banks — they stay here
 * as bot constants, faithful to faerrin.
 */

import type { RollGoodness } from "./hosts";
import { type Roll, rollText, rollValue } from "./roller";
import type { Profile } from "./roster";

/** Cosmetic seed (K10) — shown in footers, never actually seeds the roller. */
export interface SeedInfo {
  seed: number;
  blameId: number;
  blame: string;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

export function newSeedInfo(profile: Profile): SeedInfo {
  return { seed: randomSeed(), blameId: profile.playerId, blame: profile.playerName };
}

// Knife-host flavor for non-roll messages (not goodness banks — bot constants).
export const NUMBER_LINES: readonly string[] = [
  "mmm makin me do ur math is rude",
  "wowwwww this was so easy i did it with my eyes closed",
  "did u a math just for funsies",
];
export const RESEED_LINES: readonly string[] = [
  "(∩ᵔ ᵕ ᵔ )⊃━☆ﾟ.*+.",
  "gots a new number. totes wont help tho!",
  "lol",
];

const DND_CLASS_THUMBNAILS: Record<string, string> = {
  artificer: "https://i.imgur.com/QXKeVeE.png",
  barbarian: "https://i.imgur.com/izeK1Py.png",
  bard: "https://i.imgur.com/SjD0TDy.png",
  cleric: "https://i.imgur.com/Ns4op2a.png",
  druid: "https://i.imgur.com/mVeBkwF.png",
  dm: "https://i.imgur.com/bYriJqV.png",
  gm: "https://i.imgur.com/bYriJqV.png",
  fighter: "https://i.imgur.com/VmOxMtI.png",
  monk: "https://i.imgur.com/1MzgkLc.png",
  paladin: "https://i.imgur.com/kBoheDD.png",
  ranger: "https://i.imgur.com/oaEAeoQ.png",
  rogue: "https://i.imgur.com/5Dy4qb5.png",
  sorcerer: "https://i.imgur.com/a6mkvD5.png",
  warlock: "https://i.imgur.com/z2BSBPm.png",
  wizard: "https://i.imgur.com/l3BqKMc.png",
};

/** Roll-embed thumbnail — class icon by edition, else the host avatar (the default). */
export function thumbnailFor(
  edition: string | null,
  klass: string | null,
  hostAvatar: string,
): string {
  const c = (klass ?? "").toLowerCase();
  if (edition === "pathfinder_2e") {
    if (c === "dm" || c === "gm") return hostAvatar;
    return `https://2e.aonprd.com/Images/Class/${klass}_Icon.png`;
  }
  if (edition === "dnd_5e" || edition === "one_dnd") {
    return DND_CLASS_THUMBNAILS[c] ?? hostAvatar;
  }
  return hostAvatar;
}

export function dieTitle(characterName: string, value: number, goodness: RollGoodness): string {
  if (goodness === "crit") return `${characterName}: ${value} [Crit!]`;
  if (goodness === "fumble") return `${characterName}: ${value} [Fumble!]`;
  return `${characterName}: ${value}`;
}

export function dieFooter(goodness: RollGoodness, seed: number, blame: string): string {
  switch (goodness) {
    case "crit":
      return `very good • ${seed} (from ${blame}, with love)`;
    case "fumble":
      return `very bad • ${seed} (blame ${blame})`;
    case "good":
      return `good • ${seed} (thank ${blame})`;
    case "bad":
      return `bad • ${seed} (${blame} did this)`;
    case "okay":
      return `okay • ${seed} (by ${blame})`;
  }
}

/** The `Results` field for a roll embed: `` {text} = `{value}` ``. */
export function resultsField(roll: Roll): [string, string] {
  return ["Results", `${rollText(roll)} = \`${rollValue(roll)}\``];
}

/** v1 overlay payload (the weal → weal-overlay wire). */
export interface OverlayPayload {
  v: 1;
  user: string;
  expression: string;
  total: number;
  value: number;
  is_crit: boolean;
  is_fumble: boolean;
}

export function overlayPayload(
  playerName: string,
  roll: Roll,
  goodness: RollGoodness,
): OverlayPayload {
  return {
    v: 1,
    user: playerName,
    expression: rollText(roll),
    total: rollValue(roll),
    value: rollValue(roll),
    is_crit: goodness === "crit",
    is_fumble: goodness === "fumble",
  };
}

// --- classification (port of handler.rs trim + parse_func; plot dropped per K4) ------

function trimStartMatches(s: string, pat: string): string {
  let t = s;
  while (t.startsWith(pat)) t = t.slice(pat.length);
  return t;
}
function trimEndMatches(s: string, pat: string): string {
  let t = s;
  while (t.endsWith(pat)) t = t.slice(0, -pat.length);
  return t;
}

/** `Handler::trim` — strip code-fence / ocaml wrappers (repeatedly), then whitespace. */
export function trimContent(s: string): string {
  let t = s.trim();
  t = trimStartMatches(t, "```");
  t = trimStartMatches(t, "ocaml");
  t = trimEndMatches(t, "```");
  return t.trim();
}

export type MessageAction = { kind: "empty" } | { kind: "reseed" } | { kind: "roll"; text: string };

const FUNC_RE = /^\s*(.+)\((.*)\)\s*$/;

/**
 * Classify a raw message: empty → ignore; `reseed()` → reseed; everything else → a
 * roll attempt. faerrin's `plot(base,interval)` command is dropped (K4 — historical
 * viz moves to akasha-frontend); the in-roller `plot()` builtin still parses as a roll.
 */
export function classify(raw: string): MessageAction {
  const content = trimContent(raw);
  if (content === "") return { kind: "empty" };
  const m = content.match(FUNC_RE);
  if (m && m[1]?.trim() === "reseed") return { kind: "reseed" };
  return { kind: "roll", text: content };
}
