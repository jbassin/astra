import type { ReactNode } from "react";

import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { Facets, IndexRow } from "@/schema/entity";
import { ActionGlyph, normalizeActionCost } from "@/ui";

import { capitalize } from "../render/text";
import { facetDefFor, numericValueFor, type RawFacetValue } from "./facetDefs";
import {
  categoryHasLevelCoverage,
  categoryHasRarityCoverage,
  type RowComparator,
} from "./filterEngine";

/**
 * P8 S1 (D29-78) — the per-category listing COLUMN model, replacing the flat
 * five-field row grammar (name/traits/level+rarity/source/icon) with real
 * aligned, sortable-by-header columns. One authority for three concerns a
 * plain component tree would otherwise scatter: what to SHOW (`render`),
 * what to SORT BY (`comparator`, resolved by `comparatorForSort` below), and
 * what SURVIVES the narrow-container collapse (`compact`).
 *
 * `.tsx` (not the spec snippet's literal `.ts`) because `render` returns
 * JSX (`<ActionGlyph/>` etc.) — every other JSX-bearing module in this
 * domain (`BrowseListing.tsx`, `render/actionGlyph.tsx`) is `.tsx` too; a
 * `.ts` file can't contain a JSX literal under this repo's tsconfig.
 */
export interface ColumnDef {
  /** `"name"`/`"level"`/`"rarity"`/`"source"` (core `IndexRow` fields) or a
   * `facetKeys.ts` key (`"castTime"`, `"hp"`, ...) — also the `?sort=` value
   * this column answers to (see `comparatorForSort`). */
  key: string;
  label: string;
  source: "core" | "facet";
  render: (row: IndexRow) => ReactNode;
  sortable: boolean;
  /** `"text"` compares the DISPLAY label (`displayTextFor`, so e.g. Type
   * sorts by "Class Feature" not the raw `classfeature` slug); `"numeric"`
   * reuses `numericValueFor`/`parsePriceToCopper` (`facetDefs.ts`) via
   * `facetDefFor`; `{rank}` is an explicit ordinal table (unknown value ->
   * missing, LAST) — `actionCost`/`castTime` layer a duration-parsed tail
   * for time-strings ON TOP of their `rank` array's enumerated prefix (see
   * `actionCostRank`), the one comparator too dynamic for a plain static
   * array alone. */
  comparator?: "text" | "numeric" | { rank: readonly string[] };
  /** Survives the narrow-container (< `NARROW_CONTAINER_WIDTH_PX`) collapse
   * — Name/Lvl(if present)/Source only, uniformly across every category
   * (D29-78's "Name · Lvl-if-covered · Source · icon" compact recipe; the
   * edition icon itself is never a `ColumnDef` at all, see `columnsFor`'s
   * own comment). */
  compact?: boolean;
  /** P9 S1 (D29-86) — a `ch`-based CSS length, applied to the column's
   * header `<th>` (which is what `table-layout: fixed` actually measures —
   * the CSS2.1 fixed-layout algorithm sizes each column off an explicit
   * width on a cell in the table's FIRST row, i.e. `<thead>`, not every
   * `<tbody>` cell). Chosen from a one-time 99th-percentile RENDERED-value-
   * width measurement against the real corpus (46,192 rows at measurement
   * time; P11 S1 dropped ~1,384 nameless `action` debris entities, ~44,808
   * post-drop — the columns measured here (never `action`-only facets like
   * castTime/range) are not expected to shift, but NOT re-measured this
   * round; a future column-width slice should re-run the measurement rather
   * than trust this note — `measure, don't guess` — see this slice's own
   * build report for the raw numbers), plus a
   * 1ch safety buffer; genuine outliers beyond that still degrade gracefully
   * via the `.codex-listing-table td`'s own `overflow: hidden;
   * text-overflow: ellipsis` (below). `undefined` for `NAME_COLUMN` only —
   * the fixed-layout remainder rule gives Name whatever width is left once
   * every OTHER declared column (+ the icon column) claims its share
   * (`.codex-listing-col-name { width: 100% }` is DELETED, adversarial M5 —
   * an explicit 100% next to explicit `ch` siblings over-constrains the
   * algorithm instead of "Name takes the remainder"). */
  width?: string;
}

