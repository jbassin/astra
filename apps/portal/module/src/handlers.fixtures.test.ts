/**
 * Output pins for the pf2e-reading tools (`query-party`, `query-player`, `query-item`), run
 * against the dual-sided fixtures in `tests/fixtures/pf2e/`. Each fake document answers
 * `toObject()` with the fixture's source and `system` with its live side, so a handler that
 * reads a field from the wrong side changes the pinned output. The inline snapshots were
 * recorded against the handlers before they moved onto the `pf2e/` layer.
 */
import { afterEach, describe, expect, it } from "vitest";

import { dispatchQuery, registerHandlers } from "./handlers";
import { fixtureDocument, type Pf2eFixtureName } from "./pf2e/testFixtures";

function values<T>(items: T[]): { values(): IterableIterator<T>; get(id: string): T | undefined } {
  return {
    values: () => items[Symbol.iterator](),
    get: (id) => items.find((i) => (i as { id?: string }).id === id),
  };
}

const PC = fixtureDocument("pc");
const NPC = fixtureDocument("npc");

/** A party actor whose stored members are the PC and the NPC fixtures. */
const PARTY: FoundryActor = {
  ...fixtureDocument("npc"),
  id: "fxPartyActor0001",
  uuid: "Actor.fxPartyActor0001",
  name: "The Party",
  type: "party",
  system: {},
  toObject: () => ({
    _id: "fxPartyActor0001",
    name: "The Party",
    type: "party",
    system: { details: { members: [{ uuid: PC.uuid }, { uuid: NPC.uuid }, { uuid: "gone" }] } },
  }),
};

function stub(byUuid: Record<string, FoundryDocumentLike>): void {
  globalThis.game = {
    user: { id: "gm1", name: "GM", isGM: true },
    world: { id: "faerrin", title: "Faerrin" },
    system: { id: "pf2e", version: "8.4.1" },
    version: "13.351",
    settings: { register: () => {}, get: () => undefined },
    packs: values([]),
    actors: values([PARTY, PC, NPC]),
    items: values([]),
    journal: values([]),
    scenes: { ...values([]), active: null },
    folders: values([]),
    macros: values([]),
    users: values([
      { id: "orAwNSgJQglrpRkr", name: "GM", isGM: true },
      { id: "pS0rW8VPRa3jClOc", name: "PlayerOne", isGM: false },
    ]),
    messages: { contents: [], size: 0 },
    pf2e: { ConditionManager: { getCondition: () => ({ toObject: () => ({}) }) } },
  };
  globalThis.CONFIG = { queries: {} };
  globalThis.fromUuid = (uuid) => Promise.resolve(byUuid[uuid] ?? null);
  registerHandlers();
}

function stubWithFixtures(): void {
  const embedded = (name: Pf2eFixtureName): [string, FoundryDocumentLike] => {
    const doc = fixtureDocument(name);
    return [doc.uuid, doc];
  };
  stub({
    [PC.uuid]: PC,
    [NPC.uuid]: NPC,
    ...Object.fromEntries([embedded("spell"), embedded("feat"), embedded("item")]),
  });
}

afterEach(() => {
  // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
  delete globalThis.game;
  // @ts-expect-error — same.
  delete globalThis.CONFIG;
  // @ts-expect-error — same.
  delete globalThis.fromUuid;
});

describe("pf2e fixture output pins — query-party", () => {
  it("builds the PC row from both sides and the NPC as a companion", async () => {
    stubWithFixtures();
    expect(await dispatchQuery("portal.query-party", {})).toMatchInlineSnapshot(`
      {
        "companions": [
          {
            "id": "fxNpcGoblinWar01",
            "master": undefined,
            "name": "Goblin Warrior",
            "type": "npc",
            "uuid": "Actor.fxNpcGoblinWar01",
          },
        ],
        "partyName": "The Party",
        "pcs": [
          {
            "ancestry": "Elf",
            "className": "Cleric",
            "heroPoints": {
              "max": 3,
              "value": 1,
            },
            "hp": {
              "max": 118,
              "value": 100,
            },
            "id": "zpeNslKKrnaq07HI",
            "level": 8,
            "name": "Argyle",
            "ownerPlayer": "PlayerOne",
            "uuid": "Actor.zpeNslKKrnaq07HI",
          },
        ],
      }
    `);
  });
});

