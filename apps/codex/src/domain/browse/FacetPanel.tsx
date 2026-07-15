import type { ReactElement } from "react";

import type { IndexRow } from "@/schema/entity";
import { facetKeysFor } from "@/schema/facetKeys";
import { Input } from "@/ui";

import { humanizeFacetKey } from "../render/text";
import { facetDefFor, labelFor, type FacetDef } from "./facetDefs";
import {
  ambientRows,
  categoryHasLevelCoverage,
  countMissingByValue,
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
  sourceBookValueOf,
  toggleCoreEnumOption,
  toggleFacetEnumOption,
  traitOptionCounts,
  traitTriState,
  cycleTraitFilter,
  type BrowseFilterState,
  type CoreEnumDimension,
  type RangeFilter,
} from "./filterEngine";

export type StateUpdater = (updater: (prev: BrowseFilterState) => BrowseFilterState) => void;

// ---------------------------------------------------------------------------
// small presentational pieces
// ---------------------------------------------------------------------------

function FacetSection({
  title,
  children,
}: {
  title: string;
  children: ReactElement | null;
}): ReactElement | null {
  if (!children) return null;
  return (
    <section className="codex-facet-section">
      <h3 className="codex-facet-title">{title}</h3>
      {children}
    </section>
  );
}

function EnumOptionList({
  options,
  selected,
  missing,
  labelOf,
  onToggle,
}: {
  options: readonly { value: string; count: number }[];
  selected: ReadonlySet<string>;
  missing: number;
  labelOf: (value: string) => string;
  onToggle: (value: string) => void;
}): ReactElement | null {
  if (options.length === 0 && missing === 0) return null;
  return (
    <ul className="codex-facet-options">
      {options.map((opt) => (
        <li key={opt.value}>
          <label className="codex-facet-option">
            <input
              type="checkbox"
              checked={selected.has(opt.value)}
              onChange={() => onToggle(opt.value)}
            />
            <span className="codex-facet-option-label">{labelOf(opt.value)}</span>
            <span className="codex-facet-option-count">{opt.count}</span>
          </label>
        </li>
      ))}
      {missing > 0 ? <li className="codex-facet-missing">— without data: {missing}</li> : null}
    </ul>
  );
}

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
  return (
    <div className="codex-facet-range">
      <div className="codex-facet-range-inputs">
        <Input
          type="number"
          aria-label="minimum"
          placeholder={bounds ? String(bounds.min) : "min"}
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
          placeholder={bounds ? String(bounds.max) : "max"}
          value={value.max ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ ...value, max: raw === "" ? undefined : Number(raw) });
          }}
        />
      </div>
      <label className="codex-facet-has-value">
        <input
          type="checkbox"
          checked={value.hasValue === true}
          onChange={(e) => onChange({ ...value, hasValue: e.target.checked })}
        />
        <span>Must have a value{missing > 0 ? ` (${missing} without data)` : ""}</span>
      </label>
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
  const options = enumOptionCounts(ambient, facetKey);
  const selected = state.facetEnum.get(facetKey) ?? new Set<string>();
  return (
    <FacetSection title={def.label}>
      <EnumOptionList
        options={options}
        selected={selected}
        missing={missing}
        labelOf={(v) => labelFor(def, v)}
        onToggle={(v) => onChange((prev) => toggleFacetEnumOption(prev, facetKey, v))}
      />
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// core sections (every category)
// ---------------------------------------------------------------------------

function CoreEnumSection({
  title,
  dimension,
  rows,
  state,
  onChange,
  valueOf,
}: {
  title: string;
  dimension: CoreEnumDimension;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
  valueOf: (row: IndexRow) => string | undefined;
}): ReactElement | null {
  const ambient = ambientRows(rows, state, { kind: dimension });
  const options = scalarOptionCounts(ambient, valueOf);
  const selected = state[dimension];
  return (
    <FacetSection title={title}>
      <EnumOptionList
        options={options}
        selected={selected}
        missing={0}
        labelOf={(v) => v}
        onToggle={(v) => onChange((prev) => toggleCoreEnumOption(prev, dimension, v))}
      />
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
  const options = traitOptionCounts(ambient);
  if (options.length === 0) return null;
  return (
    <FacetSection title="Traits">
      <ul className="codex-trait-chips">
        {options.map((opt) => {
          const tri = traitTriState(state.traits, opt.value);
          return (
            <li key={opt.value}>
              <button
                type="button"
                className={`codex-trait-chip codex-trait-chip-${tri}`}
                aria-pressed={tri !== "neutral"}
                onClick={() => onChange((prev) => cycleTraitFilter(prev, opt.value))}
              >
                {opt.value}
                <span className="codex-facet-option-count">{opt.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
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
      />
      <TraitsSection rows={rows} state={state} onChange={onChange} />
      <CoreEnumSection
        title="Source"
        dimension="sourceBook"
        rows={rows}
        state={state}
        onChange={onChange}
        valueOf={sourceBookValueOf}
      />
      <CoreEnumSection
        title="Edition"
        dimension="edition"
        rows={rows}
        state={state}
        onChange={onChange}
        valueOf={editionValueOf}
      />
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
