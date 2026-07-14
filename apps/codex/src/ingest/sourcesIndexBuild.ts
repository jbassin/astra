import type { CodexEntity, Edition, License } from "../schema/entity";
import type { SourceIndexEntry, SourcesIndexFile } from "../schema/sourcesIndex";
import { deriveBookEdition, deriveBookLicense } from "./bookMeta";

/**
 * P4 (D29-43): the `/sources` aggregate index builder. `productLine` =
 * majority raw AoN `primary_source_category` across a book's CITING docs
 * (present on 43,684/43,684 real AoN docs — total for every AoN-cited
 * book); a book with zero AoN citations at all (the Foundry-only strings,
 * ~253 of them measured) gets no `productLine` — the "Other" bucket,
 * expected per spec, not a gap.
 */

export interface AonBookCitation {
  /** The AoN doc's OWN `primarySource.book` (pre-final-collapse — the
   * caller maps it through `bookNameMap` below). */
  book: string;
  productLine?: string;
}

export interface SourcesIndexBuildInput {
  /** Final (post book-normalize, post-drop) entities — every one's
   * `source.book` is already the FINAL normalized key. */
  finalEntities: readonly CodexEntity[];
  /** One row per AoN doc that carries a `primary_source_category` (or not) —
   * from every deduped AoN meta, any category, not just `rules`/`source`. */
  aonCitations: readonly AonBookCitation[];
  /** `bookNormalize.ts`'s own raw→final map — reused so an AoN citation's
   * book string lands on the exact same final key its entities use. */
  bookNameMap: ReadonlyMap<string, string>;
  /** final book → a matching `source`-category entity's own license (the
   * D29-39 book-license derivation's second tier). */
  bookSourceLicense: ReadonlyMap<string, License>;
  /** final book → the matching `source`-category entity's own CodexId
   * (245 of the normalized books have one). */
  sourceEntityRefByBook: ReadonlyMap<string, string>;
}

export interface SourcesIndexStats {
  totalBooks: number;
  classifiedBooks: number;
  otherBooks: number;
  totalEntities: number;
  classifiedEntities: number;
  otherEntities: number;
  classifiedEntityPct: number;
  /** D29-43's recalibrated guard: true when classified-book coverage is
   * BELOW 90% of entities — a recorded deviation (fallback grouping is a
   * frontend/S4 concern, this is just the trip-wire signal in the report). */
  belowNinetyPctGuard: boolean;
}

function majorityProductLine(votes: ReadonlyMap<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = -1;
  for (const [line, count] of [...votes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = line;
      bestCount = count;
    }
  }
  return best;
}

export function buildSourcesIndex(input: SourcesIndexBuildInput): {
  file: SourcesIndexFile;
  stats: SourcesIndexStats;
} {
  const entityCountByBook = new Map<string, number>();
  const editionsByBook = new Map<string, Edition[]>();
  for (const e of input.finalEntities) {
    entityCountByBook.set(e.source.book, (entityCountByBook.get(e.source.book) ?? 0) + 1);
    const arr = editionsByBook.get(e.source.book) ?? [];
    arr.push(e.edition);
    editionsByBook.set(e.source.book, arr);
  }

  const votesByBook = new Map<string, Map<string, number>>();
  for (const citation of input.aonCitations) {
    if (citation.productLine === undefined) continue;
    const finalBook = input.bookNameMap.get(citation.book) ?? citation.book;
    const votes = votesByBook.get(finalBook) ?? new Map<string, number>();
    votes.set(citation.productLine, (votes.get(citation.productLine) ?? 0) + 1);
    votesByBook.set(finalBook, votes);
  }

  const books: SourceIndexEntry[] = [];
  let classifiedBooks = 0;
  let classifiedEntities = 0;

  for (const book of entityCountByBook.keys()) {
    const entityCount = entityCountByBook.get(book) ?? 0;
    const editions = editionsByBook.get(book) ?? [];
    const productLine = majorityProductLine(votesByBook.get(book) ?? new Map());
    if (productLine !== undefined) {
      classifiedBooks++;
      classifiedEntities += entityCount;
    }
    books.push({
      book,
      ...(productLine !== undefined ? { productLine } : {}),
      license: deriveBookLicense(book, input.bookSourceLicense.get(book)),
      edition: deriveBookEdition(book, editions),
      entityCount,
      ...(input.sourceEntityRefByBook.has(book)
        ? { sourceEntityRef: input.sourceEntityRefByBook.get(book) }
        : {}),
    });
  }

  books.sort((a, b) => {
    const lineA = a.productLine ?? "￿";
    const lineB = b.productLine ?? "￿";
    if (lineA !== lineB) return lineA.localeCompare(lineB);
    return a.book.localeCompare(b.book);
  });

  const totalEntities = input.finalEntities.length;
  const otherBooks = books.length - classifiedBooks;
  const otherEntities = totalEntities - classifiedEntities;
  const classifiedEntityPct =
    totalEntities > 0 ? Math.round((classifiedEntities / totalEntities) * 1000) / 10 : 0;

  return {
    file: { books },
    stats: {
      totalBooks: books.length,
      classifiedBooks,
      otherBooks,
      totalEntities,
      classifiedEntities,
      otherEntities,
      classifiedEntityPct,
      belowNinetyPctGuard: classifiedEntityPct < 90,
    },
  };
}
