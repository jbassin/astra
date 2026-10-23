import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import { canonicalJson, canonicalJsonCompact, emitCorpus, writeCanonicalJsonCompact } from "./emit";

const SAMPLE = { b: 2, a: 1, nested: { z: 9, y: [3, 2, 1] } };

describe("canonicalJsonCompact (D29-33d)", () => {
  it("sorts keys recursively, same as canonicalJson, but with no indentation", () => {
    expect(canonicalJsonCompact(SAMPLE)).toBe('{"a":1,"b":2,"nested":{"y":[3,2,1],"z":9}}\n');
  });

  it("still ends with exactly one trailing LF", () => {
    expect(canonicalJsonCompact(SAMPLE).endsWith("\n")).toBe(true);
    expect(canonicalJsonCompact(SAMPLE).endsWith("\n\n")).toBe(false);
  });

  it("is strictly shorter than the pretty canonicalJson for the same value", () => {
    expect(canonicalJsonCompact(SAMPLE).length).toBeLessThan(canonicalJson(SAMPLE).length);
  });

  it("array element order is preserved (only object keys sort)", () => {
    expect(canonicalJsonCompact([3, 1, 2])).toBe("[3,1,2]\n");
  });

  it("is deterministic across repeated calls (key-insertion-order independent)", () => {
    const a = { z: 1, a: 2 };
    const b = { a: 2, z: 1 };
    expect(canonicalJsonCompact(a)).toBe(canonicalJsonCompact(b));
  });
});

describe("writeCanonicalJsonCompact", () => {
  it("writes the compact form to disk and returns the exact byte length written", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-emit-test-"));
    try {
      const path = join(dir, "out.json");
      const written = writeCanonicalJsonCompact(path, SAMPLE);
      const content = readFileSync(path, "utf8");
      expect(content).toBe(canonicalJsonCompact(SAMPLE));
      expect(written).toBe(Buffer.byteLength(content));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// emitCorpus: _index.json uses the compact serializer; entity files stay
// pretty; facets are trimmed per-category (facetKeys.ts); superseded is set.
// ---------------------------------------------------------------------------

function entity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "category" | "slug" | "name">,
): CodexEntity {
  return {
    edition: "remaster",
    source: { book: "Test Book", license: "unknown" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

describe("emitCorpus: D29-33 (_index.json compact + facets/superseded rows)", () => {
  function withTmpDir(fn: (corpusRoot: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "codex-emit-corpus-test-"));
    try {
      fn(join(dir, "corpus"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("writes _index.json with NO indentation while entity files stay pretty-printed", () => {
    withTmpDir((corpusRoot) => {
      emitCorpus({
        corpusRoot,
        entities: [
          entity({
            id: "spell/heal",
            category: "spell",
            slug: "heal",
            name: "Heal",
            facets: { traditions: ["divine"] },
          }),
        ],
        pins: { foundry: {}, aon: {} },
      });
      const indexRaw = readFileSync(join(corpusRoot, "spell", "_index.json"), "utf8");
      expect(indexRaw.includes("\n  ")).toBe(false); // no 2-space indentation anywhere
      expect(indexRaw.startsWith("[{")).toBe(true);
      const entityRaw = readFileSync(join(corpusRoot, "spell", "heal.json"), "utf8");
      expect(entityRaw.includes("\n  ")).toBe(true); // entity files keep the pretty form
    });
  });

  it("trims IndexRow.facets to facetKeys.ts's allowlist for the category", () => {
    withTmpDir((corpusRoot) => {
      emitCorpus({
        corpusRoot,
        entities: [
          entity({
            id: "spell/heal",
            category: "spell",
            slug: "heal",
            name: "Heal",
            // `rank` is a real spell facet key but NOT in facetKeys.ts's spell
            // allowlist (spillover-equivalent, excluded per the classifier).
            facets: { rank: 1, traditions: ["divine", "primal"], castTime: "1" },
          }),
        ],
        pins: { foundry: {}, aon: {} },
      });
      const rows = JSON.parse(readFileSync(join(corpusRoot, "spell", "_index.json"), "utf8"));
      expect(rows).toHaveLength(1);
      expect(rows[0].facets).toEqual({ traditions: ["divine", "primal"], castTime: "1" });
    });
  });

  it("omits `facets` entirely for a category with no facetKeys.ts entry (e.g. trait)", () => {
    withTmpDir((corpusRoot) => {
      emitCorpus({
        corpusRoot,
        entities: [
          entity({
            id: "trait/magical",
            category: "trait",
            slug: "magical",
            name: "Magical",
            facets: { someUnrelatedField: "x" },
          }),
        ],
        pins: { foundry: {}, aon: {} },
      });
      const rows = JSON.parse(readFileSync(join(corpusRoot, "trait", "_index.json"), "utf8"));
      expect(rows[0]).not.toHaveProperty("facets");
    });
  });

  it("sets superseded: true iff remasteredAs is a non-empty array (NOT edition === legacy)", () => {
    withTmpDir((corpusRoot) => {
      emitCorpus({
        corpusRoot,
        entities: [
          entity({
            id: "spell/heal@legacy",
            category: "spell",
            slug: "heal",
            name: "Heal",
            edition: "legacy",
            remasteredAs: ["spell/heal"],
          }),
          entity({
            id: "spell/never-remastered",
            category: "spell",
            slug: "never-remastered",
            name: "Never Remastered",
            edition: "legacy",
          }),
        ],
        pins: { foundry: {}, aon: {} },
      });
      const rows: Array<{ id: string; superseded: boolean }> = JSON.parse(
        readFileSync(join(corpusRoot, "spell", "_index.json"), "utf8"),
      );
      const byId = new Map(rows.map((r) => [r.id, r.superseded] as const));
      expect(byId.get("spell/heal@legacy")).toBe(true);
      expect(byId.get("spell/never-remastered")).toBe(false);
    });
  });
});

describe("writeCanonicalJson (pre-existing, unaffected by D29-33d)", () => {
  it("still 2-space-indents", () => {
    expect(canonicalJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
