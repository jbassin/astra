import { afterEach, describe, expect, it } from "vitest";

import { BridgeError, dispatchQuery, registerHandlers } from "./index";
import { deepMergeObject, fakeDoc, loadFixture, stubFoundry, teardownFoundry } from "./testSupport";
describe("query-party and query-player", () => {
  afterEach(teardownFoundry);

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

  describe("query-party", () => {
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
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("not-found");
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

  describe("reads each field from the side of the document that holds it (source or live)", () => {
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

    it("spells entry DC falls back to the ACTOR-level live spellDC when the live entry's is also 0", async () => {
      // Second S4 live find: the live embedded entry's system.spelldc.dc is ALSO 0 —
      // pf2e derives the DC onto the entry's `statistic` class instance, not its
      // system tree. The actor-level system.attributes.spellDC.value (D28-2 verified
      // path) is the reliable live home.
      const argyleDoc = fixtureActorDoc("argyle", {
        attributes: { spellDC: { value: 24 } },
      });
      stubFoundry(true, { actors: [argyleDoc] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-player", {
        name: "Argyle",
        section: "spells",
      })) as { entries: Array<{ dc?: number }> };
      expect(result.entries.some((e) => e.dc === 24)).toBe(true);
    });
  });

  describe("query-player actor resolution and type check", () => {
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
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("ambiguous-name");
      expect((err as BridgeError).message).toContain("Argyle");
      expect((err as BridgeError).message).toContain("Argyle Twin");
    });

    it("rejects a not-found name with a typed not-found error", async () => {
      stubFoundry(true, { actors: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.query-player", {
        name: "Nobody",
        section: "summary",
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BridgeError);
      expect((err as BridgeError).code).toBe("not-found");
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
        expect(err).toBeInstanceOf(BridgeError);
        expect((err as BridgeError).code).toBe("not-a-player-character");
        expect((err as BridgeError).message).toContain(type);
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

  describe("query-player stats section (read from the live actor)", () => {
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

  describe("query-player spells section, on the full Argyle fixture", () => {
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

  describe("query-player feats, inventory and notes sections, on the full Argyle fixture", () => {
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

    it("notes: a GM-hidden biography subsection (visibility flag false) is excluded even though it has content", async () => {
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
