import type { ReactElement } from "react";

import type { CategoryDirectoryData } from "../../server/directoryData";
import { displayCategoryName } from "./displayCategoryName";

/**
 * The category directory's presentation, at the `/categories` route (`/` is
 * the landing page). Grouping is `categoryGroupOf`/`CategoryGroup`, not a
 * second taxonomy. The sibling `/{category}` listing is the faceted
 * `BrowseListing` (`src/domain/browse/BrowseListing.tsx`); this file owns
 * only the directory page: the grouped category list, with counts from the
 * manifest, and nothing else.
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
                <a href={`/${category}`}>{displayCategoryName(category)}</a>
                <span className="codex-directory-count">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
