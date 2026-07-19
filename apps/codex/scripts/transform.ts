/**
 * S4's real pipeline orchestrator (spec §3/§4 S4, this deliverable): parses
 * the Foundry snapshot (S2 assembly, incl. journals) → parses the AoN
 * snapshot (S3 extraction) → runs the join (S4, `join.ts`) → emits the
 * deterministic corpus (`emit.ts`) + the transform report (`report.ts`).
 *
 * The whole orchestration lives in the exported `runTransform` — a PURE
 * function of its input paths (no module-scope mutable state: every counter/
 * map is created fresh inside the call), so the CI-hermetic fixture pipeline
 * test (`src/ingest/transform.fixture.test.ts`) can call the EXACT SAME code
 * path over the committed fixture's raw-doc subset, twice in the same
 * process, and compare the two runs for byte-determinism — a shared
 * module-level counter would leak state between those two calls and silently
 * corrupt that comparison.
 *
 * `main()` below is the thin CLI wrapper for the real host run
 * (`pnpm --filter @astra/codex transform`): resolves the real paths from
 * `@astra/config` + the committed `corpus-manifest.json`, calls
 * `runTransform`, prints the report.md summary, and exits 1 on ANY hard
 * failure (same posture as `parse-foundry.ts`/`parse-aon.ts`'s own gates —
 * the drift tripwire never silently passes here either).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "@astra/config";

import { dedupeAonMetas } from "../src/ingest/aonDedup";
import {
  type AonHit,
  type AonDocMeta,
  aonSkipReason,
  extractAonMeta,
} from "../src/ingest/aonFacets";
import { buildAonLinkTable, normalizeUrlKey, type LinkTableDoc } from "../src/ingest/aonLinkTable";
import { augmentClassStats } from "../src/ingest/augmentClassStats";
import { normalizeBookNames } from "../src/ingest/bookNormalize";
import { collapseAdjacentCrossrefs } from "../src/ingest/dedupeCrossrefs";
import { applyAonPrimaryDrop } from "../src/ingest/drop";
import {
  emitCorpus,
  writeCanonicalJson,
  writeCanonicalText,
  type EmitCorpusResult,
} from "../src/ingest/emit";
import {
  EnricherGrammarError,
  type EnricherContext,
  type UuidResolution,
  mergeLocalizeMaps,
} from "../src/ingest/enrichers";
import {
  assembleFoundryEntity,
  extractRawGrantedFeatures,
  type RawFoundryDoc,
  type RawGrantedFeatureEntry,
} from "../src/ingest/foundryEntities";
import { FoundryHtmlError, parseFoundryHtml } from "../src/ingest/foundryHtml";
import { walkFiles } from "../src/ingest/fsWalk";
import { type JoinAliasesFile, runJoin } from "../src/ingest/join";
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
import { applyLevelDefault } from "../src/ingest/levelDefault";
import { buildReportJson, buildReportMarkdown, type ReportJson } from "../src/ingest/report";
import { type RulesDocInput, buildRulesTree } from "../src/ingest/rulesTree";
import { attachSidebars } from "../src/ingest/sidebarAttach";
import { type AonBookCitation, buildSourcesIndex } from "../src/ingest/sourcesIndexBuild";
import {
  type ContainingDoc,
  type PackRegistryEntry,
  type UuidIndex,
  assertRegistryIsTotal,
  buildDocIndex,
  buildPackRegistry,
  createResolveUuid,
} from "../src/ingest/uuidResolve";
import type { CodexEntity, License } from "../src/schema/entity";
import { parseManifest, type CorpusManifest } from "../src/schema/manifest";
import { RulesTreeFileSchema } from "../src/schema/rulesTree";
import { SourcesIndexFileSchema } from "../src/schema/sourcesIndex";
import { isKnownPack } from "./categoryMap";

export type ReportFn = (cls: string, detail: string) => void;
export interface HardFailure {
  path: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Foundry side (parse-foundry.ts's own assembly, generalized over a plain
// snapshot-root path instead of a hardcoded config+tag lookup, so a caller —
// the CLI wrapper OR the fixture test — can point it at any real-shaped
// snapshot directory)
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
  report: ReportFn,
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
  /** D29-114 (P12 S1): class entity id -> its raw `system.items`
   * granted-feature manifest (`foundryEntities.ts`'s
   * `extractRawGrantedFeatures`) — captured during the SAME walk that
   * assembles `entities` (the raw doc is right there), so the post-drop
   * `augmentClassStats` pass never needs a second raw-pack read. */
  classGrantedFeatures: Map<string, RawGrantedFeatureEntry[]>;
}

