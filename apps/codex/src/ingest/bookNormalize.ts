import type { CodexEntity } from "../schema/entity";

/**
 * P4 (D29-39): the mechanical book-name normalization pass — stakeholder:
 * "mechanical only, no hand-curation" (spec §2). Runs over EVERY final
 * entity's `source.book` string (corpus-wide, not just rules — the P4 tree/
 * sources-index scoping needs a clean per-book key, and `source.book` feeds
 * browse facets + search meta + collision disambiguation too, spec §6's
 * "site-wide blast radius" risk note).
 *
 * Three mechanical rules, in order:
 *   1. Whitespace: trim + strip embedded `\r`/`\n`/`\t` + collapse internal
 *      whitespace runs (the same disease `aonFacets.ts`'s
 *      `normalizeBreadcrumbElement` / `licenseMap.ts`'s `normalizeBookName`
 *      already fix for their own fields — AoN's own `primarySource.book` is
 *      ALREADY clean by the time it lands in `source.book` via
 *      `normalizeBookName`, but Foundry's own `publication.title` never goes
 *      through that cleaning, `foundryEntities.ts`'s `deriveSourceAndEdition`
 *      — so this pass is the first point EVERY book string, AoN or Foundry
 *      origin, is guaranteed clean).
 *   2. Case-insensitive dedup: cleaned strings that only differ by case
 *      collapse to one canonical spelling — an AoN-known spelling wins over
 *      a Foundry-only one (measured a no-op today, 0 groups — ships anyway,
 *      cheap and future-proof, per spec).
 *   3. The conservative prefix rule: a Foundry-only string (one that never
 *      appears as any AoN doc's own `primary_source`) exactly equal to
 *      `"Pathfinder " + <a known AoN book name>` merges into that AoN name
 *      (measured: 23 distinct book strings / 408 entities in the real
 *      corpus). NO fuzzy/hand-curated aliasing — a residual split (any two
 *      strings that don't mechanically collapse) is accepted, per spec.
 */

const PATHFINDER_PREFIX = "Pathfinder ";

