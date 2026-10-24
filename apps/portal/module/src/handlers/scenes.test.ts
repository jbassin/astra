import { afterEach, describe, expect, it } from "vitest";

import { SETTING_ALLOW_WRITES } from "../constants";
import { BridgeError, dispatchQuery, registerHandlers } from "./index";
import {
  fakeDoc,
  fakeDocumentClass,
  fakeItemEmbedded,
  fakeScene,
  stubFoundry,
  teardownFoundry,
} from "./testSupport";
describe("list-scenes and get-current-scene", () => {
  afterEach(teardownFoundry);

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

describe("create-token", () => {
  afterEach(teardownFoundry);

  const bestiaryGoblin = fakeDoc({
    id: "g1",
    uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
    name: "Goblin Warrior",
    documentName: "Actor",
    data: { _id: "g1", name: "Goblin Warrior", system: { details: { level: { value: 1 } } } },
  });

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

  it("imports the compendium doc first when given uuid instead of actorId", async () => {
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

  it("stamps the created token as portal-created", async () => {
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
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
  });

  it("rejects an unknown actorId with a typed not-found error", async () => {
    stubFoundry(true, { actors: [], scenes: [activeScene] });
    registerHandlers();
    const err = await dispatchQuery("portal.create-token", {
      actorId: "no-such-actor",
      x: 0,
      y: 0,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
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

describe("create-light", () => {
  afterEach(teardownFoundry);

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
    const err = await dispatchQuery("portal.create-light", { x: 0, y: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
  });

  it("rejects an unknown explicit sceneId with a typed not-found error", async () => {
    stubFoundry(true, { scenes: [] });
    registerHandlers();
    const err = await dispatchQuery("portal.create-light", { sceneId: "nope", x: 0, y: 0 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
  });

  it("is denied with writes-disabled when the module setting is off", async () => {
    stubFoundry(true, {
      scenes: [fakeScene({ id: "sc1", name: "The Warren", active: true })],
      settings: { [SETTING_ALLOW_WRITES]: false },
    });
    registerHandlers();
    const err = await dispatchQuery("portal.create-light", { x: 0, y: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("writes-disabled");
  });
});