function loadFoundrySide(
  snapshotDir: string,
  report: ReportFn,
  hardFailures: HardFailure[],
): FoundrySide {
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
        throw new Error(`transform: pack "${entry.dir}" not recognized by categoryMap.ts`);
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

  // D29-8's two-phase journal ordering: decide + register every page's target
  // BEFORE any HTML (Item/Actor OR journal) is parsed.
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
  const classGrantedFeatures = new Map<string, RawGrantedFeatureEntry[]>();
  const seenIds = new Set<string>();
  for (const entry of registry) {
    if (entry.docClass !== "Actor" && entry.docClass !== "Item") continue;
    for (const file of walkFiles(join(packsRoot, entry.dir))) {
      if (file.relPath.endsWith("_folders.json")) continue;
      const doc = JSON.parse(readFileSync(file.absPath, "utf8")) as RawFoundryDoc;
      const ctx = makeCtx(index, localize, report);
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
        if (entity) {
          entities.set(entity.id, entity);
          // D29-114 (P12 S1): capture the raw granted-feature manifest for
          // every `class` doc, right here where the raw `doc` is still in
          // scope — the post-drop `augmentClassStats` pass needs it, and this
          // is the ONLY place in the pipeline the raw pack JSON is read.
          if (entity.category === "class") {
            const grants = extractRawGrantedFeatures(doc.system, report, entity.id);
            if (grants) classGrantedFeatures.set(entity.id, grants);
          }
        }
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
    const ctx = makeCtx(index, localize, report, { _id: doc._id, pages: doc.pages });
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
  const remasterCtx = makeCtx(index, localize, report, {
    _id: remasterChangesDoc._id,
    pages: remasterChangesDoc.pages,
  });
  const redirects = parseRemasterChanges(remasterChangesDoc, remasterCtx);

  return { entities, redirects, index, classGrantedFeatures };
}

// ---------------------------------------------------------------------------
// AoN side (parse-aon.ts's own extraction, generalized over a plain
// snapshot-dir path)
// ---------------------------------------------------------------------------

interface AonSide {
  metas: AonDocMeta[];
  markdownById: Map<string, string>;
}

function loadAonSide(snapshotDir: string, report: ReportFn, hardFailures: HardFailure[]): AonSide {
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
      if (aonSkipReason(hit as unknown as AonHit) !== undefined) {
        report("aonNamelessFragment", hit._id);
        continue;
      }
      try {
        const meta = extractAonMeta(snap.category, hit as unknown as AonHit, report);
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
// runTransform — the exported orchestrator (parse -> join -> emit -> report)
// ---------------------------------------------------------------------------

export interface TransformPaths {
  /** The Foundry snapshot ROOT (contains `packs/pf2e`, `static/lang`,
   * `system.pf2e.json`) — the real host path is
   * `<dataPath>/snapshots/foundry/<tag>`; the fixture test points this at
   * `apps/codex/fixtures/raw/foundry`. */
  foundrySnapshotDir: string;
  /** The AoN snapshot dir (contains one `<category>.json` per category) —
   * real host path `<dataPath>/snapshots/aon/<date>`; fixture test points
   * this at `apps/codex/fixtures/raw/aon`. */
  aonSnapshotDir: string;
  /** Where the deterministic corpus is written (wiped + rewritten wholesale
   * every call, `emit.ts`'s own contract) — real host path
   * `<dataPath>/corpus`; the fixture test points this at a fresh temp dir. */
  corpusRoot: string;
  aliasesFile: JoinAliasesFile;
  /** The D29-4 pins to copy into `corpus/manifest.json` — read from the
   * committed `corpus-manifest.json` on the real host run; the fixture test
   * supplies its own small stand-in pin object (not a real fetch pin). */
  pins: { foundry: CorpusManifest["foundry"]; aon: CorpusManifest["aon"] };
}

export interface TransformResult {
  hardFailures: HardFailure[];
  /** Present only when `hardFailures` is empty — a hard failure aborts BEFORE
   * the join/emit/report stages, same posture as `parse-foundry.ts`/
   * `parse-aon.ts`'s own gates (spec's drift tripwire: never build a report
   * over a run that already failed). */
  reportJson?: ReportJson;
  reportMarkdown?: string;
  emit?: EmitCorpusResult;
}

/**
 * The full S4 pipeline, callable identically from the real CLI (`main()`
 * below) and the CI-hermetic fixture test. Every counter/map is created FRESH
 * in this call (no module-scope mutable state) so two calls in the same
 * process — exactly what the fixture test's determinism check does — never
 * leak state into each other.
 */
export function runTransform(paths: TransformPaths): TransformResult {
  const reportCounts = new Map<string, number>();
  const reportExamples = new Map<string, string[]>();
  const hardFailures: HardFailure[] = [];

  function report(cls: string, detail: string): void {
    reportCounts.set(cls, (reportCounts.get(cls) ?? 0) + 1);
    const examples = reportExamples.get(cls) ?? [];
    if (examples.length < 5) {
      examples.push(detail);
      reportExamples.set(cls, examples);
    }
  }

  const foundry = loadFoundrySide(paths.foundrySnapshotDir, report, hardFailures);
  const aon = loadAonSide(paths.aonSnapshotDir, report, hardFailures);

  if (hardFailures.length > 0) return { hardFailures };

  // D29-18: collapse same-(category,slug,aonUrl,edition) duplicate AoN docs
  // to one deterministic winner BEFORE the link table / join ever see them —
  // see aonDedup.ts's file header for why (kills the phantom `-N` residual
  // collisions duplicate ES entries would otherwise mint).
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

  // Shared across the join's `@Embed` resolution AND the D29-114
  // `augmentClassStats` pass below — same `foundry.index`, no containing-doc
  // context needed for either (both resolve absolute uuids only).
  const resolveForeignUuid = createResolveUuid(foundry.index);

  const joinResult = runJoin({
    foundryEntities: foundry.entities,
    aonMetas: dedupedMetas,
    aonMarkdownById: dedupedMarkdownById,
    linkTable,
    remasterRedirects: foundry.redirects,
    aliasesFile: paths.aliasesFile,
    resolveForeignEmbed: resolveForeignUuid,
    report,
  });

  // D29-14/-17/-98: drop every Foundry-only entity except the creature/
  // hazard carve-out, PLUS (D29-98, P11 S1) the widened AoN-only activation-
  // debris families — S5c, the last P1.5 pass before emit.
  const dropResult = applyAonPrimaryDrop(joinResult.entities, report);

  // D29-100 (P11 S1): whole-document adjacent-crossref dedupe — drop.ts-
  // adjacent (same pipeline stage, right after the drop pass, on its kept
  // set) so a dedupe target that itself got dropped this run never needs
  // separate reconciliation (the drop pass's own `reconcileCrossrefs` already
  // downgraded any now-dangling crossref to `brokenRef` before this runs).
  const dedupeResult = collapseAdjacentCrossrefs(dropResult.keptEntities, report);

  // D29-61(a) (R9, P6): the ingest-time "missing level -> 0" default — runs
  // on the FINAL (post-drop) entity set, since R4's ritual move has already
  // settled every entity's final `category` by this point in the pipeline.
  const levelDefaultResult = applyLevelDefault(dedupeResult.entities, report);

  // ---- P4 (D29-39) S1: book-name normalize -> sidebar reverse-join ----
  // Both passes run BEFORE emit — the corpus on disk (entity files +
  // `_index.json`) must reflect the normalized book strings and the
  // `attachedSidebars` field, not just the two new standalone artifacts.
  const aonBookNames = new Set(dedupedMetas.map((m) => m.primarySource.book));
  const bookNorm = normalizeBookNames(levelDefaultResult.entities, aonBookNames);

  const finalIdToAonId = new Map<string, string>();
  for (const [aonId, finalId] of joinResult.aonIdToFinalId) finalIdToAonId.set(finalId, aonId);

  const sidebarResult = attachSidebars(
    bookNorm.entities,
    linkTable,
    joinResult.aonIdToFinalId,
    finalIdToAonId,
    report,
  );
  // D29-114/-115 (P12 S1): the post-drop class-stats augment pass — MUST run
  // over the FINAL kept entity set (grantedFeatures' targetId nulling checks
  // final-set membership; subclassOptions' current-edition union reads
  // final `remasteredAs`) and MUST run before `emitCorpus` (its mutations
  // are what actually lands in the corpus).
  const augmentResult = augmentClassStats({
    entities: sidebarResult.entities,
    classGrantedFeatures: foundry.classGrantedFeatures,
    resolveUuid: resolveForeignUuid,
    report,
  });
  const finalEntities = augmentResult.entities;

  const emitResult = emitCorpus({
    corpusRoot: paths.corpusRoot,
    entities: finalEntities,
    pins: paths.pins,
  });

  // ---- P4 (D29-39) S1: rules-tree.json ----
  const aonMetaByAonId = new Map(dedupedMetas.map((m) => [m.aonId, m] as const));
  const rulesDocs: RulesDocInput[] = [];
  for (const entity of finalEntities) {
    if (entity.category !== "rules") continue;
    const aonId = finalIdToAonId.get(entity.id);
    const meta = aonId !== undefined ? aonMetaByAonId.get(aonId) : undefined;
    if (aonId === undefined || meta === undefined) {
      report("rulesTreeMissingAonMeta", entity.id);
      continue;
    }
    const nextAonId =
      meta.nextUrl !== undefined
        ? linkTable.byUrl.get(normalizeUrlKey(meta.nextUrl))?.aonId
        : undefined;
    rulesDocs.push({
      aonId,
      finalId: entity.id,
      name: entity.name,
      book: entity.source.book,
      edition: entity.edition,
      breadcrumbs: entity.breadcrumbs ?? [],
      superseded: (entity.remasteredAs?.length ?? 0) > 0,
      ...(nextAonId !== undefined ? { nextAonId } : {}),
    });
  }
  const bookSourceLicense = new Map<string, License>();
  const sourceEntityRefByBook = new Map<string, string>();
  for (const e of finalEntities) {
    if (e.category !== "source") continue;
    bookSourceLicense.set(e.source.book, e.source.license);
    sourceEntityRefByBook.set(e.source.book, e.id);
  }
  const { file: rulesTreeFile, stats: rulesTreeStats } = buildRulesTree(
    rulesDocs,
    bookSourceLicense,
    report,
  );
  const validatedRulesTree = RulesTreeFileSchema.parse(rulesTreeFile);
  writeCanonicalJson(join(paths.corpusRoot, "rules-tree.json"), validatedRulesTree);

  // ---- P4 (D29-43) S1: sources-index.json ----
  // A plain function (not inlined in `.map()`) — no object-spread appears
  // inside a map callback (oxlint `no-map-spread`, `aonFacets.ts`'s
  // `makeCitation` precedent).
  function toAonCitation(m: AonDocMeta): AonBookCitation {
    return m.productLine !== undefined
      ? { book: m.primarySource.book, productLine: m.productLine }
      : { book: m.primarySource.book };
  }
  const aonCitations: AonBookCitation[] = dedupedMetas.map(toAonCitation);
  const { file: sourcesIndexFile, stats: sourcesIndexStats } = buildSourcesIndex({
    finalEntities,
    aonCitations,
    bookNameMap: bookNorm.bookNameMap,
    bookSourceLicense,
    sourceEntityRefByBook,
  });
  const validatedSourcesIndex = SourcesIndexFileSchema.parse(sourcesIndexFile);
  writeCanonicalJson(join(paths.corpusRoot, "sources-index.json"), validatedSourcesIndex);

  const reportJson = buildReportJson({
    reportCounts,
    reportExamples,
    hardFailureCount: hardFailures.length,
    join: joinResult,
    finalEntities,
    dropAccounting: dropResult.accounting,
    adjacentCrossrefDedupe: {
      totalOccurrences: dedupeResult.totalOccurrences,
      entitiesTouched: dedupeResult.entitiesTouched,
    },
    foundrySnapshotDocCount: foundry.entities.size,
    // Deliberately the RAW extracted count (pre-D29-18-dedup) — matches
    // `foundrySnapshotDocCount`'s own "how big was the snapshot" framing;
    // the dedup's own removal count is separately visible via the
    // `aonUrlDuplicateCollapsed` report class (Report-class counts table).
    aonSnapshotDocCount: aon.metas.length,
    sizeTotals: {
      corpusBytes: emitResult.corpusBytes,
      entityFileCount: emitResult.entityFileCount,
    },
    bookNormalization: bookNorm,
    sidebarAttachment: sidebarResult,
    rulesTree: rulesTreeStats,
    sourcesIndex: sourcesIndexStats,
    classStatsAugment: augmentResult,
  });
  const reportMarkdown = buildReportMarkdown(reportJson);

  writeCanonicalJson(join(paths.corpusRoot, "report.json"), reportJson);
  writeCanonicalText(join(paths.corpusRoot, "report.md"), reportMarkdown);

  return { hardFailures, reportJson, reportMarkdown, emit: emitResult };
}

// ---------------------------------------------------------------------------
// CLI wrapper (the real host run: `pnpm --filter @astra/codex transform`)
// ---------------------------------------------------------------------------

function main(): void {
  const cfg = loadConfig();
  const manifestPath = join(import.meta.dirname, "..", "corpus-manifest.json");
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (manifest.aon.snapshotDate === null) {
    console.error(
      "transform: no AoN snapshot recorded in corpus-manifest.json — run fetch:aon first",
    );
    process.exit(1);
  }

  const aliasesPath = join(import.meta.dirname, "..", "join-aliases.json");
  const aliasesFile = JSON.parse(readFileSync(aliasesPath, "utf8")) as JoinAliasesFile;

  const foundrySnapshotDir = join(cfg.codex.dataPath, "snapshots", "foundry", manifest.foundry.tag);
  const aonSnapshotDir = join(cfg.codex.dataPath, "snapshots", "aon", manifest.aon.snapshotDate);
  const corpusRoot = join(cfg.codex.dataPath, "corpus");

  console.log(`transform: Foundry snapshot ${foundrySnapshotDir}`);
  console.log(`transform: AoN snapshot ${aonSnapshotDir}`);
  console.log(`transform: writing corpus to ${corpusRoot}`);

  const started = Date.now();
  const result = runTransform({
    foundrySnapshotDir,
    aonSnapshotDir,
    corpusRoot,
    aliasesFile,
    pins: { foundry: manifest.foundry, aon: manifest.aon },
  });
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1);

  if (result.hardFailures.length > 0) {
    console.error(
      `\n${result.hardFailures.length} HARD FAILURES — transform aborted before join/emit:`,
    );
    for (const f of result.hardFailures.slice(0, 20)) console.error(`  ${f.path}: ${f.message}`);
    process.exit(1);
  }

  console.log(`\ntransform: completed in ${elapsedS}s`);
  console.log(
    `transform: ${result.emit?.entityFileCount ?? 0} entity files, ${result.emit?.corpusBytes ?? 0} corpus bytes`,
  );
  console.log("\n########## report.md (head) ##########\n");
  console.log((result.reportMarkdown ?? "").split("\n").slice(0, 60).join("\n"));
  console.log(`\n(full report at ${join(corpusRoot, "report.md")})`);
}

// Run only when executed as a CLI — transform.test.ts imports `runTransform`
// from this module, and an unconditional main() would kick off the REAL
// host-path transform at import time (ENOENT on any machine without the
// gitignored data/ — the exact fresh-clone hermeticity D29-12 mandates).
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
