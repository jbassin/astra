import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SETTING_ALLOW_WRITES } from "./constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./handlers";

/** A fake `FoundryPacksCollection`/`FoundryWorldCollection`/`FoundryScenesCollection`/
 * `FoundryFoldersCollection` — `values()` covers every S4 handler (see
 * `types/foundry.d.ts`'s own minimal-surface philosophy); `get(id)` is S5's addition
 * (`create-token`'s `actorId` path) — harmless on collections that never call it.
 * Deliberately unconstrained/cast rather than `T extends {id?: string}`: some callers
 * (compendium packs/index entries) have no `id` field at all, and TypeScript's "weak
 * type" detection rejects assigning a zero-overlap object to an all-optional-props
 * constraint — casting inside `get`'s body sidesteps that without weakening the
 * collection's own declared element type. */
function fakeValuesCollection<T>(items: T[]): {
  values(): IterableIterator<T>;
  get(id: string): T | undefined;
} {
  return {
    values: () => items[Symbol.iterator](),
    get: (id) => items.find((i) => (i as { id?: string }).id === id),
  };
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

/** Returns a {@link FoundryActor} (a superset of `FoundryDocumentLike`) so every
 * existing S4 call site — journal/item/scene stand-ins that never call
 * `getTokenDocument` — keeps working unchanged, while S5's actor-specific tests get a
 * working `getTokenDocument` stub for free (the returned "token" is just the given
 * position + this doc's name, enough for `create-token`'s offset-math assertions). */
function fakeDoc(opts: {
  id: string;
  uuid: string;
  name: string;
  documentName: string;
  folder?: string;
  data?: Record<string, unknown>;
}): FoundryActor {
  return {
    id: opts.id,
    uuid: opts.uuid,
    name: opts.name,
    documentName: opts.documentName,
    folder: opts.folder !== undefined ? { name: opts.folder } : null,
    toObject: () => opts.data ?? { _id: opts.id, name: opts.name },
    getTokenDocument: (pos: { x: number; y: number }) =>
      Promise.resolve({ toObject: () => ({ x: pos.x, y: pos.y, name: opts.name }) }),
  };
}

/** S5's `create-token` landing call — by default just echoes each given token payload
 * back as a minted doc (so a test asserting on the RESULT's x/y sees exactly what
 * `actor.getTokenDocument().toObject()` produced), with a distinct sequential id per
 * token. Override for a test that wants to assert on the exact `data` it was called
 * with (S3/S4 scenes never call this at all). */
function fakeCreateEmbeddedDocuments(
  embeddedName: string,
  data: Record<string, unknown>[],
): Promise<FoundryDocumentLike[]> {
  return Promise.resolve(
    data.map((d, i) => ({
      id: `${embeddedName.toLowerCase()}${i + 1}`,
      uuid: `${embeddedName}.${embeddedName.toLowerCase()}${i + 1}`,
      name: typeof d.name === "string" ? d.name : embeddedName,
      documentName: embeddedName,
      toObject: () => d,
    })),
  );
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
    createEmbeddedDocuments: fakeCreateEmbeddedDocuments,
  };
}

interface FoundryStubOverrides {
  packs?: FoundryCompendiumCollection[];
  actors?: FoundryActor[];
  items?: FoundryDocumentLike[];
  journal?: FoundryDocumentLike[];
  scenes?: FoundryScene[];
  folders?: FoundryFolder[];
  fromUuid?: (uuid: string) => Promise<FoundryDocumentLike | null>;
  /** S5 — the world-settings map `game.settings.get` reads from, keyed by setting key
   * (namespace ignored, this module only ever registers its own). */
  settings?: Record<string, unknown>;
  /** S5 — `getDocumentClass` per document type; see {@link fakeDocumentClass}. */
  getDocumentClass?: (documentName: string) => FoundryDocumentClass;
}

/** Stubs the ambient Foundry globals `handlers.ts` touches (`game`, `CONFIG`,
 * `fromUuid`, `getDocumentClass`) — S3/S4/S5 are all Foundry-free, so these are plain
 * objects, not a real Foundry runtime. */
