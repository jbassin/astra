import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  UuidIndex,
  assertRegistryIsTotal,
  buildDocIndex,
  buildPackRegistry,
  createResolveUuid,
  parseUuid,
} from "./uuidResolve";

describe("parseUuid: the four real reference shapes (D29-6)", () => {
  it("parses a relative .docId", () => {
    expect(parseUuid(".ZrEmfrgDlmlhdvQg")).toEqual({
      shape: "relative",
      docId: "ZrEmfrgDlmlhdvQg",
    });
  });

  it("parses Compendium.pf2e.PACK.Type.name (the overwhelming majority shape)", () => {
    expect(parseUuid("Compendium.pf2e.conditionitems.Item.Stupefied")).toEqual({
      shape: "doc",
      pack: "conditionitems",
      idOrName: "Stupefied",
    });
  });

  it("parses Compendium.pf2e.PACK.Type.id (16-char Foundry id)", () => {
    expect(parseUuid("Compendium.pf2e.spells-srd.Item.abc123XYZ4567890")).toEqual({
      shape: "doc",
      pack: "spells-srd",
      idOrName: "abc123XYZ4567890",
    });
  });

  it("keeps a dot-containing name intact (ellipsis name, real corpus finding)", () => {
    expect(parseUuid("Compendium.pf2e.feats-srd.Item.A Little Bird Told Me...")).toEqual({
      shape: "doc",
      pack: "feats-srd",
      idOrName: "A Little Bird Told Me...",
    });
  });

  it("parses the no-type-segment name-only form", () => {
    expect(parseUuid("Compendium.pf2e.actionspf2e.Sense Motive")).toEqual({
      shape: "doc",
      pack: "actionspf2e",
      idOrName: "Sense Motive",
    });
  });

  it("parses a JournalEntry.<id>.JournalEntryPage.<id> reference", () => {
    expect(
      parseUuid(
        "Compendium.pf2e.journals.JournalEntry.45SK8rdbbxvEHfMn.JournalEntryPage.9dpHTBpL3j8ZpqTS",
      ),
    ).toEqual({
      shape: "journalPage",
      pack: "journals",
      entryId: "45SK8rdbbxvEHfMn",
      pageId: "9dpHTBpL3j8ZpqTS",
    });
  });

  it("strips a trailing #anchor fragment from a journal page id (87 real uses)", () => {
    expect(
      parseUuid(
        "Compendium.pf2e.journals.JournalEntry.vx5FGEG34AxI2dow.JournalEntryPage.DOc3Pf8wmVxanTIv#basic-spellcasting-feat",
      ),
    ).toEqual({
      shape: "journalPage",
      pack: "journals",
      entryId: "vx5FGEG34AxI2dow",
      pageId: "DOc3Pf8wmVxanTIv",
    });
  });

  it("parses a Macro/RollTable target the same way as any other doc shape", () => {
    expect(parseUuid("Compendium.pf2e.action-macros.Macro.Impersonate: Deception")).toEqual({
      shape: "doc",
      pack: "action-macros",
      idOrName: "Impersonate: Deception",
    });
    expect(parseUuid("Compendium.pf2e.rollable-tables.RollTable.Warpwaves")).toEqual({
      shape: "doc",
      pack: "rollable-tables",
      idOrName: "Warpwaves",
    });
  });
});

describe("buildPackRegistry", () => {
  it("rewrites release-layout paths to plain dir names", () => {
    const manifest = {
      packs: [
        { name: "actionspf2e", path: "packs/actions", type: "Item" },
        { name: "pathfinder-bestiary", path: "packs/pathfinder-bestiary", type: "Actor" },
      ],
    };
    expect(buildPackRegistry(manifest)).toEqual([
      { name: "actionspf2e", dir: "actions", docClass: "Item" },
      { name: "pathfinder-bestiary", dir: "pathfinder-bestiary", docClass: "Actor" },
    ]);
  });
});

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function makePacksRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "codex-uuid-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, JSON.stringify(content));
  }
  return root;
}