function mechanicalClean(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export type BookMergeKind = "whitespace" | "caseFold" | "prefixMerge";

export interface BookMergeRow {
  from: string;
  to: string;
  entityCount: number;
  kind: BookMergeKind;
}

export interface BookNormalizeResult {
  /** `entities`, with `source.book` rewritten to the final normalized
   * string — every other field untouched (a shallow `{...e, source: {...}}`
   * copy per entity, same "additive, never mutate the input array" posture
   * every other transform pass in this module follows). */
  entities: CodexEntity[];
  /** The full raw → final mapping (every raw `source.book` string this run
   * saw, even ones that mapped to themselves) — reused by
   * `sourcesIndexBuild.ts` to map an AoN doc's own `primarySource.book`
   * (pre-collapse) onto the same final book key entities now carry. */
  bookNameMap: ReadonlyMap<string, string>;
  /** Every RAW book string whose final normalized form differs from itself
   * — the D29-39 "full before→after mapping table" for `report.md`. Sorted
   * by `from` for determinism. */
  mergeTable: BookMergeRow[];
  distinctBefore: number;
  distinctAfter: number;
  /** Distinct book strings collapsed by rule 3 specifically (not raw
   * variants, not entity count — spec's "merges 23 of them"). */
  prefixMergeCount: number;
  /** Distinct case-insensitive groups with >1 member found by rule 2
   * (measured 0 in the real corpus — ships anyway). */
  caseFoldGroupCount: number;
}

/**
 * Pure: `entities` should be the FINAL (post-drop) entity set; `aonBookNames`
 * is the corpus-wide set of every distinct `primarySource.book` string any
 * AoN doc carries (already `normalizeBookName`-cleaned at extraction,
 * `aonFacets.ts`) — this is what lets rule 3 tell "AoN-cited" apart from
 * "Foundry-only" without needing per-entity origin provenance.
 */
export function normalizeBookNames(
  entities: readonly CodexEntity[],
  aonBookNames: ReadonlySet<string>,
): BookNormalizeResult {
  const rawCounts = new Map<string, number>();
  for (const e of entities) rawCounts.set(e.source.book, (rawCounts.get(e.source.book) ?? 0) + 1);
  const distinctBefore = rawCounts.size;

  // rule 1: mechanical clean, every raw string.
  const cleanedOf = new Map<string, string>();
  for (const raw of rawCounts.keys()) cleanedOf.set(raw, mechanicalClean(raw));

  // rule 2: case-insensitive dedup over the distinct CLEANED strings — an
  // AoN-known spelling wins; otherwise lexicographically smallest (byte
  // order, matching the rest of this module's determinism convention).
  const distinctCleaned = new Set(cleanedOf.values());
  const byLower = new Map<string, string[]>();
  for (const cleaned of distinctCleaned) {
    const lower = cleaned.toLowerCase();
    const arr = byLower.get(lower) ?? [];
    arr.push(cleaned);
    byLower.set(lower, arr);
  }
  const caseFoldCanonical = new Map<string, string>(); // cleaned -> case-fold canonical
  let caseFoldGroupCount = 0;
  for (const variants of byLower.values()) {
    if (variants.length <= 1) {
      const only = variants[0];
      if (only !== undefined) caseFoldCanonical.set(only, only);
      continue;
    }
    caseFoldGroupCount++;
    const aonMatch = [...variants]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .find((v) => aonBookNames.has(v));
    const canonical = aonMatch ?? [...variants].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
    for (const v of variants) caseFoldCanonical.set(v, canonical ?? v);
  }

  // rule 3: the conservative prefix rule, over the distinct case-fold
  // canonicals — a Foundry-only canonical exactly "Pathfinder " + a known
  // AoN book name merges into it.
  const distinctCaseFoldCanonicals = new Set(caseFoldCanonical.values());
  const finalOf = new Map<string, string>(); // case-fold canonical -> final
  const prefixMergedFrom = new Set<string>();
  for (const c of distinctCaseFoldCanonicals) {
    if (aonBookNames.has(c) || !c.startsWith(PATHFINDER_PREFIX)) {
      finalOf.set(c, c);
      continue;
    }
    const base = c.slice(PATHFINDER_PREFIX.length);
    if (aonBookNames.has(base)) {
      finalOf.set(c, base);
      prefixMergedFrom.add(c);
    } else {
      finalOf.set(c, c);
    }
  }

  // compose the full raw -> final mapping.
  const finalByRaw = new Map<string, string>();
  for (const raw of rawCounts.keys()) {
    const cleaned = cleanedOf.get(raw) ?? raw;
    const caseFold = caseFoldCanonical.get(cleaned) ?? cleaned;
    const final = finalOf.get(caseFold) ?? caseFold;
    finalByRaw.set(raw, final);
  }

  const mergeTable: BookMergeRow[] = [];
  for (const [raw, count] of rawCounts) {
    const final = finalByRaw.get(raw);
    if (final === undefined || final === raw) continue;
    const cleaned = cleanedOf.get(raw) ?? raw;
    const caseFold = caseFoldCanonical.get(cleaned) ?? cleaned;
    const kind: BookMergeKind = prefixMergedFrom.has(caseFold)
      ? "prefixMerge"
      : caseFold !== cleaned
        ? "caseFold"
        : "whitespace";
    mergeTable.push({ from: raw, to: final, entityCount: count, kind });
  }
  mergeTable.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  const normalizedEntities = entities.map((e) => {
    const finalBook = finalByRaw.get(e.source.book) ?? e.source.book;
    if (finalBook === e.source.book) return e;
    return { ...e, source: { ...e.source, book: finalBook } };
  });

  const distinctAfter = new Set(finalByRaw.values()).size;

  return {
    entities: normalizedEntities,
    bookNameMap: finalByRaw,
    mergeTable,
    distinctBefore,
    distinctAfter,
    prefixMergeCount: prefixMergedFrom.size,
    caseFoldGroupCount,
  };
}
