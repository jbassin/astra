import { type CodexEntity, capitalize } from "@astra/codex-corpus";
import type { ReactElement } from "react";

import { SIZE_LABELS } from "../browse/facetDefs";
import { Citation } from "./citation";
import { displayCategoryName } from "./displayCategoryName";
import { EditionBanner, EditionPill } from "./editionBanner";
import type { RenderCtx } from "./nodes";
import { CodexTraitPills } from "./traits";

/**
 * The shared entity header: the title row (name + type/level tag), the meta
 * row (trait pills/edition pill/size chip/rarity/citation/AoN link), and the
 * edition banner. `EntityPage` and `ClassPage` both render it, and sharing
 * it is the point: the popover contract
 * (`Popover.tsx`'s `.popover-hint` clone) depends on every standalone-style
 * page carrying this exact header shape, and 1,066 `class-feature/*` docs
 * crossref `class/*` pages. Forking this markup a second time (rather than
 * sharing it) would silently drift the two headers apart the moment either
 * page type's header needed a tweak.
 */

/** AoN's public site root — `aonUrl` values are site-relative paths
 * (`/Spells.aspx?ID=148`, entity.ts's own comment), never absolute. */
const AON_SITE_ROOT = "https://2e.aonprd.com";

/** The style doc's "type/level tag": the entity's category label (humanized)
 * plus its level when present ("Feat 13", "Creature 17", "Deity" with no
 * number) — the right-hand side of the statblock header row grammar,
 * opposite the name. Every category carries `category`; `level` is
 * optional, so the tag degrades to the bare category label rather than
 * omitting the whole row. */
function entityTypeTag(entity: CodexEntity): string {
  // `displayCategoryName`, not the bare `humanizeSlug`: the tag's label IS
  // the category name.
  const label = displayCategoryName(entity.category);
  return entity.level !== undefined ? `${label} ${entity.level}` : label;
}

/** The header size chip's category inclusion list. Deliberately the literal
 * `category` string (the 4 size-bearing categories are creature/hazard/
 * vehicle/ancestry), NOT `categoryGroupOf` (vehicle has no page-shape group
 * of its own — it falls into "generic"). Ancestry and hazard are deliberate
 * EXCLUSIONS: ancestry size is a
 * player CHOICE (a bare chip would contradict the page's own body text) and
 * hazard's `facets.size` is 81% Foundry default-fill noise with no AoN
 * precedent for displaying it. */
const SIZE_CHIP_CATEGORIES: ReadonlySet<string> = new Set(["creature", "vehicle"]);

/**
 * The h1 is always VISIBLE, for every caller: the standalone
 * `/{category}/{slug}` and `/class/{slug}` routes, the regen-goldens script,
 * `entityPage.test.tsx`, and the split-view entry pane via
 * `EntityRenderPane`. The root header (`HeaderTitle.tsx`) carries the title
 * only on parent/listing surfaces ("when going to a SPECIFIC page, the title
 * shouldn't replace the codex header"), so `deriveHeaderTitle` resolves no
 * title for these routes. The popover (`Popover.tsx`) clones the live page's
 * SSR HTML wholesale, so its cloned h1 is visible by construction too, with
 * no override needed.
 */
export function EntityHeader({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement {
  return (
    <header className="codex-entity-header">
      {/* The style doc: "name (left) + type/level tag (right)...
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
  );
}
