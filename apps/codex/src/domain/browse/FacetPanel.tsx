import { useState, type ReactElement, type ReactNode } from "react";

import { abbreviateBook } from "@/domain/sources/abbreviations";
import { OTHER_GROUP_LABEL, orderProductLines } from "@/domain/sources/sourcesModel";
import type { IndexRow } from "@/schema/entity";
import { facetKeysFor } from "@/schema/facetKeys";
import { Button, Input } from "@/ui";

import { humanizeFacetKey } from "../render/text";
import {
  CHIP_MAX_OPTIONS,
  editionOptionLabel,
  EnumOptionList,
  FacetSection,
  OptionSearch,
  ToggleChipRow,
  UnspecifiedCount,
  filterOptionsByQuery,
} from "./facetControls";
import { facetDefFor, humanizedLabelFor, type FacetDef } from "./facetDefs";
import {
  ambientRows,
  categoryHasLevelCoverage,
  countMissingByValue,
  cycleTraitFilter,
  editionValueOf,
  enumOptionCounts,
  facetValueOf,
  isRangeFilterActive,
  levelValueOf,
  missingCount,
  rangeBounds,
  rarityValueOf,
  scalarOptionCounts,
  setFacetRange,
  setLevelRange,
  sortOptionsFor,
  sourceBookValueOf,
  toggleCoreEnumOption,
  toggleFacetEnumOption,
  traitOptionCounts,
  traitTriState,
  withoutDimension,
  type BrowseFilterState,
  type CoreEnumDimension,
  type OptionCount,
  type RangeFilter,
} from "./filterEngine";
import { formatFacetValue } from "./formatFacetValue";

export type StateUpdater = (updater: (prev: BrowseFilterState) => BrowseFilterState) => void;

// ---------------------------------------------------------------------------
// range widget (D29-131 — kept exactly as-is, no stepper/slider redesign)
// ---------------------------------------------------------------------------

// P6 R9(b,c) (D29-61): the separate "Must have a value" checkbox is DELETED
// — a typed min/max bound now implies has-value on its own
// (`filterEngine.ts`'s bounds-imply-has-value rewrite), so there's no longer
// a distinct gate for a checkbox to control. The missing-count context that
// used to sit next to the checkbox is folded straight into the min/max
// `Input` placeholders themselves (informational, not actionable, once the
// checkbox is gone) rather than growing a new UI element.
function RangeInputs({
  value,
  bounds,
  missing,
  onChange,
}: {
  value: RangeFilter;
  bounds: { min: number; max: number } | null;
  missing: number;
  onChange: (next: RangeFilter) => void;
}): ReactElement {
  const missingNote = missing > 0 ? ` (${missing} without data)` : "";
  return (
    <div className="codex-facet-range">
      <div className="codex-facet-range-inputs">
        <Input
          type="number"
          aria-label="minimum"
          placeholder={bounds ? `${bounds.min}${missingNote}` : `min${missingNote}`}
          title={`Rows without a value are excluded once set${missingNote}`}
          value={value.min ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ ...value, min: raw === "" ? undefined : Number(raw) });
          }}
        />
        <span className="codex-facet-range-sep">to</span>
        <Input
          type="number"
          aria-label="maximum"
          placeholder={bounds ? `${bounds.max}${missingNote}` : `max${missingNote}`}
          title={`Rows without a value are excluded once set${missingNote}`}
          value={value.max ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ ...value, max: raw === "" ? undefined : Number(raw) });
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// derived-facet sections (facetKeys.ts allowlist)
// ---------------------------------------------------------------------------

