import { Link, useMatches } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { displayCategoryName } from "@/domain/render/displayCategoryName";

/**
 * D29-112 (P11 S4, R4, #13e) — the root header's title-into-header
 * mechanism. Mechanism PINNED by the spec: reads the RESOLVED matches via
 * `useMatches()` (never an effect-based "context setter" — that's
 * client-only, which would flash the wordmark before the title lands and
 * disagree with the SSR pass entirely, a hydration mismatch by
 * construction). SSR and the client's first render see the IDENTICAL
 * router match tree, so this is flash-free and hydration-safe by
 * construction — no `useEffect`/`useState` anywhere in this file.
 *
 * Stakeholder redirect (post-D29-112): header-carries-title is scoped to
 * PARENT/LISTING surfaces only — "when going to a SPECIFIC page, the title
 * shouldn't replace the codex header; that behavior should only be for the
 * parent pages like /spell." SPECIFIC pages (an entity's own
 * `/{category}/{slug}` — including rules DOCS, which land on this exact
 * same route — and the bespoke `/class/$slug` page) now fall through to the
 * `default: null` case below (wordmark), and their own in-content h1 is
 * VISIBLE again (`EntityHeader.tsx`/`ClassPage.tsx` — the `standalone`
 * sr-only mechanism this decision introduced is removed outright, not just
 * bypassed, since nothing renders it any more).
 *
 * - listing routes (`/$category/`) — title = `displayCategoryName(params.
 *   category)`. No loader dependency at all (immune to the D29-89 SSR
 *   windowed-projection timing — `params` resolves before any loader data
 *   does). UNCHANGED — a parent/listing surface.
 * - the `/rules` tree-browser route itself — title = `displayCategoryName
 *   ("rules")` ("Rules"), a fixed page name (no params/loaderData needed).
 *   UNCHANGED — a parent surface (the tree browser, not an individual doc).
 * - everything else (landing `/`, `/search`, `/categories`, `/sources`, a
 *   specific entity/rules-doc/class page, an unmatched/404 path) — `null`,
 *   meaning "keep the wordmark" (the ONLY home affordance before D29-112
 *   existed — `deriveHeaderTitle` returning `null` is exactly how that
 *   survives unmodified).
 */

interface MinimalRouteMatch {
  routeId: string;
  params?: Record<string, unknown>;
  loaderData?: unknown;
}

/** Pure, decoupled from `useMatches()`'s own big generated union type (so
 * it's directly unit-testable with plain object literals, no full
 * `RouterProvider` mount needed) — `HeaderTitle` below is the thin
 * router-coupled wrapper. `null` means "render the wordmark instead." */
export function deriveHeaderTitle(matches: readonly MinimalRouteMatch[]): string | null {
  const leaf = matches[matches.length - 1];
  if (!leaf) return null;
  switch (leaf.routeId) {
    case "/$category/": {
      const category = leaf.params?.category;
      return typeof category === "string" ? displayCategoryName(category) : null;
    }
    // `/$category/$slug` (incl. rules DOCS, same route) and `/class/$slug`
    // are SPECIFIC pages, not parents — the stakeholder redirect above
    // scopes header-carries-title to listing/`/rules` only, so both fall
    // through to `default: null` (wordmark) instead of resolving
    // `loaderData.entity.name` the way this switch used to.
    case "/rules":
      return displayCategoryName("rules");
    default:
      return null;
  }
}

export function HeaderTitle(): ReactElement {
  const matches = useMatches();
  const title = deriveHeaderTitle(matches);

  if (title === null) {
    // Unchanged from before this decision — landing/`/search`/`/categories`/
    // `/sources` (and any unmatched path) keep the wordmark, the site's
    // ONLY home affordance until this slice added the glyph below.
    return (
      <Link to="/" className="site-brand">
        codex
      </Link>
    );
  }

  return (
    <div className="site-header-title">
      {/* the wordmark is replaced by a small home glyph + the resolved
          title — that glyph is what keeps the home affordance alive on
          every listing/entity/rules page (`favicon.svg`, the site's own
          mark — no new SVG asset/GlyphDefs symbol needed). */}
      <Link to="/" className="site-home-glyph" aria-label="codex home">
        <img src="/favicon.svg" alt="" width={20} height={20} />
      </Link>
      {/* mobile: ellipsizes via `globals.css`, never wraps the bar taller
          (D29-112's own mobile requirement) — `min-width: 0` on both this
          and the wrapper above is what lets it actually shrink. */}
      <span className="site-header-title-text">{title}</span>
    </div>
  );
}