/** D29-78's container-query threshold ("< ~600px content width — i.e. split
 * view open, or narrow viewports incl. mobile"). Exported so
 * `BrowseListing.tsx`'s measured-width hook and its own tests share the one
 * number. */
export const NARROW_CONTAINER_WIDTH_PX = 600;

const EM_DASH = "—";

// ---------------------------------------------------------------------------
// shared value accessors — `col.source`/`col.key` fully determine how to
// pull a row's raw value, so no column needs a bespoke accessor closure.
// ---------------------------------------------------------------------------

function facetRaw(row: IndexRow, key: string): RawFacetValue | undefined {
  return row.facets?.[key as keyof Facets] as RawFacetValue | undefined;
}

function rawStringValue(col: ColumnDef, row: IndexRow): string | undefined {
  if (col.source === "core") {
    if (col.key === "name") return row.name;
    if (col.key === "rarity") return row.rarity;
    return undefined;
  }
  const value = row.facets?.[col.key as keyof Facets];
  return typeof value === "string" ? value : undefined;
}

// ---------------------------------------------------------------------------
// the feat Type override map (D29-78: "the feat itemCategory 7-value
// override map: classfeature->'Class Feature', ancestryfeature->'Ancestry
// Feature', deityboon->'Deity Boon', rest capitalized") — measured against
// the real corpus (feat: class/ancestry/skill/general/classfeature/
// ancestryfeature/deityboon, exactly 7; creature-ability shares this Type
// column too, its 3 values (offensive/defensive/interaction) all fall
// through to the plain-capitalize branch, which is correct for them too. */
// ---------------------------------------------------------------------------

const ITEM_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  classfeature: "Class Feature",
  ancestryfeature: "Ancestry Feature",
  deityboon: "Deity Boon",
};

function itemCategoryLabel(raw: string): string {
  return ITEM_CATEGORY_LABELS[raw] ?? capitalize(raw);
}

function displayTextFor(col: ColumnDef, row: IndexRow): string | undefined {
  const raw = rawStringValue(col, row);
  if (raw === undefined) return undefined;
  if (col.key === "itemCategory") return itemCategoryLabel(raw);
  if (col.key === "rarity") return capitalize(raw);
  return raw;
}

// ---------------------------------------------------------------------------
// actionCost/castTime rank (D29-78): "free < reaction < 1 < '1 or 2' < '1 to
// 3' < 2 < '2 or 3' < 3 < time-strings (by parsed duration: rounds <
// minutes < hours < days) < passive" — passive sorts with missing, LAST.
// The 8-token enumerated prefix is a plain lookup; a real corpus time-string
// ("1 minute", "10 minutes", "1 hour", "1 day", ...) is parsed for its
// magnitude+unit so it doesn't need enumerating ahead of time. `passive` and
// any genuinely unenumerated composite (the corpus's 3 "2 to 2 rounds"
// residue values, `actionGlyph.tsx`'s own "genuinely unknown" case) fall
// through to `undefined` — `sortByComparator`'s missing-branch (unconditional
// regardless of `desc`) is what actually puts them LAST, matching D29-78.
// ---------------------------------------------------------------------------

const ACTION_COST_ORDER: readonly string[] = [
  "free",
  "reaction",
  "1",
  "1 or 2",
  "1 to 3",
  "2",
  "2 or 3",
  "3",
];

const DURATION_UNIT_ORDER: Readonly<Record<string, number>> = {
  round: 0,
  rounds: 0,
  minute: 1,
  minutes: 1,
  hour: 2,
  hours: 2,
  day: 3,
  days: 3,
};

const DURATION_RE = /^(\d+(?:\.\d+)?)\s+(round|rounds|minute|minutes|hour|hours|day|days)$/i;

