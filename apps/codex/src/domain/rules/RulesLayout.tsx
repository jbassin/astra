// P4 S3 (D29-41) — codex's FIRST sidebar column: a route-local layout that
// ONLY the `$category/$slug` route imports, and only when the resolved
// entity is `category === "rules"` (its own `useLoaderData().rulesNav` gate
// — `__root.tsx` stays completely untouched, every non-rules page keeps its
// existing single-column shell, D29-41's own pinned constraint).
//
// The sidebar reuses `RulesTree` VERBATIM ("the same tree island machinery",
// D29-41) scoped to just the current book (`nav.book`, a single-element
// `books` array) with `currentId` set to the viewed entity's id — S2's own
// `computeOpen`/`pruneForLegacy` already do the rest: the path down to
// `currentId` auto-expands, and (S3's `pruneForLegacy` extension) the
// current node's own branch is never pruned away by the legacy toggle even
// when the page being viewed is itself superseded (an entity page always
// renders regardless of the site-wide toggle — only listings/sidebars hide
// superseded content — so a sidebar mustn't lose track of "you are here").
//
// Mobile: a native `<details>`/`<summary>` disclosure — zero JS breakpoint
// logic (`globals.css`'s own media query forces it always-open on desktop
// and gates the summary/open-state to narrow viewports, reusing codex's own
// existing `.codex-browse-layout` breakpoint, D29-41's "no new breakpoint
// system"), so there's no hydration risk (an uncontrolled DOM attribute).

import type { ReactElement, ReactNode } from "react";

import { useLegacyToggle } from "@/domain/browse/legacyToggle";
import type { RulesNavData } from "@/server/entityPageData";

import { BreadcrumbTrail } from "./BreadcrumbTrail";
import { ReadingOrderPager } from "./ReadingOrderPager";
import { RulesTree } from "./RulesTree";

export function RulesLayout({
  entityId,
  entityName,
  nav,
  children,
}: {
  entityId: string;
  entityName: string;
  nav: RulesNavData;
  children: ReactNode;
}): ReactElement {
  // Bare `useLegacyToggle()` (no `search.legacy`/hasHydrated dance): entity
  // pages carry no `?legacy=1` URL feature (out of scope, D29-41 §7 — only
  // `/rules` itself is shareable that way) — the plain SSR-false-then-
  // reconcile-post-hydration behavior of `useSyncExternalStore` is the same
  // one the header's own `LegacyToggleControl` already accepts.
  const legacy = useLegacyToggle();

  return (
    <div className="codex-rules-layout">
      <details className="codex-rules-sidebar-disclosure">
        <summary className="codex-rules-sidebar-summary">{nav.book.book} contents</summary>
        <div className="codex-rules-sidebar-body">
          <RulesTree books={[nav.book]} legacy={legacy} currentId={entityId} />
        </div>
      </details>
      <div className="codex-rules-main">
        <BreadcrumbTrail book={nav.book.book} ancestors={nav.ancestors} currentName={entityName} />
        {children}
        <ReadingOrderPager prev={nav.prev} next={nav.next} />
      </div>
    </div>
  );
}
