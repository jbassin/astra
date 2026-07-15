import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useLegacyToggle } from "@/domain/browse/legacyToggle";
import { RulesTree } from "@/domain/rules/RulesTree";
import { getRulesTree } from "@/server/corpusFns";

/**
 * D29-40 — `/rules`: the tree browser that replaces P3's faceted flat
 * listing for the `rules` category. A FLAT top-level route file (matching
 * `search.tsx`'s own pattern) — TanStack Router ranks a static path segment
 * above the `$category` param route for an exact `/rules` match (verified
 * safe both ways, spec §1: `/rules/{slug}` still falls through to the
 * existing `$category/$slug` route since this file has no children of its
 * own). The `/` directory's `rules` row is untouched — it just links to
 * `/${category}`, which is `/rules` either way, count unchanged.
 *
 * `legacy` is the ONLY url param this route reads — the D29-40 "no facet
 * panel, no tree state in the URL beyond the current-doc auto-expansion"
 * scope (§7 out of scope) means the quick-filter/collapse state stay plain
 * component state in `RulesTree.tsx`, not URL-synced. The SSR-safe
 * two-phase legacy read below is copied from `$category/index.tsx`'s own
 * pattern (that route's version is typed against the wider `BrowseSearch`
 * shape, a different concept — traits/level/rarity/book/edition mean
 * nothing on this tree page).
 */
interface RulesSearch {
  legacy?: boolean;
}

function validateRulesSearch(raw: Record<string, unknown>): RulesSearch {
  const v = raw.legacy;
  return v === true || v === 1 || v === "1" || v === "true" ? { legacy: true } : {};
}

export const Route = createFileRoute("/rules")({
  validateSearch: validateRulesSearch,
  loader: () => getRulesTree(),
  head: () => ({
    meta: [{ title: "Rules · codex" }],
  }),
  component: RulesRouteComponent,
});

function RulesRouteComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const liveLegacy = useLegacyToggle();

  // The M4 SSR/hydration seam (same as `$category/index.tsx`/`SearchPage.tsx`):
  // the FIRST render (server + the matching first client render) must derive
  // `legacy` from the isomorphic `search.legacy` alone; only after mount does
  // the live site-wide toggle take over.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => setHasHydrated(true), []);
  const effectiveLegacy = hasHydrated ? liveLegacy : search.legacy === true;

  // Reflect the live toggle into this route's own URL whenever it changes,
  // so `/rules?legacy=1` stays copy-shareable (D29-40 acceptance E).
  useEffect(() => {
    const currentlyHasLegacyParam = search.legacy === true;
    if (currentlyHasLegacyParam === effectiveLegacy) return;
    void navigate({ search: effectiveLegacy ? { legacy: true } : {}, replace: true });
  }, [effectiveLegacy, search, navigate]);

  return (
    <main className="wrap-wide">
      <header className="codex-listing-header">
        <h1 className="codex-listing-title">Rules</h1>
        <p className="codex-listing-count">{data.books.length} books</p>
      </header>
      <RulesTree books={data.books} legacy={effectiveLegacy} />
    </main>
  );
}
