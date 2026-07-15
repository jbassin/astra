// P3 S3 (D29-32/-35) — the pure faceted-browse filter engine over
// `IndexRow[]`. Zero framework/DOM deps (unit-tested exhaustively BEFORE any
// UI exists per the spec's own §6 risk callout: "filter-engine correctness
// with missing keys is the likeliest logic-bug nest").
//
// ## Missing-key semantics (D29-32, verbatim from the spec)
//
// Entities without a facet key form an implicit "—" bucket:
//   - an ENUM include-selection on that facet drops them (can't match a
//     specific value they don't carry);
//   - a TRAIT exclude-selection never drops them (they trivially don't carry
//     the excluded trait either);
//   - a RANGE filter (min/max) does NOT drop them by default — narrowing a
//     slider "ignores" rows with no value for that key — UNLESS the caller
//     sets `hasValue: true`, an explicit "must carry a value" gate.
//
// This is why ProseOnly entities stay visible under ordinary trait/core
// filtering (traits/level/rarity — level is itself range-shaped, so merely
// narrowing it doesn't hide a level-less row) and only drop out when a
// Foundry-only ENUM facet (e.g. creature.size) is actively selected against,
// or when a range facet's `hasValue` gate is explicitly turned on.

import type { IndexRow } from "@/schema/entity";

import { enumTagsFor, facetDefFor, numericValueFor, type RawFacetValue } from "./facetDefs";

// ---------------------------------------------------------------------------
// state shape
// ---------------------------------------------------------------------------

export interface RangeFilter {
  min?: number;
  max?: number;
  /** Explicitly require the row to carry a value for this facet at all —
   * the ONLY way a range filter excludes a missing-key row (D29-32). */
  hasValue?: boolean;
}

export function isRangeFilterActive(filter: RangeFilter | undefined): boolean {
  return (
    filter !== undefined &&
    (filter.min !== undefined || filter.max !== undefined || filter.hasValue === true)
  );
}

export interface TraitFilter {
  /** Case-folded (lowercase) trait names. */
  include: ReadonlySet<string>;
  exclude: ReadonlySet<string>;
}

export type SortMode = "name" | "level";

export interface BrowseFilterState {
  /** Name quick-filter, substring, case-insensitive. */
  query: string;
  /** Show `superseded` rows too (P4.5 D29-48: a plain per-page URL read, no
   * site-wide toggle — see `urlState.ts`'s own header for the `legacy`
   * back-compat alias). */
  superseded: boolean;
  sort: SortMode;
  traits: TraitFilter;
  level: RangeFilter;
  rarity: ReadonlySet<string>;
  sourceBook: ReadonlySet<string>;
  edition: ReadonlySet<string>;
  /** Derived (`facets.*`) enum-widget selections, keyed by facetKeys.ts key. */
  facetEnum: ReadonlyMap<string, ReadonlySet<string>>;
  /** Derived (`facets.*`) range-widget selections, keyed by facetKeys.ts key. */
  facetRange: ReadonlyMap<string, RangeFilter>;
}

export function emptyFilterState(): BrowseFilterState {
  return {
    query: "",
    superseded: false,
    sort: "name",
    traits: { include: new Set(), exclude: new Set() },
    level: {},
    rarity: new Set(),
    sourceBook: new Set(),
    edition: new Set(),
    facetEnum: new Map(),
    facetRange: new Map(),
  };
}

export function isEmptyFilterState(state: BrowseFilterState): boolean {
  return (
    state.query === "" &&
    !state.superseded &&
    state.sort === "name" &&
    state.traits.include.size === 0 &&
    state.traits.exclude.size === 0 &&
    !isRangeFilterActive(state.level) &&
    state.rarity.size === 0 &&
    state.sourceBook.size === 0 &&
    state.edition.size === 0 &&
    state.facetEnum.size === 0 &&
    state.facetRange.size === 0
  );
}

// ---------------------------------------------------------------------------
// matching primitives
// ---------------------------------------------------------------------------

export function foldTrait(trait: string): string {
  return trait.toLowerCase();
}

