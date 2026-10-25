import { firstParagraphSummary } from "@astra/codex-corpus";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { ClassBrowse } from "@/domain/browse/ClassBrowse";
import { splitCsv } from "@/domain/browse/urlState";
import { ClassPage } from "@/domain/render/ClassPage";
import { EntityRenderPane } from "@/domain/render/EntityRenderPane";
import type { ClassPageData } from "@/server/classPageData";
import { getClassPage } from "@/server/corpusFns";

/**
 * `/class/{slug}`: the bespoke class page's route shell. Static-over-dynamic
 * precedence (same `/rules` precedent `routes/class/index.tsx`'s own comment
 * cites) means every `class/*` id (`/class/fighter`,
 * `/class/investigator@legacy`, ...) resolves HERE, never through the
 * generic `$category/$slug` route — there is no fallback to `$category` for
 * class URLs.
 *
 * `ClassMainPane` (below) dispatches: a stats-bearing class renders the
 * bespoke `<ClassPage>`; every other `class/*` doc renders through the
 * generic `EntityRenderPane`.
 *
 * `loaderDeps` (REQUIRED — declare every search param a route reads): BOTH
 * `subclass` and `superseded` — `subclass` is load-bearing (toggling
 * `?subclass=` must re-run `getClassPage` so SSR fetches the
 * newly-selected subclass's body); `superseded` only gates the RAIL's
 * render (the page itself always renders regardless, same as `RulesLayout`'s
 * own "a superseded entity page always renders" posture) but is declared
 * anyway.
 */
interface ClassSlugSearch {
  superseded?: boolean;
  subclass?: string[];
}

function toBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** `?subclass=` is a CSV of `SubclassOption.targetId` values (full
 * `{category}/{slug}` ids, e.g. `class-feature/cloistered-cleric`) via the
 * EXISTING `splitCsv` codec (`urlState.ts`) — reused, not re-implemented
 * (spec's own "no reserved-param collision" review note). Deduplicated,
 * first-occurrence order; empty/whitespace-only tokens dropped.
 *
 * Array input (verified against the pinned `@tanstack/router-core@1.171.14`
 * default search (de)serializer directly — `stringifySearchWith`/
 * `parseSearchWith`, `searchParams.js`): a genuine `string[]` VALUE written
 * via `navigate({search})` round-trips as a real JS array (`typeof ===
 * "object"` -> `JSON.stringify` on write, `JSON.parse` succeeds on read) —
 * so a client-side subclass-pill toggle (`ClassSlugComponent`)
 * needs `raw.subclass` to ALSO be accepted as an already-decoded array, not
 * just the original comma-joined STRING a hand-typed/shared URL carries
 * (confirmed via `defaultParseSearch`/`defaultStringifySearch` run directly
 * against literal fixtures — both shapes are stable round-trips, never one
 * degrading into the other). Both branches apply the identical dedupe/trim/
 * empty-filter pass. */
function decodeSubclassParam(raw: unknown): string[] | undefined {
  const tokens: string[] = Array.isArray(raw)
    ? raw.filter((t): t is string => typeof t === "string")
    : typeof raw === "string" && raw.length > 0
      ? splitCsv(raw)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.length > 0 ? out : undefined;
}

function validateClassSlugSearch(raw: Record<string, unknown>): ClassSlugSearch {
  const supersededOut: ClassSlugSearch =
    "superseded" in raw
      ? toBool(raw.superseded)
        ? { superseded: true }
        : {}
      : toBool(raw.legacy)
        ? { superseded: true }
        : {};
  const subclass = decodeSubclassParam(raw.subclass);
  return { ...supersededOut, ...(subclass ? { subclass } : {}) };
}

export const Route = createFileRoute("/class/$slug")({
  validateSearch: validateClassSlugSearch,
  loaderDeps: ({ search }) => ({ subclass: search.subclass, superseded: search.superseded }),
  loader: async ({ params, deps }) => {
    const data = await getClassPage({
      data: { slug: params.slug, subclassTargetIds: deps.subclass },
    });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { entity } = loaderData;
    const description = firstParagraphSummary(entity.body);
    return {
      meta: [
        { title: `${entity.name} · codex` },
        ...(description.length > 0 ? [{ name: "description", content: description }] : []),
      ],
    };
  },
  component: ClassSlugComponent,
});

/**
 * The main-pane dispatch seam. `stats.kind === "class"`
 * is the ONE predicate `<ClassPage>` keys its bespoke render off of (Core
 * Traits/progression/subclass pills/feature stream/description) —
 * `data.grantedFeatures`/`data.selectedSubclasses` (already resolved server-
 * side) feed it directly. The 20 `@legacy` + 2 miscategorized `class/` docs
 * (no `stats.kind === "class"`) keep rendering the EXISTING generic pane
 * permanently, INSIDE the shell (no dead ends).
 */
function ClassMainPane({
  data,
  superseded,
  selectedSubclassIds,
  onSubclassToggle,
}: {
  data: ClassPageData;
  superseded: boolean;
  selectedSubclassIds: ReadonlySet<string>;
  onSubclassToggle: (targetId: string) => void;
}): ReactElement {
  if (data.entity.stats?.kind === "class") {
    return (
      <ClassPage
        data={data}
        superseded={superseded}
        selectedSubclassIds={selectedSubclassIds}
        onSubclassToggle={onSubclassToggle}
      />
    );
  }
  return <EntityRenderPane data={data} superseded={superseded} />;
}

function ClassSlugComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const superseded = search.superseded === true;
  const selectedSubclassIds = new Set(search.subclass ?? []);

  return (
    <ClassBrowse
      rail={data.rail}
      currentId={data.entity.id}
      superseded={superseded}
      basePath={`/${data.entity.id}`}
    >
      <ClassMainPane
        data={data}
        superseded={superseded}
        selectedSubclassIds={selectedSubclassIds}
        onSubclassToggle={(targetId) => {
          // "Component reports, route navigates" (the site's own
          // established split, `BrowseListing.tsx`'s `onSupersededReveal`):
          // add-vs-remove against the CURRENT url is decided here, then a
          // functional search merge (preserves every other active param)
          // writes the new array back — `decodeSubclassParam` above accepts
          // this shape verbatim on the round trip (verified directly against
          // the pinned router's default search (de)serializer). `replace:
          // true` (a pill toggle isn't a new navigation to undo via
          // back-button, same posture as the superseded-reveal toggle) +
          // `resetScroll: false` (toggling a pill must not jump the reader
          // back to the top of the page). This ALSO satisfies the
          // `loaderDeps` contract (`subclass` is declared below): the router
          // re-runs `getClassPage` in the background with the new
          // `?subclass=`, converging on the SSR-authoritative payload even
          // though the immediate render already shows the toggled doc via
          // `ClassPage`'s own `memoizedEntity` on-demand fetch.
          const next = new Set(selectedSubclassIds);
          if (next.has(targetId)) next.delete(targetId);
          else next.add(targetId);
          void navigate({
            search: (prev) => ({
              ...prev,
              subclass: next.size > 0 ? [...next] : undefined,
            }),
            replace: true,
            resetScroll: false,
          });
        }}
      />
    </ClassBrowse>
  );
}
