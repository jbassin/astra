// Codex's only sidebar column: a route-local layout that
// ONLY the `$category/$slug` route imports, and only when the resolved
// entity is `category === "rules"` (its own `useLoaderData().rulesNav` gate
// — `__root.tsx` stays completely untouched, every non-rules page keeps its
// existing single-column shell).
//
// The sidebar reuses `RulesTree` VERBATIM (the same tree island machinery)
// scoped to just the current book (`nav.book`, a single-element `books`
// array) with `currentId` set to the viewed entity's id — `computeOpen`/
// `pruneForSuperseded` already do the rest: the path down to `currentId`
// auto-expands, and (via `pruneForSuperseded`'s `currentId` guard) the
// current node's own branch is never pruned away by the superseded-
// visibility param even when the page being viewed is itself superseded (an
// entity page always renders regardless of that param — only listings/
// sidebars hide superseded content — so a sidebar mustn't lose track of
// "you are here").
//
// The `superseded` prop comes from the host route (`$category/$slug.tsx`),
// which computes its own URL-derived `superseded` value and passes it down,
// the same as every other superseded-visibility site; there is no site-wide
// toggle.
//
// Mobile: a native `<details>`/`<summary>` disclosure — zero JS breakpoint
// logic (`globals.css`'s own media query forces it always-open on desktop
// and gates the summary/open-state to narrow viewports, reusing codex's own
// existing `.codex-browse-layout` breakpoint, no new breakpoint system), so
// there's no hydration risk (an uncontrolled DOM attribute).

import type { ReactElement, ReactNode } from "react";

import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { RulesNavData } from "@/server/entityPageData";

import { BreadcrumbTrail } from "./BreadcrumbTrail";
import { ReadingOrderPager } from "./ReadingOrderPager";
import { RulesTree } from "./RulesTree";

export function RulesLayout({
  entityId,
  entityName,
  nav,
  superseded,
  children,
}: {
  entityId: string;
  entityName: string;
  nav: RulesNavData;
  /** The host route's own URL-derived value (`?superseded=1`, alias-decoded
   * from `legacy=1` too); entity pages carry no visible control of their own
   * (a superseded sidebar only shows when the entity was reached via a link
   * already carrying the param). */
  superseded: boolean;
  children: ReactNode;
}): ReactElement {
  const bookAbbrev = abbreviateBook(nav.book.book) ?? nav.book.book;
  return (
    <div className="codex-rules-layout">
      <details className="codex-rules-sidebar-disclosure">
        <summary className="codex-rules-sidebar-summary" title={nav.book.book}>
          {bookAbbrev} contents
        </summary>
        <div className="codex-rules-sidebar-body">
          <RulesTree books={[nav.book]} superseded={superseded} currentId={entityId} />
        </div>
      </details>
      <div className="codex-rules-main">
        <BreadcrumbTrail book={bookAbbrev} ancestors={nav.ancestors} currentName={entityName} />
        {children}
        <ReadingOrderPager prev={nav.prev} next={nav.next} />
      </div>
    </div>
  );
}
