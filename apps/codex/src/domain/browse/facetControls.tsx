import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import { Input } from "@/ui";

import type { OptionCount } from "./filterEngine";

/**
 * P13 S1 (D29-130) — the shared presentational primitives, extracted out of
 * `FacetPanel.tsx` so `SearchPage.tsx` (S3) can consume the SAME widgets
 * instead of maintaining its own hand-copied section markup. Every
 * component here takes options/selection/labels AS DATA (plus an optional
 * comparator, `filterEngine.ts`'s `sortOptionsFor`) — none of them recompute
 * ambient counts or re-derive WHICH options exist; that stays the caller's
 * job (`FacetPanel.tsx`'s own `ambientRows`/`enumOptionCounts` today,
 * `SearchPage.tsx`'s Pagefind-derived `filterCounts` state from S3).
 */

// ---------------------------------------------------------------------------
// FacetSection — the title-wrapper every section renders inside.
// ---------------------------------------------------------------------------

export function FacetSection({
  title,
  titleExtra,
  activeCount,
  onClear,
  children,
}: {
  title: string;
  /** P13 S1 (D29-125) — `OptionSearch`'s own toggle button (and, once
   * expanded, its input) render here: the spec's own "a magnifier button in
   * the section title row" wording. Rendered as a DIRECT sibling of the
   * `<h3>` inside one flex row (not a wrapping element) so `OptionSearch`
   * can stay a plain component returning a Fragment. */
  titleExtra?: ReactNode;
  /** P13 S2 (D29-124) — "active sections show a value-count badge on the
   * title + a per-section clear ×": the number of currently-selected values
   * for this dimension (an active range counts as 1 — `isRangeFilterActive`
   * over a `RangeFilter`, `filterEngine.ts`). `0`/`undefined` renders
   * NEITHER the badge nor the clear button — every caller passes the real
   * count unconditionally, this component gates on it being truthy so a
   * facet with no active selection stays exactly as plain as it always was
   * (`SupersededSection`, D29-129, deliberately never passes this — its own
   * checkbox already IS the clear affordance). */
  activeCount?: number;
  /** Required whenever `activeCount` is truthy (the caller's own dimension
   * -scoped clear, `withoutDimension` in every real call site — the SAME
   * "state minus one dimension" helper `activeFilterPills.ts`'s per-pill
   * remove action already reuses, `filterEngine.ts`). */
  onClear?: () => void;
  // P11 S2 (D29-107a) — widened from `ReactElement | null` to `ReactNode`:
  // a `filterable` `CoreEnumSection`/`TraitsSection` now renders TWO
  // siblings (the type-ahead `Input` + the option list), wrapped in a
  // Fragment — a Fragment element is always truthy, so the `!children`
  // "hide the whole section when empty" gate below intentionally no longer
  // fires for those two sections (the type-ahead input itself must stay
  // visible even when it has filtered the option list down to zero matches,
  // so the reader can clear it) — every OTHER (non-filterable) caller still
  // passes a single `ReactElement | null` exactly as before, unaffected.
  children: ReactNode;
}): ReactElement | null {
  if (!children) return null;
  return (
    <section className="codex-facet-section">
      <div className="codex-facet-title-row">
        <h3 className="codex-facet-title">
          {title}
          {activeCount ? <span className="codex-facet-title-badge">{activeCount}</span> : null}
        </h3>
        {titleExtra}
        {activeCount ? (
          <button
            type="button"
            className="codex-facet-section-clear"
            aria-label={`Clear ${title}`}
            onClick={onClear}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// OptionSearch (D29-125) — the generalized default-hidden option-list
// search, replacing the two hardcoded P11 type-aheads (Source/Traits).
// ---------------------------------------------------------------------------

/** ≥ this many options -> the magnifier affordance appears at all. Below it,
 * `OptionSearch` renders nothing (the option list is short enough to scan by
 * eye — Rarity/Edition/actionCost's real cardinalities all sit well under
 * this). */
export const OPTION_SEARCH_THRESHOLD = 20;

/** ≥ this many options -> the input renders EXPANDED by default (the
 * stakeholder's own sanctioned latitude on very large lists — `creature
 * .family`'s 467 options, Traits' 380-on-feat, are the motivating cases). */
export const OPTION_SEARCH_AUTO_EXPAND_THRESHOLD = 100;

function MagnifierGlyph(): ReactElement {
  // A plain hand-rolled inline SVG (no icon-font/new dependency, matching
  // `EditionIcon.tsx`'s own reasoning) — `aria-hidden` since the enclosing
  // `<button>` already carries the real `aria-label`.
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
      className="codex-option-search-glyph"
    >
      <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <line
        x1="15"
        y1="15"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Returns `null` below `OPTION_SEARCH_THRESHOLD` (the caller never needs to
 * gate on the threshold itself). The toggle button always carries
 * `aria-expanded`; the input (when expanded) autofocuses ONLY on a
 * user-triggered expand (a mount that starts pre-expanded, per the ≥100
 * default, does NOT steal page focus). Esc, or a blur while the query is
 * empty, collapses AND clears the query (D29-125: "Esc/blur-with-empty-
 * value collapses" — collapsing always clears, so a hidden input never
 * leaves an invisible active filter behind).
 */
export function OptionSearch({
  sectionTitle,
  optionCount,
  query,
  onQueryChange,
}: {
  sectionTitle: string;
  optionCount: number;
  query: string;
  onQueryChange: (next: string) => void;
}): ReactElement | null {
  const [expanded, setExpanded] = useState(optionCount >= OPTION_SEARCH_AUTO_EXPAND_THRESHOLD);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  if (optionCount < OPTION_SEARCH_THRESHOLD) return null;

  function collapse(): void {
    setExpanded(false);
    onQueryChange("");
  }

  return (
    <>
      <button
        type="button"
        className="codex-option-search-toggle"
        aria-label={`Search ${sectionTitle}`}
        aria-expanded={expanded}
        onClick={() => (expanded ? collapse() : setExpanded(true))}
      >
        <MagnifierGlyph />
      </button>
      {expanded ? (
        <Input
          ref={inputRef}
          type="search"
          className="codex-option-search-input"
          aria-label={`Search ${sectionTitle}`}
          placeholder={`Search ${sectionTitle.toLowerCase()}…`}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onBlur={() => {
            if (query.trim() === "") setExpanded(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // P13 S2 (D29-123 Esc sequencing) — `stopPropagation()` alone
              // is NOT enough here: this app hydrates via `hydrateRoot(
              // document, ...)` (the TanStack Start client entry), so
              // React's OWN top-level event delegation listener lives on
              // `document` itself, the EXACT SAME node the pane-swap's own
              // Esc-closes-the-pane listener (`BrowseListing.tsx`) attaches
              // to independently. `stopPropagation()` only blocks
              // propagation to ANCESTOR nodes — for two listeners on the
              // SAME node, it does nothing; only `stopImmediatePropagation()`
              // on the underlying native event stops a LATER-registered
              // sibling listener on that same node from also firing for
              // this exact keydown. Found live running the interaction
              // guard's own Esc-sequencing case: without this, the FIRST
              // Escape collapsed the search AND closed the whole pane in
              // one keystroke.
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              collapse();
            }
          }}
        />
      ) : null}
    </>
  );
}

/**
 * D29-125 — substring match against BOTH the displayed label and the raw
 * value (so "AP147" still finds its book even when the Source section
 * displays it as a full title, and vice versa). An empty query returns
 * `options` unchanged (no copy needed).
 */
export function filterOptionsByQuery<T extends { value: string }>(
  options: readonly T[],
  query: string,
  labelTextOf: (value: string) => string,
): readonly T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return options;
  return options.filter((opt) => {
    if (opt.value.toLowerCase().includes(q)) return true;
    return labelTextOf(opt.value).toLowerCase().includes(q);
  });
}

// ---------------------------------------------------------------------------
// EnumOptionList — the checkbox-row widget (> `CHIP_MAX_OPTIONS`).
// ---------------------------------------------------------------------------

/** ≤ this many options -> a `ToggleChipRow`; more -> `EnumOptionList`'s
 * checkbox rows (D29-126: real cardinalities cluster 2/4/6/7 then jump to
 * 15+ — nothing straddles this boundary). */
export const CHIP_MAX_OPTIONS = 8;

export function EnumOptionList({
  options,
  selected,
  missing,
  labelOf,
  onToggle,
}: {
  options: readonly OptionCount[];
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
      {/* P13 S1 (D29-126): "— without data: N" -> "Unspecified (N)" —
          informational-only, semantics unchanged. */}
      {missing > 0 ? <li className="codex-facet-missing">Unspecified ({missing})</li> : null}
    </ul>
  );
}

/** The `EnumOptionList`-external counterpart, for a `ToggleChipRow` section
 * (chips have no shared `<ul>` to append an in-list missing row to). Same
 * "Unspecified (N)" text/class. */
export function UnspecifiedCount({ count }: { count: number }): ReactElement | null {
  if (count <= 0) return null;
  return <p className="codex-facet-missing">Unspecified ({count})</p>;
}

// ---------------------------------------------------------------------------
// ToggleChipRow — the parchment toggle-chip widget (≤ `CHIP_MAX_OPTIONS`).
// ---------------------------------------------------------------------------

export function ToggleChipRow({
  options,
  selected,
  labelOf,
  onToggle,
}: {
  options: readonly OptionCount[];
  selected: ReadonlySet<string>;
  labelOf: (value: string) => ReactNode;
  onToggle: (value: string) => void;
}): ReactElement | null {
  if (options.length === 0) return null;
  return (
    <ul className="codex-toggle-chip-row">
      {options.map((opt) => {
        const pressed = selected.has(opt.value);
        return (
          <li key={opt.value}>
            <button
              type="button"
              className="codex-toggle-chip"
              aria-pressed={pressed}
              onClick={() => onToggle(opt.value)}
            >
              {labelOf(opt.value)}
              <span className="codex-facet-option-count">{opt.count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
