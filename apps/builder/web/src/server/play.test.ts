// @vitest-environment node
// The play marks through the store and the server logic: saved with the answers, reloaded on the
// player page, carried by the DM view, and dropped with a class another player holds.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadDmView, loadPlayerPage, savePlayerAnswers } from "./builder";
import { builderStore } from "./store";

const ORIGIN = "https://builder.example";

function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), "builder-play-"));
  return { dir, store: builderStore(dir) };
}

describe("the store", () => {
  it("round-trips play with the answers, and keeps an empty one out of the file", () => {
    const { dir, store } = fresh();
    const { id } = store.addPlayer("Ada");
    const play = { hp: 9, spent: { slots: 1, "use-rage": 2 } };
    store.saveCharacter(id, { name: "A" }, play);
    expect(store.readCharacter(id)?.play).toEqual(play);
    store.saveCharacter(id, { name: "A" }, {});
    expect(store.readCharacter(id)).not.toHaveProperty("play");
    const raw: unknown = JSON.parse(
      readFileSync(path.join(dir, "characters", `${id}.json`), "utf8"),
    );
    expect(raw).not.toHaveProperty("play");
  });

  it("reads a document saved without play, and refuses a bad play state", () => {
    const { store } = fresh();
    const { id } = store.addPlayer("Ada");
    store.saveCharacter(id, { name: "A" });
    expect(store.readCharacter(id)?.play).toBeUndefined();
    expect(() => store.saveCharacter(id, { name: "A" }, { hp: -2 })).toThrow();
  });
});

describe("the server logic", () => {
  it("saves play with the answers, reloads it, and the DM view carries it", () => {
    const { store } = fresh();
    const ada = store.addPlayer("Ada");
    const play = { hp: 4, spent: { "use-barbarian-rage": 1 } };
    savePlayerAnswers(store, ada.id, { archetype: "warrior", classId: "barbarian" }, play);
    expect(loadPlayerPage(store, ada.id)?.character?.play).toEqual(play);
    const rows = loadDmView(store, { token: "t", expected: "t", publicOrigin: ORIGIN });
    expect(rows?.[0]?.play).toEqual(play);
  });

  it("drops play with a class another player holds", () => {
    const { store } = fresh();
    const ada = store.addPlayer("Ada");
    const bo = store.addPlayer("Bo");
    savePlayerAnswers(store, ada.id, { archetype: "warrior", classId: "fighter" });
    savePlayerAnswers(store, bo.id, { archetype: "warrior", classId: "fighter" }, { hp: 3 });
    expect(store.readCharacter(bo.id)?.answers.classId).toBeUndefined();
    expect(store.readCharacter(bo.id)?.play).toBeUndefined();
  });

  it("leaves play off a DM row with no marks", () => {
    const { store } = fresh();
    const ada = store.addPlayer("Ada");
    savePlayerAnswers(store, ada.id, { archetype: "warrior" });
    const rows = loadDmView(store, { token: "t", expected: "t", publicOrigin: ORIGIN });
    expect(rows?.[0]).not.toHaveProperty("play");
  });
});
