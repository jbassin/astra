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
 * - listing routes (`/$category/`) — title = `displayCategoryName(params.
 *   category)`. No loader dependency at all (immune to the D29-89 SSR
 *   windowed-projection timing — `params` resolves before any loader data
 *   does).
 * - entity routes (`/$category/$slug`) — title = the route's own dehydrated
 *   `loaderData.entity.name`. Rules DOCS (an individual `/rules/{slug}`
 *   page) land on this exact same route (`category === "rules"`) and need
 *   no special-casing — same field, same posture.
 * - the bespoke `/class/$slug` route (P12) — SAME field, same posture as
 *   `/$category/$slug` (its `ClassPageData` extends `EntityPageData`, so
 *   `loaderData.entity.name` is there identically). This case was MISSED at
 *   P12: `ClassPage`/the fail-soft pane both render their h1 `standalone`
 *   (sr-only, on the premise the header carries the visible title — the
 *   D29-112 contract), so without it a class page had NO visible title at
 *   all, just the wordmark.
 * - the `/rules` tree-browser route itself — title = `displayCategoryName
 *   ("rules")` ("Rules"), a fixed page name (no params/loaderData needed).
 * - everything else (landing `/`, `/search`, `/categories`, `/sources`, an
 *   unmatched/404 path) — `null`, meaning "keep the wordmark" (the ONLY
 *   home affordance before this decision existed — `deriveHeaderTitle`
 *   returning `null` is exactly how that survives unmodified).
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
    case "/$category/$slug":
    case "/class/$slug": {
      const loaderData = leaf.loaderData as { entity?: { name?: unknown } } | undefined;
      const name = loaderData?.entity?.name;
      return typeof name === "string" ? name : null;
    }
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