function DerivedFacetSection({
  facetKey,
  def,
  rows,
  state,
  onChange,
}: {
  facetKey: string;
  def: FacetDef;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
}): ReactElement | null {
  const ambient = ambientRows(rows, state, { kind: "facet", key: facetKey });
  const missing = missingCount(ambient, facetKey);

  if (def.widget === "range") {
    const bounds = rangeBounds(rows, facetValueOf(facetKey));
    const value = state.facetRange.get(facetKey) ?? {};
    return (
      <FacetSection
        title={def.label}
        activeCount={isRangeFilterActive(value) ? 1 : 0}
        onClear={() => onChange((prev) => withoutDimension(prev, { kind: "facet", key: facetKey }))}
      >
        <RangeInputs
          value={value}
          bounds={bounds}
          missing={missing}
          onChange={(next) => onChange((prev) => setFacetRange(prev, facetKey, next))}
        />
      </FacetSection>
    );
  }

  // enum (the only other widget any real facetDefs entry uses today).
  const rawOptions = enumOptionCounts(ambient, facetKey);
  const labelOf = (v: string): string => humanizedLabelFor(def, v);
  const sorted = sortOptionsFor(facetKey, rawOptions, { labelOf });
  const [query, setQuery] = useState("");
  if (sorted.length === 0 && missing === 0) return null;
  const visible = filterOptionsByQuery(sorted, query, labelOf);
  const selected = state.facetEnum.get(facetKey) ?? new Set<string>();
  const onToggle = (v: string) => onChange((prev) => toggleFacetEnumOption(prev, facetKey, v));

  return (
    <FacetSection
      title={def.label}
      titleExtra={
        <OptionSearch
          sectionTitle={def.label}
          optionCount={sorted.length}
          query={query}
          onQueryChange={setQuery}
        />
      }
      activeCount={selected.size}
      onClear={() => onChange((prev) => withoutDimension(prev, { kind: "facet", key: facetKey }))}
    >
      {sorted.length <= CHIP_MAX_OPTIONS ? (
        <>
          <ToggleChipRow
            options={visible}
            selected={selected}
            labelOf={labelOf}
            onToggle={onToggle}
          />
          <UnspecifiedCount count={missing} />
        </>
      ) : (
        <EnumOptionList
          options={visible}
          selected={selected}
          missing={missing}
          labelOf={labelOf}
          onToggle={onToggle}
        />
      )}
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// core sections (every category)
// ---------------------------------------------------------------------------

/** Rarity's own `labelOf` — a stable module-scope reference for the same
 * `no-unstable-nested-components` reason as `editionOptionLabel` above. */
function rarityOptionLabel(value: string): string {
  return formatFacetValue(value);
}

function CoreEnumSection({
  title,
  dimension,
  rows,
  state,
  onChange,
  valueOf,
  labelOf,
  labelTextOf,
}: {
  title: string;
  dimension: CoreEnumDimension;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
  valueOf: (row: IndexRow) => string | undefined;
  /** Rarity/Edition supply their own module-scope labels above/in
   * `facetControls.tsx` (P13 S3: Source moved OUT of this shared section
   * entirely, into its own `SourceSection` below — grouping doesn't fit this
   * component's flat option-list shape). Omitted -> the plain identity
   * label. */
  labelOf?: (value: string) => ReactNode;
  /** Plain-STRING projection of a value for `OptionSearch`'s substring
   * match — distinct from `labelOf` (which may return rich `ReactNode`,
   * e.g. Edition's icon+text). Omitted -> the raw value itself. */
  labelTextOf?: (value: string) => string;
}): ReactElement | null {
  const ambient = ambientRows(rows, state, { kind: dimension });
  const rawOptions = scalarOptionCounts(ambient, valueOf);
  const textOf = labelTextOf ?? ((v: string) => v);
  const sorted = sortOptionsFor(dimension, rawOptions, { labelOf: textOf });
  const [query, setQuery] = useState("");
  if (sorted.length === 0) return null;
  const visible = filterOptionsByQuery(sorted, query, textOf);
  const selected = state[dimension];
  const onToggle = (v: string) => onChange((prev) => toggleCoreEnumOption(prev, dimension, v));
  const resolvedLabelOf = labelOf ?? ((v: string) => textOf(v));

  return (
    <FacetSection
      title={title}
      titleExtra={
        <OptionSearch
          sectionTitle={title}
          optionCount={sorted.length}
          query={query}
          onQueryChange={setQuery}
        />
      }
      activeCount={selected.size}
      onClear={() => onChange((prev) => withoutDimension(prev, { kind: dimension }))}
    >
      {sorted.length <= CHIP_MAX_OPTIONS ? (
        <ToggleChipRow
          options={visible}
          selected={selected}
          labelOf={resolvedLabelOf}
          onToggle={onToggle}
        />
      ) : (
        <EnumOptionList
          options={visible}
          selected={selected}
          missing={0}
          labelOf={resolvedLabelOf}
          onToggle={onToggle}
        />
      )}
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// Source (P13 S3, D29-121/-128): specialized OUT of `CoreEnumSection` into
// its own grouped rendering — the flat `sourceBook` dimension, the URL
// values (raw book strings, untouched), and the ambient-count mechanism
// (`ambientRows`/`scalarOptionCounts`) are ALL the same as before; only the
// PRESENTATION groups the same option list by product line. Order/labels
// come from `sourcesModel.ts` (`orderProductLines`/`OTHER_GROUP_LABEL`),
// reused rather than re-declared (the review's own blocker on the draft's
// forked order).
// ---------------------------------------------------------------------------

/** A book's own display label: full name + abbreviation suffix
 * (`abbreviateBook()`) — e.g. "Ancestry Guide · LOAG". `abbreviateBook`
 * returning `undefined` (no known abbreviation) means the suffix is simply
 * omitted, never a literal "(undefined)". */
function sourceOptionLabel(book: string): ReactElement {
  const code = abbreviateBook(book);
  return (
    <span className="codex-source-option-label">
      {book}
      {code !== undefined ? <span className="codex-source-option-code"> · {code}</span> : null}
    </span>
  );
}

/** The plain-STRING projection of `sourceOptionLabel` above, for
 * `OptionSearch`/`sortOptionsFor`'s own text-based matching/sorting — a
 * query for "LOAG" matches here (the suffix), while a query for the book's
 * own full title matches via `filterOptionsByQuery`'s OTHER check (the raw
 * `opt.value`, always the full book string) — between the two, D29-128's
 * "OptionSearch matches name AND code" is covered without any bespoke
 * matching logic of its own. */
function sourceOptionLabelText(book: string): string {
  const code = abbreviateBook(book);
  return code !== undefined ? `${book} · ${code}` : book;
}

interface SourceProductLineGroup {
  productLine: string;
  options: OptionCount[];
  /** Sum of every member book's own ambient count — D29-128's "per-group
   * counts = sum of member ambient counts", independent of any active
   * OptionSearch query (the group header's own count is never filtered). */
  count: number;
}

/** Groups an already-tallied, already-SORTED `OptionCount[]` (book -> ambient
 * count) by product line, in `orderProductLines`' pinned-then-alphabetical
 * -then-Other order — a book missing from `sourceLines` (shouldn't happen;
 * `listingData.ts`'s `buildSourceLines` covers every book in the category)
 * groups under `OTHER_GROUP_LABEL` too, the same fail-soft posture the
 * loader itself uses. */
function groupSourceOptions(
  sortedOptions: readonly OptionCount[],
  sourceLines: Record<string, string>,
): SourceProductLineGroup[] {
  const byLine = new Map<string, OptionCount[]>();
  for (const opt of sortedOptions) {
    const line = sourceLines[opt.value] ?? OTHER_GROUP_LABEL;
    const arr = byLine.get(line) ?? [];
    arr.push(opt);
    byLine.set(line, arr);
  }
  return orderProductLines([...byLine.keys()]).map((productLine) => {
    const options = byLine.get(productLine) ?? [];
    return { productLine, options, count: options.reduce((n, o) => n + o.count, 0) };
  });
}

function SourceSection({
  rows,
  state,
  onChange,
  sourceLines,
}: {
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
  /** `source.book` -> product-line group name, from the loader's own
   * `CategoryListingData.sourceLines` (D29-121) — a map built over the FULL
   * category, threaded down through `BrowseListing`/`FacetPanel` verbatim,
   * never re-derived here. */
  sourceLines: Record<string, string>;
}): ReactElement | null {
  const ambient = ambientRows(rows, state, { kind: "sourceBook" });
  const rawOptions = scalarOptionCounts(ambient, sourceBookValueOf);
  const sorted = sortOptionsFor("sourceBook", rawOptions, { labelOf: sourceOptionLabelText });
  const [query, setQuery] = useState("");
  // Manually-toggled groups (D29-128: group headers are chrome, a plain
  // expand/collapse — never a select-all) — ADDITIVE to the two automatic
  // expand rules below (a selected book's group, or a matching group while
  // searching), never a replacement for them.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  if (sorted.length === 0) return null;

  const selected = state.sourceBook;
  const onToggle = (v: string) => onChange((prev) => toggleCoreEnumOption(prev, "sourceBook", v));
  const groups = groupSourceOptions(sorted, sourceLines);
  const queryActive = query.trim() !== "";

  return (
    <FacetSection
      title="Source"
      titleExtra={
        <OptionSearch
          sectionTitle="Source"
          optionCount={sorted.length}
          query={query}
          onQueryChange={setQuery}
        />
      }
      activeCount={selected.size}
      onClear={() => onChange((prev) => withoutDimension(prev, { kind: "sourceBook" }))}
    >
      <ul className="codex-source-groups">
        {groups.map((group) => {
          const visibleOptions = filterOptionsByQuery(group.options, query, sourceOptionLabelText);
          // D29-128: while a query is active, a group with zero matches
          // among its own members simply doesn't render at all — nothing in
          // the spec asks for an empty, expanded, header-only group to stay
          // visible, and hiding it keeps the search result set exactly the
          // matching books (plus any group that ALSO holds a selection, the
          // `hasSelected` branch below).
          const hasSelected = group.options.some((o) => selected.has(o.value));
          if (queryActive && visibleOptions.length === 0 && !hasSelected) return null;
          const isOpen =
            hasSelected ||
            (queryActive && visibleOptions.length > 0) ||
            openGroups.has(group.productLine);
          return (
            <li key={group.productLine} className="codex-source-group">
              <button
                type="button"
                className="codex-source-group-toggle"
                aria-expanded={isOpen}
                aria-label={`Toggle ${group.productLine}`}
                onClick={() =>
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.productLine)) next.delete(group.productLine);
                    else next.add(group.productLine);
                    return next;
                  })
                }
              >
                <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                <span className="codex-source-group-label">{group.productLine}</span>
                <span className="codex-facet-option-count">{group.count}</span>
              </button>
              {isOpen ? (
                <EnumOptionList
                  options={visibleOptions}
                  selected={selected}
                  missing={0}
                  labelOf={sourceOptionLabel}
                  onToggle={onToggle}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </FacetSection>
  );
}

function LevelSection({
  rows,
  state,
  onChange,
}: {
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
}): ReactElement | null {
  if (!categoryHasLevelCoverage(rows)) return null; // D29-32: hidden at 0% coverage
  const ambient = ambientRows(rows, state, { kind: "level" });
  const bounds = rangeBounds(rows, levelValueOf);
  const missing = countMissingByValue(ambient, levelValueOf);
  return (
    <FacetSection
      title="Level"
      activeCount={isRangeFilterActive(state.level) ? 1 : 0}
      onClear={() => onChange((prev) => withoutDimension(prev, { kind: "level" }))}
    >
      <RangeInputs
        value={state.level}
        bounds={bounds}
        missing={missing}
        onChange={(next) => onChange((prev) => setLevelRange(prev, next))}
      />
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// Traits (D29-127): tri-state cycle/semantics/URL behavior UNTOUCHED. New:
// selected-first ordering, a bounded initial render + "Show all N" expander,
// AT-legible per-chip aria-labels, the tri-state gesture hint, OptionSearch.
// ---------------------------------------------------------------------------

/** N = 40 (D29-127): the initial bounded render, after selected-first +
 * alphabetical ordering. An active search query (or "Show all") bypasses
 * this entirely — never a hard cap on what's reachable, only on what
 * renders by default. Exported for direct unit testing. */
export const TRAITS_INITIAL_RENDER_COUNT = 40;

function TraitsSection({
  rows,
  state,
  onChange,
}: {
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
}): ReactElement | null {
  const ambient = ambientRows(rows, state, { kind: "traits" });
  const options = traitOptionCounts(ambient); // already alphabetical
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (options.length === 0) return null;

  // D29-127: selected (include OR exclude) chips pin to the FRONT of the
  // list — each partition stays alphabetical internally (traitOptionCounts'
  // own order, preserved by a stable `.filter()` split).
  const selectedFirst = [
    ...options.filter((o) => traitTriState(state.traits, o.value) !== "neutral"),
    ...options.filter((o) => traitTriState(state.traits, o.value) === "neutral"),
  ];

  const visible = filterOptionsByQuery(selectedFirst, query, (v) => v);
  // D29-125: an active query bypasses the 40-bound entirely; so does
  // "Show all".
  const bounded =
    query.trim() !== "" || showAll ? visible : visible.slice(0, TRAITS_INITIAL_RENDER_COUNT);
  const hiddenCount = visible.length - bounded.length;

  return (
    <FacetSection
      title="Traits"
      titleExtra={
        <OptionSearch
          sectionTitle="Traits"
          optionCount={options.length}
          query={query}
          onQueryChange={setQuery}
        />
      }
      activeCount={state.traits.include.size + state.traits.exclude.size}
      onClear={() => onChange((prev) => withoutDimension(prev, { kind: "traits" }))}
    >
      <p className="codex-facet-hint">click to require · again to exclude · again to reset</p>
      <ul className="codex-trait-chips">
        {bounded.map((opt) => {
          const tri = traitTriState(state.traits, opt.value);
          // AT-legible (review): aria-pressed alone can't distinguish
          // include from exclude.
          const ariaLabel =
            tri === "include"
              ? `${opt.value} — required`
              : tri === "exclude"
                ? `${opt.value} — excluded`
                : opt.value;
          return (
            <li key={opt.value}>
              <button
                type="button"
                className={`codex-trait-chip codex-trait-chip-${tri}`}
                aria-pressed={tri !== "neutral"}
                aria-label={ariaLabel}
                onClick={() => onChange((prev) => cycleTraitFilter(prev, opt.value))}
              >
                {opt.value}
                <span className="codex-facet-option-count">{opt.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 ? (
        <Button type="button" variant="ghost" onClick={() => setShowAll(true)}>
          Show all {visible.length}
        </Button>
      ) : null}
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// P13 S2 (D29-129 consolidation) — the superseded-visibility control: ONE
// control identity, same `?superseded=` state as the toolbar's own reveal
// button (`BrowseListing.tsx`'s `SupersededRevealControl`). The blue
// callout explainer DIES (was the loudest element in the panel per the
// spec's own Problem statement); a one-line muted caption replaces it.
// CRITICAL (the review's own catch): this writes through `onSupersededReveal`
// — the SAME functional-merge, `resetScroll: false` navigate the toolbar
// control already uses (`routes/$category/index.tsx`'s own doc comment on
// that prop) — NEVER through the general `onChange`/`setSupersededFilter`
// path, which would route through `onStateChange`'s default `resetScroll:
// true` and yank a long, already-scrolled listing back to the top just for
// widening this one toggle (the exact divergence the review caught). No
// badge/clear × here (D29-124 scopes that to real facet DIMENSIONS; this
// section's own checkbox already IS its own clear affordance).
// ---------------------------------------------------------------------------

function SupersededSection({
  state,
  onSupersededReveal,
}: {
  state: BrowseFilterState;
  onSupersededReveal: (superseded: boolean) => void;
}): ReactElement {
  return (
    <FacetSection title={state.superseded ? "Including superseded" : "Current edition"}>
      <div className="codex-facet-superseded">
        <label className="codex-facet-option">
          <input
            type="checkbox"
            checked={state.superseded}
            onChange={(e) => onSupersededReveal(e.target.checked)}
          />
          <span className="codex-facet-option-label">Include superseded content</span>
        </label>
        <p className="codex-facet-superseded-caption">
          Previous-edition content that was never remastered still shows either way.
        </p>
      </div>
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------

export function FacetPanel({
  category,
  rows,
  state,
  onChange,
  onSupersededReveal,
  sourceLines,
}: {
  category: string;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
  /** P13 S2 (D29-129 consolidation) — the Superseded section's own control
   * writes through THIS, not `onChange` — see `SupersededSection`'s own
   * comment for why. Threaded straight from `BrowseListing`'s own prop of
   * the same name (the toolbar reveal's callback), never re-derived. */
  onSupersededReveal: (superseded: boolean) => void;
  /** P13 S3 (D29-121/-128) — the loader's `CategoryListingData.sourceLines`,
   * threaded verbatim through `BrowseListing` for `SourceSection`'s own
   * grouping. Optional + defaults to `{}` (every book falls to
   * `OTHER_GROUP_LABEL`, one flat "Other" group) so callers that don't care
   * about grouping (most of `FacetPanel.test.tsx`'s existing non-Source
   * suites, `BrowseListing.test.tsx`'s many render calls) don't all need a
   * ripple edit just to keep compiling. */
  sourceLines?: Record<string, string>;
}): ReactElement {
  const derivedKeys = facetKeysFor(category);
  return (
    <aside className="codex-facet-panel" aria-label="Filters">
      <LevelSection rows={rows} state={state} onChange={onChange} />
      <CoreEnumSection
        title="Rarity"
        dimension="rarity"
        rows={rows}
        state={state}
        onChange={onChange}
        valueOf={rarityValueOf}
        labelOf={rarityOptionLabel}
      />
      <TraitsSection rows={rows} state={state} onChange={onChange} />
      <SourceSection
        rows={rows}
        state={state}
        onChange={onChange}
        sourceLines={sourceLines ?? {}}
      />
      <CoreEnumSection
        title="Edition"
        dimension="edition"
        rows={rows}
        state={state}
        onChange={onChange}
        valueOf={editionValueOf}
        labelOf={editionOptionLabel}
      />
      <SupersededSection state={state} onSupersededReveal={onSupersededReveal} />
      {derivedKeys.map((key) => {
        const def = facetDefFor(key) ?? {
          key,
          label: humanizeFacetKey(key),
          widget: "enum" as const,
        };
        return (
          <DerivedFacetSection
            key={key}
            facetKey={key}
            def={def}
            rows={rows}
            state={state}
            onChange={onChange}
          />
        );
      })}
    </aside>
  );
}
