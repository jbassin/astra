import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseChange, parseFaction, parseLayer, splitBody } from "./build-content";

// --- parseChange (pure) ---

describe("parseChange", () => {
  const ctx = "test";

  it("parses each op's happy path", () => {
    expect(parseChange({ op: "skein-connect", from: "a", to: "b" }, ctx)).toEqual({
      op: "skein-connect",
      from: "a",
      to: "b",
    });
    expect(parseChange({ op: "claim", hexes: [[1, 2]], faction: "x" }, ctx)).toEqual({
      op: "claim",
      hexes: [[1, 2]],
      faction: "x",
    });
    expect(parseChange({ op: "claim", hexes: [[1, 2]], faction: null }, ctx)).toEqual({
      op: "claim",
      hexes: [[1, 2]],
      faction: null,
    });
    expect(
      parseChange({ op: "add", slug: "s", name: "N", faction: "f", hexes: [[0, 0]] }, ctx),
    ).toEqual({ op: "add", slug: "s", name: "N", faction: "f", hexes: [[0, 0]] });
    expect(parseChange({ op: "update", slug: "s", name: "N2" }, ctx)).toEqual({
      op: "update",
      slug: "s",
      name: "N2",
    });
    expect(parseChange({ op: "remove", slug: "s" }, ctx)).toEqual({ op: "remove", slug: "s" });
    expect(
      parseChange(
        { op: "skein-add", slug: "s", name: "N", faction: "f", hex: [1, 1], symbol: "y.svg" },
        ctx,
      ),
    ).toEqual({
      op: "skein-add",
      slug: "s",
      name: "N",
      faction: "f",
      hex: [1, 1],
      symbol: "y.svg",
    });
    expect(parseChange({ op: "skein-remove", slug: "s" }, ctx)).toEqual({
      op: "skein-remove",
      slug: "s",
    });
    expect(
      parseChange(
        { op: "banner-form", slug: "b", name: "B", color: "#fff", members: ["a", "c"] },
        ctx,
      ),
    ).toEqual({
      op: "banner-form",
      slug: "b",
      name: "B",
      color: "#fff",
      symbol: null,
      members: ["a", "c"],
    });
    expect(
      parseChange(
        {
          op: "banner-form",
          slug: "b",
          name: "B",
          color: "#fff",
          symbol: "s.svg",
          members: ["a", "c"],
        },
        ctx,
      ),
    ).toEqual({
      op: "banner-form",
      slug: "b",
      name: "B",
      color: "#fff",
      symbol: "s.svg",
      members: ["a", "c"],
    });
    expect(parseChange({ op: "banner-dissolve", slug: "b" }, ctx)).toEqual({
      op: "banner-dissolve",
      slug: "b",
    });
    expect(parseChange({ op: "tithe" }, ctx)).toEqual({ op: "tithe" });
  });

  it("throws on each invalid case", () => {
    expect(() => parseChange(null, ctx)).toThrow(/must be an object/);
    expect(() => parseChange({ op: "skein-connect", to: "b" }, ctx)).toThrow(/'from'/);
    expect(() => parseChange({ op: "skein-connect", from: "a" }, ctx)).toThrow(/'to'/);
    expect(() => parseChange({ op: "claim", hexes: [[1]], faction: "x" }, ctx)).toThrow(/\[q, r\]/);
    expect(() => parseChange({ op: "claim", hexes: [[1, 2]], faction: "" }, ctx)).toThrow(
      /empty string/,
    );
    expect(() => parseChange({ op: "add", slug: "s", faction: "f", hexes: [] }, ctx)).toThrow(
      /missing 'name'/,
    );
    expect(() => parseChange({ slug: "s" }, ctx)).toThrow(/unknown op/);
    expect(() => parseChange({ op: "bogus", slug: "s" }, ctx)).toThrow(/unknown op 'bogus'/);
    expect(() => parseChange({ op: "add", name: "N", faction: "f", hexes: [] }, ctx)).toThrow(
      /string 'slug'/,
    );
    expect(() =>
      parseChange({ op: "banner-form", slug: "b", color: "#fff", members: ["a", "c"] }, ctx),
    ).toThrow(/missing 'name'/);
    expect(() =>
      parseChange({ op: "banner-form", slug: "b", name: "B", members: ["a", "c"] }, ctx),
    ).toThrow(/missing 'color'/);
    expect(() =>
      parseChange({ op: "banner-form", slug: "b", name: "B", color: "#fff", members: ["a"] }, ctx),
    ).toThrow(/≥2 faction slugs/);
  });
});

