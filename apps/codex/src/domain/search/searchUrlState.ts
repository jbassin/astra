// P3 S4 (D29-36) — the `/search` URL codec. Same LOW-LEVEL conventions as
// `domain/browse/urlState.ts` (D29-35): bare-string CSV multi-select,
// backslash-escaped commas (`splitCsv`/`joinCsv`, re-exported from that
// module rather than re-implemented, so a future comma-bearing filter value
// — the real-corpus `creature.family`/`source.book` bug that codec's own
// header documents — gets the fix in exactly one place), tolerant parsing
// (never throws; unknown params dropped; empty state = clean URL; qss's
// bare-numeric/boolean coercion accepted the same way `validateBrowseSearch`
// already does for `legacy`).
//
// Deliberately its OWN, smaller shape though — NOT a reuse of
// `BrowseSearch`/`validateBrowseSearch` — because `/search`'s filter
// dimensions are Pagefind's own (category/rarity/edition/level/traits,
// D29-36's explicit list, sourced from `pagefind.filters()`), not
// `facetKeys.ts`'s per-category derived-facet allowlist (`f.<key>`, browse's
// territory — those only exist over the full client-side `IndexRow` set,
// which `/search` never has). `traits` here is a plain multi-select (OR),
// NOT browse's include/exclude tri-state: Pagefind's JS `filters` option is
// OR-within-a-key/AND-across-keys only (no native "exclude a value"
// primitive), so a tri-state UI would need to fetch-then-client-filter,
// defeating the whole "only fetch the shown page of fragments" perf posture
// (D29-34's own "one fragment fetch per shown result"). A deliberate,
// narrower surface than browse's, not an oversight.

import { joinCsv, splitCsv } from "../browse/urlState";

export type SearchPageSearch = {
  q?: string;
  category?: string;
  rarity?: string;
  edition?: string;
  level?: string;
  traits?: string;
  legacy?: boolean;
};

function str(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  return typeof raw === "string" ? raw : String(raw);
}

function toBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** `validateSearch` proper for `routes/search.tsx` — see the file header for
 * the tolerance contract. */
export function validateSearchPageSearch(raw: Record<string, unknown>): SearchPageSearch {
  const out: SearchPageSearch = {};
  if ("q" in raw) {
    const v = str(raw.q);
    if (v !== "") out.q = v;
  }
  if ("category" in raw) {
    const v = str(raw.category);
    if (v !== "") out.category = v;
  }
  if ("rarity" in raw) {
    const v = str(raw.rarity);
    if (v !== "") out.rarity = v;
  }
  if ("edition" in raw) {
    const v = str(raw.edition);
    if (v !== "") out.edition = v;
  }
  if ("level" in raw) {
    const v = str(raw.level);
    if (v !== "") out.level = v;
  }
  if ("traits" in raw) {
    const v = str(raw.traits);
    if (v !== "") out.traits = v;
  }
  if (toBool(raw.legacy)) out.legacy = true;
  return out;
}

/** The panel/query island's live state — plain sets (no tri-state, see the
 * file header), a `legacy` boolean the ROUTE resolves via the same two-phase
 * SSR/live read `$category/index.tsx` uses (M4), never read from here. */
export interface SearchFilterState {
  query: string;
  legacy: boolean;
  category: ReadonlySet<string>;
  rarity: ReadonlySet<string>;
  edition: ReadonlySet<string>;
  level: ReadonlySet<string>;
  traits: ReadonlySet<string>;
}

export function emptySearchFilterState(): SearchFilterState {
  return {
    query: "",
    legacy: false,
    category: new Set(),
    rarity: new Set(),
    edition: new Set(),
    level: new Set(),
    traits: new Set(),
  };
}

function decodeSet(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (raw === undefined) return out;
  for (const token of splitCsv(raw)) {
    const trimmed = token.trim();
    if (trimmed !== "") out.add(trimmed);
  }
  return out;
}

function encodeSet(set: ReadonlySet<string>): string | undefined {
  return set.size === 0 ? undefined : joinCsv([...set]);
}

export function searchToFilterState(search: SearchPageSearch): SearchFilterState {
  return {
    query: search.q ?? "",
    legacy: search.legacy === true,
    category: decodeSet(search.category),
    rarity: decodeSet(search.rarity),
    edition: decodeSet(search.edition),
    level: decodeSet(search.level),
    traits: decodeSet(search.traits),
  };
}

export function filterStateToSearch(state: SearchFilterState): SearchPageSearch {
  const out: SearchPageSearch = {};
  if (state.query.trim() !== "") out.q = state.query.trim();
  if (state.legacy) out.legacy = true;
  const category = encodeSet(state.category);
  if (category !== undefined) out.category = category;
  const rarity = encodeSet(state.rarity);
  if (rarity !== undefined) out.rarity = rarity;
  const edition = encodeSet(state.edition);
  if (edition !== undefined) out.edition = edition;
  const level = encodeSet(state.level);
  if (level !== undefined) out.level = level;
  const traits = encodeSet(state.traits);
  if (traits !== undefined) out.traits = traits;
  return out;
}

/** `true` iff `search` carries nothing (the clean-URL empty state, same
 * convention as `urlState.ts`'s own `isCleanSearch`). */
export function isCleanSearchPageSearch(search: SearchPageSearch): boolean {
  return Object.keys(search).length === 0;
}

/** `true` iff the state carries ANY real search criteria — a query string or
 * at least one filter selection. `/search` uses this to distinguish "nothing
 * to search yet" (a bare page load) from "searched, zero results" (M6's
 * empty state only applies to the latter — see `SearchPage.tsx`). */
export function hasAnyCriteria(state: SearchFilterState): boolean {
  return (
    state.query.trim() !== "" ||
    state.category.size > 0 ||
    state.rarity.size > 0 ||
    state.edition.size > 0 ||
    state.level.size > 0 ||
    state.traits.size > 0
  );
}

/** The Pagefind `search(term, {filters})` filter object for the current
 * state — one entry per non-empty dimension (OR within the array), plus
 * `superseded` pinned per the legacy toggle unless it's on (D29-36 M4, same
 * predicate as `pagefindClient.ts`'s `supersededFilter`, inlined here since
 * it also needs the OTHER four dimensions folded into the same object). */
export function pagefindFilters(state: SearchFilterState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (state.category.size > 0) out.category = [...state.category];
  if (state.rarity.size > 0) out.rarity = [...state.rarity];
  if (state.edition.size > 0) out.edition = [...state.edition];
  if (state.level.size > 0) out.level = [...state.level];
  if (state.traits.size > 0) out.traits = [...state.traits];
  if (!state.legacy) out.superseded = ["false"];
  return out;
}
