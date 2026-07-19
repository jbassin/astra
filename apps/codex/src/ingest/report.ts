import type { CodexEntity, CreatureStats, HazardStats } from "../schema/entity";
import { facetKeysFor } from "../schema/facetKeys";
import type { AugmentClassStatsResult, SubclassOptionCount } from "./augmentClassStats";
import type { BookMergeRow, BookNormalizeResult } from "./bookNormalize";
import type { DropAccounting } from "./drop";
import type {
  CategoryStat,
  CollisionReport,
  JoinResult,
  PatchStats,
  RedirectCrossCheck,
} from "./join";
import type { RulesTreeStats } from "./rulesTree";
import type { SidebarAttachResult } from "./sidebarAttach";
import type { SourcesIndexStats } from "./sourcesIndexBuild";

/**
 * D29-3/§3: the transform report — THE P1 acceptance artifact (spec §3, §4 S4's
 * gate: "report reviewed BY THE STAKEHOLDER — join rates + residues are a
 * judgment call, not a threshold"). Pure builders only: `buildReportJson`/
 * `buildReportMarkdown` return the `report.json` object / `report.md` string;
 * writing either to disk is the transform orchestrator's job (`dev-join.ts`/a
 * future `transform.ts`), same division of labor as `emit.ts` owns writing the
 * corpus itself.
 *
 * Per spec §3, the report covers: per-category in/out counts (both sources),
 * unknown-enricher occurrences (fatal, §3's "will be zero or the run died" —
 * surfaced here as `hardFailureCount`, present for completeness even though a
 * non-zero value means this report was never reached in a real run), broken
 * crossrefs by class, join hit/miss per category + capped unjoined lists,
 * slug collisions + resolutions, legacy-pair counts + pairing disagreements,
 * license/edition breakdowns, size totals (hooks — `emit.ts` fills them in;
 * `undefined` here just means "not measured at this stage"), and the applied
 * alias list.
 *
 * ## A known limitation, documented rather than fabricated
 *
 * "Excluded" counts (D29-8's whole-pack/doc-type exclusions, `categoryMap.ts`)
 * are NOT tracked anywhere upstream today — an excluded (pack, type) pair
 * never reaches `assembleFoundryEntity` at all, so no counter exists for it.
 * This report surfaces per-category IN (assembled) / OUT (final, post-join)
 * counts and the generic `reportCounts` class tally (which does carry
 * `missingPublication`/`unknownLicense`/etc.), but does not claim an
 * "excluded" number it has no source for — a real gap to close in a future
 * slice if the stakeholder wants it, not silently invented here.
 */

// ---------------------------------------------------------------------------
// input shape
// ---------------------------------------------------------------------------

export interface SizeTotals {
  corpusBytes?: number;
  entityFileCount?: number;
}

/** D29-100 (P11 S1): see `ReportInput.adjacentCrossrefDedupe`'s own doc
 * comment. */
export interface AdjacentCrossrefDedupeStats {
  totalOccurrences: number;
  entitiesTouched: number;
}

export interface ReportInput {
  /** Every `report(cls, detail)` call across the WHOLE run (Foundry parse +
   * AoN parse + join), one shared counter — the caller threads a single
   * counting `report` callback through every stage to build this. */
  reportCounts: ReadonlyMap<string, number>;
  /** Non-fatal exemplar details for the classes worth showing a few examples
   * of in report.md (capped by `buildReportMarkdown`, not here). */
  reportExamples: ReadonlyMap<string, readonly string[]>;
  hardFailureCount: number;
  /** The PRE-drop join result — `join.categoryStats`/`collisions`/etc. stay
   * the join-QUALITY measurement (foundryIn/aonIn/exact/normalized/alias/
   * unjoined lists), unaffected by the D29-14 drop pass, because that's what
   * the STOP-condition / D29-15/-18 acceptance criteria audit. */
  join: JoinResult;
  /** S5c/D29-14: the POST-drop entity set actually written to the corpus —
   * every "final" summary stat (`finalEntityCount`, per-category `finalOut`,
   * license/edition breakdowns, proseOnly/variant counts) is computed from
   * THIS, not `join.entities` (which still includes every dropped
   * Foundry-only entity). */
  finalEntities: readonly CodexEntity[];
  /** S5c: the D29-14 drop-accounting section's data (per-category dropped
   * counts + the D29-17 carve-out kept counts + D29-98's activation-drop
   * sub-section). */
  dropAccounting: DropAccounting;
  /** D29-100 (P11 S1): the whole-document adjacent-crossref dedupe pass's
   * stats — `totalOccurrences` is the 1,147-occurrence pin (also visible via
   * the generic `adjacentCrossrefDeduped` reportCounts class, one call per
   * occurrence); `entitiesTouched` is the separate 123-entity pin, which has
   * no generic-counter equivalent. */
  adjacentCrossrefDedupe: AdjacentCrossrefDedupeStats;
  foundrySnapshotDocCount: number;
  aonSnapshotDocCount: number;
  sizeTotals?: SizeTotals;
  /** P4 (D29-39) S1: the four new report sections — all four builders'
   * stats objects, threaded straight through (no re-derivation here, same
   * "pure builder consumes upstream stats" posture this module already
   * follows for `join`/`dropAccounting`). */
  bookNormalization: BookNormalizeResult;
  sidebarAttachment: SidebarAttachResult;
  rulesTree: RulesTreeStats;
  sourcesIndex: SourcesIndexStats;
  /** P12 S1 (D29-114/-115): the post-drop class-stats augment pass's
   * counters (the `entities` array itself isn't needed here — it's already
   * folded into `finalEntities` above by the time the report is built). */
  classStatsAugment: Omit<AugmentClassStatsResult, "entities">;
}

// ---------------------------------------------------------------------------
// derived computations
// ---------------------------------------------------------------------------

export interface CappedList<T> {
  shown: T[];
  totalCount: number;
}

