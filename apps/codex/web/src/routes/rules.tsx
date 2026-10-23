import { createFileRoute, useNavigate } from "@tanstack/react-router";

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
 * `superseded` is the ONLY url param this route reads — the D29-40 "no facet
 * panel, no tree state in the URL beyond the current-doc auto-expansion"
 * scope (§7 out of scope) means the quick-filter/collapse state stay plain
 * component state in `RulesTree.tsx`, not URL-synced.
 *
 * P4.5 D29-48: collapsed to a bare URL read — no live-toggle/hydration-phase/
 * resync effect at all (there is no second, live, cross-page source of
 * truth left to reconcile SSR against, since the site-wide toggle mechanism
 * is deleted outright). `legacy=1`/`legacy=true` still decodes as a
 * `superseded` alias (every shared link that predates this rename, forever,
 * not a deprecation window).
 */
interface RulesSearch {
  superseded?: boolean;
}

function toBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

function validateRulesSearch(raw: Record<string, unknown>): RulesSearch {
  if ("superseded" in raw) {
    return toBool(raw.superseded) ? { superseded: true } : {};
  }
  return toBool(raw.legacy) ? { superseded: true } : {};
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
  const superseded = search.superseded === true;
  const totalHidden = data.books.reduce((n, book) => n + book.hiddenWhenLegacyOff, 0);

  return (
    <main className="wrap-wide">
      <header className="codex-listing-header">
        <h1 className="codex-listing-title">Rules</h1>
        <p className="codex-listing-count">{data.books.length} books</p>
        {/* D29-48's own `/rules` visible control — no facet panel on this
            page (D29-40 unchanged), so a small inline link toggles the
            same `?superseded=1` param the drawer's Edition section writes
            elsewhere. The "Show N hidden" (off) state reuses the per-book
            "N hidden" note's own CSS class/microcopy convention; once
            widened, nothing is actually hidden anymore, so the reverse
            "Hide superseded" link deliberately does NOT carry that class
            (P4's own acceptance gate asserts zero `codex-rules-hidden-note`
            elements once every book renders unhidden). */}
        {totalHidden > 0 ? (
          superseded ? (
            <button
              type="button"
              className="codex-rules-superseded-toggle"
              onClick={() => void navigate({ search: {}, replace: true })}
            >
              Hide superseded &larr;
            </button>
          ) : (
            <button
              type="button"
              className="codex-rules-hidden-note codex-rules-superseded-toggle"
              onClick={() => void navigate({ search: { superseded: true }, replace: true })}
            >
              Show {totalHidden} hidden (superseded) &rarr;
            </button>
          )
        ) : null}
      </header>
      <RulesTree books={data.books} superseded={superseded} />
    </main>
  );
}
