// The write side of codex's immutable corpus releases (the layout is in
// `src/server/releases.ts`). Every function takes its directories as arguments, so the
// tests run against temp dirs; `scripts/release.ts` is the CLI over them.
//
// A release is built in `releases/.staging-*`, validated, hashed, renamed to
// `releases/<id>` and only then made current by swapping the `current` symlink with
// rename(2), which is atomic: a reader sees the old release or the new one, never a
// half-written tree. Nothing ever writes inside a published release. Files may be
// hardlinks shared with an older release (a search-only rebuild and the flat-corpus
// migration link instead of copying); that is safe because no writer edits a file in
// place: the transform and the indexer only create new files.

import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { parseRulesTreeFile, parseSourcesIndexFile } from "@astra/codex-corpus";

import { walkFiles } from "../src/ingest/fsWalk";
import { hashFileEntries, sha256Hex } from "../src/ingest/hash";
import { inspectCorpus } from "../src/server/corpusFs";
import {
  CURRENT_LINK,
  RELEASE_ID_RE,
  readCurrentReleaseId,
  releaseCorpusDir,
} from "../src/server/releases";

/** How many releases `publishRelease` keeps (the current one always among them). */
export const DEFAULT_KEEP = 3;

/** `releases/<id>/release.json`. */
export interface ReleaseRecord {
  id: string;
  createdAt: string;
  schemaVersion: number;
  totalEntityCount: number;
  foundryTag: string | null;
  aonSnapshotDate: string | null;
}

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseError";
  }
}

/** The release id of a staged tree: the snapshot pins' aggregate-hash rule
 * (`hashFileEntries`) over every file under `corpus/` and `search/`, cut to 16 hex
 * digits. `release.json` is not hashed, so republishing a tree gives the same id. Pagefind
 * writes some filter files differently on each run, so a full rebuild of the same corpus
 * gets a new id; `hashCorpusTree` is the stable one. */
export function hashReleaseTree(dir: string): string {
  return hashTops(dir, ["corpus", "search"]);
}

/** The same hash over `corpus/` alone. The corpus is byte-deterministic (two transforms of
 * the same snapshots match); the Pagefind index is not. */
export function hashCorpusTree(dir: string): string {
  return hashTops(dir, ["corpus"]);
}

function hashTops(dir: string, tops: readonly string[]): string {
  const entries = tops.flatMap((top) =>
    walkFiles(join(dir, top)).map((f) => ({
      relPath: `${top}/${f.relPath}`,
      sha256: sha256Hex(readFileSync(f.absPath)),
    })),
  );
  return hashFileEntries(entries).slice(0, 16);
}

interface ManifestCounts {
  categoryCounts?: Record<string, number>;
  totalEntityCount?: number;
  foundry?: { tag?: string };
  aon?: { snapshotDate?: string | null };
}

/** What a valid staged tree describes. */
export interface ValidatedRelease {
  schemaVersion: number;
  totalEntityCount: number;
  foundryTag: string | null;
  aonSnapshotDate: string | null;
}

/** The page count `pagefind-entry.json` records, summed over its languages. */
function pagefindPageCount(entryPath: string): number {
  let entry: { languages?: Record<string, { page_count?: unknown }> };
  try {
    entry = JSON.parse(readFileSync(entryPath, "utf8"));
  } catch (e) {
    throw new ReleaseError(`"${entryPath}" is not readable JSON: ${String(e)}`);
  }
  let pages = 0;
  for (const language of Object.values(entry.languages ?? {})) {
    if (typeof language.page_count !== "number") {
      throw new ReleaseError(`"${entryPath}" has a language without a page_count`);
    }
    pages += language.page_count;
  }
  return pages;
}

/** Checks a staged or published tree before it can become current. It runs the server's
 * own startup check (`inspectCorpus`: a readable manifest of this schema generation),
 * refuses the fixture, reconciles every category's entity files and `_index.json` with
 * the manifest counts, parses `rules-tree.json` and `sources-index.json`, and requires a
 * Pagefind index with one page per entity. Throws `ReleaseError` or
 * `CorpusUnservableError`. */
