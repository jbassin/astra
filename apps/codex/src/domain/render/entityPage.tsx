import type { ReactElement } from "react";

import type { CodexEntity } from "../../schema/entity";
import { categoryGroupOf } from "./categoryGroup";
import { Citation } from "./citation";
import { EditionBanner, EditionPill } from "./editionBanner";
import {
  EquipmentFacetHeader,
  FeatFacetHeader,
  GenericFacetLine,
  SpellFacetHeader,
} from "./facetHeader";
import { type RenderCtx, renderNodes } from "./nodes";
import { CreatureStatblock, EmbeddedItemSections, HazardStatblock } from "./statblock";
import { capitalize } from "./text";
import { CodexTraitPills } from "./traits";

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

/** AoN's public site root — `aonUrl` values are site-relative paths
 * (`/Spells.aspx?ID=148`, entity.ts's own comment), never absolute. */
const AON_SITE_ROOT = "https://2e.aonprd.com";

export function EntityPage({ entity, ctx }: { entity: CodexEntity; ctx: RenderCtx }): ReactElement {
  const group = categoryGroupOf(entity.category);
  return (
    <article
      className="codex-entity-page popover-hint"
      data-entity-id={entity.id}
      data-category={entity.category}
    >
      <header className="codex-entity-header">
        <h1 className="codex-entity-name">
          {entity.name}
          {entity.level !== undefined ? (
            <span className="codex-entity-level"> Level {entity.level}</span>
          ) : null}
        </h1>
        <CodexTraitPills traits={entity.traits} knownTraitIds={ctx.knownTraitIds} />
        <EditionPill entity={entity} />
        {entity.rarity !== undefined ? (
          <span className="codex-rarity">{capitalize(entity.rarity)}</span>
        ) : null}
        <Citation source={entity.source} />
        {entity.aonUrl !== undefined ? (
          <a className="codex-aon-link" href={`${AON_SITE_ROOT}${entity.aonUrl}`}>
            View on Archives of Nethys
          </a>
        ) : null}
        <EditionBanner entity={entity} />
      </header>

      {group === "creature" ? <CreatureStatblock entity={entity} /> : null}
      {group === "hazard" ? <HazardStatblock entity={entity} ctx={ctx} /> : null}
      {group === "spell" ? <SpellFacetHeader entity={entity} /> : null}
      {group === "equipment" ? <EquipmentFacetHeader entity={entity} /> : null}
      {group === "feat" ? <FeatFacetHeader entity={entity} /> : null}
      {group === "generic" ? <GenericFacetLine entity={entity} /> : null}

      {entity.embeddedItems !== undefined ? (
        <EmbeddedItemSections items={entity.embeddedItems} ctx={ctx} />
      ) : null}

      <div className="codex-content codex-body">{renderNodes(entity.body, ctx)}</div>

      {entity.loreBody !== undefined ? (
        <section className="gothic-card gothic-card-prose codex-lore">
          <h2>Lore</h2>
          <div className="codex-content">{renderNodes(entity.loreBody, ctx)}</div>
        </section>
      ) : null}
    </article>
  );
}
