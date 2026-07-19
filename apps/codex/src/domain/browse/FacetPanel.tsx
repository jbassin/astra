import { useState, type ReactElement, type ReactNode } from "react";

import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { IndexRow } from "@/schema/entity";
import { facetKeysFor } from "@/schema/facetKeys";
import { Button, EditionIcon, Input } from "@/ui";

import { humanizeFacetKey } from "../render/text";
import {
  CHIP_MAX_OPTIONS,
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
  levelValueOf,
  missingCount,
  rangeBounds,
  rarityValueOf,
  scalarOptionCounts,
  setFacetRange,
  setLevelRange,
  setSupersededFilter,
  sortOptionsFor,
  sourceBookValueOf,
  toggleCoreEnumOption,
  toggleFacetEnumOption,
  traitOptionCounts,
  traitTriState,
  type BrowseFilterState,
  type CoreEnumDimension,
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
      <FacetSection title={def.label}>
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

/** The Edition dimension's own `labelOf` — a stable module-scope reference
 * (not an inline arrow) so oxlint's `no-unstable-nested-components` doesn't
 * flag a JSX-returning closure defined during render.
 *
 * P13 S1 (D29-126): widened from an icon-ONLY glyph to icon + VISIBLE text
 * ("Remaster" / "Legacy") — the old icon-only rendering left mobile
 * checkboxes reading as bare "◯"/"✦" glyphs with no discoverable meaning
 * outside a hover tooltip. */
function editionOptionLabel(value: string): ReactElement {
  const edition = value === "remaster" ? "remaster" : "legacy";
  return (
    <span className="codex-edition-option-label">
      <EditionIcon edition={edition} />
      {edition === "remaster" ? "Remaster" : "Legacy"}
    </span>
  );
}

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
  /** R10 (D29-68) — the Source dimension's own option label wants the
   * abbreviation-with-fallback treatment; Rarity/Edition supply their own
   * module-scope labels above. Omitted -> the plain identity label. */
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
    <FacetSection title="Level">
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
// P4.5 D29-48 (adversarial M6) — the superseded-visibility control. UNTOUCHED
// this slice (D29-129's consolidation onto the toolbar's `resetScroll:false`
// path + callout deletion is S2's job, D29-124/129-consolidation).
// ---------------------------------------------------------------------------

function SupersededSection({
  state,
  onChange,
}: {
  state: BrowseFilterState;
  onChange: StateUpdater;
}): ReactElement {
  return (
    <FacetSection title={state.superseded ? "Including superseded" : "Current edition"}>
      <div className="codex-facet-superseded">
        <p className="codex-callout-blue codex-facet-superseded-explainer">
          Current edition &mdash; previous-edition content that was never remastered still shows;
          &ldquo;Include superseded&rdquo; reveals replaced versions.
        </p>
        <label className="codex-facet-option">
          <input
            type="checkbox"
            checked={state.superseded}
            onChange={(e) => onChange((prev) => setSupersededFilter(prev, e.target.checked))}
          />
          <span className="codex-facet-option-label">Include superseded content</span>
        </label>
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
}: {
  category: string;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
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
      <CoreEnumSection
        title="Source"
        dimension="sourceBook"
        rows={rows}
        state={state}
        onChange={onChange}
        valueOf={sourceBookValueOf}
        labelOf={(v) => abbreviateBook(v) ?? v}
        labelTextOf={(v) => abbreviateBook(v) ?? v}
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
      <SupersededSection state={state} onChange={onChange} />
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
