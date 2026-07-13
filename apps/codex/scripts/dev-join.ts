/**
 * S4's dev runner (assignment brief, spec §4 S4's gate: "full real-corpus
 * transform on the host; report reviewed BY THE STAKEHOLDER"). Re-runs the S2
 * Foundry assembly (`parse-foundry.ts`'s own logic, condensed) and the S3 AoN
 * extraction (`parse-aon.ts`'s own logic, condensed) FROM SCRATCH over the
 * real pinned snapshots, then runs the S4 join (`src/ingest/join.ts`) over the
 * result and prints the full transform report (`src/ingest/report.ts`).
 *
 * This is NOT `transform.ts` (that's the next engineer's emit-half
 * orchestrator, which will also write `corpus/<category>/<slug>.json` +
 * `report.json`/`report.md` to disk) — this script re-derives the same S2/S3
 * in-memory state `parse-foundry.ts`/`parse-aon.ts` already prove correct
 * (zero hard failures) purely so the S4 JOIN half has real data to run
 * against; it prints the report to stdout and writes nothing to `data/`.
 *
 * Run via:
 *
 *   pnpm --filter @astra/codex exec node \
 *     --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/dev-join.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import { dedupeAonMetas } from "../src/ingest/aonDedup";
import {
  type AonHit,
  type AonDocMeta,
  aonSkipReason,
  extractAonMeta,
} from "../src/ingest/aonFacets";
import { buildAonLinkTable, type LinkTableDoc } from "../src/ingest/aonLinkTable";
import {
  EnricherGrammarError,
  type EnricherContext,
  type UuidResolution,
  mergeLocalizeMaps,
} from "../src/ingest/enrichers";
import { assembleFoundryEntity, type RawFoundryDoc } from "../src/ingest/foundryEntities";
import { FoundryHtmlError, parseFoundryHtml } from "../src/ingest/foundryHtml";
import { walkFiles } from "../src/ingest/fsWalk";
import { qualifierCandidates, runJoin, type JoinAliasesFile } from "../src/ingest/join";
import {
  type JournalDoc,
  type RemasterRedirectEntry,
  EXCLUDED_JOURNAL_BASENAMES,
  JOURNAL_TARGET_CATEGORY,
  assembleJournalPages,
  decideJournalPages,
  decisionToResolution,
  parseRemasterChanges,
  registerExcludedJournal,
} from "../src/ingest/journals";
import { buildReportJson, buildReportMarkdown } from "../src/ingest/report";
import {
  type ContainingDoc,
  type PackRegistryEntry,
  type UuidIndex,
  assertRegistryIsTotal,
  buildDocIndex,
  buildPackRegistry,
  createResolveUuid,
} from "../src/ingest/uuidResolve";
import type { CodexEntity } from "../src/schema/entity";
import { parseManifest } from "../src/schema/manifest";
import { isKnownPack } from "./categoryMap";

const FOUNDRY_TAG = "pf2e-8.3.0";

// ---------------------------------------------------------------------------
// shared report sink (one counter across Foundry assembly + AoN extraction +
// join, per report.ts's `ReportInput.reportCounts` contract)
// ---------------------------------------------------------------------------

const reportCounts = new Map<string, number>();
const reportExamples = new Map<string, string[]>();
const hardFailures: Array<{ path: string; message: string }> = [];

function report(cls: string, detail: string): void {
  reportCounts.set(cls, (reportCounts.get(cls) ?? 0) + 1);
  const examples = reportExamples.get(cls) ?? [];
  if (examples.length < 5) {
    examples.push(detail);
    reportExamples.set(cls, examples);
  }
}

// ---------------------------------------------------------------------------
// Foundry side (condensed `parse-foundry.ts`)
// ---------------------------------------------------------------------------

function loadLangMap(langDir: string): ReadonlyMap<string, string> {
  const order = [
    "action-en.json",
    "kingmaker-en.json",
    "sf2e-overrides-en.json",
    "en.json",
    "re-en.json",
  ];
  const files = order.map(
    (name) => JSON.parse(readFileSync(join(langDir, name), "utf8")) as Record<string, unknown>,
  );
  return mergeLocalizeMaps(files);
}

function makeCtx(
  index: UuidIndex,
  localize: ReadonlyMap<string, string>,
  containing?: ContainingDoc,
): EnricherContext {
  const ctx: EnricherContext = {
    resolveUuid: createResolveUuid(index, containing),
    localize,
    report,
    parseBlockHtml: (html: string) => parseFoundryHtml(html, ctx),
  };
  return ctx;
}

function basenameOf(relPath: string): string {
  const parts = relPath.replace(/\.json$/, "").split("/");
  return parts[parts.length - 1] ?? "";
}

interface FoundrySide {
  entities: Map<string, CodexEntity>;
  redirects: RemasterRedirectEntry[];
  index: UuidIndex;
}

function loadFoundry(): FoundrySide {
  const cfg = loadConfig();
  const snapshotDir = join(cfg.codex.dataPath, "snapshots", "foundry", FOUNDRY_TAG);
  const packsRoot = join(snapshotDir, "packs", "pf2e");
  const langDir = join(snapshotDir, "static", "lang");
  const systemManifest: unknown = JSON.parse(
    readFileSync(join(snapshotDir, "system.pf2e.json"), "utf8"),
  );
  const registry: readonly PackRegistryEntry[] = buildPackRegistry(systemManifest);
  assertRegistryIsTotal(packsRoot, registry);
  for (const entry of registry) {
    if (entry.docClass === "Actor" || entry.docClass === "Item") {
      if (!isKnownPack(entry.dir)) {
        throw new Error(`dev-join: pack "${entry.dir}" not recognized by categoryMap.ts`);
      }
    }
  }

  const localize = loadLangMap(langDir);
  const index = buildDocIndex(packsRoot, registry);

  for (const basename of EXCLUDED_JOURNAL_BASENAMES) {
    const doc = JSON.parse(
      readFileSync(join(packsRoot, "journals", `${basename}.json`), "utf8"),
    ) as JournalDoc;
    registerExcludedJournal(index, "journals", doc);
  }

  const journals = new Map<
    string,
    { doc: JournalDoc; decisions: ReturnType<typeof decideJournalPages> }
  >();
  for (const journalBasename of Object.keys(JOURNAL_TARGET_CATEGORY)) {
    const doc = JSON.parse(
      readFileSync(join(packsRoot, "journals", `${journalBasename}.json`), "utf8"),
    ) as JournalDoc;
    const decisions = decideJournalPages(journalBasename, doc, index.allCrossrefIds(), report);
    journals.set(journalBasename, { doc, decisions });
    for (const decision of decisions) {
      index.registerJournalPage(doc._id, decision.pageId, {
        kind: "crossref",
        ...decisionToResolution(decision),
      } satisfies UuidResolution);
    }
  }

  const entities = new Map<string, CodexEntity>();
  const seenIds = new Set<string>();
  for (const entry of registry) {
    if (entry.docClass !== "Actor" && entry.docClass !== "Item") continue;
    for (const file of walkFiles(join(packsRoot, entry.dir))) {
      if (file.relPath.endsWith("_folders.json")) continue;
      const doc = JSON.parse(readFileSync(file.absPath, "utf8")) as RawFoundryDoc;
      const ctx = makeCtx(index, localize);
      try {
        const entity = assembleFoundryEntity({
          packDir: entry.dir,
          docClass: entry.docClass,
          basename: basenameOf(file.relPath),
          doc,
          ctx,
          report,
          seenIds,
        });
        if (entity) entities.set(entity.id, entity);
      } catch (e) {
        if (e instanceof EnricherGrammarError || e instanceof FoundryHtmlError) {
          hardFailures.push({ path: file.relPath, message: e.message });
          continue;
        }
        throw e;
      }
    }
  }

  for (const [journalBasename, { doc, decisions }] of journals) {
    const ctx = makeCtx(index, localize, { _id: doc._id, pages: doc.pages });
    try {
      const { merges, standalone } = assembleJournalPages(doc.name, doc, decisions, ctx, report);
      for (const merge of merges) {
        const target = entities.get(merge.targetId);
        if (target) target.loreBody = merge.loreBody;
        else
          hardFailures.push({
            path: journalBasename,
            message: `merge target "${merge.targetId}" missing`,
          });
      }
      for (const entity of standalone) {
        if (!entities.has(entity.id)) entities.set(entity.id, entity);
        else report("slugCollision", entity.id);
      }
    } catch (e) {
      if (e instanceof EnricherGrammarError || e instanceof FoundryHtmlError) {
        hardFailures.push({ path: journalBasename, message: e.message });
      } else {
        throw e;
      }
    }
  }

  const remasterChangesDoc = JSON.parse(
    readFileSync(join(packsRoot, "journals", "remaster-changes.json"), "utf8"),
  ) as JournalDoc;
  const remasterCtx = makeCtx(index, localize, {
    _id: remasterChangesDoc._id,
    pages: remasterChangesDoc.pages,
  });
  const redirects = parseRemasterChanges(remasterChangesDoc, remasterCtx);

  return { entities, redirects, index };
}

// ---------------------------------------------------------------------------
// AoN side (condensed `parse-aon.ts`)
// ---------------------------------------------------------------------------

interface AonSide {
  metas: AonDocMeta[];
  markdownById: Map<string, string>;
}

function loadAon(): AonSide {
  const cfg = loadConfig();
  const manifestPath = join(import.meta.dirname, "..", "corpus-manifest.json");
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (manifest.aon.snapshotDate === null) {
    throw new Error("dev-join: no AoN snapshot recorded in corpus-manifest.json");
  }
  const snapshotDir = join(cfg.codex.dataPath, "snapshots", "aon", manifest.aon.snapshotDate);
  const categoryFiles = readdirSync(snapshotDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const metas: AonDocMeta[] = [];
  const markdownById = new Map<string, string>();
  for (const file of categoryFiles) {
    const snap = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as {
      category: string;
      hits: Array<{ _id: string; _source: Record<string, unknown> }>;
    };
    for (const hit of snap.hits) {
      if (aonSkipReason(hit as unknown as AonHit) !== undefined) continue;
      try {
        const meta = extractAonMeta(snap.category, hit as unknown as AonHit);
        metas.push(meta);
        const markdown = hit._source.markdown;
        if (typeof markdown === "string" && markdown.trim().length > 0) {
          markdownById.set(meta.aonId, markdown);
        }
      } catch (e) {
        hardFailures.push({ path: `${snap.category}/${hit._id}`, message: String(e) });
      }
    }
  }
  return { metas, markdownById };
}

// ---------------------------------------------------------------------------
// dragon-family measurement (acceptance E's explicit proof point)
// ---------------------------------------------------------------------------

function measureDragonFamily(
  foundryEntities: ReadonlyMap<string, CodexEntity>,
  aonMetas: readonly AonDocMeta[],
): void {
  const aonCreatureSlugs = new Set(
    aonMetas.filter((m) => m.category === "creature").map((m) => m.slug),
  );
  const dragons = [...foundryEntities.values()].filter(
    (e) => e.category === "creature" && /dragon/i.test(e.name),
  );
  let raw = 0;
  let normalized = 0;
  const stillMissing: string[] = [];
  for (const d of dragons) {
    if (aonCreatureSlugs.has(d.slug)) {
      raw++;
      continue;
    }
    if (qualifierCandidates(d.name).some((c) => aonCreatureSlugs.has(c))) {
      normalized++;
    } else {
      stillMissing.push(d.name);
    }
  }
  const total = dragons.length;
  console.log("\n=== Dragon family (acceptance E proof point) ===");
  console.log(`total: ${total}`);
  console.log(`raw (exact slug) hit-rate: ${raw}/${total} = ${((raw / total) * 100).toFixed(1)}%`);
  console.log(
    `post-normalization hit-rate: ${raw + normalized}/${total} = ${(((raw + normalized) / total) * 100).toFixed(1)}%`,
  );
  if (stillMissing.length > 0) {
    console.log(
      `still unjoined after normalization (${stillMissing.length}):`,
      stillMissing.slice(0, 20),
    );
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("Loading Foundry snapshot (S2 assembly)...");
  const foundry = loadFoundry();
  console.log(`  ${foundry.entities.size} Foundry-origin entities assembled.`);

  console.log("Loading AoN snapshot (S3 extraction)...");
  const aon = loadAon();
  console.log(`  ${aon.metas.length} AoN metas extracted, ${aon.markdownById.size} with markdown.`);

  if (hardFailures.length > 0) {
    console.log(`\n${hardFailures.length} HARD FAILURES during S2/S3 assembly:`);
    for (const f of hardFailures.slice(0, 20)) console.log(`  ${f.path}: ${f.message}`);
    process.exit(1);
  }

  // D29-18: same dedup transform.ts runs, kept in sync here so this dev
  // report reflects the real pipeline (not a stale pre-P1.5 picture).
  const dedupedMetas = dedupeAonMetas(aon.metas, report);
  const keptAonIds = new Set(dedupedMetas.map((m) => m.aonId));
  const dedupedMarkdownById = new Map(
    [...aon.markdownById].filter(([aonId]) => keptAonIds.has(aonId)),
  );

  const linkTableDocs: LinkTableDoc[] = dedupedMetas.map((m) => ({
    aonId: m.aonId,
    category: m.category,
    slug: m.slug,
    aonUrl: m.aonUrl,
    name: m.name,
  }));
  const linkTable = buildAonLinkTable(linkTableDocs, report);

  const aliasesPath = join(import.meta.dirname, "..", "join-aliases.json");
  const aliasesFile = JSON.parse(readFileSync(aliasesPath, "utf8")) as JoinAliasesFile;

  console.log("\nRunning the S4 join...");
  const result = runJoin({
    foundryEntities: foundry.entities,
    aonMetas: dedupedMetas,
    aonMarkdownById: dedupedMarkdownById,
    linkTable,
    remasterRedirects: foundry.redirects,
    aliasesFile,
    resolveForeignEmbed: createResolveUuid(foundry.index),
    report,
  });
  console.log(`  ${result.entities.length} final entities.`);

  measureDragonFamily(foundry.entities, dedupedMetas);

  console.log("\n=== Spell join rate ===");
  const spellStat = result.categoryStats.find((c) => c.category === "spell");
  if (spellStat) {
    const joined = spellStat.exact + spellStat.normalized + spellStat.alias;
    console.log(
      `foundry=${spellStat.foundryTotal} aon=${spellStat.aonTotal} joined=${joined} (${((joined / spellStat.foundryTotal) * 100).toFixed(2)}%) exact=${spellStat.exact} normalized=${spellStat.normalized} alias=${spellStat.alias}`,
    );
  }

  console.log("\n=== Creature join rate ===");
  const creatureStat = result.categoryStats.find((c) => c.category === "creature");
  if (creatureStat) {
    const joined = creatureStat.exact + creatureStat.normalized + creatureStat.alias;
    console.log(
      `foundry=${creatureStat.foundryTotal} aon=${creatureStat.aonTotal} joined=${joined} (${((joined / creatureStat.foundryTotal) * 100).toFixed(2)}%) exact=${creatureStat.exact} normalized=${creatureStat.normalized} alias=${creatureStat.alias}`,
    );
  }

  const stopCategories = result.categoryStats.filter((c) => {
    if (c.foundryTotal === 0 || c.aonTotal === 0) return false;
    const rate = (c.exact + c.normalized + c.alias) / c.foundryTotal;
    return rate < 0.5;
  });
  if (stopCategories.length > 0) {
    console.log("\n*** STOP-CONDITION CATEGORIES (<50% joined, both sources present) ***");
    for (const c of stopCategories) {
      const joined = c.exact + c.normalized + c.alias;
      console.log(
        `  ${c.category}: ${joined}/${c.foundryTotal} = ${((joined / c.foundryTotal) * 100).toFixed(1)}%`,
      );
    }
  } else {
    console.log(
      "\nNo category with both sources present sits below the 50% join-rate STOP threshold.",
    );
  }

  console.log("\n=== Aliases applied ===");
  for (const a of result.aliasesApplied) console.log(`  ${a.foundryId} -> ${a.aonId} (${a.note})`);

  console.log("\n=== Collisions ===");
  const legacyPairs = result.collisions.filter((c) => c.kind === "legacyPair");
  const residual = result.collisions.filter((c) => c.kind === "residual");
  const anomalies = result.collisions.filter((c) => c.kind === "legacyPairAnomaly");
  console.log(
    `${result.collisions.length} total: ${legacyPairs.length} legacy-pair, ${residual.length} residual, ${anomalies.length} anomaly`,
  );

  console.log("\n=== Legacy/remaster pairing ===");
  console.log(
    `${result.pairingCount} remasteredAs/legacyOf edges. Foundry redirect cross-check: ${result.redirectCrossCheck.agreements} agree, ${result.redirectCrossCheck.disagreements} disagree.`,
  );

  console.log("\n=== Crossref/embed patching ===");
  console.log(result.patchStats);

  const reportJson = buildReportJson({
    reportCounts,
    reportExamples,
    hardFailureCount: hardFailures.length,
    join: result,
    foundrySnapshotDocCount: foundry.entities.size,
    aonSnapshotDocCount: aon.metas.length,
  });
  const markdown = buildReportMarkdown(reportJson);

  console.log("\n\n########## report.md ##########\n");
  console.log(markdown);
}

main();