function actionCostRank(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const idx = ACTION_COST_ORDER.indexOf(raw);
  if (idx !== -1) return idx;
  const m = DURATION_RE.exec(raw.trim());
  if (!m) return undefined; // "passive" / an unenumerated composite / anything else
  const magnitude = Number(m[1]);
  const unitRank = DURATION_UNIT_ORDER[(m[2] ?? "").toLowerCase()] ?? 0;
  return ACTION_COST_ORDER.length + unitRank * 100_000 + magnitude;
}

function rankComparator(col: ColumnDef, table: readonly string[]): RowComparator {
  return {
    valueOf: (row) => {
      const raw = rawStringValue(col, row);
      if (raw === undefined) return undefined;
      const idx = table.indexOf(raw);
      return idx === -1 ? undefined : idx;
    },
  };
}

function numericComparator(key: string): RowComparator {
  const def = facetDefFor(key);
  return { valueOf: (row) => (def ? numericValueFor(def, facetRaw(row, key)) : undefined) };
}

/**
 * Resolves a `ColumnDef`'s declarative `comparator` descriptor into an
 * actual `RowComparator` (`filterEngine.ts`) — `undefined` when the column
 * isn't sortable at all. Exported only via `comparatorForSort` below (the
 * one entry point `BrowseListing.tsx` needs — it never resolves a raw
 * `ColumnDef` itself).
 */
function comparatorFor(col: ColumnDef): RowComparator | undefined {
  if (!col.comparator) return undefined;
  if (col.comparator === "numeric") {
    if (col.key === "level") return { valueOf: (row) => row.level };
    return numericComparator(col.key);
  }
  if (col.comparator === "text") {
    return { valueOf: (row) => displayTextFor(col, row) };
  }
  if (col.key === "actionCost" || col.key === "castTime") {
    return { valueOf: (row) => actionCostRank(rawStringValue(col, row)) };
  }
  return rankComparator(col, col.comparator.rank);
}

/**
 * `BrowseListing.tsx`'s sort-header click handler + row-sort call both go
 * through this: find the (sortable) column matching the current `?sort=`
 * base key (leading `-` already stripped by the caller) on THIS category's
 * actual column set, and resolve its comparator — `undefined` when no such
 * column exists (an "inapplicable" sort key, `SortMode`'s own file comment
 * in `filterEngine.ts`), which `sortRows` treats as "fall back to name".
 */
export function comparatorForSort(
  cols: readonly ColumnDef[],
  key: string,
): RowComparator | undefined {
  const col = cols.find((c) => c.key === key && c.sortable);
  return col ? comparatorFor(col) : undefined;
}

// ---------------------------------------------------------------------------
// cell renderers
// ---------------------------------------------------------------------------

function renderName(row: IndexRow): ReactNode {
  return row.name;
}

function renderLevel(row: IndexRow): ReactNode {
  return row.level === undefined ? EM_DASH : String(row.level);
}

function renderSource(row: IndexRow): ReactNode {
  const book = row.source.book;
  return <span title={book}>{abbreviateBook(book) ?? book}</span>;
}

function renderRarity(row: IndexRow): ReactNode {
  return row.rarity === undefined ? EM_DASH : capitalize(row.rarity);
}

/** Splits one side of a composite castTime token ("1 or 2" / "1 to 3") via
 * `@/ui`'s short-alias `normalizeActionCost` — deliberately NOT
 * `domain/render/actionGlyph.tsx`'s AoN/Foundry long-form shim (D29-78: "NOT
 * the domain/render shim of the same filename") — `facets.castTime` is
 * already short-form (`"1"`/`"2"`/`"reaction"`/...), so the shim's long-form
 * vocabulary (`"Single Action"`, ...) is dead weight here. */
const COMPOSITE_CONNECTIVES: ReadonlyArray<{ token: string; label: string }> = [
  { token: " to ", label: "to" },
  { token: " or ", label: "or" },
];

