import type { ReactElement } from "react";

import type { EntityPageData } from "../../server/entityPageData";
import { Popover } from "../components/islands/Popover";
import { AttachedSidebars } from "./AttachedSidebars";
import { EntityPage } from "./entityPage";
import { createHeadingIdAssigner } from "./headingIds";
import { type RenderCtx, rootRenderCtx } from "./nodes";

/**
 * The entity-render composition shared by BOTH the canonical
 * `/{category}/{slug}` route (`routes/$category/$slug.tsx`) and the
 * split-view browse route's right pane (`BrowseListing.tsx`, via
 * `routes/$category/index.tsx`'s loader): `<Popover/>` + `<EntityPage/>` +
 * `AttachedSidebars` (with the superseded prop), built from one
 * `EntityPageData` payload: the full entity render, reusing
 * `getEntityPage`/`EntityPageData` unmodified. Extracted here (rather than
 * duplicated) so both call sites stay byte-identical by construction;
 * `rulesNav`/`RulesLayout` wrapping is deliberately NOT part of this
 * component — the `rules` category is excluded from split view entirely
 * (its dedicated tree browser stays untouched), and `$category/$slug.tsx` wraps this component in
 * `<RulesLayout>` itself only when `rulesNav` is present.
 */
/**
 * There is no `standalone` prop: the header carries the title only on
 * parent/listing surfaces, so BOTH the standalone entity route and the
 * split-view right pane render `EntityHeader`'s h1 fully visible,
 * unconditionally, via this same component (see `EntityHeader.tsx`).
 */
export function EntityRenderPane({
  data,
  superseded,
}: {
  data: EntityPageData;
  superseded: boolean;
}): ReactElement {
  const { entity, embeds, knownTraitIds, attachedSidebars } = data;
  const baseCtx = rootRenderCtx({
    resolveEmbed: (targetId) => embeds[targetId],
    knownTraitIds: new Set(knownTraitIds),
  });
  // A FRESH per-page heading-id assigner every
  // time this component renders: `EntityRenderPane` is the one composition
  // root that always corresponds to exactly one page (one request, one
  // mount) for both the standalone entity route AND the split-view right
  // pane, so creating it here (rather than baking it into `rootRenderCtx`
  // itself, which the goldens loader calls ONCE and reuses across many
  // fixture entities — see `scripts/regen-goldens.ts`'s own comment) keeps
  // collision tracking correctly scoped to THIS page, never leaking across
  // an unrelated render.
  const ctx: RenderCtx = { ...baseCtx, headingId: createHeadingIdAssigner() };
  return (
    <>
      {/* Hover cards mount here too — the split-view right pane IS
          an entity page render, same posture as the standalone route. */}
      <Popover />
      {/* No "On this page" ToC, by stakeholder decision: each standalone
          page's fixed section order and real heading anchors serve for
          in-page navigation instead. */}
      <EntityPage entity={entity} ctx={ctx} />
      {attachedSidebars !== undefined ? (
        <AttachedSidebars sidebars={attachedSidebars} superseded={superseded} ctx={ctx} />
      ) : null}
    </>
  );
}