const UNJOINED_CAP = 20;

export function capList<T>(items: readonly T[], cap: number = UNJOINED_CAP): CappedList<T> {
  return { shown: items.slice(0, cap), totalCount: items.length };
}

export function computeFinalCategoryCounts(entities: readonly CodexEntity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of entities) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return counts;
}

export function computeLicenseBreakdown(entities: readonly CodexEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.source.license] = (counts[e.source.license] ?? 0) + 1;
  return counts;
}

export function computeEditionBreakdown(entities: readonly CodexEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.edition] = (counts[e.edition] ?? 0) + 1;
  return counts;
}

export function computeProseOnlyCount(entities: readonly CodexEntity[]): number {
  return entities.filter((e) => e.proseOnly === true).length;
}

export function computeVariantCount(entities: readonly CodexEntity[]): number {
  return entities.filter((e) => e.variantOf !== undefined).length;
}

// ---------------------------------------------------------------------------
// P1.6 (D29-19/-20, slice S6): statblock extraction coverage
//
// One row per extracted field: how many of the FINAL (post-drop) entities in
// the relevant population carry it, as a raw count + a percentage. A field's
// absence is often legitimate (an AoN-only creature/hazard has no Foundry
// Actor doc to extract from at all; a carve-out creature may genuinely lack a
// given sub-field in source) — this is a visibility tool for the stakeholder
// review (spec §9's "per-field extraction coverage %"), not a pass/fail gate.
// ---------------------------------------------------------------------------

export interface FieldCoverageRow {
  field: string;
  count: number;
  ofTotal: number;
  pct: number;
}

function coverageRow(field: string, count: number, ofTotal: number): FieldCoverageRow {
  return {
    field,
    count,
    ofTotal,
    pct: ofTotal > 0 ? Math.round((count / ofTotal) * 1000) / 10 : 0,
  };
}

function hasCreatureStats(e: CodexEntity): e is CodexEntity & { stats: CreatureStats } {
  return e.stats?.kind === "creature";
}

function hasHazardStats(e: CodexEntity): e is CodexEntity & { stats: HazardStats } {
  return e.stats?.kind === "hazard";
}

/** Per-field coverage over every `creature` entity in the final corpus
 * (D29-20's `CreatureStats` fields). */
export function computeCreatureStatsCoverage(entities: readonly CodexEntity[]): FieldCoverageRow[] {
  const creatures = entities.filter((e) => e.category === "creature");
  const total = creatures.length;
  const fields: Array<[string, (e: CodexEntity) => boolean]> = [
    ["speeds", (e) => hasCreatureStats(e) && e.stats.speeds !== undefined],
    ["abilityMods", (e) => hasCreatureStats(e) && e.stats.abilityMods !== undefined],
    ["senses", (e) => hasCreatureStats(e) && e.stats.senses !== undefined],
    ["languages", (e) => hasCreatureStats(e) && e.stats.languages !== undefined],
    ["immunities", (e) => hasCreatureStats(e) && e.stats.immunities !== undefined],
    ["resistances", (e) => hasCreatureStats(e) && e.stats.resistances !== undefined],
    ["weaknesses", (e) => hasCreatureStats(e) && e.stats.weaknesses !== undefined],
    ["skills", (e) => hasCreatureStats(e) && e.stats.skills !== undefined],
  ];
  return fields.map(([field, pred]) => coverageRow(field, creatures.filter(pred).length, total));
}

/** Per-field coverage over every `hazard` entity in the final corpus
 * (D29-20's `HazardStats` fields). */
export function computeHazardStatsCoverage(entities: readonly CodexEntity[]): FieldCoverageRow[] {
  const hazards = entities.filter((e) => e.category === "hazard");
  const total = hazards.length;
  const fields: Array<[string, (e: CodexEntity) => boolean]> = [
    ["hardness", (e) => hasHazardStats(e) && e.stats.hardness !== undefined],
    ["stealth", (e) => hasHazardStats(e) && e.stats.stealth !== undefined],
    ["isComplex", (e) => hasHazardStats(e) && e.stats.isComplex !== undefined],
    ["disable", (e) => hasHazardStats(e) && e.stats.disable !== undefined],
    ["routine", (e) => hasHazardStats(e) && e.stats.routine !== undefined],
    ["reset", (e) => hasHazardStats(e) && e.stats.reset !== undefined],
  ];
  return fields.map(([field, pred]) => coverageRow(field, hazards.filter(pred).length, total));
}

/** Per-field coverage over embedded items (not entities) — a `melee`/
 * `spellcastingEntry` item's own field presence, scanned across every kept
 * entity's `embeddedItems` (D29-20's strike/spellcasting fields). */
export function computeEmbeddedItemStatsCoverage(
  entities: readonly CodexEntity[],
): FieldCoverageRow[] {
  const meleeItems = entities.flatMap((e) =>
    (e.embeddedItems ?? []).filter((i) => i.type === "melee"),
  );
  const spellcastingItems = entities.flatMap((e) =>
    (e.embeddedItems ?? []).filter((i) => i.type === "spellcastingEntry"),
  );
  return [
    coverageRow(
      "melee.attackBonus",
      meleeItems.filter((i) => i.attackBonus !== undefined).length,
      meleeItems.length,
    ),
    coverageRow(
      "melee.damage",
      meleeItems.filter((i) => i.damage !== undefined).length,
      meleeItems.length,
    ),
    coverageRow(
      "spellcastingEntry.dc",
      spellcastingItems.filter((i) => i.dc !== undefined).length,
      spellcastingItems.length,
    ),
    coverageRow(
      "spellcastingEntry.tradition",
      spellcastingItems.filter((i) => i.tradition !== undefined).length,
      spellcastingItems.length,
    ),
  ];
}

export interface StatsCoverage {
  creature: FieldCoverageRow[];
  hazard: FieldCoverageRow[];
  embeddedItems: FieldCoverageRow[];
}

