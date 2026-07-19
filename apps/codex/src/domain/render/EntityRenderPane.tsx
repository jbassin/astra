import type { ReactElement } from "react";

import type { EntityPageData } from "../../server/entityPageData";
import { Popover } from "../components/islands/Popover";
import { AttachedSidebars } from "./AttachedSidebars";
import { EntityPage } from "./entityPage";
import { createHeadingIdAssigner } from "./headingIds";
import { type RenderCtx, rootRenderCtx } from "./nodes";
import { TableOfContents } from "./TableOfContents";

/**
 * P4.5 S4 (D29-49) — the entity-render composition shared by BOTH the
 * canonical `/{category}/{slug}` route (`routes/$category/$slug.tsx`) and
 * the split-view browse route's right pane (`BrowseListing.tsx`, via
 * `routes/$category/index.tsx`'s loader): `<Popover/>` + `<EntityPage/>` +
 * `AttachedSidebars` (with the superseded prop), built from one
 * `EntityPageData` payload — exactly "the full entity render, unmodified
 * `getEntityPage`/`EntityPageData`" the spec's R1 confirms is reusable
 * verbatim. Extracted here (rather than duplicated) so both call sites stay
 * byte-identical by construction; `rulesNav`/`RulesLayout` wrapping is
 * deliberately NOT part of this component — D29-49 excludes the `rules`
 * category from split view entirely (its dedicated tree browser stays
 * untouched), and `$category/$slug.tsx` wraps this component in
 * `<RulesLayout>` itself only when `rulesNav` is present.
 */
/**
 * D29-112 (P11 S4) — `standalone` (default `undefined`, i.e. falsy) threads
 * straight through to `EntityPage`'s own prop of the same name: BOTH the
 * standalone entity route and the split-view right pane consume `EntityPage`
 * ONLY via this component now, so this is the ONE seam that needs to know
 * which caller is which. The entity route passes `standalone` (the root
 * header carries the visible title there, `HeaderTitle.tsx`); the
 * split-view pane omits it entirely — an embedded context, same posture as
 * the regen-goldens script, where the h1 stays fully visible (nothing else
 * in that pane's own chrome shows the entity's name).
 */
export function EntityRenderPane({
  data,
  superseded,
  standalone,
}: {
  data: EntityPageData;
  superseded: boolean;
  standalone?: boolean;
}): ReactElement {
  const { entity, embeds, knownTraitIds, attachedSidebars } = data;
  const baseCtx = rootRenderCtx({
    resolveEmbed: (targetId) => embeds[targetId],
    knownTraitIds: new Set(knownTraitIds),
  });
  // D29-109b (P11 S5, #15) — a FRESH per-page heading-id assigner every
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
      {/* D29-28: hover cards mount here too — the split-view right pane IS
          an entity page render, same posture as the standalone route. */}
      <Popover />
      {/* D29-109b — the "On this page" ToC box, standalone routes only
          (entity page + rules doc, both of which pass `standalone` here;
          the split-view right pane and any embedded/golden context omit
          it, same gate `EntityPage`'s own h1-visibility uses). */}
      {standalone ? <TableOfContents /> : null}
      <EntityPage entity={entity} ctx={ctx} standalone={standalone} />
      {attachedSidebars !== undefined ? (
        <AttachedSidebars sidebars={attachedSidebars} superseded={superseded} ctx={ctx} />
      ) : null}
    </>
  );
}
