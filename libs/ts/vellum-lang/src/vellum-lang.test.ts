import { describe, expect, test } from "bun:test";
import { splitCrossRefs } from "./crossref";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter";
import { extractMetadata } from "./metadata";
import type { VellumFields, VellumTimeline } from "./model";
import { parseDocument } from "./parse";

describe("frontmatter (§3.1)", () => {
  test("parses + normalizes tags/aliases (string or list) and preserves extras", () => {
    const fm = parseFrontmatter(
      "title: Belvedere\ntags:\n  - Watcher\n  - Religious\naliases: The Enclave\nkind: org",
    );
    expect(fm.title).toBe("Belvedere");
    expect(fm.tags).toEqual(["Watcher", "Religious"]);
    expect(fm.aliases).toEqual(["The Enclave"]); // scalar → one-element array
    expect(fm.extra).toEqual({ kind: "org" });
  });

  test("absent / blank / malformed YAML all yield empty frontmatter (total)", () => {
    expect(parseFrontmatter("")).toEqual({ tags: [], aliases: [], extra: {} });
    expect(parseFrontmatter("::: not yaml : : :").tags).toEqual([]);
    const { yaml, body } = splitFrontmatter("# No frontmatter here");
    expect(yaml).toBe("");
    expect(body).toBe("# No frontmatter here");
  });

  test("parseDocument splits the leading block off the body", () => {
    const doc = parseDocument("---\ntags: [a]\n---\n\nHello [[World]].");
    expect(doc.frontmatter.tags).toEqual(["a"]);
    expect(doc.nodes[0]?.type).toBe("prose");
  });
});

describe("crossref (§3.2)", () => {
  test("splits all four forms out of a text run", () => {
    const parts = splitCrossRefs("see [[A]], [[B|bee]], [[C#h]], [[D#h|dee]] end");
    const refs = parts.filter((p) => (p as { type: string }).type === "crossref") as unknown[];
    expect(refs).toEqual([
      { type: "crossref", target: "A" },
      { type: "crossref", target: "B", alias: "bee" },
      { type: "crossref", target: "C", heading: "h" },
      { type: "crossref", target: "D", heading: "h", alias: "dee" },
    ]);
  });

  test("pathed targets + document-order extraction via metadata", () => {
    const meta = extractMetadata("[[Færrin]] then [[Geography/Calaria/index|Calaria]].");
    expect(meta.crossrefs).toEqual([
      { type: "crossref", target: "Færrin" },
      { type: "crossref", target: "Geography/Calaria/index", alias: "Calaria" },
    ]);
  });

  test("does not touch [[…]] inside inline code", () => {
    expect(extractMetadata("literal `[[NotARef]]` here").crossrefs).toEqual([]);
  });
});

describe("field-list (§3.3)", () => {
  test("splits Term :: value, flattens term, keeps inline value (incl. crossref)", () => {
    const doc = parseDocument(":::fields\nCategory :: Outer God\nDomains :: see [[air]]\n:::");
    const fields = doc.nodes[0] as VellumFields;
    expect(fields.type).toBe("fields");
    expect(fields.items[0]).toEqual({
      term: "Category",
      value: [{ type: "text", value: "Outer God" }],
    });
    expect(fields.items[1]?.term).toBe("Domains");
    const valueTypes = fields.items[1]?.value.map((v) => (v as { type: string }).type);
    expect(valueTypes).toContain("crossref");
  });

  test("the :: split is scoped to :::fields (no collision elsewhere)", () => {
    // top-level "Term :: value" is ordinary prose, not a field
    expect(parseDocument("Term :: value").nodes[0]?.type).toBe("prose");
  });
});

describe("timeline (§3.4)", () => {
  test("parses {marker} entries from a list; strips the marker from content", () => {
    const doc = parseDocument(
      ":::timeline\n- {0ag} The crack appears in [[Færrin]].\n- A later age.\n:::",
    );
    const tl = doc.nodes[0] as VellumTimeline;
    expect(tl.type).toBe("timeline");
    expect(tl.entries[0]?.marker).toBe("0ag");
    expect(tl.entries[1]?.marker).toBeUndefined(); // marker-less entry kept
    expect(tl.entries).toHaveLength(2);
  });
});

describe("totality + preserved behavior", () => {
  test("never throws on malformed / unknown input", () => {
    for (const src of [
      ":::nope\nx\n:::",
      ":action[seven]",
      "::: ::: :::",
      "[[",
      "]]",
      ":::fields\n:::",
    ]) {
      expect(() => parseDocument(src)).not.toThrow();
    }
  });

  test("the six mechanical kinds + columns still parse", () => {
    const doc = parseDocument(':::statblock[Goblin]{level="Creature 1"}\nA goblin.\n:::');
    const block = doc.nodes[0];
    expect(block?.type).toBe("block");
    if (block?.type === "block") {
      expect(block.kind).toBe("statblock");
      expect(block.label).toBe("Goblin");
      expect(block.attributes.level).toBe("Creature 1");
    }
    expect(parseDocument("::::columns\nleft\n---\nright\n::::").nodes[0]?.type).toBe("columns");
  });
});
