// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { Answers } from "@/domain/character";

import { builderStore } from "./store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "builder-store-"));
});

describe("roster", () => {
  it("reads a missing roster as empty", () => {
    expect(builderStore(dir).readRoster()).toEqual([]);
  });

  it("adds players with distinct 22-character url-safe ids, creating the dir", () => {
    const nested = path.join(dir, "not", "yet");
    const store = builderStore(nested);
    const a = store.addPlayer("  Ada  ", new Date("2026-11-06T12:00:00Z"));
    const b = store.addPlayer("Bo");
    expect(a.name).toBe("Ada");
    expect(a.createdAt).toBe("2026-11-06T12:00:00.000Z");
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(b.id).not.toBe(a.id);
    const onDisk: unknown = JSON.parse(readFileSync(path.join(nested, "roster.json"), "utf8"));
    expect(onDisk).toEqual([a, b]);
  });

  it("finds only ids on the roster", () => {
    const store = builderStore(dir);
    const a = store.addPlayer("Ada");
    expect(store.findPlayer(a.id)).toEqual(a);
    expect(store.findPlayer("A".repeat(22))).toBeUndefined();
    expect(store.findPlayer("../roster")).toBeUndefined();
  });

  it("rejects a malformed roster file", () => {
    writeFileSync(path.join(dir, "roster.json"), JSON.stringify([{ id: "short", name: "x" }]));
    expect(() => builderStore(dir).readRoster()).toThrow();
  });
});

describe("characters", () => {
  it("saves and reads back a versioned document", () => {
    const store = builderStore(dir);
    const { id } = store.addPlayer("Ada");
    expect(store.readCharacter(id)).toBeUndefined();
    const doc = store.saveCharacter(
      id,
      { archetype: "mage", name: "Vex" },
      new Date("2026-11-06T13:00:00Z"),
    );
    expect(doc).toEqual({
      schemaVersion: 1,
      updatedAt: "2026-11-06T13:00:00.000Z",
      answers: { archetype: "mage", name: "Vex" },
    });
    expect(store.readCharacter(id)).toEqual(doc);
  });

  it("replaces the file atomically and leaves no temp files", () => {
    const store = builderStore(dir);
    const { id } = store.addPlayer("Ada");
    store.saveCharacter(id, { name: "One" });
    store.saveCharacter(id, { name: "Two" });
    const files = readdirSync(path.join(dir, "characters"));
    expect(files).toEqual([`${id}.json`]);
    expect(store.readCharacter(id)?.answers).toEqual({ name: "Two" });
    expect(readdirSync(dir).toSorted()).toEqual(["characters", "roster.json"]);
  });

  it("refuses to save for an id not on the roster", () => {
    const store = builderStore(dir);
    expect(() => store.saveCharacter("A".repeat(22), { name: "x" })).toThrow(/unknown player/);
    expect(() => store.saveCharacter("../../etc/passwd", { name: "x" })).toThrow(/unknown player/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses answers that fail the schema", () => {
    const store = builderStore(dir);
    const { id } = store.addPlayer("Ada");
    // Untyped input, as it arrives over the wire.
    const badArchetype: Answers = JSON.parse('{"archetype":"bard"}');
    const unknownKey: Answers = JSON.parse('{"colour":"red"}');
    expect(() => store.saveCharacter(id, badArchetype)).toThrow();
    expect(() => store.saveCharacter(id, unknownKey)).toThrow();
    expect(store.readCharacter(id)).toBeUndefined();
  });

  it("rejects a stored document from another schema version", () => {
    const store = builderStore(dir);
    const { id } = store.addPlayer("Ada");
    const file = path.join(dir, "characters", `${id}.json`);
    store.saveCharacter(id, {});
    writeFileSync(
      file,
      JSON.stringify({ schemaVersion: 2, updatedAt: new Date().toISOString(), answers: {} }),
    );
    expect(() => store.readCharacter(id)).toThrow();
  });
});
