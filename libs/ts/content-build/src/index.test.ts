import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildContent,
  defineContentSource,
  emitModule,
  hashFiles,
  listMarkdownFiles,
  markdownToHtml,
  parseFrontmatter,
} from "./index";

describe("markdownToHtml", () => {
  it("renders markdown to trimmed HTML", async () => {
    expect(await markdownToHtml("# Hi\n\nA *para*.")).toBe("<h1>Hi</h1>\n<p>A <em>para</em>.</p>");
  });
});

describe("parseFrontmatter", () => {
  it("splits frontmatter data from body", () => {
    const { data, content } = parseFrontmatter("---\nname: Solari\ncount: 3\n---\nBody.\n");
    expect(data).toEqual({ name: "Solari", count: 3 });
    expect(content.trim()).toBe("Body.");
  });
});

describe("hashFiles", () => {
  const files = [
    { rel: "a.md", bytes: "alpha" },
    { rel: "b.md", bytes: "beta" },
  ];

  it("is deterministic", () => {
    expect(hashFiles(files)).toBe(hashFiles(files));
  });

  it("is order-independent (sorts by rel)", () => {
    expect(hashFiles(files)).toBe(hashFiles([...files].reverse()));
  });

  it("changes when any byte changes", () => {
    const flipped = [
      { rel: "a.md", bytes: "alphb" },
      { rel: "b.md", bytes: "beta" },
    ];
    expect(hashFiles(files)).not.toBe(hashFiles(flipped));
  });

  it("changes when a path changes (NUL-separated, not concatenation-ambiguous)", () => {
    expect(hashFiles([{ rel: "ab", bytes: "c" }])).not.toBe(hashFiles([{ rel: "a", bytes: "bc" }]));
  });
});

describe("listMarkdownFiles", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "content-build-"));
    for (const f of ["01-a.md", "02-b.md", "README.md", "notes.txt"]) {
      writeFileSync(path.join(dir, f), "x");
    }
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("lists .md files, excluding the given basenames", () => {
    const got = listMarkdownFiles(dir, ["README.md"]).map((p) => path.basename(p));
    expect(got.sort()).toEqual(["01-a.md", "02-b.md"]);
  });

  it("returns [] for a missing dir", () => {
    expect(listMarkdownFiles(path.join(dir, "nope"))).toEqual([]);
  });
});

describe("buildContent", () => {
  it("runs sources in order into outDir and writes the gitignore", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "content-build-run-"));
    const order: string[] = [];
    const summaries = await buildContent(dir, [
      defineContentSource({
        name: "a",
        build: () => {
          order.push("a");
          emitModule(dir, "a.ts", "export const A = 1;\n");
          return "a done";
        },
      }),
      defineContentSource({
        name: "b",
        build: async () => {
          order.push("b");
          return "b done";
        },
      }),
    ]);
    expect(order).toEqual(["a", "b"]);
    expect(summaries).toEqual(["a done", "b done"]);
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("*\n!.gitignore\n");
    expect(readFileSync(path.join(dir, "a.ts"), "utf8")).toContain("AUTO-GENERATED");
    rmSync(dir, { recursive: true, force: true });
  });
});
