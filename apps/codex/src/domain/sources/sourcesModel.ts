// P4 S4 (D29-43) — the `/sources` aggregate index's pure grouping logic. A
// plain function over `SourceIndexEntry[]` — no React, no router, no fs — so
// it's directly unit-testable, mirroring `src/domain/rules/treeModel.ts`'s
// own split (the ISLAND/route owns rendering, this module owns the
// algorithm). `/sources` itself has NO island (D29-43: "a plain
// server-rendered page — NO island"), but the grouping logic still earns its
// own file/tests rather than living inline in a route component.

import type { SourceIndexEntry } from "@/schema/sourcesIndex";

/** The sentinel group label for books with no `productLine` (the ~253-book
 * "Other" bucket, D29-43 — Foundry-only book strings with zero AoN
 * citations, EXPECTED not a gap). Exported so the presentational component
 * can special-case its rendering (a `<details>` disclosure, collapsed by
 * default) without re-deriving the sentinel string. */
export const OTHER_GROUP_LABEL = "Other";

/**
 * A "sensible fixed order" for the product lines actually observed in the
 * real corpus (measured 2026-07-14: Rulebooks/Lost Omens/Adventure Paths/
 * Adventures/Society/Comics/Blog Posts/April Fools, 8 distinct values,
 * `sources-index.json`'s own `primary_source_category` provenance) — books
 * (not source material weight) first, then narrative/community content,
 * least serious last. NOT an exhaustive enum: a product-line string this
 * list doesn't name (a future AoN category, or a differently-fixtured test
 * corpus) sorts alphabetically AFTER every pinned line and BEFORE `Other`
 * (`groupSourcesByProductLine`'s own "pinned-then-alphabetical-then-Other"
 * rule) — `Other` itself is NEVER pinned here; it is always forced last by
 * the grouping function regardless of this list.
 *
 * P13 S3 (D29-128) — EXPORTED (was module-private through P4): the review's
 * own blocker on the filter-panel redesign's draft was that its Source
 * facet's group order FORKED this one ("Adventures before Society, Comics
 * before Blog Posts") — `FacetPanel.tsx`'s grouped Source section
 * (`orderProductLines`, below) imports this list directly rather than
 * re-declaring it, so the panel and `/sources` can never disagree again.
 */
export const PINNED_PRODUCT_LINE_ORDER: readonly string[] = [
  "Rulebooks",
  "Lost Omens",
  "Adventure Paths",
  "Adventures",
  "Society",
  "Comics",
  "Blog Posts",
  "April Fools",
];

/**
 * The pinned-then-alphabetical-then-Other GROUP ORDER, given the distinct
 * product-line strings actually present (`OTHER_GROUP_LABEL` may or may not
 * be among them) — the ordering half of `groupSourcesByProductLine` below,
 * extracted (P13 S3, D29-128) so `FacetPanel.tsx`'s Source-section grouping
 * can reuse the EXACT SAME order over a different member shape (option
 * counts, not `SourceIndexEntry` rows) without re-deriving or re-declaring
 * it a second time.
 */
export function orderProductLines(lines: readonly string[]): string[] {
  const distinct = new Set(lines);
  const realLines = [...distinct].filter((l) => l !== OTHER_GROUP_LABEL);
  const pinnedPresent = PINNED_PRODUCT_LINE_ORDER.filter((l) => realLines.includes(l));
  const unpinned = realLines
    .filter((l) => !PINNED_PRODUCT_LINE_ORDER.includes(l))
    .sort((a, b) => a.localeCompare(b));
  const order = [...pinnedPresent, ...unpinned];
  if (distinct.has(OTHER_GROUP_LABEL)) order.push(OTHER_GROUP_LABEL);
  return order;
}

export interface SourcesGroup {
  /** `OTHER_GROUP_LABEL` for the ungrouped bucket, else the real product
   * line string every member book shares. */
  productLine: string;
  /** Books sorted by name (locale-aware, byte-stable — the repo's own
   * `localeCompare` sort convention, `bookNormalize.ts`'s precedent). */
  books: SourceIndexEntry[];
  bookCount: number;
  entityCount: number;
}

/**
 * Groups by `productLine` (undefined -> `OTHER_GROUP_LABEL`), orders groups
 * by `PINNED_PRODUCT_LINE_ORDER` first, any other REAL product line
 * alphabetically next, and `OTHER_GROUP_LABEL` unconditionally LAST — D29-43's
 * "groups in a sensible fixed order with 'Other' LAST" — regardless of its
 * size (it is very often the single largest group by book count, ~253/496
 * measured, and must still sort last, not by size).
 */
export function groupSourcesByProductLine(books: readonly SourceIndexEntry[]): SourcesGroup[] {
  const byLine = new Map<string, SourceIndexEntry[]>();
  for (const book of books) {
    const line = book.productLine ?? OTHER_GROUP_LABEL;
    const arr = byLine.get(line) ?? [];
    arr.push(book);
    byLine.set(line, arr);
  }
  for (const arr of byLine.values()) arr.sort((a, b) => a.book.localeCompare(b.book));

  // P13 S3 (D29-128): the order derivation itself now lives in
  // `orderProductLines` (above), shared verbatim with `FacetPanel.tsx`'s
  // grouped Source section — this call is byte-for-byte the same
  // pinned-then-alphabetical-then-Other computation the inline version used
  // to do here directly (`sourcesModel.test.ts`'s existing order pins are
  // unchanged by this refactor).
  const order = orderProductLines([...byLine.keys()]);

  return order.map((productLine) => {
    const groupBooks = byLine.get(productLine) ?? [];
    return {
      productLine,
      books: groupBooks,
      bookCount: groupBooks.length,
      entityCount: groupBooks.reduce((n, b) => n + b.entityCount, 0),
    };
  });
}
