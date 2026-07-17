// P3 S3 (D29-35) — the `/{category}` browse URL codec. Human-readable params:
// `?traits=fire,-agile&level=-2..5&rarity=rare,unique&f.actionCost=1,reaction
// &q=drag&superseded=1` (derived facet keys namespaced `f.<key>`; core facets
// bare). One module, two directions:
//
//   - `validateBrowseSearch` — the route's `validateSearch`. Runs on
//     whatever `@tanstack/router-core`'s `defaultParseSearch` handed it: a
//     `Record<string, unknown>` where EVERY value has already been through
//     `qss`'s `toValue` coercion (`"1"` -> the NUMBER `1`, `"true"` -> the
//     BOOLEAN `true`, everything else stays a string) — this is why every
//     reader below stringifies its raw value before parsing it, rather than
//     assuming `typeof raw === "string"`. Tolerant by construction: an
//     unknown top-level key, a non-facet `f.*` key, or a malformed value for
//     a known key never throws — it's just dropped / falls back to the
//     empty/default state.
//   - `filterStateToSearch` — state -> the same `BrowseSearch` shape, used to
//     reflect live filter state into the address bar (a router search
//     replace) and to build shareable hrefs. The empty state encodes to `{}`
//     (D29-35 "empty state = clean URL" — `@tanstack/router-core`'s qss
//     `encode()` already omits `undefined`-valued keys, so an object with
//     every field `undefined` serializes to no query string at all).
//
// P4.5 D29-48: `legacy` was renamed `superseded` (self-documenting parity
// with `IndexRow.superseded`/Pagefind's own `filters.superseded` key) — a
// bare `legacy=1`/`legacy=true` still DECODES as an alias forever (every
// shared link that predates this rename, including P4's own acceptance
// fixture), but the encoder only ever emits `superseded`.
//
// **Include sigil = NO marker; exclude = `-`** (adversarial B1: a bare `+`
// decodes to a literal space — `URLSearchParams`'s
// `application/x-www-form-urlencoded` convention, and `qss`'s `decode()` is a
// thin wrapper over exactly that — so a `+`-prefixed include marker would be
// silently destroyed before this module ever sees it. No folded trait starts
// with `-` (verified: `foldTrait` only lowercases, the corpus's raw trait
// strings never carry a leading hyphen), so a leading `-` is unambiguous as
// the exclude marker.

import { facetDefFor } from "./facetDefs";
import {
  emptyFilterState,
  foldTrait,
  isRangeFilterActive,
  type BrowseFilterState,
  type RangeFilter,
} from "./filterEngine";

/** The typed, already-parsed (but not yet filter-engine-shaped) search
 * params. Named core keys plus an open `f.<facetKey>` index signature for
 * the derived-facet params — both directions of the codec go through this
 * shape so `Route.useSearch()` sees plain strings/a boolean, never Sets/Maps
 * (which don't survive `JSON.stringify`, the fallback qss uses for any
 * object-typed value). */
export type BrowseSearch = {
  traits?: string;
  level?: string;
  rarity?: string;
  book?: string;
  edition?: string;
  q?: string;
  /** P4.5 D29-48: renamed from `legacy`. `legacy=1`/`legacy=true` still
   * DECODES as an alias (see `validateBrowseSearch` below) — forever, not a
   * deprecation window — but the encoder below only ever emits `superseded`. */
  superseded?: boolean;
  sort?: string;
  /** P4.5 S4 (D29-49) — the split-view selection: the raw corpus id SEGMENT
   * (identical format to the `/{category}/{slug}` route's own `slug` param,
   * including `@legacy`/`-N` collision suffixes), never the full
   * `{category}/{slug}` id. Lives OUTSIDE `BrowseFilterState` on purpose —
   * it's route/selection state, not a filter — so `filterStateToSearch`
   * (below) never touches it; every write path that calls
   * `filterStateToSearch` must resync it back in via `withEntryPreserved`
   * (adversarial B3) or a facet change would silently deselect the right
   * pane. */
  entry?: string;
} & Record<string, string | boolean | undefined>;

function str(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  return typeof raw === "string" ? raw : String(raw);
}

function toBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/**
 * P8 S1 (D29-78 adversarial M6) — `?sort=` widened from the closed
 * `"level"`-literal-match to `name|-name|level|-level|<facetKey>|-
 * <facetKey>` (a leading `-` = descending). This is the "unknown" half of
 * the spec's "unknown/inapplicable values fall back to name silently" rule
 * (`filterEngine.ts`'s `SortMode` doc comment covers the other half, the
 * per-category "inapplicable" case this module can't see): a key that is
 * NOT `name`/`level`/`rarity` and not a real `facetKeys.ts` key (via
 * `facetDefFor`) is genuinely unknown ANYWHERE (e.g. `?sort=banana`) and is
 * dropped right here, at decode time — never even reaches `BrowseFilterState`.
 * `level`/`rarity` are both special cases: real `columnDefs.ts` sort keys
 * (Lvl everywhere; the fallback category's ranked Rarity column) that live
 * OUTSIDE `facetDefFor`'s vocabulary (core `IndexRow` fields, not `facets.*`
 * keys) — `columnDefs.ts` never needed to teach `facetDefs.ts` about either,
 * so this module names them directly instead. */
const SORT_CORE_KEYS: ReadonlySet<string> = new Set(["level", "rarity"]);

function isValidSortKey(key: string): boolean {
  const base = key.startsWith("-") ? key.slice(1) : key;
  if (base === "" || base === "-") return false;
  if (base === "name" || SORT_CORE_KEYS.has(base)) return true;
  return facetDefFor(base) !== undefined;
}

/** `validateSearch` proper — see the file header. `raw` is whatever
 * `defaultParseSearch` produced from the actual query string (per-value
 * already coerced by `qss`'s `toValue`). */
export function validateBrowseSearch(raw: Record<string, unknown>): BrowseSearch {
  const out: BrowseSearch = {};

  if ("traits" in raw) {
    const v = str(raw.traits);
    if (v !== "") out.traits = v;
  }
  if ("level" in raw) {
    const v = str(raw.level);
    if (v !== "") out.level = v;
  }
  if ("rarity" in raw) {
    const v = str(raw.rarity);
    if (v !== "") out.rarity = v;
  }
  if ("book" in raw) {
    const v = str(raw.book);
    if (v !== "") out.book = v;
  }
  if ("edition" in raw) {
    const v = str(raw.edition);
    if (v !== "") out.edition = v;
  }
  if ("q" in raw) {
    const v = str(raw.q);
    if (v !== "") out.q = v;
  }
  // P4.5 D29-48: `superseded` is the real param; a bare `legacy=1`/`legacy=
  // true` link (every shared link before this rename, incl. P4's own
  // `rules/building-creatures@legacy?legacy=true` acceptance fixture)
  // decodes as an alias FOREVER, never a deprecation window. `superseded`'s
  // own PRESENCE (any value, even a falsy one) wins over `legacy` when both
  // are somehow present in the same query string.
  if ("superseded" in raw) {
    if (toBool(raw.superseded)) out.superseded = true;
  } else if (toBool(raw.legacy)) {
    out.superseded = true;
  }
  const sortRaw = str(raw.sort);
  if (sortRaw !== "" && sortRaw !== "name" && isValidSortKey(sortRaw)) out.sort = sortRaw;
  if ("entry" in raw) {
    const v = str(raw.entry);
    if (v !== "") out.entry = v;
  }

  // Derived facet params: only a real `f.<facetKeys.ts key>` name survives —
  // a genuinely unknown/hostile `f.*` param is dropped, same posture as an
  // unrecognized top-level key.
  for (const key of Object.keys(raw)) {
    if (!key.startsWith("f.")) continue;
    const facetKey = key.slice(2);
    if (!facetDefFor(facetKey)) continue; // unknown facet key -> ignored
    const v = str(raw[key]);
    if (v !== "") out[key] = v;
  }

  return out;
}

// ---------------------------------------------------------------------------
// range param encode/decode — `{min}..{max}` with either side omittable.
// Fully defensive: any string that doesn't match the shape decodes to `{}`
// (no filter), never throws.
//
// P6 D29-61(d) — the `!`-bang forever-decode contract: this param used to
// carry an optional trailing `!` marking the now-DELETED `has-value` gate
// (`f.hp=10..100!`/a bare `f.hp=..!`). `RangeFilter` no longer has a
// `has-value` field at all (D29-61(b) folded that gate into bound presence
// itself — see `filterEngine.ts`), so the bang is pure legacy syntax now.
// The decoder still MATCHES and TOLERATES a trailing `!` on any shared link
// that predates this change (the repo's established `?legacy=` alias
// posture, P4.5 D29-48, applied to the same class of problem) — it simply
// carries no meaning anymore and is dropped, never causing a parse failure.
// The encoder NEVER emits one: the canonical form is bang-less forever, and
// migrates on the next in-app navigation once a stale link round-trips
// through `filterStateToSearch`.
// ---------------------------------------------------------------------------

