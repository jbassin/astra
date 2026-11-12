// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { type Captured, captureTelemetry } from "@astra/observe/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadDmView,
  loadPartyPage,
  loadPlayerPage,
  partyLink,
  playerLink,
  savePlayerAnswers,
  takenClasses,
} from "./builder";
import { dmTokenMatches } from "./dmToken";
import { builderStore } from "./store";

const ORIGIN = "https://builder.example";

function freshStore() {
  return builderStore(mkdtempSync(path.join(tmpdir(), "builder-logic-")));
}

// One capture for the file: the module-scope save counter binds to the first provider it sees.
let cap: Captured;
beforeAll(() => {
  cap = captureTelemetry({ serviceName: "astra.builder-test" });
});
afterAll(async () => {
  await cap.close();
});

describe("dmTokenMatches", () => {
  it("accepts only the exact token", () => {
    expect(dmTokenMatches("s3cret-token", "s3cret-token")).toBe(true);
    expect(dmTokenMatches("s3cret-tokeN", "s3cret-token")).toBe(false);
    expect(dmTokenMatches("s3cret", "s3cret-token")).toBe(false);
    expect(dmTokenMatches("", "s3cret-token")).toBe(false);
    expect(dmTokenMatches(undefined, "s3cret-token")).toBe(false);
  });

  it("matches nothing when the token is unset or blank", () => {
    expect(dmTokenMatches("anything", undefined)).toBe(false);
    expect(dmTokenMatches("", "")).toBe(false);
    expect(dmTokenMatches("  ", "  ")).toBe(false);
  });
});

describe("player page", () => {
  it("is null for an unknown id and resumes saved answers for a known one", () => {
    const store = freshStore();
    expect(loadPlayerPage(store, "A".repeat(22))).toBeNull();
    const { id } = store.addPlayer("Ada");
    expect(loadPlayerPage(store, id)).toEqual({ name: "Ada", character: null, taken: {} });
    savePlayerAnswers(store, id, { archetype: "healer" });
    expect(loadPlayerPage(store, id)?.character?.answers).toEqual({ archetype: "healer" });
  });

  it("counts saves by outcome and rejects unknown ids", async () => {
    const store = freshStore();
    const { id } = store.addPlayer("Ada");
    const okBefore = await cap.metricSum("astra.builder.saves", { outcome: "ok" });
    const errBefore = await cap.metricSum("astra.builder.saves", { outcome: "error" });
    expect(savePlayerAnswers(store, id, { name: "Vex" }).updatedAt).toMatch(/^\d{4}-/);
    expect(() => savePlayerAnswers(store, "B".repeat(22), { name: "x" })).toThrow(/unknown player/);
    expect(await cap.metricSum("astra.builder.saves", { outcome: "ok" })).toBe(okBefore + 1);
    expect(await cap.metricSum("astra.builder.saves", { outcome: "error" })).toBe(errBefore + 1);
  });
});

describe("taken classes", () => {
  it("maps each class to its holder and leaves out the asking player", () => {
    const store = freshStore();
    const ada = store.addPlayer("Ada");
    const bo = store.addPlayer("Bo");
    const cy = store.addPlayer("Cy");
    savePlayerAnswers(store, ada.id, { archetype: "warrior", classId: "fighter" });
    savePlayerAnswers(store, bo.id, { archetype: "healer", classId: "cleric" });
    expect(takenClasses(store, cy.id)).toEqual({ fighter: "Ada", cleric: "Bo" });
    expect(takenClasses(store, ada.id)).toEqual({ cleric: "Bo" });
    expect(loadPlayerPage(store, cy.id)?.taken).toEqual({ fighter: "Ada", cleric: "Bo" });
  });

  it("saves a class another player holds without it, and without what depends on it", () => {
    const store = freshStore();
    const ada = store.addPlayer("Ada");
    const bo = store.addPlayer("Bo");
    savePlayerAnswers(store, ada.id, { archetype: "warrior", classId: "fighter" });
    const res = savePlayerAnswers(store, bo.id, {
      archetype: "warrior",
      classId: "fighter",
      name: "Bo's hero",
    });
    expect(res.taken).toEqual({ fighter: "Ada" });
    expect(store.readCharacter(bo.id)?.answers).toEqual({
      archetype: "warrior",
      name: "Bo's hero",
    });
  });

  it("keeps a player's own class and frees the old one when they switch", () => {
    const store = freshStore();
    const ada = store.addPlayer("Ada");
    const bo = store.addPlayer("Bo");
    const own = savePlayerAnswers(store, ada.id, { archetype: "warrior", classId: "fighter" });
    expect(own.taken).toEqual({});
    expect(store.readCharacter(ada.id)?.answers.classId).toBe("fighter");
    expect(savePlayerAnswers(store, bo.id, { archetype: "warrior" }).taken).toEqual({
      fighter: "Ada",
    });
    savePlayerAnswers(store, ada.id, { archetype: "warrior", classId: "barbarian" });
    const res = savePlayerAnswers(store, bo.id, { archetype: "warrior", classId: "fighter" });
    expect(res.taken).toEqual({ barbarian: "Ada" });
    expect(store.readCharacter(bo.id)?.answers.classId).toBe("fighter");
  });
});

