/**
 * Pure message classification + embed/overlay builders. Classification (trim +
 * reseed detection) is the faerrin port, unchanged; the builders are rewired
 * off `@astra/weal-engine`'s display contract.
 *
 * Every builder that feeds an embed clamps defensively to Discord's limits
 * (title 256 / field value 1024): the engine caps headline ≤ 80 and
 * renderText ≤ 900 in-engine, but the bot never trusts that at the seam.
 *
 * Note: the GSR/Rex/Els/Whiskers goodness banks live in the ontology. The
 * small Knife-host UI strings (number/reseed flavor) are NOT goodness banks —
 * they stay here as bot constants, faithful to faerrin.
 */

import type { WealDieDisplay, WealGoodness, WealSpan } from "@astra/weal-engine";
import { type RollMessage, RollMessageSchema } from "@astra/weal-wire";

import type { SaveRefusal } from "./engine";
import type { Profile } from "./roster";

/** Cosmetic seed — shown in footers, never actually seeds the engine. */
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

// --- defensive truncation -----------------------------------------------------------

/** Discord's embed-title limit. */
export const TITLE_LIMIT = 256;
/** Discord's embed-field-value limit. */
export const FIELD_LIMIT = 1024;
/** Discord's embed-description limit. */
export const DESCRIPTION_LIMIT = 4096;

/**
 * What players see for an engine fault (`stage:"internal"`). It is generic on
 * purpose: the detail is logged at ERROR for the operator, not posted.
 */
export const ENGINE_FAULT_TITLE = "engine fault";
export const ENGINE_FAULT_LINE = "something broke deep in the dice machinery — it's been reported";

/** Clamp to `max` chars INCLUSIVE, replacing the tail with an ellipsis. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// --- roll-embed builders ------------------------------------------------------------

/** `{characterName}: {headline}` + tag; null goodness = no tag. */
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

/** Footer takes the goodness word; null → "okay". */
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

/**
 * The `Results` field for a roll embed: the render trace with its final value
 * backticked — `` 4d6 ⟪6,~~1~~,3,6⟫kh3 = `15` ``. The engine's renderText already
 * ends in `= {headline}`, so naively appending `` = `{headline}` `` would double
 * the value; strip the trailing plain value and re-append it backticked.
 * Falls back to the naive form if the tail ever diverges.
 */
export function resultsField(display: WealDieDisplay): [string, string] {
  const tail = ` = ${display.headline}`;
  const text = display.renderText.endsWith(tail)
    ? `${display.renderText.slice(0, -tail.length)} = \`${display.headline}\``
    : `${display.renderText} = \`${display.headline}\``;
  return ["Results", truncate(text, FIELD_LIMIT)];
}

// --- error reply --------------------------------------------------------------------

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
 * span points into the failing SAVE's source, so callers pass the
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

// --- save refusal (the save guard) ---------------------------------------------------

/**
 * The Knife's reply when the save guard refuses a save: what was refused and
 * why, the engine's error, and a hint when the fix is known.
 */
export function saveRefusal(
  playerName: string,
  name: string,
  source: string,
  refusal: SaveRefusal,
): { title: string; contents: string } {
  const lead = `nope ${playerName.toLowerCase()}, i won't remember \`${name}\``;
  const lines = [
    refusal.kind === "rolls"
      ? `${lead} — with it saved, \`${refusal.probe}\` would break for everyone:`
      : `${lead} — using it (\`${refusal.probe}\`) trips a bug in the dice engine:`,
  ];
  if (refusal.error.stage === "internal") {
    // An engine fault: the detail goes to the operator log, not the channel.
    lines.push(ENGINE_FAULT_LINE);
  } else {
    // A prelude error here can only be the new save (every other save loads
    // the same with or without it), so its span points into `source`.
    lines.push(errorDescription(refusal.probe, refusal.error, [[name, source]]));
  }
  if (refusal.shadowsBuiltin) lines.push(`\`${name}\` is a built-in — save under another name`);
  return {
    title: truncate(`${name} not saved`, TITLE_LIMIT),
    contents: truncate(lines.join("\n"), DESCRIPTION_LIMIT),
  };
}

// --- overlay payload ----------------------------------------------------------------

/**
 * The roll message weal-overlay shows, built through the shared wire schema
 * (`@astra/weal-wire`), so a shape the overlay would reject fails here first.
 * Atom (non-numeric) rolls send `total: 0` with goodness-derived flags.
 * `expression` is the PLAIN SOURCE TEXT, never renderText (OBS would show raw
 * `~~`/`⟪⟫`).
 */
export function overlayPayload(
  playerName: string,
  source: string,
  display: WealDieDisplay,
): RollMessage {
  const numeric =
    display.value.t === "num" || display.value.t === "dec" || display.value.t === "float";
  const parsed = numeric ? Number(display.value.v) : 0;
  const total = Number.isFinite(parsed) ? parsed : 0;
  return RollMessageSchema.parse({
    v: 1,
    user: playerName,
    expression: source,
    total,
    is_crit: display.goodness === "crit",
    is_fumble: display.goodness === "fumble",
    display: display.headline,
  });
}

// --- classification (port of handler.rs trim + parse_func, minus plot) --------------

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

/** A code fence's language tag: one lowercase word alone on the fence's first line. */
const FENCE_LANG_RE = /^[a-z]+[ \t]*\r?\n/;

/**
 * `Handler::trim` — strip code-fence wrappers (repeatedly), the fence's
 * language tag (any one word, so a pasted ```` ```weal ```` save confirmation
 * rolls), a leading `ocaml` (v1 habit), then whitespace.
 */
export function trimContent(s: string): string {
  let t = s.trim();
  const isFenced = t.startsWith("```");
  t = trimStartMatches(t, "```");
  if (isFenced) t = t.replace(FENCE_LANG_RE, "");
  t = trimStartMatches(t, "ocaml");
  t = trimEndMatches(t, "```");
  return t.trim();
}

type MessageAction = { kind: "empty" } | { kind: "reseed" } | { kind: "roll"; text: string };

const FUNC_RE = /^\s*(.+)\((.*)\)\s*$/;

/**
 * Classify a raw message: empty → ignore; `reseed()` → reseed; everything else → a
 * roll attempt. faerrin's `plot(base,interval)` command is dropped (historical
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
