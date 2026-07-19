import type { ReactElement } from "react";

import type { CodexEntity } from "../../schema/entity";
import { SIZE_LABELS } from "../browse/facetDefs";
import { categoryGroupOf } from "./categoryGroup";
import { Citation } from "./citation";
import { displayCategoryName } from "./displayCategoryName";
import { EditionBanner, EditionPill } from "./editionBanner";
import {
  EquipmentFacetHeader,
  FeatFacetHeader,
  GenericFacetLine,
  MastheadExtraFallback,
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

/** D29-50 (S5) — the style doc §3.5 "type/level tag": the entity's category
 * label (humanized) plus its level when present ("Feat 13", "Creature 17",
 * "Deity" with no number) — the right-hand side of the statblock header row
 * grammar, opposite the name. Every category carries `category`; `level` is
 * optional (D29-3), so the tag degrades to the bare category label rather
 * than omitting the whole row. */
function entityTypeTag(entity: CodexEntity): string {
  // D29-109d (P11 S5, #19) — `displayCategoryName`, not the bare
  // `humanizeSlug` this used before: `entityTypeTag`'s label IS the
  // category name (the seam's own enumerated "entityPage type tag" site).
  const label = displayCategoryName(entity.category);
  return entity.level !== undefined ? `${label} ${entity.level}` : label;
}

/** P10 (D29-95) — the header size chip's category inclusion list. Deliberately
 * the literal `category` string (all 4 size-bearing categories are creature/
 * hazard/vehicle/ancestry per the R4 census), NOT `categoryGroupOf` (vehicle
 * has no page-shape group of its own — it falls into "generic"). Ancestry
 * and hazard are review-driven EXCLUSIONS (spec D29-95): ancestry size is a
 * player CHOICE (a bare chip would contradict the page's own body text) and
 * hazard's `facets.size` is 81% Foundry default-fill noise with no AoN
 * precedent for displaying it. */
const SIZE_CHIP_CATEGORIES: ReadonlySet<string> = new Set(["creature", "vehicle"]);

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
 * D29-112 (P11 S4) — `standalone` (default `false`, so every existing
 * caller — the regen-goldens script's bare `EntityPage`, `entityPage.test.
 * tsx`, the split-view entry pane via `EntityRenderPane` — keeps rendering
 * the h1 fully VISIBLE, byte-identical, no prop threading required of
 * them): `true` ONLY for the standalone `/{category}/{slug}` route (via
 * `EntityRenderPane`), where the root header now carries the VISIBLE title
 * instead (`HeaderTitle.tsx`) — the in-content h1 stays in the SSR DOM
 * (document outline + a11y tree intact) but renders sr-only, via the
 * `codex-entity-name-standalone` modifier class (`globals.css`). The
 * popover (`Popover.tsx`) clones this exact STANDALONE page's SSR HTML
 * wholesale, so the cloned h1 carries this SAME modifier — `globals.css`'s
 * `.popover-inner .codex-entity-name-standalone` override re-shows it there
 * (the review's headline B1 catch: a bare, unscoped sr-only rule on this
 * class would have killed the popover's title site-wide).
 */
export function EntityPage({
  entity,
  ctx,
  standalone = false,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
  standalone?: boolean;
}): ReactElement {
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
          <h1
            className={
              standalone ? "codex-entity-name codex-entity-name-standalone" : "codex-entity-name"
            }
          >
            {entity.name}
          </h1>
          <span className="codex-entity-type-tag">{entityTypeTag(entity)}</span>
        </div>
        <div className="codex-entity-meta-row">
          <CodexTraitPills traits={entity.traits} knownTraitIds={ctx.knownTraitIds} />
          <EditionPill entity={entity} />
          {entity.facets.size !== undefined && SIZE_CHIP_CATEGORIES.has(entity.category) ? (
            <span className="codex-entity-size">
              {SIZE_LABELS[entity.facets.size] ?? capitalize(entity.facets.size)}
            </span>
          ) : null}
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
        <EditionBanner entity={entity} ctx={ctx} />
      </header>

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

      {entity.loreBody !== undefined ? (
        <section className="codex-card codex-card-prose codex-lore">
          <h2 id={ctx.headingId?.("Lore")}>Lore</h2>
          <div className="codex-content">{renderNodes(entity.loreBody, ctx)}</div>
        </section>
      ) : null}
    </article>
  );
}