function renderCastTime(row: IndexRow): ReactNode {
  const raw = row.facets?.castTime;
  if (raw === undefined || raw.trim() === "") return EM_DASH;
  const single = normalizeActionCost(raw);
  if (single) return <ActionGlyph cost={single} />;
  for (const { token, label } of COMPOSITE_CONNECTIVES) {
    const idx = raw.indexOf(token);
    if (idx === -1) continue;
    const left = normalizeActionCost(raw.slice(0, idx));
    const right = normalizeActionCost(raw.slice(idx + token.length));
    if (left && right) {
      return (
        <span className="codex-col-cast-composite">
          <ActionGlyph cost={left} /> {label} <ActionGlyph cost={right} />
        </span>
      );
    }
  }
  // A time-string ("1 minute", "1 day", ...) or a genuinely unenumerated
  // composite (the corpus's "2 to 2 rounds" residue) — condensed text,
  // truncated by CSS, full value on hover/focus via `title`.
  return (
    <span className="codex-col-truncate" title={raw}>
      {raw}
    </span>
  );
}

function renderActionCost(row: IndexRow): ReactNode {
  const raw = row.facets?.actionCost;
  if (raw === undefined) return EM_DASH;
  const cost = normalizeActionCost(raw);
  if (cost) return <ActionGlyph cost={cost} />;
  // "passive" (not in the action-glyph vocabulary, D29-78) — plain text.
  return <span className="codex-col-passive">{capitalize(raw)}</span>;
}

function renderItemCategory(row: IndexRow): ReactNode {
  const raw = row.facets?.itemCategory;
  return raw === undefined ? EM_DASH : itemCategoryLabel(raw);
}

function renderSize(row: IndexRow): ReactNode {
  const raw = row.facets?.size;
  return raw === undefined ? EM_DASH : raw.toUpperCase();
}

function renderNumeric(key: "hp" | "ac" | "bulk"): (row: IndexRow) => ReactNode {
  return (row) => {
    const value = row.facets?.[key];
    return value === undefined || value === null ? EM_DASH : String(value);
  };
}

function renderPrice(row: IndexRow): ReactNode {
  const raw = row.facets?.price;
  return raw === undefined || raw.trim() === "" ? EM_DASH : raw;
}

/** `range` (spell): `feet -> ft` + em-dash for missing, truncated w/ `title`
 * (D29-78 adversarial B-U1: the worst real value is 47 chars — ft-
 * abbreviation alone can't save the row, hence the truncate treatment on
 * top of it too). NOT sortable (no comparator declared, D29-78's enumerated
 * comparator list never names Range) — see this slice's own report for the
 * rationale. */
function renderRange(row: IndexRow): ReactNode {
  const raw = row.facets?.range;
  if (raw === undefined || raw.trim() === "") return EM_DASH;
  const abbreviated = raw.replace(/\bfeet\b/g, "ft");
  return (
    <span className="codex-col-truncate" title={raw}>
      {abbreviated}
    </span>
  );
}

// ---------------------------------------------------------------------------
// shared columns (identical across every group that carries them)
//
// P9 S1 (D29-86) — `width` below is a one-time 99th-percentile RENDERED-
// value-CHARACTER-COUNT measurement against the real corpus (46,192 rows at
// measurement time; P11 S1 dropped ~1,384 nameless `action` debris
// entities, ~44,808 post-drop — the raw n=/p99/max figures below are the
// ORIGINAL measurement, NOT re-run this round; a future column-width slice
// should re-measure rather than trust this note stale)
// (`ch` is inherently a per-font approximation even for a measured value —
// the established convention `.codex-col-truncate { max-width: 14rem }`
// already used before this slice), +1ch safety buffer, +1ch again where the
// rendered form can add a short suffix/label the raw facet value alone
// doesn't carry. Raw p99/max, measured via a throwaway script against
// `apps/codex/data/corpus/` (not committed — corpus-derived, hermeticity,
// gate G):
//   source (ALL categories, abbreviateBook() output): n=46,192 (pre-P11) p99=8 max=18
//   level (ALL categories): p99=2 max=2
//   spell.castTime (raw facet, pre-glyph): p99=10 max=13
//   spell.range (raw facet, pre-"feet"->"ft" abbreviation): p99=9 max=46
//   creature/hazard/vehicle.size (rendered upper-case): p99=4 max=4
//   creature/hazard/vehicle.hp: p99=3 max=3
//   creature/hazard/vehicle.ac: p99=2 max=2
//   equipment.price (raw facet string): p99=8 max=11
//   equipment.bulk: p99=3 max=3
//   feat/creature-ability.actionCost (raw facet; "Passive" itself is 7ch,
//     the MODAL rendered form — 3,837/6,026 populated rows, not enumerated
//     glyphs): p99=8 max=8
//   feat/creature-ability.itemCategory (rendered label, incl. the rare
//     "Class Feature"/"Ancestry Feature"/"Deity Boon" overrides — together
//     <0.1% of rows, genuinely a truncation-tail per p99, not a routine
//     value): p99=8 max=16
//   rarity (ALL categories, capitalized): p99=8 max=8
// ---------------------------------------------------------------------------

