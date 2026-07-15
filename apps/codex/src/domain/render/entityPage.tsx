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
import { capitalize, humanizeSlug } from "./text";
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

/** D29-50 (S5) — the style doc §3.5 "type/level tag": the entity's category
 * label (humanized) plus its level when present ("Feat 13", "Creature 17",
 * "Deity" with no number) — the right-hand side of the statblock header row
 * grammar, opposite the name. Every category carries `category`; `level` is
 * optional (D29-3), so the tag degrades to the bare category label rather
 * than omitting the whole row. */
function entityTypeTag(entity: CodexEntity): string {
  const label = humanizeSlug(entity.category);
  return entity.level !== undefined ? `${label} ${entity.level}` : label;
}

export function EntityPage({ entity, ctx }: { entity: CodexEntity; ctx: RenderCtx }): ReactElement {
  const group = categoryGroupOf(entity.category);
  return (
    <article
      className="codex-entity-page popover-hint"
      data-entity-id={entity.id}
      data-category={entity.category}
    >
      <header className="codex-entity-header">
        {/* D29-50 style doc §3.5 — "name (left) + type/level tag (right)...
            full-width thin hairline rule beneath the whole row (not just
            under the name)": the title row carries its own hairline
            (`.codex-entity-title-row`, globals.css), with the trait pill
            row immediately below it per the same section. */}
        <div className="codex-entity-title-row">
          <h1 className="codex-entity-name">{entity.name}</h1>
          <span className="codex-entity-type-tag">{entityTypeTag(entity)}</span>
        </div>
        <div className="codex-entity-meta-row">
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
        </div>
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
        <section className="codex-card codex-card-prose codex-lore">
          <h2>Lore</h2>
          <div className="codex-content">{renderNodes(entity.loreBody, ctx)}</div>
        </section>
      ) : null}
    </article>
  );
}
