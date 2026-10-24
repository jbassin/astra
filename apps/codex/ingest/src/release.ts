// The codex release CLI (`codex-ingest release <command>`, `cli.ts`; the `just codex-*`
// recipes call it). Host-only: it reads the snapshots and writes releases under
// `codex.data-path`. The release layout is in `@astra/codex-corpus/releases`, the
// operations in `releaseStore.ts`.
//
//   build [--allow-shrink]    transform + search index into a staging dir, then publish
//   build --reuse-corpus      rebuild only the search index over the current corpus
//   rollback [<id>]           make an older release current (default: the previous one)
//                             and mark the one it leaves rejected
//   list                      the releases on disk, newest first
//   migrate                   one-time: the flat corpus/ + search/ become the first release
//
// `--data-path <dir>` overrides `codex.data-path`, for a scratch copy. A build reads the
// snapshots from `codex.data-path` either way (the transform has no override). `--force`
// lets a build or rollback make a rejected release current again. After a publish, the
// releases beyond the newest 3 are pruned, except the one the running codex serves (read
// from its `/healthz`; `--server <origin>` overrides the config port). When codex does not
// answer, nothing is pruned.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { releaseCorpusDir, releasesDirOf } from "@astra/codex-corpus/releases";
import { loadConfig } from "@astra/config";

import {
  DEFAULT_KEEP,
  type PublishResult,
  listReleases,
  migrateFlatCorpus,
  newStagingDir,
  publishRelease,
  pruneReleases,
  rejectedAt,
  rollbackRelease,
  stageCurrentCorpus,
  withReleaseLock,
} from "./releaseStore";

const CLI = join(import.meta.dirname, "cli.ts");
// The CLI is TypeScript, so each command runs under tsx, resolved from this package.
const TSX_LOADER = createRequire(import.meta.url).resolve("tsx");

/** Runs one CLI command in its own process (the indexer alone peaks at about 3.8 GB RSS,
 * so the two steps don't share a heap). */
function runCommand(command: string, args: string[]): void {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI, command, ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (exit ${result.status ?? result.signal})`);
  }
}

function report(result: PublishResult): void {
  const verb = {
    published: "published and switched to",
    existing: "switched to the identical, already published",
    unchanged: "nothing to do; the build is identical to the current",
  }[result.outcome];
  console.log(
    `release: ${verb} release ${result.id} (${result.totalEntityCount} entities; ` +
      `previous ${result.previous ?? "none"})`,
  );
  if (result.pruned.length > 0) console.log(`release: pruned ${result.pruned.join(", ")}`);
}

/** The release the running codex at `server` serves, from its `/healthz`: an id, null for
 * a server on an explicit corpus root, or undefined when it does not answer. */
async function servedReleaseId(server: string): Promise<string | null | undefined> {
  try {
    const res = await fetch(new URL("/healthz", server), { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return undefined;
    // Only a codex /healthz is an answer: it always carries `releaseId` (a string, or null
    // for an explicit corpus root). Anything else on the port means "unknown".
    const body = (await res.json()) as unknown;
    if (typeof body !== "object" || body === null || !("releaseId" in body)) return undefined;
    const { releaseId } = body;
    if (typeof releaseId === "string") return releaseId;
    return releaseId === null ? null : undefined;
  } catch {
    return undefined;
  }
}

/** Prunes to the newest `DEFAULT_KEEP`, keeping whatever the running codex serves. Asked
 * after the switch, so the server has already moved to the new release if it accepts it. */
async function pruneKeepingServed(releasesDir: string, server: string): Promise<void> {
  const served = await servedReleaseId(server);
  if (served === undefined) {
    console.log(`release: codex at ${server} did not answer /healthz; pruning nothing`);
    return;
  }
  const pruned = pruneReleases(releasesDir, DEFAULT_KEEP, served === null ? [] : [served]);
  console.log(
    `release: codex serves ${served ?? "no release"}; ${
      pruned.length > 0 ? `pruned ${pruned.join(", ")}` : "nothing to prune"
    }`,
  );
}

interface BuildOptions {
  allowShrink: boolean;
  reuseCorpus: boolean;
  force: boolean;
  server: string;
}

async function build(releasesDir: string, opts: BuildOptions) {
  const { allowShrink, reuseCorpus, force, server } = opts;
  await withReleaseLock(releasesDir, async () => {
    const staging = newStagingDir(releasesDir);
    console.log(`release: building in ${staging}`);
    try {
      const corpusDir = join(staging, "corpus");
      if (reuseCorpus) {
        const from = stageCurrentCorpus(releasesDir, staging);
        console.log(`release: reusing the corpus of release ${from}`);
      } else {
        runCommand("transform", ["--out", corpusDir]);
      }
      runCommand("search-index", [
        "--corpus",
        corpusDir,
        "--out",
        join(staging, "search", "pagefind"),
      ]);
      report(
        publishRelease({ releasesDir, stagingDir: staging, allowShrink, force, protect: null }),
      );
      await pruneKeepingServed(releasesDir, server);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  });
}

export async function releaseMain(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "allow-shrink": { type: "boolean", default: false },
      "reuse-corpus": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "data-path": { type: "string" },
      server: { type: "string" },
    },
  });
  const config = loadConfig().codex;
  const dataPath = values["data-path"] ?? config.dataPath;
  const server = values.server ?? `http://127.0.0.1:${config.port}`;
  const releasesDir = releasesDirOf(dataPath);
  const [command, arg] = positionals;
  switch (command) {
    case "build":
      await build(releasesDir, {
        allowShrink: values["allow-shrink"],
        reuseCorpus: values["reuse-corpus"],
        force: values.force,
        server,
      });
      break;
    case "rollback": {
      const { from, to } = await withReleaseLock(releasesDir, () =>
        rollbackRelease(releasesDir, arg, values.force),
      );
      console.log(
        `release: rolled back from ${from ?? "none"} to ${to}${from === null ? "" : `; ${from} is marked rejected (returning to it needs --force)`}`,
      );
      break;
    }
    case "list": {
      const releases = listReleases(releasesDir);
      if (releases.length === 0) console.log(`release: no releases in ${releasesDir}`);
      for (const r of releases) {
        console.log(
          `${r.current ? "*" : " "} ${r.id}  ${r.createdAt}  ${r.totalEntityCount} entities  ` +
            `foundry ${r.foundryTag}  aon ${r.aonSnapshotDate}${
              rejectedAt(releasesDir, r.id) === null ? "" : "  (rejected)"
            }`,
        );
      }
      console.log(
        `(keeps the ${DEFAULT_KEEP} newest; corpus at ${releaseCorpusDir(releasesDir, "<id>")})`,
      );
      break;
    }
    case "migrate": {
      const result = await withReleaseLock(releasesDir, () =>
        migrateFlatCorpus(dataPath, releasesDir),
      );
      if (result === null) console.log("release: a current release exists; nothing to migrate");
      else {
        report(result);
        console.log(
          `release: the flat ${join(dataPath, "corpus")} and ${join(dataPath, "search")} are ` +
            "untouched; remove them once codex serves from releases/current.",
        );
      }
      break;
    }
    default:
      throw new Error(
        `unknown command ${JSON.stringify(command)}: use build, rollback, list or migrate`,
      );
  }
}
