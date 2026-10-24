/**
 * The fixture corpus generator. Every codex test, both Chromium guards and a dev server
 * without the real corpus read the fixture corpus (`fixtures/entities/`). This module
 * builds it deterministically from committed inputs, with zero network and zero `data/`
 * reads, from three sources:
 *
 *   1. `fixtures/picks/<category>/<file>.json`: real canonical entities that
 *      `src/extract-fixture.ts` copied from the real emitted corpus (host-only, rare).
 *      Each is re-read through `CodexEntitySchema` as a schema-drift guard.
 *   2. `fixtures/raw/` and `fixtures/join-aliases.json`: the mini Foundry/AoN/homebrew
 *      snapshot. The real `runTransform` runs over it, and the entities in
 *      `FIXTURE_PIPELINE_IDS` come from that run with their prose trimmed to a stub, then
 *      `PIPELINE_PATCHES` adds the test-only content some of them carry.
 *   3. `SYNTHETIC_ROWS`: rows defined in code.
 *
 * Every patch and synthetic row names the test or guard that needs it. From the entities
 * the generator derives the read surface the server expects: a per-category `_index.json`,
 * `manifest.json`, `rules-tree.json` and `sources-index.json`.
 *
 * The output is gitignored and never edited: change an input (a patch or synthetic row
 * here, a raw doc, or a re-pick) instead. `ensureFixtureCorpus()` brings
 * `fixtures/entities/` up to date. The vitest global setups of this package and of the site
 * (`apps/codex/web`), both Chromium guards and the site's `scripts/regen-goldens.ts` call
 * it through `@astra/codex-ingest/fixture`, and `pnpm --filter @astra/codex-ingest cli
 * fixture` runs it by hand (a dev server without the real corpus needs that once). Like
 * `transform.test.ts` for the corpus, `fixtureCorpus.test.ts` builds it twice and compares
 * bytes.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CodexEntitySchema,
  IndexRowSchema,
  toIndexRow,
  type CodexEntity,
  facetKeysFor,
  type BlockNode,
  type InlineNode,
  type TableRow,
  RulesTreeFileSchema,
  SourcesIndexFileSchema,
} from "@astra/codex-corpus";

import { CORPUS_SCHEMA_VERSION, canonicalJson, canonicalJsonCompact } from "./emit";
import type { JoinAliasesFile } from "./join";
import { buildRulesTree } from "./rulesTree";
import { buildSourcesIndex } from "./sourcesIndexBuild";
import { runTransform } from "./transform";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
export const FIXTURES_DIR = join(PACKAGE_ROOT, "fixtures");
export const PICKS_DIR = join(FIXTURES_DIR, "picks");
/** Where the fixture corpus lives. The site's `corpusFs.fixtureCorpusRoot()` resolves to
 * the same dir (its `corpusFs.test.ts` checks that). */
export const FIXTURE_CORPUS_DIR = join(FIXTURES_DIR, "entities");

/** `FIXTURE_CORPUS_DIR`, as a function for the callers that read it at run time. */
export function fixtureCorpusRoot(): string {
  return FIXTURE_CORPUS_DIR;
}

const FIXTURE_PINS = {
  foundry: { tag: "fixture", docCount: 0, sha256: null, fetchedAt: null },
  aon: { snapshotDate: "fixture", docCount: 0, categoryCounts: {}, sha256: null, fetchedAt: null },
};

// ---------------------------------------------------------------------------
// node builders for the code-defined content below
// ---------------------------------------------------------------------------

function text(content: string): InlineNode {
  return { kind: "text", content, marks: { bold: false, italic: false, superscript: false } };
}
function paragraph(...children: InlineNode[]): BlockNode {
  return { kind: "paragraph", children };
}
function heading2(content: string): BlockNode {
  return { kind: "heading", level: 2, children: [text(content)] };
}
function embed(target: string): InlineNode {
  return { kind: "embed", target, resolved: true };
}
function tableRow(header: boolean, ...cells: string[]): TableRow {
  return { header, cells: cells.map((c) => [text(c)]) };
}

