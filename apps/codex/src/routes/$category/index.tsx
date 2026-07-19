import {
  createFileRoute,
  notFound,
  useElementScrollRestoration,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { BrowseListing } from "@/domain/browse/BrowseListing";
import { memoizedEntity, memoizedListing } from "@/domain/browse/listingClient";
import {
  searchToFilterState,
  validateBrowseSearch,
  withEntryPreserved,
  type BrowseSearch,
} from "@/domain/browse/urlState";
import { computeWindowedListing } from "@/domain/browse/virtualization";
import type { IndexRow } from "@/schema/entity";

/**
 * D29-35 — the faceted `/{category}` listing that replaced P2's D29-27
 * throwaway A–Z page. The loader still ships every row (no server-side
 * filtering — D29-35's "filter locally" stakeholder call); everything below
 * `component` is state<->URL wiring, the actual filter/render logic lives in
 * `BrowseListing.tsx`/`filterEngine.ts`/`urlState.ts` (kept route-agnostic
 * and independently unit-tested there).
 *
 * P4.5 D29-48: the M4 two-phase SSR/live-toggle read is GONE — `state` is
 * derived from `search` alone (isomorphic on both sides), no
 * `useState`/`useEffect`/hydration dance, since there's no second, live,
 * cross-page source of truth left to reconcile against (the site-wide
 * legacy toggle mechanism is deleted outright). Widening to superseded
 * content is just an ordinary facet write now (`FacetPanel.tsx`'s own
 * Edition-visibility section), so `onStateChange` needs no special
 * `superseded` resync either.
 *
 * P4.5 S4 (D29-49) — split-column browse: `?entry=<slug>` selects a row for
 * the right pane. Three load-bearing pieces (adversarial B1/B2/B3, spec's
 * own "Loader mechanics"):
 *   - `loaderDeps` is REQUIRED — without it the matchId for `?entry=a` and
 *     `?entry=b` is identical and the loader never re-runs on a row click
 *     (verified against the pinned `@tanstack/router-core@1.171.14`).
 *   - `memoizedListing` (`listingClient.ts`) — a row click only ever fetches
 *     `getEntityPage`, never re-fetches the whole category's listing.
 *   - **P8 S3 (D29-82):** `?entry=` now also resolves through the sibling
 *     `memoizedEntity` (same file), not a bare `getEntityPage` call — j/k
 *     focus-scanning can commit several `?entry=` values per second, and a
 *     later Enter/click onto the FULL `/{category}/{slug}` page (that
 *     route's own loader, same memo) should hit cache rather than re-fetch.
 *   - `onStateChange` resyncs `entry` back into every facet-write's search
 *     object via `withEntryPreserved` (`urlState.ts`) — `entry` lives
 *     outside `BrowseFilterState` entirely, so a bare `filterStateToSearch`
 *     call here would silently strip the split-view selection on any facet
 *     change/clear-all.
 *
 * `rules` never reaches this route for the literal category "rules" — the
 * static top-level `/rules` route (`routes/rules.tsx`) always out-ranks a
 * dynamic `$category` segment for that exact path (proven by
 * `ssrSmoke.test.ts`'s own "out-ranks the $category/ route" case) — so no
 * runtime guard is needed here for D29-49's "except `rules`" exclusion.
 *
 * P9 S1 (D29-89) — the loader ships a WINDOWED projection on the server
 * only: `typeof window === "undefined"` (the SAME SSR-detection idiom
 * `listingClient.ts`'s own memo guards already use) means this specific
 * invocation is the real server render, so `computeWindowedListing` filters
 * + sorts the full corpus row set exactly the way `BrowseListing.tsx`'s own
 * render path does, then slices to the D29-84-derived window (currently 60
 * rows) — the router's dehydration payload carries AT MOST that many rows,
 * in the URL's real sort/filter order (gate B), while `totalCount`/
 * `eligibleCount` still reflect the FULL corpus so the count line and the
 * bottom spacer are both right on arrival. A client-executed loader run
 * (every SPA navigation once hydrated) hits the `else` branch — full local
 * array, exactly today's pre-P9 behavior, `totalCount === rows.length`
 * (never actually "pending", D29-89's own "on client-side navigations the
 * loader behaves as today"). `CategoryIndexComponent`'s own effect (below)
 * is what fetches the FULL array back in for the one case that stays
 * genuinely partial — a cold SSR load nobody has navigated away from yet.
 */
export const Route = createFileRoute("/$category/")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => validateBrowseSearch(search),
  loaderDeps: ({ search }) => ({ entry: search.entry }),
  loader: async ({ params, deps, location }) => {
    const [listing, entry] = await Promise.all([
      memoizedListing(params.category),
      deps.entry !== undefined
        ? memoizedEntity(params.category, deps.entry)
        : Promise.resolve(null),
    ]);
    if (!listing) throw notFound();

    if (typeof window === "undefined") {
      const windowed = computeWindowedListing(
        listing.category,
        listing.rows,
        location.search as BrowseSearch,
        deps.entry,
      );
      return { ...windowed, entry };
    }
    return {
      category: listing.category,
      rows: listing.rows,
      totalCount: listing.rows.length,
      eligibleCount: listing.rows.length,
      entryVisible: undefined,
      entry,
    };
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `${loaderData.category} · codex` }] } : {},
  component: CategoryIndexComponent,
});

function CategoryIndexComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const state = useMemo(() => searchToFilterState(search), [search]);

  // P9 S2 (D29-84) — read here, not inside `BrowseListing` (that component
  // is deliberately router-agnostic, directly render-testable with a plain
  // state object — see its own file-level doc comment); only the `scrollY`
  // number crosses the boundary, via the same "component reports, route
  // supplies" split `onEntrySelect`/`onEntryPreview` already use in reverse.
  const restoredWindowEntry = useElementScrollRestoration({ getElement: () => window });

  // P9 S1 (D29-89) — the post-hydration full-array fetch: `data.rows` is a
  // windowed SSR projection whenever `data.rows.length < data.totalCount`
  // (client-executed loader runs never leave this true — see the loader's
  // own comment). `memoizedListing` is the EXISTING client listing path
  // (`listingClient.ts`) every SPA navigation already fetches through — its
  // module-level memo means this costs nothing extra once a real navigation
  // (row click, category switch) happens to trigger the same fetch anyway.
  // Depends on the whole `data` object rather than picking fields: any
  // refire this causes beyond the one that matters is a no-op (`data.rows`
  // is ALREADY the full array by then, so the `pending` guard below returns
  // immediately and `fullRows` just gets reset to a value `data.rows`
  // already equals).
  const [fullRows, setFullRows] = useState<readonly IndexRow[] | null>(null);
  useEffect(() => {
    setFullRows(null);
    if (data.rows.length >= data.totalCount) return;
    let cancelled = false;
    void memoizedListing(data.category).then((full) => {
      if (!cancelled && full) setFullRows(full.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const rows = fullRows ?? data.rows;
  const pending = fullRows === null && data.rows.length < data.totalCount;

  return (
    // P11 S2 (D29-103) — `.wrap-browse` (96rem cap), not `.wrap-wide`
    // (72rem): scoped to THIS route file only — /search/​/rules/​/sources all
    // still use `.wrap-wide` directly and must keep their own narrower
    // measure (`globals.css`'s own comment on `.wrap-browse`).
    <main className="wrap-browse">
      <BrowseListing
        category={data.category}
        rows={rows}
        totalCount={pending ? data.totalCount : undefined}
        eligibleCountOverride={pending ? data.eligibleCount : undefined}
        entryVisibleOverride={pending ? data.entryVisible : undefined}
        state={state}
        entrySlug={search.entry}
        entryData={data.entry}
        restoredScrollY={restoredWindowEntry?.scrollY}
        onStateChange={(updater) => {
          const next = updater(state);
          void navigate({ search: withEntryPreserved(next, search), replace: true });
        }}
        onEntrySelect={(slug) => {
          // D29-49 — a plain, NON-replace push: back/forward steps
          // entry-to-entry through visited rows. P9 S2 (D29-83/-85) —
          // `resetScroll: false`: TanStack's own default is `true` (verified
          // against the pinned `@tanstack/router-core` `buildAndCommitLocation`
          // source — every `navigate()` resets `window.scrollTo(0,0)` on
          // render unless told otherwise), a P8-era latent bug this slice's
          // own real-browser j/k coverage surfaced — pre-windowing there was
          // nothing tall enough to scroll BACK from, so a row click's own
          // scroll-to-top was invisible; now the listing can be thousands of
          // rows tall and a reset here would undo D29-85's whole point.
          void navigate({ search: { ...search, entry: slug }, resetScroll: false });
        }}
        onEntryPreview={(slug) => {
          // P8 S3 (D29-82) — REPLACE, never push: a j/k scan across many
          // rows must not create a history entry per row (gate E). P9 S2 —
          // same `resetScroll: false` fix as `onEntrySelect` above, for the
          // SAME reason — a settled j/k preview commit fires this exact
          // `navigate()` call every ~180ms during a scan; without the flag it
          // silently snapped the listing back to the top after every single
          // settle, defeating j/k entirely on any list taller than one
          // screen (found via this slice's own Playwright coverage: `?entry=`
          // committed correctly, but `window.scrollY` measured 0 and DOM
          // focus had fallen back to `<body>` a few hundred ms after a j-scan
          // stopped — the row was scrolled to, then un-scrolled back to top).
          void navigate({ search: { ...search, entry: slug }, replace: true, resetScroll: false });
        }}
      />
    </main>
  );
}
