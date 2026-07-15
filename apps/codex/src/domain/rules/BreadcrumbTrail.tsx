// P4 S3 (D29-41) — the rules entity-page breadcrumb trail: book › ancestors ›
// self. A plain, frontend-free component (no router/state) — every input is
// already resolved server-side by `entityPageData.ts`'s `resolveRulesNav`
// (D29-41's own "one serverFn, no second round trip" text), so this file
// only renders. Mirrors akasha-frontend's `.breadcrumb-container`/
// `.breadcrumb-element` structure (its own CSS-class naming precedent for a
// breadcrumb, though akasha's own component isn't reused — that one walks a
// flat build-time slug tree, this walks the rules tree's ancestor array).

import type { ReactElement } from "react";

import type { RulesTrailItem } from "@/server/entityPageData";

export function BreadcrumbTrail({
  book,
  ancestors,
  currentName,
}: {
  /** The book display name — never linked (books aren't tree nodes, D29-41). */
  book: string;
  /** Root-first ancestor chain, own name excluded (that's `currentName`).
   * `id` present -> a real doc, linked; absent -> a synthetic group node,
   * plain text (D29-41's own rule). */
  ancestors: readonly RulesTrailItem[];
  /** The entity's own name — always the trail's last element, always plain
   * text (the "you are here" convention, never a link to itself). */
  currentName: string;
}): ReactElement {
  return (
    <nav className="codex-rules-breadcrumb" aria-label="Breadcrumb">
      <ol className="codex-rules-breadcrumb-list">
        <li className="codex-rules-breadcrumb-item">{book}</li>
        {ancestors.map((a, i) => (
          // Ancestor names aren't globally unique (generic chapter titles
          // recur across books, D29-39) and synthetic ancestors have no id
          // — index-keying is the only stable option for this fixed-shape,
          // server-rendered, never-reordered array (the `.oxlintrc.json`
          // path override next to codex's other corpus-array renderers
          // covers this file).
          <li className="codex-rules-breadcrumb-item" key={`${i}-${a.name}`}>
            {a.id !== undefined ? (
              <a href={`/${a.id}`}>{a.name}</a>
            ) : (
              <span className="codex-rules-breadcrumb-synthetic">{a.name}</span>
            )}
          </li>
        ))}
        <li
          className="codex-rules-breadcrumb-item codex-rules-breadcrumb-current"
          aria-current="page"
        >
          {currentName}
        </li>
      </ol>
    </nav>
  );
}
