import type { CodexEntity } from "../schema/entity";
import type {
  CategoryStat,
  CollisionReport,
  JoinResult,
  PatchStats,
  RedirectCrossCheck,
} from "./join";

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

export interface ReportInput {
  /** Every `report(cls, detail)` call across the WHOLE run (Foundry parse +
   * AoN parse + join), one shared counter — the caller threads a single
   * counting `report` callback through every stage to build this. */
  reportCounts: ReadonlyMap<string, number>;
  /** Non-fatal exemplar details for the classes worth showing a few examples
   * of in report.md (capped by `buildReportMarkdown`, not here). */
  reportExamples: ReadonlyMap<string, readonly string[]>;
  hardFailureCount: number;
  join: JoinResult;
  foundrySnapshotDocCount: number;
  aonSnapshotDocCount: number;
  sizeTotals?: SizeTotals;
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
  const finalCounts = computeFinalCategoryCounts(input.join.entities);
  const categories = input.join.categoryStats
    .map((stat) => categoryJson(stat, finalCounts.get(stat.category) ?? 0))
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    hardFailureCount: input.hardFailureCount,
    foundrySnapshotDocCount: input.foundrySnapshotDocCount,
    aonSnapshotDocCount: input.aonSnapshotDocCount,
    finalEntityCount: input.join.entities.length,
    categories,
    collisions: input.join.collisions,
    legacyPairing: {
      pairingCount: input.join.pairingCount,
      redirectCrossCheck: input.join.redirectCrossCheck,
    },
    crossrefPatching: input.join.patchStats,
    aliasesApplied: input.join.aliasesApplied,
    licenseBreakdown: computeLicenseBreakdown(input.join.entities),
    editionBreakdown: computeEditionBreakdown(input.join.entities),
    proseOnlyCount: computeProseOnlyCount(input.join.entities),
    variantCount: computeVariantCount(input.join.entities),
    reportCounts: Object.fromEntries(
      [...input.reportCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    sizeTotals: input.sizeTotals ?? {},
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

  return lines.join("\n");
}
