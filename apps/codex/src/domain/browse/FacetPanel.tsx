import type { ReactElement, ReactNode } from "react";

import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { IndexRow } from "@/schema/entity";
import { facetKeysFor } from "@/schema/facetKeys";
import { EditionIcon, Input } from "@/ui";

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
  setSupersededFilter,
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
  labelOf: (value: string) => ReactNode;
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

/** The Edition dimension's own `labelOf` — a stable module-scope reference
 * (not an inline arrow) so oxlint's `no-unstable-nested-components` doesn't
 * flag a JSX-returning closure defined during render. */
function editionOptionLabel(value: string): ReactElement {
  return <EditionIcon edition={value === "remaster" ? "remaster" : "legacy"} />;
}

function CoreEnumSection({
  title,
  dimension,
  rows,
  state,
  onChange,
  valueOf,
  labelOf,
}: {
  title: string;
  dimension: CoreEnumDimension;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onChange: StateUpdater;
  valueOf: (row: IndexRow) => string | undefined;
  /** R10 (D29-68) — the Source dimension's own option label wants the
   * abbreviation-with-fallback treatment; every other `CoreEnumSection`
   * caller (Rarity) leaves this unset and keeps the plain identity label
   * it always had. Edition (below) supplies the `EditionIcon` glyph. */
  labelOf?: (value: string) => ReactNode;
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
        labelOf={labelOf ?? ((v) => v)}
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
// P4.5 D29-48 (adversarial M6) — the superseded-visibility control. Distinct
// from `CoreEnumSection`'s own "Edition" (the ordinary remaster/legacy
// CONTENT facet, `state.edition` — unchanged): this is the boolean
// hide-by-default toggle (`state.superseded`), the direct replacement for
// the deleted site-wide header checkbox. The explainer copy ships HERE, in
// S3, not held back for an H-rejection fallback — a never-remastered legacy
// row staying visible under the default state reads as a bug without it.
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
