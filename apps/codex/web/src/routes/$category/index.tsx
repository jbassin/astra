import type { IndexRow } from "@astra/codex-corpus";
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
import { displayCategoryName } from "@/domain/render/displayCategoryName";

/**
 * The faceted `/{category}` listing. The loader ships every row (no
 * server-side filtering — the listing filters locally); everything below
 * `component` is state<->URL wiring, the actual filter/render logic lives in
 * `BrowseListing.tsx`/`filterEngine.ts`/`urlState.ts` (kept route-agnostic
 * and independently unit-tested there).
 *
 * `state` is derived from `search` alone (isomorphic on both sides), no
 * `useState`/`useEffect`/hydration dance, since there's no second, live,
 * cross-page source of truth to reconcile against. Widening to superseded
 * content is an ordinary facet write (`FacetPanel.tsx`'s own
 * Edition-visibility section), so `onStateChange` needs no special
 * `superseded` resync either.
 *
 * Split-column browse: `?entry=<slug>` selects a row for the right pane.
 * Load-bearing pieces:
 *   - `loaderDeps` is REQUIRED — without it the matchId for `?entry=a` and
 *     `?entry=b` is identical and the loader never re-runs on a row click
 *     (verified against the pinned `@tanstack/router-core@1.171.14`).
 *   - `memoizedListing` (`listingClient.ts`) — a row click only ever fetches
 *     `getEntityPage`, never re-fetches the whole category's listing.
 *   - `?entry=` also resolves through the sibling
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
 * runtime guard is needed here to exclude `rules`.
 *
 * The loader ships a WINDOWED projection on the server
 * only: `typeof window === "undefined"` (the SAME SSR-detection idiom
 * `listingClient.ts`'s own memo guards already use) means this specific
 * invocation is the real server render, so `computeWindowedListing` filters
 * + sorts the full corpus row set exactly the way `BrowseListing.tsx`'s own
 * render path does, then slices to the initial-viewport window (currently 60
 * rows) — the router's dehydration payload carries AT MOST that many rows,
 * in the URL's real sort/filter order, while `totalCount`/
 * `eligibleCount` still reflect the FULL corpus so the count line and the
 * bottom spacer are both right on arrival. A client-executed loader run
 * (every SPA navigation once hydrated) hits the `else` branch — the full
 * local array, `totalCount === rows.length` (never "pending").
 * `CategoryIndexComponent`'s own effect (below)
 * is what fetches the FULL array back in for the one case that stays
 * genuinely partial — a cold SSR load nobody has navigated away from yet.
 *
 * The loader's return also carries an explicit `windowed: true | false`
 * flag (see its own inline comment at each `return`):
 * `data.rows.length < data.totalCount` (a size signal for "this payload is
 * still partial") is FALSE whenever
 * the visible-filtered set already fits inside one window, which is true
 * for any small category AND for any category where the current filter
 * (including the default superseded-off gate) excludes everything — in
 * both cases the windowed `rows` array never contains the rows outside
 * that filter, no matter how the count comparison reads. `windowed` is the
 * honest, size-independent signal both the post-hydration full-array fetch
 * and the `BrowseListing` override props key off.
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
        location.search,
        deps.entry,
      );
      // `windowed: true` marks this payload's `rows` as a WINDOWED,
      // ALREADY-FILTERED projection (`computeWindowedListing` applies the
      // superseded/query/facet gate BEFORE slicing to the window — see that
      // function's own doc comment): hidden rows are NEVER present in
      // `rows` here, no matter how small the category. A size check
      // (`data.rows.length < data.totalCount`) is the WRONG signal for "do
      // we still need the full array" — it's false whenever the
      // visible-filtered set already fits inside one window (a small
      // category, OR an ALL-superseded category, where `visible` is empty
      // and `0 < 0` is false), which would skip BOTH the count-line override
      // props AND the post-hydration full-array fetch, so clicking "Show N
      // hidden (superseded)" would reveal nothing (the hidden rows were never
      // fetched). An explicit flag, set true ONLY on this genuinely
      // server-windowed branch, makes both the fetch-trigger and the
      // override props key off "was this payload windowed at all," not a
      // size comparison that coincidentally lies.
      // `sourceLines` rides alongside the windowed
      // projection, NOT computed BY it: `computeWindowedListing` (a pure,
      // corpus-free function, `virtualization.ts`) has no reason to know
      // about the sources-index artifact, and the map itself is windowing
      // -independent (built from `listing.rows`, the FULL category, at
      // `resolveCategoryListing` time either way) — so it's spread in here
      // rather than added to that function's own return shape.
      return { ...windowed, entry, windowed: true as const, sourceLines: listing.sourceLines };
    }
    return {
      category: listing.category,
      rows: listing.rows,
      totalCount: listing.rows.length,
      eligibleCount: listing.rows.length,
      hiddenCount: listing.rows.filter((r) => r.superseded).length,
      entryVisible: undefined,
      entry,
      sourceLines: listing.sourceLines,
      // A client-executed loader run always ships the FULL raw
      // array already (`listing.rows` verbatim, no windowing/filtering) —
      // never needs the post-hydration re-fetch, and every override prop
      // above is redundant-but-harmless with what `BrowseListing` would
      // compute locally anyway.
      windowed: false as const,
    };
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `${displayCategoryName(loaderData.category)} · codex` }] } : {},
  component: CategoryIndexComponent,
});

function CategoryIndexComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const state = useMemo(() => searchToFilterState(search), [search]);

  // Scroll restoration is read here, not inside `BrowseListing` (that component
  // is deliberately router-agnostic, directly render-testable with a plain
  // state object — see its own file-level doc comment); only the `scrollY`
  // number crosses the boundary, via the same "component reports, route
  // supplies" split `onEntrySelect`/`onEntryPreview` already use in reverse.
  const restoredWindowEntry = useElementScrollRestoration({ getElement: () => window });

  // The post-hydration full-array fetch: `data.rows` is a windowed,
  // ALREADY-FILTERED SSR projection whenever `data.windowed` is true (see
  // the loader's own comment on that flag — a `data.rows.length <
  // data.totalCount` trigger would be WRONG for any category whose
  // visible-filtered set fits in one window: superseded rows are never in
  // `data.rows` regardless of size, so this effect must always run for a
  // windowed payload). `memoizedListing` is
  // the EXISTING client listing path (`listingClient.ts`) every SPA
  // navigation already fetches through — its module-level memo means this
  // costs nothing extra once a real navigation (row click, category
  // switch) happens to trigger the same fetch anyway. Depends on the whole
  // `data` object rather than picking fields: any refire this causes
  // beyond the one that matters is a no-op for a client-executed run
  // (`data.windowed` is false there, so this returns immediately).
  const [fullRows, setFullRows] = useState<readonly IndexRow[] | null>(null);
  useEffect(() => {
    setFullRows(null);
    if (!data.windowed) return;
    let cancelled = false;
    void memoizedListing(data.category).then((full) => {
      if (!cancelled && full) setFullRows(full.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const rows = fullRows ?? data.rows;
  const pending = fullRows === null && data.windowed;

  return (
    // `.wrap-browse` (96rem cap), not `.wrap-wide`
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
        hiddenCountOverride={pending ? data.hiddenCount : undefined}
        state={state}
        entrySlug={search.entry}
        entryData={data.entry}
        restoredScrollY={restoredWindowEntry?.scrollY}
        sourceLines={data.sourceLines}
        onStateChange={(updater) => {
          const next = updater(state);
          void navigate({ search: withEntryPreserved(next, search), replace: true });
        }}
        onEntrySelect={(slug) => {
          // A plain, NON-replace push: back/forward steps entry-to-entry
          // through visited rows. `resetScroll: false`: TanStack's own
          // default is `true` (verified against the pinned
          // `@tanstack/router-core` `buildAndCommitLocation` source — every
          // `navigate()` resets `window.scrollTo(0,0)` on render unless told
          // otherwise), and the listing can be thousands of rows tall, so a
          // reset here would throw the reader back to the top on every row
          // click.
          void navigate({ search: { ...search, entry: slug }, resetScroll: false });
        }}
        onEntryPreview={(slug) => {
          // REPLACE, never push: a j/k scan across many rows must not
          // create a history entry per row. Same `resetScroll: false` as
          // `onEntrySelect` above, for the SAME reason — a settled j/k
          // preview commit fires this exact `navigate()` call every ~180ms
          // during a scan; without the flag it snaps the listing back to the
          // top after every settle (and DOM focus falls back to `<body>`),
          // defeating j/k entirely on any list taller than one screen.
          void navigate({ search: { ...search, entry: slug }, replace: true, resetScroll: false });
        }}
        onSupersededReveal={(superseded) => {
          // A FUNCTIONAL search merge (`prev` is the CURRENT full
          // `BrowseSearch`, whatever it is): preserves every other active
          // param (q/traits/sort/entry/facets/…) verbatim, unlike `/rules`'s
          // own toggle (`routes/rules.tsx`), which can get away with a
          // whole-search REPLACE only because that route has no facet panel
          // at all. `resetScroll: false` — revealing/hiding superseded rows
          // isn't a new search; see `BrowseListing.tsx`'s own doc comment on
          // `onSupersededReveal` for why this bypasses the general
          // `onStateChange` path above (which doesn't set it).
          void navigate({
            search: (prev) => ({ ...prev, superseded: superseded || undefined }),
            replace: true,
            resetScroll: false,
          });
        }}
      />
    </main>
  );
}