// ---------------------------------------------------------------------------
// source 2: the fixture's own pipeline run over `fixtures/raw/`
// ---------------------------------------------------------------------------

/**
 * Ids taken from the fixture's own `runTransform` run, never from the real corpus. The class
 * stats pass (`augmentClassStats`) is shaped by exactly the raw picks in `fixtures/raw/`:
 * fighter's clean 16/16 grants, cleric's two-item stub with the First Doctrine
 * `targetId: null` case, and witch's lesson/patron pair-set. The real corpus's same-named
 * entities carry the full real population instead.
 */
export const FIXTURE_PIPELINE_IDS: readonly string[] = [
  "class/fighter",
  "class/cleric",
  "class/witch",
  // fighter's clean 16/16 granted-feature targets.
  "class-feature/reactive-strike",
  "class-feature/shield-block",
  "class-feature/bravery",
  "class-feature/fighter-weapon-mastery",
  "class-feature/battlefield-surveyor",
  "class-feature/weapon-specialization",
  "class-feature/battle-hardened",
  "class-feature/combat-flexibility",
  "class-feature/armor-expertise",
  "class-feature/fighter-expertise",
  "class-feature/weapon-legend",
  "class-feature/greater-weapon-specialization",
  "class-feature/improved-flexibility",
  "class-feature/tempered-reflexes",
  "class-feature/armor-mastery",
  "class-feature/versatile-legend",
  // cleric's one resolved grant (its First Doctrine grant stays null) and the doctrine
  // subclass pair in both shapes: legacy husks stay standalone `doctrine/*`, remaster
  // halves absorb into `class-feature/*`.
  "class-feature/doctrine",
  "class-feature/cloistered-cleric",
  "class-feature/warpriest",
  "doctrine/cloistered-cleric",
  "doctrine/warpriest",
  // witch's lesson/patron pair-set (each category: one absorbed pair, one intra-category
  // legacy/remaster pair that stays unabsorbed).
  "class-feature/lesson-of-bargains",
  "lesson/lesson-of-the-elements",
  "lesson/lesson-of-the-elements@legacy",
  "lesson/lesson-of-bargains",
  "class-feature/baba-yaga",
  "patron/the-unseen-broker",
  "patron/baba-yaga",
  "patron/pacts",
];

/** Replaces a pipeline entity's `body`: real class prose runs to hundreds of KB, and these
 * entities exist for their stats/facets/id shape only. */
function trimmedBodyPlaceholder(id: string): BlockNode[] {
  return [
    paragraph(
      text(
        `P12 S1 (D29-113..120) fixture stub — "${id}"'s real prose is trimmed to stay inside the fixture byte budget; only its stats/facets/id shape is exercised.`,
      ),
    ),
  ];
}

/** Runs the real `runTransform` over `fixtures/raw/` into a temp dir and returns every
 * emitted entity. Throws on any hard failure (`transform.test.ts` proves the raw subset
 * clean, so a failure means the two drifted). */
