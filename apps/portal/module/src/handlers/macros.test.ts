import { afterEach, describe, expect, it, vi } from "vitest";

import { SETTING_ALLOW_MACRO_EXECUTION, SETTING_ALLOW_WRITES } from "../constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./index";
import { fakeDoc, fakeDocumentClass, stubFoundry, teardownFoundry } from "./testSupport";
describe("create-macro", () => {
  afterEach(teardownFoundry);

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

describe("execute-macro", () => {
  afterEach(teardownFoundry);

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
