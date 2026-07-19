import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import { EditionBanner, EditionPill } from "./editionBanner";
import { rootRenderCtx } from "./nodes";

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

/** D29-109a (P11 S5, #14) — a ctx whose `resolveEmbed` resolves ONLY the
 * ids explicitly given here, everything else fail-softs to the raw id
 * (the belt-and-braces path — post-D29-98 stripping keeps genuine cases
 * near-zero, but the render layer must never assume that). */
function ctxWithTargets(targets: Record<string, CodexEntity>) {
  return rootRenderCtx({ resolveEmbed: (id) => targets[id], knownTraitIds: new Set() });
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
    const out = renderToStaticMarkup(<EditionBanner entity={entity} ctx={ctxWithTargets({})} />);
    expect(out).toContain("legacy version");
    expect(out).toContain('href="/spell/heal"');
  });

  it("a remaster member with legacyOf shows a compact 'legacy version' link", () => {
    const entity = baseEntity({
      id: "spell/heal",
      edition: "remaster",
      legacyOf: ["spell/heal@legacy"],
    });
    const out = renderToStaticMarkup(<EditionBanner entity={entity} ctx={ctxWithTargets({})} />);
    expect(out).toContain('href="/spell/heal@legacy"');
    expect(out).toContain("legacy version");
  });

  it("neither field present -> no banner", () => {
    const out = renderToStaticMarkup(
      <EditionBanner entity={baseEntity()} ctx={ctxWithTargets({})} />,
    );
    expect(out).toBe("");
  });

  it("a multi-member remasteredAs pair renders every link", () => {
    const entity = baseEntity({ remasteredAs: ["spell/a", "spell/b"] });
    const out = renderToStaticMarkup(<EditionBanner entity={entity} ctx={ctxWithTargets({})} />);
    expect(out).toContain('href="/spell/a"');
    expect(out).toContain('href="/spell/b"');
  });
});

describe("EditionBanner: D29-109a pointer-box names — 'Name (Book)' via resolveEmbed", () => {
  it("a resolved remasteredAs target renders 'Name (Book)', not the bare id", () => {
    const target = baseEntity({
      id: "spell/heal",
      edition: "remaster",
      source: { book: "Player Core", license: "ORC" },
    });
    const entity = baseEntity({ remasteredAs: ["spell/heal"] });
    const out = renderToStaticMarkup(
      <EditionBanner entity={entity} ctx={ctxWithTargets({ "spell/heal": target })} />,
    );
    expect(out).toContain("Heal (Player Core)");
    expect(out).not.toContain(">spell/heal<");
  });

  it("a resolved legacyOf target renders 'Name (Book)' too", () => {
    const target = baseEntity({ id: "spell/heal@legacy", edition: "legacy" });
    const entity = baseEntity({
      id: "spell/heal",
      edition: "remaster",
      legacyOf: ["spell/heal@legacy"],
    });
    const out = renderToStaticMarkup(
      <EditionBanner entity={entity} ctx={ctxWithTargets({ "spell/heal@legacy": target })} />,
    );
    expect(out).toContain("Heal (Core Rulebook)");
  });

  it("an UNRESOLVABLE pointer (belt-and-braces, post-D29-98 stripping keeps this near-zero) fail-softs to the bare id", () => {
    const entity = baseEntity({ remasteredAs: ["class/investigator"] });
    const out = renderToStaticMarkup(<EditionBanner entity={entity} ctx={ctxWithTargets({})} />);
    expect(out).toContain(">class/investigator<");
    expect(out).toContain('href="/class/investigator"');
  });

  it("multiple targets each resolve independently — one resolved, one not", () => {
    const target = baseEntity({ id: "spell/a", name: "Alpha" });
    const entity = baseEntity({ remasteredAs: ["spell/a", "spell/b"] });
    const out = renderToStaticMarkup(
      <EditionBanner entity={entity} ctx={ctxWithTargets({ "spell/a": target })} />,
    );
    expect(out).toContain("Alpha (Core Rulebook)");
    expect(out).toContain(">spell/b<");
  });
});
