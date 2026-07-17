import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import { EditionBanner, EditionPill } from "./editionBanner";

function baseEntity(overrides: Partial<CodexEntity> = {}): CodexEntity {
  return {
    id: "spell/heal@legacy",
    slug: "heal",
    category: "spell",
    name: "Heal",
    edition: "legacy",
    source: { book: "Core Rulebook", license: "OGL" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

describe("EditionPill (D29-22/-26): every page shows one", () => {
  it("remaster", () => {
    const out = renderToStaticMarkup(<EditionPill entity={baseEntity({ edition: "remaster" })} />);
    expect(out).toContain('aria-label="Remaster"');
    expect(out).toContain("codex-edition-icon");
  });
  it("legacy", () => {
    const out = renderToStaticMarkup(<EditionPill entity={baseEntity({ edition: "legacy" })} />);
    expect(out).toContain('aria-label="Legacy"');
    expect(out).toContain("codex-edition-icon");
  });
});

describe("EditionBanner: paired-page cross-links", () => {
  it("a legacy member with remasteredAs shows a banner linking the remaster member(s)", () => {
    const entity = baseEntity({ remasteredAs: ["spell/heal"] });
    const out = renderToStaticMarkup(<EditionBanner entity={entity} />);
    expect(out).toContain("legacy version");
    expect(out).toContain('href="/spell/heal"');
  });

  it("a remaster member with legacyOf shows a compact 'legacy version' link", () => {
    const entity = baseEntity({
      id: "spell/heal",
      edition: "remaster",
      legacyOf: ["spell/heal@legacy"],
    });
    const out = renderToStaticMarkup(<EditionBanner entity={entity} />);
    expect(out).toContain('href="/spell/heal@legacy"');
    expect(out).toContain("legacy version");
  });

  it("neither field present -> no banner", () => {
    const out = renderToStaticMarkup(<EditionBanner entity={baseEntity()} />);
    expect(out).toBe("");
  });

  it("a multi-member remasteredAs pair renders every link", () => {
    const entity = baseEntity({ remasteredAs: ["spell/a", "spell/b"] });
    const out = renderToStaticMarkup(<EditionBanner entity={entity} />);
    expect(out).toContain('href="/spell/a"');
    expect(out).toContain('href="/spell/b"');
  });
});
