/**
 * Snapshots the AoN Elasticsearch index to `<dataPath>/snapshots/aon/<YYYY-MM-DD>/`
 * (D29-5). Server-side only — the endpoint is Origin-allowlisted, and a plain Node
 * `fetch()` sends no Origin header at all, which is exactly why this works. Run via:
 *
 *   pnpm --filter @astra/codex fetch:aon
 *
 * Single-shot: writes one JSON file per category with the raw hits as fetched (`_id`,
 * `_source`, `sort`), then read-modify-writes the committed `corpus-manifest.json`
 * (D29-4). Never queried at build/render time — after this completes, P1 never touches
 * the network again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";

import { createAonClient } from "../src/ingest/aonClient";
import {
  discoverCategories,
  type EsAggResponse,
  type EsSearchResponse,
  fetchAllForCategory,
} from "../src/ingest/aonPager";
import { hashDirectory } from "../src/ingest/hash";
import { createThrottle } from "../src/ingest/throttle";
import {
  type CorpusManifest,
  emptyManifest,
  parseManifest,
  serializeManifest,
} from "../src/schema/manifest";

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus-manifest.json");

// ≤4 req/s etiquette ceiling (D29-5) → a comfortable margin above the 250ms floor.
const THROTTLE_INTERVAL_MS = 260;

function todayIso(): string {
  const iso = new Date().toISOString();
  return iso.slice(0, iso.indexOf("T"));
}

function readManifest(): CorpusManifest {
  if (!existsSync(MANIFEST_PATH)) return emptyManifest();
  return parseManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const snapshotDate = todayIso();
  const snapshotDir = join(cfg.codex.dataPath, "snapshots", "aon", snapshotDate);
  mkdirSync(snapshotDir, { recursive: true });

  const client = createAonClient();
  const throttle = createThrottle(THROTTLE_INTERVAL_MS);

  await throttle();
  const categories = await discoverCategories((body) => client<EsAggResponse>(body));
  const sortedCategories = [...categories].sort((a, b) =>
    a.category < b.category ? -1 : a.category > b.category ? 1 : 0,
  );
  console.log(`discovered ${sortedCategories.length} AoN categories`);

  let totalDocs = 0;
  const categoryCounts: Record<string, number> = {};
  for (const { category } of sortedCategories) {
    const hits = await fetchAllForCategory(category, (body) => client<EsSearchResponse>(body), {
      pageSize: 1000,
      throttle,
    });
    categoryCounts[category] = hits.length;
    totalDocs += hits.length;

    const payload = {
      category,
      hits: hits.map((h) => ({ _id: h._id, _source: h._source, sort: h.sort })),
    };
    writeFileSync(join(snapshotDir, `${category}.json`), `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`  ${category}: ${hits.length}`);
  }

  const sha256 = hashDirectory(snapshotDir);
  const manifest = readManifest();
  manifest.aon = {
    snapshotDate,
    docCount: totalDocs,
    categoryCounts,
    sha256,
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(MANIFEST_PATH, serializeManifest(manifest));
  console.log(
    `AoN snapshot complete: ${totalDocs} docs across ${sortedCategories.length} categories`,
  );
}

main().catch((e: unknown) => {
  console.error(`fetch-aon failed: ${String(e)}`);
  process.exit(1);
});
