import type { ReactElement } from "react";

import type { EntityPageData } from "../../server/entityPageData";
import { Popover } from "../components/islands/Popover";
import { AttachedSidebars } from "./AttachedSidebars";
import { EntityPage } from "./entityPage";
import { createHeadingIdAssigner } from "./headingIds";
import { type RenderCtx, rootRenderCtx } from "./nodes";

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
 * D29-112 (P11 S4) once threaded a `standalone` prop straight through to
 * `EntityPage`'s own prop of the same name, so the standalone entity route
 * and the split-view right pane could render `EntityHeader`'s h1
 * differently (sr-only vs visible). A later stakeholder redirect scoped
 * header-carries-title back down to parent/listing surfaces only, so
 * `EntityPage` no longer has a `standalone` prop to thread at all — BOTH
 * the standalone entity route and the split-view right pane now render the
 * h1 fully visible, unconditionally, via this same component (see
 * `EntityHeader.tsx`'s own updated comment for the full history).
 */
export function EntityRenderPane({
  data,
  superseded,
}: {
  data: EntityPageData;
  superseded: boolean;
}): ReactElement {
  const { entity, embeds, knownTraitIds, attachedSidebars, assay } = data;
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
      {/* P14 S2 (D29-137) — the "On this page" ToC is dropped everywhere
          (stakeholder-directed, mirrors the P12 class-page deletion
          `7829f29`): `.codex-toc` had NO CSS at all, so the `<details>`
          rendered as a full-width unstyled 1440x624px strip pushing the
          article ~620px down. Every standalone page's own fixed section
          order + real heading anchors is the in-page-navigation substitute
          (ancestry pages lose the box; stakeholder-accepted). This was the
          last mount — `TableOfContents.tsx` itself is deleted too. */}
      {/* D30-39/40 — `assay` flows through the SAME `EntityPageData` this
          pane already destructures above, so the split-view `?entry=`
          preview pane renders the Assay block exactly like the standalone
          route (accepted, recorded in the spec's status header — "DOES
          appear in the ?entry= preview pane"). */}
      <EntityPage entity={entity} ctx={ctx} assay={assay} />
      {attachedSidebars !== undefined ? (
        <AttachedSidebars sidebars={attachedSidebars} superseded={superseded} ctx={ctx} />
      ) : null}
    </>
  );
}
