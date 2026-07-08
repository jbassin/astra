import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { BridgeClientOptions } from "./bridgeClient";
import { SETTING_BRIDGE_API_KEY, SETTING_BRIDGE_USER_ID, SETTING_WS_URL } from "./constants";

// `BridgeClient` is dialed for real by `main.ts`'s `ready` hook — mocked here so the
// 0027 S1 designated-dialer gate can be asserted on WITHOUT ever opening a socket
// (`vi.hoisted` because `vi.mock`'s factory is hoisted above regular module-scope
// `const`s, same TDZ reasoning the vitest docs call out).
const { BridgeClientMock, startSpy } = vi.hoisted(() => {
  const start = vi.fn();
  // A `function`, not an arrow — `main.ts` calls `new BridgeClient(...)`, and only a
  // real function (not an arrow) is constructable.
  const ctor = vi.fn(function (_opts: BridgeClientOptions) {
    return { start };
  });
  return { BridgeClientMock: ctor, startSpy: start };
});

vi.mock("./bridgeClient", () => ({ BridgeClient: BridgeClientMock }));

function emptyCollection<T>(): { values(): IterableIterator<T>; get(id: string): T | undefined } {
  return { values: () => ([] as T[])[Symbol.iterator](), get: () => undefined };
}

function fakeUsersCollection(users: FoundryUser[]): FoundryUsersCollection {
  return {
    get: (id) => users.find((u) => u.id === id),
  };
}

/** Stubs just enough of the ambient Foundry `game` global for the `ready` hook's
 * designated-dialer gate (0027 S1) — `main.ts` never touches packs/actors/items/etc.
 * itself (that's `handlers.ts`'s surface), so those collections stay empty stand-ins. */
function stubGame(opts: {
  userId: string;
  userName: string;
  isGM?: boolean;
  wsUrl?: string;
  apiKey?: string;
  bridgeUserId?: string;
  users?: FoundryUser[];
}): void {
  const settingsMap: Record<string, string> = {
    [SETTING_WS_URL]: opts.wsUrl ?? "wss://portal.test/ws",
    [SETTING_BRIDGE_API_KEY]: opts.apiKey ?? "test-bridge-key",
    [SETTING_BRIDGE_USER_ID]: opts.bridgeUserId ?? "",
  };
  const user: FoundryUser = { id: opts.userId, name: opts.userName, isGM: opts.isGM ?? true };
  globalThis.game = {
    user,
    world: { id: "faerrin", title: "Faerrin" },
    system: { id: "pf2e", version: "7.12.2" },
    version: "13.351",
    settings: {
      register: () => {},
      get: (_namespace, key) => settingsMap[key],
    },
    packs: emptyCollection<FoundryCompendiumCollection>(),
    actors: emptyCollection<FoundryActor>(),
    items: emptyCollection<FoundryDocumentLike>(),
    journal: emptyCollection<FoundryDocumentLike>(),
    scenes: { ...emptyCollection<FoundryScene>(), active: null },
    folders: emptyCollection<FoundryFolder>(),
    macros: emptyCollection<FoundryMacro>(),
    users: fakeUsersCollection(opts.users ?? [user]),
    pf2e: { ConditionManager: { getCondition: () => ({ toObject: () => ({}) }) } },
  };
}

describe("portal-module main — ready hook designated-dialer gate (0027 S1, Foundry-free)", () => {
  // Definite-assignment assertion: assigned in `beforeAll` below, read in every `it`.
  let readyHook!: () => void;

  beforeAll(async () => {
    globalThis.Hooks = {
      once: (hook, fn) => {
        if (hook === "ready") readyHook = fn as () => void;
      },
      on: () => {},
    };
    await import("./main");
  });

  afterEach(() => {
    BridgeClientMock.mockClear();
    startSpy.mockClear();
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
  });

  it("empty bridge-user-id: dials (today's behavior, byte-compatible)", () => {
    stubGame({ userId: "josh", userName: "Josh" });
    readyHook();
    expect(BridgeClientMock).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
    const opts = BridgeClientMock.mock.calls[0]?.[0];
    expect(opts?.meta()).toMatchObject({ userId: "josh", userName: "Josh" });
  });

  it("bridge-user-id set + matching game.user.id: dials, meta carries the identity", () => {
    stubGame({ userId: "portal-bot", userName: "Portal", bridgeUserId: "portal-bot" });
    readyHook();
    expect(BridgeClientMock).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
    const opts = BridgeClientMock.mock.calls[0]?.[0];
    expect(opts?.meta()).toMatchObject({ userId: "portal-bot", userName: "Portal" });
  });

  it("bridge-user-id set + non-matching id: never constructs a BridgeClient, logs info", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stubGame({
      userId: "josh",
      userName: "Josh",
      bridgeUserId: "portal-bot",
      users: [
        { id: "josh", name: "Josh", isGM: true },
        { id: "portal-bot", name: "Portal", isGM: true },
      ],
    });
    readyHook();
    expect(BridgeClientMock).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(
      logSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes("not dialing")),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it("bridge-user-id set + unresolvable (no matching game.users entry): warns loudly, doesn't dial", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubGame({
      userId: "josh",
      userName: "Josh",
      bridgeUserId: "typo-id",
      users: [{ id: "josh", name: "Josh", isGM: true }],
    });
    readyHook();
    expect(BridgeClientMock).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes("typo-id")),
    ).toBe(true);
    warnSpy.mockRestore();
  });
});