describe("pf2e fixture output pins — query-player", () => {
  for (const section of [
    "summary",
    "stats",
    "skills",
    "spells",
    "feats",
    "inventory",
    "notes",
  ] as const) {
    it(`pins the ${section} section`, async () => {
      stubWithFixtures();
      expect(
        await dispatchQuery("portal.query-player", { uuid: PC.uuid, section }),
      ).toMatchSnapshot();
    });
  }

  it("filters spells by entry name and rank", async () => {
    stubWithFixtures();
    expect(
      await dispatchQuery("portal.query-player", {
        uuid: PC.uuid,
        section: "spells",
        entry: "font",
      }),
    ).toMatchInlineSnapshot(`
      {
        "entries": [
          {
            "dc": 26,
            "entryId": "x5lFsoMiPepDzIix",
            "entryName": "Cleric Font",
            "preparedType": "innate",
            "ranks": [
              {
                "rank": 1,
                "slots": {
                  "max": 0,
                  "value": 0,
                },
                "spells": [
                  {
                    "expended": undefined,
                    "id": "CZdJqf1YtUKF6Vi8",
                    "name": "Heal",
                    "prepared": undefined,
                    "rank": 1,
                    "traits": [
                      "healing",
                      "manipulate",
                      "vitality",
                    ],
                  },
                ],
              },
            ],
            "tradition": "divine",
          },
        ],
        "section": "spells",
      }
    `);
    expect(
      await dispatchQuery("portal.query-player", { uuid: PC.uuid, section: "spells", rank: 3 }),
    ).toMatchInlineSnapshot(`
      {
        "entries": [
          {
            "dc": 26,
            "entryId": "IurrECIEo4RFGgVB",
            "entryName": "Cleric Spells",
            "preparedType": "prepared",
            "ranks": [
              {
                "rank": 3,
                "slots": {
                  "max": 3,
                  "value": 0,
                },
                "spells": [
                  {
                    "expended": true,
                    "id": "G3FjGFAgfLELIRgr",
                    "name": "Holy Light",
                    "prepared": true,
                    "rank": 3,
                    "traits": [
                      "attack",
                      "concentrate",
                      "fire",
                      "holy",
                      "light",
                      "manipulate",
                    ],
                  },
                ],
              },
            ],
            "tradition": "divine",
          },
          {
            "dc": 26,
            "entryId": "x5lFsoMiPepDzIix",
            "entryName": "Cleric Font",
            "preparedType": "innate",
            "ranks": [],
            "tradition": "divine",
          },
        ],
        "section": "spells",
      }
    `);
  });
});

describe("pf2e fixture output pins — query-item", () => {
  for (const name of ["spell", "feat", "item"] as const) {
    it(`renders the embedded ${name} fixture's detail`, async () => {
      stubWithFixtures();
      const uuid = fixtureDocument(name).uuid;
      expect(await dispatchQuery("portal.query-item", { uuid })).toMatchSnapshot();
    });
  }

  it("finds party-embedded items by name", async () => {
    stubWithFixtures();
    expect(await dispatchQuery("portal.query-item", { name: "heal" })).toMatchInlineSnapshot(`
      {
        "hits": [
          {
            "id": "CZdJqf1YtUKF6Vi8",
            "name": "Heal",
            "ownerActor": "Argyle",
            "provenance": "embedded",
            "type": "spell",
            "uuid": "Actor.zpeNslKKrnaq07HI.Item.CZdJqf1YtUKF6Vi8",
          },
          {
            "id": "geJVQu8pnJRCTSOr",
            "name": "Healer's Gloves",
            "ownerActor": "Argyle",
            "provenance": "embedded",
            "type": "equipment",
            "uuid": "Actor.zpeNslKKrnaq07HI.Item.geJVQu8pnJRCTSOr",
          },
          {
            "id": "E4rxmPHJN2hEAeEZ",
            "name": "Healing Hands",
            "ownerActor": "Argyle",
            "provenance": "embedded",
            "type": "feat",
            "uuid": "Actor.zpeNslKKrnaq07HI.Item.E4rxmPHJN2hEAeEZ",
          },
          {
            "id": "ChtRPd5HIBvAeE1L",
            "name": "Healing Potion (Lesser)",
            "ownerActor": "Argyle",
            "provenance": "embedded",
            "type": "consumable",
            "uuid": "Actor.zpeNslKKrnaq07HI.Item.ChtRPd5HIBvAeE1L",
          },
        ],
        "kind": "hits",
      }
    `);
  });
});