export function computeStatsCoverage(entities: readonly CodexEntity[]): StatsCoverage {
  return {
    creature: computeCreatureStatsCoverage(entities),
    hazard: computeHazardStatsCoverage(entities),
    embeddedItems: computeEmbeddedItemStatsCoverage(entities),
  };
}

// ---------------------------------------------------------------------------
// P3 S1 (D29-32/-33): facet-coverage section — per-category, per-key
// coverage/cardinality over the FINAL (post-drop) corpus, for EVERY key any
// entity in that category actually carries in `facets` (not just the ones
// `facetKeys.ts` shipped) — so a candidate the classifier DROPPED (e.g.
// `equipment.itemCategory`, `familiar-ability.actionCost`) is just as
// visible here as one it kept (`shipped: true`), per D29-33a's "no silent
// junk facets" guard: a fail is a correct, visible outcome, not a miss.
// ---------------------------------------------------------------------------

export interface FacetCoverageRow {
  category: string;
  key: string;
  count: number;
  ofTotal: number;
  pct: number;
  cardinality: number;
  /** Whether `key` is in `facetKeys.ts`'s allowlist for `category` (i.e.
   * ships on `IndexRow.facets`) — `false` means the classifier dropped it
   * (still present in the per-entity `facets` page-detail field). */
  shipped: boolean;
}

/** Distinct-VALUE count — for an array-valued facet (e.g. `traditions`),
 * counts distinct ELEMENTS across every entity, not distinct arrays (matches
 * how the classifier + the browse-facet option list both think about
 * cardinality: "how many selectable values", not "how many unique
 * combinations"). */
function cardinalityOf(values: readonly unknown[]): number {
  const seen = new Set<string>();
  for (const v of values) {
    if (Array.isArray(v)) {
      for (const item of v) seen.add(JSON.stringify(item));
    } else {
      seen.add(JSON.stringify(v));
    }
  }
  return seen.size;
}

export function computeFacetCoverage(entities: readonly CodexEntity[]): FacetCoverageRow[] {
  const byCategory = new Map<string, CodexEntity[]>();
  for (const e of entities) {
    const arr = byCategory.get(e.category) ?? [];
    arr.push(e);
    byCategory.set(e.category, arr);
  }

  const rows: FacetCoverageRow[] = [];
  for (const [category, categoryEntities] of byCategory) {
    const total = categoryEntities.length;
    const valuesByKey = new Map<string, unknown[]>();
    for (const e of categoryEntities) {
      for (const [key, value] of Object.entries(e.facets)) {
        const arr = valuesByKey.get(key) ?? [];
        arr.push(value);
        valuesByKey.set(key, arr);
      }
    }
    if (valuesByKey.size === 0) continue; // 73/88 categories carry no facets at all
    const shippedKeys = new Set<string>(facetKeysFor(category));
    for (const [key, values] of valuesByKey) {
      rows.push({
        category,
        key,
        count: values.length,
        ofTotal: total,
        pct: total > 0 ? Math.round((values.length / total) * 1000) / 10 : 0,
        cardinality: cardinalityOf(values),
        shipped: shippedKeys.has(key),
      });
    }
  }
  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
}

export interface FamilyCoverage {
  count: number;
  ofTotal: number;
  pct: number;
  distinctFamilies: number;
}

/** D29-33b: `creature.facets.family` coverage — measured over ALL final
 * `creature` entities (not just AoN-derived ones), so the denominator
 * matches every other coverage figure in this report. Ships in
 * `facetKeys.ts` regardless of this number (a stakeholder-sanctioned
 * navigational facet, not classifier-gated). */
export function computeFamilyCoverage(entities: readonly CodexEntity[]): FamilyCoverage {
  const creatures = entities.filter((e) => e.category === "creature");
  const withFamily = creatures.filter((e) => e.facets.family !== undefined);
  const distinctFamilies = new Set(withFamily.map((e) => e.facets.family)).size;
  return {
    count: withFamily.length,
    ofTotal: creatures.length,
    pct: creatures.length > 0 ? Math.round((withFamily.length / creatures.length) * 1000) / 10 : 0,
    distinctFamilies,
  };
}

export interface SupersededBreakdown {
  total: number;
  legacyEdition: number;
  remasterEdition: number;
}

/** D29-33c: the `IndexRow.superseded` predicate's own count, broken down by
 * `edition` — cross-checked (adversarial B2) against an independent scan of
 * `remasteredAs` non-empty across entity files in this slice's own
 * verification, not by this function (this IS that scan, applied to
 * `finalEntities` — the emitted `_index.json` rows are `toIndexRow`'s
 * projection of the exact same entities). */
export function computeSupersededBreakdown(entities: readonly CodexEntity[]): SupersededBreakdown {
  const superseded = entities.filter((e) => (e.remasteredAs?.length ?? 0) > 0);
  return {
    total: superseded.length,
    legacyEdition: superseded.filter((e) => e.edition === "legacy").length,
    remasterEdition: superseded.filter((e) => e.edition === "remaster").length,
  };
}

// ---------------------------------------------------------------------------
// P4 (D29-39) S1: report-JSON projections of the four new builders' stats
// (BookNormalizeResult carries a full `entities[]` array — never put on
// `report.json`; every other field here is already report-shaped).
// ---------------------------------------------------------------------------

export interface BookNormalizationJson {
  distinctBefore: number;
  distinctAfter: number;
  prefixMergeCount: number;
  caseFoldGroupCount: number;
  mergeTable: BookMergeRow[];
}

function bookNormalizationJson(r: BookNormalizeResult): BookNormalizationJson {
  return {
    distinctBefore: r.distinctBefore,
    distinctAfter: r.distinctAfter,
    prefixMergeCount: r.prefixMergeCount,
    caseFoldGroupCount: r.caseFoldGroupCount,
    mergeTable: r.mergeTable,
  };
}

