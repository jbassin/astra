import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { CORPUS_SCHEMA_VERSION } from "@astra/codex-corpus";
import { type CorpusReader, createCorpusReader } from "@astra/codex-corpus/reader";
import { loadConfig } from "@astra/config";
import { nodeTsResolveHook } from "@astra/site-kit/nodeTsResolveHook";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveClassRail } from "@/server/classPageData";
import { type ServedCorpus, selectServedCorpus } from "@/server/corpusFs";

/**
 * The opt-in real-corpus suite. Every other codex test reads the generated fixture
 * (the vitest setup pins `CODEX_CORPUS_ROOT`); this file checks the real corpus at
 * `<codex.data-path>/corpus` under the production rules, so it runs only with
 * `CODEX_REAL_CORPUS=1`: `just codex-real-corpus`, which builds first. Its assertions
 * are invariants of the real data, not pinned counts, so a refresh doesn't break them.
 */
const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_BUNDLE = path.join(APP_ROOT, "dist/server/server.js");
const RUNNER = path.join(APP_ROOT, "scripts/ssrSmoke.ts");

describe.runIf(process.env.CODEX_REAL_CORPUS === "1")("real corpus (opt-in)", () => {
  // Resolved in `beforeAll`, not at collection: vitest collects a skipped suite too.
  let corpus: ServedCorpus;
  let reader: CorpusReader;
  beforeAll(() => {
    corpus = selectServedCorpus({
      explicitRoot: undefined,
      dataPath: loadConfig().codex.dataPath,
      dev: false,
    });
    reader = createCorpusReader(corpus.root);
  });

  it("passes the production check: the config path, this schema generation, not the fixture", () => {
    expect(corpus.source).toBe("config");
    expect(corpus.schemaVersion).toBe(CORPUS_SCHEMA_VERSION);
    expect(corpus.fixture).toBe(false);
    expect(corpus.totalEntityCount).toBeGreaterThan(10_000);
  });

  it("has every fixture category and the entities the fixture samples", () => {
    expect(reader.categories().length).toBeGreaterThanOrEqual(88);
    for (const [category, slug] of [
      ["spell", "heal"],
      ["spell", "fireball"],
      ["feat", "camouflage-coat"],
      ["creature", "grick"],
    ] as const) {
      expect(reader.entity(category, slug).name, `${category}/${slug}`).toBeTruthy();
    }
  });

  it("has a class rail far larger than the fixture's 3 visible rows", () => {
    expect(resolveClassRail(reader).visible.length).toBeGreaterThan(10);
  });

  it("the built server renders an entity page from it", () => {
    expect(existsSync(SERVER_BUNDLE), "run `pnpm run build` first").toBe(true);
    const out = execFileSync("node", ["--import", nodeTsResolveHook, RUNNER], {
      cwd: APP_ROOT,
      encoding: "utf8",
      env: { ...process.env, CODEX_CORPUS_ROOT: corpus.root },
    });
    expect(out).toContain("status=200");
    expect(out).toContain("noRenderError=true");
  });
});
