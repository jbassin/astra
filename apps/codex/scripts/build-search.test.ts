import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "../src/server/corpusFs";
import { buildSearchIndex } from "./build-search";

/**
 * D29-37's CI-hermetic search-build test: runs the REAL `buildSearchIndex` —
 * the exact code path `just codex-search-index` uses — over the committed
 * fixture corpus (`apps/codex/fixtures/entities/`), writing to a fresh
 * `os.tmpdir()` dir (never `fixtures/` or `data/`, D29-12: CI has no
 * `data/` at all). `pagefind` is a plain npm devDependency, so this needs
 * zero network and zero host-only machinery — the ~3.8 GB RSS sharp edge
 * only shows up at the REAL corpus's 46,192-entity scale (S2's host gate,
 * not here).
 */

const tempDirs: string[] = [];
function freshOutDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-search-fixture-"));
  tempDirs.push(dir);
  return join(dir, "pagefind");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Sum of the fixture manifest's `categoryCounts` — the same "reconciles
 * exactly against the emitted corpus" invariant `manifest.json`'s own
 * `totalEntityCount` carries on a real corpus (D29-21). */
function fixtureEntityCount(): number {
  const manifest = JSON.parse(readFileSync(join(fixtureCorpusRoot(), "manifest.json"), "utf8")) as {
    categoryCounts: Record<string, number>;
  };
  return Object.values(manifest.categoryCounts).reduce((a, b) => a + b, 0);
}

describe("buildSearchIndex over the committed fixture corpus (CI-hermetic)", () => {
  it("page_count matches the fixture manifest's total entity count", async () => {
    const outDir = freshOutDir();
    const reader = createCorpusReader(fixtureCorpusRoot());
    const result = await buildSearchIndex(reader, outDir);

    const expected = fixtureEntityCount();
    expect(expected).toBeGreaterThan(0);
    expect(result.pageCount).toBe(expected);

    const entry = JSON.parse(readFileSync(join(outDir, "pagefind-entry.json"), "utf8")) as {
      languages: Record<string, { page_count: number }>;
    };
    const enPageCount = entry.languages.en?.page_count;
    expect(enPageCount).toBe(expected);
  });

  it("bundle anatomy: fragments/index/filter chunks + the runtime JS/wasm are present", async () => {
    const outDir = freshOutDir();
    const reader = createCorpusReader(fixtureCorpusRoot());
    await buildSearchIndex(reader, outDir);

    const top = readdirSync(outDir);
    expect(top).toContain("pagefind.js");
    expect(top).toContain("pagefind-entry.json");
    expect(top.some((f) => f.startsWith("wasm."))).toBe(true);

    const fragments = readdirSync(join(outDir, "fragment"));
    expect(fragments.length).toBe(fixtureEntityCount());
    expect(fragments.every((f) => f.endsWith(".pf_fragment"))).toBe(true);

    const indexChunks = readdirSync(join(outDir, "index"));
    expect(indexChunks.length).toBeGreaterThan(0);
    expect(indexChunks.every((f) => f.endsWith(".pf_index"))).toBe(true);
  });

  it("emits every declared filter: category, edition, superseded, traits, level, rarity", async () => {
    const outDir = freshOutDir();
    const reader = createCorpusReader(fixtureCorpusRoot());
    await buildSearchIndex(reader, outDir);

    // Pagefind writes one `.pf_filter` chunk file per distinct filter KEY
    // used across the whole index (opaque binary content — the filter
    // VALUES aren't independently introspectable outside the search
    // runtime) — six calling `filters` keys are wired in `build-search.ts`
    // (category/edition/superseded/traits always present; level/rarity only
    // when the entity carries one) and the fixture corpus has at least one
    // entity of each shape, so this asserts exactly 6 filter chunk files.
    const filterFiles = readdirSync(join(outDir, "filter"));
    expect(filterFiles.length).toBe(6);
    expect(filterFiles.every((f) => f.endsWith(".pf_filter"))).toBe(true);
  });

  it("url scheme round-trips the corpus id verbatim, including a legacy-suffixed one", async () => {
    const outDir = freshOutDir();
    const reader = createCorpusReader(fixtureCorpusRoot());

    // Confirm the fixture actually exercises a `@legacy` id before trusting
    // the build to have indexed it (the coverage-matrix guarantee documented
    // on `fixtures/entities/`, README).
    const categories = reader.categories();
    const legacyRow = categories
      .flatMap((c) => reader.index(c))
      .find((r) => r.id.includes("@legacy"));
    expect(legacyRow).toBeDefined();

    await buildSearchIndex(reader, outDir);
    // Every fragment file is a gzip-compressed JSON blob carrying its own
    // `url` — decompress each (small fixture, cheap) and look for an exact
    // `"url":"/<id>"` match rather than a loose substring search.
    const fragmentDir = join(outDir, "fragment");
    const wantedUrl = `"url":"/${legacyRow?.id}"`;
    const found = readdirSync(fragmentDir).some((f) =>
      gunzipSync(readFileSync(join(fragmentDir, f)))
        .toString("utf8")
        .includes(wantedUrl),
    );
    expect(found).toBe(true);
  });
});