function stubFoundry(isGM: boolean, overrides: FoundryStubOverrides = {}): void {
  globalThis.game = {
    user: { isGM },
    world: { id: "faerrin", title: "Faerrin" },
    system: { id: "pf2e", version: "7.12.2" },
    version: "13.351",
    settings: {
      register: () => {},
      get: (_namespace, key) => overrides.settings?.[key],
    },
    packs: fakeValuesCollection(overrides.packs ?? []),
    actors: fakeValuesCollection(overrides.actors ?? []),
    items: fakeValuesCollection(overrides.items ?? []),
    journal: fakeValuesCollection(overrides.journal ?? []),
    scenes: {
      ...fakeValuesCollection(overrides.scenes ?? []),
      active: (overrides.scenes ?? []).find((s) => s.active) ?? null,
    },
    folders: fakeValuesCollection(overrides.folders ?? []),
  };
  globalThis.CONFIG = { queries: {} };
  globalThis.fromUuid = overrides.fromUuid ?? (() => Promise.resolve(null));
  globalThis.getDocumentClass =
    overrides.getDocumentClass ??
    (() => {
      throw new Error("getDocumentClass not stubbed in this test");
    });
}

/** A minimal fake `FoundryDocumentClass` (S5) — `createDocuments`/`create` just mint
 * a sequential id per call and hand back a {@link fakeDoc}-shaped result, recording
 * every payload it was given in `created` so tests can assert on exactly what
 * `handlers.ts` sent (e.g. that `_id` was stripped, `folder` was resolved to an id). */
