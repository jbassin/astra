import type { ReactElement } from "react";

import type { CategoryDirectoryData } from "../../server/directoryData";
import { humanizeSlug } from "./text";

/**
 * D29-27 — the root category directory (`/`)'s presentation. Grouping is
 * S1's own `categoryGroupOf`/`CategoryGroup`, not a second taxonomy. The
 * sibling `/{category}` listing (originally a throwaway A–Z page here too)
 * was REPLACED by P3's faceted `BrowseListing`
 * (`src/domain/browse/BrowseListing.tsx`) — this file now owns only the
 * directory page, which stays as-is (D29-35: "the `/` directory page stays
 * the grouped category list — counts from manifest — gains nothing else").
 *
 * Only `import type` from the `server/` modules above — this is a pure
 * presentational component over already-fetched data, same posture as
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