function matchesTraits(row: IndexRow, filter: TraitFilter): boolean {
  if (filter.include.size === 0 && filter.exclude.size === 0) return true;
  const folded = new Set(row.traits.map(foldTrait));
  for (const excluded of filter.exclude) {
    if (folded.has(excluded)) return false;
  }
  for (const included of filter.include) {
    if (!folded.has(included)) return false;
  }
  return true;
}

/** `undefined`/`null` (`n`) -> included unless `hasValue` is explicitly set
 * (D29-32's "range filters ignore [missing-key rows] unless the 'has value'
 * bound is set"). A present value still has to clear min/max either way. */
function matchesRange(n: number | null | undefined, filter: RangeFilter | undefined): boolean {
  if (!filter) return true;
  if (n === null || n === undefined) return !filter.hasValue;
  if (filter.min !== undefined && n < filter.min) return false;
  if (filter.max !== undefined && n > filter.max) return false;
  return true;
}

/** `undefined` `tags` (missing key) -> included only when `selected` is empty
 * (D29-32's "an include-selection on that facet drops them"). */
function matchesEnum(
  tags: readonly string[] | null | undefined,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  if (!tags || tags.length === 0) return false;
  return tags.some((t) => selected.has(t));
}

function rawFacetValue(row: IndexRow, key: string): RawFacetValue | undefined {
  const value = row.facets?.[key];
  return value as RawFacetValue | undefined;
}

// ---------------------------------------------------------------------------
// the full predicate + filter/sort entry points
// ---------------------------------------------------------------------------

export function matchesFilterState(row: IndexRow, state: BrowseFilterState): boolean {
  if (!state.superseded && row.superseded) return false;
  if (
    state.query.trim() !== "" &&
    !row.name.toLowerCase().includes(state.query.trim().toLowerCase())
  ) {
    return false;
  }
  if (!matchesTraits(row, state.traits)) return false;
  if (!matchesRange(row.level ?? null, state.level)) return false;
  if (!matchesEnum(row.rarity !== undefined ? [row.rarity] : null, state.rarity)) return false;
  if (!matchesEnum([row.source.book], state.sourceBook)) return false;
  if (!matchesEnum([row.edition], state.edition)) return false;

  for (const [key, selected] of state.facetEnum) {
    const def = facetDefFor(key);
    if (!def) continue; // unknown key in state (hostile/stale URL) -> ignored, never throws
    const tags = enumTagsFor(def, rawFacetValue(row, key));
    if (!matchesEnum(tags, selected)) return false;
  }
  for (const [key, filter] of state.facetRange) {
    const def = facetDefFor(key);
    if (!def) continue;
    const n = numericValueFor(def, rawFacetValue(row, key));
    if (!matchesRange(n, filter)) return false;
  }
  return true;
}

export function applyFilters(rows: readonly IndexRow[], state: BrowseFilterState): IndexRow[] {
  return rows.filter((row) => matchesFilterState(row, state));
}

/** name (default): plain A-Z. level: ascending, the "—" (no `level`) bucket
 * LAST (adversarial M7/M8 — never coerce a missing level to 0). Both break
 * ties by name so the ordering is deterministic. */
export function sortRows(rows: readonly IndexRow[], sort: SortMode): IndexRow[] {
  const copy = [...rows];
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }
  copy.sort((a, b) => {
    if (a.level === undefined && b.level === undefined) return a.name.localeCompare(b.name);
    if (a.level === undefined) return 1;
    if (b.level === undefined) return -1;
    if (a.level !== b.level) return a.level - b.level;
    return a.name.localeCompare(b.name);
  });
  return copy;
}

// ---------------------------------------------------------------------------
// "ambient" rows for a facet's own option list (D29-32 "Facet option lists +
// live counts computed from the rows"): counts for facet X are computed
// against rows filtered by every OTHER active filter but NOT X's own
// selection — otherwise selecting one option would starve every sibling
// option's count to zero (a real faceted-search usability trap, not spec'd
// explicitly but necessary for the option list to stay useful once a
// selection is made).
// ---------------------------------------------------------------------------

export type FacetDimension =
  | { kind: "traits" }
  | { kind: "level" }
  | { kind: "rarity" }
  | { kind: "sourceBook" }
  | { kind: "edition" }
  | { kind: "facet"; key: string };

