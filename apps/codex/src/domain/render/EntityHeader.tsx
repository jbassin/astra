import type { ReactElement } from "react";

import type { CodexEntity } from "../../schema/entity";
import { SIZE_LABELS } from "../browse/facetDefs";
import { Citation } from "./citation";
import { displayCategoryName } from "./displayCategoryName";
import { EditionBanner, EditionPill } from "./editionBanner";
import type { RenderCtx } from "./nodes";
import { capitalize } from "./text";
import { CodexTraitPills } from "./traits";

/**
 * P12 S3 (D29-119 step 0, review blocker) — extracted VERBATIM out of
 * `EntityPage` (`entityPage.tsx:106-141` before this slice): the title row
 * (name + type/level tag), the meta row (trait pills/edition pill/size
 * chip/rarity/citation/AoN link), and the edition banner. `EntityPage`
 * consumes this unchanged (byte-identical goldens are the verification, per
 * `regen-goldens.ts`); `ClassPage` (this same slice) is the SECOND consumer
 * — the whole reason this extraction exists: the popover contract
 * (`Popover.tsx`'s `.popover-hint` clone) depends on every standalone-style
 * page carrying this exact header shape, and 1,066 `class-feature/*` docs
 * crossref `class/*` pages. Forking this markup a second time (rather than
 * sharing it) would have silently drifted the two headers apart the moment
 * either page type's header needed a tweak.
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

/**
 * D29-112 (P11 S4) introduced a `standalone` prop that pulled this h1
 * sr-only on the standalone `/{category}/{slug}` and `/class/{slug}` routes
 * (the root header carried the visible title instead, `HeaderTitle.tsx`).
 * A later stakeholder redirect scoped header-carries-title back down to
 * parent/listing surfaces only ("when going to a SPECIFIC page, the title
 * shouldn't replace the codex header") — `deriveHeaderTitle` no longer
 * resolves a title for either route, so this h1 is unconditionally VISIBLE
 * again, same as every other caller (the regen-goldens script, `entityPage.
 * test.tsx`, the split-view entry pane via `EntityRenderPane`) always
 * rendered it. The `standalone` prop and its `codex-entity-name-standalone`
 * sr-only CSS + the popover's `.popover-inner .codex-entity-name-standalone`
 * re-show override (the old B1 interlock) are removed outright, not just
 * bypassed — the popover (`Popover.tsx`) clones the live page's SSR HTML
 * wholesale, so its cloned h1 is visible by construction now too, with no
 * override needed.
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
