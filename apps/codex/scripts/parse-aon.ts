/**
 * The OFFICIAL S3 gate (spec §4 S3: "full AoN snapshot parses clean on the host"):
 * runs the COMBINED S3 pipeline over the real snapshot — `aonSkipReason` pre-skip +
 * `extractAonMeta` on every doc, `buildAonLinkTable` + `createLinkResolver` over the
 * full doc set, then `parseAonMarkdown` on every doc's markdown with the REAL link
 * resolver (dev-sweep-aon.ts is the grammar-only stub-resolver variant; this is the
 * integrated run). Prints per-category counts, license/edition breakdowns, breadcrumb
 * coverage, link-resolution + report-class tallies, and a zero-hard-fail
 * confirmation; exits 1 on any hard failure. Run via:
 *
 *   pnpm --filter @astra/codex exec node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/parse-aon.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import {
  type AonDocMeta,
  type AonHit,
  aonSkipReason,
  extractAonMeta,
} from "../src/ingest/aonFacets";
import { buildAonLinkTable, createLinkResolver } from "../src/ingest/aonLinkTable";
import { parseAonMarkdown } from "../src/ingest/aonMarkup";
import { parseManifest } from "../src/schema/manifest";

interface SnapshotFile {
  category: string;
  hits: Array<{ _id: string; _source: Record<string, unknown> }>;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const cfg = loadConfig();
const manifestPath = join(import.meta.dirname, "..", "corpus-manifest.json");
const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
if (manifest.aon.snapshotDate === null) fail("no AoN snapshot recorded in corpus-manifest.json");
const snapshotDir = join(cfg.codex.dataPath, "snapshots", "aon", manifest.aon.snapshotDate);

const categoryFiles = readdirSync(snapshotDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

const reportCounts = new Map<string, number>();
const reportExamples = new Map<string, string[]>();
function report(cls: string, detail: string): void {
  reportCounts.set(cls, (reportCounts.get(cls) ?? 0) + 1);
  const examples = reportExamples.get(cls) ?? [];
  if (examples.length < 3) {
    examples.push(detail);
    reportExamples.set(cls, examples);
  }
}

// Pass 1: metas (small) — hits are re-read per category in pass 2 so the whole
// 259 MB snapshot is never resident at once.
const metas: AonDocMeta[] = [];
const skipCounts = new Map<string, number>();
const hardFailures: string[] = [];
for (const file of categoryFiles) {
  const snap = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as SnapshotFile;
  for (const hit of snap.hits) {
    const skip = aonSkipReason(hit as unknown as AonHit);
    if (skip !== undefined) {
      skipCounts.set(skip, (skipCounts.get(skip) ?? 0) + 1);
      continue;
    }
    try {
      metas.push(extractAonMeta(snap.category, hit as unknown as AonHit));
    } catch (e) {
      hardFailures.push(`[meta] ${snap.category}/${hit._id}: ${String(e)}`);
    }
  }
}

const table = buildAonLinkTable(metas, report);
const baseResolve = createLinkResolver(table, report);
let crossrefCount = 0;
const resolveLink: typeof baseResolve = (href, display) => {
  const node = baseResolve(href, display);
  if (node.kind === "crossref") crossrefCount += 1;
  return node;
};

// Pass 2: parse every doc's markdown with the real resolver.
let parsedDocs = 0;
for (const file of categoryFiles) {
  const snap = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as SnapshotFile;
  for (const hit of snap.hits) {
    const markdown = hit._source.markdown;
    if (typeof markdown !== "string") continue;
    try {
      parseAonMarkdown(markdown, { resolveLink, report });
      parsedDocs += 1;
    } catch (e) {
      hardFailures.push(`[markup] ${snap.category}/${hit._id}: ${String(e)}`);
      if (hardFailures.length > 20) fail(hardFailures.join("\n"));
    }
  }
}

const byCategory = new Map<string, number>();
const byLicense = new Map<string, number>();
const byEdition = new Map<string, number>();
let breadcrumbRules = 0;
let rulesDocs = 0;
for (const m of metas) {
  byCategory.set(m.category, (byCategory.get(m.category) ?? 0) + 1);
  byLicense.set(m.license, (byLicense.get(m.license) ?? 0) + 1);
  byEdition.set(m.edition, (byEdition.get(m.edition) ?? 0) + 1);
  if (m.category === "rules") {
    rulesDocs += 1;
    if (m.breadcrumbs !== undefined) breadcrumbRules += 1;
  }
}

const sorted = (map: Map<string, number>) =>
  [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
console.log(`snapshot ${manifest.aon.snapshotDate}: ${categoryFiles.length} category files`);
console.log(`\nmetas extracted: ${metas.length}; skipped:`);
for (const [reason, n] of sorted(skipCounts)) console.log(`  ${reason}: ${n}`);
console.log(`\nlink table: ${table.byUrl.size} entries`);
console.log(`markdown parsed: ${parsedDocs} docs; crossrefs resolved: ${crossrefCount}`);
console.log(`rules breadcrumb coverage: ${breadcrumbRules}/${rulesDocs}`);
console.log("\nPer-category doc counts:");
for (const [cat, n] of sorted(byCategory)) console.log(`  ${cat.padEnd(36)} ${n}`);
console.log("\nLicense breakdown:");
for (const [license, n] of sorted(byLicense)) console.log(`  ${license.padEnd(10)} ${n}`);
console.log("\nEdition breakdown:");
for (const [edition, n] of sorted(byEdition)) console.log(`  ${edition.padEnd(10)} ${n}`);
console.log("\nReport-class counts (non-fatal residue):");
for (const [cls, n] of sorted(reportCounts)) console.log(`  ${cls.padEnd(28)} ${n}`);

if (hardFailures.length > 0)
  fail(`\nHARD FAILURES (${hardFailures.length}):\n${hardFailures.join("\n")}`);
console.log("\nZERO hard failures across the full AoN snapshot.");
