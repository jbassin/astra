// P4.5 S4 (D29-49) — the active-filter pill summary row rendered ABOVE the
// listing, now the only always-visible trace of `FacetPanel`'s selections
// since the panel itself moved into a dismissible `<dialog>` drawer
// (`BrowseListing.tsx`): without a summary, a user who applied a filter and
// closed the drawer would have no visual reminder anything is narrowing the
// list at all. One pill per active FACET DIMENSION (not per selected value
// — "Rarity: rare, unique" is a single removable pill, not two), reusing
// `filterEngine.ts`'s own `withoutDimension` for removal so a pill's
// "clear me" action can never drift from the facet panel's own "ambient
// rows" computation (the exact same "state minus one dimension" shape).
//
// `query`/`sort` are deliberately NOT summarized here — they stay visible
// as ordinary, always-on controls in the listing header (`Input`/`select`),
// never hidden behind the drawer, so they need no separate pill reminder.

import { abbreviateBook } from "@/domain/sources/abbreviations";
import { facetKeysFor } from "@/schema/facetKeys";

import { humanizeFacetKey } from "../render/text";
import { facetDefFor, labelFor } from "./facetDefs";
import {
  isRangeFilterActive,
  setSupersededFilter,
  withoutDimension,
  type BrowseFilterState,
  type RangeFilter,
} from "./filterEngine";

/** Structurally identical to `BrowseListing.tsx`'s `FilterStateUpdater`/
 * `FacetPanel.tsx`'s `StateUpdater` — named locally rather than imported
 * from either (this module sits BELOW both in the dependency graph, same
 * posture as `filterEngine.ts` itself). */
export type PillStateUpdater = (updater: (prev: BrowseFilterState) => BrowseFilterState) => void;

export interface ActiveFilterPill {
  /** Stable React key + (for `f.*` dimensions) the facet key itself. */
  key: string;
  label: string;
  onRemove: () => void;
}

function rangeLabel(title: string, filter: RangeFilter): string {
  // D29-61(b): `RangeFilter` no longer carries a separate `has-value` field —
  // any typed bound already implies "must have a value" (filterEngine.ts),
  // so there's no longer a distinct state to append a suffix for here.
  const bounds = `${filter.min ?? "…"}–${filter.max ?? "…"}`;
  return `${title}: ${bounds}`;
}

function enumLabel(
  title: string,
  values: ReadonlySet<string>,
  labelOf: (value: string) => string,
): string {
  return `${title}: ${[...values].map(labelOf).join(", ")}`;
}

/**
 * Pure over `BrowseFilterState` (same posture as `filterEngine.ts`'s own
 * pure helpers) — `category` only narrows which derived `facets.*` keys are
 * even eligible (mirrors `FacetPanel.tsx`'s own `facetKeysFor(category)`
 * scoping, so a stale/hostile `f.*` key for a DIFFERENT category's facet
 * never surfaces a pill here either, same posture `matchesFilterState`
 * already takes towards an unknown key). `onChange` is the route's
 * `FilterStateUpdater` (`BrowseListing.tsx`) — passed straight through to
 * each pill's `onRemove`.
 */
export function activeFilterPills(
  state: BrowseFilterState,
  category: string,
  onChange: PillStateUpdater,
): ActiveFilterPill[] {
  const pills: ActiveFilterPill[] = [];

  if (isRangeFilterActive(state.level)) {
    pills.push({
      key: "level",
      label: rangeLabel("Level", state.level),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "level" })),
    });
  }
  if (state.rarity.size > 0) {
    pills.push({
      key: "rarity",
      label: enumLabel("Rarity", state.rarity, (v) => v),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "rarity" })),
    });
  }
  if (state.traits.include.size > 0 || state.traits.exclude.size > 0) {
    const parts = [...state.traits.include, ...[...state.traits.exclude].map((t) => `-${t}`)];
    pills.push({
      key: "traits",
      label: `Traits: ${parts.join(", ")}`,
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "traits" })),
    });
  }
  if (state.sourceBook.size > 0) {
    pills.push({
      key: "sourceBook",
      // R10 (D29-68) — abbreviation-with-fallback, same as the FacetPanel
      // Source section and every other compact-surface site.
      label: enumLabel("Source", state.sourceBook, (v) => abbreviateBook(v) ?? v),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "sourceBook" })),
    });
  }
  if (state.edition.size > 0) {
    pills.push({
      key: "edition",
      label: enumLabel("Edition", state.edition, (v) => v),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "edition" })),
    });
  }
  if (state.superseded) {
    pills.push({
      key: "superseded",
      label: "Including superseded",
      onRemove: () => onChange((prev) => setSupersededFilter(prev, false)),
    });
  }
  for (const facetKey of facetKeysFor(category)) {
    const def = facetDefFor(facetKey);
    const title = def?.label ?? humanizeFacetKey(facetKey);
    const labelOf = def ? (v: string) => labelFor(def, v) : (v: string) => v;

    const enumSelected = state.facetEnum.get(facetKey);
    if (enumSelected !== undefined && enumSelected.size > 0) {
      pills.push({
        key: `f.${facetKey}`,
        label: enumLabel(title, enumSelected, labelOf),
        onRemove: () =>
          onChange((prev) => withoutDimension(prev, { kind: "facet", key: facetKey })),
      });
      continue;
    }
    const rangeSelected = state.facetRange.get(facetKey);
    if (rangeSelected !== undefined && isRangeFilterActive(rangeSelected)) {
      pills.push({
        key: `f.${facetKey}`,
        label: rangeLabel(title, rangeSelected),
        onRemove: () =>
          onChange((prev) => withoutDimension(prev, { kind: "facet", key: facetKey })),
      });
    }
  }

  return pills;
}
