import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./handlers";

/** A fake `FoundryPacksCollection`/`FoundryWorldCollection`/`FoundryScenesCollection` —
 * `values()` is all any S4 handler needs (see `types/foundry.d.ts`'s own minimal-surface
 * philosophy). */
function fakeValuesCollection<T>(items: T[]): { values(): IterableIterator<T> } {
  return { values: () => items[Symbol.iterator]() };
}

function fakePack(opts: {
  collection: string;
  type: string;
  label: string;
  system?: string;
  entries?: FoundryCompendiumIndexEntry[];
}): FoundryCompendiumCollection {
  return {
    collection: opts.collection,
    metadata: { type: opts.type, label: opts.label, system: opts.system },
    getIndex: () => Promise.resolve(fakeValuesCollection(opts.entries ?? [])),
  };
}

function fakeDoc(opts: {
  id: string;
  uuid: string;
  name: string;
  documentName: string;
  folder?: string;
  data?: Record<string, unknown>;
}): FoundryDocumentLike {
  return {
    id: opts.id,
    uuid: opts.uuid,
    name: opts.name,
    documentName: opts.documentName,
    folder: opts.folder !== undefined ? { name: opts.folder } : null,
    toObject: () => opts.data ?? { _id: opts.id, name: opts.name },
  };
}

function fakeScene(opts: {
  id: string;
  name: string;
  active: boolean;
  tokenCount?: number;
}): FoundryScene {
  return {
    ...fakeDoc({ id: opts.id, uuid: `Scene.${opts.id}`, name: opts.name, documentName: "Scene" }),
    active: opts.active,
    grid: { size: 100, type: 1 },
    width: 4000,
    height: 3000,
    tokens: { size: opts.tokenCount ?? 0 },
  };
}

interface FoundryStubOverrides {
  packs?: FoundryCompendiumCollection[];
  actors?: FoundryDocumentLike[];
  items?: FoundryDocumentLike[];
  journal?: FoundryDocumentLike[];
  scenes?: FoundryScene[];
  fromUuid?: (uuid: string) => Promise<FoundryDocumentLike | null>;
}

/** Stubs the ambient Foundry globals `handlers.ts` touches (`game`, `CONFIG`,
 * `fromUuid`) — S3/S4 are Foundry-free, so these are plain objects, not a real Foundry
 * runtime. */
function stubFoundry(isGM: boolean, overrides: FoundryStubOverrides = {}): void {
  globalThis.game = {
    user: { isGM },
    world: { id: "faerrin", title: "Faerrin" },
    system: { id: "pf2e", version: "7.12.2" },
    version: "13.351",
    settings: {
      register: () => {},
      get: () => undefined,
    },
    packs: fakeValuesCollection(overrides.packs ?? []),
    actors: fakeValuesCollection(overrides.actors ?? []),
    items: fakeValuesCollection(overrides.items ?? []),
    journal: fakeValuesCollection(overrides.journal ?? []),
    scenes: {
      ...fakeValuesCollection(overrides.scenes ?? []),
      active: (overrides.scenes ?? []).find((s) => s.active) ?? null,
    },
  };
  globalThis.CONFIG = { queries: {} };
  globalThis.fromUuid = overrides.fromUuid ?? (() => Promise.resolve(null));
}

describe("portal-module handlers (spec 0023 S3 — Foundry-free)", () => {
  beforeEach(() => {
    stubFoundry(true);
  });

  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
    // @ts-expect-error — same.
    delete globalThis.CONFIG;
    // @ts-expect-error — same.
    delete globalThis.fromUuid;
  });

  it("registers portal.ping into CONFIG.queries", () => {
    registerHandlers();
    expect(typeof CONFIG.queries["portal.ping"]).toBe("function");
  });

  it("dispatchQuery invokes the registered handler and returns its result", async () => {
    registerHandlers();
    await expect(dispatchQuery("portal.ping", undefined)).resolves.toEqual({
      pong: true,
      worldId: "faerrin",
      system: "pf2e",
    });
  });

  it("dispatchQuery rejects with a typed not-gm error when the session isn't a GM", async () => {
    stubFoundry(false);
    registerHandlers();
    const err = await dispatchQuery("portal.ping", undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("not-gm");
  });

  it("dispatchQuery rejects with a typed foundry-error for an unregistered method", async () => {
    // Deliberately skip registerHandlers() — CONFIG.queries stays empty.
    const err = await dispatchQuery("portal.no-such-method", undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("foundry-error");
  });

  it("propagates a handler's own thrown error unwrapped (bridgeClient.ts wraps it)", async () => {
    CONFIG.queries["portal.boom"] = () => {
      throw new Error("handler exploded");
    };
    await expect(dispatchQuery("portal.boom", undefined)).rejects.toThrow("handler exploded");
  });
});

