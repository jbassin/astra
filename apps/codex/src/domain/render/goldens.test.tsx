import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import { EntityPage } from "./entityPage";
import { loadFixtureRenderEnv, requireEntity } from "./fixtureLoader";
import type { RenderCtx } from "./nodes";

/**
 * D29-29 tier 2 — the 6 committed flagship goldens, byte-exact (mirrors
 * `scripts/regen-goldens.ts` construction exactly). A drift here means
 * either an unintentional renderer regression (fix the renderer) or an
 * intentional change (re-run `scripts/regen-goldens.ts`, hand-check the 6
 * files, commit them — the spec's "vs hand-checked output" gate).
 */

const GOLDENS_ROOT = join(import.meta.dirname, "../../../goldens");

function renderEntityPage(entity: CodexEntity, ctx: RenderCtx): string {
  return renderToStaticMarkup(createElement(EntityPage, { entity, ctx }));
}

function page(title: string, bodyHtml: string): string {
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<title>${title}</title></head><body>\n${bodyHtml}\n</body></html>\n`
  );
}

describe("D29-29 tier 2: the 6 flagship goldens are byte-exact", () => {
  const { byId, ctx } = loadFixtureRenderEnv();

  function expectGoldenMatches(file: string, title: string, html: string): void {
    it(file, () => {
      const committed = readFileSync(join(GOLDENS_ROOT, file), "utf8");
      expect(page(title, html)).toBe(committed);
    });
  }

  expectGoldenMatches(
    "creature-dragon.html",
    "creature/adamantine-dragon-adult — golden",
    renderEntityPage(requireEntity(byId, "creature/adamantine-dragon-adult"), ctx),
  );

  expectGoldenMatches(
    "spell-heal.html",
    "spell/heal + spell/heal@legacy — golden",
    [
      '<section data-golden-member="spell/heal">',
      renderEntityPage(requireEntity(byId, "spell/heal"), ctx),
      "</section>",
      '<section data-golden-member="spell/heal@legacy">',
      renderEntityPage(requireEntity(byId, "spell/heal@legacy"), ctx),
      "</section>",
    ].join("\n"),
  );

  expectGoldenMatches(
    "weapon-chakri.html",
    "weapon/chakri-lost-omens — golden",
    renderEntityPage(requireEntity(byId, "weapon/chakri-lost-omens"), ctx),
  );

  expectGoldenMatches(
    "feat-camouflage-coat.html",
    "feat/camouflage-coat — golden",
    renderEntityPage(requireEntity(byId, "feat/camouflage-coat"), ctx),
  );

  expectGoldenMatches(
    "rules-nature-crafting.html",
    "rules/nature-crafting-3 — golden",
    renderEntityPage(requireEntity(byId, "rules/nature-crafting-3"), ctx),
  );

  expectGoldenMatches(
    "class-investigator.html",
    "class/investigator@legacy — golden (D29-25 embed-inlining proof)",
    renderEntityPage(requireEntity(byId, "class/investigator@legacy"), ctx),
  );
});
