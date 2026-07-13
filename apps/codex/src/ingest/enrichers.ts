import type { BlockNode, CodexNode, InlineNode } from "../schema/nodes";

/**
 * The Foundry enricher grammar (D29-6, spec §2/§3): `@UUID[...]`, `@Check[...]`,
 * `@Damage[...]`, `@Localize[...]`, `@Template[...]`, `@Embed[...]` (each with an
 * optional trailing `{label}`) plus the four inline-roll forms `[[/r ...]]`,
 * `[[/br ...]]`, `[[/gmr ...]]`, `[[/act ...]]` (also each with an optional
 * `{label}`). No seventh `@Tag[` form and no fifth `[[/x` form exist in the pinned
 * `pf2e-8.3.0` snapshot (verified exhaustively — see the codex-0029 memory) — an
 * unrecognized form is a HARD FAIL (`EnricherGrammarError`, carrying the exact
 * source span), never a silent passthrough. Plain `@` in prose (emails etc.) can't
 * trip this: the detector requires `@Identifier[` (an identifier immediately
 * followed by `[`), and `example@site.com` never has a bracket after the identifier.
 *
 * All bracket/brace matching here is DEPTH-AWARE, not scan-to-first-close: 14,931 of
 * 15,877 real `@Damage` uses nest a `[type]` annotation inside the outer
 * `@Damage[...]`, and inline-roll formulas do the same (`[[/r 4d8[healing] ...]]`).
 */

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

/** Thrown for anything the grammar can't account for: an unrecognized `@Tag[`/
 * `[[/x` form, an unresolvable `@Localize` key (a fetch/merge bug, not content
 * drift — D29-5 guarantees all 200 real keys resolve), or malformed/unterminated
 * bracket nesting. `source`/`start`/`end` carry the exact span so a caller (the
 * dev-sweep script, `transform.ts`) can report `doc id + snippet`, not just a
 * message. */
export class EnricherGrammarError extends Error {
  readonly source: string;
  readonly start: number;
  readonly end: number;

  constructor(source: string, start: number, end: number, message: string) {
    super(message);
    this.name = "EnricherGrammarError";
    // Plain field assignment, not a TS constructor parameter property — the
    // repo's `nodeTsResolve` scripts run under Node's native strip-only TS
    // support, which rejects that shorthand (D29-9's script runtime).
    this.source = source;
    this.start = start;
    this.end = end;
  }
}

// ---------------------------------------------------------------------------
// context (D29-6: `@UUID`/`@Localize` resolution is injected, never resolved here)
// ---------------------------------------------------------------------------

/** What `ctx.resolveUuid` reports back for a raw `@UUID[...]` target. The
 * assembly engineer (join.ts) owns the real implementation (pack-name→path
 * registry, relative `.docId` resolution within the containing document, excluded
 * doc-type detection); this module only parses the uuid string + optional label
 * and dispatches to whatever callback it's given (tests use a stub). */
export type UuidResolution =
  | { kind: "crossref"; id: string; display: string }
  | { kind: "excluded"; display: string }
  | { kind: "broken" };

/** Non-fatal report classes this module emits via `ctx.report` — expected,
 * by-design residue (D29-6), not bugs. `transform.ts` aggregates these into the
 * corpus report; nothing here throws for them. */
export type ReportClass =
  | "excludedRef"
  | "brokenRef"
  | "checkExtraKey"
  | "damageMultiPart"
  | "templateExtraDropped"
  | "embedOptionsDropped";

export interface EnricherContext {
  resolveUuid(uuid: string): UuidResolution;
  /** The merged `static/lang/*.json` map (D29-5): `re-en.json` wins over
   * `en.json`, everything else lowest — see `mergeLocalizeMaps` below. */
  localize: ReadonlyMap<string, string>;
  report(cls: ReportClass, detail: string): void;
  /**
   * Recursively parses HTML block markup. Required (not optional): 69 of the 200
   * real `@Localize` keys resolve to values containing block tags (`<p>`/`<ul>`/
   * `<hr>`/headings) or further nested enrichers, not flat text (see
   * `nodes.ts`'s "S2 widenings" note on `localizedBoilerplate`) — a caller that
   * forgot to wire this up should fail loudly instead of silently truncating
   * resolved boilerplate to nothing. In production this is always
   * `(html) => parseFoundryHtml(html, ctx)` (bound by whoever constructs the
   * shared `ctx` — `foundryHtml.ts` doesn't import this module, so the wiring
   * happens one level up to avoid a circular import between the two).
   */
  parseBlockHtml(html: string): BlockNode[];
}