export interface SidebarAttachmentJson {
  sidebarsTotal: number;
  sidebarsResolved: number;
  byHostCategory: SidebarAttachResult["byHostCategory"];
  maxPerHost: number;
  hostsWithSidebars: number;
}

function sidebarAttachmentJson(r: SidebarAttachResult): SidebarAttachmentJson {
  return {
    sidebarsTotal: r.sidebarsTotal,
    sidebarsResolved: r.sidebarsResolved,
    byHostCategory: r.byHostCategory,
    maxPerHost: r.maxPerHost,
    hostsWithSidebars: r.hostsWithSidebars,
  };
}

/** P12 S1 (D29-114/-115): the post-drop class-stats augment pass's report
 * projection — pins at (real corpus) 27 classStatsEmitted / 503 resolved /
 * 17 unresolved grants / derive-at-build subclassOptionsEmitted. */
export interface ClassStatsAugmentJson {
  classStatsEmitted: number;
  grantedFeaturesResolved: number;
  grantedFeaturesUnresolved: number;
  subclassOptionsEmitted: number;
  subclassOptionCounts: SubclassOptionCount[];
}

function classStatsAugmentJson(
  r: Omit<AugmentClassStatsResult, "entities">,
): ClassStatsAugmentJson {
  return {
    classStatsEmitted: r.classStatsEmitted,
    grantedFeaturesResolved: r.grantedFeaturesResolved,
    grantedFeaturesUnresolved: r.grantedFeaturesUnresolved,
    subclassOptionsEmitted: r.subclassOptionsEmitted,
    subclassOptionCounts: r.subclassOptionCounts,
  };
}

// ---------------------------------------------------------------------------
// report.json
// ---------------------------------------------------------------------------

export interface CategoryJoinJson {
  category: string;
  foundryIn: number;
  aonIn: number;
  finalOut: number;
  exact: number;
  normalized: number;
  alias: number;
  variants: number;
  joinRatePct: number | null;
  unjoinedForeign: CappedList<{ id: string; name: string }>;
  unjoinedAon: CappedList<{ id: string; name: string }>;
}

export interface ReportJson {
  hardFailureCount: number;
  foundrySnapshotDocCount: number;
  aonSnapshotDocCount: number;
  /** The POST-drop corpus size (D29-14) — `finalEntities.length`. */
  finalEntityCount: number;
  categories: CategoryJoinJson[];
  collisions: CollisionReport[];
  legacyPairing: {
    pairingCount: number;
    redirectCrossCheck: RedirectCrossCheck;
  };
  crossrefPatching: PatchStats;
  aliasesApplied: Array<{ foundryId: string; aonId: string; note: string }>;
  licenseBreakdown: Record<string, number>;
  editionBreakdown: Record<string, number>;
  proseOnlyCount: number;
  variantCount: number;
  reportCounts: Record<string, number>;
  sizeTotals: SizeTotals;
  /** S5c/D29-14/-98: the drop-accounting section. */
  dropAccounting: DropAccounting;
  /** D29-100 (P11 S1): the adjacent-crossref-dedupe pass's stats. */
  adjacentCrossrefDedupe: AdjacentCrossrefDedupeStats;
  /** D29-19 (P1.6): `character`-typed Actors excluded before assembly
   * (`reportCounts.excludedActors` — pulled out to its own top-level field
   * since spec §9 calls it out by name, not just generic residue). */
  excludedActorsCount: number;
  /** D29-20 (P1.6): per-field extraction coverage % over the final corpus. */
  statsCoverage: StatsCoverage;
  /** P3 S1 (D29-32/-33): per-category, per-key facet coverage/cardinality —
   * every candidate the classifier considered, shipped or dropped. */
  facetCoverage: FacetCoverageRow[];
  /** D29-33b: `creature.family` coverage (ships regardless of the number). */
  familyCoverage: FamilyCoverage;
  /** D29-33c: the `superseded` predicate's count, by edition (adversarial
   * B2's 10,970 legacy + 42 remaster = 11,012 pin). */
  supersededBreakdown: SupersededBreakdown;
  /** P4 (D29-39) S1: the mechanical book-name normalization pass. */
  bookNormalization: BookNormalizationJson;
  /** P4 (D29-39) S1: the `attachedSidebars` reverse-join. */
  sidebarAttachment: SidebarAttachmentJson;
  /** P4 (D29-39) S1: the `rules-tree.json` builder's stats. */
  rulesTree: RulesTreeStats;
  /** P4 (D29-43) S1: the `sources-index.json` builder's stats. */
  sourcesIndex: SourcesIndexStats;
  /** P12 S1 (D29-114/-115): the post-drop class-stats augment pass. */
  classStatsAugment: ClassStatsAugmentJson;
}

function categoryJson(stat: CategoryStat, finalOut: number): CategoryJoinJson {
  const joined = stat.exact + stat.normalized + stat.alias;
  return {
    category: stat.category,
    foundryIn: stat.foundryTotal,
    aonIn: stat.aonTotal,
    finalOut,
    exact: stat.exact,
    normalized: stat.normalized,
    alias: stat.alias,
    variants: stat.variants,
    joinRatePct:
      stat.foundryTotal > 0 ? Math.round((joined / stat.foundryTotal) * 1000) / 10 : null,
    unjoinedForeign: capList(stat.unjoinedForeign),
    unjoinedAon: capList(stat.unjoinedAon),
  };
}

