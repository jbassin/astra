import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { main } from "./build-content";

// Proves the content pipeline is wired: running build-content emits the generated
// site module the app imports. Slice 2 extends this to the snapshot sources.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.resolve(HERE, "../src/generated/site.ts");
const PUBLIC = path.resolve(HERE, "../public");

describe("build-content", () => {
  // Run the full pipeline ONCE (slice 7 made it heavy — it renders 141 vellum
  // bodies + writes 76 ~1 MB transcript modules). Per-test `await main()` blew the
  // 5 s vitest default on slower CI runners; a generous beforeAll fixes it.
  beforeAll(async () => {
    await main();
  }, 120_000);

  it("emits the generated site module with the snapshot-derived page index + aliases", () => {
    expect(existsSync(GENERATED)).toBe(true);
    const out = readFileSync(GENERATED, "utf8");
    expect(out).toContain('title: "Akasha"');
    expect(out).toContain("export const PAGES");
    expect(out).toContain("export const EXPLORER_TREE");
    expect(out).toContain("export const ALIASES");
  });

  it("emits the rendered vellum bodies module (gothic + resolved crossrefs)", () => {
    const bodies = path.resolve(HERE, "../src/generated/bodies.ts");
    expect(existsSync(bodies)).toBe(true);
    const out = readFileSync(bodies, "utf8");
    expect(out).toContain("export const BODIES");
    expect(out).toContain("data-vellum-export");
  });

  it("emits the static endpoints into public/ at the faerrin paths (N2)", () => {
    expect(existsSync(path.join(PUBLIC, "index.xml"))).toBe(true);
    expect(existsSync(path.join(PUBLIC, "sitemap.xml"))).toBe(true);
    const idx = JSON.parse(readFileSync(path.join(PUBLIC, "static/contentIndex.json"), "utf8"));
    // 141 wiki + faerrin's 76 transcripts = 217 at cutover; the live pipeline keeps adding
    // session transcripts, so the index only grows (parity gates assert none are ever lost).
    expect(Object.keys(idx).length).toBeGreaterThanOrEqual(217);
  });
});