// ---------------------------------------------------------------------------
// @Localize map merge (D29-5: re-en.json > en.json > everything else)
// ---------------------------------------------------------------------------

/**
 * Flattens a `static/lang/*.json` file (nested objects, dot-joined keys — e.g.
 * `{"PF2E":{"NPC":{"Abilities":{"Glossary":{"Darkvision":"..."}}}}}` →
 * `"PF2E.NPC.Abilities.Glossary.Darkvision"`) and merges the given files in
 * *ascending* precedence (later files win). Callers pass files in the order
 * `[action-en, kingmaker-en, sf2e-overrides-en, en, re-en]` (D29-5's "re-en.json
 * wins over en.json, others lowest" — empirically verified: of the 200 distinct
 * `@Localize` keys real docs actually use, `en.json` ∪ `re-en.json` alone covers
 * all 200 (94 + 106, zero gap); the only overlap across the whole merged map is 3
 * keys shared between `en.json` and `sf2e-overrides-en.json` — both non-empty and
 * DIFFERING text (`sf2e-overrides-en.json` carries a Starfinder-flavored variant of
 * the same rules key) — `en.json`'s ordering after `sf2e-overrides-en.json` in the
 * ascending list means the plain PF2e text wins for those 3, which is correct
 * here: this pipeline never fetches the `sf2e` pack tree, so its override text
 * would be orphaned/out of place if it won).
 */
export function mergeLocalizeMaps(
  files: ReadonlyArray<Record<string, unknown>>,
): ReadonlyMap<string, string> {
  const merged = new Map<string, string>();
  for (const file of files) {
    flattenInto(file, "", merged);
  }
  return merged;
}

function flattenInto(obj: Record<string, unknown>, prefix: string, out: Map<string, string>): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(path, value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenInto(value as Record<string, unknown>, path, out);
    }
    // Any other shape (array, number, boolean, null) never occurs for a real
    // localize leaf in this corpus — silently skipping would hide drift, but
    // nothing here is ever looked up by `@Localize` unless it resolves to a
    // string, so an unreachable non-string leaf simply isn't a key.
  }
}

// ---------------------------------------------------------------------------
// HTML entity decoding (shared by this module and `foundryHtml.ts`'s text runs —
// `foundryHtml.ts` never decodes entities itself, it hands raw text straight to
// `parseEnrichedText` below, which is the single place decoding happens)
// ---------------------------------------------------------------------------

// The full set found in the real snapshot (&amp; &quot; &mdash; &times; &ndash;
// &gt;) plus the rest of the common HTML5 named-entity vocabulary, so a refresh
// that introduces one of these doesn't spuriously hard-fail. Anything NOT in this
// table is unmapped — same drift-tripwire posture as an unknown tag/enricher.
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["mdash", "—"],
  ["ndash", "–"],
  ["hellip", "…"],
  ["rsquo", "’"],
  ["lsquo", "‘"],
  ["rdquo", "”"],
  ["ldquo", "“"],
  ["times", "×"],
  ["divide", "÷"],
  ["copy", "©"],
  ["reg", "®"],
  ["trade", "™"],
  ["deg", "°"],
  ["plusmn", "±"],
  ["frac12", "½"],
  ["frac14", "¼"],
  ["frac34", "¾"],
  ["sect", "§"],
  ["para", "¶"],
  ["dagger", "†"],
  ["Dagger", "‡"],
  ["bull", "•"],
  ["permil", "‰"],
  ["prime", "′"],
  ["Prime", "″"],
  ["laquo", "«"],
  ["raquo", "»"],
  ["euro", "€"],
  ["pound", "£"],
  ["yen", "¥"],
  ["cent", "¢"],
]);

const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