export function validateReleaseTree(dir: string): ValidatedRelease {
  const corpusDir = join(dir, "corpus");
  const inspected = inspectCorpus(corpusDir);
  if (inspected.fixture) {
    throw new ReleaseError(`"${corpusDir}" is the fixture corpus; a release holds the real one`);
  }
  const manifest = JSON.parse(
    readFileSync(join(corpusDir, "manifest.json"), "utf8"),
  ) as ManifestCounts;
  const counts = manifest.categoryCounts ?? {};
  let total = 0;
  for (const [category, expected] of Object.entries(counts)) {
    const categoryDir = join(corpusDir, category);
    if (!existsSync(join(categoryDir, "_index.json"))) {
      throw new ReleaseError(`category "${category}" has no _index.json in "${corpusDir}"`);
    }
    const files = readdirSync(categoryDir).filter(
      (name) => name.endsWith(".json") && name !== "_index.json",
    );
    if (files.length !== expected) {
      throw new ReleaseError(
        `category "${category}" has ${files.length} entity files; the manifest says ${expected}`,
      );
    }
    total += files.length;
  }
  if (total === 0 || total !== inspected.totalEntityCount) {
    throw new ReleaseError(
      `"${corpusDir}" holds ${total} entity files; the manifest says ` +
        `${inspected.totalEntityCount}`,
    );
  }
  for (const [file, parse] of [
    ["rules-tree.json", parseRulesTreeFile],
    ["sources-index.json", parseSourcesIndexFile],
  ] as const) {
    try {
      parse(JSON.parse(readFileSync(join(corpusDir, file), "utf8")));
    } catch (e) {
      throw new ReleaseError(`"${join(corpusDir, file)}" is missing or invalid: ${String(e)}`);
    }
  }
  const searchDir = join(dir, "search", "pagefind");
  for (const file of ["pagefind.js", "pagefind-entry.json"]) {
    if (!existsSync(join(searchDir, file))) {
      throw new ReleaseError(`no Pagefind index: "${join(searchDir, file)}" is missing`);
    }
  }
  // `build-search.ts` indexes exactly one page per entity, so the counts must match.
  const pages = pagefindPageCount(join(searchDir, "pagefind-entry.json"));
  if (pages !== total) {
    throw new ReleaseError(
      `the Pagefind index has ${pages} pages but the corpus has ${total} entities; ` +
        "rebuild the index from this corpus",
    );
  }
  return {
    schemaVersion: inspected.schemaVersion,
    totalEntityCount: total,
    foundryTag: manifest.foundry?.tag ?? null,
    aonSnapshotDate: manifest.aon?.snapshotDate ?? null,
  };
}

/** Copies `src` to `dst` as hardlinks (a plain copy across filesystems). */
export function linkTree(src: string, dst: string): void {
  for (const file of walkFiles(src)) {
    const to = join(dst, file.relPath);
    mkdirSync(dirname(to), { recursive: true });
    try {
      linkSync(file.absPath, to);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
      copyFileSync(file.absPath, to);
    }
  }
}

/** A fresh `releases/.staging-*` dir (same filesystem as the releases, so the publish
 * rename is atomic), world-readable like the rest of the tree (mkdtemp makes it 0700). */
export function newStagingDir(releasesDir: string): string {
  mkdirSync(releasesDir, { recursive: true });
  const staging = mkdtempSync(join(releasesDir, ".staging-"));
  chmodSync(staging, 0o755);
  return staging;
}

/** Who holds `releases/.lock`: `.lock/owner.json`. */
interface LockOwner {
  pid: number;
  /** The holder's start time in clock ticks since boot (`/proc/<pid>/stat` field 22), so
   * a reused pid is not mistaken for the holder. */
  procStart: string | null;
  startedAt: string;
}

/** `/proc/<pid>/stat` field 22, or null when the process is gone (or there is no /proc). */
export function processStartTicks(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // Fields after the parenthesised command name; field 22 is the 20th of them.
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] ?? null;
  } catch {
    return null;
  }
}

/** Whether a lock's recorded owner is still running. An owner file that is missing or
 * unreadable counts as live for 10 s (the holder may be between mkdir and write). */
function lockHeld(lock: string): boolean {
  let owner: LockOwner;
  try {
    owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8"));
  } catch {
    try {
      return Date.now() - statSync(lock).mtimeMs < 10_000;
    } catch {
      return false;
    }
  }
  const ticks = processStartTicks(owner.pid);
  return ticks !== null && (owner.procStart === null || ticks === owner.procStart);
}

/** Holds `releases/.lock` while `fn` runs, so two release operations never interleave. The
 * lock records its holder's pid and start time; a lock whose holder is gone (a crashed
 * build) is broken. Once held, leftover `.staging-*` and `.current-*` entries from before
 * this acquisition (a crashed build's) are deleted: only a lock holder creates them. */
