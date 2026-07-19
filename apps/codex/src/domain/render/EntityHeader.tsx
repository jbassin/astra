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
 * D29-112 (P11 S4) — `standalone` (default `false`, so every existing
 * caller — the regen-goldens script's bare `EntityPage`, `entityPage.test.
 * tsx`, the split-view entry pane via `EntityRenderPane` — keeps rendering
 * the h1 fully VISIBLE, byte-identical, no prop threading required of
 * them): `true` ONLY for the standalone `/{category}/{slug}` route (via
 * `EntityRenderPane`) and the bespoke `/class/{slug}` route (via
 * `ClassPage`), where the root header now carries the VISIBLE title instead
 * (`HeaderTitle.tsx`) — the in-content h1 stays in the SSR DOM (document
 * outline + a11y tree intact) but renders sr-only, via the
 * `codex-entity-name-standalone` modifier class (`globals.css`). The
 * popover (`Popover.tsx`) clones this exact STANDALONE page's SSR HTML
 * wholesale, so the cloned h1 carries this SAME modifier — `globals.css`'s
 * `.popover-inner .codex-entity-name-standalone` override re-shows it there
 * (the review's headline B1 catch: a bare, unscoped sr-only rule on this
 * class would have killed the popover's title site-wide).
 */
export function EntityHeader({
  entity,
  ctx,
  standalone = false,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
  standalone?: boolean;
}): ReactElement {
  return (
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
  );
}
