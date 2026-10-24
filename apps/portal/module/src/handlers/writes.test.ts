import { afterEach, describe, expect, it } from "vitest";

import { SETTING_ALLOW_WRITES } from "../constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./index";
import { fakeDoc, fakeDocumentClass, stubFoundry, teardownFoundry } from "./testSupport";
describe("the write gate", () => {
  afterEach(teardownFoundry);

  const bestiaryGoblin = fakeDoc({
    id: "g1",
    uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
    name: "Goblin Warrior",
    documentName: "Actor",
    data: { _id: "g1", name: "Goblin Warrior", system: { details: { level: { value: 1 } } } },
  });

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

  it("writes are allowed by default (the setting is unset)", async () => {
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
