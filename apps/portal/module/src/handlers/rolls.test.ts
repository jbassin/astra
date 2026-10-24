import { afterEach, describe, expect, it } from "vitest";

import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./index";
import { fakeDoc, stubFoundry, teardownFoundry } from "./testSupport";
describe("query-rolls", () => {
  afterEach(teardownFoundry);

  function fakeRollJson(opts: {
    formula: string;
    total: number;
    dice?: Array<{ faces: number; results: Array<{ result: number; discarded?: boolean }> }>;
  }): string {
    const terms = (opts.dice ?? []).map((d) => ({
      class: "Die",
      faces: d.faces,
      number: d.results.length,
      results: d.results.map((r) => ({
        result: r.result,
        active: r.discarded !== true,
        discarded: r.discarded === true,
      })),
    }));
    return JSON.stringify({
      class: "Roll",
      formula: opts.formula,
      total: opts.total,
      evaluated: true,
      terms,
    });
  }

  function fakeMessage(opts: {
    id: string;
    timestamp: number;
    whisper?: string[];
    blind?: boolean;
    speaker?: { actor?: string; alias?: string };
    rolls?: Array<string | object>;
    flavor?: string;
    flags?: Record<string, unknown>;
  }): FoundryChatMessage {
    return {
      id: opts.id,
      timestamp: opts.timestamp,
      speaker: opts.speaker,
      whisper: opts.whisper ?? [],
      blind: opts.blind ?? false,
      rolls: opts.rolls ?? [],
      flavor: opts.flavor,
      flags: opts.flags,
    };
  }

  const PUBLIC_CHECK_ROLL = fakeRollJson({
    formula: "1d20+7",
    total: 21,
    dice: [{ faces: 20, results: [{ result: 14 }] }],
  });

  describe("live messages carry hydrated Roll instances, not JSON strings", () => {
    it("builds a row from a LIVE message whose rolls[] are Roll INSTANCES", async () => {
      // Live `game.messages` documents hydrate `rolls` into Roll instances whose
      // toJSON() restores the stored shape — found live at the 0028 S4 gate, where
      // every page row silently failed to build (rows=0, hasMore=true).
      const instance = {
        toJSON: () =>
          JSON.parse(
            fakeRollJson({
              formula: "1d20+5",
              total: 19,
              dice: [{ faces: 20, results: [{ result: 14 }] }],
            }),
          ) as object,
      };
      const msg = fakeMessage({ id: "live1", timestamp: 1000, rolls: [instance] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ formula: string; total: number }>;
      };
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.formula).toBe("1d20+5");
      expect(result.rows[0]?.total).toBe(19);
    });
  });

  describe("privacy filter: public rolls only", () => {
    it("a whispered message never appears, regardless of other filters", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        whisper: ["user1"],
        rolls: [PUBLIC_CHECK_ROLL],
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toEqual([]);
    });

    it("a blind message never appears", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        blind: true,
        rolls: [PUBLIC_CHECK_ROLL],
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toEqual([]);
    });

    it("a secret check (flags.pf2e.context.secret=true) is excluded even with whisper=[] and blind=false", async () => {
      const secretMsg = fakeMessage({
        id: "secret1",
        timestamp: 1000,
        whisper: [],
        blind: false,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "skill-check", secret: true } } },
      });
      const publicMsg = fakeMessage({
        id: "public1",
        timestamp: 2000,
        whisper: [],
        blind: false,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "skill-check" } } },
      });
      stubFoundry(true, { messages: [secretMsg, publicMsg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["public1"]);
    });

    it("a non-roll message (rolls.length === 0) never qualifies even if otherwise public", async () => {
      const chatter = fakeMessage({ id: "chat1", timestamp: 1000, rolls: [] });
      stubFoundry(true, { messages: [chatter] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toEqual([]);
    });
  });

  describe("row shape", () => {
    it("renders formula/total/dice/checkName/outcome/dcValue from a real pf2e-shaped message", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        speaker: { actor: "a1", alias: "Argyle" },
        rolls: [PUBLIC_CHECK_ROLL],
        flavor: "<b>Religion Check</b>",
        flags: {
          pf2e: {
            modifierName: "Religion",
            context: { type: "skill-check", outcome: "success", dc: { value: 18, visible: true } },
          },
        },
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{
          id: string;
          speakerAlias?: string;
          speakerActorId?: string;
          checkName?: string;
          rollType: string;
          outcome?: string;
          dcValue?: number;
          formula: string;
          total: number;
          dice: Array<{ faces: number; results: Array<{ result: number }> }>;
        }>;
      };
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: "m1",
        speakerAlias: "Argyle",
        speakerActorId: "a1",
        checkName: "Religion",
        rollType: "skill-check",
        outcome: "success",
        dcValue: 18,
        formula: "1d20+7",
        total: 21,
        dice: [{ faces: 20, results: [{ result: 14 }] }],
      });
    });

    it("omits dcValue when dc.visible is false, even though a dc.value is present", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "skill-check", dc: { value: 18, visible: false } } } },
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ dcValue?: number }>;
      };
      expect(result.rows[0]?.dcValue).toBeUndefined();
    });

    it("falls back to a flavor-derived check name when flags.pf2e.modifierName is absent", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flavor: "<strong>Perception Check</strong>",
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ checkName?: string }>;
      };
      expect(result.rows[0]?.checkName).toBe("Perception Check");
    });

    it("an untagged /roll message (no flags.pf2e at all) lands in the 'roll' fallback bucket", async () => {
      const msg = fakeMessage({ id: "m1", timestamp: 1000, rolls: [PUBLIC_CHECK_ROLL] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ rollType: string }>;
      };
      expect(result.rows[0]?.rollType).toBe("roll");
    });

    it("resolves originItemName via flags.pf2e.origin.uuid when present", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { origin: { uuid: "Item.weapon1" } } },
      });
      const weaponDoc = fakeDoc({
        id: "weapon1",
        uuid: "Item.weapon1",
        name: "Bastard Sword",
        documentName: "Item",
      });
      stubFoundry(true, {
        messages: [msg],
        fromUuid: (uuid) => Promise.resolve(uuid === "Item.weapon1" ? weaponDoc : null),
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ originItemName?: string }>;
      };
      expect(result.rows[0]?.originItemName).toBe("Bastard Sword");
    });

    it("marks a discarded die compactly in the results array", async () => {
      const rollJson = fakeRollJson({
        formula: "2d20kl1",
        total: 8,
        dice: [
          {
            faces: 20,
            results: [{ result: 14, discarded: true }, { result: 8 }],
          },
        ],
      });
      const msg = fakeMessage({ id: "m1", timestamp: 1000, rolls: [rollJson] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ dice: Array<{ results: Array<{ result: number; discarded?: boolean }> }> }>;
      };
      expect(result.rows[0]?.dice[0]?.results).toEqual([
        { result: 14, discarded: true },
        { result: 8, discarded: undefined },
      ]);
    });
  });

  describe("roll modifier breakdown (flags.pf2e.modifiers)", () => {
    /** A realistic occultism-check modifiers array (the players' cited example),
     * mixed enabled/disabled/ignored — shaped like the live `ModifierPF2e#
     * toObject()` output verified against the container's `pf2e.mjs`. */
    const OCCULTISM_MODIFIERS = [
      {
        slug: "int",
        label: "Intelligence",
        modifier: 4,
        type: "ability",
        enabled: true,
        ignored: false,
      },
      {
        slug: "occultism",
        label: "Master Proficiency",
        modifier: 13,
        type: "proficiency",
        enabled: true,
        ignored: false,
      },
      {
        slug: "pendant-of-the-occult",
        label: "Pendant of the Occult",
        modifier: 1,
        type: "item",
        enabled: true,
        ignored: false,
      },
      {
        slug: "guidance",
        label: "Guidance",
        modifier: 1,
        type: "status",
        enabled: true,
        ignored: false,
      },
      {
        slug: "aid",
        label: "Aid",
        modifier: 1,
        type: "circumstance",
        enabled: true,
        ignored: false,
      },
      // Disabled (predicate failed) — must NOT appear in the row.
      {
        slug: "flanking",
        label: "Flanking",
        modifier: 2,
        type: "circumstance",
        enabled: false,
        ignored: false,
      },
      // Enabled but ignored (a suppressed adjustment) — must NOT appear either.
      {
        slug: "suppressed",
        label: "Suppressed Bonus",
        modifier: 5,
        type: "untyped",
        enabled: true,
        ignored: true,
      },
    ];

    it("filters to the enabled, non-ignored subset with label+value (and drops disabled/ignored entries)", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { modifierName: "Occultism", modifiers: OCCULTISM_MODIFIERS } },
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ modifiers?: Array<{ label: string; value: number; type?: string }> }>;
      };
      expect(result.rows[0]?.modifiers).toEqual([
        { label: "Intelligence", value: 4, type: "ability" },
        { label: "Master Proficiency", value: 13, type: "proficiency" },
        { label: "Pendant of the Occult", value: 1, type: "item" },
        { label: "Guidance", value: 1, type: "status" },
        { label: "Aid", value: 1, type: "circumstance" },
      ]);
    });

    it("omits the modifiers field entirely when the message carries no modifiers flag", async () => {
      const msg = fakeMessage({ id: "m1", timestamp: 1000, rolls: [PUBLIC_CHECK_ROLL] });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ modifiers?: unknown }>;
      };
      expect(result.rows[0]?.modifiers).toBeUndefined();
    });

    it("caps at 12 enabled modifiers, defensively", async () => {
      const many = Array.from({ length: 20 }, (_, i) => ({
        slug: `mod-${i}`,
        label: `Modifier ${i}`,
        modifier: 1,
        type: "untyped",
        enabled: true,
        ignored: false,
      }));
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { modifiers: many } },
      });
      stubFoundry(true, { messages: [msg] });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: Array<{ modifiers?: unknown[] }>;
      };
      expect(result.rows[0]?.modifiers).toHaveLength(12);
    });
  });

  describe("filters compose (actor ∧ type ∧ outcome ∧ time window)", () => {
    function taggedMessage(
      id: string,
      timestamp: number,
      actor: string,
      type: string,
      outcome: string,
    ): FoundryChatMessage {
      return fakeMessage({
        id,
        timestamp,
        speaker: { actor },
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type, outcome } } },
      });
    }

    /** A minimal world-actor stand-in, purely so `resolveActorFilterId`'s
     * `game.actors.get(id)` direct-id lookup succeeds — mirrors reality (a
     * `speaker.actor`/`context.actor` id names a real world actor). */
    function actorStub(id: string): FoundryActor {
      return fakeDoc({
        id,
        uuid: `Actor.${id}`,
        name: id,
        documentName: "Actor",
        type: "character",
      });
    }

    it("actor filter matches speaker.actor by bare id", async () => {
      const messages = [
        taggedMessage("m1", 1000, "a1", "skill-check", "success"),
        taggedMessage("m2", 1000, "a2", "skill-check", "success"),
      ];
      stubFoundry(true, { actors: [actorStub("a1"), actorStub("a2")], messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { actor: "a1" })) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("actor filter also matches flags.pf2e.context.actor when speaker.actor differs", async () => {
      const msg = fakeMessage({
        id: "m1",
        timestamp: 1000,
        speaker: { actor: "a1" },
        rolls: [PUBLIC_CHECK_ROLL],
        flags: { pf2e: { context: { type: "damage-roll", actor: "a2" } } },
      });
      stubFoundry(true, {
        actors: [actorStub("a1"), actorStub("a2")],
        messages: [msg],
      });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { actor: "a2" })) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("actor filter resolves an unambiguous name the same way as query-player", async () => {
      const argyle = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
      });
      const messages = [
        taggedMessage("m1", 1000, "a1", "skill-check", "success"),
        taggedMessage("m2", 1000, "a2", "skill-check", "success"),
      ];
      stubFoundry(true, { actors: [argyle], messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { actor: "Argyle" })) as {
        rows: Array<{ id: string }>;
      };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("an ambiguous actor name throws the typed ambiguous-name error", async () => {
      const a = fakeDoc({
        id: "a1",
        uuid: "Actor.a1",
        name: "Argyle",
        documentName: "Actor",
        type: "character",
      });
      const b = fakeDoc({
        id: "a2",
        uuid: "Actor.a2",
        name: "Argyle Twin",
        documentName: "Actor",
        type: "character",
      });
      stubFoundry(true, { actors: [a, b], messages: [] });
      registerHandlers();
      const err = await dispatchQuery("portal.query-rolls", { actor: "Arg" }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BridgeHandlerError);
      expect((err as BridgeHandlerError).code).toBe("ambiguous-name");
    });

    it("type + outcome + time window compose with actor", async () => {
      const messages = [
        taggedMessage("m1", 1000, "a1", "skill-check", "success"),
        taggedMessage("m2", 2000, "a1", "skill-check", "failure"), // wrong outcome
        taggedMessage("m3", 3000, "a1", "saving-throw", "success"), // wrong type
        taggedMessage("m4", 500, "a1", "skill-check", "success"), // before since
        taggedMessage("m5", 5000, "a1", "skill-check", "success"), // after until
      ];
      stubFoundry(true, { actors: [actorStub("a1")], messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {
        actor: "a1",
        type: "skill-check",
        outcome: "success",
        since: 900,
        until: 4000,
      })) as { rows: Array<{ id: string }> };
      expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
    });

    it("since/until accept an ISO-8601 string, not just a ms-epoch number", async () => {
      const messages = [
        taggedMessage("early", Date.parse("2026-01-01T00:00:00Z"), "a1", "skill-check", "success"),
        taggedMessage("late", Date.parse("2026-06-01T00:00:00Z"), "a1", "skill-check", "success"),
      ];
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {
        since: "2026-03-01T00:00:00Z",
      })) as { rows: Array<{ id: string }> };
      expect(result.rows.map((r) => r.id)).toEqual(["late"]);
    });
  });

  describe("newest-first cursor pagination over a synthetic 1,000-message history", () => {
    function buildHistory(): FoundryChatMessage[] {
      const messages: FoundryChatMessage[] = [];
      for (let i = 0; i < 1000; i++) {
        // Every 10th message shares a timestamp with its neighbor, to exercise the
        // (timestamp,_id) tiebreak — id strings are zero-padded so lexicographic
        // order matches insertion order for the same-timestamp group.
        const timestamp = 1_000_000 + Math.floor(i / 10) * 1000;
        messages.push(
          fakeMessage({
            id: `m${String(i).padStart(4, "0")}`,
            timestamp,
            rolls: [PUBLIC_CHECK_ROLL],
          }),
        );
      }
      return messages;
    }

    it("walks the whole history via nextCursor with no gaps/dupes, newest first", async () => {
      const messages = buildHistory();
      stubFoundry(true, { messages });
      registerHandlers();

      const seenIds: string[] = [];
      let cursor: string | undefined;
      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 200) throw new Error("pagination did not terminate");
        const page = (await dispatchQuery("portal.query-rolls", {
          limit: 37, // deliberately not a divisor of 1000, and not a divisor of 10
          cursor,
        })) as {
          rows: Array<{ id: string }>;
          totalMessages: number;
          hasMore: boolean;
          nextCursor?: string;
        };
        expect(page.totalMessages).toBe(1000);
        for (const row of page.rows) seenIds.push(row.id);
        if (!page.hasMore) {
          expect(page.nextCursor).toBeUndefined();
          break;
        }
        expect(page.nextCursor).toBeDefined();
        cursor = page.nextCursor;
      }

      // Every message visited exactly once, newest-first overall.
      expect(seenIds).toHaveLength(1000);
      expect(new Set(seenIds).size).toBe(1000);
      const expectedNewestFirst = messages
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
        .map((m) => m.id);
      expect(seenIds).toEqual(expectedNewestFirst);
    });

    it("the first page (no cursor) starts at the single newest message", async () => {
      const messages = buildHistory();
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", { limit: 1 })) as {
        rows: Array<{ id: string; timestamp: number }>;
        hasMore: boolean;
      };
      expect(result.rows).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      const maxTimestamp = Math.max(...messages.map((m) => m.timestamp));
      expect(result.rows[0]?.timestamp).toBe(maxTimestamp);
    });

    it("defaults limit to 20 when omitted", async () => {
      const messages = buildHistory();
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as { rows: unknown[] };
      expect(result.rows).toHaveLength(20);
    });
  });

  describe("totalMessages counts the whole chat log", () => {
    it("reports the RAW game.messages size, including non-qualifying messages", async () => {
      const messages = [
        fakeMessage({ id: "roll1", timestamp: 1000, rolls: [PUBLIC_CHECK_ROLL] }),
        fakeMessage({ id: "chatter1", timestamp: 2000, rolls: [] }), // not a roll
        fakeMessage({
          id: "whisper1",
          timestamp: 3000,
          whisper: ["u1"],
          rolls: [PUBLIC_CHECK_ROLL],
        }),
      ];
      stubFoundry(true, { messages });
      registerHandlers();
      const result = (await dispatchQuery("portal.query-rolls", {})) as {
        rows: unknown[];
        totalMessages: number;
      };
      expect(result.totalMessages).toBe(3);
      expect(result.rows).toHaveLength(1); // only the one qualifying public roll
    });
  });
});