export function buildReportJson(input: ReportInput): ReportJson {
  const finalCounts = computeFinalCategoryCounts(input.finalEntities);
  const categories = input.join.categoryStats
    .map((stat) => categoryJson(stat, finalCounts.get(stat.category) ?? 0))
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    hardFailureCount: input.hardFailureCount,
    foundrySnapshotDocCount: input.foundrySnapshotDocCount,
    aonSnapshotDocCount: input.aonSnapshotDocCount,
    finalEntityCount: input.finalEntities.length,
    categories,
    collisions: input.join.collisions,
    legacyPairing: {
      pairingCount: input.join.pairingCount,
      redirectCrossCheck: input.join.redirectCrossCheck,
    },
    crossrefPatching: input.join.patchStats,
    aliasesApplied: input.join.aliasesApplied,
    licenseBreakdown: computeLicenseBreakdown(input.finalEntities),
    editionBreakdown: computeEditionBreakdown(input.finalEntities),
    proseOnlyCount: computeProseOnlyCount(input.finalEntities),
    variantCount: computeVariantCount(input.finalEntities),
    reportCounts: Object.fromEntries(
      [...input.reportCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    sizeTotals: input.sizeTotals ?? {},
    dropAccounting: input.dropAccounting,
    adjacentCrossrefDedupe: input.adjacentCrossrefDedupe,
    excludedActorsCount: input.reportCounts.get("excludedActors") ?? 0,
    statsCoverage: computeStatsCoverage(input.finalEntities),
    facetCoverage: computeFacetCoverage(input.finalEntities),
    familyCoverage: computeFamilyCoverage(input.finalEntities),
    supersededBreakdown: computeSupersededBreakdown(input.finalEntities),
    bookNormalization: bookNormalizationJson(input.bookNormalization),
    sidebarAttachment: sidebarAttachmentJson(input.sidebarAttachment),
    rulesTree: input.rulesTree,
    sourcesIndex: input.sourcesIndex,
    classStatsAugment: classStatsAugmentJson(input.classStatsAugment),
  };
}

// ---------------------------------------------------------------------------
// report.md
// ---------------------------------------------------------------------------

function mdTable(
  headers: readonly string[],
  rows: ReadonlyArray<readonly (string | number)[]>,
): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const sepLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((r) => `| ${r.map(String).join(" | ")} |`);
  return [headerLine, sepLine, ...rowLines].join("\n");
}

const LOW_JOIN_THRESHOLD = 50;

/**
 * Builds `report.md` (spec §3: "make report.md scannable — tables,
 * worst-offender lists"). STOP-condition categories (spec §6 Risks: a
 * mechanical category with BOTH sources present sitting <50% joined after
 * normalization + aliases) are called out at the TOP, not buried in the
 * per-category table.
 */