// --- splitBody (pure) ---

describe("splitBody", () => {
  it("splits a description and member entries", () => {
    const { descriptionMd, memberEntries } = splitBody(
      "Intro paragraph.\n\n## Known Members\n\n### Alice\nAlice bio.\n\n### Bob\nBob bio.",
    );
    expect(descriptionMd).toBe("Intro paragraph.");
    expect(memberEntries.map((m) => m.name)).toEqual(["Alice", "Bob"]);
    expect(memberEntries[0]?.content).toContain("Alice bio.");
  });

  it("returns no members when the section is marked hidden", () => {
    const { memberEntries } = splitBody(
      "Desc.\n\n## Known Members <!-- hidden -->\n\n### Alice\nx",
    );
    expect(memberEntries).toEqual([]);
  });

  it("skips individually hidden members", () => {
    const { memberEntries } = splitBody(
      "Desc.\n\n## Known Members\n\n### Alice <!-- hidden -->\na\n\n### Bob\nb",
    );
    expect(memberEntries.map((m) => m.name)).toEqual(["Bob"]);
  });

  it("treats the whole body as description when there is no Known Members heading", () => {
    const { descriptionMd, memberEntries } = splitBody("Just a description.");
    expect(descriptionMd).toBe("Just a description.");
    expect(memberEntries).toEqual([]);
  });
});

// --- parseLayer / parseFaction (read a file; exercised against temp fixtures) ---

describe("parseLayer / parseFaction (fixtures)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "strider-content-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, body: string): string {
    const p = path.join(dir, name);
    writeFileSync(p, body, "utf8");
    return p;
  }

  it("parses a valid layer file", () => {
    const p = write(
      "0863-07-13T192559-solari-arrives.md",
      '---\ntimestamp: "0863-07-13T19:25:59"\nmessage: Solari arrives.\nchanges:\n  - op: claim\n    faction: solari\n    hexes:\n      - [1, 2]\n---\nBody text.\n',
    );
    const layer = parseLayer(p);
    expect(layer.slug).toBe("solari-arrives");
    expect(layer.timestamp).toBe("0863-07-13T19:25:59");
    expect(layer.message).toBe("Solari arrives.");
    expect(layer.changes).toEqual([{ op: "claim", faction: "solari", hexes: [[1, 2]] }]);
    expect(layer.body).toBe("Body text.");
  });

  it("throws on a bad filename", () => {
    const p = write("not-a-timestamp.md", "---\ntimestamp: x\nchanges: []\n---\n");
    expect(() => parseLayer(p)).toThrow(/filename must be/);
  });

  it("throws when timestamp is missing", () => {
    const p = write("0863-07-13T192559-no-ts.md", "---\nmessage: hi\nchanges: []\n---\n");
    expect(() => parseLayer(p)).toThrow(/missing string 'timestamp'/);
  });

  it("throws when changes is not an array", () => {
    const p = write(
      "0863-07-13T192559-bad-changes.md",
      '---\ntimestamp: "0863-07-13T19:25:59"\nchanges: nope\n---\n',
    );
    expect(() => parseLayer(p)).toThrow(/'changes' must be an array/);
  });

  it("parses a faction file with members", async () => {
    const p = write(
      "05-solari-sub-surface.md",
      '---\nname: Solari Sub-Surface\ncolor: "#ff8800"\nsymbol: symbols/solari.svg\n---\nThe sub-surface miners.\n\n## Known Members\n\n### Vask\nForeman.\n',
    );
    const faction = await parseFaction(p);
    expect(faction.order).toBe(5);
    expect(faction.slug).toBe("solari-sub-surface");
    expect(faction.name).toBe("Solari Sub-Surface");
    expect(faction.color).toBe("#ff8800");
    expect(faction.symbol).toBe("symbols/solari.svg");
    expect(faction.description).toContain("sub-surface miners");
    expect(faction.members.map((m) => m.name)).toEqual(["Vask"]);
    expect(faction.members[0]?.bio).toContain("Foreman.");
  });
});
