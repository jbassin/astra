import { createFileRoute } from "@tanstack/react-router";

import { ClassBrowse } from "@/domain/browse/ClassBrowse";
import { getClassRail } from "@/server/corpusFns";

/**
 * P12 S2 (D29-118) — the bare `/class` index: rail + an intro/empty pane
 * (no bespoke class selected). A STATIC file route (`routes/class/index.tsx`,
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
  loader: () => getClassRail(),
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
