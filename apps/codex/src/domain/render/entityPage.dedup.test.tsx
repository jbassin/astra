import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import { EntityPage } from "./entityPage";
import { loadFixtureRenderEnv, requireEntity } from "./fixtureLoader";

/**
 * P7 (D29-72) — the statblock-dedup seam, both directions (spec §4 C):
 * body-present entities suppress the structured render (statblock cards +
 * embedded-item sections); Foundry-only (`body: []`) entities KEEP it; and
 * `MastheadExtraFallback` is never suppressed. The synthetic clone cases pin
 * the PREDICATE itself — body-presence, not a category list and not
 * `aonUrl` (spec §5: "the suppression test must pin the *predicate*").
 */

const STATBLOCK = "codex-statblock";
const EMBEDDED = "codex-embedded-items";

describe("D29-72: suppression when an AoN body is present", () => {
  const { byId, ctx } = loadFixtureRenderEnv();

  function render(entity: CodexEntity): string {
    return renderToStaticMarkup(<EntityPage entity={entity} ctx={ctx} />);
  }

  it("a joined creature (adamantine-dragon-adult, body-bearing) renders NO structured statblock and NO embedded-item sections — the AoN body is the statblock of record", () => {
    const dragon = requireEntity(byId, "creature/adamantine-dragon-adult");
    expect(dragon.body.length).toBeGreaterThan(0); // the predicate's input, pinned
    expect(dragon.embeddedItems?.length ?? 0).toBeGreaterThan(0); // there IS something to suppress
    const html = render(dragon);
    expect(html).not.toContain(STATBLOCK);
    expect(html).not.toContain(EMBEDDED);
    expect(html).toContain("codex-body"); // the body itself renders
  });

  it("a joined hazard (gravehall-trap) is suppressed the same way, but its MastheadExtraFallback Complexity line STILL renders (D29-62 pairs live only there)", () => {
    const trap = requireEntity(byId, "hazard/gravehall-trap");
    expect(trap.body.length).toBeGreaterThan(0);
    expect(trap.mastheadExtra?.[0]?.label).toBe("Complexity"); // fixture pin
    const html = render(trap);
    expect(html).not.toContain(STATBLOCK);
    expect(html).not.toContain(EMBEDDED);
    expect(html).toContain("Complexity"); // MastheadExtraFallback, NOT suppressed
  });

  it("a joined vehicle (armored-sleigh, body + embeddedItems) renders NO embedded-item sections — the seam covers every category, not just creature/hazard", () => {
    const sleigh = requireEntity(byId, "vehicle/armored-sleigh");
    expect(sleigh.body.length).toBeGreaterThan(0);
    expect(sleigh.embeddedItems?.length ?? 0).toBeGreaterThan(0);
    const html = render(sleigh);
    expect(html).not.toContain(EMBEDDED);
    expect(html).toContain("codex-body");
  });

  it("a Foundry-only creature (dune-candle, body: []) KEEPS the full structured render", () => {
    const candle = requireEntity(byId, "creature/dune-candle");
    expect(candle.body.length).toBe(0);
    const html = render(candle);
    expect(html).toContain(STATBLOCK);
    expect(html).toContain(EMBEDDED);
  });

  it("a Foundry-only variantOf creature (the dragon spellcaster) KEEPS the structured render — the §5 variantOf risk (empty body + full struct)", () => {
    const spellcaster = requireEntity(byId, "creature/adamantine-dragon-adult-spellcaster");
    expect(spellcaster.body.length).toBe(0);
    expect(spellcaster.variantOf).toBe("creature/adamantine-dragon-adult");
    const html = render(spellcaster);
    expect(html).toContain(STATBLOCK);
    expect(html).toContain(EMBEDDED);
  });

  it("PREDICATE PIN (synthetic): the same joined dragon with its body emptied gets the structured render BACK — body-presence decides, nothing else", () => {
    const dragon = requireEntity(byId, "creature/adamantine-dragon-adult");
    // aonUrl intact: proves the predicate is NOT aonUrl-presence (a
    // no-markdown join can set aonUrl with a Foundry-fallback body, D29-72).
    const emptied: CodexEntity = { ...dragon, body: [] };
    expect(emptied.aonUrl).toBeDefined();
    const html = render(emptied);
    expect(html).toContain(STATBLOCK);
    expect(html).toContain(EMBEDDED);
  });

  it("PREDICATE PIN (synthetic, other direction): the Foundry-only spellcaster with a body grafted on gets suppressed", () => {
    const spellcaster = requireEntity(byId, "creature/adamantine-dragon-adult-spellcaster");
    const dragon = requireEntity(byId, "creature/adamantine-dragon-adult");
    const grafted: CodexEntity = { ...spellcaster, body: dragon.body };
    const html = render(grafted);
    expect(html).not.toContain(STATBLOCK);
    expect(html).not.toContain(EMBEDDED);
  });

  it("BONUS FIX (D29-72 review find): an AoN-only prose creature no longer renders an empty codex-statblock shell", () => {
    // Synthetic AoN-only shape: body present, no stats, no embeddedItems —
    // the old unconditional <CreatureStatblock/> rendered an empty
    // `codex-statblock` section for these (statblock.tsx has no null guard);
    // the body-presence gate removes it.
    const dragon = requireEntity(byId, "creature/adamantine-dragon-adult");
    const proseOnly: CodexEntity = {
      ...dragon,
      stats: undefined,
      embeddedItems: undefined,
      proseOnly: true,
    };
    const html = render(proseOnly);
    expect(html).not.toContain(STATBLOCK);
    expect(html).toContain("codex-body");
  });
});
