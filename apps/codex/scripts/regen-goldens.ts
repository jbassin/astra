/**
 * D29-29 tier 2 — regenerates the 7 committed flagship golden HTML files
 * (`apps/codex/goldens/*.html`) from the current renderer + the committed
 * fixture. Deterministic (no timestamps/randomness) so a re-run with no
 * source change produces byte-identical output — `goldens.test.tsx` asserts
 * exactly that on every `pnpm test`.
 *
 * No JSX here (deliberately `.ts`, not `.tsx`, matching the spec's own
 * naming) — `createElement` calls instead.
 *
 * Run via:
 *   pnpm --filter @astra/codex exec node \
 *     --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/regen-goldens.ts
 *
 * Hand-check the 7 files after any intentional renderer change (D29-29's
 * "vs hand-checked output" gate) before committing the regenerated goldens.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EntityPage } from "../src/domain/render/entityPage";
import { loadFixtureRenderEnv, requireEntity } from "../src/domain/render/fixtureLoader";
import { createHeadingIdAssigner } from "../src/domain/render/headingIds";
import type { RenderCtx } from "../src/domain/render/nodes";
import type { CodexEntity } from "../src/schema/entity";

const GOLDENS_ROOT = join(import.meta.dirname, "..", "goldens");

/**
 * D29-109b (P11 S5, #15) — a FRESH `headingId` assigner per call: `ctx` here
 * is `loadFixtureRenderEnv()`'s ONE shared embed-resolver/trait-index
 * object, reused across all 7 goldens below (cheap, stateless data) — but
 * heading-id collision tracking is PER-PAGE state, so baking it into that
 * shared `ctx` would leak collisions across unrelated fixture entities
 * (e.g. two different goldens both happening to have a "Description"
 * heading would wrongly see the second one suffixed `-2`). Spreading a new
 * assigner in on every call keeps each golden's id space independent,
 * matching production (one `EntityRenderPane` render = one page = one
 * assigner, `EntityRenderPane.tsx`'s own comment).
 */
function renderEntityPage(entity: CodexEntity, ctx: RenderCtx): string {
  const pageCtx: RenderCtx = { ...ctx, headingId: createHeadingIdAssigner() };
  return renderToStaticMarkup(createElement(EntityPage, { entity, ctx: pageCtx }));
}

function page(title: string, bodyHtml: string): string {
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<title>${title}</title></head><body>\n${bodyHtml}\n</body></html>\n`
  );
}

function main(): void {
  const { byId, ctx } = loadFixtureRenderEnv();
  mkdirSync(GOLDENS_ROOT, { recursive: true });

  const goldens: ReadonlyArray<{ file: string; title: string; html: string }> = [
    {
      file: "creature-dragon.html",
      title: "creature/adamantine-dragon-adult — golden",
      html: renderEntityPage(requireEntity(byId, "creature/adamantine-dragon-adult"), ctx),
    },
    {
      // P7 (D29-72/-73/-74, review M4): the joined dragon above LOST its
      // structured-render markup to the D29-72 suppression — this
      // Foundry-only fixture (variantOf + lore-bearing + a range.increment
      // Rock strike) is the golden that keeps the structured render
      // byte-locked: retention (empty body), StrikeRow range, lore-in-Skills
      // humanized, and the §5 variantOf risk, all in one file.
      file: "creature-dragon-spellcaster.html",
      title:
        "creature/adamantine-dragon-adult-spellcaster — golden (P7 structured-render retention)",
      html: renderEntityPage(
        requireEntity(byId, "creature/adamantine-dragon-adult-spellcaster"),
        ctx,
      ),
    },
    {
      file: "spell-heal.html",
      title: "spell/heal + spell/heal@legacy — golden",
      html: [
        '<section data-golden-member="spell/heal">',
        renderEntityPage(requireEntity(byId, "spell/heal"), ctx),
        "</section>",
        '<section data-golden-member="spell/heal@legacy">',
        renderEntityPage(requireEntity(byId, "spell/heal@legacy"), ctx),
        "</section>",
      ].join("\n"),
    },
    {
      file: "weapon-chakri.html",
      title: "weapon/chakri-lost-omens — golden",
      html: renderEntityPage(requireEntity(byId, "weapon/chakri-lost-omens"), ctx),
    },
    {
      file: "feat-camouflage-coat.html",
      title: "feat/camouflage-coat — golden",
      html: renderEntityPage(requireEntity(byId, "feat/camouflage-coat"), ctx),
    },
    {
      file: "rules-nature-crafting.html",
      title: "rules/nature-crafting-3 — golden",
      html: renderEntityPage(requireEntity(byId, "rules/nature-crafting-3"), ctx),
    },
    {
      file: "class-investigator.html",
      title: "class/investigator@legacy — golden (D29-25 embed-inlining proof)",
      html: renderEntityPage(requireEntity(byId, "class/investigator@legacy"), ctx),
    },
  ];

  for (const g of goldens) {
    writeFileSync(join(GOLDENS_ROOT, g.file), page(g.title, g.html));
    console.log(`wrote goldens/${g.file}`);
  }
}

main();
