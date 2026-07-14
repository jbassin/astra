// S3 (D29-27) — the root `/` category directory's pure core. Mirrors
// `entityPageData.ts`'s split: a plain function over an injected `CorpusReader`,
// directly unit-testable against the fixture corpus with zero
// createServerFn/Start-runtime machinery, called from `corpusFns.ts`'s thin
// wrapper. Explicitly THROWAWAY (spec: "no facet UI, no pagination, no sort") —
// grouping reuses the render layer's own `categoryGroupOf` (S1) rather than
// inventing a second taxonomy just for this page.

import { categoryGroupOf, type CategoryGroup } from "../domain/render/categoryGroup";
import type { CorpusReader } from "./corpusFs";

export interface DirectoryCategoryRow {
  category: string;
  count: number;
}

export interface DirectoryGroup {
  group: CategoryGroup;
  categories: DirectoryCategoryRow[];
}

export interface CategoryDirectoryData {
  groups: DirectoryGroup[];
  totalEntities: number;
}

/** Display order for the 6 `CategoryGroup`s — the 5 named groups (each backing a
 * bespoke facet/statblock header, D29-26) first, `generic` (the ~80 other
 * categories) last. */
const GROUP_ORDER: readonly CategoryGroup[] = [
  "creature",
  "hazard",
  "spell",
  "equipment",
  "feat",
  "generic",
];

export function resolveCategoryDirectory(reader: CorpusReader): CategoryDirectoryData {
  const counts = reader.categoryCounts();
  const byGroup = new Map<CategoryGroup, DirectoryCategoryRow[]>();
  let totalEntities = 0;
  for (const category of reader.categories()) {
    const count = counts[category] ?? 0;
    totalEntities += count;
    const group = categoryGroupOf(category);
    const rows = byGroup.get(group);
    if (rows) rows.push({ category, count });
    else byGroup.set(group, [{ category, count }]);
  }
  const groups = GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    categories: (byGroup.get(group) ?? []).sort((a, b) => a.category.localeCompare(b.category)),
  }));
  return { groups, totalEntities };
}
