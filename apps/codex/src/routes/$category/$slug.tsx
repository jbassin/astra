import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useLegacyToggle } from "@/domain/browse/legacyToggle";
import { Popover } from "@/domain/components/islands/Popover";
import { AttachedSidebars } from "@/domain/render/AttachedSidebars";
import { EntityPage } from "@/domain/render/entityPage";
import { rootRenderCtx } from "@/domain/render/nodes";
import { firstParagraphSummary } from "@/domain/render/text";
import { RulesLayout } from "@/domain/rules/RulesLayout";
import { getEntityPage } from "@/server/corpusFns";

/**
 * D29-22 — the entity page: `/{category}/{slug}` verbatim corpus ids
 * (`/spell/heal`, `/spell/heal@legacy`, `/creature/red-dragon-adult`, a raw
 * non-ASCII slug). The loader resolves the entity + its depth-0 embed targets +
 * the trait index + (P4 S4, D29-42) its resolved attached sidebars via the ONE
 * `getEntityPage` server fn (D29-23/-25); an unknown category/slug (including
 * a rejected traversal attempt — `corpusFns.ts`'s `CorpusNotFoundError`
 * collapses both to `null`) becomes the template's 404.
 *
 * `legacy` is a P4 S4 addition (D29-42): unlike `RulesLayout`'s own bare
 * `useLegacyToggle()` (D29-41 explicitly punted a URL feature for rules pages,
 * "only `/rules` itself is shareable that way"), an attached-sidebar host can
 * be ANY category — a shared `?legacy=1` link to such a page must SSR with its
 * superseded sidebar visible (the standing SSR-flash gotcha, P3 memory), so
 * this route validates `legacy` the same way `/rules`'s own route does.
 */
interface EntitySearch {
  legacy?: boolean;
}

function validateEntitySearch(raw: Record<string, unknown>): EntitySearch {
  const v = raw.legacy;
  return v === true || v === 1 || v === "1" || v === "true" ? { legacy: true } : {};
}

export const Route = createFileRoute("/$category/$slug")({
  validateSearch: validateEntitySearch,
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
  const { entity, embeds, knownTraitIds, rulesNav, attachedSidebars } = Route.useLoaderData();
  const search = Route.useSearch();
  const liveLegacy = useLegacyToggle();

  // The standing M4 SSR/hydration seam (same as `/rules`'s own route): the
  // FIRST render — server AND the matching first client render — must derive
  // `legacy` from the isomorphic `search.legacy` alone; only after mount does
  // the live site-wide toggle take over.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => setHasHydrated(true), []);
  const effectiveLegacy = hasHydrated ? liveLegacy : search.legacy === true;

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
      {attachedSidebars !== undefined ? (
        <AttachedSidebars sidebars={attachedSidebars} legacy={effectiveLegacy} ctx={ctx} />
      ) : null}
    </>
  );

  // P4 S3 (D29-41): the tree sidebar/trail/pager wrap ONLY rules entity
  // pages carrying a resolved `rulesNav` — every other category's page is
  // untouched (`page` returned bare), and `rulesNav` is itself only ever
  // set for `entity.category === "rules"` (`entityPageData.ts`'s own gate).
  // Attached sidebars, unlike the tree nav, render on EVERY category
  // (D29-42) — `page` already includes them either way.
  if (rulesNav !== undefined) {
    return (
      <RulesLayout entityId={entity.id} entityName={entity.name} nav={rulesNav}>
        {page}
      </RulesLayout>
    );
  }
  return page;
}
