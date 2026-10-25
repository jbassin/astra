/**
 * The transform: parses the Foundry snapshot (incl. journals) and the AoN snapshot, runs
 * the join (`join.ts`), the drop and the post-join passes, then emits the deterministic
 * corpus (`emit.ts`) and the transform report (`report.ts`).
 *
 * Each step is one entry in `TRANSFORM_PASSES`, which names the state slots it reads and
 * writes; `passRegistry.ts` validates that registry and runs it. To add a pass, add an
 * entry (and a slot in `TransformSlots`) at the point in the order where its reads exist.
 *
 * `runTransform` is a PURE
 * function of its input paths (no module-scope mutable state: every counter/
 * map is created fresh inside the call), so the CI-hermetic fixture pipeline
 * test (`transform.test.ts`) can call the EXACT SAME code
 * path over the committed fixture's raw-doc subset, twice in the same
 * process, and compare the two runs for byte-determinism — a shared
 * module-level counter would leak state between those two calls and silently
 * corrupt that comparison.
 *
 * `transformMain()` below is the thin CLI wrapper for the real host run
 * (`codex-ingest transform --out <dir>`, `cli.ts`): resolves the real paths from
 * `@astra/config` + the committed `corpus-manifest.json`, calls
 * `runTransform`, prints the report.md summary, and exits 1 on ANY hard
 * failure (the drift tripwire never silently passes).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  type CodexEntity,
  type License,
  parseManifest,
  type CorpusManifest,
  RulesTreeFileSchema,
  SourcesIndexFileSchema,
} from "@astra/codex-corpus";
import { findRepoRoot, loadConfig } from "@astra/config";
import { exitAfterFlush, getTracer, initTelemetry } from "@astra/observe";

import { dedupeAonMetas } from "./aonDedup";
import { type AonDocMeta, aonSkipReason, extractAonMeta } from "./aonFacets";
import {
  type AonLinkTable,
  buildAonLinkTable,
  normalizeUrlKey,
  type LinkTableDoc,
} from "./aonLinkTable";
import { type AugmentClassStatsResult, augmentClassStats } from "./augmentClassStats";
import { type BookNormalizeResult, normalizeBookNames } from "./bookNormalize";
import { isKnownPack } from "./categoryMap";
import { type CollapseCrossrefsResult, collapseAdjacentCrossrefs } from "./dedupeCrossrefs";
import { type DropResult, applyAonPrimaryDrop } from "./drop";
import { emitCorpus, writeCanonicalJson, writeCanonicalText, type EmitCorpusResult } from "./emit";
import {
  EnricherGrammarError,
  type EnricherContext,
  type UuidResolution,
  mergeLocalizeMaps,
} from "./enrichers";
import {
  assembleFoundryEntity,
  extractRawGrantedFeatures,
  type RawFoundryDoc,
  type RawGrantedFeatureEntry,
} from "./foundryEntities";
import { FoundryHtmlError, parseFoundryHtml } from "./foundryHtml";
import { walkFiles } from "./fsWalk";
import { hashDirectory } from "./hash";
import {
  type HomebrewSide,
  type HomebrewTraitsSide,
  assertNoHomebrewCollisions,
  countHomebrewUuidRefs,
  loadHomebrewSide,
  loadHomebrewTraits,
} from "./homebrew";
import { type JoinAliasesFile, type JoinResult, runJoin } from "./join";
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
} from "./journals";
import { type LevelDefaultResult, applyLevelDefault } from "./levelDefault";
import {
  type PassContext,
  type PassRun,
  definePass,
  passClosure,
  runPasses,
  validatePasses,
} from "./passRegistry";
import { buildReportJson, buildReportMarkdown, type ReportJson } from "./report";
import { type RulesDocInput, type RulesTreeStats, buildRulesTree } from "./rulesTree";
import { type SidebarAttachResult, attachSidebars } from "./sidebarAttach";
import {
  type AonBookCitation,
  type SourcesIndexStats,
  buildSourcesIndex,
} from "./sourcesIndexBuild";
import {
  type ContainingDoc,
  type PackRegistryEntry,
  type UuidIndex,
  assertRegistryIsTotal,
  buildDocIndex,
  buildPackRegistry,
  createResolveUuid,
} from "./uuidResolve";

export type ReportFn = (cls: string, detail: string) => void;
export interface HardFailure {
  path: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Foundry side (assembly over a plain
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
  return parts.at(-1) ?? "";
}

interface FoundrySide {
  entities: Map<string, CodexEntity>;
  redirects: RemasterRedirectEntry[];
  index: UuidIndex;
  /** Class entity id -> its raw `system.items`
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
    if ((entry.docClass === "Actor" || entry.docClass === "Item") && !isKnownPack(entry.dir)) {
      throw new Error(`transform: pack "${entry.dir}" not recognized by categoryMap.ts`);
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

  // Two-phase journal ordering: decide + register every page's target
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
          // Capture the raw granted-feature manifest for every `class` doc,
          // right here where the raw `doc` is still in scope — the post-drop
          // `augmentClassStats` pass needs it, and this is the ONLY place in the pipeline the raw pack JSON is read.
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
// AoN side (extraction over a plain snapshot-dir path)
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
      if (aonSkipReason(hit) !== undefined) {
        report("aonNamelessFragment", hit._id);
        continue;
      }
      try {
        const meta = extractAonMeta(snap.category, hit, report);
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
// The pass registry (passRegistry.ts runs it): parse -> join -> drop -> emit -> report
// ---------------------------------------------------------------------------

export interface TransformPaths {
  /** The Foundry snapshot ROOT (contains `packs/pf2e`, `static/lang`,
   * `system.pf2e.json`) — the real host path is
   * `<dataPath>/snapshots/foundry/<tag>`; the fixture test points this at
   * `apps/codex/ingest/fixtures/raw/foundry`. */
  foundrySnapshotDir: string;
  /** The AoN snapshot dir (contains one `<category>.json` per category) —
   * real host path `<dataPath>/snapshots/aon/<date>`; fixture test points
   * this at `apps/codex/ingest/fixtures/raw/aon`. */
  aonSnapshotDir: string;
  /** The homebrew store root — versioned repo content
   * (`apps/assay/py/homebrew/spells/`), resolved from the repo root by
   * `defaultHomebrewDirs()`, NOT via `cfg.codex.dataPath` (config-single-source
   * isn't violated — this isn't fetched data). Host-run only; the codex Docker
   * image never contains `apps/assay/py`. The fixture test points this at
   * `apps/codex/ingest/fixtures/raw/homebrew`. */
  homebrewDir: string;
  /** The homebrew school-TRAIT store root — a SIBLING of
   * `homebrewDir` (`apps/assay/py/homebrew/traits/`), resolved the same way
   * (`defaultHomebrewDirs()`, host-run only). The fixture
   * test points this at `apps/codex/ingest/fixtures/raw/homebrew-traits`. */
  homebrewTraitsDir: string;
  /** Where the deterministic corpus is written (wiped + rewritten wholesale
   * every call, `emit.ts`'s own contract) — on the host, a release staging dir
   * (`release.ts build`); the fixture test points this at a fresh temp dir. */
  corpusRoot: string;
  aliasesFile: JoinAliasesFile;
  /** The snapshot pins to copy into `corpus/manifest.json` — read from the
   * committed `corpus-manifest.json` on the real host run; the fixture test
   * supplies its own small stand-in pin object (not a real fetch pin). */
  pins: { foundry: CorpusManifest["foundry"]; aon: CorpusManifest["aon"] };
}

