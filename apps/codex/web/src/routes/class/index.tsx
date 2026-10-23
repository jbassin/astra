import { createFileRoute, redirect } from "@tanstack/react-router";

import { ClassBrowse } from "@/domain/browse/ClassBrowse";
import { getClassRail } from "@/server/corpusFns";

/**
 * P12 S2 (D29-118), amended post-P12 (stakeholder): the bare `/class` index
 * now REDIRECTS to the first visible rail class (alphabetical — Alchemist on
 * the real corpus, Cleric on the fixture corpus) instead of rendering an
 * empty "pick a class" pane — landing on nothing felt bad. The redirect is
 * loader-thrown (works identically for SSR — a 3xx with Location — and an
 * in-app navigation), `replace: true` so Back skips the bare `/class` hop,
 * and carries `?superseded=` through. The intro render below survives ONLY
 * as the fail-soft for a corpus with zero visible classes (never a real
 * corpus; keeps the route from 500ing on a degenerate fixture).
 *
 * A STATIC file route (`routes/class/index.tsx`,
 * mirroring `routes/$category/index.tsx`'s own directory shape) — TanStack
 * Router ranks a literal path segment ("class") above the `$category`
 * parameter route for this exact path, the SAME static-over-dynamic
 * precedence `/rules` already proves (`routes/rules.tsx`'s own doc comment);
 * see `ssrSmoke.test.ts`'s new "out-ranks the $category/ route" case for
 * `/class` specifically.
 *
 * `loaderDeps`/`superseded`: mirrors `/rules`'s own URL-only read (no facet
 * panel, no tree state) — required per the spec's own D29-118 text (the
 * codified P4.5 "declare loaderDeps for every search param a route reads"
 * lesson), even though this route's OWN loader output doesn't vary with it
 * (the rail ships BOTH tiers always; `superseded` only gates which tier
 * `ClassBrowse` renders, isomorphically off `Route.useSearch()` — same
 * "state derived from search alone" posture P4.5 D29-48 already settled for
 * `/rules`/`$category/`, so there's no SSR-flash risk either way).
 */
interface ClassIndexSearch {
  superseded?: boolean;
}

function toBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

function validateClassIndexSearch(raw: Record<string, unknown>): ClassIndexSearch {
  if ("superseded" in raw) {
    return toBool(raw.superseded) ? { superseded: true } : {};
  }
  return toBool(raw.legacy) ? { superseded: true } : {};
}

export const Route = createFileRoute("/class/")({
  validateSearch: validateClassIndexSearch,
  loaderDeps: ({ search }) => ({ superseded: search.superseded }),
  loader: async ({ deps }) => {
    const rail = await getClassRail();
    const first = rail.visible[0];
    const slug = first?.id.split("/")[1];
    if (slug !== undefined && slug.length > 0) {
      throw redirect({
        to: "/class/$slug",
        params: { slug },
        search: deps.superseded === true ? { superseded: true } : {},
        replace: true,
      });
    }
    return rail;
  },
  head: () => ({
    meta: [{ title: "Classes · codex" }],
  }),
  component: ClassIndexComponent,
});

function ClassIndexComponent() {
  const rail = Route.useLoaderData();
  const search = Route.useSearch();
  const superseded = search.superseded === true;

  return (
    <ClassBrowse rail={rail} superseded={superseded} basePath="/class">
      <main className="wrap-wide">
        <h1 className="codex-listing-title">Classes</h1>
        <p className="codex-listing-count">
          Pick a class from the list to see its progression, key traits, and subclass options.
        </p>
      </main>
    </ClassBrowse>
  );
}
