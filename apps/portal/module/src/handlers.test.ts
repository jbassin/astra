import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SETTING_ALLOW_MACRO_EXECUTION,
  SETTING_ALLOW_WRITES,
  SETTING_BRIDGE_USER_ID,
} from "./constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./handlers";

/** Loads one of the live-derived, committed test fixtures under `../tests/fixtures/`
 * (0028 S2 — real `Actor.toObject()` payloads pulled read-only through the live
 * bridge 2026-07-11: the party actor, Argyle's full 577 KB worst-case-scale sheet,
 * and the familiar Othello — see the fixtures dir for provenance). Same shape every
 * `get-document` result already carries: `{uuid, document}`. */
function loadFixture(name: "party" | "argyle" | "othello"): {
  uuid: string;
  document: Record<string, unknown>;
} {
  const path = fileURLToPath(new URL(`../tests/fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    uuid: string;
    document: Record<string, unknown>;
  };
}

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
  /** 0028 S3 (D28-5) — the pack's per-role visibility config; omit for a pack a
   * test never puts through the `query-item` compendium-visibility gate. */
  ownership?: FoundryCompendiumOwnership;
}): FoundryCompendiumCollection {
  return {
    collection: opts.collection,
    metadata: { type: opts.type, label: opts.label, system: opts.system },
    ownership: opts.ownership,
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
  /** 0028 S3 (D28-5) — the compendium collection key this doc "came from", for
   * `query-item`'s compendium branch (real Foundry's `Document#pack`); omit for a
   * world/embedded stand-in. */
  pack?: string;
}): FoundryActor {
  return {
    id: opts.id,
    uuid: opts.uuid,
    name: opts.name,
    documentName: opts.documentName,
    type: opts.type,
    flags: opts.flags,
    pack: opts.pack,
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
  /** 0027 S1 — this session's `game.user.id`/`.name`; override to simulate a
   * non-designated session under the `bridge-user-id` setting. */
  userId?: string;
  userName?: string;
  /** S5 — `getDocumentClass` per document type; see {@link fakeDocumentClass}. */
  getDocumentClass?: (documentName: string) => FoundryDocumentClass;
  /** 0026 S3 — `execute-macro`'s `game.macros.get` lookup. */
  macros?: FoundryMacro[];
  /** 0026 S3 — `apply-condition`'s persistent-damage non-dialog path
   * (`game.pf2e.ConditionManager.getCondition`); defaults to a stand-in returning a
   * bare `{system: {value: {value: null}}}` persistent-damage source, close enough to
   * real pf2e's compendium condition source for these Foundry-free tests. */
  conditionManager?: FoundryPf2eConditionManager;
  /** 0028 S2 — `query-party`'s owner-player-name resolution (`game.users.get`);
   * defaults to empty (no test before S2 needed a real `game.users` lookup). */
  users?: FoundryUser[];
  /** 0028 S3 — `query-rolls`' chat-message history (`game.messages`); defaults to
   * empty. `size` is derived from the array length, matching real Foundry's
   * `Collection#size` (a `Map` subclass). */
  messages?: FoundryChatMessage[];
}

/** Stubs the ambient Foundry globals `handlers.ts` touches (`game`, `CONFIG`,
 * `fromUuid`, `getDocumentClass`) — S3/S4/S5 are all Foundry-free, so these are plain
 * objects, not a real Foundry runtime. */
function stubFoundry(isGM: boolean, overrides: FoundryStubOverrides = {}): void {
  globalThis.game = {
    user: { id: overrides.userId ?? "gm1", name: overrides.userName ?? "GM", isGM },
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
    // 0027 S1 — dispatchQuery's designated-dialer re-check is a plain id comparison
    // against the settings value, never `game.users` (that resolvability lookup is
    // `main.ts`'s `ready`-hook concern, covered in `main.test.ts`) — an empty default
    // is enough there. 0028 S2's `query-party` owner-player resolution DOES read
    // `game.users.get`, hence the override.
    users: fakeValuesCollection(overrides.users ?? []),
    messages: {
      contents: overrides.messages ?? [],
      size: (overrides.messages ?? []).length,
    },
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

  it("dispatchQuery rejects with a typed not-designated error when bridge-user-id doesn't match this session (0027 S1)", async () => {
    stubFoundry(true, {
      userId: "gm1",
      settings: { [SETTING_BRIDGE_USER_ID]: "portal-bot" },
    });
    registerHandlers();
    const err = await dispatchQuery("portal.ping", undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("not-designated");
  });

  it("dispatchQuery dispatches normally when bridge-user-id matches this session (0027 S1)", async () => {
    stubFoundry(true, {
      userId: "portal-bot",
      settings: { [SETTING_BRIDGE_USER_ID]: "portal-bot" },
    });
    registerHandlers();
    await expect(dispatchQuery("portal.ping", undefined)).resolves.toEqual({
      pong: true,
      worldId: "faerrin",
      system: "pf2e",
    });
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

describe("portal-module 0028 S2 — query-party / query-player (Foundry-free)", () => {
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

  /** Builds a `FoundryActor` test double off a committed fixture — `toObject()`
   * returns the fixture's real stored source (items[] and all), and `.system`
   * defaults to that SAME stored `system` tree unless `liveSystem` overrides it. Real
   * Foundry's `system` on a live/prepared instance is a strict superset of the stored
   * source (derived fields merged in) — {@link liveSystemFor} builds a realistic
   * synthetic superset for the `stats`/`skills` tests, since the fixtures themselves
   * (captured via `toObject()`) provably lack every derived field (D28-2's whole
   * premise, verified: `system.abilities` is `null` in every one of them). */
  function fixtureActorDoc(
    name: "party" | "argyle" | "othello",
    liveSystem?: Record<string, unknown>,
  ): FoundryActor {
    const { uuid, document } = loadFixture(name);
    const rawSystem = document.system as Record<string, unknown>;
    return {
      ...fakeDoc({
        id: String(document._id),
        uuid,
        name: String(document.name),
        documentName: "Actor",
        type: String(document.type),
        data: document,
      }),
      system: liveSystem ? deepMergeObject(rawSystem, liveSystem) : rawSystem,
    };
  }

  /** A synthetic "live prepared actor" `system` tree — the derived fields D28-2's
   * `stats`/`skills` sections read, none of which any fixture's stored source ever
   * carries. Values are plausible but not real pf2e math (Foundry-free tests only
   * verify this module reads/renders the right PATHS, not pf2e's own arithmetic). */
  function liveDerivedSystem(): Record<string, unknown> {
    return {
      attributes: {
        ac: { value: 21 },
        classDC: { value: 27, rank: 3 },
        spellDC: { value: 28 },
      },
      perception: { value: 11, dc: 21 },
      saves: {
        fortitude: { value: 8, dc: 18 },
        reflex: { value: 6, dc: 16 },
        will: { value: 11, dc: 21 },
      },
      abilities: {
        str: { mod: 1 },
        dex: { mod: 2 },
        con: { mod: 1 },
        int: { mod: 0 },
        wis: { mod: 4 },
        cha: { mod: 1 },
      },
      skills: {
        religion: { label: "Religion", rank: 3, value: 12, dc: 22, lore: false },
        scribing: {
          label: "Scribing",
          rank: 2,
          value: 8,
          dc: 18,
          lore: true,
          itemId: "vfbDvpx13FUtGrcV",
        },
      },
    };
  }

  describe("query-party (D28-4)", () => {
    it("resolves the party actor by type (never hardcoded), splits PC vs companion rows", async () => {
      const partyDoc = fixtureActorDoc("party");
      const argyleDoc = fixtureActorDoc("argyle", {
        attributes: { hp: { value: 100, max: 120, temp: 0 } },
      });
      const othelloDoc = fixtureActorDoc("othello");
      const anzuDoc = fakeDoc({
        id: "W2dpWihnH1lli52S",
        uuid: "Actor.W2dpWihnH1lli52S",
        name: "Anzu",
        documentName: "Actor",
        type: "character",
      });
      const bennyDoc = fakeDoc({
        id: "OBLdOPi1IO09PVvg",
        uuid: "Actor.OBLdOPi1IO09PVvg",
        name: "Benny",
        documentName: "Actor",
        type: "character",
      });
      const johnnyDoc = fakeDoc({
        id: "mA7T7lD7Ku0qaDxN",
        uuid: "Actor.mA7T7lD7Ku0qaDxN",
        name: "Johnny",
        documentName: "Actor",
        type: "character",
      });
      const membersByUuid: Record<string, FoundryActor> = {
        "Actor.W2dpWihnH1lli52S": anzuDoc,
        "Actor.zpeNslKKrnaq07HI": argyleDoc,
        "Actor.OBLdOPi1IO09PVvg": bennyDoc,
        "Actor.mA7T7lD7Ku0qaDxN": johnnyDoc,
        "Actor.7VhBCByBPE7HRvWw": othelloDoc,
      };
      stubFoundry(true, {
        actors: [partyDoc, anzuDoc],
        users: [
          { id: "orAwNSgJQglrpRkr", name: "GM", isGM: true },
          { id: "pS0rW8VPRa3jClOc", name: "PlayerOne", isGM: false },
        ],
        fromUuid: (uuid) => Promise.resolve(membersByUuid[uuid] ?? null),
      });
      registerHandlers();

      const result = (await dispatchQuery("portal.query-party", {})) as {
        partyName?: string;
        pcs: Array<{
          name: string;
          level?: number;
          hp?: { value: number; max: number };
          ancestry?: string;
          className?: string;
          ownerPlayer?: string;
        }>;
        companions: Array<{ name: string; type: string; master?: string }>;
      };

      expect(result.partyName).toBe("The Party");
      expect(result.pcs.map((p) => p.name).sort()).toEqual(["Anzu", "Argyle", "Benny", "Johnny"]);
      const argyleRow = result.pcs.find((p) => p.name === "Argyle");
      expect(argyleRow).toMatchObject({
        level: 8,
        ancestry: "Elf",
        className: "Cleric",
        hp: { value: 100, max: 120 },
        ownerPlayer: "PlayerOne",
      });
      // Anzu/Benny/Johnny are minimal fakeDoc stand-ins with no system data at all —
      // fail-soft: absent fields render as `undefined`, never a throw.
      const anzuRow = result.pcs.find((p) => p.name === "Anzu");
      expect(anzuRow?.level).toBeUndefined();
      expect(anzuRow?.hp).toBeUndefined();

      expect(result.companions).toEqual([
        {
          uuid: "Actor.7VhBCByBPE7HRvWw",
          id: "7VhBCByBPE7HRvWw",
          name: "Othello",
          type: "familiar",
          master: "Anzu",
        },
      ]);
    });

    it("rejects with a typed not-found error when no party actor exists in the world", async () => {
      stubFoundry(true, { actors: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.query-party", {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("unions members across multiple party actors (pf2e allows more than one)", async () => {
      const partyA = fakeDoc({
        id: "partyA",
        uuid: "Actor.partyA",
        name: "Party A",
        documentName: "Actor",
        type: "party",
        data: { system: { details: { members: [{ uuid: "Actor.pc1" }] } } },
      });
      const partyB = fakeDoc({
        id: "partyB",
        uuid: "Actor.partyB",
        name: "Party B",
        documentName: "Actor",
        type: "party",
        data: { system: { details: { members: [{ uuid: "Actor.pc2" }] } } },
      });
      const pc1 = fakeDoc({
        id: "pc1",
        uuid: "Actor.pc1",
        name: "PC One",
        documentName: "Actor",
        type: "character",
      });
      const pc2 = fakeDoc({
        id: "pc2",
        uuid: "Actor.pc2",
        name: "PC Two",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, {
        actors: [partyA, partyB],
        fromUuid: (uuid) =>
          Promise.resolve(uuid === "Actor.pc1" ? pc1 : uuid === "Actor.pc2" ? pc2 : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-party", {})) as {
        pcs: Array<{ name: string }>;
      };
      expect(result.pcs.map((p) => p.name).sort()).toEqual(["PC One", "PC Two"]);
    });

    it("skips a stale member uuid that no longer resolves, without failing the whole roster", async () => {
      const partyDoc = fakeDoc({
        id: "p1",
        uuid: "Actor.p1",
        name: "The Party",
        documentName: "Actor",
        type: "party",
        data: { system: { details: { members: [{ uuid: "Actor.gone" }, { uuid: "Actor.pc1" }] } } },
      });
      const pc1 = fakeDoc({
        id: "pc1",
        uuid: "Actor.pc1",
        name: "PC One",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, {
        actors: [partyDoc],
        fromUuid: (uuid) => Promise.resolve(uuid === "Actor.pc1" ? pc1 : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-party", {})) as {
        pcs: Array<{ name: string }>;
      };
      expect(result.pcs.map((p) => p.name)).toEqual(["PC One"]);
    });
  });

  describe("S4 live-gate regressions: source-vs-live field ownership", () => {
    it("summary hero points come from the STORED source, not the zeroed live tree", async () => {
      // pf2e's data preparation leaves live system.resources.heroPoints at 0/0 —
      // hero points are GM-awarded meta-currency stored in source ({1,3} in the
      // fixture). Rendered 0/0 live at the S4 gate while the party row said 1/3.
      const argyleDoc = fixtureActorDoc("argyle", {
        resources: { heroPoints: { value: 0, max: 0 } },
      });
      stubFoundry(true, { actors: [argyleDoc] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        name: "Argyle",
        section: "summary",
      })) as { heroPoints?: { value: number; max: number } };
      expect(result.heroPoints).toEqual({ value: 1, max: 3 });
    });

    it("summary master resolves to the master's NAME like the party companion row", async () => {
      const othelloDoc = fixtureActorDoc("othello");
      const raw = othelloDoc.toObject();
      const masterId = String(
        ((raw.system as Record<string, unknown>).master as Record<string, unknown>).id,
      );
      const anzu = fakeDoc({
        id: masterId,
        uuid: `Actor.${masterId}`,
        name: "Anzu",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, { actors: [othelloDoc, anzu] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        name: "Othello",
        section: "summary",
      })) as { master?: string };
      expect(result.master).toBe("Anzu");
    });

    it("spells entry DC prefers the LIVE embedded entry's derived spelldc.dc over source 0", async () => {
      const argyleDoc = fixtureActorDoc("argyle");
      const raw = argyleDoc.toObject();
      const items = raw.items as Array<Record<string, unknown>>;
      const entry = items.find((i) => i.type === "spellcastingEntry");
      const entryId = String(entry?._id);
      const liveEntry = {
        ...fakeDoc({
          id: entryId,
          uuid: `Actor.${argyleDoc.id}.Item.${entryId}`,
          name: String(entry?.name),
          documentName: "Item",
          type: "spellcastingEntry",
        }),
        system: { spelldc: { dc: 26 } },
      };
      const docWithItems = {
        ...argyleDoc,
        items: { get: (id: string) => (id === entryId ? liveEntry : undefined) },
      };
      stubFoundry(true, { actors: [docWithItems] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        name: "Argyle",
        section: "spells",
      })) as { entries: Array<{ entryName: string; dc?: number }> };
      const target = result.entries.find((e) => e.entryName === String(entry?.name));
      expect(target?.dc).toBe(26);
    });
  });

  describe("query-player resolution + predicate (D28-4/D28-13)", () => {
    it("resolves by uuid", async () => {
      const argyleDoc = fixtureActorDoc("argyle");
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === argyleDoc.uuid ? argyleDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: argyleDoc.uuid,
        section: "summary",
      })) as { name: string };
      expect(result.name).toBe("Argyle");
    });

    it("resolves a bare world actor id (not a full uuid) the same way", async () => {
      const argyleDoc = fixtureActorDoc("argyle");
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === argyleDoc.uuid ? argyleDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: "zpeNslKKrnaq07HI",
        section: "summary",
      })) as { name: string };
      expect(result.name).toBe("Argyle");
    });

    it("resolves by case-insensitive exact name", async () => {
      const argyleDoc = fixtureActorDoc("argyle");
      stubFoundry(true, { actors: [argyleDoc] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        name: "argyle",
        section: "summary",
      })) as { name: string };
      expect(result.name).toBe("Argyle");
    });

    it("resolves an unambiguous name prefix", async () => {
      const argyleDoc = fixtureActorDoc("argyle");
      stubFoundry(true, { actors: [argyleDoc] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        name: "Arg",
        section: "summary",
      })) as { name: string };
      expect(result.name).toBe("Argyle");
    });

    it("rejects an ambiguous name with a typed ambiguous-name error listing candidates", async () => {
      const argyle = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
      });
      const argyleTwin = fakeDoc({
        id: "a2",
        uuid: "Actor.a2",
        name: "Argyle Twin",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, { actors: [argyle, argyleTwin] });
      registerHandlers();
      const err = await dispatchQuery("portal.query-player", {
        name: "Arg",
        section: "summary",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("ambiguous-name");
      expect((err as BridgeHandlerError).message).toContain("Argyle");
      expect((err as BridgeHandlerError).message).toContain("Argyle Twin");
    });

    it("rejects a not-found name with a typed not-found error", async () => {
      stubFoundry(true, { actors: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.query-player", {
        name: "Nobody",
        section: "summary",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it.each(["npc", "party", "loot"])(
      "rejects a resolved %s actor with a typed not-a-player-character error",
      async (type) => {
        const doc = fakeDoc({
          id: "x1",
          uuid: "Actor.x1",
          name: "Some Thing",
          documentName: "Actor",
          type,
        });
        stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
        registerHandlers();
        const err = await dispatchQuery("portal.query-player", {
          uuid: doc.uuid,
          section: "summary",
        }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BridgeHandlerError);
        expect((err as BridgeHandlerError).code).toBe("not-a-player-character");
        expect((err as BridgeHandlerError).message).toContain(type);
      },
    );

    it("accepts a familiar, with the master's id surfaced on the summary section", async () => {
      const othelloDoc = fixtureActorDoc("othello");
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === othelloDoc.uuid ? othelloDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: othelloDoc.uuid,
        section: "summary",
      })) as { name: string; actorType: string; master?: string; hp?: { value: number } };
      expect(result).toMatchObject({
        name: "Othello",
        actorType: "familiar",
        master: "W2dpWihnH1lli52S",
      });
      expect(result.hp?.value).toBe(7);
    });
  });

  describe("query-player stats section (D28-2 derived projection)", () => {
    it("reads every derived path off the LIVE system, never toObject()'s stored source", async () => {
      const doc = fixtureActorDoc("argyle", liveDerivedSystem());
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "stats",
      })) as {
        ac?: number;
        perception: { value?: number; dc?: number };
        saves: Array<{ type: string; value?: number; dc?: number }>;
        abilityMods: Record<string, number>;
        classDC: { value?: number; rank?: number };
        spellDC: { value?: number };
        warnings: string[];
      };
      expect(result.ac).toBe(21);
      expect(result.perception).toEqual({ value: 11, dc: 21 });
      expect(result.saves).toEqual([
        { type: "fortitude", value: 8, dc: 18 },
        { type: "reflex", value: 6, dc: 16 },
        { type: "will", value: 11, dc: 21 },
      ]);
      expect(result.abilityMods).toEqual({ str: 1, dex: 2, con: 1, int: 0, wis: 4, cha: 1 });
      expect(result.classDC).toEqual({ value: 27, rank: 3 });
      expect(result.spellDC).toEqual({ value: 28 });
      expect(result.warnings).toEqual([]);
    });

    it("fails soft per field when the live actor carries no `system` at all — never throws", async () => {
      const bareDoc = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Bare",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === bareDoc.uuid ? bareDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: bareDoc.uuid,
        section: "stats",
      })) as {
        ac?: number;
        perception: { value?: number; dc?: number };
        classDC: { value?: number };
        warnings: string[];
      };
      expect(result.ac).toBeUndefined();
      expect(result.perception).toEqual({ value: undefined, dc: undefined });
      expect(result.classDC.value).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("attributes.ac.value"))).toBe(true);
    });

    it("fails soft per field when only SOME derived paths are present", async () => {
      const doc = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Partial",
        documentName: "Actor",
        type: "character",
      });
      const partial = { ...doc, system: { attributes: { ac: { value: 18 } } } };
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === partial.uuid ? partial : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: partial.uuid,
        section: "stats",
      })) as { ac?: number; perception: { value?: number }; warnings: string[] };
      expect(result.ac).toBe(18);
      expect(result.perception.value).toBeUndefined();
      expect(result.warnings.some((w) => w.includes("perception.value"))).toBe(true);
    });
  });

  describe("query-player skills section", () => {
    it("returns per-skill rank + total, lore skills included", async () => {
      const doc = fixtureActorDoc("argyle", liveDerivedSystem());
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "skills",
      })) as {
        skills: Array<{ slug: string; rank?: number; value?: number; dc?: number; lore: boolean }>;
      };
      expect(result.skills).toEqual(
        expect.arrayContaining([
          { slug: "religion", label: "Religion", rank: 3, value: 12, dc: 22, lore: false },
          {
            slug: "scribing",
            label: "Scribing",
            rank: 2,
            value: 8,
            dc: 18,
            lore: true,
          },
        ]),
      );
    });
  });

  describe("query-player spells section (D28-11) — real Argyle-scale fixture", () => {
    it("groups by spellcasting entry then rank, slot rank overrides the spell's own innate rank", async () => {
      const doc = fixtureActorDoc("argyle");
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "spells",
      })) as {
        entries: Array<{
          entryId: string;
          entryName: string;
          tradition?: string;
          ranks: Array<{
            rank: number;
            slots?: { value: number; max: number };
            spells: Array<{
              id: string;
              name: string;
              rank: number;
              prepared?: boolean;
              expended?: boolean;
            }>;
          }>;
        }>;
      };
      expect(result.entries.map((e) => e.entryName).sort()).toEqual([
        "Cleric Font",
        "Cleric Spells",
      ]);
      const clericSpells = result.entries.find((e) => e.entryId === "IurrECIEo4RFGgVB");
      expect(clericSpells?.tradition).toBe("divine");
      const cantrips = clericSpells?.ranks.find((r) => r.rank === 0);
      expect(cantrips?.slots).toEqual({ value: 0, max: 5 });
      // "Vitality Lash" has an own/innate level.value of 1, but it's prepared into
      // slot0 — the SLOT rank (0, a cantrip) must win, not the spell's own rank.
      const vitalityLash = cantrips?.spells.find((s) => s.id === "MjW0Dvzfk4g6TeZn");
      expect(vitalityLash).toMatchObject({
        name: "Vitality Lash",
        rank: 0,
        prepared: true,
        expended: false,
      });
    });

    it("the entry filter narrows to one spellcasting entry", async () => {
      const doc = fixtureActorDoc("argyle");
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "spells",
        entry: "Cleric Font",
      })) as { entries: Array<{ entryName: string }> };
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.entryName).toBe("Cleric Font");
    });

    it("the rank filter narrows every entry to one rank", async () => {
      const doc = fixtureActorDoc("argyle");
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "spells",
        rank: 0,
      })) as { entries: Array<{ ranks: Array<{ rank: number }> }> };
      for (const entry of result.entries) {
        for (const rankGroup of entry.ranks) expect(rankGroup.rank).toBe(0);
      }
    });
  });

  describe("query-player feats/inventory/notes sections — real Argyle-scale fixture", () => {
    it("feats: 39 feats present, grouped/sorted by category then level", async () => {
      const doc = fixtureActorDoc("argyle");
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "feats",
      })) as { feats: Array<{ name: string; category: string; level?: number }> };
      expect(result.feats).toHaveLength(39);
      for (let i = 1; i < result.feats.length; i++) {
        const prev = result.feats[i - 1] as { category: string; level?: number };
        const cur = result.feats[i] as { category: string; level?: number };
        expect(cur.category >= prev.category).toBe(true);
      }
    });

    it("inventory: physical items only, runes summarized", async () => {
      const doc = fixtureActorDoc("argyle");
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "inventory",
      })) as { items: Array<{ name: string; type: string }> };
      // 4 weapon + 4 equipment + 2 consumable + 1 ammo + 1 shield + 1 armor = 13 —
      // spells/feats/ancestry/class/deity/background/lore never leak into inventory.
      expect(result.items).toHaveLength(13);
      expect(result.items.every((i) => i.type !== "spell" && i.type !== "feat")).toBe(true);
    });

    it("notes: non-empty biography fields surfaced, empty ones omitted", async () => {
      const doc = fixtureActorDoc("argyle");
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "notes",
      })) as { deity?: string; appearance?: string; backstory?: string };
      // Argyle's fixture biography is entirely empty strings (a real, unfilled-in
      // sheet) — every prose field must be omitted, never rendered as "".
      expect(result.appearance).toBeUndefined();
      expect(result.backstory).toBeUndefined();
      expect(result.deity).toBe("The Judge of Ages");
    });

    it("notes: a GM-hidden biography subsection (visibility flag false) is excluded even though it has content (S2 amendment)", async () => {
      // Argyle's OWN fixture biography.visibility is the template.json default
      // ({appearance:true, backstory:false, personality:false, campaign:false}) —
      // build a synthetic doc with every subsection FILLED IN to prove the gate,
      // not just the "empty string omitted" case the prior test already covers.
      const doc = fixtureActorDoc("argyle", undefined);
      const raw = doc.toObject();
      raw.system = {
        ...(raw.system as Record<string, unknown>),
        details: {
          ...((raw.system as Record<string, unknown>).details as Record<string, unknown>),
          biography: {
            appearance: "Tall and gaunt.",
            backstory: "Raised in the Cathedral.",
            likes: "Quiet mornings.",
            dislikes: "Loud noises.",
            campaignNotes: "Owes a debt to the Judge.",
            visibility: { appearance: true, backstory: false, personality: false, campaign: false },
          },
        },
      };
      const gatedDoc: FoundryActor = { ...doc, toObject: () => raw };
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === gatedDoc.uuid ? gatedDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: gatedDoc.uuid,
        section: "notes",
      })) as {
        appearance?: string;
        backstory?: string;
        likes?: string;
        dislikes?: string;
        campaignNotes?: string;
      };
      // appearance's visibility flag is true -> surfaced.
      expect(result.appearance).toBe("Tall and gaunt.");
      // backstory/personality(likes+dislikes)/campaign are all false -> excluded,
      // even though every one of them has real, non-empty content.
      expect(result.backstory).toBeUndefined();
      expect(result.likes).toBeUndefined();
      expect(result.dislikes).toBeUndefined();
      expect(result.campaignNotes).toBeUndefined();
    });

    it("notes: an explicitly-toggled-visible subsection (GM flipped the eye icon) is surfaced", async () => {
      const doc = fixtureActorDoc("argyle", undefined);
      const raw = doc.toObject();
      raw.system = {
        ...(raw.system as Record<string, unknown>),
        details: {
          ...((raw.system as Record<string, unknown>).details as Record<string, unknown>),
          biography: {
            backstory: "Raised in the Cathedral.",
            visibility: { appearance: true, backstory: true, personality: false, campaign: false },
          },
        },
      };
      const gatedDoc: FoundryActor = { ...doc, toObject: () => raw };
      stubFoundry(true, {
        fromUuid: (uuid) => Promise.resolve(uuid === gatedDoc.uuid ? gatedDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: gatedDoc.uuid,
        section: "notes",
      })) as { backstory?: string };
      expect(result.backstory).toBe("Raised in the Cathedral.");
    });

    it("notes: a legacy actor with no visibility object at all falls back to the template.json defaults (fail-soft)", async () => {
      const doc = fakeDoc({
        id: "legacy1",
        uuid: "Actor.legacy1",
        name: "Legacy PC",
        documentName: "Actor",
        type: "character",
        data: {
          _id: "legacy1",
          name: "Legacy PC",
          type: "character",
          system: {
            details: {
              biography: {
                appearance: "Weathered.",
                campaignNotes: "Some old note.",
                // No `visibility` key at all — pre-dates the field.
              },
            },
          },
          items: [],
        },
      });
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        uuid: doc.uuid,
        section: "notes",
      })) as { appearance?: string; campaignNotes?: string };
      // appearance defaults VISIBLE (template.json), campaign defaults HIDDEN.
      expect(result.appearance).toBe("Weathered.");
      expect(result.campaignNotes).toBeUndefined();
    });
  });
});

