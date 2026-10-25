/**
 * Foundry-free test doubles shared by the handler test files: fake documents, packs,
 * scenes and document classes, and `stubFoundry`, which installs the ambient Foundry
 * globals the handlers read. `teardownFoundry` removes them again.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Loads one of the live-derived, committed test fixtures under `../tests/fixtures/`
 * (real `Actor.toObject()` payloads pulled read-only through the live
 * bridge 2026-07-11: the party actor, Argyle's full 577 KB worst-case-scale sheet,
 * and the familiar Othello — see the fixtures dir for provenance). Same shape every
 * `get-document` result already carries: `{uuid, document}`. */
export function loadFixture(name: "party" | "argyle" | "othello"): {
  uuid: string;
  document: Record<string, unknown>;
} {
  const path = fileURLToPath(new URL(`../../tests/fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    uuid: string;
    document: Record<string, unknown>;
  };
}

/** A fake `FoundryPacksCollection`/`FoundryWorldCollection`/`FoundryScenesCollection`/
 * `FoundryFoldersCollection` — `values()` covers the read handlers (see
 * `types/foundry.d.ts`'s own minimal-surface philosophy); `get(id)` serves
 * `create-token`'s `actorId` path — harmless on collections that never call it.
 * Deliberately unconstrained/cast rather than `T extends {id?: string}`: some callers
 * (compendium packs/index entries) have no `id` field at all, and TypeScript's "weak
 * type" detection rejects assigning a zero-overlap object to an all-optional-props
 * constraint — casting inside `get`'s body sidesteps that without weakening the
 * collection's own declared element type. */
export function fakeValuesCollection<T>(items: T[]): {
  values(): IterableIterator<T>;
  get(id: string): T | undefined;
} {
  return {
    values: () => items[Symbol.iterator](),
    get: (id) => items.find((i) => (i as { id?: string }).id === id),
  };
}

export function fakePack(opts: {
  collection: string;
  type: string;
  label: string;
  system?: string;
  entries?: FoundryCompendiumIndexEntry[];
  /** The pack's per-role visibility config; omit for a pack a
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
 * journal/item/scene stand-in that never calls
 * `getTokenDocument` works unchanged, while the actor-specific tests get a
 * working `getTokenDocument` stub for free (the returned "token" is just the given
 * position + this doc's name, enough for `create-token`'s offset-math assertions). */
export function fakeDoc(opts: {
  id: string;
  uuid: string;
  name: string;
  documentName: string;
  folder?: string;
  data?: Record<string, unknown>;
  type?: string;
  flags?: Record<string, unknown>;
  /** The compendium collection key this doc "came from", for
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
    // must never be able to corrupt this fake's "source" doc as a side effect (the
    // "baseUuid clones-then-patches without mutating the source" tests rely on it).
    toObject: () => structuredClone(opts.data ?? { _id: opts.id, name: opts.name }),
    getTokenDocument: (pos: { x: number; y: number }) =>
      Promise.resolve({ toObject: () => ({ x: pos.x, y: pos.y, name: opts.name }) }),
    // Default: an actor stand-in that just echoes back whatever embedded
    // item payloads it's given (no `rules`, matching the read-back's "absent = no warnings"
    // defensive case) — tests needing control over the returned `rules` override
    // this with `fakeItemEmbedded`'s `fn` instead.
    createEmbeddedDocuments: fakeCreateEmbeddedDocuments,
    // Defaults: never called/read unless a test explicitly exercises
    // apply-condition (`fakeConditionActor` below overrides all four) — present here
    // only so every existing `fakeDoc`/`fakeScene`/`fakeActorDocumentClass` call site
    // (most of which never touch conditions) keeps satisfying `FoundryActor`'s
    // now-required condition surface.
    increaseCondition: () => Promise.resolve(null),
    decreaseCondition: () => Promise.resolve(),
    toggleCondition: () => Promise.resolve(),
    itemTypes: { condition: [] },
  };
}

/** `create-token`'s landing call — by default just echoes each given token payload
 * back as a minted doc (so a test asserting on the RESULT's x/y sees exactly what
 * `actor.getTokenDocument().toObject()` produced), with a distinct sequential id per
 * token. Override for a test that wants to assert on the exact `data` it was called
 * with (the read-tool scene tests never call this at all). */
export function fakeCreateEmbeddedDocuments(
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
 * `foundry.utils.mergeObject` in these Foundry-free tests — objects merge
 * key-by-key recursively, anything else (arrays included, matching real Foundry's own
 * "arrays replace wholesale" semantics) is a plain overwrite. */
export function deepMergeObject<T extends Record<string, unknown>>(
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

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** A `createEmbeddedDocuments` stub for the rule-element read-back tests: mints
 * one item per given payload, optionally stamping a specific `rules` array onto the
 * item at a given index (everything else falls back to no `rules` at all — the
 * defensive "absent means unknown, not everything-failed" case). Records every call's
 * raw `data` so a test can assert on exactly what a handler sent (the stamp, an
 * untouched aura RE, ...). */
export function fakeItemEmbedded(rulesByIndex: Record<number, FoundryRuleElement[]> = {}): {
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
 * given rejection — for simulating Foundry's `DataModelValidationError`.
 * Wrapped in a function (rather than `Promise.reject(rejection)` inline on the object
 * literal) to sidestep oxlint's `promise/no-promise-in-callback` heuristic, which
 * otherwise flags an inline reject of a captured error-shaped variable. */
export function fakeThrowingDocumentClass(rejection: unknown): FoundryDocumentClass {
  function alwaysRejects(): Promise<never> {
    return Promise.reject(rejection);
  }
  return {
    createDocuments: alwaysRejects,
    create: alwaysRejects,
  };
}

/** A stand-in `DataModelValidationError` — `writes.ts` detects it by name/constructor-
 * name string (the real class isn't part of this module's ambient surface, see
 * `types/foundry.d.ts`), so a plain `Error` with the name overridden is indistinguishable
 * from the real thing at the one call site that checks it. */
export function fakeDataModelValidationError(message: string): Error {
  return Object.assign(new Error(message), { name: "DataModelValidationError" });
}

export function fakeScene(opts: {
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

export interface FoundryStubOverrides {
  packs?: FoundryCompendiumCollection[];
  actors?: FoundryActor[];
  items?: FoundryDocumentLike[];
  journal?: FoundryDocumentLike[];
  scenes?: FoundryScene[];
  folders?: FoundryFolder[];
  fromUuid?: (uuid: string) => Promise<FoundryDocumentLike | null>;
  /** The world-settings map `game.settings.get` reads from, keyed by setting key
   * (namespace ignored, this module only ever registers its own). */
  settings?: Record<string, unknown>;
  /** This session's `game.user.id`/`.name`; override to simulate a
   * non-designated session under the `bridge-user-id` setting. */
  userId?: string;
  userName?: string;
  /** `getDocumentClass` per document type; see {@link fakeDocumentClass}. */
  getDocumentClass?: (documentName: string) => FoundryDocumentClass;
  /** `execute-macro`'s `game.macros.get` lookup. */
  macros?: FoundryMacro[];
  /** `apply-condition`'s persistent-damage non-dialog path
   * (`game.pf2e.ConditionManager.getCondition`); defaults to a stand-in returning a
   * bare `{system: {value: {value: null}}}` persistent-damage source, close enough to
   * real pf2e's compendium condition source for these Foundry-free tests. */
  conditionManager?: FoundryPf2eConditionManager;
  /** `query-party`'s owner-player-name resolution (`game.users.get`);
   * defaults to empty. */
  users?: FoundryUser[];
  /** `query-rolls`' chat-message history (`game.messages`); defaults to
   * empty. `size` is derived from the array length, matching real Foundry's
   * `Collection#size` (a `Map` subclass). */
  messages?: FoundryChatMessage[];
}

/** Stubs the ambient Foundry globals the handlers touch (`game`, `CONFIG`,
 * `fromUuid`, `getDocumentClass`) — the handler tests are all Foundry-free, so these are plain
 * objects, not a real Foundry runtime. */
export function stubFoundry(isGM: boolean, overrides: FoundryStubOverrides = {}): void {
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
    // dispatchQuery's designated-dialer re-check is a plain id comparison
    // against the settings value, never `game.users` (that resolvability lookup is
    // `main.ts`'s `ready`-hook concern, covered in `main.test.ts`) — an empty default
    // is enough there. `query-party`'s owner-player resolution DOES read
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
  // `foundry.utils.mergeObject` backs the baseUuid clone+patch path and
  // the `portalStamp` merge; {@link deepMergeObject} is a plain stand-in, real enough for
  // these Foundry-free tests.
  globalThis.foundry = { utils: { mergeObject: deepMergeObject } };
}

/** A minimal fake `FoundryDocumentClass` — `createDocuments`/`create` just mint
 * a sequential id per call and hand back a {@link fakeDoc}-shaped result, recording
 * every payload it was given in `created` so tests can assert on exactly what
 * a handler sent (e.g. that `_id` was stripped, `folder` was resolved to an id). */
export function fakeDocumentClass(
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

/** Like {@link fakeDocumentClass} but for `getDocumentClass("Actor")` specifically:
 * the minted actor's `createEmbeddedDocuments` is the given stub, so a
 * `create-actor` test can control/inspect exactly what happens when its embedded
 * `items[]` get created, while `created` still records the actor's OWN payload (for
 * asserting the portal stamp landed on the actor as well as its items). */
export function fakeActorDocumentClass(
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

/** Removes the globals {@link stubFoundry} installs, between tests. */
export function teardownFoundry(): void {
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
}
