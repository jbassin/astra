import type { CodexEntity } from "@astra/codex-corpus";
import type { ReactElement } from "react";

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
 * The assembled entity page: the universal header (name + level,
 * traits, edition pill, rarity, citation, aonUrl link, edition banner), the
 * category-group's own facet/statblock header, embedded-item sections (any
 * Actor-derived entity, not just creature/hazard), then body/loreBody.
 *
 * This is the render layer's own composition root — the routes wire it to a
 * loader; nothing here touches the filesystem or a server.
 */

/** Keeps trait pages from being a dead end: "Find everything with this
 * trait" links to the filter-only `/search?traits=<trait>` view (a real,
 * non-empty result set, because search runs filter-only queries with no
 * search term). */
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
 * `EntityHeader`'s h1 is always visible, on every route; see
 * `EntityHeader.tsx`'s own comment.
 */
export function EntityPage({ entity, ctx }: { entity: CodexEntity; ctx: RenderCtx }): ReactElement {
  const group = categoryGroupOf(entity.category);

  // The Lore card's own duplicate-section suppression:
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

      {/* When an AoN body is present, the AoN prose is the statblock of
          record — the structured statblock cards AND the embedded-item
          sections are suppressed (dedup, keep the AoN side, by stakeholder
          decision). The predicate is BODY-PRESENCE, deliberately NOT
          `aonUrl` (a no-markdown join can set `aonUrl` with a
          Foundry-fallback body — join.ts's mergeJoined; body-presence is
          the honest signal) and deliberately NOT a category list (a uniform
          rule: a future category gaining both struct+body flips behavior by
          design). Foundry-only entities (`body: []`) keep the full
          structured render. The same gate keeps AoN-only prose creatures
          from rendering an EMPTY `codex-statblock` shell (CreatureStatblock
          has no null guard). `MastheadExtraFallback` is NOT suppressed: it
          renders masthead pairs that ingest STRIPS FROM the body (545 hazard
          "Complexity" lines live only there) — it is complementary, never
          duplicative, and self-nulls when absent. */}
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
      {/* Trait pages only (no per-category links). Links to
          `/search?traits=<slug>`, which `SearchPage.tsx` serves as a
          genuinely non-empty filter-only result set. `entity.slug` (not `entity.id`) is the
          bare trait TOKEN every OTHER entity's own `traits`/`filters.
          traits` array carries (`build-search.ts`'s `foldTrait` is a
          lowercase fold of that same token — trait entity slugs are
          already lowercase). */}
      {entity.category === "trait" ? <TraitCrossNav trait={entity.slug} /> : null}

      {entity.body.length === 0 && entity.embeddedItems !== undefined ? (
        <EmbeddedItemSections items={entity.embeddedItems} ctx={ctx} />
      ) : null}

      <div className="codex-content codex-body">{renderNodes(entity.body, ctx)}</div>

      {/* The whole Lore card (heading included) is omitted when
          suppression eats every section, not just left empty. */}
      {loreResult !== undefined && loreResult.nodes.length > 0 ? (
        <section className="codex-card codex-card-prose codex-lore">
          <h2 id={ctx.headingId?.("Lore")}>Lore</h2>
          <div className="codex-content">{renderNodes(loreResult.nodes, ctx)}</div>
        </section>
      ) : null}
    </article>
  );
}
