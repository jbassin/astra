import { createFileRoute, notFound } from "@tanstack/react-router";

import { Popover } from "@/domain/components/islands/Popover";
import { EntityPage } from "@/domain/render/entityPage";
import { rootRenderCtx } from "@/domain/render/nodes";
import { firstParagraphSummary } from "@/domain/render/text";
import { RulesLayout } from "@/domain/rules/RulesLayout";
import { getEntityPage } from "@/server/corpusFns";

/**
 * D29-22 — the entity page: `/{category}/{slug}` verbatim corpus ids
 * (`/spell/heal`, `/spell/heal@legacy`, `/creature/red-dragon-adult`, a raw
 * non-ASCII slug). The loader resolves the entity + its depth-0 embed targets +
 * the trait index via the ONE `getEntityPage` server fn (D29-23/-25); an unknown
 * category/slug (including a rejected traversal attempt — `corpusFns.ts`'s
 * `CorpusNotFoundError` collapses both to `null`) becomes the template's 404.
 */
export const Route = createFileRoute("/$category/$slug")({
  loader: async ({ params }) => {
    const data = await getEntityPage({
      data: { category: params.category, slug: params.slug },
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
  component: EntityRouteComponent,
});

function EntityRouteComponent() {
  const { entity, embeds, knownTraitIds, rulesNav } = Route.useLoaderData();
  const ctx = rootRenderCtx({
    resolveEmbed: (targetId) => embeds[targetId],
    knownTraitIds: new Set(knownTraitIds),
  });
  const page = (
    <>
      {/* D29-28: mounted on the entity route ONLY (not the index/listing
          routes) — hover cards on crossrefs + trait pills, never on an 8k-row
          listing (spec's own reasoning for restricting the mount point). */}
      <Popover />
      <EntityPage entity={entity} ctx={ctx} />
    </>
  );

  // P4 S3 (D29-41): the tree sidebar/trail/pager wrap ONLY rules entity
  // pages carrying a resolved `rulesNav` — every other category's page is
  // untouched (`page` returned bare), and `rulesNav` is itself only ever
  // set for `entity.category === "rules"` (`entityPageData.ts`'s own gate).
  if (rulesNav !== undefined) {
    return (
      <RulesLayout entityId={entity.id} entityName={entity.name} nav={rulesNav}>
        {page}
      </RulesLayout>
    );
  }
  return page;
}
