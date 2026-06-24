import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeLayer } from "../src/domain/lib/editorHelpers";
import type { Change } from "../src/domain/lib/regions";
import { parseChange, parseFaction, parseLayer } from "./build-content";

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

  it("parses a valid KDL layer file", () => {
    const p = write(
      "0863-07-13T192559-solari-arrives.kdl",
      'timestamp "0863-07-13T19:25:59"\nmessage "Solari arrives."\n\nclaim faction="solari" {\n    hex 1 2\n}\n',
    );
    const layer = parseLayer(p);
    expect(layer.slug).toBe("solari-arrives");
    expect(layer.timestamp).toBe("0863-07-13T19:25:59");
    expect(layer.message).toBe("Solari arrives.");
    expect(layer.changes).toEqual([{ op: "claim", faction: "solari", hexes: [[1, 2]] }]);
  });

  it("maps op=node-name, positional slug, and hex/member children to records", () => {
    const p = write(
      "0863-07-14T091200-mixed.kdl",
      'timestamp "0863-07-14T09:12:00"\nmessage ""\n\n' +
        'skein-add "node-a" name="Node A" faction="f" symbol="s.svg" {\n    hex 3 4\n}\n\n' +
        'banner-form "bnr" name="B" color="#fff" {\n    member "a"\n    member "c"\n}\n\n' +
        "claim faction=#null {\n    hex 5 6\n}\n",
    );
    const layer = parseLayer(p);
    expect(layer.changes).toEqual([
      {
        op: "skein-add",
        slug: "node-a",
        name: "Node A",
        faction: "f",
        hex: [3, 4],
        symbol: "s.svg",
      },
      {
        op: "banner-form",
        slug: "bnr",
        name: "B",
        color: "#fff",
        symbol: null,
        members: ["a", "c"],
      },
      { op: "claim", faction: null, hexes: [[5, 6]] },
    ]);
  });

  it("throws on a bad filename", () => {
    const p = write("not-a-timestamp.kdl", 'timestamp "x"\n');
    expect(() => parseLayer(p)).toThrow(/filename must be/);
  });

  it("throws when timestamp is missing", () => {
    const p = write("0863-07-13T192559-no-ts.kdl", 'message "hi"\n');
    expect(() => parseLayer(p)).toThrow(/missing string 'timestamp'/);
  });

  it("throws on an unknown op node", () => {
    const p = write(
      "0863-07-13T192559-bogus.kdl",
      'timestamp "0863-07-13T19:25:59"\n\nbogus "s"\n',
    );
    expect(() => parseLayer(p)).toThrow(/unknown op 'bogus'/);
  });

  it("parses a faction's vellum file and renders its body to HTML", () => {
    const p = write(
      "05-solari-sub-surface.vellum",
      '---\nname: Solari Sub-Surface\ncolor: "#ff8800"\nsymbol: symbols/solari.svg\n---\nThe sub-surface miners.\n\n## Known Members\n\n### Vask\nForeman.\n',
    );
    const faction = parseFaction(p);
    expect(faction.order).toBe(5);
    expect(faction.slug).toBe("solari-sub-surface");
    expect(faction.name).toBe("Solari Sub-Surface");
    expect(faction.color).toBe("#ff8800");
    expect(faction.symbol).toBe("symbols/solari.svg");
    // The whole body is one rendered vellum document — prose plus the personnel
    // headings (Known Members / Vask) all land in the HTML.
    expect(faction.description).toContain("sub-surface miners");
    expect(faction.description).toContain("Vask");
    expect(faction.description).toContain("Foreman.");
  });
});

// --- serializeLayer (editor writer) ↔ parseLayer (build reader) round-trip ---
// The editor and the build must agree on the KDL format. This file lives in
// scripts/ (run by vitest, outside the src tsc program) so it can import the
// bun-run parser without dragging it into typecheck.

describe("serializeLayer ↔ parseLayer round-trip", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "strider-rt-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function roundTrip(changes: Change[]) {
    const file = path.join(dir, "0863-07-13T192559-rt.kdl");
    rmSync(file, { force: true });
    writeFileSync(
      file,
      serializeLayer({ timestamp: "0863-07-13T19:25:59", message: "m", changes }),
      "utf8",
    );
    return parseLayer(file);
  }

  it("round-trips every change op", () => {
    const cases: Change[] = [
      {
        op: "add",
        slug: "hq",
        name: "HQ",
        faction: "f",
        hexes: [
          [16, -27],
          [17, -27],
        ],
      },
      { op: "update", slug: "hq", name: "New Name" },
      { op: "remove", slug: "hq" },
      {
        op: "skein-add",
        slug: "relay",
        name: "Relay",
        faction: "f",
        hex: [16, -27],
        symbol: "symbols/skein-eye.svg",
      },
      { op: "skein-update", slug: "relay", name: "Relay 2" },
      { op: "skein-remove", slug: "relay" },
      { op: "skein-connect", from: "a", to: "b" },
      { op: "skein-disconnect", from: "a", to: "b" },
      { op: "claim", faction: "f", hexes: [[1, 2]] },
      { op: "claim", faction: null, hexes: [[3, 4]] },
      {
        op: "banner-form",
        slug: "bnr",
        name: "B",
        color: "#fff",
        symbol: null,
        members: ["a", "c"],
      },
      { op: "banner-dissolve", slug: "bnr" },
      { op: "tithe" },
    ];
    for (const c of cases) {
      const layer = roundTrip([c]);
      expect(layer.changes[0], c.op).toEqual(c);
    }
  });

  it("preserves the timestamp and message", () => {
    const layer = roundTrip([{ op: "tithe" }]);
    expect(layer.timestamp).toBe("0863-07-13T19:25:59");
    expect(layer.message).toBe("m");
  });
});