const RANGE_RE = /^(-?\d+(?:\.\d+)?)?\.\.(-?\d+(?:\.\d+)?)?(!)?$/;

export function decodeRangeParam(raw: string): RangeFilter {
  const m = RANGE_RE.exec(raw);
  if (!m) return {};
  const [, minStr, maxStr] = m; // the optional trailing `!` (group 3) is matched-and-ignored, D29-61(d)
  const out: RangeFilter = {};
  if (minStr !== undefined && minStr !== "") out.min = Number(minStr);
  if (maxStr !== undefined && maxStr !== "") out.max = Number(maxStr);
  return out;
}

export function encodeRangeParam(filter: RangeFilter): string | undefined {
  if (!isRangeFilterActive(filter)) return undefined;
  const min = filter.min !== undefined ? String(filter.min) : "";
  const max = filter.max !== undefined ? String(filter.max) : "";
  return `${min}..${max}`; // never emits the legacy `!` bang (D29-61(d))
}

// ---------------------------------------------------------------------------
// trait / plain-enum csv encode/decode
//
// **Escaped, not naive, `,`-splitting** (found via a REAL-corpus S3 spot
// check, not spec'd up front): most facet values never contain a literal
// comma (traits, actionCost, size, ...) — but `creature.family` does 380
// times over (e.g. `"Dragon, Black"`) and `source.book` does 240 times
// (e.g. titles with an embedded subtitle comma) — measured against the real
// 46,192-entity corpus. A bare `.split(",")` silently shredded those into
// two bogus tokens, so `f.family=Dragon, Black` (or any `book=` selection
// naming such a title) matched NOTHING. Backslash-escaping a literal `,`
// (and `\` itself) at the STRING level — independent of URL percent-
// encoding, which has already fully happened by the time this module ever
// sees the value — fixes it while staying byte-identical for every value
// that never needed escaping in the first place, including the spec's own
// literal `traits=fire,-agile` / `rarity=rare,unique` /
// `f.actionCost=1,reaction` examples (none of those tokens contain a `,`).
// ---------------------------------------------------------------------------

// Exported (P3 S4, D29-36) so `domain/search/searchUrlState.ts` reuses the
// SAME comma-escaping — not a re-implementation — for the `/search` route's
// own CSV-multi-select params (category/rarity/edition/level/traits): purely
// additive, no behavior change to this module's own callers.
export function splitCsv(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      current += raw[i + 1];
      i++;
    } else if (ch === ",") {
      tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  tokens.push(current);
  return tokens;
}

function escapeCsvToken(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}

export function joinCsv(values: readonly string[]): string {
  return values.map(escapeCsvToken).join(",");
}

function decodeTraitsParam(raw: string): { include: Set<string>; exclude: Set<string> } {
  const include = new Set<string>();
  const exclude = new Set<string>();
  for (const token of splitCsv(raw)) {
    const trimmed = token.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("-")) {
      const name = foldTrait(trimmed.slice(1));
      if (name !== "") exclude.add(name);
    } else {
      include.add(foldTrait(trimmed));
    }
  }
  return { include, exclude };
}

function encodeTraitsParam(
  include: ReadonlySet<string>,
  exclude: ReadonlySet<string>,
): string | undefined {
  if (include.size === 0 && exclude.size === 0) return undefined;
  const parts = [...include, ...[...exclude].map((t) => `-${t}`)];
  return joinCsv(parts);
}

function decodeCsvSet(raw: string): Set<string> {
  const out = new Set<string>();
  for (const token of splitCsv(raw)) {
    const trimmed = token.trim();
    if (trimmed !== "") out.add(trimmed);
  }
  return out;
}

function encodeCsvSet(set: ReadonlySet<string>): string | undefined {
  return set.size === 0 ? undefined : joinCsv([...set]);
}

// ---------------------------------------------------------------------------
// BrowseSearch <-> BrowseFilterState
// ---------------------------------------------------------------------------