const NAME_COLUMN: ColumnDef = {
  key: "name",
  label: "Name",
  source: "core",
  sortable: true,
  comparator: "text",
  compact: true,
  render: renderName,
  // No declared width — the fixed-layout remainder rule (D29-86, own
  // interface doc comment).
};

const LEVEL_COLUMN: ColumnDef = {
  key: "level",
  label: "Lvl",
  source: "core",
  sortable: true,
  comparator: "numeric",
  compact: true,
  render: renderLevel,
  width: "3ch", // p99=2 ("-2".."28") + 1ch buffer
};

// Not sortable (D29-78's enumerated sortable-comparator list — numeric HP/
// AC/Price/Bulk, rank Cast/Actions/Size/Rarity, text Type — never names
// Source; see this slice's own report for the rationale).
const SOURCE_COLUMN: ColumnDef = {
  key: "source",
  label: "Source",
  source: "core",
  sortable: false,
  compact: true,
  render: renderSource,
  width: "9ch", // p99=8 (abbreviateBook() output) + 1ch buffer
};

const RARITY_COLUMN: ColumnDef = {
  key: "rarity",
  label: "Rarity",
  source: "core",
  sortable: true,
  comparator: { rank: ["common", "uncommon", "rare", "unique"] },
  compact: false,
  render: renderRarity,
  width: "9ch", // p99=8 ("Uncommon") + 1ch buffer
};

const CAST_COLUMN: ColumnDef = {
  key: "castTime",
  label: "Cast",
  source: "facet",
  sortable: true,
  comparator: { rank: ACTION_COST_ORDER },
  compact: false,
  render: renderCastTime,
  // Icon-shaped, not text-shaped — a single/composite `ActionGlyph` (small,
  // fixed) or (the 4.6% fallback tail) a `.codex-col-truncate`d time-string
  // — 8ch comfortably fits a two-glyph composite + its "or"/"to" connective.
  width: "8ch",
};

const RANGE_COLUMN: ColumnDef = {
  key: "range",
  label: "Range",
  source: "facet",
  sortable: false,
  compact: false,
  render: renderRange,
  width: "10ch", // p99=9 raw (pre-abbreviation, so a bit generous post-"ft")
};

const SIZE_COLUMN: ColumnDef = {
  key: "size",
  label: "Size",
  source: "facet",
  sortable: true,
  comparator: { rank: ["tiny", "sm", "med", "lg", "huge", "grg"] },
  compact: false,
  render: renderSize,
  width: "5ch", // p99=4 ("HUGE") + 1ch buffer
};

const HP_COLUMN: ColumnDef = {
  key: "hp",
  label: "HP",
  source: "facet",
  sortable: true,
  comparator: "numeric",
  compact: false,
  render: renderNumeric("hp"),
  width: "4ch", // p99=3 + 1ch buffer
};

const AC_COLUMN: ColumnDef = {
  key: "ac",
  label: "AC",
  source: "facet",
  sortable: true,
  comparator: "numeric",
  compact: false,
  render: renderNumeric("ac"),
  width: "3ch", // p99=2 + 1ch buffer
};

const PRICE_COLUMN: ColumnDef = {
  key: "price",
  label: "Price",
  source: "facet",
  sortable: true,
  comparator: "numeric",
  compact: false,
  render: renderPrice,
  width: "9ch", // p99=8 + 1ch buffer
};

