import { afterEach, describe, expect, it } from "vitest";

import { SETTING_ALLOW_WRITES } from "../constants";
import { BridgeError, dispatchQuery, registerHandlers } from "./index";
import {
  fakeDoc,
  fakeDocumentClass,
  fakeItemEmbedded,
  fakePack,
  stubFoundry,
  teardownFoundry,
} from "./testSupport";
describe("create-item", () => {
  afterEach(teardownFoundry);

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
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("not-found");
  });

  it("is denied with writes-disabled when the module setting is off", async () => {
    stubFoundry(true, { settings: { [SETTING_ALLOW_WRITES]: false } });
    registerHandlers();
    const err = await dispatchQuery("portal.create-item", { name: "X", type: "equipment" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("writes-disabled");
  });
});

describe("query-item", () => {
  afterEach(teardownFoundry);

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
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("not-found");
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
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("not-found");
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

  describe("compendium items (only from packs players can see)", () => {
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
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("not-found");
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
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("not-found");
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

  describe("name search returns a hit list across world, party and compendium, labeled by source", () => {
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
