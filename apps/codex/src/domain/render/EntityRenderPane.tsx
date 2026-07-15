import type { ReactElement } from "react";

import type { EntityPageData } from "../../server/entityPageData";
import { Popover } from "../components/islands/Popover";
import { AttachedSidebars } from "./AttachedSidebars";
import { EntityPage } from "./entityPage";
import { rootRenderCtx } from "./nodes";

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
export function EntityRenderPane({
  data,
  superseded,
}: {
  data: EntityPageData;
  superseded: boolean;
}): ReactElement {
  const { entity, embeds, knownTraitIds, attachedSidebars } = data;
  const ctx = rootRenderCtx({
    resolveEmbed: (targetId) => embeds[targetId],
    knownTraitIds: new Set(knownTraitIds),
  });
  return (
    <>
      {/* D29-28: hover cards mount here too — the split-view right pane IS
          an entity page render, same posture as the standalone route. */}
      <Popover />
      <EntityPage entity={entity} ctx={ctx} />
      {attachedSidebars !== undefined ? (
        <AttachedSidebars sidebars={attachedSidebars} superseded={superseded} ctx={ctx} />
      ) : null}
    </>
  );
}