export function buildReportMarkdown(json: ReportJson): string {
  const lines: string[] = [];
  lines.push("# codex P1 transform report", "");
  lines.push(
    `Foundry snapshot: **${json.foundrySnapshotDocCount}** docs · AoN snapshot: **${json.aonSnapshotDocCount}** docs · final corpus: **${json.finalEntityCount}** entities · hard failures: **${json.hardFailureCount}**`,
    "",
  );

  const stopCategories = json.categories.filter(
    (c) =>
      c.foundryIn > 0 &&
      c.aonIn > 0 &&
      c.joinRatePct !== null &&
      c.joinRatePct < LOW_JOIN_THRESHOLD,
  );
  if (stopCategories.length > 0) {
    lines.push("## ⚠ STOP-condition categories (<50% joined, both sources present)", "");
    lines.push(
      mdTable(
        ["category", "foundryIn", "aonIn", "joined", "rate"],
        stopCategories.map((c) => [
          c.category,
          c.foundryIn,
          c.aonIn,
          c.exact + c.normalized + c.alias,
          `${c.joinRatePct}%`,
        ]),
      ),
      "",
      "Per spec §6 Risks: re-decide the join key with the stakeholder before P2 — do NOT silently fuzzy-match.",
      "",
    );
  } else {
    lines.push(
      "No category with both sources present sits below the 50% join-rate STOP threshold.",
      "",
    );
  }

  lines.push("## Per-category join rates", "");
  lines.push(
    mdTable(
      [
        "category",
        "foundryIn",
        "aonIn",
        "finalOut",
        "exact",
        "normalized",
        "alias",
        "variants",
        "rate",
        "unjoinedF",
        "unjoinedA",
      ],
      json.categories.map((c) => [
        c.category,
        c.foundryIn,
        c.aonIn,
        c.finalOut,
        c.exact,
        c.normalized,
        c.alias,
        c.variants,
        c.joinRatePct === null ? "—" : `${c.joinRatePct}%`,
        c.unjoinedForeign.totalCount,
        c.unjoinedAon.totalCount,
      ]),
    ),
    "",
  );

  lines.push(
    "## Worst-offender categories (lowest join rate, foundry present)",
    "",
    "`aonIn = 0` means the category has no AoN counterpart at all (Foundry-only by design, e.g. `boon`/`pfs-boon`/`kingdom-feature`/`effect` — categoryMap.ts's own documented Foundry-only buckets) — a 0% rate there is EXPECTED, not a join failure; only rows with `aonIn > 0` are genuine unjoined residue worth reading.",
    "",
  );
  const worst = json.categories
    .filter((c) => c.foundryIn > 0 && c.joinRatePct !== null)
    .sort((a, b) => {
      // Genuine residue (aonIn > 0) sorts before the "no AoN category at
      // all" rows, so the list reads worst-real-offender-first.
      const realA = a.aonIn > 0 ? 0 : 1;
      const realB = b.aonIn > 0 ? 0 : 1;
      if (realA !== realB) return realA - realB;
      return (a.joinRatePct ?? 0) - (b.joinRatePct ?? 0);
    })
    .slice(0, 10);
  lines.push(
    mdTable(
      ["category", "rate", "foundryIn", "aonIn", "sample unjoined"],
      worst.map((c) => [
        c.category,
        `${c.joinRatePct}%`,
        c.foundryIn,
        c.aonIn,
        c.unjoinedForeign.shown
          .slice(0, 5)
          .map((u) => u.name)
          .join(", "),
      ]),
    ),
    "",
  );

  lines.push("## Slug collisions", "");
  const legacyPairs = json.collisions.filter((c) => c.kind === "legacyPair");
  const residual = json.collisions.filter((c) => c.kind === "residual");
  const anomalies = json.collisions.filter((c) => c.kind === "legacyPairAnomaly");
  lines.push(
    `${json.collisions.length} total collision groups — ${legacyPairs.length} legacy-pair (\`@legacy\` suffix), ${residual.length} residual (deterministic \`-2\`/\`-3\`… suffix), ${anomalies.length} legacy-pair anomalies (same-edition, fell back to residual scheme).`,
    "",
  );
  if (residual.length > 0) {
    lines.push(
      mdTable(
        ["preId", "resolved members (finalId : origin : edition : name)"],
        residual
          .slice(0, 20)
          .map((c) => [
            c.preId,
            c.members
              .map((m) => `${m.finalId} : ${m.origin} : ${m.edition} : ${m.name}`)
              .join("; "),
          ]),
      ),
      "",
    );
  }
  if (legacyPairs.length > 0) {
    lines.push("### Legacy/remaster shared-slug pairs", "");
    lines.push(
      mdTable(
        ["preId", "legacy id", "remaster id"],
        legacyPairs.map((c) => {
          const legacy = c.members.find((m) => m.edition === "legacy");
          const remaster = c.members.find((m) => m.edition === "remaster");
          return [c.preId, legacy?.finalId ?? "—", remaster?.finalId ?? "—"];
        }),
      ),
      "",
    );
  }

  lines.push("## Legacy/remaster pairing", "");
  lines.push(
    `${json.legacyPairing.pairingCount} remasteredAs/legacyOf edges set from AoN's own \`remaster_id\`/\`legacy_id\` arrays (primary source of truth, D29-7). Foundry \`remaster-changes\` cross-check: ${json.legacyPairing.redirectCrossCheck.agreements} agree, ${json.legacyPairing.redirectCrossCheck.disagreements} disagree (AoN wins on disagreement).`,
    "",
  );

  lines.push("## Crossref/embed patching", "");
  lines.push(
    mdTable(
      ["patched crossrefs (renamed)", "broken after patch", "embeds resolved", "embeds unresolved"],
      [
        [
          json.crossrefPatching.patchedCrossrefs,
          json.crossrefPatching.brokenAfterPatch,
          json.crossrefPatching.resolvedEmbeds,
          json.crossrefPatching.unresolvedEmbeds,
        ],
      ],
    ),
    "",
  );

  lines.push("## Aliases applied (`join-aliases.json`)", "");
  if (json.aliasesApplied.length === 0) {
    lines.push("None applied in this run.", "");
  } else {
    lines.push(
      mdTable(
        ["foundryId", "aonId", "note"],
        json.aliasesApplied.map((a) => [a.foundryId, a.aonId, a.note]),
      ),
      "",
    );
  }

  lines.push("## License breakdown", "");
  lines.push(
    mdTable(
      ["license", "count"],
      Object.entries(json.licenseBreakdown).sort(([a], [b]) => a.localeCompare(b)),
    ),
    "",
  );

  lines.push("## Edition breakdown", "");
  lines.push(
    mdTable(
      ["edition", "count"],
      Object.entries(json.editionBreakdown).sort(([a], [b]) => a.localeCompare(b)),
    ),
    "",
  );

  lines.push("## proseOnly / variantOf", "");
  lines.push(
    `proseOnly entities: **${json.proseOnlyCount}** · variantOf entities: **${json.variantCount}**`,
    "",
  );

  lines.push("## Report-class counts (non-fatal residue, whole run)", "");
  const reportEntries = Object.entries(json.reportCounts);
  lines.push(
    reportEntries.length > 0
      ? mdTable(["class", "count"], reportEntries)
      : "No non-fatal residue reported.",
    "",
  );

  lines.push("## Size totals", "");
  lines.push(
    json.sizeTotals.corpusBytes !== undefined || json.sizeTotals.entityFileCount !== undefined
      ? mdTable(
          ["corpus bytes", "entity file count"],
          [[json.sizeTotals.corpusBytes ?? "—", json.sizeTotals.entityFileCount ?? "—"]],
        )
      : "Not measured at this stage — filled in by `emit.ts`.",
    "",
  );

  lines.push("## AoN-primary drop pass (D29-14/-17)", "");
  lines.push(
    `The corpus keeps every AoN-only entity, every merged entity, every variant of a merged family, and Foundry-only entities in the \`creature\`/\`hazard\` carve-out (D29-17) — every OTHER Foundry-only entity is dropped at emit. **${json.dropAccounting.totalDropped}** entities dropped across ${json.dropAccounting.byCategory.length} categories.`,
    "",
  );
  lines.push("### Dropped, by category", "");
  lines.push(
    json.dropAccounting.byCategory.length > 0
      ? mdTable(
          ["category", "dropped"],
          json.dropAccounting.byCategory.map((c) => [c.category, c.dropped]),
        )
      : "Nothing dropped.",
    "",
  );
  lines.push("### Carve-out (D29-17) — Foundry-only entities KEPT anyway", "");
  lines.push(
    json.dropAccounting.carveOut.length > 0
      ? mdTable(
          ["category", "kept (Foundry-only)"],
          json.dropAccounting.carveOut.map((c) => [c.category, c.kept]),
        )
      : "No carve-out entities in this run.",
    "",
  );

  lines.push("## Activation-debris drop pass (D29-98, P11 S1)", "");
  lines.push(
    `Widened drop of AoN-only \`action\` entities whose (RESOLVED, post-D29-99) name matches either family: (i) starts with \`(\` — the "(manipulate)" shape; (ii) starts with a digit AND contains a parenthesized activation string — the "1 hour (envision, Interact)" shape. The 9-entity keep-list (\`action/manipulate\`, \`concentrate\`, \`concentration\`, \`command\`, \`concentrate-manipulate\`, \`envision\`, \`concentration-3\`, \`concentration-4\`, \`spellshape\`) survives regardless (real inbound crossrefs/embeds). **${json.dropAccounting.activationDrop.total}** dropped — **${json.dropAccounting.activationDrop.parenFamily}** family (i) / **${json.dropAccounting.activationDrop.digitFamily}** family (ii). Dangling \`remasteredAs\`/\`legacyOf\` edges into the FULL drop set (activation ∪ AoN-primary) stripped off survivors: **${json.dropAccounting.editionPointersStripped}**.`,
    "",
  );
  lines.push(
    "### Family (ii) — every digit-leading dropped name (orchestrator eyeball review)",
    "",
  );
  lines.push(
    "The widened family-(ii) predicate is new and un-censused at spec time — every dropped name is listed here in FULL (never capped) for review before the S1 commit.",
    "",
  );
  lines.push(
    json.dropAccounting.activationDrop.digitFamilyNames.length > 0
      ? mdTable(
          ["id: name"],
          json.dropAccounting.activationDrop.digitFamilyNames.map((n) => [n]),
        )
      : "No family-(ii) names dropped this run.",
    "",
  );

  lines.push("## Debris drop-families (D29-133, P14 S1)", "");
  lines.push(
    `Two more predicate drop-families, same "override the keep, checked first" shape as the activation-debris family above. **Journal section headers** (\`journalSectionHeaderDropFamily\`: a \`proseOnly\` Foundry-journal page with an EMPTY body — a bare section-header divider journals.ts's merge-vs-standalone decision never content-checked): **${json.dropAccounting.journalSectionHeaderDrop}** dropped (pins at 4 on the real corpus — \`ancestry/{common,uncommon,rare}\`, \`archetype/archetypes\`; \`ancestry/index\`/\`archetype/index\` are non-empty-body and survive). **Unknown-book creature husks** (\`unknownBookHuskDropFamily\`: a \`creature\` doc with \`book:"unknown"\`, empty body, zero facets, zero traits — an orphaned Foundry Actor with nothing extractable): **${json.dropAccounting.unknownBookHuskDrop}** dropped (pins at 5 — \`creature/{daji-level-1,daji-level-3,daji-level-5,flappy,twinsprout}\`).`,
    "",
  );

  lines.push("## Adjacent-crossref dedupe (D29-100, P11 S1)", "");
  lines.push(
    `Whole-document post-join pre-emit walk over body + loreBody + embeddedItems + mastheadExtra + hazard stats.disable/routine/reset — collapses RUNS of crossref nodes with identical targetId and equivalent (apostrophe/case-folded) display, separated only by whitespace/punctuation-only text, to one crossref + one separator. **${json.adjacentCrossrefDedupe.totalOccurrences}** duplicate occurrences collapsed across **${json.adjacentCrossrefDedupe.entitiesTouched}** entities (epicenter: \`domain/*\` "Deities" masthead lists).`,
    "",
  );

  lines.push("## Statblock extraction (P1.6 — D29-19/-20/-21)", "");
  lines.push(
    `\`character\`-typed Actors excluded before assembly (D29-19 npc-only creature import): **${json.excludedActorsCount}**.`,
    "",
  );
  lines.push(
    "Per-field extraction coverage %, over the FINAL (post-drop) corpus — absence is often legitimate (an AoN-only creature/hazard has no Foundry Actor doc to extract from at all), so this is a visibility table for review, not a pass/fail gate.",
    "",
  );
  function coverageTable(title: string, rows: FieldCoverageRow[]): void {
    lines.push(`### ${title}`, "");
    lines.push(
      mdTable(
        ["field", "count", "of", "pct"],
        rows.map((r) => [r.field, r.count, r.ofTotal, `${r.pct}%`]),
      ),
      "",
    );
  }
  coverageTable("CreatureStats fields (creature category)", json.statsCoverage.creature);
  coverageTable("HazardStats fields (hazard category)", json.statsCoverage.hazard);
  coverageTable("EmbeddedItem strike/spellcasting fields", json.statsCoverage.embeddedItems);

  lines.push("## Facet coverage (P3 S1 — D29-32/-33)", "");
  lines.push(
    "Per-category, per-key coverage/cardinality for every `facets` key ANY entity in that category carries — `shipped=yes` means `facetKeys.ts` allowlists it onto `IndexRow.facets` (the classifier: coverage ≥40% and cardinality in the soft 2..~60 range); `shipped=no` is a candidate the classifier dropped — it still round-trips into the per-entity `facets` field (page detail), just never a browse/search filter. `SPILLOVER_FACET_KEYS` (`featLevel`/`rank`, proven exact `level` duplicates) are banned from every allowlist regardless of their own coverage/cardinality below.",
    "",
  );
  lines.push(
    mdTable(
      ["category", "key", "shipped", "count", "of", "pct", "cardinality"],
      json.facetCoverage.map((r) => [
        r.category,
        r.key,
        r.shipped ? "yes" : "no",
        r.count,
        r.ofTotal,
        `${r.pct}%`,
        r.cardinality,
      ]),
    ),
    "",
  );
  lines.push("### `creature.family` coverage (D29-33b)", "");
  lines.push(
    `**${json.familyCoverage.count}** of **${json.familyCoverage.ofTotal}** final creature entities (**${json.familyCoverage.pct}%**) carry a \`family\` value — **${json.familyCoverage.distinctFamilies}** distinct families. Ships in \`facetKeys.ts\` regardless of this number (a stakeholder-sanctioned navigational facet, D29-33b) — the gap is real, not an extraction miss: AoN's own \`creature_family_markdown\` is empty on the remaining docs, and Foundry-only/variant creatures have no AoN meta to populate it from at all.`,
    "",
  );
  lines.push("## Book-name normalization (P4 — D29-39)", "");
  lines.push(
    `${json.bookNormalization.distinctBefore} distinct raw \`source.book\` strings collapse to **${json.bookNormalization.distinctAfter}** — ${json.bookNormalization.prefixMergeCount} prefix merges (\`"Pathfinder " + <AoN book>\`), ${json.bookNormalization.caseFoldGroupCount} case-fold groups. Mechanical only — no hand-curated aliases (residual splits accepted).`,
    "",
  );
  lines.push("### Full before→after mapping table", "");
  lines.push(
    json.bookNormalization.mergeTable.length > 0
      ? mdTable(
          ["from", "to", "entityCount", "kind"],
          json.bookNormalization.mergeTable.map((r) => [r.from, r.to, r.entityCount, r.kind]),
        )
      : "No book strings changed this run.",
    "",
  );

  lines.push("## Attached sidebars (P4 — D29-39)", "");
  lines.push(
    `${json.sidebarAttachment.sidebarsResolved}/${json.sidebarAttachment.sidebarsTotal} sidebar entities resolved to a living host (via pickCanonical → aonId → aonIdToFinalId); **${json.sidebarAttachment.hostsWithSidebars}** distinct hosts gained ≥1 sidebar; max sidebars on one host: **${json.sidebarAttachment.maxPerHost}**.`,
    "",
  );
  lines.push("### Attachment coverage by host category", "");
  lines.push(
    json.sidebarAttachment.byHostCategory.length > 0
      ? mdTable(
          ["host category", "sidebars attached"],
          json.sidebarAttachment.byHostCategory.map((r) => [r.category, r.count]),
        )
      : "No sidebars attached.",
    "",
  );

  lines.push("## Rules tree (P4 — D29-39)", "");
  lines.push(
    `${json.rulesTree.totalDocs} rules docs across **${json.rulesTree.bookCount}** books · **${json.rulesTree.rootCount}** roots (**${json.rulesTree.childlessRootCount}** childless) · **${json.rulesTree.syntheticCount}** synthetic nodes (pinned at 3 — growth is report-visible, not silently accepted) · **${json.rulesTree.parentTieBreakCount}** parent tie-breaks (lowest aonId).`,
    "",
  );
  lines.push(
    "### Parent-fallback hits (name-only, root-preferring — expect only the Rules Elements family)",
    "",
  );
  lines.push(
    json.rulesTree.fallbackHits.length > 0
      ? mdTable(
          ["book", "parentName", "path", "resolvedTo"],
          json.rulesTree.fallbackHits.map((h) => [
            h.book,
            h.parentName,
            h.path.join(" > "),
            h.resolvedTo,
          ]),
        )
      : "No fallback hits this run.",
    "",
  );
  lines.push("### Sibling-group chain coverage, per book", "");
  lines.push(
    json.rulesTree.siblingChainCoverage.length > 0
      ? mdTable(
          ["book", "groups", "fully chained", "pct"],
          json.rulesTree.siblingChainCoverage.map((r) => [
            r.book,
            r.groups,
            r.fullyChained,
            `${r.pct}%`,
          ]),
        )
      : "No sibling groups.",
    "",
  );

  lines.push("## Sources index (P4 — D29-43)", "");
  lines.push(
    mdTable(
      [
        "total books",
        "classified",
        "Other",
        "total entities",
        "classified entities",
        "Other entities",
        "classified %",
        "<90% guard tripped",
      ],
      [
        [
          json.sourcesIndex.totalBooks,
          json.sourcesIndex.classifiedBooks,
          json.sourcesIndex.otherBooks,
          json.sourcesIndex.totalEntities,
          json.sourcesIndex.classifiedEntities,
          json.sourcesIndex.otherEntities,
          `${json.sourcesIndex.classifiedEntityPct}%`,
          json.sourcesIndex.belowNinetyPctGuard ? "YES" : "no",
        ],
      ],
    ),
    "",
    'The "Other" bucket (books with zero AoN citations, ~253/5.4% of entities expected) renders last + collapsed at `/sources` — a recorded expectation, not a bug.',
    "",
  );

  lines.push("### `superseded` breakdown (D29-33c)", "");
  lines.push(
    mdTable(
      ["total superseded", "legacy edition", "remaster edition"],
      [
        [
          json.supersededBreakdown.total,
          json.supersededBreakdown.legacyEdition,
          json.supersededBreakdown.remasterEdition,
        ],
      ],
    ),
    "",
    'Predicate: `remasteredAs` non-empty — NOT `edition === "legacy"` (which would wrongly hide never-remastered content). The 42 remaster-edition members are the same-edition pairing anomalies (`legacyPairSameEdition`) whose `remasteredAs` still points somewhere real.',
    "",
  );

  lines.push("## Class stats augment (P12 S1 — D29-114/-115)", "");
  lines.push(
    mdTable(
      [
        "classStatsEmitted",
        "grantedFeaturesResolved",
        "grantedFeaturesUnresolved",
        "subclassOptionsEmitted",
      ],
      [
        [
          json.classStatsAugment.classStatsEmitted,
          json.classStatsAugment.grantedFeaturesResolved,
          json.classStatsAugment.grantedFeaturesUnresolved,
          json.classStatsAugment.subclassOptionsEmitted,
        ],
      ],
    ),
    "",
    "`grantedFeatures.targetId` nulls out a D29-14 unjoined-residue drop (e.g. cleric's First..Final Doctrine) — the class doc's own uuid-resolved grant still appears in the progression table as plain text (render-side), never silently dropped.",
    "",
  );
  lines.push("### Subclass options per (class, category) — spot-check pins", "");
  lines.push(
    json.classStatsAugment.subclassOptionCounts.length > 0
      ? mdTable(
          ["classId", "category", "current", "legacy"],
          json.classStatsAugment.subclassOptionCounts.map((r) => [
            r.classId,
            r.category,
            r.current,
            r.legacy,
          ]),
        )
      : "No subclass-mapped classes this run.",
    "",
  );

  return lines.join("\n");
}
