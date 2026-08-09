/**
 * Pure message classification + embed/overlay builders. Classification (trim +
 * reseed detection) is the faerrin port, unchanged; the builders are rewired
 * off `@astra/weal-engine`'s display contract (spec 0032 D32-15/D32-18).
 *
 * Every builder that feeds an embed clamps defensively to Discord's limits
 * (title 256 / field value 1024 — D32-15): the engine caps headline ≤ 80 and
 * renderText ≤ 900 in-engine, but the bot never trusts that at the seam.
 *
 * Note: the GSR/Rex/Els/Whiskers goodness banks live in the ontology (K8). The
 * small Knife-host UI strings (number/reseed flavor) are NOT goodness banks —
 * they stay here as bot constants, faithful to faerrin.
 */

import type { WealDieDisplay, WealGoodness, WealSpan } from "@astra/weal-engine";

import type { Profile } from "./roster";

/** Cosmetic seed (K10) — shown in footers, never actually seeds the engine. */
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

// --- defensive truncation (D32-15) ---------------------------------------------------

/** Discord's embed-title limit. */
export const TITLE_LIMIT = 256;
/** Discord's embed-field-value limit. */
export const FIELD_LIMIT = 1024;

/** Clamp to `max` chars INCLUSIVE, replacing the tail with an ellipsis. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// --- roll-embed builders (D32-15) ----------------------------------------------------

/** `{characterName}: {headline}` + tag; null goodness = no tag (D32-11). */
export function dieTitle(
  characterName: string,
  headline: string,
  goodness: WealGoodness | null,
): string {
  const base = `${characterName}: ${headline}`;
  if (goodness === "crit") return truncate(`${base} [Crit!]`, TITLE_LIMIT);
  if (goodness === "fumble") return truncate(`${base} [Fumble!]`, TITLE_LIMIT);
  return truncate(base, TITLE_LIMIT);
}

/** Footer takes the goodness word; null → "okay" (D32-15). */
export function dieFooter(goodness: WealGoodness | null, seed: number, blame: string): string {
  switch (goodness ?? "okay") {
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

/** The `Results` field for a roll embed: `` {renderText} = `{headline}` ``. */
export function resultsField(display: WealDieDisplay): [string, string] {
  return ["Results", truncate(`${display.renderText} = \`${display.headline}\``, FIELD_LIMIT)];
}

// --- error reply (D32-14) ------------------------------------------------------------

/**
 * The source line containing the span, with a caret line under the span.
 * A zero-width span (end-of-input errors) still draws one caret.
 */
export function spanExcerpt(source: string, span: WealSpan): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, span.start - 1)) + 1;
  const newline = source.indexOf("\n", span.start);
  const lineEnd = newline === -1 ? source.length : newline;
  const line = source.slice(lineStart, lineEnd);
  const caretStart = Math.min(span.start, lineEnd) - lineStart;
  const caretLen = Math.max(1, Math.min(span.end, lineEnd) - span.start);
  return `${line}\n${" ".repeat(caretStart)}${"^".repeat(caretLen)}`;
}

/** Code-fence `text` with a delimiter longer than any backtick run inside it. */
export function fenced(text: string): string {
  let longest = 2;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const delimiter = "`".repeat(longest + 1);
  return `${delimiter}\n${text}\n${delimiter}`;
}

/**
 * The visible-error description: the engine message, a fenced span excerpt
 * (when a span is present), and `(in {name})` for prelude errors. A prelude
 * span points into the failing SAVE's source (D32-11), so callers pass the
 * saves list and the excerpt is drawn from that source, not the message.
 */
export function errorDescription(
  source: string,
  err: { stage: string; message: string; span: WealSpan | null; preludeName: string | null },
  saves: readonly [string, string][] = [],
): string {
  const spanSource =
    err.stage === "prelude"
      ? (saves.find(([name]) => name === err.preludeName)?.[1] ?? null)
      : source;
  const parts = [err.message];
  if (err.span !== null && spanSource !== null)
    parts.push(fenced(spanExcerpt(spanSource, err.span)));
  if (err.stage === "prelude" && err.preludeName !== null) parts.push(`(in ${err.preludeName})`);
  return parts.join("\n");
}

// --- overlay payload (D32-18) --------------------------------------------------------

/** v1 overlay payload + the v2 `display` headline (the weal → weal-overlay wire). */
export interface OverlayPayload {
  v: 1;
  user: string;
  expression: string;
  total: number;
  value: number;
  is_crit: boolean;
  is_fumble: boolean;
  display: string;
}

/**
 * Numeric rolls keep the v1 shape + `display`; atom (non-numeric) rolls send
 * `total: 0` / `value: 0` with goodness-derived flags. `expression` is the
 * PLAIN SOURCE TEXT, never renderText (OBS would show raw `~~`/`⟪⟫`).
 */
export function overlayPayload(
  playerName: string,
  source: string,
  display: WealDieDisplay,
): OverlayPayload {
  const numeric =
    display.value.t === "num" || display.value.t === "dec" || display.value.t === "float";
  const parsed = numeric ? Number(display.value.v) : 0;
  const total = Number.isFinite(parsed) ? parsed : 0;
  return {
    v: 1,
    user: playerName,
    expression: source,
    total,
    value: total,
    is_crit: display.goodness === "crit",
    is_fumble: display.goodness === "fumble",
    display: display.headline,
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
 * viz moves to akasha-frontend); the in-engine `plot()` builtin still classifies as
 * a roll.
 */
export function classify(raw: string): MessageAction {
  const content = trimContent(raw);
  if (content === "") return { kind: "empty" };
  const m = content.match(FUNC_RE);
  if (m && m[1]?.trim() === "reseed") return { kind: "reseed" };
  return { kind: "roll", text: content };
}