/**
 * Also exported (P4.5 S4, D29-49) for `activeFilterPills.ts`'s per-pill
 * "remove this one dimension" action — the exact same "state minus one
 * dimension" shape `ambientRows` already needed for facet option counts, so
 * the pill-removal action reuses it rather than growing a parallel set of
 * `clearX` helpers.
 */
export function withoutDimension(state: BrowseFilterState, dim: FacetDimension): BrowseFilterState {
  switch (dim.kind) {
    case "traits":
      return { ...state, traits: { include: new Set(), exclude: new Set() } };
    case "level":
      return { ...state, level: {} };
    case "rarity":
      return { ...state, rarity: new Set() };
    case "sourceBook":
      return { ...state, sourceBook: new Set() };
    case "edition":
      return { ...state, edition: new Set() };
    case "facet": {
      const facetEnum = new Map(state.facetEnum);
      facetEnum.delete(dim.key);
      const facetRange = new Map(state.facetRange);
      facetRange.delete(dim.key);
      return { ...state, facetEnum, facetRange };
    }
  }
}

export function ambientRows(
  rows: readonly IndexRow[],
  state: BrowseFilterState,
  dim: FacetDimension,
): IndexRow[] {
  return applyFilters(rows, withoutDimension(state, dim));
}

export interface OptionCount {
  value: string;
  count: number;
}

/** Tally distinct trait tags (folded) across `rows`, ignoring the panel's own
 * trait selection (pass `ambientRows(rows, state, {kind:"traits"})` in). */