export function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    const mapped = NAMED_ENTITIES.get(body);
    if (mapped === undefined) {
      throw new Error(`unmapped HTML entity "&${body};" — add it to NAMED_ENTITIES if legitimate`);
    }
    return mapped;
  });
}

// ---------------------------------------------------------------------------
// depth-aware bracket helpers (D29-6's core grammar constraint)
// ---------------------------------------------------------------------------

/** `text[openIdx]` must be `'['`. Returns the index of the matching `']'`
 * (depth-aware — nested `[...]` inside, e.g. a `@Damage` type annotation, don't
 * terminate early). */
function findBracketClose(text: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new EnricherGrammarError(
    text,
    openIdx,
    text.length,
    "unterminated @Tag[...] (no matching ])",
  );
}

/** Finds the closing `]]` of an inline-roll body (`bodyStart` is just past the
 * `[[/xxx `). Only `[`/`]` are depth-tracked here — real roll bodies use `(...)`/
 * `{...}` for formula grouping, which never interferes with the `]]` terminator
 * (verified: no roll body mixes literal `]]` into a formula/comment). Returns the
 * index of the FIRST `]` of the closing pair. */
function findRollClose(text: string, bodyStart: number): number {
  let depth = 0;
  let i = bodyStart;
  while (i < text.length) {
    const c = text[i];
    if (c === "[") {
      depth++;
      i++;
      continue;
    }
    if (c === "]") {
      if (depth === 0) {
        if (text[i + 1] === "]") return i;
        throw new EnricherGrammarError(
          text,
          bodyStart,
          i + 1,
          "malformed inline roll: lone ']' before the closing ']]'",
        );
      }
      depth--;
      i++;
      continue;
    }
    i++;
  }
  throw new EnricherGrammarError(
    text,
    bodyStart,
    text.length,
    "unterminated [[/... ]] (no matching ]])",
  );
}

/** `text[idx]` may or may not be `'{'` — returns `undefined` if there's no label
 * here at all (the overwhelmingly common case). Depth-aware for symmetry with the
 * bracket matchers above, even though no real label has been found to nest `{}`
 * (verified: labels never contain nested enrichers or braces at scale). */
function matchLabel(text: string, idx: number): { label: string; end: number } | undefined {
  if (text[idx] !== "{") return undefined;
  let depth = 1;
  let i = idx + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { label: text.slice(idx + 1, i), end: i + 1 };
    }
    i++;
  }
  throw new EnricherGrammarError(text, idx, text.length, "unterminated {label} (no matching })");
}