export function runFixturePipeline(): CodexEntity[] {
  const tmp = mkdtempSync(join(tmpdir(), "codex-fixture-pipeline-"));
  try {
    const corpusRoot = join(tmp, "corpus");
    const result = runTransform({
      foundrySnapshotDir: join(FIXTURES_DIR, "raw", "foundry"),
      aonSnapshotDir: join(FIXTURES_DIR, "raw", "aon"),
      homebrewDir: join(FIXTURES_DIR, "raw", "homebrew"),
      homebrewTraitsDir: join(FIXTURES_DIR, "raw", "homebrew-traits"),
      corpusRoot,
      aliasesFile: JSON.parse(
        readFileSync(join(FIXTURES_DIR, "join-aliases.json"), "utf8"),
      ) as JoinAliasesFile,
      pins: FIXTURE_PINS,
    });
    if (result.hardFailures.length > 0) {
      throw new Error(
        `fixture: runTransform over fixtures/raw/ hard-failed: ${result.hardFailures.map((f) => `${f.path}: ${f.message}`).join("; ")}`,
      );
    }
    return readEntityTree(corpusRoot);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A test-only change to one pipeline entity, applied after its prose is trimmed. */
interface PipelinePatch {
  readonly id: string;
  readonly neededBy: string;
  readonly apply: (entity: CodexEntity) => CodexEntity;
}

const WITCH_STUB = trimmedBodyPlaceholder("class/witch")[0] as BlockNode;

export const PIPELINE_PATCHES: readonly PipelinePatch[] = [
  {
    // Reactive Strike's body embeds a real action, so the class page's embed map has to
    // gather embeds from granted-feature bodies, not just the class body.
    id: "class-feature/reactive-strike",
    neededBy: "src/server/classPageData.test.ts (the unified embed map)",
    apply: (e) => ({ ...e, body: [...e.body, paragraph(embed("action/pursue-a-lead-2"))] }),
  },
  {
    // The loreBody-bearing class. Its body gains two feature-named sections: "Basic Lesson"
    // restates the granted feature (the Description strips it) and "Weapon Specialization"
    // only shares a grant's name (it survives). Its loreBody duplicates the body stub, embeds
    // the bare collision-family winner `class-feature/basic-lesson` (another class's doc),
    // and carries a unique table that must survive into the Lore card. A Basic Lesson grant
    // points at witch's own suffixed `class-feature/basic-lesson-2` (a synthetic row below).
    id: "class/witch",
    neededBy:
      "src/domain/render/ClassPage.test.tsx (Description extension and Lore card suppression, D29-135); src/server/classPageData.test.ts (grant level wins over doc level)",
    apply: (e) => {
      if (e.stats?.kind !== "class") throw new Error("fixture: class/witch has no ClassStats");
      const grants = [
        ...(e.stats.grantedFeatures ?? []),
        { level: 3, name: "Basic Lesson", targetId: "class-feature/basic-lesson-2" },
      ];
      for (const g of grants) {
        // A grant whose target doc has another level: witch's level-13 Weapon Specialization
        // grant points at fighter's level-7 doc, so the class page must show the grant's
        // level (classPageData.test.ts). The transform itself resolves witch's grant to its
        // own `class-feature/weapon-specialization-2` (D29-132, transform.test.ts).
        if (g.name === "Weapon Specialization") g.targetId = "class-feature/weapon-specialization";
      }
      grants.sort((a, b) => a.level - b.level);
      return {
        ...e,
        body: [
          ...e.body,
          heading2("Basic Lesson"),
          paragraph(text(BASIC_LESSON_WITCH_PROSE)),
          heading2("Weapon Specialization"),
          paragraph(
            text(
              `P14 S2 (D29-135) fixture stub — this paragraph deliberately does NOT restate class-feature/weapon-specialization's own prose, proving the Description-strip's belt-and-suspenders rule: a heading NAME match alone (this heading is literally "Weapon Specialization", matching witch's own level-13 grant) must never strip a section whose actual content differs.`,
            ),
          ),
        ],
        loreBody: [
          WITCH_STUB,
          heading2("Basic Lesson"),
          paragraph(embed("class-feature/basic-lesson")),
          heading2("Witch Basics"),
          WITCH_STUB,
          heading2("Witch's Patron Bond"),
          {
            kind: "table",
            rows: [
              tableRow(true, "Bond Tier", "Effect"),
              tableRow(
                false,
                "Minor Bond",
                "You gain a +1 circumstance bonus to Deception checks made against your patron's chosen rivals.",
              ),
              tableRow(
                false,
                "Greater Bond",
                "Once per week, you may commune with your patron for a single cryptic sentence of guidance.",
              ),
            ],
          },
        ],
        stats: { ...e.stats, grantedFeatures: grants },
      };
    },
  },
];

/** The `FIXTURE_PIPELINE_IDS` entities from one pipeline run, prose trimmed and patched. */
export function fixturePipelineEntities(): CodexEntity[] {
  const byId = new Map(runFixturePipeline().map((e) => [e.id, e] as const));
  const patches = new Map(PIPELINE_PATCHES.map((p) => [p.id, p] as const));
  for (const id of patches.keys()) {
    if (!FIXTURE_PIPELINE_IDS.includes(id)) throw new Error(`fixture: patch for unknown "${id}"`);
  }
  return FIXTURE_PIPELINE_IDS.map((id) => {
    const entity = byId.get(id);
    if (!entity) throw new Error(`fixture: "${id}" is missing from the fixtures/raw/ pipeline run`);
    entity.body = trimmedBodyPlaceholder(id);
    return patches.get(id)?.apply(entity) ?? entity;
  });
}

// ---------------------------------------------------------------------------
// source 1: real picks (`fixtures/picks/`)
// ---------------------------------------------------------------------------

/** Every entity file under a corpus-shaped tree (`<category>/<file>.json`), parsed through
 * `CodexEntitySchema`, in sorted category/file order. Skips `_index.json`. */
export function readEntityTree(root: string): CodexEntity[] {
  const out: CodexEntity[] = [];
  for (const category of readdirSync(root).sort()) {
    const dir = join(root, category);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir).sort()) {
      if (file === "_index.json") continue;
      out.push(CodexEntitySchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8"))));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// source 3: synthetic rows defined in code
// ---------------------------------------------------------------------------

const BASIC_LESSON_WITCH_PROSE =
  "You have learned a basic lesson from your patron. Once per day, you can request simple guidance, granting a plus one status bonus to a single skill check of your choice.";

/** One synthetic ritual for the listing-virtualization guard. */
function virtRitual(n: number): CodexEntity {
  const num = String(n).padStart(3, "0");
  const legacy = n % 4 === 0;
  return {
    id: `ritual/virt-${num}`,
    slug: `virt-${num}`,
    category: "ritual",
    name: `Virt Synth Ritual ${num}`,
    edition: legacy ? "legacy" : "remaster",
    source: legacy
      ? { book: "Core Rulebook", license: "OGL", page: 400 + n }
      : { book: "Player Core", license: "ORC", page: 500 + n },
    level: (n % 10) + 1,
    traits: ["virt-fixture"],
    rarity: n % 3 === 0 ? "uncommon" : "common",
    body: [
      paragraph(
        text(
          `P9 S2 (D29-89/-85) synthetic fixture row #${num}, generated only to grow the committed fixture corpus's ritual category past the SSR_WINDOW=60 threshold for real-browser interaction coverage (frontier j/k, deep-link centering, scroll restoration) — never asserted on for content, only for its position in the sorted listing.`,
        ),
      ),
    ],
    facets: {},
  };
}

/** A "Basic Lesson" class feature of the given class (the collision family D29-135 tests). */
function basicLesson(args: {
  slug: string;
  aonUrl: string;
  className: string;
  level: number;
  source: CodexEntity["source"];
  prose: string;
}): CodexEntity {
  return {
    id: `class-feature/${args.slug}`,
    slug: args.slug,
    category: "class-feature",
    name: "Basic Lesson",
    edition: "remaster",
    aonUrl: args.aonUrl,
    source: args.source,
    level: args.level,
    traits: [args.className.toLowerCase()],
    rarity: "common",
    mastheadExtra: [{ label: "Class", value: [text(` ${args.className}`)] }],
    body: [paragraph(text(args.prose))],
    facets: {
      actionCost: "passive",
      featLevel: args.level,
      itemCategory: "classfeature",
      prerequisites: [],
      rank: args.level,
    },
  };
}

/** A set of synthetic rows and the test or guard that needs them. */
interface SyntheticRowSet {
  readonly neededBy: string;
  readonly rows: () => CodexEntity[];
}

/** Synthetic rows. They feed listings, `_index.json` and `manifest.json`, but not
 * `rules-tree.json` or `sources-index.json`, which describe the real books. */
export const SYNTHETIC_ROWS: readonly SyntheticRowSet[] = [
  {
    // 90 rituals take the `ritual` category from 6 to 96 rows (93 visible), past
    // `SSR_WINDOW` = 60, so the listing virtualizes. Every fourth row is a never-remastered
    // legacy ritual (Core Rulebook, OGL), so the Edition facet has two chips and toggling it
    // narrows the listing. Levels cycle 1..10 and every third row is uncommon.
    neededBy:
      "scripts/virtualizationInteractionGuard.ts (frontier j/k, deep-link centering, reload restore, facet narrowing)",
    rows: () => Array.from({ length: 90 }, (_, i) => virtRitual(i + 1)),
  },
  {
    // A collision family: the bare winner belongs to another class (Investigator), witch's
    // own grant is the suffixed `-2`. witch's loreBody embeds the bare id, so lore stripping
    // must match by base slug, and the wrong class's text must never render.
    neededBy:
      "src/domain/render/ClassPage.test.tsx (base-slug embed matching, D29-135), with the class/witch patch",
    rows: () => [
      basicLesson({
        slug: "basic-lesson",
        aonUrl: "/Classes.aspx?ID=901",
        className: "Investigator",
        level: 1,
        source: { book: "Player Core", license: "ORC", page: 209 },
        prose: `P14 S2 (D29-135) fixture stub — this is the COLLISION-FAMILY WINNER (bare, unsuffixed) "class-feature/basic-lesson" doc, deliberately belonging to a DIFFERENT class (Investigator) than witch's own suffixed sibling "class-feature/basic-lesson-2" — proves base-slug embed stripping doesn't care which family member a lore embed happens to resolve to.`,
      }),
      basicLesson({
        slug: "basic-lesson-2",
        aonUrl: "/Classes.aspx?ID=16",
        className: "Witch",
        level: 3,
        source: { book: "Advanced Player's Guide", license: "ORC", page: 94 },
        prose: BASIC_LESSON_WITCH_PROSE,
      }),
    ],
  },
];

// ---------------------------------------------------------------------------
// the generator
// ---------------------------------------------------------------------------

interface FixtureEntry {
  entity: CodexEntity;
  synthetic: boolean;
}

/** The file name an entity is written under: its id after the category prefix. */
function entityFileName(entity: CodexEntity): string {
  const prefix = `${entity.category}/`;
  if (!entity.id.startsWith(prefix)) {
    throw new Error(`fixture: id "${entity.id}" does not start with "${prefix}"`);
  }
  return `${entity.id.slice(prefix.length)}.json`;
}

function compareIds(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function indexContent(entities: readonly CodexEntity[], category: string): string {
  const rows = [...entities]
    .sort(compareIds)
    .map((e) => IndexRowSchema.parse(toIndexRow(e, facetKeysFor(category))));
  return canonicalJsonCompact(rows);
}

/** Writes the whole fixture corpus into `outDir`, which must not exist yet. Deterministic:
 * the same inputs give byte-identical output. */
export function buildFixtureCorpus(outDir: string): { entityCount: number } {
  const entries: FixtureEntry[] = [
    ...[...readEntityTree(PICKS_DIR), ...fixturePipelineEntities()].map((entity) => ({
      entity: CodexEntitySchema.parse(entity),
      synthetic: false,
    })),
    ...SYNTHETIC_ROWS.flatMap((set) => set.rows()).map((entity) => ({
      entity: CodexEntitySchema.parse(entity),
      synthetic: true,
    })),
  ];
  const seen = new Set<string>();
  for (const { entity } of entries) {
    if (seen.has(entity.id)) throw new Error(`fixture: duplicate entity id "${entity.id}"`);
    seen.add(entity.id);
  }
  entries.sort((a, b) => compareIds(a.entity, b.entity));

  mkdirSync(outDir);
  // Entity and `_index.json` bytes: the same total `emit.ts` records.
  let bytes = 0;
  const byCategory = new Map<string, FixtureEntry[]>();
  for (const entry of entries) {
    const { entity } = entry;
    const dir = join(outDir, entity.category);
    mkdirSync(dir, { recursive: true });
    const content = canonicalJson(entity);
    writeFileSync(join(dir, entityFileName(entity)), content);
    bytes += Buffer.byteLength(content);
    const list = byCategory.get(entity.category) ?? [];
    list.push(entry);
    byCategory.set(entity.category, list);
  }

  const categoryCounts: Record<string, number> = {};
  for (const category of [...byCategory.keys()].sort()) {
    const list = byCategory.get(category) ?? [];
    categoryCounts[category] = list.length;
    const content = indexContent(
      list.map((e) => e.entity),
      category,
    );
    writeFileSync(join(outDir, category, "_index.json"), content);
    bytes += Buffer.byteLength(content);
  }
  writeFileSync(
    join(outDir, "manifest.json"),
    canonicalJson({
      schemaVersion: CORPUS_SCHEMA_VERSION,
      ...FIXTURE_PINS,
      categoryCounts,
      totalEntityCount: entries.length,
      totalSizeBytes: bytes,
    }),
  );

  // The rules tree and sources index. No raw AoN aonId/next-link data survives into
  // canonical entities, so sibling order falls back to alphabetical and the entity id stands
  // in for `aonId` (`rulesTree.test.ts` covers real chain order).
  const real = entries.filter((e) => !e.synthetic).map((e) => e.entity);
  const bookSourceLicense = new Map<string, CodexEntity["source"]["license"]>();
  const sourceEntityRefByBook = new Map<string, string>();
  for (const e of real) {
    if (e.category !== "source") continue;
    bookSourceLicense.set(e.source.book, e.source.license);
    sourceEntityRefByBook.set(e.source.book, e.id);
  }
  const rulesDocs = real
    .filter((e) => e.category === "rules")
    .map((e) => ({
      aonId: e.id,
      finalId: e.id,
      name: e.name,
      book: e.source.book,
      edition: e.edition,
      breadcrumbs: e.breadcrumbs ?? [],
      superseded: (e.remasteredAs?.length ?? 0) > 0,
    }));
  const { file: rulesTree } = buildRulesTree(rulesDocs, bookSourceLicense, () => {});
  writeFileSync(
    join(outDir, "rules-tree.json"),
    canonicalJson(RulesTreeFileSchema.parse(rulesTree)),
  );
  const { file: sourcesIndex } = buildSourcesIndex({
    finalEntities: real,
    aonCitations: [],
    bookNameMap: new Map(),
    bookSourceLicense,
    sourceEntityRefByBook,
  });
  writeFileSync(
    join(outDir, "sources-index.json"),
    canonicalJson(SourcesIndexFileSchema.parse(sourcesIndex)),
  );
  return { entityCount: entries.length };
}

/** Every regular file under `root`, keyed by its path relative to `root`, in sorted order. */
export function readTree(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  function walk(dir: string, prefix: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(abs).isDirectory()) walk(abs, rel);
      else out.set(rel, readFileSync(abs));
    }
  }
  walk(root, "");
  return out;
}

function sameTree(a: string, b: string): boolean {
  if (!existsSync(b)) return false;
  const treeA = readTree(a);
  const treeB = readTree(b);
  if (treeA.size !== treeB.size) return false;
  for (const [rel, content] of treeA) {
    const other = treeB.get(rel);
    if (!other || !content.equals(other)) return false;
  }
  return true;
}

/**
 * Brings `fixtures/entities/` up to date and returns its path. It builds a fresh copy (about
 * half a second) next to the target and swaps it in only when the bytes differ, so
 * processes that run it while others read the fixture never disturb them.
 */
export function ensureFixtureCorpus(): string {
  const staging = mkdtempSync(join(FIXTURES_DIR, ".entities-build-"));
  try {
    const fresh = join(staging, "entities");
    buildFixtureCorpus(fresh);
    if (sameTree(fresh, FIXTURE_CORPUS_DIR)) return FIXTURE_CORPUS_DIR;
    rmSync(FIXTURE_CORPUS_DIR, { recursive: true, force: true });
    try {
      renameSync(fresh, FIXTURE_CORPUS_DIR);
    } catch (e) {
      // Another process swapped in its own build first; fine when it is the same build.
      if (!sameTree(fresh, FIXTURE_CORPUS_DIR)) throw e;
    }
    return FIXTURE_CORPUS_DIR;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