describe("DM view", () => {
  it("is null for a wrong or unset token", () => {
    const store = freshStore();
    store.addPlayer("Ada");
    const base = { publicOrigin: ORIGIN };
    expect(loadDmView(store, { ...base, token: "wrong", expected: "right" })).toBeNull();
    expect(loadDmView(store, { ...base, token: "right", expected: undefined })).toBeNull();
  });

  it("lists every player with link, last save, progress and answers", () => {
    const store = freshStore();
    const ada = store.addPlayer("Ada");
    const bo = store.addPlayer("Bo");
    savePlayerAnswers(store, ada.id, { archetype: "warrior", look: "  " });
    const view = loadDmView(store, { token: "t", expected: "t", publicOrigin: `${ORIGIN}/` });
    const rows = view?.players;
    expect(view?.partyLink).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toMatchObject({
      name: "Ada",
      link: `${ORIGIN}/c/${ada.id}`,
      answered: ["archetype"],
      // Every step applies to every class.
      total: 7,
      answers: { archetype: "warrior", look: "  " },
    });
    expect(rows?.[0]?.updatedAt).not.toBeNull();
    expect(rows?.[1]).toMatchObject({ name: "Bo", updatedAt: null, answered: [], answers: {} });
    expect(playerLink(ORIGIN, bo.id)).toBe(rows?.[1]?.link);
  });

  it("carries the group link once a party phrase is set", () => {
    const store = freshStore();
    store.writeParty("red-fox-lantern");
    const view = loadDmView(store, { token: "t", expected: "t", publicOrigin: `${ORIGIN}/` });
    expect(view?.partyLink).toBe(`${ORIGIN}/p/red-fox-lantern`);
    expect(partyLink(ORIGIN, "red-fox-lantern")).toBe(view?.partyLink);
  });
});

describe("an unreadable party file", () => {
  const SECRET = "quoted-secret-text";

  it("counts as no party, and nothing from the file is returned or logged", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "builder-badparty-"));
    const store = builderStore(dir);
    store.addPlayer("Ada");
    for (const content of [
      `{"word":"${SECRET}","createdAt":"x","extra":1}`,
      `not json ${SECRET}`,
    ]) {
      writeFileSync(path.join(dir, "party.json"), content);
      expect(loadPartyPage(store, SECRET)).toBeNull();
      expect(loadPartyPage(store, "amber-otter-quilt")).toBeNull();
      const view = loadDmView(store, { token: "t", expected: "t", publicOrigin: ORIGIN });
      expect(view?.partyLink).toBeNull();
      expect(JSON.stringify(view)).not.toContain(SECRET);
    }
    const logs = cap
      .logs()
      .map((l) => JSON.stringify(l.body))
      .join("\n");
    expect(logs).toContain("party.json could not be read");
    expect(logs).not.toContain(SECRET);
  });
});

describe("party page", () => {
  it("lists the roster's ids and names in order for the right phrase", () => {
    const store = freshStore();
    const ada = store.addPlayer("Ada");
    const bo = store.addPlayer("Bo");
    store.writeParty("red-fox-lantern");
    expect(loadPartyPage(store, "red-fox-lantern")).toEqual([
      { id: ada.id, name: "Ada" },
      { id: bo.id, name: "Bo" },
    ]);
  });

  it("is null for a wrong phrase, an empty phrase and a missing party file", () => {
    const store = freshStore();
    store.addPlayer("Ada");
    expect(loadPartyPage(store, "red-fox-lantern")).toBeNull();
    expect(loadPartyPage(store, "")).toBeNull();
    store.writeParty("red-fox-lantern");
    expect(loadPartyPage(store, "red-fox-lanterN")).toBeNull();
    expect(loadPartyPage(store, "red-fox")).toBeNull();
    expect(loadPartyPage(store, "")).toBeNull();
  });
});
