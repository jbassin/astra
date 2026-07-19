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
import { facetDefFor, humanizedLabelFor } from "./facetDefs";
import {
  isRangeFilterActive,
  setSupersededFilter,
  withoutDimension,
  type BrowseFilterState,
  type RangeFilter,
} from "./filterEngine";
import { formatFacetValue } from "./formatFacetValue";

/** Structurally identical to `BrowseListing.tsx`'s `FilterStateUpdater`/
 * `FacetPanel.tsx`'s `StateUpdater` — named locally rather than imported
 * from either (this module sits BELOW both in the dependency graph, same
 * posture as `filterEngine.ts` itself). */
export type PillStateUpdater = (updater: (prev: BrowseFilterState) => BrowseFilterState) => void;

export interface ActiveFilterPill {
  /** Stable React key + (for `f.*` dimensions) the facet key itself. */
  key: string;
  label: string;
  /** P13 S1 (D29-129) — set ONLY when `label` was truncated: the pill's
   * `title` attribute carries the FULL untruncated value list (a native
   * hover tooltip), so truncation never loses information, only display
   * width. `undefined` when nothing was truncated (the DOM `title` attr is
   * simply omitted — never a redundant copy of `label`). */
  title?: string;
  onRemove: () => void;
}

/** D29-129 — "Label: A, B +N more" once a labeled value list exceeds 2
 * entries (first 2, alphabetically for determinism over `Set` iteration
 * order — full list always available via the pill's `title` attribute).
 * `parts` is already the per-value DISPLAY strings (traits' own `-excluded`
 * prefix marker included, so this applies uniformly to every list-shaped
 * pill, not just plain enum selections). */
function truncatedList(
  title: string,
  parts: readonly string[],
): Pick<ActiveFilterPill, "label" | "title"> {
  const sorted = [...parts].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= 2) return { label: `${title}: ${sorted.join(", ")}` };
  const shown = sorted.slice(0, 2).join(", ");
  return {
    label: `${title}: ${shown} +${sorted.length - 2} more`,
    title: `${title}: ${sorted.join(", ")}`,
  };
}

function rangeLabel(title: string, filter: RangeFilter): string {
  // D29-61(b): `RangeFilter` no longer carries a separate `has-value` field —
  // any typed bound already implies "must have a value" (filterEngine.ts),
  // so there's no longer a distinct state to append a suffix for here.
  const bounds = `${filter.min ?? "…"}–${filter.max ?? "…"}`;
  return `${title}: ${bounds}`;
}

function enumPill(
  title: string,
  values: ReadonlySet<string>,
  labelOf: (value: string) => string,
): Pick<ActiveFilterPill, "label" | "title"> {
  return truncatedList(title, [...values].map(labelOf));
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
      ...enumPill("Rarity", state.rarity, formatFacetValue),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "rarity" })),
    });
  }
  if (state.traits.include.size > 0 || state.traits.exclude.size > 0) {
    const parts = [...state.traits.include, ...[...state.traits.exclude].map((t) => `-${t}`)];
    pills.push({
      key: "traits",
      ...truncatedList("Traits", parts),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "traits" })),
    });
  }
  if (state.sourceBook.size > 0) {
    pills.push({
      key: "sourceBook",
      // R10 (D29-68) — abbreviation-with-fallback, same as the FacetPanel
      // Source section and every other compact-surface site.
      ...enumPill("Source", state.sourceBook, (v) => abbreviateBook(v) ?? v),
      onRemove: () => onChange((prev) => withoutDimension(prev, { kind: "sourceBook" })),
    });
  }
  if (state.edition.size > 0) {
    pills.push({
      key: "edition",
      ...enumPill("Edition", state.edition, (v) => v),
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
    // P13 S1 (D29-122) — the precedence-respecting humanizer, replacing the
    // raw-fallback `labelFor`: a pill showing "classfeature" instead of
    // "Class Feature" is the same raw-data leak the facet panel itself
    // fixes, just on a different surface.
    const labelOf = (v: string) => humanizedLabelFor(def, v);

    const enumSelected = state.facetEnum.get(facetKey);
    if (enumSelected !== undefined && enumSelected.size > 0) {
      pills.push({
        key: `f.${facetKey}`,
        ...enumPill(title, enumSelected, labelOf),
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
