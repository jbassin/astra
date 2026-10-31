import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadSnapshot } from "./snapshot";

/** Write a snapshot JSON to a temp file and return its path. */
function writeSnapshot(snapshot: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-snapshot-"));
  const file = path.join(dir, "akasha-snapshot.json");
  fs.writeFileSync(file, JSON.stringify(snapshot));
  return file;
}

const page = (pagePath: string, frontmatter: Record<string, unknown>) => ({
  path: pagePath,
  date: null,
  frontmatter: { title: null, tags: [], aliases: [], img: null, extra: {}, ...frontmatter },
  crossrefs: [],
});

describe("loadSnapshot — campaigns", () => {
  it("keeps a page's campaigns in order", () => {
    const file = writeSnapshot({
      pages: [page("A", { campaigns: ["the-first-spark", "interred-in-iomenei"] })],
      edges: [],
      unresolved: [],
    });
    expect(loadSnapshot(file).pages[0]?.frontmatter.campaigns).toEqual([
      "the-first-spark",
      "interred-in-iomenei",
    ]);
  });

  it("reads a snapshot without the key as no campaigns", () => {
    const file = writeSnapshot({ pages: [page("A", {})], edges: [], unresolved: [] });
    expect(loadSnapshot(file).pages[0]?.frontmatter.campaigns).toEqual([]);
  });
});
