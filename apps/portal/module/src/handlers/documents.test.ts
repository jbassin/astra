import { afterEach, describe, expect, it, vi } from "vitest";

import { SETTING_ALLOW_WRITES } from "../constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./index";
import {
  fakeDataModelValidationError,
  fakeDoc,
  fakeDocumentClass,
  stubFoundry,
  teardownFoundry,
} from "./testSupport";
describe("get-document and search-world", () => {
  afterEach(teardownFoundry);

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
});

describe("create-journal", () => {
  afterEach(teardownFoundry);

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

  it("stamps the created journal as portal-created", async () => {
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

describe("update-document and delete-document", () => {
  afterEach(teardownFoundry);

  describe("update-document", () => {
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

  describe("delete-document", () => {
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
});