/** The state slots the passes read and write. Each slot has exactly one writer. */
export interface TransformSlots {
  foundry: FoundrySide;
  homebrew: HomebrewSide;
  homebrewTraits: HomebrewTraitsSide;
  /** The raw AoN extraction, before the url-duplicate dedupe. */
  aon: AonSide;
  /** The deduped AoN docs every later pass uses. */
  aonMetas: readonly AonDocMeta[];
  aonMarkdownById: Map<string, string>;
  linkTable: AonLinkTable;
  joined: JoinResult;
  finalIdToAonId: Map<string, string>;
  /** Homebrew spells, rituals and traits as one list. */
  homebrewEntities: CodexEntity[];
  drop: DropResult;
  crossrefDedupe: CollapseCrossrefsResult;
  levelDefault: LevelDefaultResult;
  bookNorm: BookNormalizeResult;
  sidebars: SidebarAttachResult;
  classStats: AugmentClassStatsResult;
  /** The entity set that lands in the corpus. */
  finalEntities: CodexEntity[];
  emit: EmitCorpusResult;
  bookSources: { license: Map<string, License>; entityRef: Map<string, string> };
  rulesTree: RulesTreeStats;
  sourcesIndex: SourcesIndexStats;
  report: { json: ReportJson; markdown: string };
}