/** Depth-aware split on `sep` at bracket depth 0 — tracks `[`/`(` together since
 * both appear in real formula args (`@Damage[(floor(...))d6[poison],...]`) and
 * neither should let a separator inside them count as top-level. */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (const c of s) {
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    if (c === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts;
}

// ---------------------------------------------------------------------------
// matchEnricher — the low-level scanner (exported for tests)
// ---------------------------------------------------------------------------

const KNOWN_TAGS = new Set(["UUID", "Check", "Damage", "Localize", "Template", "Embed"]);
const KNOWN_ROLL_KINDS = new Set(["r", "br", "gmr", "act"]);

export type EnricherForm = "UUID" | "Check" | "Damage" | "Localize" | "Template" | "Embed" | "roll";

export interface EnricherMatch {
  form: EnricherForm;
  /** Only set when `form === "roll"`: which of the four `[[/x` forms matched. */
  rollKind?: "r" | "br" | "gmr" | "act";
  /** Depth-matched inner content: the `@Tag[...]` bracket body, or the `[[/x
   * ...]]` roll body (trimmed). */
  arg: string;
  /** The optional `{label}` suffix content, entity-UNdecoded (callers decode). */
  label: string | undefined;
  /** Index of the first character of the whole match (`@`/`[`). */
  start: number;
  /** Index just past the whole match (bracket close, or the `{label}` close). */
  end: number;
}

const AT_TAG_START = /@([A-Za-z]+)\[/g;
const ROLL_START = /\[\[\/([A-Za-z]+)/g;

/**
 * Scans `text` from `fromIndex` for the next enricher of any form (a known one is
 * returned; an unrecognized `@Word[`/`[[/word` form throws). Returns `null` when
 * nothing more is found. Exported for direct unit testing of the grammar.
 */
export function matchEnricher(text: string, fromIndex: number): EnricherMatch | null {
  AT_TAG_START.lastIndex = fromIndex;
  ROLL_START.lastIndex = fromIndex;
  const atMatch = AT_TAG_START.exec(text);
  const rollMatch = ROLL_START.exec(text);

  if (!atMatch && !rollMatch) return null;

  const useAt = atMatch !== null && (rollMatch === null || atMatch.index <= rollMatch.index);

  if (useAt) {
    const m = atMatch;
    const tagName = m[1] ?? "";
    if (!KNOWN_TAGS.has(tagName)) {
      throw new EnricherGrammarError(
        text,
        m.index,
        m.index + m[0].length,
        `unknown enricher form "@${tagName}[" — not one of UUID/Check/Damage/Localize/Template/Embed`,
      );
    }
    const openIdx = m.index + m[0].length - 1; // index of '['
    const closeIdx = findBracketClose(text, openIdx);
    const arg = text.slice(openIdx + 1, closeIdx);
    let end = closeIdx + 1;
    let label: string | undefined;
    const lm = matchLabel(text, end);
    if (lm) {
      label = lm.label;
      end = lm.end;
    }
    return { form: tagName as EnricherForm, arg, label, start: m.index, end };
  }

  const m = rollMatch;
  if (m === null) throw new Error("unreachable: neither atMatch nor rollMatch");
  const rollKind = m[1] ?? "";
  if (!KNOWN_ROLL_KINDS.has(rollKind)) {
    throw new EnricherGrammarError(
      text,
      m.index,
      m.index + m[0].length,
      `unknown inline-roll form "[[/${rollKind}" — not one of r/br/gmr/act`,
    );
  }
  let bodyStart = m.index + m[0].length;
  if (text[bodyStart] === " ") bodyStart++;
  const closeIdx = findRollClose(text, bodyStart);
  const arg = text.slice(bodyStart, closeIdx).trim();
  let end = closeIdx + 2; // skip the closing ']]'
  let label: string | undefined;
  const lm = matchLabel(text, end);
  if (lm) {
    label = lm.label;
    end = lm.end;
  }
  return {
    form: "roll",
    rollKind: rollKind as "r" | "br" | "gmr" | "act",
    arg,
    label,
    start: m.index,
    end,
  };
}

// ---------------------------------------------------------------------------
// per-form arg parsers (pure functions, exported for tests)
// ---------------------------------------------------------------------------

export interface ParsedCheckArg {
  type: string;
  dc?: number;
  basic?: boolean;
  traits?: string[];
  /** Every other pipe-key/bare-flag (`against`, `defense`, `showDC`, `name`,
   * `options`, `overrideTraits`, `immutable`, `roller`, `rollerRole`, ... —
   * verified at real scale). D29-6: unknown FORMS hard-fail; unknown KEYS within a
   * known form don't — they're captured here instead of being dropped or failing
   * the whole transform. */
  extra: Record<string, string | boolean>;
}

/** `@Check[type|key:value|bareFlag|...]` — the first pipe-part is always the
 * check type (a skill/save name or "flat"); every part after that is either a
 * bare flag (`basic`, or anything else → `extra[flag] = true`) or a `key:value`
 * pair. `dc`/`traits` get named fields (parsed to number / comma-split array);
 * everything else lands in `extra` verbatim. */
export function parseCheckArg(arg: string): ParsedCheckArg {
  const parts = splitTopLevel(arg, "|")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const type = parts[0];
  if (type === undefined) {
    throw new Error(`@Check[...] missing its type (empty arg): "${arg}"`);
  }
  const result: ParsedCheckArg = { type, extra: {} };
  for (const part of parts.slice(1)) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) {
      if (part === "basic") result.basic = true;
      else result.extra[part] = true;
      continue;
    }
    const key = part.slice(0, colonIdx);
    const value = part.slice(colonIdx + 1);
    if (key === "dc") {
      // S4 emit-gate finding (real corpus, e.g. `@Check[crafting|dc:@self.level]`):
      // an actor-relative DC formula isn't a plain number — `Number(...)` on it
      // is NaN, which `CheckNode.dc` (a `z.number()`) rejects at emit-time
      // validation. Same posture `@Damage` already documents for actor-relative
      // formulas ("display as formula text, no @actor.* evaluation") — kept as
      // text via the existing `extra` catch-all instead of corrupting the
      // numeric field.
      const n = Number(value);
      if (Number.isNaN(n)) result.extra.dc = value;
      else result.dc = n;
    } else if (key === "traits") {
      result.traits = value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    } else result.extra[key] = value;
  }
  return result;
}

export interface ParsedTemplateArg {
  shape: string;
  distance: number;
}

/** `@Template[shape|distance:N|...]` or `@Template[type:shape|distance:N|...]`
 * (both orderings and both spellings of "shape" occur at real scale — 1511 bare
 * positional vs 620 `type:` for "emanation" alone). Extra keys (`width`,
 * `traits`, `name`, `damaging`, `options` — 31 real uses total) are Foundry
 * render/automation hints with no reference-site meaning and are dropped
 * (reported, not silently discarded — see `templateExtraDropped`). */
export function parseTemplateArg(arg: string): ParsedTemplateArg {
  const parts = splitTopLevel(arg, "|")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  let shape: string | undefined;
  let distance: number | undefined;
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) {
      shape = part;
      continue;
    }
    const key = part.slice(0, colonIdx);
    const value = part.slice(colonIdx + 1);
    if (key === "type") shape = value;
    else if (key === "distance") distance = Number(value);
    // else: width/traits/name/damaging/options — dropped, see doc comment above.
  }
  if (shape === undefined || distance === undefined) {
    throw new Error(`@Template[...] missing shape or distance: "${arg}"`);
  }
  return { shape, distance };
}

