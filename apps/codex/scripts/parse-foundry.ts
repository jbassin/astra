/**
 * S2's OFFICIAL gate runner (spec §4 S2's gate: "the S2 parser runs over the
 * FULL Foundry snapshot on the host with zero unknown-enricher failures and
 * per-category counts reported"). Supersedes `dev-sweep-foundry.ts` (a
 * grammar-only sweep, left in place) — this runs the REAL pipeline: pack
 * registry → uuid index (pass 1) → entity assembly (Item/Actor) → journal
 * page decisions + assembly (pass 2, D29-8's two-phase ordering) →
 * remaster-changes redirect table → the report this file prints.
 *
 * Run via:
 *
 *   pnpm --filter @astra/codex exec node \
 *     --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/parse-foundry.ts
 *
 * S2 scope (per the assignment brief): no `@legacy` suffixing, no AoN join,
 * no corpus emit to disk — those are S3/S4. This script's entity map lives
 * only in memory for the duration of the run; its JOB is the report.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import {
  EnricherGrammarError,
  type EnricherContext,
  type UuidResolution,
  mergeLocalizeMaps,
} from "../src/ingest/enrichers";
import { assembleFoundryEntity, type RawFoundryDoc } from "../src/ingest/foundryEntities";
import { FoundryHtmlError, parseFoundryHtml } from "../src/ingest/foundryHtml";
import { walkFiles } from "../src/ingest/fsWalk";
import {
  type JournalDoc,
  EXCLUDED_JOURNAL_BASENAMES,
  JOURNAL_TARGET_CATEGORY,
  assembleJournalPages,
  decideJournalPages,
  decisionToResolution,
  parseRemasterChanges,
  registerExcludedJournal,
} from "../src/ingest/journals";
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
import { isKnownPack } from "./categoryMap";

const TAG = "pf2e-8.3.0";

function loadLangMap(langDir: string): ReadonlyMap<string, string> {
  // Ascending precedence (D29-5/D29-6): action-en/kingmaker-en/sf2e-overrides-en
  // lowest, en.json next, re-en.json wins last — same order as
  // dev-sweep-foundry.ts's loadLangMap (duplicated intentionally: that script
  // stays a standalone grammar-only sweep, this one is the real pipeline).
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
  reportFn: (cls: string, detail: string) => void,
  containing?: ContainingDoc,
): EnricherContext {
  const ctx: EnricherContext = {
    resolveUuid: createResolveUuid(index, containing),
    localize,
    report: reportFn,
    parseBlockHtml: (html: string) => parseFoundryHtml(html, ctx),
  };
  return ctx;
}

interface Counters {
  reportCounts: Map<string, number>;
  hardFailures: Array<{ path: string; message: string }>;
}

function report(counters: Counters, cls: string, detail: string): void {
  counters.reportCounts.set(cls, (counters.reportCounts.get(cls) ?? 0) + 1);
  void detail; // first-N examples aren't kept — the report is counts-only, per the gate's own brief
}

function main(): void {
  const cfg = loadConfig();
  const snapshotDir = join(cfg.codex.dataPath, "snapshots", "foundry", TAG);
  const packsRoot = join(snapshotDir, "packs", "pf2e");
  const langDir = join(snapshotDir, "static", "lang");
  const systemManifestPath = join(snapshotDir, "system.pf2e.json");

  const systemManifest: unknown = JSON.parse(readFileSync(systemManifestPath, "utf8"));
  const registry: readonly PackRegistryEntry[] = buildPackRegistry(systemManifest);

  // Drift tripwire FIRST — fail fast on a pack/type shape this pipeline has
  // never seen, before spending time walking 28k+ docs.
  assertRegistryIsTotal(packsRoot, registry);

  const localize = loadLangMap(langDir);
  const counters: Counters = { reportCounts: new Map(), hardFailures: [] };
  const rpt = (cls: string, detail: string): void => report(counters, cls, detail);

  // Pass 1: the full cross-reference index over Item/Actor docs — pure
  // metadata (pack + doc type + file basename), no HTML parsing, so this is
  // cheap and, crucially, gives `index.allCrossrefIds()` the complete set of
  // codex entity ids BEFORE any document's HTML (Item/Actor OR journal page)
  // is parsed.
  const index = buildDocIndex(packsRoot, registry);

  // The "journals" pack's 3 non-entity docs (gm-screen/hero-point-deck/
  // remaster-changes) register as EXCLUDED targets — same treatment as
  // Macro/RollTable, not `broken` (see journals.ts's EXCLUDED_JOURNAL_BASENAMES
  // doc comment for why this matters).
  for (const basename of EXCLUDED_JOURNAL_BASENAMES) {
    const doc = JSON.parse(
      readFileSync(join(packsRoot, "journals", `${basename}.json`), "utf8"),
    ) as JournalDoc;
    registerExcludedJournal(index, "journals", doc);
  }

  // D29-8's two-phase journal ordering, phase 1: decide + register EVERY
  // journal page's merge/standalone target BEFORE any HTML (Item/Actor OR
  // journal) gets parsed below — 900 real `@UUID` refs from ordinary Item/
  // Actor docs target a specific journal page, so this MUST happen first.
  const journals = new Map<
    string,
    { doc: JournalDoc; decisions: ReturnType<typeof decideJournalPages> }
  >();
  for (const journalBasename of Object.keys(JOURNAL_TARGET_CATEGORY)) {
    const doc = JSON.parse(
      readFileSync(join(packsRoot, "journals", `${journalBasename}.json`), "utf8"),
    ) as JournalDoc;
    const decisions = decideJournalPages(journalBasename, doc, index.allCrossrefIds(), rpt);
    journals.set(journalBasename, { doc, decisions });
    for (const decision of decisions) {
      index.registerJournalPage(doc._id, decision.pageId, {
        kind: "crossref",
        ...decisionToResolution(decision),
      } satisfies UuidResolution);
    }
  }

  // Entity assembly (Item/Actor packs) — every journal-page target is already
  // registered above, so HTML parsed here resolves both ordinary crossrefs
  // AND journal-page references correctly.
  const entities = new Map<string, CodexEntity>();
  const seenIds = new Set<string>();

  for (const entry of registry) {
    if (entry.docClass !== "Actor" && entry.docClass !== "Item") continue;
    for (const file of walkFiles(join(packsRoot, entry.dir))) {
      if (file.relPath.endsWith("_folders.json")) continue;
      const doc = JSON.parse(readFileSync(file.absPath, "utf8")) as RawFoundryDoc;
      const ctx = makeCtx(index, localize, rpt);
      try {
        const entity = assembleFoundryEntity({
          packDir: entry.dir,
          docClass: entry.docClass,
          basename: basenameOf(file.relPath),
          doc,
          ctx,
          report: rpt,
          seenIds,
        });
        if (entity) entities.set(entity.id, entity);
      } catch (e) {
        if (e instanceof EnricherGrammarError || e instanceof FoundryHtmlError) {
          counters.hardFailures.push({ path: file.relPath, message: e.message });
          continue;
        }
        throw e; // a CategoryMapError or anything else is a structural bug, not per-doc residue
      }
    }
  }

  // D29-8's two-phase journal ordering, phase 2: now parse every journal
  // page's body and produce the real merge/standalone results.
  let journalStandaloneCount = 0;
  let journalMergeCount = 0;
  for (const [journalBasename, { doc, decisions }] of journals) {
    const ctx = makeCtx(index, localize, rpt, { _id: doc._id, pages: doc.pages });
    try {
      const { merges, standalone } = assembleJournalPages(doc.name, doc, decisions, ctx, rpt);
      for (const merge of merges) {
        const target = entities.get(merge.targetId);
        if (!target) {
          counters.hardFailures.push({
            path: `journals/${journalBasename}.json`,
            message: `merge target "${merge.targetId}" not found in the assembled entity map`,
          });
          continue;
        }
        target.loreBody = merge.loreBody;
        journalMergeCount++;
      }
      for (const entity of standalone) {
        if (entities.has(entity.id)) {
          rpt("slugCollision", entity.id);
        } else {
          entities.set(entity.id, entity);
        }
        journalStandaloneCount++;
      }
    } catch (e) {
      if (e instanceof EnricherGrammarError || e instanceof FoundryHtmlError) {
        counters.hardFailures.push({
          path: `journals/${journalBasename}.json`,
          message: e.message,
        });
      } else {
        throw e;
      }
    }
  }

  // remaster-changes: parsed for its redirect-table content, NOT an entity
  // (it's one of `EXCLUDED_JOURNAL_BASENAMES`, not `JOURNAL_TARGET_CATEGORY`
  // — re-read here since the earlier excluded-journal loop only registered
  // its uuid-index entries, not a kept reference to the parsed doc).
  const remasterChangesDoc = JSON.parse(
    readFileSync(join(packsRoot, "journals", "remaster-changes.json"), "utf8"),
  ) as JournalDoc;
  const remasterCtx = makeCtx(index, localize, rpt, {
    _id: remasterChangesDoc._id,
    pages: remasterChangesDoc.pages,
  });
  const redirects = parseRemasterChanges(remasterChangesDoc, remasterCtx);

  // ---------------------------------------------------------------------
  // report
  // ---------------------------------------------------------------------

  const categoryCounts = new Map<string, number>();
  const licenseCounts = new Map<string, number>();
  const editionCounts = new Map<string, number>();
  for (const entity of entities.values()) {
    categoryCounts.set(entity.category, (categoryCounts.get(entity.category) ?? 0) + 1);
    licenseCounts.set(entity.source.license, (licenseCounts.get(entity.source.license) ?? 0) + 1);
    editionCounts.set(entity.edition, (editionCounts.get(entity.edition) ?? 0) + 1);
  }

  console.log(
    `Pack registry: ${registry.length} packs (${isKnownPackCount(registry)} known to categoryMap)`,
  );
  console.log(`Total assembled entities: ${entities.size}`);
  console.log(`  journal merges:     ${journalMergeCount}`);
  console.log(`  journal standalone: ${journalStandaloneCount}`);
  console.log(`remaster-changes redirect entries: ${redirects.length}`);
  console.log();

  console.log("Per-category entity counts:");
  for (const [category, count] of [...categoryCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`  ${category.padEnd(24)} ${count}`);
  }
  console.log();

  console.log("License breakdown:");
  for (const [license, count] of [...licenseCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`  ${license.padEnd(10)} ${count}`);
  }
  console.log();

  console.log("Edition breakdown:");
  for (const [edition, count] of [...editionCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`  ${edition.padEnd(10)} ${count}`);
  }
  console.log();

  console.log("Report-class counts (non-fatal residue):");
  for (const [cls, count] of [...counters.reportCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`  ${cls.padEnd(24)} ${count}`);
  }
  console.log();

  if (counters.hardFailures.length > 0) {
    console.log(`${counters.hardFailures.length} HARD FAILURES:`);
    for (const f of counters.hardFailures.slice(0, 20)) console.log(`  ${f.path}: ${f.message}`);
    process.exit(1);
  }
  console.log("ZERO hard failures across the full snapshot.");
}

function isKnownPackCount(registry: readonly PackRegistryEntry[]): number {
  return registry.filter((r) => isKnownPack(r.dir)).length;
}

/** The pack file's own basename (no `.json`) — D29-1's identity source. */
function basenameOf(relPath: string): string {
  const parts = relPath.replace(/\.json$/, "").split("/");
  return parts[parts.length - 1] ?? "";
}

main();