export interface TransformContext extends PassContext {
  paths: TransformPaths;
  report: ReportFn;
  /** What `report` has recorded: per class, the count and the first five details. */
  reportCounts: ReadonlyMap<string, number>;
  reportExamples: ReadonlyMap<string, string[]>;
  hardFailures: HardFailure[];
}

const pass = definePass<TransformSlots, TransformContext>();

/**
 * Every transform pass, in run order. `validatePasses` checks the order against the
 * declared reads and writes on every run. The order of passes that call `report` is also
 * the order of each report class's examples in `report.json`, so moving a pass can change
 * the report even when every read is still satisfied.
 */
export const TRANSFORM_PASSES = [
  pass({
    name: "load-foundry",
    phase: "parse",
    summary: "Parse the Foundry packs and journals into entities and the uuid index.",
    reads: [],
    writes: ["foundry"],
    run: (_, ctx) => ({
      foundry: loadFoundrySide(ctx.paths.foundrySnapshotDir, ctx.report, ctx.hardFailures),
    }),
    counts: ({ foundry }) => ({
      entities: foundry.entities.size,
      redirects: foundry.redirects.length,
      classGrants: foundry.classGrantedFeatures.size,
    }),
  }),
  pass({
    name: "load-homebrew",
    phase: "parse",
    summary: "Parse the homebrew spell store against the official uuid index.",
    // Its ctx resolves `@UUID[...conditionitems...]` refs against
    // the OFFICIAL `foundry.index` (an empty index would downgrade all 70 ref-bearing
    // homebrew docs to brokenRef).
    reads: ["foundry"],
    writes: ["homebrew"],
    run: ({ foundry }, ctx) => ({
      homebrew: loadHomebrewSide(
        ctx.paths.homebrewDir,
        foundry.index,
        ctx.report,
        ctx.hardFailures,
      ),
    }),
    counts: ({ homebrew }) => ({
      entities: homebrew.entities.length,
      slugMismatches: homebrew.slugMismatchCount,
    }),
  }),
  pass({
    name: "load-homebrew-traits",
    phase: "parse",
    summary: "Parse the homebrew school-trait store against the official uuid index.",
    // A separate loader, because the trait store's
    // `{name,description}` shape isn't a Foundry pack doc.
    reads: ["foundry"],
    writes: ["homebrewTraits"],
    run: ({ foundry }, ctx) => ({
      homebrewTraits: loadHomebrewTraits(
        ctx.paths.homebrewTraitsDir,
        foundry.index,
        ctx.report,
        ctx.hardFailures,
      ),
    }),
    counts: ({ homebrewTraits }) => ({ entities: homebrewTraits.entities.length }),
  }),
  pass({
    name: "load-aon",
    phase: "parse",
    summary: "Extract the AoN snapshot's docs and their markdown.",
    reads: [],
    writes: ["aon"],
    run: (_, ctx) => ({ aon: loadAonSide(ctx.paths.aonSnapshotDir, ctx.report, ctx.hardFailures) }),
    counts: ({ aon }) => ({ docs: aon.metas.length, withMarkdown: aon.markdownById.size }),
  }),
  pass({
    name: "dedupe-aon",
    phase: "build",
    summary: "Collapse duplicate AoN docs to one deterministic winner.",
    // Before the link table and the join see them: duplicate ES entries would
    // otherwise mint phantom `-N` residual collisions (aonDedup.ts's header).
    reads: ["aon"],
    writes: ["aonMetas", "aonMarkdownById"],
    run: ({ aon }, ctx) => {
      const aonMetas = dedupeAonMetas(aon.metas, ctx.report);
      const kept = new Set(aonMetas.map((m) => m.aonId));
      const aonMarkdownById = new Map([...aon.markdownById].filter(([id]) => kept.has(id)));
      return { aonMetas, aonMarkdownById };
    },
    counts: ({ aonMetas }) => ({ docs: aonMetas.length }),
  }),
  pass({
    name: "aon-link-table",
    phase: "build",
    summary: "Build the AoN-url to codex-id link table.",
    reads: ["aonMetas"],
    writes: ["linkTable"],
    run: ({ aonMetas }, ctx) => {
      const docs: LinkTableDoc[] = aonMetas.map((m) => ({
        aonId: m.aonId,
        category: m.category,
        slug: m.slug,
        aonUrl: m.aonUrl,
        name: m.name,
      }));
      return { linkTable: buildAonLinkTable(docs, ctx.report) };
    },
    counts: ({ linkTable }) => ({ urls: linkTable.byUrl.size }),
  }),
  pass({
    name: "join",
    phase: "build",
    summary: "Join Foundry and AoN into one entity per game element (join.ts).",
    reads: ["foundry", "aonMetas", "aonMarkdownById", "linkTable"],
    writes: ["joined", "finalIdToAonId"],
    run: ({ foundry, aonMetas, aonMarkdownById, linkTable }, ctx) => {
      const joined = runJoin({
        foundryEntities: foundry.entities,
        aonMetas,
        aonMarkdownById,
        linkTable,
        remasterRedirects: foundry.redirects,
        aliasesFile: ctx.paths.aliasesFile,
        // Absolute uuids only, so no containing-doc context.
        resolveForeignEmbed: createResolveUuid(foundry.index),
        report: ctx.report,
      });
      const finalIdToAonId = new Map<string, string>();
      for (const [aonId, finalId] of joined.aonIdToFinalId) finalIdToAonId.set(finalId, aonId);
      return { joined, finalIdToAonId };
    },
    counts: ({ joined }) => ({ entities: joined.entities.length, pairings: joined.pairingCount }),
  }),
  pass({
    name: "merge-homebrew",
    phase: "build",
    summary: "Combine the homebrew spells, rituals and traits into one entity list.",
    // Homebrew never enters the AoN join (no aonUrl, no legacyOf/
    // remasteredAs, so superseded:false by construction); it merges in at the drop.
    reads: ["homebrew", "homebrewTraits"],
    writes: ["homebrewEntities"],
    run: ({ homebrew, homebrewTraits }) => ({
      homebrewEntities: [...homebrew.entities, ...homebrewTraits.entities],
    }),
    counts: ({ homebrewEntities }) => ({ entities: homebrewEntities.length }),
  }),
  pass({
    name: "aon-primary-drop",
    phase: "build",
    summary: "Drop Foundry-only entities and AoN-only activation debris.",
    // Keeps the creature/hazard carve-out and, through its `homebrewIds` arm, every
    // homebrew entity. Then the hard collision guard: never a silent overwrite (see
    // `assertNoHomebrewCollisions` for the two id spaces it checks and why).
    reads: ["joined", "homebrewEntities", "foundry"],
    writes: ["drop"],
    run: ({ joined, homebrewEntities, foundry }, ctx) => {
      const homebrewIds = new Set(homebrewEntities.map((e) => e.id));
      const drop = applyAonPrimaryDrop(
        [...joined.entities, ...homebrewEntities],
        ctx.report,
        homebrewIds,
      );
      assertNoHomebrewCollisions(homebrewIds, foundry.entities, drop.keptEntities);
      return { drop };
    },
    counts: ({ drop }) => ({ kept: drop.keptEntities.length }),
  }),
  pass({
    name: "dedupe-crossrefs",
    phase: "build",
    summary: "Collapse adjacent duplicate crossrefs over the kept set.",
    // Right after the drop, on its kept set: the drop's own `reconcileCrossrefs` has
    // already downgraded any now-dangling crossref to `brokenRef`.
    reads: ["drop"],
    writes: ["crossrefDedupe"],
    run: ({ drop }, ctx) => ({
      crossrefDedupe: collapseAdjacentCrossrefs(drop.keptEntities, ctx.report),
    }),
    counts: ({ crossrefDedupe }) => ({
      occurrences: crossrefDedupe.totalOccurrences,
      entitiesTouched: crossrefDedupe.entitiesTouched,
    }),
  }),
  pass({
    name: "level-default",
    phase: "build",
    summary: "Default a missing level to 0 on the final entity set.",
    // Every entity's final `category` is settled by now (including the join's ritual move).
    reads: ["crossrefDedupe"],
    writes: ["levelDefault"],
    run: ({ crossrefDedupe }, ctx) => ({
      levelDefault: applyLevelDefault(crossrefDedupe.entities, ctx.report),
    }),
    counts: ({ levelDefault }) => ({ defaulted: levelDefault.defaultedCount }),
  }),
  pass({
    name: "normalize-books",
    phase: "build",
    summary: "Normalize book names across Foundry and AoN.",
    // Before emit: the entity files and `_index.json` must carry the normalized names.
    reads: ["levelDefault", "aonMetas"],
    writes: ["bookNorm"],
    run: ({ levelDefault, aonMetas }) => ({
      bookNorm: normalizeBookNames(
        levelDefault.entities,
        new Set(aonMetas.map((m) => m.primarySource.book)),
      ),
    }),
    counts: ({ bookNorm }) => ({ mergedNames: bookNorm.bookNameMap.size }),
  }),
  pass({
    name: "attach-sidebars",
    phase: "build",
    summary: "Reverse-join sidebars onto their host entities.",
    reads: ["bookNorm", "linkTable", "joined", "finalIdToAonId"],
    writes: ["sidebars"],
    run: ({ bookNorm, linkTable, joined, finalIdToAonId }, ctx) => ({
      sidebars: attachSidebars(
        bookNorm.entities,
        linkTable,
        joined.aonIdToFinalId,
        finalIdToAonId,
        ctx.report,
      ),
    }),
    counts: ({ sidebars }) => ({
      sidebars: sidebars.sidebarsTotal,
      resolved: sidebars.sidebarsResolved,
      hosts: sidebars.hostsWithSidebars,
    }),
  }),
  pass({
    name: "augment-class-stats",
    phase: "build",
    summary: "Add granted features and subclass options to class stats.",
    // Over the FINAL kept set (grantedFeatures' targetId nulling checks final-set
    // membership; subclassOptions reads final `remasteredAs`), and before emit.
    reads: ["sidebars", "foundry"],
    writes: ["classStats", "finalEntities"],
    run: ({ sidebars, foundry }, ctx) => {
      const classStats = augmentClassStats({
        entities: sidebars.entities,
        classGrantedFeatures: foundry.classGrantedFeatures,
        resolveUuid: createResolveUuid(foundry.index),
        report: ctx.report,
      });
      return { classStats, finalEntities: classStats.entities };
    },
    counts: ({ classStats, finalEntities }) => ({
      classStats: classStats.classStatsEmitted,
      finalEntities: finalEntities.length,
    }),
  }),
  pass({
    name: "emit-corpus",
    phase: "build",
    summary: "Wipe the corpus root and write every entity, _index.json and manifest.json.",
    reads: ["finalEntities"],
    writes: ["emit"],
    run: ({ finalEntities }, ctx) => ({
      emit: emitCorpus({
        corpusRoot: ctx.paths.corpusRoot,
        entities: finalEntities,
        pins: ctx.paths.pins,
      }),
    }),
    counts: ({ emit }) => ({ entityFiles: emit.entityFileCount, bytes: emit.corpusBytes }),
  }),
  pass({
    name: "book-sources",
    phase: "build",
    summary: "Map each book to its `source` entity's license and id.",
    reads: ["finalEntities"],
    writes: ["bookSources"],
    run: ({ finalEntities }) => {
      const license = new Map<string, License>();
      const entityRef = new Map<string, string>();
      for (const e of finalEntities) {
        if (e.category !== "source") continue;
        license.set(e.source.book, e.source.license);
        entityRef.set(e.source.book, e.id);
      }
      return { bookSources: { license, entityRef } };
    },
    counts: ({ bookSources }) => ({ books: bookSources.license.size }),
  }),
  pass({
    name: "rules-tree",
    phase: "build",
    summary: "Build and write rules-tree.json.",
    // Reads `emit` only for order: emit wipes the corpus root first.
    reads: ["finalEntities", "finalIdToAonId", "aonMetas", "linkTable", "bookSources", "emit"],
    writes: ["rulesTree"],
    run: ({ finalEntities, finalIdToAonId, aonMetas, linkTable, bookSources }, ctx) => {
      const aonMetaByAonId = new Map(aonMetas.map((m) => [m.aonId, m] as const));
      const rulesDocs: RulesDocInput[] = [];
      for (const entity of finalEntities) {
        if (entity.category !== "rules") continue;
        const aonId = finalIdToAonId.get(entity.id);
        const meta = aonId !== undefined ? aonMetaByAonId.get(aonId) : undefined;
        if (aonId === undefined || meta === undefined) {
          ctx.report("rulesTreeMissingAonMeta", entity.id);
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
      const { file, stats } = buildRulesTree(rulesDocs, bookSources.license, ctx.report);
      writeCanonicalJson(
        join(ctx.paths.corpusRoot, "rules-tree.json"),
        RulesTreeFileSchema.parse(file),
      );
      return { rulesTree: stats };
    },
    counts: ({ rulesTree }) => ({ docs: rulesTree.totalDocs, books: rulesTree.bookCount }),
  }),
  pass({
    name: "sources-index",
    phase: "build",
    summary: "Build and write sources-index.json.",
    // Reads `emit` only for order: emit wipes the corpus root first.
    reads: ["finalEntities", "aonMetas", "bookNorm", "bookSources", "emit"],
    writes: ["sourcesIndex"],
    run: ({ finalEntities, aonMetas, bookNorm, bookSources }, ctx) => {
      const { file, stats } = buildSourcesIndex({
        finalEntities,
        aonCitations: aonMetas.map(toAonCitation),
        bookNameMap: bookNorm.bookNameMap,
        bookSourceLicense: bookSources.license,
        sourceEntityRefByBook: bookSources.entityRef,
      });
      writeCanonicalJson(
        join(ctx.paths.corpusRoot, "sources-index.json"),
        SourcesIndexFileSchema.parse(file),
      );
      return { sourcesIndex: stats };
    },
    counts: ({ sourcesIndex }) => ({
      books: sourcesIndex.totalBooks,
      classifiedBooks: sourcesIndex.classifiedBooks,
    }),
  }),
  pass({
    name: "report",
    phase: "build",
    summary: "Build and write report.json and report.md.",
    reads: [
      "foundry",
      "aon",
      "homebrew",
      "homebrewTraits",
      "homebrewEntities",
      "joined",
      "drop",
      "crossrefDedupe",
      "bookNorm",
      "sidebars",
      "classStats",
      "finalEntities",
      "emit",
      "rulesTree",
      "sourcesIndex",
    ],
    writes: ["report"],
    run: (slots, ctx) => {
      const json = buildTransformReport(slots, ctx);
      const markdown = buildReportMarkdown(json);
      writeCanonicalJson(join(ctx.paths.corpusRoot, "report.json"), json);
      writeCanonicalText(join(ctx.paths.corpusRoot, "report.md"), markdown);
      return { report: { json, markdown } };
    },
  }),
];

/** A plain function, not inlined in `.map()`: no object spread inside a map callback
 * (oxlint `no-map-spread`, `aonFacets.ts`'s `makeCitation` precedent). */
function toAonCitation(m: AonDocMeta): AonBookCitation {
  return m.productLine !== undefined
    ? { book: m.primarySource.book, productLine: m.productLine }
    : { book: m.primarySource.book };
}

type ReportSlots =
  | "foundry"
  | "aon"
  | "homebrew"
  | "homebrewTraits"
  | "homebrewEntities"
  | "joined"
  | "drop"
  | "crossrefDedupe"
  | "bookNorm"
  | "sidebars"
  | "classStats"
  | "finalEntities"
  | "emit"
  | "rulesTree"
  | "sourcesIndex";

function buildTransformReport(
  slots: Pick<TransformSlots, ReportSlots>,
  ctx: TransformContext,
): ReportJson {
  const { homebrew, homebrewTraits, homebrewEntities } = slots;
  // The homebrew provenance pin lives in report.json/report.md, NOT
  // `corpus/manifest.json` (`.strict()` — an added key throws at `parseManifest`
  // before the transform even starts). `emittedByCategory`/`uuidRefs*` cover the
  // COMBINED spells+rituals+traits set; `dir`/`docsIn`/`sha256` stay scoped to the
  // spells STORE, with the traits store's own provenance in the `traits*` fields
  // rather than one dir/hash pair spanning two directories.
  const homebrewCategoryCounts: Record<string, number> = {};
  for (const e of homebrewEntities) {
    homebrewCategoryCounts[e.category] = (homebrewCategoryCounts[e.category] ?? 0) + 1;
  }
  const homebrewUuidRefs = countHomebrewUuidRefs(homebrewEntities);

  return buildReportJson({
    reportCounts: ctx.reportCounts,
    reportExamples: ctx.reportExamples,
    hardFailureCount: ctx.hardFailures.length,
    join: slots.joined,
    finalEntities: slots.finalEntities,
    dropAccounting: slots.drop.accounting,
    homebrew: {
      dir: ctx.paths.homebrewDir,
      docsIn: homebrew.entities.length,
      emittedByCategory: Object.fromEntries(
        Object.entries(homebrewCategoryCounts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      uuidRefsResolved: homebrewUuidRefs.resolved,
      uuidRefsBroken: homebrewUuidRefs.broken,
      slugMismatchCount: homebrew.slugMismatchCount,
      // Reaching this pass means `assertNoHomebrewCollisions` (aon-primary-drop) didn't
      // throw: a throw aborts the whole run before report.json is ever built.
      collisionGuardOk: true,
      sha256: hashDirectory(ctx.paths.homebrewDir),
      traitsDir: ctx.paths.homebrewTraitsDir,
      traitsDocsIn: homebrewTraits.entities.length,
      traitsSha256: hashDirectory(ctx.paths.homebrewTraitsDir),
    },
    adjacentCrossrefDedupe: {
      totalOccurrences: slots.crossrefDedupe.totalOccurrences,
      entitiesTouched: slots.crossrefDedupe.entitiesTouched,
    },
    foundrySnapshotDocCount: slots.foundry.entities.size,
    // Deliberately the RAW extracted count (before the url-duplicate dedup), matching
    // `foundrySnapshotDocCount`'s "how big was the snapshot" framing; the dedup's own
    // removal count is the `aonUrlDuplicateCollapsed` report class.
    aonSnapshotDocCount: slots.aon.metas.length,
    sizeTotals: {
      corpusBytes: slots.emit.corpusBytes,
      entityFileCount: slots.emit.entityFileCount,
    },
    bookNormalization: slots.bookNorm,
    sidebarAttachment: slots.sidebars,
    rulesTree: slots.rulesTree,
    sourcesIndex: slots.sourcesIndex,
    classStatsAugment: slots.classStats,
  });
}

// ---------------------------------------------------------------------------
// runTransform — validate the registry, then run it
// ---------------------------------------------------------------------------

export interface TransformOptions {
  /** Run only this pass and the passes it reads from (debugging). The result then has
   * no report unless the pass is `report`; a pass that writes files still writes them. */
  only?: string;
}

export interface TransformResult {
  hardFailures: HardFailure[];
  /** Present only when `hardFailures` is empty — a hard failure aborts BEFORE
   * the join/emit/report stages (the drift tripwire: never build a report
   * over a run that already failed). */
  reportJson?: ReportJson;
  reportMarkdown?: string;
  emit?: EmitCorpusResult;
  /** One entry per pass that ran, in order: timing and counts. */
  passes: PassRun[];
  /** Every slot the run wrote (for `only` runs and tests). */
  slots: Partial<TransformSlots>;
}

/**
 * The full pipeline, callable identically from the real CLI and the CI-hermetic fixture
 * test. Every counter and map is created FRESH in this call (no module-scope mutable
 * state), so two calls in the same process — exactly what the fixture test's determinism
 * check does — never leak state into each other.
 */
export function runTransform(paths: TransformPaths, opts: TransformOptions = {}): TransformResult {
  validatePasses(TRANSFORM_PASSES);
  const passes =
    opts.only === undefined ? TRANSFORM_PASSES : passClosure(TRANSFORM_PASSES, opts.only);

  const reportCounts = new Map<string, number>();
  const reportExamples = new Map<string, string[]>();
  const hardFailures: HardFailure[] = [];
  let reportEvents = 0;
  function report(cls: string, detail: string): void {
    reportEvents += 1;
    reportCounts.set(cls, (reportCounts.get(cls) ?? 0) + 1);
    const examples = reportExamples.get(cls) ?? [];
    if (examples.length < 5) {
      examples.push(detail);
      reportExamples.set(cls, examples);
    }
  }
  const ctx: TransformContext = {
    paths,
    report,
    hardFailures,
    reportCounts,
    reportExamples,
    reportEventCount: () => reportEvents,
    hardFailureCount: () => hardFailures.length,
  };

  const { state, runs, halted } = runPasses(passes, ctx);
  if (halted) return { hardFailures, passes: runs, slots: state };
  return {
    hardFailures,
    ...(state.report
      ? { reportJson: state.report.json, reportMarkdown: state.report.markdown }
      : {}),
    ...(state.emit ? { emit: state.emit } : {}),
    passes: runs,
    slots: state,
  };
}

/** The real homebrew stores (spells and school traits): versioned repo
 * content under `apps/assay/py/homebrew/`, NOT `cfg.codex.dataPath` (this isn't fetched
 * data). Resolved from the repo root rather than `import.meta.dirname` + `../..`, so
 * the path holds however deep codex or assay sit under `apps/`. Host-run only; the
 * codex Docker image never contains `apps/assay/py`. A missing dir throws (ENOENT from
 * `walkFiles`) rather than yielding zero spells. */
export function defaultHomebrewDirs(): { homebrewDir: string; homebrewTraitsDir: string } {
  const store = join(findRepoRoot(import.meta.dirname), "apps", "assay", "py", "homebrew");
  return { homebrewDir: join(store, "spells"), homebrewTraitsDir: join(store, "traits") };
}

// ---------------------------------------------------------------------------
// CLI wrapper (the real host run: `codex-ingest transform --out <dir>`)
// ---------------------------------------------------------------------------

const TRANSFORM_USAGE =
  "usage: transform --out <dir> [--pass <name>] | transform --list-passes\n" +
  "  --pass <name>   run only that pass and the passes it reads from (debugging)";

/** `codex-ingest transform`. Sends one span and one log line per pass to SigNoz (the log
 * lines also print), and exits through `exitAfterFlush` so they are flushed first. */
export async function transformMain(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: "string" },
      pass: { type: "string" },
      "list-passes": { type: "boolean" },
    },
  });
  if (values["list-passes"] === true) {
    validatePasses(TRANSFORM_PASSES);
    for (const p of TRANSFORM_PASSES) {
      console.log(`${p.name.padEnd(22)} ${p.phase.padEnd(5)} ${p.summary}`);
      console.log(`${"".padEnd(28)} reads [${p.reads.join(", ")}] writes [${p.writes.join(", ")}]`);
    }
    return;
  }
  // The corpus goes to `--out`, a release staging dir (`release.ts build`; `just
  // codex-build`); the transform never writes a served corpus in place.
  if (values.out === undefined) {
    console.error("transform: pass --out <dir>; `just codex-build` runs it into a new release");
    console.error(TRANSFORM_USAGE);
    process.exit(1);
  }
  const corpusRoot = values.out;
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
  const { homebrewDir, homebrewTraitsDir } = defaultHomebrewDirs();

  console.log(`transform: Foundry snapshot ${foundrySnapshotDir}`);
  console.log(`transform: AoN snapshot ${aonSnapshotDir}`);
  console.log(`transform: homebrew store ${homebrewDir}`);
  console.log(`transform: homebrew traits ${homebrewTraitsDir}`);
  console.log(`transform: writing corpus to ${corpusRoot}`);

  initTelemetry("astra.codex-ingest");
  const started = Date.now();
  const result = getTracer("astra.codex-ingest").startActiveSpan("codex.transform", (span) => {
    try {
      return runTransform(
        {
          foundrySnapshotDir,
          aonSnapshotDir,
          homebrewDir,
          homebrewTraitsDir,
          corpusRoot,
          aliasesFile,
          pins: { foundry: manifest.foundry, aon: manifest.aon },
        },
        values.pass === undefined ? {} : { only: values.pass },
      );
    } finally {
      span.end();
    }
  });
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1);

  if (result.hardFailures.length > 0) {
    console.error(
      `\n${result.hardFailures.length} HARD FAILURES — transform aborted before join/emit:`,
    );
    for (const f of result.hardFailures.slice(0, 20)) console.error(`  ${f.path}: ${f.message}`);
    await exitAfterFlush(1);
  }

  console.log(`\ntransform: completed in ${elapsedS}s`);
  if (values.pass !== undefined) {
    const ran = result.passes.map((p) => p.name).join(", ");
    console.log(`transform: ran ${result.passes.length} passes for --pass ${values.pass}: ${ran}`);
    const target = result.passes.at(-1);
    if (target) console.log(`transform: ${target.name} counts ${JSON.stringify(target.counts)}`);
    await exitAfterFlush(0);
  }
  console.log(
    `transform: ${result.emit?.entityFileCount ?? 0} entity files, ${result.emit?.corpusBytes ?? 0} corpus bytes`,
  );
  console.log("\n########## report.md (head) ##########\n");
  console.log((result.reportMarkdown ?? "").split("\n").slice(0, 60).join("\n"));
  console.log(`\n(full report at ${join(corpusRoot, "report.md")})`);
  await exitAfterFlush(0);
}