export interface DamagePart {
  formula: string;
  type?: string;
}

/** `@Damage[formula[type],formula[type],...|pipeKey:value|...]` — comma-separated
 * parts (715 real multi-part uses, e.g. `8d6[slashing],2d6[bleed]`), each
 * optionally carrying a trailing `[type]` annotation (67/14,998 have none — bare
 * untyped damage); an optional pipe-suffix (`options`/`traits`/`domains`/...,
 * dominated by `options:area-damage` at 3,824 uses) is a Foundry
 * resistance/automation hint, dropped the same way as `@Template`'s extras. */
export function parseDamageArg(arg: string): { parts: DamagePart[]; rawFormula: string } {
  const pipeParts = splitTopLevel(arg, "|");
  const rawFormula = (pipeParts[0] ?? "").trim();
  const rawParts = splitTopLevel(rawFormula, ",");
  const parts: DamagePart[] = rawParts.map((raw) => {
    const part = raw.trim();
    const m = /^(.*)\[([^[\]]*)\]$/.exec(part);
    if (m) {
      const formula = (m[1] ?? "").trim();
      const type = (m[2] ?? "").trim();
      return { formula, type };
    }
    return { formula: part };
  });
  return { parts, rawFormula };
}

/** Strips exactly one layer of fully-wrapping parens (`(2d8+4)` → `2d8+4`) —
 * "fully-wrapping" meaning the opening paren's matching close is the formula's
 * last character, so `(floor((@actor.level+1)/2)+1)d6` (closes mid-string, `d6`
 * follows) is correctly left alone. */
function stripOuterParens(formula: string): string {
  if (!formula.startsWith("(") || !formula.endsWith(")")) return formula;
  let depth = 0;
  for (let i = 0; i < formula.length; i++) {
    const c = formula[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        if (i !== formula.length - 1) return formula; // closed early — not a full wrap
        return formula.slice(1, -1);
      }
    }
  }
  return formula;
}

/** `(2d8+4)[slashing]` → `"2d8+4 slashing"`; multi-part formulas join with
 * `", "`; a bare untyped part displays as just its formula text. Actor-relative
 * formulas (`@actor.level`, `@item.rank`, ...) are never evaluated — this is a
 * reference site, not a VTT (D29-6) — they display as their literal formula
 * text. */