const BULK_COLUMN: ColumnDef = {
  key: "bulk",
  label: "Bulk",
  source: "facet",
  sortable: true,
  comparator: "numeric",
  compact: false,
  render: renderNumeric("bulk"),
  width: "4ch", // p99=3 + 1ch buffer
};

const ACTIONS_COLUMN: ColumnDef = {
  key: "actionCost",
  label: "Actions",
  source: "facet",
  sortable: true,
  comparator: { rank: ACTION_COST_ORDER },
  compact: false,
  render: renderActionCost,
  // "Passive" (7ch, italic text) is the MODAL rendered form (see the
  // shared-columns comment above) — 8ch fits it with a 1ch buffer.
  width: "8ch",
};

const TYPE_COLUMN: ColumnDef = {
  key: "itemCategory",
  label: "Type",
  source: "facet",
  sortable: true,
  comparator: "text",
  compact: false,
  render: renderItemCategory,
  width: "9ch", // p99=8 ("Ancestry") + 1ch buffer
};

// ---------------------------------------------------------------------------
// category -> group -> full column set (D29-78's 5 sets)
// ---------------------------------------------------------------------------

type ColumnGroup = "spell" | "creatureHazardVehicle" | "equipment" | "featAbility" | "fallback";

function groupOf(category: string): ColumnGroup {
  if (category === "spell") return "spell";
  if (category === "creature" || category === "hazard" || category === "vehicle") {
    return "creatureHazardVehicle";
  }
  if (
    category === "equipment" ||
    category === "weapon" ||
    category === "armor" ||
    category === "shield"
  ) {
    return "equipment";
  }
  if (category === "feat" || category === "creature-ability") return "featAbility";
  return "fallback";
}

function baseColumnsFor(category: string): readonly ColumnDef[] {
  switch (groupOf(category)) {
    case "spell":
      return [NAME_COLUMN, LEVEL_COLUMN, CAST_COLUMN, RANGE_COLUMN, SOURCE_COLUMN];
    case "creatureHazardVehicle":
      return [NAME_COLUMN, LEVEL_COLUMN, SIZE_COLUMN, HP_COLUMN, AC_COLUMN, SOURCE_COLUMN];
    case "equipment":
      return [NAME_COLUMN, LEVEL_COLUMN, PRICE_COLUMN, BULK_COLUMN, SOURCE_COLUMN];
    case "featAbility":
      return [NAME_COLUMN, LEVEL_COLUMN, ACTIONS_COLUMN, TYPE_COLUMN, SOURCE_COLUMN];
    case "fallback":
      return [NAME_COLUMN, LEVEL_COLUMN, RARITY_COLUMN, SOURCE_COLUMN];
  }
}

/**
 * The single column-model authority (D29-78). `rows` is the listing's own
 * (already-loaded) row set — used ONLY to run the two coverage-aware drops
 * once per listing (adversarial B-U3): `level` (64/88 categories are 0%
 * covered — `categoryHasLevelCoverage`, reused verbatim from
 * `filterEngine.ts`) and `rarity` (degenerate cardinality-1 on rules/trait/
 * source/article, absent on sidebar — `categoryHasRarityCoverage`, the new
 * analog). Every OTHER facet column here is already gated at emit time by
 * `facetKeys.ts`'s own ≥40%-coverage/≥2-cardinality classifier, so it needs
 * no live check. `Name`/`Source` never drop — the guaranteed floor is
 * `Name · Source` (e.g. `sidebar`, `rules`), never an all-em-dash column.
 * The edition icon is deliberately NOT a `ColumnDef` at all (D29-78: "not a
 * labeled column") — `BrowseListing.tsx` appends it as a fixed end cell
 * unconditionally, in both the full and compact tiers.
 */
export function columnsFor(category: string, rows: readonly IndexRow[]): readonly ColumnDef[] {
  const hasLevel = categoryHasLevelCoverage(rows);
  const hasRarity = categoryHasRarityCoverage(rows);
  return baseColumnsFor(category).filter((col) => {
    if (col.key === "level") return hasLevel;
    if (col.key === "rarity") return hasRarity;
    return true;
  });
}
