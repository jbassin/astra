import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CORPUS_SCHEMA_VERSION } from "@astra/codex-corpus";
import { readCurrentReleaseId } from "@astra/codex-corpus/releases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureCorpusRoot } from "./fixtureCorpus";
import {
  hashReleaseTree,
  listReleases,
  migrateFlatCorpus,
  newStagingDir,
  processStartTicks,
  pruneReleases,
  publishRelease,
  rejectedAt,
  rollbackRelease,
  stageCurrentCorpus,
  validateReleaseTree,
  switchCurrent,
  withReleaseLock,
} from "./releaseStore";

let work: string;
let releasesDir: string;
let clock: number;
const now = () => new Date(Date.UTC(2026, 9, 24, 0, 0, clock++));

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "codex-releases-"));
  releasesDir = join(work, "releases");
  clock = 0;
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

/** A valid release tree at `dir`: the fixture corpus relabelled as a real one, and a stub
 * Pagefind index whose entry file carries `marker` (so builds can differ). */
function writeTree(dir: string, marker = "a"): string {
  cpSync(fixtureCorpusRoot(), join(dir, "corpus"), { recursive: true });
  const manifestPath = join(dir, "corpus", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.foundry.tag = "pf2e-test";
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const search = join(dir, "search", "pagefind");
  mkdirSync(search, { recursive: true });
  writeFileSync(join(search, "pagefind.js"), "export {};\n");
  // The marker goes in the corpus too, so trees of different markers differ in corpus.
  writeFileSync(join(dir, "corpus", "report.md"), `${marker}\n`);
  writeEntry(dir, manifest.totalEntityCount, marker);
  return dir;
}

/** A stub `pagefind-entry.json` recording `pages` pages. */
function writeEntry(dir: string, pages: number, marker = "a"): void {
  writeFileSync(
    join(dir, "search", "pagefind", "pagefind-entry.json"),
    JSON.stringify({ marker, languages: { en: { page_count: pages } } }),
  );
}

function stage(marker = "a"): string {
  return writeTree(newStagingDir(releasesDir), marker);
}

function publish(marker = "a", allowShrink = false) {
  return publishRelease({ releasesDir, stagingDir: stage(marker), allowShrink, now, protect: [] });
}

/** Removes one entity file and its manifest count, so the tree stays valid but smaller. */
function shrink(dir: string): void {
  const manifestPath = join(dir, "corpus", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const file = readdirSync(join(dir, "corpus", "spell")).find((f) => f !== "_index.json");
  rmSync(join(dir, "corpus", "spell", file ?? ""));
  manifest.categoryCounts.spell -= 1;
  manifest.totalEntityCount -= 1;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeEntry(dir, manifest.totalEntityCount, "shrunk");
}

describe("validateReleaseTree", () => {
  it("accepts a complete tree and reports its counts", () => {
    expect(validateReleaseTree(writeTree(join(work, "t")))).toMatchObject({
      schemaVersion: CORPUS_SCHEMA_VERSION,
      totalEntityCount: 235,
      foundryTag: "pf2e-test",
    });
  });

  it("refuses the fixture corpus", () => {
    const dir = join(work, "t");
    cpSync(fixtureCorpusRoot(), join(dir, "corpus"), { recursive: true });
    expect(() => validateReleaseTree(dir)).toThrow(/fixture corpus/);
  });

  it("refuses a corpus of another schema generation", () => {
    const dir = writeTree(join(work, "t"));
    const manifestPath = join(dir, "corpus", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.schemaVersion = CORPUS_SCHEMA_VERSION - 1;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => validateReleaseTree(dir)).toThrow(/schemaVersion/);
  });

  it("refuses entity files that disagree with the manifest", () => {
    const dir = writeTree(join(work, "t"));
    const file = readdirSync(join(dir, "corpus", "spell")).find((f) => f !== "_index.json");
    rmSync(join(dir, "corpus", "spell", file ?? ""));
    expect(() => validateReleaseTree(dir)).toThrow(/category "spell" has/);
  });

  it("refuses an index whose page count differs from the entity count", () => {
    const dir = writeTree(join(work, "t"));
    writeEntry(dir, 234);
    expect(() => validateReleaseTree(dir)).toThrow(/234 pages but the corpus has 235/);
  });

  it("refuses a tree without a Pagefind index", () => {
    const dir = writeTree(join(work, "t"));
    rmSync(join(dir, "search"), { recursive: true });
    expect(() => validateReleaseTree(dir)).toThrow(/no Pagefind index/);
  });
});

describe("hashReleaseTree", () => {
  it("is the same for identical trees, ignores release.json, and tracks content", () => {
    const a = writeTree(join(work, "a"));
    const b = writeTree(join(work, "b"));
    writeFileSync(join(b, "release.json"), "{}");
    expect(hashReleaseTree(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashReleaseTree(b)).toBe(hashReleaseTree(a));
    expect(hashReleaseTree(writeTree(join(work, "c"), "other"))).not.toBe(hashReleaseTree(a));
  });
});

describe("publishRelease", () => {
  it("publishes, switches current, and is idempotent for an identical build", () => {
    const first = publish("a");
    expect(first).toMatchObject({ outcome: "published", previous: null, totalEntityCount: 235 });
    expect(readlinkSync(join(releasesDir, "current"))).toBe(first.id);
    const record = JSON.parse(readFileSync(join(releasesDir, first.id, "release.json"), "utf8"));
    expect(record).toMatchObject({ id: first.id, totalEntityCount: 235, foundryTag: "pf2e-test" });

    const second = publish("b");
    expect(second).toMatchObject({ outcome: "published", previous: first.id });
    expect(readCurrentReleaseId(releasesDir)).toBe(second.id);

    expect(publish("b")).toMatchObject({ outcome: "unchanged", id: second.id });
    expect(publish("a")).toMatchObject({ outcome: "existing", id: first.id });
    expect(readCurrentReleaseId(releasesDir)).toBe(first.id);
    expect(readdirSync(releasesDir).filter((n) => n.startsWith(".staging-"))).toEqual([]);
  });

  it("refuses a smaller build unless allowed, leaving current alone", () => {
    const first = publish("a");
    const staging = stage("b");
    shrink(staging);
    expect(() => publishRelease({ releasesDir, stagingDir: staging, now, protect: [] })).toThrow(
      /fewer than the current release/,
    );
    expect(readCurrentReleaseId(releasesDir)).toBe(first.id);
    const smaller = publishRelease({
      releasesDir,
      stagingDir: staging,
      allowShrink: true,
      now,
      protect: [],
    });
    expect(smaller).toMatchObject({ outcome: "published", totalEntityCount: 234 });
  });

  it("keeps the newest releases and never prunes the current one", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((m) => publish(m).id);
    expect(listReleases(releasesDir).map((r) => r.id)).toEqual([d, c, b]);
    expect(existsSync(join(releasesDir, a ?? ""))).toBe(false);
    rollbackRelease(releasesDir, b); // d is rejected: it doesn't count toward keep
    expect(pruneReleases(releasesDir, 2)).toEqual([d]);
    expect(listReleases(releasesDir).map((r) => [r.id, r.current])).toEqual([
      [c, false],
      [b, true],
    ]);
  });
});

describe("rollbackRelease", () => {
  it("goes back to the previous release by default, or to a named one", () => {
    const [a, b, c] = ["a", "b", "c"].map((m) => publish(m).id);
    expect(rollbackRelease(releasesDir)).toEqual({ from: c, to: b });
    expect(rollbackRelease(releasesDir)).toEqual({ from: b, to: a });
    expect(() => rollbackRelease(releasesDir)).toThrow(/no release older/);
    expect(() => rollbackRelease(releasesDir, c)).toThrow(/was rolled back on .* --force/);
    expect(rollbackRelease(releasesDir, c, true)).toEqual({ from: a, to: c });
    expect(rejectedAt(releasesDir, c ?? "")).toBeNull();
    expect(rejectedAt(releasesDir, a ?? "")).not.toBeNull();
    expect(() => rollbackRelease(releasesDir, "0123456789abcdef")).toThrow(/no release/);
  });

  it("refuses a target that no longer passes validation", () => {
    const a = publish("a").id;
    publish("b");
    rmSync(join(releasesDir, a, "search"), { recursive: true });
    expect(() => rollbackRelease(releasesDir, a)).toThrow(/no Pagefind index/);
  });
});

describe("migrateFlatCorpus", () => {
  it("hardlinks the flat corpus and index into a first release and leaves them intact", () => {
    const dataPath = join(work, "data");
    writeTree(dataPath);
    const result = migrateFlatCorpus(dataPath, releasesDir, now);
    expect(result).toMatchObject({ outcome: "published", previous: null });
    const id = readCurrentReleaseId(releasesDir) ?? "";
    expect(id).toBe(result?.id);
    const flat = join(dataPath, "corpus", "manifest.json");
    const released = join(releasesDir, id, "corpus", "manifest.json");
    expect(statSync(released).ino).toBe(statSync(flat).ino);
    expect(existsSync(join(releasesDir, id, "search", "pagefind", "pagefind.js"))).toBe(true);
    expect(migrateFlatCorpus(dataPath, releasesDir, now)).toBeNull();
  });
});

describe("a damaged current release", () => {
  it("never blocks a rollback or the next publish", () => {
    const a = publish("a").id;
    const b = publish("b").id;
    // Damage b: its corpus can no longer be walked or read.
    rmSync(join(releasesDir, b, "corpus"), { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rollbackRelease(releasesDir)).toEqual({ from: b, to: a });
    expect(readCurrentReleaseId(releasesDir)).toBe(a);
    expect(rejectedAt(releasesDir, b)).not.toBeNull();
    // Back on b by hand (as if it were current and broken): a new build still publishes.
    switchCurrent(releasesDir, b);
    expect(publish("c").outcome).toBe("published");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("rejected releases", () => {
  it("a rollback marks the release it leaves, and a rebuild to it needs force", () => {
    const a = publish("a").id;
    const b = publish("b").id;
    expect(rollbackRelease(releasesDir)).toEqual({ from: b, to: a });
    expect(rejectedAt(releasesDir, b)).not.toBeNull();
    expect(() => publish("b")).toThrow(new RegExp(`release ${b} was rolled back`));
    expect(readCurrentReleaseId(releasesDir)).toBe(a);
    const forced = publishRelease({
      releasesDir,
      stagingDir: stage("b"),
      force: true,
      now,
      protect: [],
    });
    expect(forced).toMatchObject({ id: b, outcome: "existing" });
    expect(rejectedAt(releasesDir, b)).toBeNull();
  });

  it("refuses a rebuild of a rejected release's corpus even when its index differs", () => {
    const a = publish("a").id;
    const b = publish("b").id;
    rollbackRelease(releasesDir);
    // Same corpus as b, a different (non-deterministic) index, hence a different id.
    const staging = stage("b");
    writeEntry(staging, 235, "rebuilt");
    expect(() => publishRelease({ releasesDir, stagingDir: staging, now, protect: [] })).toThrow(
      new RegExp(`has the corpus of release ${b}, which was rolled back`),
    );
    expect(readCurrentReleaseId(releasesDir)).toBe(a);
    const forced = publishRelease({
      releasesDir,
      stagingDir: staging,
      force: true,
      now,
      protect: [],
    });
    expect(forced.outcome).toBe("published");
    expect(rejectedAt(releasesDir, b)).toBeNull();
  });

  it("allows a new index over the current corpus even if a rejected release shares it", () => {
    const a = publish("a").id;
    const again = stage("a");
    writeEntry(again, 235, "second index");
    const a2 = publishRelease({ releasesDir, stagingDir: again, now, protect: [] }).id;
    expect(rollbackRelease(releasesDir)).toEqual({ from: a2, to: a });
    const third = stage("a");
    writeEntry(third, 235, "third index");
    expect(publishRelease({ releasesDir, stagingDir: third, now, protect: [] }).outcome).toBe(
      "published",
    );
  });

  it("the default rollback target skips rejected releases", () => {
    const [a, b, c] = ["a", "b", "c"].map((m) => publish(m).id);
    rollbackRelease(releasesDir, b); // c rejected, b current
    rollbackRelease(releasesDir, c, true); // b rejected, c current
    expect(rollbackRelease(releasesDir)).toEqual({ from: c, to: a });
  });
});

describe("pruning keeps the served release", () => {
  it("never prunes a protected id, and protect: null prunes nothing", () => {
    const [a, b] = ["a", "b"].map((m) => publish(m).id);
    const c = publishRelease({ releasesDir, stagingDir: stage("c"), now, protect: null }).id;
    expect(pruneReleases(releasesDir, 1, [a ?? ""])).toEqual([b]);
    expect(listReleases(releasesDir).map((r) => r.id)).toEqual([c, a]);
    const d = publishRelease({ releasesDir, stagingDir: stage("d"), now, protect: null });
    expect(d.pruned).toEqual([]);
    expect(listReleases(releasesDir)).toHaveLength(3);
  });
});

describe("stageCurrentCorpus and withReleaseLock", () => {
  it("links the current corpus into a staging dir", () => {
    const id = publish("a").id;
    const staging = newStagingDir(releasesDir);
    expect(stageCurrentCorpus(releasesDir, staging)).toBe(id);
    expect(statSync(join(staging, "corpus", "manifest.json")).ino).toBe(
      statSync(join(releasesDir, id, "corpus", "manifest.json")).ino,
    );
  });

  it("refuses a second operation while one holds the lock", async () => {
    await withReleaseLock(releasesDir, async () => {
      await expect(withReleaseLock(releasesDir, () => 1)).rejects.toThrow(/another release/);
    });
    await expect(withReleaseLock(releasesDir, () => 2)).resolves.toBe(2);
    expect(existsSync(join(releasesDir, ".lock"))).toBe(false);
  });

  it("refuses a lock whose holder is alive", async () => {
    mkdirSync(join(releasesDir, ".lock"), { recursive: true });
    writeFileSync(
      join(releasesDir, ".lock", "owner.json"),
      JSON.stringify({ pid: process.pid, procStart: processStartTicks(process.pid) }),
    );
    await expect(withReleaseLock(releasesDir, () => 1)).rejects.toThrow(/another release/);
  });

  it("breaks a lock whose holder is gone and removes its staging leftovers", async () => {
    const dead = spawnSync(process.execPath, ["-e", ""]).pid ?? 0;
    const leftover = newStagingDir(releasesDir);
    mkdirSync(join(releasesDir, ".lock"));
    writeFileSync(
      join(releasesDir, ".lock", "owner.json"),
      JSON.stringify({ pid: dead, procStart: "1" }),
    );
    const leftoverSurvived = await withReleaseLock(releasesDir, () => existsSync(leftover));
    expect(leftoverSurvived).toBe(false);
    // A live pid with another start time is a reused pid, not the holder.
    mkdirSync(join(releasesDir, ".lock"));
    writeFileSync(
      join(releasesDir, ".lock", "owner.json"),
      JSON.stringify({ pid: process.pid, procStart: "1" }),
    );
    await expect(withReleaseLock(releasesDir, () => 3)).resolves.toBe(3);
  });
});