export function formatDamageDisplay(parts: readonly DamagePart[]): string {
  return parts
    .map((p) => {
      const formula = stripOuterParens(p.formula);
      if (p.type === undefined || p.type === "") return formula;
      const typeText = p.type
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .join(" ");
      return typeText.length > 0 ? `${formula} ${typeText}` : formula;
    })
    .join(", ");
}

export interface ParsedActionArg {
  action: string;
  options: Record<string, string>;
}

/** `[[/act slug key=value key=value ...]]` — space-separated, always `key=value`
 * after the slug (verified exhaustively: no bare option tokens in the real
 * snapshot). */
export function parseActionArg(arg: string): ParsedActionArg {
  const tokens = arg.split(/\s+/).filter((t) => t.length > 0);
  const action = tokens[0];
  if (action === undefined) {
    throw new Error(`[[/act ...]] missing its action slug (empty arg): "${arg}"`);
  }
  const options: Record<string, string> = {};
  for (const tok of tokens.slice(1)) {
    const eqIdx = tok.indexOf("=");
    if (eqIdx === -1) {
      throw new Error(`[[/act ${arg}]]: expected "key=value", got bare token "${tok}"`);
    }
    options[tok.slice(0, eqIdx)] = tok.slice(eqIdx + 1);
  }
  return { action, options };
}

// ---------------------------------------------------------------------------
// node builders (impure: consult ctx for resolution + reporting)
// ---------------------------------------------------------------------------

function buildUuidNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  const uuid = match.arg.trim();
  const resolution = ctx.resolveUuid(uuid);
  const label = match.label !== undefined ? decodeEntities(match.label) : undefined;
  if (resolution.kind === "crossref") {
    return { kind: "crossref", targetId: resolution.id, display: label ?? resolution.display };
  }
  if (resolution.kind === "excluded") {
    ctx.report("excludedRef", uuid);
    return { kind: "brokenRef", target: uuid, display: label ?? resolution.display };
  }
  ctx.report("brokenRef", uuid);
  return { kind: "brokenRef", target: uuid, display: label ?? uuid };
}

function buildCheckNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  const parsed = parseCheckArg(match.arg);
  for (const key of Object.keys(parsed.extra)) {
    ctx.report("checkExtraKey", key);
  }
  const label = match.label !== undefined ? decodeEntities(match.label) : undefined;
  return {
    kind: "check",
    type: parsed.type,
    ...(parsed.dc !== undefined ? { dc: parsed.dc } : {}),
    ...(parsed.basic !== undefined ? { basic: parsed.basic } : {}),
    ...(parsed.traits !== undefined ? { traits: parsed.traits } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(Object.keys(parsed.extra).length > 0 ? { extra: parsed.extra } : {}),
  };
}

function buildDamageNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  const { parts, rawFormula } = parseDamageArg(match.arg);
  if (parts.length > 1) ctx.report("damageMultiPart", rawFormula);
  const display = formatDamageDisplay(parts);
  const label = match.label !== undefined ? decodeEntities(match.label) : undefined;
  return {
    kind: "damage",
    formula: rawFormula,
    display,
    ...(label !== undefined ? { label } : {}),
  };
}

function buildTemplateNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  const parsed = parseTemplateArg(match.arg);
  const droppedKeys = splitTopLevel(match.arg, "|")
    .map((p) => p.trim())
    .filter((p) => {
      const colonIdx = p.indexOf(":");
      const key = colonIdx === -1 ? p : p.slice(0, colonIdx);
      return key !== "type" && key !== "distance" && colonIdx !== -1 && p !== parsed.shape;
    });
  for (const d of droppedKeys) ctx.report("templateExtraDropped", d);
  const label = match.label !== undefined ? decodeEntities(match.label) : undefined;
  return {
    kind: "template",
    shape: parsed.shape,
    distance: parsed.distance,
    ...(label !== undefined ? { label } : {}),
  };
}

function buildEmbedNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  // Space-separated: first token is the uuid target, the rest are Foundry render
  // hints ("inline", "hr=false" — 100% of real uses) that have no meaning for a
  // reference-site renderer and are dropped (reported, not silent).
  const trimmed = match.arg.trim();
  const spaceIdx = trimmed.search(/\s/);
  const target = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  if (spaceIdx !== -1) {
    ctx.report("embedOptionsDropped", trimmed.slice(spaceIdx + 1).trim());
  }
  return { kind: "embed", target, resolved: false };
}

const BLOCK_TAG_RE = /<(p|ul|ol|table|hr|h[1-4]|blockquote|div|section)[ >/]/;

function buildLocalizeNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  const key = match.arg.trim();
  const resolved = ctx.localize.get(key);
  if (resolved === undefined) {
    throw new EnricherGrammarError(
      match.arg,
      match.start,
      match.end,
      `unresolved @Localize key "${key}" — fetch/merge bug, not content drift (D29-5 guarantees coverage)`,
    );
  }
  const children: CodexNode[] = BLOCK_TAG_RE.test(resolved)
    ? ctx.parseBlockHtml(resolved)
    : parseEnrichedText(resolved, ctx);
  return { kind: "localizedBoilerplate", children, sourceKey: key };
}

function buildRollNode(match: EnricherMatch): InlineNode {
  if (match.rollKind === "act") {
    const parsed = parseActionArg(match.arg);
    const label = match.label !== undefined ? decodeEntities(match.label) : undefined;
    return {
      kind: "inlineAction",
      action: parsed.action,
      ...(Object.keys(parsed.options).length > 0 ? { options: parsed.options } : {}),
      ...(label !== undefined ? { label } : {}),
    };
  }
  // r / br / gmr: `formula` is kept as the FULL raw roll body verbatim, including
  // any trailing Foundry `#comment` flavor text (e.g. "1d20+15 #Perception") —
  // there's no separate field for it on InlineRollNode, and it's low-value VTT
  // chat-log text distinct from the real prose-facing `{label}` override, which
  // already has its own field.
  const label = match.label !== undefined ? decodeEntities(match.label) : undefined;
  return {
    kind: "inlineRoll",
    rollKind: match.rollKind as "r" | "br" | "gmr",
    formula: match.arg,
    ...(label !== undefined ? { label } : {}),
  };
}

function buildNode(match: EnricherMatch, ctx: EnricherContext): InlineNode {
  switch (match.form) {
    case "UUID":
      return buildUuidNode(match, ctx);
    case "Check":
      return buildCheckNode(match, ctx);
    case "Damage":
      return buildDamageNode(match, ctx);
    case "Template":
      return buildTemplateNode(match, ctx);
    case "Embed":
      return buildEmbedNode(match, ctx);
    case "Localize":
      return buildLocalizeNode(match, ctx);
    case "roll":
      return buildRollNode(match);
  }
}

// ---------------------------------------------------------------------------
// parseEnrichedText — the public entry point (Module 1's main API)
// ---------------------------------------------------------------------------

/**
 * Splits `text` into plain-text runs (decoded, → `text` nodes) and enricher nodes,
 * in source order. Throws `EnricherGrammarError` on the FIRST unrecognized
 * enricher form or malformed bracket nesting encountered (D29-6's hard-fail
 * posture) — callers that need to enumerate every failure across a large corpus
 * catch per-document and continue to the next document (see
 * `scripts/dev-sweep-foundry.ts`); collecting every failure within a single
 * string isn't attempted here, since a hard-fail is meant to stop and be fixed,
 * not be exhaustively cataloged inline.
 */
export function parseEnrichedText(text: string, ctx: EnricherContext): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  let textBuf = "";

  const flushText = (): void => {
    if (textBuf.length > 0) {
      nodes.push({ kind: "text", content: decodeEntities(textBuf), marks: NO_MARKS });
      textBuf = "";
    }
  };

  for (;;) {
    const match = matchEnricher(text, cursor);
    if (!match) {
      textBuf += text.slice(cursor);
      break;
    }
    textBuf += text.slice(cursor, match.start);
    flushText();
    nodes.push(buildNode(match, ctx));
    cursor = match.end;
  }
  flushText();
  return nodes;
}

const NO_MARKS = { bold: false, italic: false, superscript: false } as const;