export function searchToFilterState(search: BrowseSearch): BrowseFilterState {
  const state = emptyFilterState();
  const traits = search.traits !== undefined ? decodeTraitsParam(search.traits) : state.traits;
  const level = search.level !== undefined ? decodeRangeParam(search.level) : state.level;
  const rarity = search.rarity !== undefined ? decodeCsvSet(search.rarity) : state.rarity;
  const sourceBook = search.book !== undefined ? decodeCsvSet(search.book) : state.sourceBook;
  const edition = search.edition !== undefined ? decodeCsvSet(search.edition) : state.edition;

  const facetEnum = new Map(state.facetEnum);
  const facetRange = new Map(state.facetRange);
  for (const [key, value] of Object.entries(search)) {
    if (!key.startsWith("f.") || value === undefined) continue;
    const facetKey = key.slice(2);
    const def = facetDefFor(facetKey);
    if (!def) continue;
    const raw = typeof value === "string" ? value : String(value);
    if (def.widget === "range") facetRange.set(facetKey, decodeRangeParam(raw));
    else facetEnum.set(facetKey, decodeCsvSet(raw));
  }

  return {
    query: search.q ?? "",
    superseded: search.superseded === true,
    // `validateBrowseSearch` already rejected anything not in the
    // `name|-name|level|-level|<facetKey>|-<facetKey>|rarity|-rarity`
    // grammar (`isValidSortKey`) — a present `search.sort` is always safe to
    // use verbatim; absent falls back to the default "name".
    sort: search.sort ?? "name",
    traits,
    level,
    rarity,
    sourceBook,
    edition,
    facetEnum,
    facetRange,
  };
}

export function filterStateToSearch(state: BrowseFilterState): BrowseSearch {
  const out: BrowseSearch = {};
  const traitsParam = encodeTraitsParam(state.traits.include, state.traits.exclude);
  if (traitsParam !== undefined) out.traits = traitsParam;
  const levelParam = encodeRangeParam(state.level);
  if (levelParam !== undefined) out.level = levelParam;
  const rarityParam = encodeCsvSet(state.rarity);
  if (rarityParam !== undefined) out.rarity = rarityParam;
  const bookParam = encodeCsvSet(state.sourceBook);
  if (bookParam !== undefined) out.book = bookParam;
  const editionParam = encodeCsvSet(state.edition);
  if (editionParam !== undefined) out.edition = editionParam;
  if (state.query.trim() !== "") out.q = state.query.trim();
  if (state.superseded) out.superseded = true;
  // "name" is the default — never serialized, same "empty state = clean
  // URL" convention as every other field here (P8 S1 widening of the old
  // literal `"level"`-only check).
  if (state.sort !== "name") out.sort = state.sort;

  for (const [key, selected] of state.facetEnum) {
    const param = encodeCsvSet(selected);
    if (param !== undefined) out[`f.${key}`] = param;
  }
  for (const [key, filter] of state.facetRange) {
    const param = encodeRangeParam(filter);
    if (param !== undefined) out[`f.${key}`] = param;
  }
  return out;
}

/**
 * P4.5 S4 (D29-49, adversarial B3) — the split-view route's OWN
 * `onStateChange` resync: `filterStateToSearch` rebuilds the search object
 * from `BrowseFilterState` alone and knows nothing about `entry` (it lives
 * outside that state, see `BrowseSearch.entry`'s own comment above), so any
 * facet write/quick-filter keystroke/clear-all would silently strip
 * `?entry=` and deselect the right pane without this resync. `entry` is
 * preserved verbatim across every filter-state write, INCLUDING a
 * `clearAllFilters()` — "Clear all" clears filters, not the split-view
 * selection. A facet change CAN legitimately filter the selected entry out
 * of the visible list; that's the fail-soft "not shown under current
 * filters" case (`BrowseListing.tsx`), never a silent deselect. */
export function withEntryPreserved(
  next: BrowseFilterState,
  currentSearch: BrowseSearch,
): BrowseSearch {
  const out = filterStateToSearch(next);
  if (currentSearch.entry !== undefined) out.entry = currentSearch.entry;
  return out;
}

/** `true` iff `search` carries nothing (the clean-URL empty state). */
export function isCleanSearch(search: BrowseSearch): boolean {
  return Object.keys(search).length === 0;
}
