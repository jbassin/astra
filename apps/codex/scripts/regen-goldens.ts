/**
 * D29-29 tier 2 — regenerates the 6 committed flagship golden HTML files
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
 * Hand-check the 6 files after any intentional renderer change (D29-29's
 * "vs hand-checked output" gate) before committing the regenerated goldens.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EntityPage } from "../src/domain/render/entityPage";
import { loadFixtureRenderEnv, requireEntity } from "../src/domain/render/fixtureLoader";
import type { RenderCtx } from "../src/domain/render/nodes";
import type { CodexEntity } from "../src/schema/entity";

const GOLDENS_ROOT = join(import.meta.dirname, "..", "goldens");

function renderEntityPage(entity: CodexEntity, ctx: RenderCtx): string {
  return renderToStaticMarkup(createElement(EntityPage, { entity, ctx }));
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
