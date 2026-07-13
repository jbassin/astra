/**
 * Snapshots the foundryvtt/pf2e repo at the pinned tag (read from the committed
 * manifest, D29-4) to `<dataPath>/snapshots/foundry/<tag>/` (D29-5). Shallow blobless
 * sparse clone into a scratch dir under `<dataPath>/tmp/`, copies only the paths P1
 * needs, then deletes the clone. Run via:
 *
 *   pnpm --filter @astra/codex fetch:foundry
 *
 * The repo also carries an `sf2e` (Starfinder) tree — explicitly out of scope (spec
 * §7): only `packs/pf2e/` is ever fetched, never `packs/sf2e/`.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";

import { copyTree, countFoundryDocs } from "../src/ingest/foundrySnapshot";
import { hashDirectory } from "../src/ingest/hash";
import {
  type CorpusManifest,
  emptyManifest,
  parseManifest,
  serializeManifest,
} from "../src/schema/manifest";

const REPO_URL = "https://github.com/foundryvtt/pf2e.git";

// What P1 needs out of the repo (D29-5): the pf2e pack tree ONLY (packs/sf2e/ is a
// sibling tree, out of scope — see module doc above); every locale file under
// static/lang/ (re-en.json alone resolves more @Localize keys than en.json); the
// packs name→path registry (verified filename: system.pf2e.json, at the repo root);
// and the sluggify port source (D29-1) — NOT included in the packs sparse clone, so
// it's fetched here.
const SNAPSHOT_ENTRIES: ReadonlyArray<{ rel: string; kind: "dir" | "file" }> = [
  { rel: "packs/pf2e", kind: "dir" },
  { rel: "static/lang", kind: "dir" },
  { rel: "system.pf2e.json", kind: "file" },
  { rel: "src/util/misc.ts", kind: "file" },
];

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus-manifest.json");

function readManifest(): CorpusManifest {
  if (!existsSync(MANIFEST_PATH)) return emptyManifest();
  return parseManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
}

/**
 * Thin git wrapper — no logic worth unit-testing lives here, just the two CLI calls
 * (shallow blobless sparse clone, then a non-cone `sparse-checkout set` of the exact
 * paths above). All counting/hashing/copy logic lives in `src/ingest` and is what's
 * actually tested (hermetically, with temp-dir fixtures — no git, no network).
 */
function sparseClone(tag: string, destDir: string): void {
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", tag, REPO_URL, destDir],
    { stdio: "inherit" },
  );
  const patterns = SNAPSHOT_ENTRIES.map((e) => (e.kind === "dir" ? `/${e.rel}/` : `/${e.rel}`));
  execFileSync("git", ["sparse-checkout", "set", "--no-cone", ...patterns], {
    cwd: destDir,
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const manifest = readManifest();
  const tag = manifest.foundry.tag;

  const tmpRoot = join(cfg.codex.dataPath, "tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const cloneDir = mkdtempSync(join(tmpRoot, "foundry-"));

  try {
    sparseClone(tag, cloneDir);

    const snapshotDir = join(cfg.codex.dataPath, "snapshots", "foundry", tag);
    mkdirSync(snapshotDir, { recursive: true });

    for (const entry of SNAPSHOT_ENTRIES) {
      const src = join(cloneDir, ...entry.rel.split("/"));
      const dest = join(snapshotDir, ...entry.rel.split("/"));
      if (!existsSync(src)) {
        throw new Error(`expected path missing from sparse clone: ${entry.rel} (tag ${tag})`);
      }
      if (entry.kind === "dir") {
        copyTree(src, dest);
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
      }
    }

    const docCount = countFoundryDocs(join(snapshotDir, "packs", "pf2e"));
    const sha256 = hashDirectory(snapshotDir);

    manifest.foundry = { tag, docCount, sha256, fetchedAt: new Date().toISOString() };
    writeFileSync(MANIFEST_PATH, serializeManifest(manifest));
    console.log(`Foundry snapshot complete: ${docCount} docs at tag ${tag}`);
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error(`fetch-foundry failed: ${String(e)}`);
  process.exit(1);
});
