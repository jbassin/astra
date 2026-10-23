import type { ReactElement } from "react";

import type { AssayEntry } from "../../schema/assay";
import type { CodexEntity } from "../../schema/entity";
import { AssayBlock } from "./assayBlock";
import { categoryGroupOf } from "./categoryGroup";
import { EntityHeader } from "./EntityHeader";
import {
  EquipmentFacetHeader,
  FeatFacetHeader,
  GenericFacetLine,
  MastheadExtraFallback,
  SpellFacetHeader,
} from "./facetHeader";
import { reportLoreSuppression, suppressLoreSections } from "./loreDedupe";
import { type RenderCtx, renderNodes } from "./nodes";
import { CreatureStatblock, EmbeddedItemSections, HazardStatblock } from "./statblock";

/**
 * D29-26 — the assembled entity page: the universal header (name + level,
 * traits, edition pill, rarity, citation, aonUrl link, edition banner), the
 * category-group's own facet/statblock header, embedded-item sections (any
 * Actor-derived entity, not just creature/hazard), then body/loreBody.
 *
 * This is the render-layer's own composition root (S1, frontend-free) — S2
 * wires it into an actual route/loader; nothing here touches the filesystem
 * or a server.
 */

/** D29-109c (P11 S5, #16) — the trait-page dead-end fix: "Find everything
 * with this trait" links to the filter-only `/search?traits=<trait>` view
 * (S1's null-query fix, D29-101c, is what makes that a real, non-empty
 * result set). */
function TraitCrossNav({ trait }: { trait: string }): ReactElement {
  return (
    <p className="codex-trait-cross-nav">
      <a href={`/search?traits=${encodeURIComponent(trait)}`}>
        Find everything with this trait &rarr;
      </a>
    </p>
  );
}

/**
 * D29-112 (P11 S4) introduced a `standalone` prop that pulled the h1 inside
 * `EntityHeader` sr-only on the standalone `/{category}/{slug}` route (the
 * root header carried the visible title instead, `HeaderTitle.tsx`). A
 * later stakeholder redirect scoped header-carries-title back down to
 * parent/listing surfaces only, so `EntityHeader`'s h1 is unconditionally
 * visible again and this component no longer threads a `standalone` prop
 * at all — see `EntityHeader.tsx`'s own updated comment for the full
 * history.
 */
export function EntityPage({
  entity,
  ctx,
  assay,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
  /** D30-39/40 — optional, defaults to `undefined`: every EXISTING caller
   * (the 7 flagship goldens' bare construction in `goldens.test.tsx`,
   * `scripts/regen-goldens.ts`, this file's own `entityPage.test.tsx`
   * suite) passes no third field at all, so this stays `undefined` and
   * `AssayBlock` below renders nothing — the D30-40 "goldens/fixtures
   * byte-identical untouched" contract, satisfied by never threading the
   * prop rather than by asserting every call site stayed in sync. */
  assay?: AssayEntry;
}): ReactElement {
  const group = categoryGroupOf(entity.category);

  // P14 S2 (D29-135) — the Lore card's own duplicate-section suppression:
  // `loreBody` restates near-total chunks of `body` (76/77 real loreBody
  // docs measured >50% doc-level overlap); this keeps only the genuinely
  // unique delta (a shisk-shaped "Heritages" section, "You Might..."/
  // "Others Probably..." stays visible in the BODY copy only — never
  // asserted present here). No `grantedBaseSlugs`/`extraReferenceText` on
  // this generic page (that's ClassPage's own extension, below) — a plain
  // body-vs-loreBody shingle test.
  const loreResult =
    entity.loreBody !== undefined ? suppressLoreSections(entity.loreBody, entity.body) : undefined;
  if (loreResult) reportLoreSuppression(entity.id, loreResult);

  return (
    <article
      className="codex-entity-page popover-hint"
      data-entity-id={entity.id}
      data-category={entity.category}
    >
      <EntityHeader entity={entity} ctx={ctx} />

      {/* D29-72 (P7): when an AoN body is present, the AoN prose is the
          statblock of record — the structured statblock cards AND the
          embedded-item sections are suppressed (dedup, keep-the-AoN-side;
          stakeholder R1+R2). The predicate is BODY-PRESENCE, deliberately
          NOT `aonUrl` (a no-markdown join can set `aonUrl` with a
          Foundry-fallback body — join.ts's mergeJoined; body-presence is
          the honest signal) and deliberately NOT a category list (the
          uniform rule R2 chose: a future category gaining both struct+body
          flips behavior by design, spec §5). Foundry-only entities
          (`body: []`) keep the full structured render. Bonus fix riding the
          same gate: AoN-only prose creatures used to render an EMPTY
          `codex-statblock` shell (CreatureStatblock has no null guard) —
          suppressed now too. `MastheadExtraFallback` is NOT suppressed: it
          renders masthead pairs STRIPPED FROM the body by D29-62's ingest
          mechanism (545 hazard "Complexity" lines live only there) — it is
          complementary, never duplicative, and self-nulls when absent. */}
      {entity.body.length === 0 ? (
        <>
          {group === "creature" ? <CreatureStatblock entity={entity} /> : null}
          {group === "hazard" ? <HazardStatblock entity={entity} ctx={ctx} /> : null}
        </>
      ) : null}
      {group === "creature" || group === "hazard" ? (
        <MastheadExtraFallback entity={entity} ctx={ctx} />
      ) : null}
      {group === "spell" ? <SpellFacetHeader entity={entity} ctx={ctx} /> : null}
      {group === "equipment" ? <EquipmentFacetHeader entity={entity} ctx={ctx} /> : null}
      {group === "feat" ? <FeatFacetHeader entity={entity} ctx={ctx} /> : null}
      {group === "generic" ? <GenericFacetLine entity={entity} ctx={ctx} /> : null}
      {/* D29-109c (P11 S5, #16) — trait pages only; the lowest-risk
          dead-end fix (per-category links are OUT, future memo). Links to
          `/search?traits=<slug>`, which the S1 null-query fix
          (`SearchPage.tsx`'s D29-101c) makes a genuinely non-empty
          filter-only result set. `entity.slug` (not `entity.id`) is the
          bare trait TOKEN every OTHER entity's own `traits`/`filters.
          traits` array carries (`build-search.ts`'s `foldTrait` is a
          lowercase fold of that same token — trait entity slugs are
          already lowercase, D29-1 identity). */}
      {entity.category === "trait" ? <TraitCrossNav trait={entity.slug} /> : null}

      {entity.body.length === 0 && entity.embeddedItems !== undefined ? (
        <EmbeddedItemSections items={entity.embeddedItems} ctx={ctx} />
      ) : null}

      <div className="codex-content codex-body">{renderNodes(entity.body, ctx)}</div>

      {/* D29-135 — the whole card (heading included) is omitted when
          suppression eats every section, not just left empty. */}
      {loreResult !== undefined && loreResult.nodes.length > 0 ? (
        <section className="codex-card codex-card-prose codex-lore">
          <h2 id={ctx.headingId?.("Lore")}>Lore</h2>
          <div className="codex-content">{renderNodes(loreResult.nodes, ctx)}</div>
        </section>
      ) : null}

      {/* D30-40 — the assay round-4 experimental verdict card, spell-only,
          rides an OPTIONAL `assay` prop: absent (every existing caller,
          see this component's own prop doc comment above) renders nothing,
          which is exactly what keeps every pre-existing golden/fixture
          byte-identical without touching them. */}
      <AssayBlock entity={entity} assay={assay} ctx={ctx} />
    </article>
  );
}