function fakeDocumentClass(
  documentName: string,
  idPrefix = "new",
): { docClass: FoundryDocumentClass; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  let counter = 0;
  function mint(data: Record<string, unknown>): FoundryActor {
    counter += 1;
    const id = `${idPrefix}${counter}`;
    created.push(data);
    return fakeDoc({
      id,
      uuid: `${documentName}.${id}`,
      name: typeof data.name === "string" ? data.name : "Unnamed",
      documentName,
    });
  }
  const docClass: FoundryDocumentClass = {
    createDocuments: (data) => Promise.resolve(data.map((d) => mint(d))),
    create: (data) => Promise.resolve(mint(data)),
  };
  return { docClass, created };
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
    // @ts-expect-error — same.
    delete globalThis.getDocumentClass;
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
    // @ts-expect-error — same.
    delete globalThis.getDocumentClass;
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

describe("portal-module write tools (spec 0023 S5 — Foundry-free)", () => {
  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
    // @ts-expect-error — same.
    delete globalThis.CONFIG;
    // @ts-expect-error — same.
    delete globalThis.fromUuid;
    // @ts-expect-error — same.
    delete globalThis.getDocumentClass;
  });

  const bestiaryGoblin = fakeDoc({
    id: "g1",
    uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
    name: "Goblin Warrior",
    documentName: "Actor",
    data: { _id: "g1", name: "Goblin Warrior", system: { details: { level: { value: 1 } } } },
  });

  describe("the write gate (D8)", () => {
    it("import-from-compendium is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, {
        settings: { [SETTING_ALLOW_WRITES]: false },
        fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
      });
      registerHandlers();
      const err = await dispatchQuery("portal.import-from-compendium", {
        uuid: bestiaryGoblin.uuid,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });

    it("create-token is denied with cap-exceeded above the module's hard creates ceiling", async () => {
      stubFoundry(true, {});
      registerHandlers();
      const err = await dispatchQuery("portal.create-token", {
        actorId: "a1",
        x: 0,
        y: 0,
        quantity: 51, // MODULE_MAX_CREATES_CEILING is 50 — this must be denied module-side
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("cap-exceeded");
    });

    it("writes are allowed by default (the setting is unset, D8 default true)", async () => {
      const { docClass } = fakeDocumentClass("Actor");
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
        getDocumentClass: () => docClass,
      });
      registerHandlers();
      await expect(
        dispatchQuery("portal.import-from-compendium", { uuid: bestiaryGoblin.uuid }),
      ).resolves.toBeDefined();
    });
  });

  describe("import-from-compendium (D5 clone-from-compendium ONLY)", () => {
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
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("rejects a bad/unresolvable uuid with a typed not-found error", async () => {
      stubFoundry(true, { fromUuid: () => Promise.resolve(null) });
      registerHandlers();
      const err = await dispatchQuery("portal.import-from-compendium", {
        uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.nope",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("rejects a non-compendium uuid (D5 clone-from-compendium ONLY)", async () => {
      stubFoundry(true, {});
      registerHandlers();
      const err = await dispatchQuery("portal.import-from-compendium", {
        uuid: "Actor.a1", // a world uuid, not a compendium one
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("foundry-error");
    });

    it("rejects params missing the required uuid", async () => {
      stubFoundry(true, {});
      registerHandlers();
      await expect(dispatchQuery("portal.import-from-compendium", {})).rejects.toThrow();
    });
  });

  describe("create-token (D13 import-then-tokenize)", () => {
    const existingActor = fakeDoc({
      id: "a1",
      uuid: "Actor.a1",
      name: "Goblin Slayer",
      documentName: "Actor",
    });
    const activeScene = fakeScene({ id: "sc1", name: "The Warren", active: true });

    it("tokenizes an existing world actor via actorId onto the active scene", async () => {
      stubFoundry(true, { actors: [existingActor], scenes: [activeScene] });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-token", {
        actorId: "a1",
        x: 100,
        y: 200,
      })) as { actor: { id: string }; tokens: Array<{ x: number; y: number }>; sceneId: string };

      expect(result.actor).toMatchObject({ id: "a1", name: "Goblin Slayer" });
      expect(result.sceneId).toBe("sc1");
      expect(result.tokens).toEqual([{ id: expect.any(String), x: 100, y: 200 }]);
    });

    it("offsets each additional token by one grid square so they don't stack exactly", async () => {
      stubFoundry(true, { actors: [existingActor], scenes: [activeScene] }); // grid.size = 100
      registerHandlers();
      const result = (await dispatchQuery("portal.create-token", {
        actorId: "a1",
        x: 0,
        y: 0,
        quantity: 3,
      })) as { tokens: Array<{ x: number; y: number }> };

      expect(result.tokens.map((t) => [t.x, t.y])).toEqual([
        [0, 0],
        [100, 100],
        [200, 200],
      ]);
    });

    it("imports the compendium doc first when given uuid instead of actorId (D13)", async () => {
      const { docClass } = fakeDocumentClass("Actor", "imported");
      stubFoundry(true, {
        scenes: [activeScene],
        fromUuid: (uuid) => Promise.resolve(uuid === bestiaryGoblin.uuid ? bestiaryGoblin : null),
        getDocumentClass: () => docClass,
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-token", {
        uuid: bestiaryGoblin.uuid,
        x: 50,
        y: 50,
      })) as { actor: { name: string }; tokens: unknown[] };

      expect(result.actor.name).toBe("Goblin Warrior");
      expect(result.tokens).toHaveLength(1);
    });

    it("rejects with a typed not-found error when no scene is active", async () => {
      stubFoundry(true, { actors: [existingActor], scenes: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.create-token", {
        actorId: "a1",
        x: 0,
        y: 0,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("rejects an unknown actorId with a typed not-found error", async () => {
      stubFoundry(true, { actors: [], scenes: [activeScene] });
      registerHandlers();
      const err = await dispatchQuery("portal.create-token", {
        actorId: "no-such-actor",
        x: 0,
        y: 0,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("rejects params carrying both uuid and actorId, or neither", async () => {
      stubFoundry(true, {});
      registerHandlers();
      await expect(
        dispatchQuery("portal.create-token", {
          uuid: "Compendium.x.Actor.1",
          actorId: "a1",
          x: 0,
          y: 0,
        }),
      ).rejects.toThrow();
      await expect(dispatchQuery("portal.create-token", { x: 0, y: 0 })).rejects.toThrow();
    });
  });

  describe("create-journal", () => {
    it("creates a JournalEntry with one text page carrying the given HTML content", async () => {
      const { docClass, created } = fakeDocumentClass("JournalEntry");
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-journal", {
        name: "Session Notes",
        content: "<p>The party found a goblin warren.</p>",
      })) as { uuid: string; id: string; name: string };

      expect(result).toMatchObject({ name: "Session Notes" });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        name: "Session Notes",
        pages: [
          {
            name: "Session Notes",
            type: "text",
            text: { content: "<p>The party found a goblin warren.</p>" },
          },
        ],
      });
    });

    it("resolves a JournalEntry-type folder by name", async () => {
      const { docClass, created } = fakeDocumentClass("JournalEntry");
      stubFoundry(true, {
        getDocumentClass: () => docClass,
        folders: [{ id: "jf1", name: "Session Logs", type: "JournalEntry" }],
      });
      registerHandlers();
      await dispatchQuery("portal.create-journal", {
        name: "Session Notes",
        content: "<p>hi</p>",
        folder: "Session Logs",
      });
      expect(created[0]).toMatchObject({ folder: "jf1" });
    });

    it("rejects params missing the required name", async () => {
      stubFoundry(true, {});
      registerHandlers();
      await expect(
        dispatchQuery("portal.create-journal", { content: "<p>hi</p>" }),
      ).rejects.toThrow();
    });
  });
});
