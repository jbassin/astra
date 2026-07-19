// P12 S3 (D29-119) — the pure, directly-testable derivations `ClassPage.tsx`
// builds its progression table and Core Traits box from. Split out of the
// component itself (same "pure core / thin JSX shell" split `nodes.tsx`'s
// `collectEmbedTargetIds` already uses) so the level-grouping/cadence/
// suppression logic is unit-testable without a React render.

import type { ClassStats, GrantedFeature } from "../../schema/entity";
import type { CodexNode } from "../../schema/nodes";
import { collectText } from "./text";

/** D29-119 — proficiency ranks are numeric 0..4 everywhere in `ClassStats`
 * (perception/savingThrows/attacks/defenses); this is the ONE render-side
 * display mapping every one of those rows shares (the spec's own "ranks stay
 * numeric 0-4; display mapping is render-side" text, D29-113). `default`
 * degrades to a bare "Rank N" rather than throwing — belt-and-braces, the
 * schema itself already constrains every real value to 0..4. */
export function rankLabel(rank: number): string {
  switch (rank) {
    case 0:
      return "Untrained";
    case 1:
      return "Trained";
    case 2:
      return "Expert";
    case 3:
      return "Master";
    case 4:
      return "Legendary";
    default:
      return `Rank ${rank}`;
  }
}

/** D29-119 — the progression table's cadence-cell text, lowercase, exactly
 * the spec's own literal wording ("class feat", "skill increase", ...). Order
 * matches `ClassFeatLevelsSchema`'s own field order (`entity.ts`). */
const CADENCE_LABELS: ReadonlyArray<{
  key: keyof ClassStats["featLevels"];
  label: string;
}> = [
  { key: "classFeat", label: "class feat" },
  { key: "ancestryFeat", label: "ancestry feat" },
  { key: "skillFeat", label: "skill feat" },
  { key: "generalFeat", label: "general feat" },
  { key: "skillIncrease", label: "skill increase" },
];

/** Every cadence label that fires at `level` (0, 1, or more — a level can
 * carry several cadence entries at once, e.g. fighter's level 2 is BOTH a
 * class feat and a skill feat level). Never assumes a "standard" cadence —
 * each array is read verbatim off `featLevels`, per D29-113's own measured
 * irregular cases (investigator/rogue dense 2-20; swashbuckler's 13-entry
 * skillFeatLevels). */
export function cadenceLabelsAtLevel(
  featLevels: ClassStats["featLevels"],
  level: number,
): string[] {
  const labels: string[] = [];
  for (const { key, label } of CADENCE_LABELS) {
    if (featLevels[key].includes(level)) labels.push(label);
  }
  return labels;
}

/** D29-119 — one progression-table row: every grant at `level` (raw, in the
 * augment pass's own (level, name) sorted order — including the D29-114
 * `targetId: null` stubs, which the caller renders as plain text) plus every
 * cadence label active at `level`. A level with neither is still emitted
 * (both arrays empty) — the caller renders an em-dash for that case, never
 * skips the row (levels 1-20 always render, spec's own "rows 1-20" text). */
export interface ProgressionRow {
  level: number;
  grants: readonly GrantedFeature[];
  cadence: readonly string[];
}

const MAX_CLASS_LEVEL = 20;

export function buildProgressionRows(
  stats: Pick<ClassStats, "grantedFeatures" | "featLevels">,
  maxLevel: number = MAX_CLASS_LEVEL,
): ProgressionRow[] {
  const grants = stats.grantedFeatures ?? [];
  const rows: ProgressionRow[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    rows.push({
      level,
      grants: grants.filter((g) => g.level === level),
      cadence: cadenceLabelsAtLevel(stats.featLevels, level),
    });
  }
  return rows;
}

/** D29-119 — the structural suppression predicate: a `table` node whose
 * header row is EXACTLY `["Your Level", "Class Features"]` (measured: occurs
 * exactly once across all 27 real stats-bearing classes — the raw AoN
 * progression table, now redundant with the structured render above it).
 * Cell text lives under each `text` node's own `content` key, hence
 * `collectText` rather than a naive `.content` read (a cell can carry marks/
 * crossrefs, not just a bare text node in general, even though every real
 * measured instance here is plain text). Deliberately keyed on ANY header
 * row matching (`TableRow.header` is per-row, `nodes.ts`'s own doc comment —
 * a table can mix header/body rows freely), not just row 0. */
export function isClassProgressionTable(node: CodexNode): boolean {
  if (node.kind !== "table") return false;
  return node.rows.some((row) => {
    if (!row.header || row.cells.length !== 2) return false;
    const [levelCell, featuresCell] = row.cells;
    return (
      collectText(levelCell ?? []).trim() === "Your Level" &&
      collectText(featuresCell ?? []).trim() === "Class Features"
    );
  });
}

/** Removes every node matching `isClassProgressionTable` from `body`,
 * reporting how many were removed — the real corpus's own invariant is
 * exactly one per stats-bearing class (`ClassPage.tsx` warns, fail-soft,
 * when that doesn't hold rather than throwing: a genuinely-drifted future
 * AoN re-snapshot shouldn't 500 the page over this). */
export function stripClassProgressionTable(body: readonly CodexNode[]): {
  body: CodexNode[];
  suppressedCount: number;
} {
  let suppressedCount = 0;
  const out: CodexNode[] = [];
  for (const node of body) {
    if (isClassProgressionTable(node)) {
      suppressedCount++;
      continue;
    }
    out.push(node);
  }
  return { body: out, suppressedCount };
}
