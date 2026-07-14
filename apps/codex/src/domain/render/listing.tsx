import type { ReactElement } from "react";

import type { CategoryDirectoryData } from "../../server/directoryData";
import type { CategoryListingData, ListingRow } from "../../server/listingData";
import { humanizeSlug } from "./text";

/**
 * D29-27 — the two THROWAWAY listing pages' presentation: the root category
 * directory (`/`) and one category's A–Z listing (`/{category}`). No facet UI,
 * no pagination, no sort options (P3 replaces these entirely) — grouping is
 * S1's own `categoryGroupOf`/`CategoryGroup`, not a second taxonomy.
 *
 * Only `import type` from the `server/` modules above — these are pure
 * presentational components over already-fetched data, same posture as
 * `entityPage.tsx` (a type-only import never drags `node:fs` into the client
 * bundle).
 */

const GROUP_LABELS: Record<CategoryDirectoryData["groups"][number]["group"], string> = {
  creature: "Creatures",
  hazard: "Hazards",
  spell: "Spells",
  equipment: "Equipment",
  feat: "Feats",
  generic: "Everything Else",
};

export function CategoryDirectory({ data }: { data: CategoryDirectoryData }): ReactElement {
  return (
    <div className="codex-directory popover-hint">
      <p className="codex-directory-total">
        {data.totalEntities.toLocaleString()} entities across{" "}
        {data.groups.reduce((n, g) => n + g.categories.length, 0)} categories.
      </p>
      {data.groups.map((group) => (
        <section key={group.group} className="codex-directory-group">
          <h2 className="codex-heading">{GROUP_LABELS[group.group]}</h2>
          <ul className="codex-directory-list">
            {group.categories.map(({ category, count }) => (
              <li key={category}>
                <a href={`/${category}`}>{humanizeSlug(category)}</a>
                <span className="codex-directory-count">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function letterOf(name: string): string {
  const first = name.charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

function groupByLetter(rows: readonly ListingRow[]): Array<[string, ListingRow[]]> {
  const groups = new Map<string, ListingRow[]>();
  for (const row of rows) {
    const letter = letterOf(row.name);
    const bucket = groups.get(letter);
    if (bucket) bucket.push(row);
    else groups.set(letter, [row]);
  }
  // `rows` arrives A-Z sorted (listingData.ts), so a plain key iteration order
  // would already be alphabetical in practice — sorted explicitly anyway since
  // Map iteration order is insertion order, not a guarantee this file wants to
  // lean on.
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function ListingRowView({ row }: { row: ListingRow }): ReactElement {
  return (
    <li className="codex-listing-row">
      <a href={`/${row.id}`} className="codex-listing-name">
        {row.name}
      </a>
      {row.level !== undefined ? (
        <span className="codex-listing-level">Lvl {row.level}</span>
      ) : null}
      {row.rarity !== undefined ? (
        <span className="codex-listing-rarity">{capitalize(row.rarity)}</span>
      ) : null}
      <span className="codex-listing-source">{row.source.book}</span>
      <span className={`codex-edition-pill codex-edition-${row.edition}`}>
        {row.edition === "remaster" ? "Remaster" : "Legacy"}
      </span>
    </li>
  );
}

export function CategoryListing({ data }: { data: CategoryListingData }): ReactElement {
  const letterGroups = groupByLetter(data.rows);
  return (
    <div className="codex-listing">
      <header className="codex-listing-header">
        <h1 className="codex-listing-title">{humanizeSlug(data.category)}</h1>
        <p className="codex-listing-count">{data.rows.length.toLocaleString()} entries</p>
      </header>
      {letterGroups.length > 1 ? (
        <nav className="codex-listing-alpha" aria-label="Jump to letter">
          {letterGroups.map(([letter]) => (
            <a key={letter} href={`#letter-${letter}`}>
              {letter}
            </a>
          ))}
        </nav>
      ) : null}
      {letterGroups.map(([letter, rows]) => (
        <section key={letter} id={`letter-${letter}`} className="codex-listing-letter">
          <h2 className="codex-heading">{letter}</h2>
          <ul className="codex-listing-rows">
            {rows.map((row) => (
              <ListingRowView key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