describe("portal-module read tools (spec 0023 S4 — Foundry-free)", () => {
  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
    // @ts-expect-error — same.
    delete globalThis.CONFIG;
    // @ts-expect-error — same.
    delete globalThis.fromUuid;
  });

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

  it("get-document resolves a document via fromUuid and returns its full toObject()", async () => {
    const doc = fakeDoc({
      id: "g1",
      uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
      name: "Goblin Warrior",
      documentName: "Actor",
      data: { _id: "g1", name: "Goblin Warrior", system: { details: { level: { value: 1 } } } },
    });
    stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
    registerHandlers();
    const result = await dispatchQuery("portal.get-document", { uuid: doc.uuid });
    expect(result).toEqual({ uuid: doc.uuid, document: doc.toObject() });
  });

  it("get-document rejects with a typed not-found error for an unresolvable uuid", async () => {
    stubFoundry(true, { fromUuid: () => Promise.resolve(null) });
    registerHandlers();
    const err = await dispatchQuery("portal.get-document", { uuid: "Actor.nope" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("not-found");
  });

  it("get-document rejects params missing the required uuid", async () => {
    stubFoundry(true, {});
    registerHandlers();
    await expect(dispatchQuery("portal.get-document", {})).rejects.toThrow();
  });

  const goblinPc = fakeDoc({
    id: "a1",
    uuid: "Actor.a1",
    name: "Goblin Slayer",
    documentName: "Actor",
    folder: "Player Characters",
  });
  const worldJournal = fakeDoc({
    id: "j1",
    uuid: "JournalEntry.j1",
    name: "Goblin Warren Notes",
    documentName: "JournalEntry",
  });
  const unrelatedActor = fakeDoc({
    id: "a2",
    uuid: "Actor.a2",
    name: "Town Blacksmith",
    documentName: "Actor",
  });

  it("search-world filters across all four collections by default", async () => {
    stubFoundry(true, {
      actors: [goblinPc, unrelatedActor],
      journal: [worldJournal],
    });
    registerHandlers();
    const result = (await dispatchQuery("portal.search-world", { query: "goblin" })) as {
      results: Array<{ name: string; documentType: string; folder?: string }>;
    };
    expect(result.results.map((r) => r.name).sort()).toEqual([
      "Goblin Slayer",
      "Goblin Warren Notes",
    ]);
    const pc = result.results.find((r) => r.name === "Goblin Slayer");
    expect(pc).toMatchObject({ documentType: "Actor", folder: "Player Characters" });
  });

  it("search-world restricts to the requested types subset", async () => {
    stubFoundry(true, {
      actors: [goblinPc, unrelatedActor],
      journal: [worldJournal],
    });
    registerHandlers();
    const result = (await dispatchQuery("portal.search-world", {
      query: "goblin",
      types: ["journal"],
    })) as { results: Array<{ name: string }> };
    expect(result.results.map((r) => r.name)).toEqual(["Goblin Warren Notes"]);
  });

  it("search-world rejects params missing the required query", async () => {
    stubFoundry(true, {});
    registerHandlers();
    await expect(dispatchQuery("portal.search-world", {})).rejects.toThrow();
  });

  const activeScene = fakeScene({ id: "sc1", name: "The Warren", active: true, tokenCount: 4 });
  const idleScene = fakeScene({ id: "sc2", name: "Town Square", active: false });

  it("list-scenes returns every scene with its active flag", async () => {
    stubFoundry(true, { scenes: [activeScene, idleScene] });
    registerHandlers();
    const result = await dispatchQuery("portal.list-scenes", {});
    expect(result).toEqual({
      scenes: [
        { id: "sc1", name: "The Warren", active: true },
        { id: "sc2", name: "Town Square", active: false },
      ],
    });
  });

  it("get-current-scene returns the active scene's grid/dimensions/token count", async () => {
    stubFoundry(true, { scenes: [activeScene, idleScene] });
    registerHandlers();
    const result = await dispatchQuery("portal.get-current-scene", {});
    expect(result).toEqual({
      scene: {
        id: "sc1",
        name: "The Warren",
        grid: { size: 100, type: 1 },
        width: 4000,
        height: 3000,
        tokenCount: 4,
      },
    });
  });

  it("get-current-scene returns a null scene (not an error) when the world is idle", async () => {
    stubFoundry(true, { scenes: [idleScene] });
    registerHandlers();
    const result = await dispatchQuery("portal.get-current-scene", {});
    expect(result).toEqual({ scene: null });
  });
});
