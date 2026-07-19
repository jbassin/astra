import { createFileRoute, notFound } from "@tanstack/react-router";

import { memoizedEntity } from "@/domain/browse/listingClient";
import { EntityRenderPane } from "@/domain/render/EntityRenderPane";
import { firstParagraphSummary } from "@/domain/render/text";
import { RulesLayout } from "@/domain/rules/RulesLayout";

/**
 * D29-22 — the entity page: `/{category}/{slug}` verbatim corpus ids
 * (`/spell/heal`, `/spell/heal@legacy`, `/creature/red-dragon-adult`, a raw
 * non-ASCII slug). The loader resolves the entity + its depth-0 embed targets +
 * the trait index + (P4 S4, D29-42) its resolved attached sidebars via the ONE
 * `getEntityPage` server fn (D29-23/-25); an unknown category/slug (including
 * a rejected traversal attempt — `corpusFns.ts`'s `CorpusNotFoundError`
 * collapses both to `null`) becomes the template's 404.
 *
 * `superseded` (P4 S4 D29-42, renamed by P4.5 D29-48): an attached-sidebar
 * host can be ANY category — a shared `?superseded=1` link to such a page
 * must SSR with its superseded sidebar visible (the standing SSR-flash
 * gotcha, P3 memory), so this route validates `superseded` the same way
 * `/rules`'s own route does (incl. the `legacy=1`/`legacy=true` alias-decode,
 * forever). P4.5 collapses this to a bare URL read — no live-toggle/
 * hydration-phase dance — and now also passes the computed value into
 * `<RulesLayout>` as that component's own `superseded` prop
 * (adversarial M2: an ADDITION there, not a rename).
 */
interface EntitySearch {
  superseded?: boolean;
}

function toBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

function validateEntitySearch(raw: Record<string, unknown>): EntitySearch {
  if ("superseded" in raw) {
    return toBool(raw.superseded) ? { superseded: true } : {};
  }
  return toBool(raw.legacy) ? { superseded: true } : {};
}

export const Route = createFileRoute("/$category/$slug")({
  validateSearch: validateEntitySearch,
  loader: async ({ params }) => {
    // P8 S3 (D29-82) — routed through the shared `memoizedEntity` cache
    // (`listingClient.ts`), not a bare `getEntityPage` call: a full-page
    // navigation reached via Enter from the split-view listing (having
    // already previewed this exact slug through `?entry=`) hits cache
    // instead of re-fetching.
    const data = await memoizedEntity(params.category, params.slug);
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
  component: EntityRouteComponent,
});

function EntityRouteComponent() {
  const data = Route.useLoaderData();
  const { entity, rulesNav } = data;
  const search = Route.useSearch();
  const superseded = search.superseded === true;

  // D29-28: `EntityRenderPane`'s `<Popover/>` mounts here (the entity route)
  // AND on the split-view right pane (`BrowseListing.tsx`) — never on the
  // bare listing rows themselves (spec's own reasoning for restricting the
  // mount point away from an 8k-row list).
  //
  // D29-112 (P11 S4) — `standalone`: this IS the standalone entity route
  // (as opposed to the split-view right pane, which omits the prop) — the
  // root header now carries the visible title (`HeaderTitle.tsx`), so the
  // in-content h1 renders sr-only here (`EntityPage`'s own doc comment).
  const page = <EntityRenderPane data={data} superseded={superseded} standalone />;

  // P4 S3 (D29-41): the tree sidebar/trail/pager wrap ONLY rules entity
  // pages carrying a resolved `rulesNav` — every other category's page is
  // untouched (`page` returned bare), and `rulesNav` is itself only ever
  // set for `entity.category === "rules"` (`entityPageData.ts`'s own gate).
  // Attached sidebars, unlike the tree nav, render on EVERY category
  // (D29-42) — `page` already includes them either way.
  if (rulesNav !== undefined) {
    return (
      <RulesLayout
        entityId={entity.id}
        entityName={entity.name}
        nav={rulesNav}
        superseded={superseded}
      >
        {page}
      </RulesLayout>
    );
  }
  return page;
}
