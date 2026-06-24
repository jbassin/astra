import { describe, expect, it } from "vitest";
import { hexFactionMap, layerFilename, serializeLayer, slugify } from "./editorHelpers";

describe("slugify", () => {
  it("converts a plain name to lowercase kebab-case", () => {
    expect(slugify("Alkahest HQ")).toBe("alkahest-hq");
  });

  it("collapses runs of non-alphanumerics", () => {
    expect(slugify("Tinker's Row -- Expanded!")).toBe("tinker-s-row-expanded");
  });

  it("strips diacritics", () => {
    expect(slugify("Café Verdé")).toBe("cafe-verde");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --hello--  ")).toBe("hello");
  });
});

describe("layerFilename", () => {
  it("formats an ISO timestamp into a sortable filename", () => {
    expect(layerFilename("2026-05-22T14:30:00Z", "alkahest-hq")).toBe(
      "2026-05-22T143000-alkahest-hq.kdl",
    );
  });

  it("zero-pads short years to four digits so sort stays correct past year 999", () => {
    expect(layerFilename("863-07-13T14:21:00Z", "hildebrant-base")).toBe(
      "0863-07-13T142100-hildebrant-base.kdl",
    );
  });

  it("throws on an unparseable timestamp", () => {
    expect(() => layerFilename("not-a-date", "x")).toThrow(/ISO-8601/);
  });
});

// Serializer format (KDL): op = node name, positional slug, props for scalar
// fields, `hex q r` / `member "x"` children. The serialize↔parse fidelity
// round-trip lives in scripts/build-content.test.ts (which may import the
// bun-run parser without dragging it into the src typecheck program).
describe("serializeLayer", () => {
  it("emits metadata nodes then op nodes with positional slug + hex children", () => {
    const out = serializeLayer({
      timestamp: "2026-05-22T14:30:00Z",
      message: "A new HQ rises.",
      changes: [
        {
          op: "add",
          slug: "alkahest-hq",
          name: "Alkahest HQ",
          faction: "alkahest-freight",
          hexes: [
            [16, -27],
            [17, -27],
          ],
        },
      ],
    });
    expect(out).toContain('timestamp "2026-05-22T14:30:00Z"');
    expect(out).toContain('message "A new HQ rises."');
    expect(out).toContain('add "alkahest-hq" name="Alkahest HQ" faction="alkahest-freight" {');
    expect(out).toContain("hex 16 -27");
    expect(out).toContain("hex 17 -27");
  });

  it("omits absent fields from an update change", () => {
    const out = serializeLayer({
      timestamp: "2026-05-22T14:30:00Z",
      message: "rename only",
      changes: [{ op: "update", slug: "hq", name: "New Name" }],
    });
    expect(out).toContain('update "hq" name="New Name"');
    expect(out).not.toContain("faction=");
  });

  it("emits a bare op node with no fields", () => {
    const out = serializeLayer({
      timestamp: "2026-05-22T14:30:00Z",
      message: "removal",
      changes: [{ op: "remove", slug: "gone" }],
    });
    expect(out).toContain('remove "gone"');
  });

  it("emits #null for an unowned claim", () => {
    const out = serializeLayer({
      timestamp: "2026-05-22T14:30:00Z",
      message: "Land falls fallow.",
      changes: [{ op: "claim", faction: null, hexes: [[3, 4]] }],
    });
    expect(out).toContain("claim faction=#null {");
    expect(out).toContain("hex 3 4");
  });

  it("emits member child nodes for a banner-form", () => {
    const out = serializeLayer({
      timestamp: "2026-05-22T14:30:00Z",
      message: "Powers unite.",
      changes: [
        {
          op: "banner-form",
          slug: "concord",
          name: "The Concord",
          color: "#c9a24b",
          members: ["solari", "protectorate", "ministry"],
        },
      ],
    });
    expect(out).toContain('banner-form "concord" name="The Concord" color="#c9a24b" {');
    expect(out).toContain('member "solari"');
    expect(out).toContain('member "ministry"');
  });

  it("emits a bare node for a fieldless tithe", () => {
    const out = serializeLayer({
      timestamp: "2026-05-22T14:30:00Z",
      message: "The strider takes its tithe.",
      changes: [{ op: "tithe" }],
    });
    expect(out).toMatch(/\ntithe\n?$/);
  });
});

describe("hexFactionMap", () => {
  it("assigns every existing faction hex to its faction index", () => {
    const m = hexFactionMap();
    // From session-1 example layer: (16,-27) is in Alkahest Freight (idx 1)
    expect(m.get("16,-27")).toBe(1);
    // (-27,13) is in Hildebrant Corp (idx 14)
    expect(m.get("-27,13")).toBe(14);
  });
});
