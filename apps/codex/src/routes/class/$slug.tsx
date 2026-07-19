import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { ClassBrowse } from "@/domain/browse/ClassBrowse";
import { splitCsv } from "@/domain/browse/urlState";
import { EntityRenderPane } from "@/domain/render/EntityRenderPane";
import { firstParagraphSummary } from "@/domain/render/text";
import type { ClassPageData } from "@/server/classPageData";
import { getClassPage } from "@/server/corpusFns";

/**
 * P12 S2 (D29-117/-118) — `/class/{slug}`: the bespoke class page's route
 * shell. Static-over-dynamic precedence (same `/rules` precedent
 * `routes/class/index.tsx`'s own comment cites) means every `class/*` id
 * (`/class/fighter`, `/class/investigator@legacy`, ...) resolves HERE now,
 * never through the generic `$category/$slug` route — `/class` is fully
 * owned by this directory going forward (spec's own explicit "no fallback
 * to $category for class URLs" text).
 *
 * THIS SLICE renders the shell + dispatch seam only — see `ClassMainPane`
 * below for exactly where S3's bespoke `<ClassPage>` composition plugs in.
 * Every `/class/{slug}` page (stats-bearing AND fail-soft alike) renders
 * through the EXISTING `EntityRenderPane` today.
 *
 * `loaderDeps` (REQUIRED, the codified P4.5 lesson the spec calls out by
 * name): BOTH `subclass` and `superseded` — `subclass` is load-bearing
 * (toggling `?subclass=` must re-run `getClassPage` so SSR fetches the
 * newly-selected subclass's body, acceptance D's own "an in-app `?subclass=`
 * change re-runs the loader" gate); `superseded` only gates the RAIL's
 * render (the page itself always renders regardless, same as `RulesLayout`'s
 * own "a superseded entity page always renders" posture) but is declared
 * per the spec's explicit D29-118 text regardless.
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
 * first-occurrence order; empty/whitespace-only tokens dropped. */
function decodeSubclassParam(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of splitCsv(raw)) {
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
 * D29-117/-118 — the main-pane dispatch seam. `stats.kind === "class"` is
 * the ONE predicate S3's `<ClassPage>` will key its bespoke render off of
 * (Core Traits/progression/subclass pills/feature stream/description) —
 * both branches render `EntityRenderPane` identically today because that
 * component doesn't exist yet; the `if` is the seam itself, kept visible
 * rather than collapsed to one bare return so S3's diff is a single swap.
 */
function ClassMainPane({
  data,
  superseded,
}: {
  data: ClassPageData;
  superseded: boolean;
}): ReactElement {
  if (data.entity.stats?.kind === "class") {
    // TODO(P12 S3, D29-119/-120): swap this branch for the bespoke
    // `<ClassPage>` composition (Core Traits box, progression table,
    // subclass pills + on-demand fetch, feature stream, description
    // suppression, ToC wiring) — `data.grantedFeatures`/
    // `data.selectedSubclasses` are already resolved and waiting on this
    // payload for that render to consume.
    return <EntityRenderPane data={data} superseded={superseded} standalone />;
  }
  // Fail-soft: the 20 `@legacy` + 2 miscategorized `class/` docs (no
  // `stats.kind === "class"`) render the generic pane permanently, INSIDE
  // the shell (D29-118's own "no dead ends" text) — this branch is NOT
  // temporary, unlike the one above.
  return <EntityRenderPane data={data} superseded={superseded} standalone />;
}

function ClassSlugComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const superseded = search.superseded === true;

  return (
    <ClassBrowse
      rail={data.rail}
      currentId={data.entity.id}
      superseded={superseded}
      basePath={`/${data.entity.id}`}
    >
      <ClassMainPane data={data} superseded={superseded} />
    </ClassBrowse>
  );
}