describe("portal-module 0028 S3 — query-item (D28-5/D28-13, Foundry-free)", () => {
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

  function worldItem(opts: {
    id: string;
    name: string;
    type?: string;
    ownershipDefault?: number;
  }): FoundryActor {
    return fakeDoc({
      id: opts.id,
      uuid: `Item.${opts.id}`,
      name: opts.name,
      documentName: "Item",
      type: opts.type ?? "weapon",
      data: {
        _id: opts.id,
        name: opts.name,
        type: opts.type ?? "weapon",
        system: { description: { value: "<p>A fine item.</p>" }, price: { value: { gp: 4 } } },
        ownership: { default: opts.ownershipDefault ?? 2 },
      },
    });
  }

  describe("world items", () => {
    it("fetches a visible world item by uuid with the full detail projection", async () => {
      const item = worldItem({ id: "w1", name: "Bastard Sword", ownershipDefault: 2 });
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === item.uuid ? item : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { uuid: "Item.w1" })) as {
        kind: string;
        item: { name: string; provenance: string; price?: string; description?: string };
      };
      expect(result.kind).toBe("item");
      expect(result.item).toMatchObject({
        name: "Bastard Sword",
        provenance: "world",
        price: "4 gp",
        description: "<p>A fine item.</p>",
      });
    });

    it("resolves a bare id the same way as a full uuid", async () => {
      const item = worldItem({ id: "w1", name: "Bastard Sword" });
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === item.uuid ? item : null) });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { uuid: "w1" })) as {
        item: { name: string };
      };
      expect(result.item.name).toBe("Bastard Sword");
    });

    it("excludes a GM-hidden world item (ownership.default < OBSERVER) as a typed not-found", async () => {
      const item = worldItem({ id: "hidden1", name: "Secret Dagger", ownershipDefault: 0 });
      stubFoundry(true, { fromUuid: (uuid) => Promise.resolve(uuid === item.uuid ? item : null) });
      registerHandlers();
      const err = await dispatchQuery("portal.query-item", { uuid: "Item.hidden1" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("excludes a GM-hidden world item from a name search too", async () => {
      const visible = worldItem({ id: "v1", name: "Dagger of Speaking", ownershipDefault: 2 });
      const hidden = worldItem({ id: "h1", name: "Dagger of Secrets", ownershipDefault: 0 });
      stubFoundry(true, { items: [visible, hidden] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { name: "Dagger" })) as {
        hits: Array<{ name: string }>;
      };
      expect(result.hits.map((h) => h.name)).toEqual(["Dagger of Speaking"]);
    });
  });

  describe("party-member-embedded items", () => {
    function partyWithMember(memberUuid: string): FoundryActor {
      return fakeDoc({
        id: "party1",
        uuid: "Actor.party1",
        name: "The Party",
        documentName: "Actor",
        type: "party",
        data: { system: { details: { members: [{ uuid: memberUuid }] } } },
      });
    }

    it("fetches an embedded item on a party member by its Actor.<id>.Item.<id> uuid", async () => {
      const memberDoc = fakeDoc({
        id: "pc1",
        uuid: "Actor.pc1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
        data: {
          items: [
            { _id: "i1", name: "Holy Symbol", type: "equipment", system: { bulk: { value: 0 } } },
          ],
        },
      });
      const party = partyWithMember("Actor.pc1");
      const embeddedUuid = "Actor.pc1.Item.i1";
      stubFoundry(true, {
        actors: [party, memberDoc],
        fromUuid: (uuid) =>
          Promise.resolve(
            uuid === embeddedUuid
              ? fakeDoc({
                  id: "i1",
                  uuid: embeddedUuid,
                  name: "Holy Symbol",
                  documentName: "Item",
                  type: "equipment",
                  data: { _id: "i1", name: "Holy Symbol", type: "equipment", system: {} },
                })
              : uuid === "Actor.pc1"
                ? memberDoc
                : null,
          ),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { uuid: embeddedUuid })) as {
        item: { name: string; provenance: string; ownerActor?: string };
      };
      expect(result.item).toMatchObject({
        name: "Holy Symbol",
        provenance: "embedded",
        ownerActor: "Argyle",
      });
    });

    it("refuses an Actor.<id>.Item.<id> uuid when that actor is NOT a party member", async () => {
      stubFoundry(true, { actors: [] }); // no party at all
      registerHandlers();
      const err = await dispatchQuery("portal.query-item", {
        uuid: "Actor.someNpc.Item.i1",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("name search finds an embedded item and labels its owner", async () => {
      const memberDoc = fakeDoc({
        id: "pc1",
        uuid: "Actor.pc1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
        data: {
          items: [{ _id: "i1", name: "Sunrod", type: "equipment" }],
        },
      });
      const party = partyWithMember("Actor.pc1");
      stubFoundry(true, {
        actors: [party],
        fromUuid: (uuid) => Promise.resolve(uuid === "Actor.pc1" ? memberDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { name: "Sunrod" })) as {
        hits: Array<{ name: string; provenance: string; ownerActor?: string; uuid: string }>;
      };
      expect(result.hits).toEqual([
        {
          uuid: "Actor.pc1.Item.i1",
          id: "i1",
          name: "Sunrod",
          type: "equipment",
          provenance: "embedded",
          ownerActor: "Argyle",
        },
      ]);
    });
  });

  describe("compendium items (D28-5 pack-visibility gate, adversarial B2)", () => {
    function compendiumItemDoc(id: string, name: string, pack: string): FoundryActor {
      return fakeDoc({
        id,
        uuid: `Compendium.${pack}.Item.${id}`,
        name,
        documentName: "Item",
        type: "spell",
        pack,
        data: {
          _id: id,
          name,
          type: "spell",
          system: { description: { value: "<p>Zap.</p>" } },
        },
      });
    }

    it("fetches a compendium item from a PLAYER-visible pack (ownership.PLAYER >= OBSERVER)", async () => {
      const pack = fakePack({
        collection: "pf2e.spells-srd",
        type: "Item",
        label: "Spells",
        ownership: { PLAYER: "OBSERVER" },
      });
      const doc = compendiumItemDoc("s1", "Magic Missile", "pf2e.spells-srd");
      stubFoundry(true, {
        packs: [pack],
        fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { uuid: doc.uuid })) as {
        item: { name: string; provenance: string; pack?: string };
      };
      expect(result.item).toMatchObject({
        name: "Magic Missile",
        provenance: "compendium",
        pack: "pf2e.spells-srd",
      });
    });

    it("refuses a compendium item from a PLAYER-restricted pack (ownership.PLAYER = LIMITED, below OBSERVER) as not-found", async () => {
      // The real live-pf2e default for bestiary packs (verified 2026-07-11:
      // 67/94 packs ship exactly this — LIMITED(1) < OBSERVER(2)).
      const pack = fakePack({
        collection: "pf2e.pathfinder-bestiary",
        type: "Item",
        label: "Bestiary",
        ownership: { PLAYER: "LIMITED" },
      });
      const doc = compendiumItemDoc("s1", "Secret Ritual", "pf2e.pathfinder-bestiary");
      stubFoundry(true, {
        packs: [pack],
        fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null),
      });
      registerHandlers();
      const err = await dispatchQuery("portal.query-item", { uuid: doc.uuid }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("a pack with no ownership config at all (undefined) fails CLOSED, not open", async () => {
      const pack = fakePack({
        collection: "pf2e.unconfigured",
        type: "Item",
        label: "Unconfigured",
      });
      const doc = compendiumItemDoc("s1", "Mystery Item", "pf2e.unconfigured");
      stubFoundry(true, {
        packs: [pack],
        fromUuid: (uuid) => Promise.resolve(uuid === doc.uuid ? doc : null),
      });
      registerHandlers();
      const err = await dispatchQuery("portal.query-item", { uuid: doc.uuid }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("not-found");
    });

    it("name search excludes hits from a player-restricted pack, includes hits from a visible one", async () => {
      const visiblePack = fakePack({
        collection: "pf2e.spells-srd",
        type: "Item",
        label: "Spells",
        ownership: { PLAYER: "OBSERVER" },
        entries: [
          {
            _id: "s1",
            uuid: "Compendium.pf2e.spells-srd.Item.s1",
            name: "Fireball",
            type: "spell",
          },
        ],
      });
      const hiddenPack = fakePack({
        collection: "pf2e.pathfinder-bestiary",
        type: "Item",
        label: "Bestiary",
        ownership: { PLAYER: "LIMITED" },
        entries: [
          {
            _id: "s2",
            uuid: "Compendium.pf2e.pathfinder-bestiary.Item.s2",
            name: "Fireball Trap",
            type: "hazard",
          },
        ],
      });
      stubFoundry(true, { packs: [visiblePack, hiddenPack] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { name: "Fireball" })) as {
        hits: Array<{ name: string }>;
      };
      expect(result.hits.map((h) => h.name)).toEqual(["Fireball"]);
    });

    it("a pack of the wrong document type (not Item) is never searched", async () => {
      const actorPack = fakePack({
        collection: "pf2e.pathfinder-bestiary",
        type: "Actor",
        label: "Bestiary",
        ownership: { PLAYER: "OBSERVER" },
        entries: [
          {
            _id: "a1",
            uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.a1",
            name: "Goblin",
            type: "npc",
          },
        ],
      });
      stubFoundry(true, { packs: [actorPack] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { name: "Goblin" })) as {
        hits: unknown[];
      };
      expect(result.hits).toEqual([]);
    });
  });

  describe("name search — cross-scope, provenance-labeled hit list (D28-5)", () => {
    it("never renders a single item, even for an unambiguous single hit — always a hit list", async () => {
      const item = worldItem({ id: "w1", name: "Unique Amulet" });
      stubFoundry(true, { items: [item] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", { name: "Unique Amulet" })) as {
        kind: string;
        hits?: unknown[];
      };
      expect(result.kind).toBe("hits");
      expect(result.hits).toHaveLength(1);
    });

    it("respects the limit param", async () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        worldItem({ id: `w${i}`, name: `Dagger ${i}` }),
      );
      stubFoundry(true, { items });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-item", {
        name: "Dagger",
        limit: 2,
      })) as { hits: unknown[] };
      expect(result.hits).toHaveLength(2);
    });
  });
});

describe("portal-module 0028 S3 — query-rolls (D28-3/D28-10/D28-12, Foundry-free)", () => {
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

  function fakeRollJson(opts: {
    formula: string;
    total: number;
    dice?: Array<{ faces: number; results: Array<{ result: number; discarded?: boolean }> }>;
  }): string {
    const terms = (opts.dice ?? []).map((d) => ({
      class: "Die",
      faces: d.faces,
      number: d.results.length,
      results: d.results.map((r) => ({
        result: r.result,
        active: r.discarded !== true,
        discarded: r.discarded === true,
      })),
    }));
    return JSON.stringify({
      class: "Roll",
      formula: opts.formula,
      total: opts.total,
      evaluated: true,
      terms,
    });
  }

  function fakeMessage(opts: {
    id: string;
    timestamp: number;
    whisper?: string[];
    blind?: boolean;
    speaker?: { actor?: string; alias?: string };
    rolls?: Array<string | object>;
    flavor?: string;
    flags?: Record<string, unknown>;
  }): FoundryChatMessage {
    return {
      id: opts.id,
      timestamp: opts.timestamp,
      speaker: opts.speaker,
      whisper: opts.whisper ?? [],
      blind: opts.blind ?? false,
      rolls: opts.rolls ?? [],
      flavor: opts.flavor,
      flags: opts.flags,
    };
  }

  const PUBLIC_CHECK_ROLL = fakeRollJson({
    formula: "1d20+7",
    total: 21,
    dice: [{ faces: 20, results: [{ result: 14 }] }],
  });

  describe("S4 live-gate regression: hydrated Roll instances (not JSON strings)", () => {
    it("builds a row from a LIVE message whose rolls[] are Roll INSTANCES", async () => {
      // Live `game.messages` documents hydrate `rolls` into Roll instances whose
      // toJSON() restores the stored shape — found live at the 0028 S4 gate, where
      // every page row silently failed to build (rows=0, hasMore=true).
      const instance = {
        toJSON: () =>
          JSON.parse(
            fakeRollJson({
              formula: "1d20+5",
              total: 19,
              dice: [{ faces: 20, results: [{ result: 14 }] }],
            }),
          ) as object,
      };
      const msg = fakeMessage({ id: "live1", timestamp: 1000, rolls: [instance] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ formula: string; total: number }>;
      };
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.formula).toBe("1d20+5");
      expect(result.rows[0]?.total).toBe(19);
    });
  });

  describe("D28-3 privacy filter (public-only, non-negotiable)", () => {
    it("a whispered message never appears, regardless of other filters", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        whisper: ["user1"],
        rolls: [PUBLIC_CHECK_ROLL],
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toEqual([]);
    });

    it("a blind message never appears", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        blind: true,
        rolls: [PUBLIC_CHECK_ROLL],
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toEqual([]);
    });

    it("THE B1 backstop — whisper=[] and blind=false but flags.pf2e.context.secret=true is still excluded", async () => {
      const secretMsg = fakeMessage({
        id: "secret1",
        timestamp: 1000,
        whisper: [],
        blind: false,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "skill-check", secret: true } } },
      });
      const publicMsg = fakeMessage({
        id: "public1",
        timestamp: 2000,
        whisper: [],
        blind: false,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "skill-check" } } },
      });
      stubFoundry(true, { messages: [secretMsg, publicMsg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["public1"]);
    });

    it("a non-roll message (rolls.length === 0) never qualifies even if otherwise public", async () => {
      const chatter = fakeMessage({ id: "chat1", timestamp: 1000, rolls: [] });
      stubFoundry(true, { messages: [chatter] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toEqual([]);
    });
  });

  describe("row shape (D28-12)", () => {
    it("renders formula/total/dice/checkName/outcome/dcValue from a real pf2e-shaped message", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        speaker: { actor: "a1", alias: "Argyle" },
        rolls: [PUBLIC_CHECK_ROLL],
        flavor: "<b>Religion Check</b>",
        flags: {
          pf2e: {
            modifierName: "Religion",
            context: { type: "skill-check", outcome: "success", dc: { value: 18, visible: true } },
          },
        },
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{
          id: string;
          speakerAlias?: string;
          speakerActorId?: string;
          checkName?: string;
          rollType: string;
          outcome?: string;
          dcValue?: number;
          formula: string;
          total: number;
          dice: Array<{ faces: number; results: Array<{ result: number }> }>;
        }>;
      };
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: "m1",
        speakerAlias: "Argyle",
        speakerActorId: "a1",
        checkName: "Religion",
        rollType: "skill-check",
        outcome: "success",
        dcValue: 18,
        formula: "1d20+7",
        total: 21,
        dice: [{ faces: 20, results: [{ result: 14 }] }],
      });
    });

    it("omits dcValue when dc.visible is false, even though a dc.value is present", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "skill-check", dc: { value: 18, visible: false } } } },
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ dcValue?: number }>;
      };
      expect(result.rows[0]?.dcValue).toBeUndefined();
    });

    it("falls back to a flavor-derived check name when flags.pf2e.modifierName is absent", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flavor: "<strong>Perception Check</strong>",
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ checkName?: string }>;
      };
      expect(result.rows[0]?.checkName).toBe("Perception Check");
    });

    it("an untagged /roll message (no flags.pf2e at all) lands in the 'roll' fallback bucket", async () => {
      const msg = fakeMessage({ id: "m1", timestamp: 1000, rolls: [PUBLIC_CHECK_ROLL] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ rollType: string }>;
      };
      expect(result.rows[0]?.rollType).toBe("roll");
    });

    it("resolves originItemName via flags.pf2e.origin.uuid when present", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { origin: { uuid: "Item.weapon1" } } },
      });
      const weaponDoc = fakeDoc({
        id: "weapon1",
        uuid: "Item.weapon1",
        name: "Bastard Sword",
        documentName: "Item",
      });
      stubFoundry(true, {
        messages: [msg],
        fromUuid: (uuid) => Promise.resolve(uuid === "Item.weapon1" ? weaponDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ originItemName?: string }>;
      };
      expect(result.rows[0]?.originItemName).toBe("Bastard Sword");
    });

    it("marks a discarded die compactly in the results array", async () => {
      const rollJson = fakeRollJson({
        formula: "2d20kl1",
        total: 8,
        dice: [
          {
            faces: 20,
            results: [{ result: 14, discarded: true }, { result: 8 }],
          },
        ],
      });
      const msg = fakeMessage({ id: "m1", timestamp: 1000, rolls: [rollJson] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ dice: Array<{ results: Array<{ result: number; discarded?: boolean }> }> }>;
      };
      expect(result.rows[0]?.dice[0]?.results).toEqual([
        { result: 14, discarded: true },
        { result: 8, discarded: undefined },
      ]);
    });
  });

  describe("filters compose (actor ∧ type ∧ outcome ∧ time window)", () => {
    function taggedMessage(
      id: string,
      timestamp: number,
      actor: string,
      type: string,
      outcome: string,
    ): FoundryChatMessage {
      return fakeMessage({
        id,
        timestamp,
        speaker: { actor },
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type, outcome } } },
      });
    }

    /** A minimal world-actor stand-in, purely so `resolveActorFilterId`'s
     * `game.actors.get(id)` direct-id lookup succeeds — mirrors reality (a
     * `speaker.actor`/`context.actor` id names a real world actor). */
    function actorStub(id: string): FoundryActor {
      return fakeDoc({
        id,
        uuid: `Actor.${id}`,
        name: id,
        documentName: "Actor",
        type: "character",
      });
    }

    it("actor filter matches speaker.actor by bare id", async () => {
      const messages = [
        taggedMessage("m1", 1000, "a1", "skill-check", "success"),
        taggedMessage("m2", 1000, "a2", "skill-check", "success"),
      ];
      stubFoundry(true, { actors: [actorStub("a1"), actorStub("a2")], messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { actor: "a1" })) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("actor filter also matches flags.pf2e.context.actor when speaker.actor differs", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        speaker: { actor: "a1" },
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "damage-roll", actor: "a2" } } },
      });
      stubFoundry(true, {
        actors: [actorStub("a1"), actorStub("a2")],
        messages: [msg],
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { actor: "a2" })) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("actor filter resolves an unambiguous name the same way as query-player (D28-13)", async () => {
      const argyle = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
      });
      const messages = [
        taggedMessage("m1", 1000, "a1", "skill-check", "success"),
        taggedMessage("m2", 1000, "a2", "skill-check", "success"),
      ];
      stubFoundry(true, { actors: [argyle], messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { actor: "Argyle" })) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("an ambiguous actor name throws the typed ambiguous-name error", async () => {
      const a = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
      });
      const b = fakeDoc({
        id: "a2",
        uuid: "Actor.a2",
        name: "Argyle Twin",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, { actors: [a, b], messages: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.query-rolls", { actor: "Arg" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("ambiguous-name");
    });

    it("type + outcome + time window compose with actor", async () => {
      const messages = [
        taggedMessage("m1", 1000, "a1", "skill-check", "success"),
        taggedMessage("m2", 2000, "a1", "skill-check", "failure"), // wrong outcome
        taggedMessage("m3", 3000, "a1", "saving-throw", "success"), // wrong type
        taggedMessage("m4", 500, "a1", "skill-check", "success"), // before since
        taggedMessage("m5", 5000, "a1", "skill-check", "success"), // after until
      ];
      stubFoundry(true, { actors: [actorStub("a1")], messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {
        actor: "a1",
        type: "skill-check",
        outcome: "success",
        since: 900,
        until: 4000,
      })) as { rows: Array<{ id: string }> };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("since/until accept an ISO-8601 string, not just a ms-epoch number", async () => {
      const messages = [
        taggedMessage("early", Date.parse("2026-01-01T00:00:00Z"), "a1", "skill-check", "success"),
        taggedMessage("late", Date.parse("2026-06-01T00:00:00Z"), "a1", "skill-check", "success"),
      ];
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {
        since: "2026-03-01T00:00:00Z",
      })) as { rows: Array<{ id: string }> };
      expect(result.rows.map((r) => r.id)).toEqual(["late"]);
    });
  });

  describe("newest-first cursor pagination (D28-10) — synthetic 1,000-message history", () => {
    function buildHistory(): FoundryChatMessage[] {
      const messages: FoundryChatMessage[] = [];
      for (let i = 0; i < 1000; i++) {
        // Every 10th message shares a timestamp with its neighbor, to exercise the
        // (timestamp,_id) tiebreak — id strings are zero-padded so lexicographic
        // order matches insertion order for the same-timestamp group.
        const timestamp = 1_000_000 + Math.floor(i / 10) * 1000;
        messages.push(
          fakeMessage({
            id: `m${String(i).padStart(4, "0")}`,
            timestamp,
            rolls: [PUBLIC_CHECK_ROLL],
          }),
        );
      }
      return messages;
    }

    it("walks the whole history via nextCursor with no gaps/dupes, newest first", async () => {
      const messages = buildHistory();
      stubFoundry(true, { messages });
      registerHandlers();

      const seenIds: string[] = [];
      let cursor: string | undefined;
      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 200) throw new Error("pagination did not terminate");
        const page = (await dispatchQuery("portal.query-rolls", {
          limit: 37, // deliberately not a divisor of 1000, and not a divisor of 10
          cursor,
        })) as {
          rows: Array<{ id: string }>;
          totalMessages: number;
          hasMore: boolean;
          nextCursor?: string;
        };
        expect(page.totalMessages).toBe(1000);
        for (const row of page.rows) seenIds.push(row.id);
        if (!page.hasMore) {
          expect(page.nextCursor).toBeUndefined();
          break;
        }
        expect(page.nextCursor).toBeDefined();
        cursor = page.nextCursor;
      }

      // Every message visited exactly once, newest-first overall.
      expect(seenIds).toHaveLength(1000);
      expect(new Set(seenIds).size).toBe(1000);
      const expectedNewestFirst = messages
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
        .map((m) => m.id);
      expect(seenIds).toEqual(expectedNewestFirst);
    });

    it("the first page (no cursor) starts at the single newest message", async () => {
      const messages = buildHistory();
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { limit: 1 })) as {
        rows: Array<{ id: string; timestamp: number }>;
        hasMore: boolean;
      };
      expect(result.rows).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      const maxTimestamp = Math.max(...messages.map((m) => m.timestamp));
      expect(result.rows[0]?.timestamp).toBe(maxTimestamp);
    });

    it("defaults limit to 20 when omitted", async () => {
      const messages = buildHistory();
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toHaveLength(20);
    });
  });

  describe("totalMessages (spec Risks message-count probe)", () => {
    it("reports the RAW game.messages size, including non-qualifying messages", async () => {
      const messages = [
        fakeMessage({ id: "roll1", timestamp: 1000, rolls: [PUBLIC_CHECK_ROLL] }),
        fakeMessage({ id: "chatter1", timestamp: 2000, rolls: [] }), // not a roll
        fakeMessage({
          id: "whisper1",
          timestamp: 3000,
          whisper: ["u1"],
          rolls: [PUBLIC_CHECK_ROLL],
        }),
      ];
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: unknown[];
        totalMessages: number;
      };
      expect(result.totalMessages).toBe(3);
      expect(result.rows).toHaveLength(1); // only the one qualifying public roll
    });
  });
});

describe("portal-module 0028 S3 — module-skew (D28-14 first half, Foundry-free)", () => {
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

  it("a query for a method this module build never registered (a stale pre-0028 module) surfaces a typed error, never a hang", async () => {
    // Deliberately DON'T call registerHandlers() — simulates a 0.3.0 module whose
    // CONFIG.queries registry has never heard of "portal.query-item"/"portal.
    // query-rolls" at all (the server-0.4.0/module-0.3.0 deploy-window skew, D28-14).
    stubFoundry(true);
    const err = await dispatchQuery("portal.query-item", { name: "anything" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("foundry-error");
    expect((err as BridgeHandlerError).message).toContain("portal.query-item");
  });

  it("same for query-rolls", async () => {
    stubFoundry(true);
    const err = await dispatchQuery("portal.query-rolls", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("foundry-error");
    expect((err as BridgeHandlerError).message).toContain("portal.query-rolls");
  });
});