export async function withReleaseLock<T>(
  releasesDir: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  mkdirSync(releasesDir, { recursive: true });
  const lock = join(releasesDir, ".lock");
  for (let attempt = 0; ; attempt++) {
    try {
      mkdirSync(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (attempt > 0 || lockHeld(lock)) {
        throw new ReleaseError(`another release operation holds "${lock}" (see its owner.json)`);
      }
      console.warn(`release: breaking the stale lock "${lock}" (its holder is gone)`);
      rmSync(lock, { recursive: true, force: true });
    }
  }
  const acquired = Date.now();
  const owner: LockOwner = {
    pid: process.pid,
    procStart: processStartTicks(process.pid),
    startedAt: new Date(acquired).toISOString(),
  };
  writeFileSync(join(lock, "owner.json"), `${JSON.stringify(owner)}\n`);
  try {
    for (const name of readdirSync(releasesDir)) {
      if (!name.startsWith(".staging-") && !name.startsWith(".current-")) continue;
      const path = join(releasesDir, name);
      if (lstatSync(path).mtimeMs < acquired) {
        console.warn(`release: removing ${path}, left by an earlier operation`);
        rmSync(path, { recursive: true, force: true });
      }
    }
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Points `current` at `id`, atomically: a new symlink renamed over the old one. */
export function switchCurrent(releasesDir: string, id: string): void {
  if (!RELEASE_ID_RE.test(id) || !existsSync(join(releasesDir, id))) {
    throw new ReleaseError(`no release "${id}" in "${releasesDir}"`);
  }
  const tmp = join(releasesDir, `.current-${process.pid}-${Date.now()}`);
  symlinkSync(id, tmp);
  renameSync(tmp, join(releasesDir, CURRENT_LINK));
}

export interface ListedRelease extends ReleaseRecord {
  current: boolean;
}

/** Every published release, newest first (by `createdAt`, then id). */
export function listReleases(releasesDir: string): ListedRelease[] {
  if (!existsSync(releasesDir)) return [];
  const current = readCurrentReleaseId(releasesDir);
  const releases: ListedRelease[] = [];
  for (const name of readdirSync(releasesDir)) {
    if (!RELEASE_ID_RE.test(name) || !statSync(join(releasesDir, name)).isDirectory()) continue;
    let record: ReleaseRecord;
    try {
      record = JSON.parse(readFileSync(join(releasesDir, name, "release.json"), "utf8"));
    } catch {
      record = {
        id: name,
        createdAt: "",
        schemaVersion: 0,
        totalEntityCount: 0,
        foundryTag: null,
        aonSnapshotDate: null,
      };
    }
    releases.push({ ...record, id: name, current: name === current });
  }
  return releases.sort((a, b) =>
    a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : a.id < b.id ? 1 : -1,
  );
}

/** `releases/rejected/<id>`: a release a rollback left, as `{rejectedAt, corpusHash}`.
 * Kept after the release is pruned, so a rebuild of it is refused too. */
interface RejectedMarker {
  rejectedAt: string;
  corpusHash: string;
}

function rejectedDir(releasesDir: string): string {
  return join(releasesDir, "rejected");
}

function readRejected(releasesDir: string): Map<string, RejectedMarker> {
  const markers = new Map<string, RejectedMarker>();
  const dir = rejectedDir(releasesDir);
  if (!existsSync(dir)) return markers;
  for (const id of readdirSync(dir)) {
    try {
      markers.set(id, JSON.parse(readFileSync(join(dir, id), "utf8")) as RejectedMarker);
    } catch {
      // An unreadable marker still rejects its id.
      markers.set(id, { rejectedAt: "an unknown time", corpusHash: "" });
    }
  }
  return markers;
}

/** When `id` was rolled back away from, or null if it never was. */
export function rejectedAt(releasesDir: string, id: string): string | null {
  return readRejected(releasesDir).get(id)?.rejectedAt ?? null;
}

/** The corpus hash of a release, or "" (with a warning) when its tree is damaged or
 * unreadable: a damaged release must never block a rollback or a publish. */
function corpusHashOrEmpty(releasesDir: string, id: string): string {
  try {
    return hashCorpusTree(join(releasesDir, id));
  } catch (e) {
    console.warn(`release: cannot hash the corpus of release ${id}: ${String(e)}`);
    return "";
  }
}

/** Best effort: the rollback has already switched, so a failure here only warns. */
function markRejected(releasesDir: string, id: string): void {
  const marker: RejectedMarker = {
    rejectedAt: new Date().toISOString(),
    corpusHash: corpusHashOrEmpty(releasesDir, id),
  };
  mkdirSync(rejectedDir(releasesDir), { recursive: true });
  writeFileSync(join(rejectedDir(releasesDir), id), `${JSON.stringify(marker)}\n`);
}

/** Refuses to make the tree at `dir` (release `id`) current when a rollback rejected that
 * id or a release with the same corpus, unless `force`, which clears those marks. The
 * corpus is compared as well as the id because the Pagefind index is not byte-stable: a
 * rebuild of the same corpus gets a new id. */
function checkNotRejected(releasesDir: string, dir: string, id: string, force: boolean): void {
  const markers = readRejected(releasesDir);
  if (markers.size === 0) return;
  const corpusHash = hashCorpusTree(dir);
  // The current release's corpus is accepted as served: a rebuild of it (a new index over
  // the same corpus) is checked by id only.
  const current = readCurrentReleaseId(releasesDir);
  const currentCorpus = current === null ? null : corpusHashOrEmpty(releasesDir, current);
  const byCorpus = corpusHash !== currentCorpus;
  const hits = [...markers].filter(
    ([rid, m]) => rid === id || (byCorpus && m.corpusHash !== "" && m.corpusHash === corpusHash),
  );
  if (hits.length === 0) return;
  if (!force) {
    const [rid, m] = hits[0] ?? ["", { rejectedAt: "" }];
    const what =
      rid === id ? `release ${id}` : `release ${id} has the corpus of release ${rid}, which`;
    throw new ReleaseError(
      `${what} was rolled back on ${m.rejectedAt}; pass --force to make it current again`,
    );
  }
  for (const [rid] of hits) rmSync(join(rejectedDir(releasesDir), rid), { force: true });
}

/** Removes all but the `keep` newest releases. Never removes the current one or any id in
 * `protect` (the release a running server serves). Rejected releases don't count toward
 * `keep`, so they go before a good older one. */
export function pruneReleases(
  releasesDir: string,
  keep: number,
  protect: readonly string[] = [],
): string[] {
  const removed: string[] = [];
  const rejected = readRejected(releasesDir);
  let kept = 0;
  for (const release of listReleases(releasesDir)) {
    if (release.current || protect.includes(release.id)) {
      kept += 1;
      continue;
    }
    if (!rejected.has(release.id) && kept < keep) {
      kept += 1;
      continue;
    }
    rmSync(join(releasesDir, release.id), { recursive: true, force: true });
    removed.push(release.id);
  }
  return removed;
}

/** The entity count of the current release, read leniently (an older schema generation's
 * manifest still has the field). Null when there is no current release. */
function currentEntityCount(releasesDir: string): { id: string; count: number } | null {
  const id = readCurrentReleaseId(releasesDir);
  if (id === null) return null;
  try {
    const manifest = JSON.parse(
      readFileSync(join(releaseCorpusDir(releasesDir, id), "manifest.json"), "utf8"),
    ) as ManifestCounts;
    return { id, count: manifest.totalEntityCount ?? 0 };
  } catch (e) {
    // A damaged current release must not block publishing its replacement.
    console.warn(`release: cannot read the current release ${id}'s manifest: ${String(e)}`);
    return { id, count: 0 };
  }
}

export interface PublishOptions {
  releasesDir: string;
  stagingDir: string;
  /** Accept a release with fewer entities than the current one. */
  allowShrink?: boolean;
  /** Make a release current even though a rollback rejected it. */
  force?: boolean;
  keep?: number;
  /** Releases pruning must keep (the one a running server serves). Null skips pruning,
   * for when that release is unknown. */
  protect: readonly string[] | null;
  now?: () => Date;
}

export interface PublishResult {
  id: string;
  previous: string | null;
  /** `published`: a new release went current. `existing`: an identical release was on disk
   * already and went current. `unchanged`: it was already current. */
  outcome: "published" | "existing" | "unchanged";
  totalEntityCount: number;
  pruned: string[];
}

/** Validates `stagingDir`, moves it to `releases/<id>`, makes it current and prunes. The
 * staging dir is gone afterwards whatever the outcome, except when validation fails (it is
 * left for inspection; the caller removes it). */
export function publishRelease(opts: PublishOptions): PublishResult {
  const { releasesDir, stagingDir, allowShrink = false, force = false } = opts;
  const { keep = DEFAULT_KEEP, protect } = opts;
  const now = opts.now ?? (() => new Date());
  const validated = validateReleaseTree(stagingDir);
  const current = currentEntityCount(releasesDir);
  if (current && !allowShrink && validated.totalEntityCount < current.count) {
    throw new ReleaseError(
      `the new build has ${validated.totalEntityCount} entities, fewer than the current ` +
        `release ${current.id} (${current.count}). Check the transform report; pass ` +
        "--allow-shrink if the drop is expected.",
    );
  }
  const id = hashReleaseTree(stagingDir);
  if (current?.id !== id) checkNotRejected(releasesDir, stagingDir, id, force);
  const target = join(releasesDir, id);
  let outcome: PublishResult["outcome"];
  if (existsSync(target)) {
    rmSync(stagingDir, { recursive: true, force: true });
    outcome = current?.id === id ? "unchanged" : "existing";
  } else {
    const record: ReleaseRecord = { id, createdAt: now().toISOString(), ...validated };
    writeFileSync(join(stagingDir, "release.json"), `${JSON.stringify(record, null, 2)}\n`);
    renameSync(stagingDir, target);
    outcome = "published";
  }
  if (outcome !== "unchanged") switchCurrent(releasesDir, id);
  const pruned = protect === null ? [] : pruneReleases(releasesDir, keep, protect);
  return {
    id,
    previous: current?.id ?? null,
    outcome,
    totalEntityCount: validated.totalEntityCount,
    pruned,
  };
}

/** Makes an older release current again: `id`, or by default the newest release older
 * than the current one that no rollback rejected. The target passes `validateReleaseTree`
 * first, so a release of another schema generation is refused, and a rejected target needs
 * `force`. The release left behind is marked rejected, so neither a rebuild that hashes to
 * it nor a later rollback brings it back by accident. Prunes nothing. */
export function rollbackRelease(
  releasesDir: string,
  id?: string,
  force = false,
): { from: string | null; to: string } {
  const releases = listReleases(releasesDir);
  const currentIndex = releases.findIndex((r) => r.current);
  const from = currentIndex === -1 ? null : (releases[currentIndex]?.id ?? null);
  const to =
    id ?? releases.slice(currentIndex + 1).find((r) => rejectedAt(releasesDir, r.id) === null)?.id;
  if (to === undefined) {
    throw new ReleaseError(
      `no release older than ${from ?? "(none)"} to roll back to; see \`just codex-releases\``,
    );
  }
  if (!releases.some((r) => r.id === to)) {
    throw new ReleaseError(`no release "${to}" in "${releasesDir}"`);
  }
  if (to === from) throw new ReleaseError(`release ${to} is already current`);
  validateReleaseTree(join(releasesDir, to));
  checkNotRejected(releasesDir, join(releasesDir, to), to, force);
  // Switch first: the release being left may be damaged, and marking it must not block
  // the emergency path.
  switchCurrent(releasesDir, to);
  if (from !== null) {
    try {
      markRejected(releasesDir, from);
    } catch (e) {
      console.warn(`release: rolled back, but could not mark ${from} rejected: ${String(e)}`);
    }
  }
  return { from, to };
}

/** The one-time move from the flat layout (`<dataPath>/corpus`, `<dataPath>/search`) to a
 * first release. The flat dirs are hardlinked, not moved, so a server still mounting them
 * keeps working; remove them once the new layout is live. Returns null when a current
 * release exists already. */
export function migrateFlatCorpus(
  dataPath: string,
  releasesDir: string,
  now?: () => Date,
): PublishResult | null {
  if (readCurrentReleaseId(releasesDir) !== null) return null;
  const flatCorpus = join(dataPath, "corpus");
  const flatSearch = join(dataPath, "search", "pagefind");
  for (const dir of [flatCorpus, flatSearch]) {
    if (!existsSync(dir)) throw new ReleaseError(`no flat corpus to migrate: "${dir}" is missing`);
  }
  const staging = newStagingDir(releasesDir);
  try {
    linkTree(flatCorpus, join(staging, "corpus"));
    linkTree(flatSearch, join(staging, "search", "pagefind"));
    // The first release: there is nothing older to prune or protect.
    return publishRelease({
      releasesDir,
      stagingDir: staging,
      allowShrink: true,
      now,
      protect: [],
    });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Hardlinks the current release's corpus into `stagingDir/corpus`, for a search-only
 * rebuild. */
export function stageCurrentCorpus(releasesDir: string, stagingDir: string): string {
  const id = readCurrentReleaseId(releasesDir);
  if (id === null) throw new ReleaseError(`no current release in "${releasesDir}" to reuse`);
  linkTree(releaseCorpusDir(releasesDir, id), join(stagingDir, "corpus"));
  return id;
}
