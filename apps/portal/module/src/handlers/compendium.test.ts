import { afterEach, describe, expect, it } from "vitest";

import { BridgeError, dispatchQuery, registerHandlers } from "./index";
import { fakeDoc, fakeDocumentClass, fakePack, stubFoundry, teardownFoundry } from "./testSupport";
describe("list-compendium-packs and search-compendium", () => {
  afterEach(teardownFoundry);

  const bestiary = fakePack({
    collection: "pf2e.pathfinder-bestiary",
    type: "Actor",
    label: "Pathfinder Bestiary",
    system: "pf2e",
    entries: [
      { _id: "g1", uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1", name: "Goblin Warrior" },
      {
        _id: "g2",
        uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g2",
        name: "Hobgoblin Soldier",
      },
      {
        _id: "g3",
        uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g3",
        name: "Ancient Goblin Lord",
      },
    ],
  });
  const spells = fakePack({
    collection: "pf2e.spells",
    type: "Item",
    label: "Spells",
    system: "pf2e",
    entries: [{ _id: "s1", uuid: "Compendium.pf2e.spells.Item.s1", name: "Goblin Song" }],
  });

  it("list-compendium-packs returns every registered pack", () => {
    stubFoundry(true, { packs: [bestiary, spells] });
    registerHandlers();
    const result = dispatchQuery("portal.list-compendium-packs", {});
    return expect(result).resolves.toEqual({
      packs: [
        {
          id: "pf2e.pathfinder-bestiary",
          label: "Pathfinder Bestiary",
          type: "Actor",
          system: "pf2e",
        },
        { id: "pf2e.spells", label: "Spells", type: "Item", system: "pf2e" },
      ],
    });
  });

  it("search-compendium ranks prefix hits above later substring hits, merged across packs", async () => {
    stubFoundry(true, { packs: [bestiary, spells] });
    registerHandlers();
    const result = (await dispatchQuery("portal.search-compendium", { query: "goblin" })) as {
      results: Array<{ name: string; uuid: string }>;
    };
    // "Goblin Warrior"/"Goblin Song" both prefix-match (rank 0) — tiebreak alphabetically.
    // "Hobgoblin Soldier" matches at index 3, "Ancient Goblin Lord" at index 8 — nearer
    // wins. All four merged across both packs, not just the bestiary.
    expect(result.results.map((r) => r.name)).toEqual([
      "Goblin Song",
      "Goblin Warrior",
      "Hobgoblin Soldier",
      "Ancient Goblin Lord",
    ]);
  });

  it("search-compendium filters by metadata.type", async () => {
    stubFoundry(true, { packs: [bestiary, spells] });
    registerHandlers();
    const result = (await dispatchQuery("portal.search-compendium", {
      query: "goblin",
      type: "Item",
    })) as { results: Array<{ name: string }> };
    expect(result.results.map((r) => r.name)).toEqual(["Goblin Song"]);
  });

  it("search-compendium filters by packIds", async () => {
    stubFoundry(true, { packs: [bestiary, spells] });
    registerHandlers();
    const result = (await dispatchQuery("portal.search-compendium", {
      query: "goblin",
      packIds: ["pf2e.pathfinder-bestiary"],
    })) as { results: Array<{ pack: string }> };
    expect(result.results.every((r) => r.pack === "pf2e.pathfinder-bestiary")).toBe(true);
    expect(result.results).toHaveLength(3);
  });

  it("search-compendium truncates to the requested limit", async () => {
    stubFoundry(true, { packs: [bestiary, spells] });
    registerHandlers();
    const result = (await dispatchQuery("portal.search-compendium", {
      query: "goblin",
      limit: 2,
    })) as { results: unknown[] };
    expect(result.results).toHaveLength(2);
  });

  it("search-compendium rejects params missing the required query", async () => {
    stubFoundry(true, { packs: [bestiary] });
    registerHandlers();
    await expect(dispatchQuery("portal.search-compendium", {})).rejects.toThrow();
  });
});

describe("import-from-compendium", () => {
  afterEach(teardownFoundry);

  const bestiaryGoblin = fakeDoc({
    id: "g1",
    uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
    name: "Goblin Warrior",
    documentName: "Actor",
    data: { _id: "g1", name: "Goblin Warrior", system: { details: { level: { value: 1 } } } },
  });

  it("clones the compendium doc's own toObject(), stripping _id, via getDocumentClass", async () => {
    const { docClass, created } = fakeDocumentClass("Actor");
    stubFoundry(true, {
      fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
      getDocumentClass: () => docClass,
    });
    registerHandlers();
    const result = (await dispatchQuery("portal.import-from-compendium", {
      uuid: bestiaryGoblin.uuid,
    })) as { rows: Array<{ uuid: string; id: string; name: string; documentType: string }> };

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: "Goblin Warrior", documentType: "Actor" });
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("_id");
    expect(created[0]).toMatchObject({
      name: "Goblin Warrior",
      system: { details: { level: { value: 1 } } },
    });
  });

  it("stamps the cloned document as portal-created", async () => {
    const { docClass, created } = fakeDocumentClass("Actor");
    stubFoundry(true, {
      fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
      getDocumentClass: () => docClass,
    });
    registerHandlers();
    await dispatchQuery("portal.import-from-compendium", { uuid: bestiaryGoblin.uuid });
    expect(created[0]).toMatchObject({
      flags: { "astra-portal": { created: true, tool: "import-from-compendium" } },
    });
  });

  it("creates `quantity` copies in one call", async () => {
    const { docClass, created } = fakeDocumentClass("Actor");
    stubFoundry(true, {
      fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
      getDocumentClass: () => docClass,
    });
    registerHandlers();
    const result = (await dispatchQuery("portal.import-from-compendium", {
      uuid: bestiaryGoblin.uuid,
      quantity: 3,
    })) as { rows: unknown[] };
    expect(result.rows).toHaveLength(3);
    expect(created).toHaveLength(3);
  });

  it("resolves an existing folder by name + document type onto the cloned doc", async () => {
    const { docClass, created } = fakeDocumentClass("Actor");
    stubFoundry(true, {
      fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
      getDocumentClass: () => docClass,
      folders: [{ id: "f1", name: "Bestiary Imports", type: "Actor" }],
    });
    registerHandlers();
    await dispatchQuery("portal.import-from-compendium", {
      uuid: bestiaryGoblin.uuid,
      folder: "Bestiary Imports",
    });
    expect(created[0]).toMatchObject({ folder: "f1" });
  });

  it("rejects a folder name that doesn't exist with a typed not-found error", async () => {
    stubFoundry(true, {
      fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
      folders: [],
    });
    registerHandlers();
    const err = await dispatchQuery("portal.import-from-compendium", {
      uuid: bestiaryGoblin.uuid,
      folder: "No Such Folder",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
  });

  it("rejects a bad/unresolvable uuid with a typed not-found error", async () => {
    stubFoundry(true, { fromUuid: () => Promise.resolve(null) });
    registerHandlers();
    const err = await dispatchQuery("portal.import-from-compendium", {
      uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.nope",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
  });

  it("rejects a non-compendium uuid (it only clones from compendiums)", async () => {
    stubFoundry(true, {});
    registerHandlers();
    const err = await dispatchQuery("portal.import-from-compendium", {
      uuid: "Actor.a1", // a world uuid, not a compendium one
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("foundry-error");
  });

  it("rejects params missing the required uuid", async () => {
    stubFoundry(true, {});
    registerHandlers();
    await expect(dispatchQuery("portal.import-from-compendium", {})).rejects.toThrow();
  });
});
