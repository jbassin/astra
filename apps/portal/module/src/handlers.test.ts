import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SETTING_ALLOW_MACRO_EXECUTION, SETTING_ALLOW_WRITES } from "./constants";
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
  type?: string;
  flags?: Record<string, unknown>;
}): FoundryActor {
  return {
    id: opts.id,
    uuid: opts.uuid,
    name: opts.name,
    documentName: opts.documentName,
    type: opts.type,
    flags: opts.flags,
    folder: opts.folder !== undefined ? { name: opts.folder } : null,
    // `structuredClone`, not the same `opts.data` reference every call: real Foundry's
    // `toObject()` always hands back a FRESH plain-object clone, never the live
    // document's own backing data — a caller that mutates what it gets back (as
    // `resolveBasePayload`/`cloneFromCompendium` deliberately do, stripping `_id`)
    // must never be able to corrupt this fake's "source" doc as a side effect (0026
    // S2's "baseUuid clones-then-patches without mutating the source" acceptance).
    toObject: () => structuredClone(opts.data ?? { _id: opts.id, name: opts.name }),
    getTokenDocument: (pos: { x: number; y: number }) =>
      Promise.resolve({ toObject: () => ({ x: pos.x, y: pos.y, name: opts.name }) }),
    // 0026 S2's default: an actor stand-in that just echoes back whatever embedded
    // item payloads it's given (no `rules`, matching the D-7 "absent = no warnings"
    // defensive case) — S2 tests needing control over the returned `rules` override
    // this with `fakeItemEmbedded`'s `fn` instead.
    createEmbeddedDocuments: fakeCreateEmbeddedDocuments,
    // 0026 S3 defaults: never called/read unless a test explicitly exercises
    // apply-condition (`fakeConditionActor` below overrides all four) — present here
    // only so every existing `fakeDoc`/`fakeScene`/`fakeActorDocumentClass` call site
    // (S3/S4/S2, none of which touch conditions) keeps satisfying `FoundryActor`'s
    // now-required condition surface.
    increaseCondition: () => Promise.resolve(null),
    decreaseCondition: () => Promise.resolve(),
    toggleCondition: () => Promise.resolve(),
    itemTypes: { condition: [] },
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

/** A plain, non-mutating deep merge good enough to stand in for real Foundry's
 * `foundry.utils.mergeObject` in these Foundry-free tests (0026 S2) — objects merge
 * key-by-key recursively, anything else (arrays included, matching real Foundry's own
 * "arrays replace wholesale" semantics) is a plain overwrite. */
function deepMergeObject<T extends Record<string, unknown>>(
  original: Record<string, unknown>,
  other: Record<string, unknown> = {},
): T {
  const result: Record<string, unknown> = { ...original };
  for (const [key, value] of Object.entries(other)) {
    const existing = result[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMergeObject(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** S2 (0026) — a `createEmbeddedDocuments` stub for the D-7 RE read-back tests: mints
 * one item per given payload, optionally stamping a specific `rules` array onto the
 * item at a given index (everything else falls back to no `rules` at all — the
 * defensive "absent means unknown, not everything-failed" case). Records every call's
 * raw `data` so a test can assert on exactly what a handler sent (the stamp, an
 * untouched aura RE, ...). */
function fakeItemEmbedded(rulesByIndex: Record<number, FoundryRuleElement[]> = {}): {
  fn: (embeddedName: string, data: Record<string, unknown>[]) => Promise<FoundryItemLike[]>;
  calls: Array<{ embeddedName: string; data: Record<string, unknown>[] }>;
} {
  const calls: Array<{ embeddedName: string; data: Record<string, unknown>[] }> = [];
  let counter = 0;
  const fn = (
    embeddedName: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryItemLike[]> => {
    calls.push({ embeddedName, data });
    const items: FoundryItemLike[] = data.map((d) => {
      const idx = counter;
      counter += 1;
      const id = `item${counter}`;
      return {
        id,
        uuid: `${embeddedName}.${id}`,
        name: typeof d.name === "string" ? d.name : embeddedName,
        documentName: embeddedName,
        toObject: () => d,
        rules: rulesByIndex[idx],
      };
    });
    return Promise.resolve(items);
  };
  return { fn, calls };
}

/** A `FoundryDocumentClass` whose `create`/`createDocuments` always reject with the
 * given rejection — for simulating Foundry's `DataModelValidationError` (0026 S2 D-7).
 * Wrapped in a function (rather than `Promise.reject(rejection)` inline on the object
 * literal) to sidestep oxlint's `promise/no-promise-in-callback` heuristic, which
 * otherwise flags an inline reject of a captured error-shaped variable. */
function fakeThrowingDocumentClass(rejection: unknown): FoundryDocumentClass {
  function alwaysRejects(): Promise<never> {
    return Promise.reject(rejection);
  }
  return {
    createDocuments: alwaysRejects,
    create: alwaysRejects,
  };
}

/** A stand-in `DataModelValidationError` — handlers.ts detects it by name/constructor-
 * name string (the real class isn't part of this module's ambient surface, see
 * `types/foundry.d.ts`), so a plain `Error` with the name overridden is indistinguishable
 * from the real thing at the one call site that checks it. */
function fakeDataModelValidationError(message: string): Error {
  return Object.assign(new Error(message), { name: "DataModelValidationError" });
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
  /** 0026 S3 — `execute-macro`'s `game.macros.get` lookup. */
  macros?: FoundryMacro[];
  /** 0026 S3 — `apply-condition`'s persistent-damage non-dialog path
   * (`game.pf2e.ConditionManager.getCondition`); defaults to a stand-in returning a
   * bare `{system: {value: {value: null}}}` persistent-damage source, close enough to
   * real pf2e's compendium condition source for these Foundry-free tests. */
  conditionManager?: FoundryPf2eConditionManager;
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
    macros: fakeValuesCollection(overrides.macros ?? []),
    pf2e: {
      ConditionManager: overrides.conditionManager ?? {
        getCondition: () => ({
          toObject: () => ({
            name: "Persistent Damage",
            type: "condition",
            system: { value: { value: null } },
          }),
        }),
      },
    },
  };
  globalThis.CONFIG = { queries: {} };
  globalThis.fromUuid = overrides.fromUuid ?? (() => Promise.resolve(null));
  globalThis.getDocumentClass =
    overrides.getDocumentClass ??
    (() => {
      throw new Error("getDocumentClass not stubbed in this test");
    });
  // 0026 S2 — `foundry.utils.mergeObject` backs the D-1 baseUuid clone+patch path and
  // the D-6 stamp merge; {@link deepMergeObject} is a plain stand-in, real enough for
  // these Foundry-free tests.
  globalThis.foundry = { utils: { mergeObject: deepMergeObject } };
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

/** Like {@link fakeDocumentClass} but for `getDocumentClass("Actor")` specifically
 * (0026 S2): the minted actor's `createEmbeddedDocuments` is the given stub, so a
 * `create-actor` test can control/inspect exactly what happens when its embedded
 * `items[]` get created, while `created` still records the actor's OWN payload (for
 * asserting the D-6 stamp landed on the actor as well as its items). */
function fakeActorDocumentClass(
  embeddedFn: (
    embeddedName: string,
    data: Record<string, unknown>[],
  ) => Promise<FoundryItemLike[]> = fakeCreateEmbeddedDocuments,
): { docClass: FoundryDocumentClass; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  let counter = 0;
  function mint(data: Record<string, unknown>): FoundryActor {
    counter += 1;
    const id = `actor${counter}`;
    created.push(data);
    return {
      ...fakeDoc({
        id,
        uuid: `Actor.${id}`,
        name: typeof data.name === "string" ? data.name : "Unnamed",
        documentName: "Actor",
        data,
      }),
      createEmbeddedDocuments: embeddedFn,
    };
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
    // @ts-expect-error — same.
    delete globalThis.foundry;
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
    // @ts-expect-error — same.
    delete globalThis.foundry;
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
    // @ts-expect-error — same.
    delete globalThis.foundry;
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

    it("stamps the cloned document (0026 D-6 retrofit)", async () => {
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

    it("stamps the created token (0026 D-6 retrofit)", async () => {
      const embedded = fakeItemEmbedded();
      const scene = { ...activeScene, createEmbeddedDocuments: embedded.fn };
      stubFoundry(true, { actors: [existingActor], scenes: [scene] });
      registerHandlers();
      await dispatchQuery("portal.create-token", { actorId: "a1", x: 0, y: 0 });
      expect(embedded.calls[0]?.data[0]).toMatchObject({
        flags: { "astra-portal": { created: true, tool: "create-token" } },
      });
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

    it("stamps the created journal (0026 D-6 retrofit)", async () => {
      const { docClass, created } = fakeDocumentClass("JournalEntry");
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      await dispatchQuery("portal.create-journal", { name: "Session Notes", content: "<p>hi</p>" });
      expect(created[0]).toMatchObject({
        flags: { "astra-portal": { created: true, tool: "create-journal" } },
      });
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

describe("portal-module S2 authoring tools (spec 0026 S2 — Foundry-free)", () => {
  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
    // @ts-expect-error — same.
    delete globalThis.CONFIG;
    // @ts-expect-error — same.
    delete globalThis.fromUuid;
    // @ts-expect-error — same.
    delete globalThis.getDocumentClass;
    // @ts-expect-error — same.
    delete globalThis.foundry;
  });

  describe("create-actor (D-1/D-6/D-7)", () => {
    it("creates an NPC with embedded melee strikes, stamped on actor AND items", async () => {
      const embedded = fakeItemEmbedded();
      const { docClass, created } = fakeActorDocumentClass(embedded.fn);
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-actor", {
        type: "npc",
        name: "Goblin Bruiser",
        system: { details: { level: { value: 1 } } },
        items: [
          {
            name: "Jagged Shortsword",
            type: "melee",
            system: { bonus: { value: 8 }, damageRolls: {} },
          },
        ],
      })) as { uuid: string; itemUuids?: string[]; warnings: string[] };

      expect(created[0]).toMatchObject({
        name: "Goblin Bruiser",
        flags: { "astra-portal": { created: true, tool: "create-actor" } },
      });
      expect(embedded.calls).toHaveLength(1);
      expect(embedded.calls[0]?.data[0]).toMatchObject({
        name: "Jagged Shortsword",
        flags: { "astra-portal": { created: true, tool: "create-actor" } },
      });
      expect(result.uuid).toBe("Actor.actor1");
      expect(result.itemUuids).toEqual(["Item.item1"]);
      expect(result.warnings).toEqual([]);
    });

    it("clones+patches a compendium baseUuid without mutating the source", async () => {
      const baseData = {
        _id: "g1",
        name: "Goblin Warrior",
        type: "npc",
        system: { details: { level: { value: 1 } }, attributes: { hp: { value: 6 } } },
      };
      const base = fakeDoc({
        id: "g1",
        uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
        name: "Goblin Warrior",
        documentName: "Actor",
        data: baseData,
      });
      const { docClass, created } = fakeDocumentClass("Actor");
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === base.uuid ? base : null),
        getDocumentClass: () => docClass,
      });
      registerHandlers();
      await dispatchQuery("portal.create-actor", {
        type: "npc",
        name: "Goblin Warrior (Elite)",
        baseUuid: base.uuid,
        system: { attributes: { hp: { value: 12 } } },
      });

      // The source is untouched — a fresh toObject() still carries its own _id/hp,
      // proving `resolveBasePayload`'s `delete base._id` never reached back into it.
      expect(base.toObject()).toEqual(baseData);
      expect(created[0]).not.toHaveProperty("_id");
      expect(created[0]).toMatchObject({
        name: "Goblin Warrior (Elite)",
        system: { details: { level: { value: 1 } }, attributes: { hp: { value: 12 } } },
        flags: { "astra-portal": { created: true, tool: "create-actor" } },
      });
    });

    it("rejects a non-compendium baseUuid (compendium-only guard, mirrors cloneFromCompendium)", async () => {
      stubFoundry(true, {});
      registerHandlers();
      const err = await dispatchQuery("portal.create-actor", {
        type: "npc",
        name: "X",
        baseUuid: "Actor.a1", // a world uuid, not a compendium one
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("foundry-error");
    });

    it("maps a DataModelValidationError to a typed validation-failed error (hazard)", async () => {
      const docClass = fakeThrowingDocumentClass(
        fakeDataModelValidationError("attributes.hp.value: must be a non-negative integer"),
      );
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      const err = await dispatchQuery("portal.create-actor", {
        type: "hazard",
        name: "Rigged Trap",
        system: { attributes: { hp: { value: -5 } } },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("validation-failed");
      expect((err as BridgeHandlerError).message).toBe(
        "attributes.hp.value: must be a non-negative integer",
      );
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.create-actor", { type: "npc", name: "X" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });

  describe("create-item (D-1/D-6/D-7)", () => {
    it("creates an effect item carrying an Aura RE referencing a companion effect uuid, pass-through untouched", async () => {
      const { docClass, created } = fakeDocumentClass("Item");
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      const auraSystem = {
        rules: [
          {
            key: "Aura",
            radius: "10",
            effects: [{ uuid: "Item.companion-effect-1", affects: "allies", removeOnExit: true }],
          },
        ],
      };
      const result = (await dispatchQuery("portal.create-item", {
        name: "Aura of Courage",
        type: "effect",
        system: auraSystem,
      })) as { uuid: string; warnings: string[] };

      expect(created[0]).toMatchObject({
        name: "Aura of Courage",
        type: "effect",
        system: auraSystem,
      });
      // Pass-through untouched: the companion effect's uuid rides verbatim, never
      // validated/rewritten at this layer (D-7's "structurally opaque" posture).
      const sentSystem = created[0]?.system as typeof auraSystem;
      expect(sentSystem.rules[0]?.effects[0]?.uuid).toBe("Item.companion-effect-1");
      // A world item has no owner, so pf2e never instantiates its rule elements —
      // nothing to read back.
      expect(result.warnings).toEqual([]);
    });

    it("creates a spellcastingEntry + spell pair with location.value linking, payloads pass through untouched", async () => {
      const { docClass, created } = fakeDocumentClass("Item", "item");
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      const entryResult = (await dispatchQuery("portal.create-item", {
        name: "Innate Spells",
        type: "spellcastingEntry",
        system: {
          tradition: { value: "arcane" },
          prepared: { value: "innate" },
          spelldc: { value: 18, dc: 28 },
        },
      })) as { id: string };

      await dispatchQuery("portal.create-item", {
        name: "Fireball",
        type: "spell",
        system: { location: { value: entryResult.id } },
      });

      expect(created[0]).toMatchObject({ name: "Innate Spells", type: "spellcastingEntry" });
      expect(created[1]).toMatchObject({
        name: "Fireball",
        type: "spell",
        system: { location: { value: entryResult.id } },
      });
    });

    it("pre-seeds rulesSelections under flags.pf2e.rulesSelections", async () => {
      const { docClass, created } = fakeDocumentClass("Item");
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      await dispatchQuery("portal.create-item", {
        name: "Ancestry Feat Grant",
        type: "feat",
        system: { rules: [{ key: "ChoiceSet" }] },
        rulesSelections: { "choice-set-1": "some-feat-slug" },
      });
      expect(created[0]).toMatchObject({
        flags: {
          pf2e: { rulesSelections: { "choice-set-1": "some-feat-slug" } },
          "astra-portal": { created: true, tool: "create-item" },
        },
      });
    });

    it("surfaces an ignored rule element as warnings[] when created embedded on an actor", async () => {
      const embedded = fakeItemEmbedded({
        0: [{ key: "FlatModifier" }, { key: "BadKey", ignored: true }],
      });
      const actor = {
        ...fakeDoc({ id: "a1", uuid: "Actor.a1", name: "Test NPC", documentName: "Actor" }),
        createEmbeddedDocuments: embedded.fn,
      };
      stubFoundry(true, { actors: [actor] });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-item", {
        name: "Weird Effect",
        type: "effect",
        system: { rules: [{ key: "FlatModifier" }, { key: "BadKey" }] },
        actorId: "a1",
      })) as { warnings: string[] };
      expect(result.warnings).toEqual([
        expect.stringContaining("rule element 1 (key: BadKey) was ignored at data-prep"),
      ]);
    });

    it("treats a missing `rules` property on the created item as no warnings (defensive)", async () => {
      const embedded = fakeItemEmbedded(); // no override -> item.rules is undefined
      const actor = {
        ...fakeDoc({ id: "a1", uuid: "Actor.a1", name: "Test NPC", documentName: "Actor" }),
        createEmbeddedDocuments: embedded.fn,
      };
      stubFoundry(true, { actors: [actor] });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-item", {
        name: "Mystery Effect",
        type: "effect",
        system: { rules: [{ key: "FlatModifier" }] },
        actorId: "a1",
      })) as { warnings: string[] };
      expect(result.warnings).toEqual([]);
    });

    it("rejects an unknown actorId with a typed not-found error", async () => {
      stubFoundry(true, { actors: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.create-item", {
        name: "X",
        type: "equipment",
        actorId: "no-such-actor",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.create-item", { name: "X", type: "equipment" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });

  describe("create-light (D-13/D-6)", () => {
    it("returns the embedded uuid, stamped, defaulting to the active scene", async () => {
      const embedded = fakeItemEmbedded();
      const scene = {
        ...fakeScene({ id: "sc1", name: "The Warren", active: true }),
        createEmbeddedDocuments: embedded.fn,
      };
      stubFoundry(true, { scenes: [scene] });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-light", {
        x: 100,
        y: 200,
        config: { bright: 20, dim: 40, color: "#ff8800", animation: { type: "torch" } },
      })) as { sceneId: string; lightUuid: string; warnings: string[] };

      expect(result).toMatchObject({
        sceneId: "sc1",
        lightUuid: "Scene.sc1.AmbientLight.item1",
        warnings: [],
      });
      expect(embedded.calls[0]?.embeddedName).toBe("AmbientLight");
      expect(embedded.calls[0]?.data[0]).toMatchObject({
        x: 100,
        y: 200,
        hidden: false,
        config: { bright: 20, dim: 40, color: "#ff8800", animation: { type: "torch" } },
        flags: { "astra-portal": { created: true, tool: "create-light" } },
      });
    });

    it("targets an explicit sceneId rather than the active scene", async () => {
      const embedded = fakeItemEmbedded();
      const active = fakeScene({ id: "sc1", name: "Active", active: true });
      const target = {
        ...fakeScene({ id: "sc2", name: "Idle Room", active: false }),
        createEmbeddedDocuments: embedded.fn,
      };
      stubFoundry(true, { scenes: [active, target] });
      registerHandlers();
      const result = (await dispatchQuery("portal.create-light", {
        sceneId: "sc2",
        x: 0,
        y: 0,
      })) as { sceneId: string };
      expect(result.sceneId).toBe("sc2");
    });

    it("rejects with a typed not-found error when no scene is active and no sceneId is given", async () => {
      stubFoundry(true, { scenes: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.create-light", { x: 0, y: 0 }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("rejects an unknown explicit sceneId with a typed not-found error", async () => {
      stubFoundry(true, { scenes: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.create-light", { sceneId: "nope", x: 0, y: 0 }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, {
        scenes: [fakeScene({ id: "sc1", name: "The Warren", active: true })],
        settings: { [SETTING_ALLOW_WRITES]: false },
      });
      registerHandlers();
      const err = await dispatchQuery("portal.create-light", { x: 0, y: 0 }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });

  describe("create-macro (D-6/D-9)", () => {
    it("creates a macro, NEVER executes it, and audits the full command text", async () => {
      const executeSpy = vi.fn();
      const macroDoc = {
        ...fakeDoc({
          id: "macro1",
          uuid: "Macro.macro1",
          name: "Portal Test Macro",
          documentName: "Macro",
        }),
        execute: executeSpy,
      };
      const docClass: FoundryDocumentClass = {
        createDocuments: () => Promise.resolve([macroDoc]),
        create: (data) => {
          macroDoc.toObject = () => data;
          return Promise.resolve(macroDoc);
        },
      };
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      // No embedded double-quotes: JSON.stringify (auditLog's serialization) would
      // escape them, and this test asserts the RAW command text is a substring of
      // the audit line — single quotes round-trip through JSON.stringify unescaped.
      const command = "ChatMessage.create({content: 'Hello from portal'});";
      const result = (await dispatchQuery("portal.create-macro", {
        name: "Portal Test Macro",
        macroType: "script",
        command,
      })) as { uuid: string; id: string; name: string; warnings: string[] };

      expect(result).toMatchObject({ name: "Portal Test Macro", warnings: [] });
      expect(executeSpy).not.toHaveBeenCalled();
      const auditedOk = logSpy.mock.calls.find(
        ([line]) =>
          typeof line === "string" &&
          line.includes("tool=create-macro") &&
          line.includes("outcome=ok"),
      );
      expect(auditedOk?.[0]).toContain(command);
      logSpy.mockRestore();
    });

    it("stamps the created macro", async () => {
      const { docClass, created } = fakeDocumentClass("Macro");
      stubFoundry(true, { getDocumentClass: () => docClass });
      registerHandlers();
      await dispatchQuery("portal.create-macro", {
        name: "Portal Test Macro",
        macroType: "chat",
        command: "hi",
      });
      expect(created[0]).toMatchObject({
        flags: { "astra-portal": { created: true, tool: "create-macro" } },
      });
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.create-macro", {
        name: "X",
        macroType: "chat",
        command: "hi",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });
});

describe("portal-module S3 authoring tools (spec 0026 S3 — Foundry-free)", () => {
  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
    // @ts-expect-error — same.
    delete globalThis.CONFIG;
    // @ts-expect-error — same.
    delete globalThis.fromUuid;
    // @ts-expect-error — same.
    delete globalThis.getDocumentClass;
    // @ts-expect-error — same.
    delete globalThis.foundry;
  });

  /** A pf2e-ConditionManager-backed fake actor (D-14): tracks condition state as a
   * local mutable array so a handler's increase/decrease/toggle/createEmbeddedDocuments
   * call and the subsequent read-back see one consistent world, with no real pf2e/
   * Foundry runtime. `calls` records which underlying method actually fired, so a
   * test can prove e.g. "increaseCondition was NEVER called for persistent-damage" —
   * the non-dialog path was taken instead. Persistent-damage creation is hardcoded to
   * always land as `{slug: "persistent-damage", active: true, value: null}`: the only
   * caller in this module is `createPersistentDamage`, which only ever touches that
   * one slug. */
  function fakeConditionActor(initial: FoundryConditionLike[] = []): FoundryActor & {
    calls: { increase: number; decrease: number; toggle: number; createEmbedded: number };
  } {
    const state: FoundryConditionLike[] = initial.map((c) => ({ ...c }));
    const calls = { increase: 0, decrease: 0, toggle: 0, createEmbedded: 0 };

    function upsert(slug: string, active: boolean, value: number | null): void {
      const idx = state.findIndex((c) => c.slug === slug);
      const entry = { slug, active, value };
      if (idx === -1) state.push(entry);
      else state[idx] = entry;
    }

    return {
      ...fakeDoc({ id: "a1", uuid: "Actor.a1", name: "Test NPC", documentName: "Actor" }),
      calls,
      get itemTypes() {
        return { condition: state };
      },
      increaseCondition: (slug: string, options?: { value?: number }) => {
        calls.increase += 1;
        const existing = state.find((c) => c.slug === slug && c.active);
        upsert(slug, true, (existing?.value ?? 0) + (options?.value ?? 1));
        return Promise.resolve(null);
      },
      decreaseCondition: (slug: string) => {
        calls.decrease += 1;
        const idx = state.findIndex((c) => c.slug === slug && c.active);
        if (idx !== -1) state.splice(idx, 1);
        return Promise.resolve();
      },
      toggleCondition: (slug: string) => {
        calls.toggle += 1;
        const idx = state.findIndex((c) => c.slug === slug && c.active);
        if (idx !== -1) state.splice(idx, 1);
        else state.push({ slug, active: true, value: null });
        return Promise.resolve();
      },
      createEmbeddedDocuments: (embeddedName: string, data: Record<string, unknown>[]) => {
        calls.createEmbedded += 1;
        upsert("persistent-damage", true, null);
        return fakeCreateEmbeddedDocuments(embeddedName, data);
      },
    };
  }

  describe("apply-condition (D-14)", () => {
    it("increases a valued condition from nothing, returning the resulting value", async () => {
      const actor = fakeConditionActor();
      stubFoundry(true, { actors: [actor] });
      registerHandlers();
      const result = (await dispatchQuery("portal.apply-condition", {
        actorId: "a1",
        slug: "frightened",
        action: "increase",
        value: 2,
      })) as { actorUuid: string; slug: string; active: boolean; value?: number };
      expect(result).toEqual({ actorUuid: "Actor.a1", slug: "frightened", active: true, value: 2 });
      expect(actor.calls.increase).toBe(1);
    });

    it("decreases a valued condition, reflecting the new value in the read-back", async () => {
      const actor = fakeConditionActor([{ slug: "frightened", active: true, value: 2 }]);
      stubFoundry(true, { actors: [actor] });
      registerHandlers();
      const result = (await dispatchQuery("portal.apply-condition", {
        actorId: "a1",
        slug: "frightened",
        action: "decrease",
      })) as { active: boolean };
      // This fake's decreaseCondition removes on any call (see helper) — proving the
      // wrapper dispatches to decreaseCondition at all, which is the S3 contract;
      // pf2e's own step-by-1 arithmetic is pf2e's problem, not this module's.
      expect(actor.calls.decrease).toBe(1);
      expect(result.active).toBe(false);
    });

    it("toggles a valueless condition on then off", async () => {
      const actor = fakeConditionActor();
      stubFoundry(true, { actors: [actor] });
      registerHandlers();
      const on = (await dispatchQuery("portal.apply-condition", {
        actorId: "a1",
        slug: "prone",
        action: "toggle",
      })) as { active: boolean };
      expect(on).toEqual({ actorUuid: "Actor.a1", slug: "prone", active: true });

      const off = (await dispatchQuery("portal.apply-condition", {
        actorId: "a1",
        slug: "prone",
        action: "toggle",
      })) as { active: boolean };
      expect(off.active).toBe(false);
      expect(actor.calls.toggle).toBe(2);
    });

    it("rejects an unknown actorId with a typed not-found error", async () => {
      stubFoundry(true, { actors: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.apply-condition", {
        actorId: "no-such-actor",
        slug: "prone",
        action: "toggle",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    describe("persistent-damage special case", () => {
      it("rejects increase without persistentDamage params, naming what's missing", async () => {
        const actor = fakeConditionActor();
        stubFoundry(true, { actors: [actor] });
        registerHandlers();
        const err = await dispatchQuery("portal.apply-condition", {
          actorId: "a1",
          slug: "persistent-damage",
          action: "increase",
        }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BridgeHandlerError);
        expect((err as BridgeHandlerError).code).toBe("validation-failed");
        expect((err as BridgeHandlerError).message).toContain("persistentDamage");
        expect(actor.calls.increase).toBe(0);
      });

      it("creates persistent damage via createEmbeddedDocuments, NEVER via increaseCondition (no dialog)", async () => {
        const actor = fakeConditionActor();
        stubFoundry(true, { actors: [actor] });
        registerHandlers();
        const result = (await dispatchQuery("portal.apply-condition", {
          actorId: "a1",
          slug: "persistent-damage",
          action: "increase",
          persistentDamage: { formula: "2d6", damageType: "fire", dc: 20 },
        })) as { active: boolean };

        expect(result.active).toBe(true);
        expect(actor.calls.increase).toBe(0); // the dialog-opening path was NEVER taken
        expect(actor.calls.createEmbedded).toBe(1);
      });

      it("stamps the created persistent-damage item (D-6)", async () => {
        const embedded = fakeItemEmbedded();
        const actor = { ...fakeConditionActor(), createEmbeddedDocuments: embedded.fn };
        stubFoundry(true, { actors: [actor] });
        registerHandlers();
        await dispatchQuery("portal.apply-condition", {
          actorId: "a1",
          slug: "persistent-damage",
          action: "increase",
          persistentDamage: { formula: "1d6", damageType: "bleed" },
        });
        expect(embedded.calls[0]?.data[0]).toMatchObject({
          system: { persistent: { formula: "1d6", damageType: "bleed" } },
          flags: { "astra-portal": { created: true, tool: "apply-condition" } },
        });
      });

      it("removes persistent damage via decreaseCondition (already non-dialog in pf2e itself)", async () => {
        const actor = fakeConditionActor([
          { slug: "persistent-damage", active: true, value: null },
        ]);
        stubFoundry(true, { actors: [actor] });
        registerHandlers();
        const result = (await dispatchQuery("portal.apply-condition", {
          actorId: "a1",
          slug: "persistent-damage",
          action: "decrease",
        })) as { active: boolean };
        expect(actor.calls.decrease).toBe(1);
        expect(actor.calls.increase).toBe(0);
        expect(result.active).toBe(false);
      });
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      const actor = fakeConditionActor();
      stubFoundry(true, { actors: [actor], settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.apply-condition", {
        actorId: "a1",
        slug: "prone",
        action: "toggle",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });

  describe("update-document (D-10)", () => {
    it("applies a dot-path update and returns the touched paths", async () => {
      const updateSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({ id: "a1", uuid: "Actor.a1", name: "Goblin", documentName: "Actor" }),
        update: updateSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      const result = (await dispatchQuery("portal.update-document", {
        uuid: "Actor.a1",
        updates: { "system.attributes.hp.value": 20 },
      })) as { uuid: string; updatedPaths?: string[] };
      expect(updateSpy).toHaveBeenCalledWith({ "system.attributes.hp.value": 20 });
      expect(result).toEqual({ uuid: "Actor.a1", updatedPaths: ["system.attributes.hp.value"] });
    });

    it("rejects a derived PC path on a character actor, naming the path", async () => {
      const updateSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({
          id: "p1",
          uuid: "Actor.p1",
          name: "Hero",
          documentName: "Actor",
          type: "character",
        }),
        update: updateSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      const err = await dispatchQuery("portal.update-document", {
        uuid: "Actor.p1",
        updates: { "system.saves.fortitude.value": 99 },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("validation-failed");
      expect((err as BridgeHandlerError).message).toContain("system.saves.fortitude.value");
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("does not false-positive on a segment-boundary near-miss (system.perceptionFoo)", async () => {
      const updateSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({
          id: "p1",
          uuid: "Actor.p1",
          name: "Hero",
          documentName: "Actor",
          type: "character",
        }),
        update: updateSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      await dispatchQuery("portal.update-document", {
        uuid: "Actor.p1",
        updates: { "system.perceptionFoo": 1 },
      });
      expect(updateSpy).toHaveBeenCalledWith({ "system.perceptionFoo": 1 });
    });

    it("allows the same derived-looking path on a non-character actor (NPC)", async () => {
      const updateSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({
          id: "n1",
          uuid: "Actor.n1",
          name: "Goblin",
          documentName: "Actor",
          type: "npc",
        }),
        update: updateSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      await dispatchQuery("portal.update-document", {
        uuid: "Actor.n1",
        updates: { "system.saves.fortitude.value": 12 },
      });
      expect(updateSpy).toHaveBeenCalledWith({ "system.saves.fortitude.value": 12 });
    });

    it("maps a DataModelValidationError from doc.update() to a typed validation-failed error", async () => {
      const doc = {
        ...fakeDoc({ id: "h1", uuid: "Actor.h1", name: "Trap", documentName: "Actor" }),
        update: () => Promise.reject(fakeDataModelValidationError("attributes.hp.value: invalid")),
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      const err = await dispatchQuery("portal.update-document", {
        uuid: "Actor.h1",
        updates: { "system.attributes.hp.value": -1 },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("validation-failed");
      expect((err as BridgeHandlerError).message).toBe("attributes.hp.value: invalid");
    });

    it("rejects an unresolvable uuid with a typed not-found error", async () => {
      stubFoundry(true, { fromUuid: () => Promise.resolve(null) });
      registerHandlers();
      const err = await dispatchQuery("portal.update-document", {
        uuid: "Actor.nope",
        updates: { "system.attributes.hp.value": 1 },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.update-document", {
        uuid: "Actor.a1",
        updates: { "system.attributes.hp.value": 1 },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });

  describe("delete-document (D-4)", () => {
    it("refuses to delete an unstamped (hand-authored) document", async () => {
      const deleteSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({ id: "a1", uuid: "Actor.a1", name: "Hand-made NPC", documentName: "Actor" }),
        delete: deleteSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      const err = await dispatchQuery("portal.delete-document", { uuid: "Actor.a1" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-portal-created");
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("deletes a portal-stamped world document", async () => {
      const deleteSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({
          id: "a1",
          uuid: "Actor.a1",
          name: "Portal NPC",
          documentName: "Actor",
          flags: {
            "astra-portal": { created: true, tool: "create-actor", ts: "2026-07-07T00:00:00.000Z" },
          },
        }),
        delete: deleteSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      const result = await dispatchQuery("portal.delete-document", { uuid: "Actor.a1" });
      expect(result).toEqual({ uuid: "Actor.a1", deleted: true });
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });

    it("deletes a portal-stamped embedded document (Scene.<id>.AmbientLight.<id>)", async () => {
      const deleteSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({
          id: "l1",
          uuid: "Scene.sc1.AmbientLight.l1",
          name: "Light",
          documentName: "AmbientLight",
          flags: {
            "astra-portal": { created: true, tool: "create-light", ts: "2026-07-07T00:00:00.000Z" },
          },
        }),
        delete: deleteSpy,
      };
      stubFoundry(true, { fromUuid: () => Promise.resolve(doc) });
      registerHandlers();
      const result = await dispatchQuery("portal.delete-document", {
        uuid: "Scene.sc1.AmbientLight.l1",
      });
      expect(result).toEqual({ uuid: "Scene.sc1.AmbientLight.l1", deleted: true });
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects an unresolvable uuid with a typed not-found error", async () => {
      stubFoundry(true, { fromUuid: () => Promise.resolve(null) });
      registerHandlers();
      const err = await dispatchQuery("portal.delete-document", { uuid: "Actor.nope" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("is denied with writes-disabled when the module setting is off", async () => {
      stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.delete-document", { uuid: "Actor.a1" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });

  describe("execute-macro (D-9)", () => {
    it("runs the macro and returns its captured (JSON-stringified) return value", async () => {
      const macro = {
        ...fakeDoc({ id: "m1", uuid: "Macro.m1", name: "Whisper Macro", documentName: "Macro" }),
        execute: () => Promise.resolve({ whispered: true }),
      };
      stubFoundry(true, { macros: [macro] });
      registerHandlers();
      const result = (await dispatchQuery("portal.execute-macro", { macroId: "m1" })) as {
        macroId: string;
        returned?: string;
      };
      expect(result.macroId).toBe("m1");
      expect(result.returned).toBe(JSON.stringify({ whispered: true }));
    });

    it("omits `returned` when the macro produces nothing", async () => {
      const macro = {
        ...fakeDoc({ id: "m1", uuid: "Macro.m1", name: "Chat Macro", documentName: "Macro" }),
        execute: () => Promise.resolve(undefined),
      };
      stubFoundry(true, { macros: [macro] });
      registerHandlers();
      const result = (await dispatchQuery("portal.execute-macro", { macroId: "m1" })) as {
        returned?: string;
      };
      expect(result.returned).toBeUndefined();
    });

    it("maps a throwing macro to a typed execution-failed error, message preserved", async () => {
      const macro = {
        ...fakeDoc({ id: "m1", uuid: "Macro.m1", name: "Boom Macro", documentName: "Macro" }),
        execute: () => Promise.reject(new Error("ReferenceError: foo is not defined")),
      };
      stubFoundry(true, { macros: [macro] });
      registerHandlers();
      const err = await dispatchQuery("portal.execute-macro", { macroId: "m1" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("execution-failed");
      expect((err as BridgeHandlerError).message).toBe("ReferenceError: foo is not defined");
    });

    it("rejects an unknown macroId with a typed not-found error", async () => {
      stubFoundry(true, { macros: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.execute-macro", { macroId: "no-such-macro" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("is refused via writes-disabled when JUST allow-macro-execution is off, naming that setting", async () => {
      const macro = {
        ...fakeDoc({ id: "m1", uuid: "Macro.m1", name: "Whisper Macro", documentName: "Macro" }),
        execute: () => Promise.resolve(undefined),
      };
      stubFoundry(true, { macros: [macro], settings: { [SETTING_ALLOW_MACRO_EXECUTION]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.execute-macro", { macroId: "m1" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
      expect((err as BridgeHandlerError).message).toContain("Allow macro execution");
    });

    it("leaves other writes unaffected when allow-macro-execution is off (update-document still works)", async () => {
      const updateSpy = vi.fn().mockResolvedValue(undefined);
      const doc = {
        ...fakeDoc({ id: "a1", uuid: "Actor.a1", name: "Goblin", documentName: "Actor" }),
        update: updateSpy,
      };
      stubFoundry(true, {
        fromUuid: () => Promise.resolve(doc),
        settings: { [SETTING_ALLOW_MACRO_EXECUTION]: false },
      });
      registerHandlers();
      await expect(
        dispatchQuery("portal.update-document", {
          uuid: "Actor.a1",
          updates: { "system.attributes.hp.value": 5 },
        }),
      ).resolves.toBeDefined();
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("is ALSO denied when allow-write-operations (the general write gate) is off", async () => {
      stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
      registerHandlers();
      const err = await dispatchQuery("portal.execute-macro", { macroId: "m1" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("writes-disabled");
    });
  });
});