describe("buildDocIndex + createResolveUuid: crossref/excluded/broken", () => {
  const registry = [
    { name: "spells-srd", dir: "spells", docClass: "Item" as const },
    { name: "pathfinder-bestiary", dir: "pathfinder-bestiary", docClass: "Actor" as const },
    { name: "pf2e-macros", dir: "macros", docClass: "Macro" as const },
    { name: "rollable-tables", dir: "rollable-tables", docClass: "RollTable" as const },
  ];

  function root(): string {
    return makePacksRoot({
      "spells/fireball.json": { _id: "sxQZ6yqTn0czJxVd", name: "Fireball", type: "spell" },
      "pathfinder-bestiary/balor.json": { _id: "abcABC0123456789", name: "Balor", type: "npc" },
      "macros/some-macro.json": { _id: "MACRO0000000001", name: "Impersonate: Deception" },
      "rollable-tables/warpwaves.json": { _id: "TABLE000000001", name: "Warpwaves" },
    });
  }

  it("resolves a name-based crossref to a codex id via categoryMap + the file basename", () => {
    const index = buildDocIndex(root(), registry);
    const resolveUuid = createResolveUuid(index);
    expect(resolveUuid("Compendium.pf2e.spells-srd.Item.Fireball")).toEqual({
      kind: "crossref",
      id: "spell/fireball",
      display: "Fireball",
    });
  });

  it("resolves an id-based reference the same as its name-based twin", () => {
    const index = buildDocIndex(root(), registry);
    const resolveUuid = createResolveUuid(index);
    expect(resolveUuid("Compendium.pf2e.pathfinder-bestiary.Actor.abcABC0123456789")).toEqual({
      kind: "crossref",
      id: "creature/balor",
      display: "Balor",
    });
  });

  it("resolves a Macro/RollTable reference as excluded (D29-6: 123 Macro / 22 RollTable refs)", () => {
    const index = buildDocIndex(root(), registry);
    const resolveUuid = createResolveUuid(index);
    expect(resolveUuid("Compendium.pf2e.pf2e-macros.Macro.Impersonate: Deception")).toEqual({
      kind: "excluded",
      display: "Impersonate: Deception",
    });
    expect(resolveUuid("Compendium.pf2e.rollable-tables.RollTable.Warpwaves")).toEqual({
      kind: "excluded",
      display: "Warpwaves",
    });
  });

  it("resolves an unknown target as broken", () => {
    const index = buildDocIndex(root(), registry);
    const resolveUuid = createResolveUuid(index);
    expect(resolveUuid("Compendium.pf2e.spells-srd.Item.Nonexistent Spell")).toEqual({
      kind: "broken",
    });
  });

  it("skips _folders.json", () => {
    const packsRoot = makePacksRoot({
      "spells/_folders.json": [{ _id: "folder1", name: "Rank 1" }],
      "spells/fireball.json": { _id: "sxQZ6yqTn0czJxVd", name: "Fireball", type: "spell" },
    });
    const index = buildDocIndex(packsRoot, [
      { name: "spells-srd", dir: "spells", docClass: "Item" as const },
    ]);
    const resolveUuid = createResolveUuid(index);
    expect(resolveUuid("Compendium.pf2e.spells-srd.Item.Fireball").kind).toBe("crossref");
  });
});

describe("createResolveUuid: relative refs resolve against the containing journal's registered siblings", () => {
  it("resolves a relative .docId once the sibling page is registered", () => {
    const index = new UuidIndex();
    index.registerJournalPage("entry1", "page2", {
      kind: "crossref",
      id: "archetype/duelist",
      display: "Duelist",
    });
    const containing = {
      _id: "entry1",
      pages: [
        { _id: "page1", name: "Acrobat" },
        { _id: "page2", name: "Duelist" },
      ],
    };
    const resolveUuid = createResolveUuid(index, containing);
    expect(resolveUuid(".page2")).toEqual({
      kind: "crossref",
      id: "archetype/duelist",
      display: "Duelist",
    });
  });

  it("is broken when the sibling isn't in the containing doc's own pages", () => {
    const index = new UuidIndex();
    const containing = { _id: "entry1", pages: [{ _id: "page1", name: "Acrobat" }] };
    const resolveUuid = createResolveUuid(index, containing);
    expect(resolveUuid(".missingPage")).toEqual({ kind: "broken" });
  });

  it("is broken with no containing doc at all", () => {
    const index = new UuidIndex();
    const resolveUuid = createResolveUuid(index);
    expect(resolveUuid(".page2")).toEqual({ kind: "broken" });
  });
});

describe("assertRegistryIsTotal: the drift tripwire", () => {
  it("passes when every on-disk pack dir + every Actor/Item pack is known", () => {
    const packsRoot = makePacksRoot({
      "spells/fireball.json": { _id: "id1", name: "Fireball", type: "spell" },
    });
    expect(() =>
      assertRegistryIsTotal(packsRoot, [
        { name: "spells-srd", dir: "spells", docClass: "Item" as const },
      ]),
    ).not.toThrow();
  });

  it("throws when an on-disk pack dir has no system.pf2e.json registry entry", () => {
    const packsRoot = makePacksRoot({
      "spells/fireball.json": { _id: "id1", name: "Fireball", type: "spell" },
      "a-new-pack/doc.json": { _id: "id2", name: "Something New" },
    });
    expect(() =>
      assertRegistryIsTotal(packsRoot, [
        { name: "spells-srd", dir: "spells", docClass: "Item" as const },
      ]),
    ).toThrow(/pack directory "a-new-pack"/);
  });

  it("throws when a registered Actor/Item pack isn't recognized by categoryMap", () => {
    const packsRoot = makePacksRoot({
      "mystery-pack/doc.json": { _id: "id1", name: "Mystery" },
    });
    expect(() =>
      assertRegistryIsTotal(packsRoot, [
        { name: "mystery-pack", dir: "mystery-pack", docClass: "Item" as const },
      ]),
    ).toThrow(/not recognized by categoryMap/);
  });
});