export function traitOptionCounts(rows: readonly IndexRow[]): OptionCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const seen = new Set(row.traits.map(foldTrait));
    for (const trait of seen) counts.set(trait, (counts.get(trait) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

/** Tally an enum facet's tag values across `rows` (already the ambient set —
 * see `ambientRows`). */
export function enumOptionCounts(rows: readonly IndexRow[], key: string): OptionCount[] {
  const def = facetDefFor(key);
  if (!def) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const tags = enumTagsFor(def, rawFacetValue(row, key));
    if (!tags) continue;
    for (const tag of new Set(tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

/** "N without data" for a facet (D29-32) — counted against the ambient row
 * set (rows.length after every OTHER filter, minus this facet's own
 * selection), never the raw full corpus. */
export function missingCount(rows: readonly IndexRow[], key: string): number {
  const def = facetDefFor(key);
  if (!def) return 0;
  return rows.filter((row) => {
    const raw = rawFacetValue(row, key);
    if (def.widget === "range") return numericValueFor(def, raw) === null;
    return enumTagsFor(def, raw) === null;
  }).length;
}

/** Data-derived bounds for a range facet — NEVER default a lower bound to
 * 0/1 (adversarial M8; `level` spans -2..28 corpus-wide). `null` when no row
 * carries a usable value at all. */
export function rangeBounds(
  rows: readonly IndexRow[],
  valueOf: (row: IndexRow) => number | null,
): {
  min: number;
  max: number;
} | null {
  let min: number | undefined;
  let max: number | undefined;
  for (const row of rows) {
    const n = valueOf(row);
    if (n === null) continue;
    if (min === undefined || n < min) min = n;
    if (max === undefined || n > max) max = n;
  }
  return min !== undefined && max !== undefined ? { min, max } : null;
}

export function levelValueOf(row: IndexRow): number | null {
  return row.level ?? null;
}

export function facetValueOf(key: string): (row: IndexRow) => number | null {
  const def = facetDefFor(key);
  return (row: IndexRow) => (def ? numericValueFor(def, rawFacetValue(row, key)) : null);
}

// ---------------------------------------------------------------------------
// collision disambiguation (D29-35): two VISIBLE rows sharing a display name
// get `source.book` appended inline — mechanical, computed over whatever row
// set is actually being rendered.
// ---------------------------------------------------------------------------

export function collidingNames(rows: readonly Pick<IndexRow, "name">[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  const colliding = new Set<string>();
  for (const [name, count] of counts) if (count > 1) colliding.add(name);
  return colliding;
}

/** `level`'s facet-independent flag: whether ANY row in the category carries
 * a `level` at all (D29-32: "level (hidden where the category has 0%
 * coverage — e.g. trait, action)"). */
export function categoryHasLevelCoverage(rows: readonly IndexRow[]): boolean {
  return rows.some((row) => row.level !== undefined);
}

// ---------------------------------------------------------------------------
// immutable state-update helpers (`FacetPanel.tsx`'s dispatch layer) — pure
// functions over `BrowseFilterState`, unit-tested here rather than only
// exercised indirectly through a React component.
// ---------------------------------------------------------------------------

export type TraitTriState = "include" | "exclude" | "neutral";

export function traitTriState(filter: TraitFilter, trait: string): TraitTriState {
  if (filter.include.has(trait)) return "include";
  if (filter.exclude.has(trait)) return "exclude";
  return "neutral";
}

/** neutral -> include -> exclude -> neutral (the trait chip's click cycle). */
export function cycleTraitFilter(state: BrowseFilterState, trait: string): BrowseFilterState {
  const current = traitTriState(state.traits, trait);
  const include = new Set(state.traits.include);
  const exclude = new Set(state.traits.exclude);
  include.delete(trait);
  exclude.delete(trait);
  if (current === "neutral") include.add(trait);
  else if (current === "include") exclude.add(trait);
  // current === "exclude" -> both deletes above already land on neutral.
  return { ...state, traits: { include, exclude } };
}

export function toggleFacetEnumOption(
  state: BrowseFilterState,
  key: string,
  value: string,
): BrowseFilterState {
  const selected = new Set(state.facetEnum.get(key) ?? []);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  const facetEnum = new Map(state.facetEnum);
  if (selected.size === 0) facetEnum.delete(key);
  else facetEnum.set(key, selected);
  return { ...state, facetEnum };
}

export type CoreEnumDimension = "rarity" | "sourceBook" | "edition";

export function toggleCoreEnumOption(
  state: BrowseFilterState,
  dimension: CoreEnumDimension,
  value: string,
): BrowseFilterState {
  const selected = new Set(state[dimension]);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  return { ...state, [dimension]: selected };
}

export function setFacetRange(
  state: BrowseFilterState,
  key: string,
  filter: RangeFilter,
): BrowseFilterState {
  const facetRange = new Map(state.facetRange);
  if (isRangeFilterActive(filter)) facetRange.set(key, filter);
  else facetRange.delete(key);
  return { ...state, facetRange };
}

export function setLevelRange(state: BrowseFilterState, filter: RangeFilter): BrowseFilterState {
  return { ...state, level: filter };
}

export function setQuery(state: BrowseFilterState, query: string): BrowseFilterState {
  return { ...state, query };
}

export function setSort(state: BrowseFilterState, sort: SortMode): BrowseFilterState {
  return { ...state, sort };
}

export function setSupersededFilter(
  state: BrowseFilterState,
  superseded: boolean,
): BrowseFilterState {
  return { ...state, superseded };
}

/** The M6 "clear filters" affordance — back to the clean-URL empty state
 * entirely (sort/superseded included, not just facet selections). */
export function clearAllFilters(): BrowseFilterState {
  return emptyFilterState();
}

// ---------------------------------------------------------------------------
// core (non-`facets.*`) scalar field option counts — `rarity`/`source.book`/
// `edition` aren't keyed through `facetDefFor`, so they get their own tiny
// tally helper (`FacetPanel.tsx`'s core-facet sections) rather than being
// forced through the enum-widget machinery above.
// ---------------------------------------------------------------------------

export function scalarOptionCounts(
  rows: readonly IndexRow[],
  valueOf: (row: IndexRow) => string | undefined,
): OptionCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = valueOf(row);
    if (value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export const rarityValueOf = (row: IndexRow): string | undefined => row.rarity;
export const sourceBookValueOf = (row: IndexRow): string | undefined => row.source.book;
export const editionValueOf = (row: IndexRow): string | undefined => row.edition;

/** Missing-value count for any `valueOf`-shaped accessor (the `level`
 * counterpart of `missingCount`, which is keyed on a `facets.*` key). */
export function countMissingByValue<T>(
  rows: readonly IndexRow[],
  valueOf: (row: IndexRow) => T | null,
): number {
  return rows.filter((row) => valueOf(row) === null).length;
}
