import { afterEach, describe, expect, it } from "vitest";

import { SETTING_ALLOW_WRITES } from "../constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./index";
import {
  fakeActorDocumentClass,
  fakeCreateEmbeddedDocuments,
  fakeDataModelValidationError,
  fakeDoc,
  fakeDocumentClass,
  fakeItemEmbedded,
  fakeThrowingDocumentClass,
  stubFoundry,
  teardownFoundry,
} from "./testSupport";
describe("create-actor", () => {
  afterEach(teardownFoundry);

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

describe("apply-condition", () => {
  afterEach(teardownFoundry);

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

    it("stamps the created persistent-damage item as portal-created", async () => {
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
      const actor = fakeConditionActor([{ slug: "persistent-damage", active: true, value: null }]);
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
