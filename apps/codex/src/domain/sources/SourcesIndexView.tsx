import type { ReactElement } from "react";

import { joinCsv } from "@/domain/browse/urlState";
import { humanizeSlug } from "@/domain/render/text";
import type { SourceIndexEntry } from "@/schema/sourcesIndex";

import { groupSourcesByProductLine, OTHER_GROUP_LABEL } from "./sourcesModel";

/**
 * D29-43 — the `/sources` page body: a plain server-rendered view (NO
 * island — this file owns zero React state/hooks), grouped by product line
 * via `sourcesModel.ts`'s pure grouping. Every book row links its
 * `sourceEntityRef` (when present) and each of its per-category counts into
 * the EXISTING P3 filtered-browse URL codec (`urlState.ts`'s `joinCsv` — the
 * same backslash-comma-escaping a `book=` param round-trips through
 * `$category/`'s own `validateBrowseSearch` -> `decodeCsvSet`, no new filter
 * machinery). The "Other" bucket renders as a native `<details>`, collapsed
 * by default (D29-43 — zero JS/hydration risk, S3's own disclosure
 * precedent, `RulesLayout.tsx`'s sidebar).
 */
export function SourcesIndexView({ books }: { books: readonly SourceIndexEntry[] }): ReactElement {
  const groups = groupSourcesByProductLine(books);
  return (
    <div className="codex-sources-index">
      {groups.map((group) =>
        group.productLine === OTHER_GROUP_LABEL ? (
          <details key={group.productLine} className="codex-sources-group">
            <summary className="codex-sources-group-summary">
              {group.productLine}
              <span className="codex-sources-group-count">
                {group.bookCount.toLocaleString()} books · {group.entityCount.toLocaleString()}{" "}
                entities
              </span>
            </summary>
            <div className="codex-sources-group-body">
              {group.books.map((book) => (
                <SourceBookRow key={book.book} book={book} />
              ))}
            </div>
          </details>
        ) : (
          <section key={group.productLine} className="codex-sources-group">
            <h2 className="codex-heading">
              {group.productLine}
              <span className="codex-sources-group-count">
                {group.bookCount.toLocaleString()} books · {group.entityCount.toLocaleString()}{" "}
                entities
              </span>
            </h2>
            <div className="codex-sources-group-body">
              {group.books.map((book) => (
                <SourceBookRow key={book.book} book={book} />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

/** A single book's own filtered-browse href for one category — the EXISTING
 * `book=` core-facet param (`urlState.ts`), pre-selected to exactly this
 * book. `joinCsv` handles the comma-escaping a bare `.split(",")` would
 * shred (the real corpus's own comma-bearing book titles, D29-35's own
 * finding); `encodeURIComponent` percent-encodes the escaped value for the
 * raw `<a href>` (this page has no island/router `Link`, so the href is
 * hand-built — `%20` for a literal space avoids the qss `+`-decodes-to-space
 * landmine `urlState.ts`'s own file header warns about). */
function categoryBrowseHref(category: string, book: string): string {
  return `/${category}?book=${encodeURIComponent(joinCsv([book]))}`;
}

function SourceBookRow({ book }: { book: SourceIndexEntry }): ReactElement {
  const categories = Object.entries(book.categoryCounts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <article className="codex-sources-book" data-book={book.book}>
      <header className="codex-sources-book-header">
        {book.sourceEntityRef !== undefined ? (
          <a href={`/${book.sourceEntityRef}`} className="codex-sources-book-name">
            {book.book}
          </a>
        ) : (
          <span className="codex-sources-book-name">{book.book}</span>
        )}
        <span className={`codex-edition-pill codex-edition-${book.edition}`}>
          {book.edition === "remaster" ? "Remaster" : "Legacy"}
        </span>
        <span
          className={`codex-license-badge${book.license === "unknown" ? " codex-license-unknown" : ""}`}
        >
          {book.license === "unknown" ? "License unknown" : book.license}
        </span>
        <span className="codex-directory-count">{book.entityCount.toLocaleString()} entities</span>
      </header>
      <ul className="codex-sources-book-categories">
        {categories.map(([category, count]) => (
          <li key={category}>
            <a href={categoryBrowseHref(category, book.book)}>{humanizeSlug(category)}</a>
            <span className="codex-directory-count">{count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
