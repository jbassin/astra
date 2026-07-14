/**
 * D29-11: the fixture extractor. Reads the REAL, already-fetched Foundry/AoN
 * snapshots (`apps/codex/data/snapshots/`) and the REAL emitted corpus
 * (`apps/codex/data/corpus/`, produced by `pnpm --filter @astra/codex
 * transform` — run that FIRST) and writes a small, deterministic,
 * COMMITTED fixture at `apps/codex/fixtures/`:
 *
 *   - `fixtures/raw/foundry/` + `fixtures/raw/aon/` — a real-shaped MINI
 *     snapshot (same directory layout the real fetchers produce) covering a
 *     hand-picked ~30-doc parser-grammar subset PLUS every doc needed to
 *     reproduce, end to end, the identity/join proof points D29-11 calls
 *     out by name: the Heal legacy/remaster shared-slug pair, Magic
 *     Missile→Force Barrage (AoN-only legacy, no shared slug), the
 *     Adamantine Dragon qualifier-reorder + 1:N spellcaster variant, the
 *     Camouflage Coat alias, the Anadi journal-page merge, a real
 *     residual (non-pair) `-2` collision (Grick), and (S5c/D29-14/-17) the
 *     AoN-primary drop pass itself: a Foundry-only `boon` doc (Desna's
 *     Major Boon) that must NOT survive into the emitted corpus, and a
 *     genuine Foundry-only creature (Dune Candle) that must survive it via
 *     the `creature`/`hazard` carve-out. `fixtures/join-aliases.json`
 *     is the matching trimmed alias file. `runTransform` (`transform.ts`) runs
 *     UNCHANGED against this subset in the CI-hermetic pipeline test.
 *   - `fixtures/entities/<category>/<slug>.json` — canonical-form-ONLY
 *     entities (no raw source), copied VERBATIM from the real emitted
 *     corpus: one representative per codex category (the smallest file in
 *     that category, to stay lean) plus whatever additional entities are
 *     needed to cover every `CodexNode` kind at least once across the whole
 *     fixture. These are NOT reprocessed by the pipeline test — only
 *     zod-validated as a schema-drift guard (D29-11's "coverage-matrix
 *     canonical entities all parse through CodexEntitySchema").
 *   - `fixtures/entities/<category>/_index.json` + `fixtures/entities/
 *     manifest.json` (D29-21, P1.6) — fixture-scoped per-category IndexRows
 *     and a fixture-scoped corpus manifest (categoryCounts over exactly the
 *     selected entities), mirroring the real corpus's read surface so P2's
 *     corpus reader / route tests / ssrSmoke run hermetically against
 *     `fixtures/entities/` with zero `data/` reads.
 *
 * ASSERTS the full coverage matrix before writing anything (fails loudly,
 * listing exactly what's missing) — this is the mechanism D29-11 requires,
 * not a best-effort sampler.
 *
 * Run via:
 *   pnpm --filter @astra/codex exec node \
 *     --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/extract-fixture.ts
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import { CORPUS_SCHEMA_VERSION, canonicalJson, canonicalJsonCompact } from "../src/ingest/emit";
import { mergeLocalizeMaps } from "../src/ingest/enrichers";
import {
  CodexEntitySchema,
  IndexRowSchema,
  toIndexRow,
  type CodexEntity,
} from "../src/schema/entity";
import { facetKeysFor } from "../src/schema/facetKeys";
import { parseManifest } from "../src/schema/manifest";
import type { CodexNode } from "../src/schema/nodes";

const APP_ROOT = join(import.meta.dirname, "..");
const FIXTURE_ROOT = join(APP_ROOT, "fixtures");
const BUDGET_BYTES = 2 * 1024 * 1024; // D29-11 revised budget (spec §5 acceptance G), NOT the ≤5MB in D29-11's own prose — see the module doc + the final report for the discrepancy.

// ---------------------------------------------------------------------------
// 1. required + supplemental RAW Foundry doc picks
// ---------------------------------------------------------------------------

/** Every pick is a real path under `packs/pf2e/` in the pinned `pf2e-8.3.0`
 * snapshot, hand-verified to exist. "required" picks exist to reproduce a
 * SPECIFIC identity/join proof point when the pipeline re-runs over just this
 * subset; "supplemental" picks exist only for enricher/CodexNode grammar
 * breadth (no join significance). */
interface FoundryPick {
  relPath: string;
  reason: string;
}

const REQUIRED_FOUNDRY_PICKS: readonly FoundryPick[] = [
  { relPath: "spells/spells/rank-1/heal.json", reason: "Heal legacy/remaster pair (Foundry side)" },
  {
    relPath: "spells/spells/rank-1/force-barrage.json",
    reason: "Magic Missile -> Force Barrage pairing",
  },
  {
    relPath: "pathfinder-monster-core/adamantine-dragon-adult.json",
    reason:
      "dragon qualifier-reorder normalization (base) + P1.6 statblock-bearing dragon (melee bonus/damageRolls/speeds — spec §9's 'red-dragon-adult or equivalent')",
  },
  {
    relPath: "pathfinder-monster-core/adamantine-dragon-adult-spellcaster.json",
    reason: "dragon 1:N spellcaster variantOf + P1.6 spellcastingEntry spelldc/tradition",
  },
  { relPath: "ancestries/anadi.json", reason: "journal-page merge target (Anadi)" },
  {
    relPath: "feats/ancestry/centaur/level-13/camouflage-coat.json",
    reason: "join-aliases.json alias-driven join",
  },
  {
    relPath: "crown-of-the-kobold-king-bestiary/grick.json",
    reason: "residual (non-pair) -2 collision — real duplicate-name creature",
  },
  {
    relPath: "boons-and-curses/desna-major-boon.json",
    reason:
      "D29-14 AoN-primary drop pass: Foundry-only category (boon) — must NOT survive into the emitted corpus",
  },
  {
    relPath: "abomination-vaults-bestiary/book-2-hands-of-the-devil/dune-candle.json",
    reason:
      "D29-17 carve-out: a genuine Foundry-only creature (no AoN counterpart at all) — must SURVIVE the drop pass",
  },
  {
    relPath: "hazards/gravehall-trap.json",
    reason:
      "D29-20 (P1.6): a COMPLEX hazard (isComplex + disable + routine + hardness/stealth) — HazardStats extraction proof; web-lurker-deadfall below stays the simple-hazard grammar pick",
  },
];

const SUPPLEMENTAL_FOUNDRY_PICKS: readonly FoundryPick[] = [
  { relPath: "actions/archetype/ascended-celestial/flyby-attack.json", reason: "action grammar" },
  { relPath: "conditions/slowed.json", reason: "condition grammar" },
  { relPath: "classes/witch.json", reason: "class grammar (rich HTML)" },
  { relPath: "heritages/poppet/stuffed-poppet.json", reason: "heritage grammar" },
  { relPath: "equipment/duskwood-violin-by-a-legend.json", reason: "equipment/treasure grammar" },
  { relPath: "backgrounds/seer-of-the-dead.json", reason: "background grammar" },
  { relPath: "deities/core-gods/abadar.json", reason: "deity grammar" },
  { relPath: "familiar-abilities/speech.json", reason: "familiar-ability grammar" },
  { relPath: "class-features/champions-reaction.json", reason: "class-feature grammar" },
  { relPath: "vehicles/sandsailer.json", reason: "vehicle grammar" },
  { relPath: "spells/spells/rank-3/fireball.json", reason: "nested-bracket @Damage grammar" },
  { relPath: "hazards/web-lurker-deadfall.json", reason: "hazard grammar" },
];

const ALL_FOUNDRY_PICKS: readonly FoundryPick[] = [
  ...REQUIRED_FOUNDRY_PICKS,
  ...SUPPLEMENTAL_FOUNDRY_PICKS,
];

/** pack directory (first path segment) -> registered {name,type} from the
 * REAL `system.pf2e.json`, looked up at runtime (below) — kept minimal here. */
const JOURNALS_PACK_DIR = "journals";

/** The 7 real journal basenames every transform run reads unconditionally
 * (`EXCLUDED_JOURNAL_BASENAMES` + `JOURNAL_TARGET_CATEGORY`, journals.ts) —
 * trimmed here to keep the fixture small: only the pages named in
 * `JOURNAL_KEPT_PAGES` carry real content (the Anadi journal-merge proof
 * point, plus — D29-21/P1.6 — the two real "Index" pages whose standalone
 * entities the old `index.json` category index used to CLOBBER; keeping them
 * lets the CI pipeline test prove the `_index.json` rescue end-to-end); every
 * other page is dropped (`pages: []`), which is a legal, well-formed
 * JournalEntry shape (an empty page list just means "nothing merges/
 * stands-alone from this journal" — `decideJournalPages`/
 * `assembleJournalPages` both handle it fine). */
const JOURNAL_BASENAMES: readonly string[] = [
  "ancestries",
  "archetypes",
  "classes",
  "domains",
  "gm-screen",
  "hero-point-deck",
  "remaster-changes",
];
/** journal basename -> the page names kept (with their real content). */
const JOURNAL_KEPT_PAGES: Readonly<Record<string, readonly string[]>> = {
  ancestries: ["Anadi", "Index"],
  archetypes: ["Index"],
};

// ---------------------------------------------------------------------------
// 2. required RAW AoN doc picks
// ---------------------------------------------------------------------------

interface AonPick {
  category: string;
  id: string;
  reason: string;
}

const REQUIRED_AON_PICKS: readonly AonPick[] = [
  { category: "spell", id: "spell-148", reason: "Heal legacy" },
  { category: "spell", id: "spell-1554", reason: "Heal remaster" },
  { category: "spell", id: "spell-180", reason: "Magic Missile (AoN-only legacy)" },
  { category: "spell", id: "spell-1536", reason: "Force Barrage (remaster pair target)" },
  {
    category: "creature",
    id: "creature-2933",
    reason: "Adult Adamantine Dragon (qualifier-reorder)",
  },
  { category: "creature", id: "creature-2182", reason: "Grick #1 (residual collision, joins)" },
  {
    category: "creature",
    id: "creature-2478",
    reason: "Grick #2 (residual collision, unjoined -2)",
  },
  { category: "ancestry", id: "ancestry-42", reason: "Anadi (journal-merge target, AoN side)" },
  { category: "feat", id: "feat-5337", reason: "Camoflage Coat (alias-join target)" },
];

// ---------------------------------------------------------------------------
// 3. join-aliases.json trim (only the entries this fixture can exercise)
// ---------------------------------------------------------------------------

const FIXTURE_ALIASES = {
  _description:
    "Trimmed for the CI fixture (D29-11) — a subset of the committed apps/codex/join-aliases.json covering exactly the one alias this fixture's raw docs can exercise (camouflage-coat). See the real file for the full hand-curated list.",
  aliases: [
    {
      foundryId: "feat/camouflage-coat",
      aonId: "feat-5337",
      note: "AoN 'Camoflage Coat' (missing u) vs Foundry 'Camouflage Coat' — level 13 on both sides, Howl of the Wild.",
    },
  ],
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message: string): never {
  console.error(`extract-fixture: ${message}`);
  process.exit(1);
}

/** D29-19 knock-on (P1.6, measured on the real post-S6 corpus): the corpus's
 * ONLY blockquote nodes — the 8 the P2 spec's §1 census counted — lived in
 * `paizo-pregens`/`kingmaker-bestiary` `character` docs (pregen flavor
 * quotes), all of which the npc-only import now excludes; the AoN grammar
 * maps nothing to blockquote either. The kind is therefore corpus-EXTINCT
 * and the "every kind >=1" matrix is unsatisfiable for it. Rather than
 * silently dropping the kind from the matrix, it's allowlisted here and the
 * extractor ASSERTS the extinction corpus-wide — if a future refresh
 * reintroduces a blockquote anywhere, that assertion fails and this list
 * must shrink (the fixture then covers it again automatically). P2's
 * renderer still unit-covers the kind with a synthetic node (its per-kind
 * tests never needed a corpus entity). */
const KNOWN_EXTINCT_KINDS: ReadonlySet<string> = new Set(["blockquote"]);

/** All `CodexNode.kind` values (D29-2's 18-member union — 7 block + 11
 * inline) — the coverage matrix this extractor asserts against. */
const ALL_NODE_KINDS: readonly string[] = [
  "paragraph",
  "heading",
  "list",
  "table",
  "blockquote",
  "divider",
  "aside",
  "text",
  "crossref",
  "brokenRef",
  "check",
  "damage",
  "inlineRoll",
  "inlineAction",
  "template",
  "embed",
  "actionGlyph",
  "localizedBoilerplate",
];

/** Recursively collects every `kind` present anywhere in a `CodexNode` tree
 * (block AND inline tiers, matching `join.ts`'s own generic walker shape). */
function collectKinds(node: CodexNode, into: Set<string>): void {
  into.add(node.kind);
  switch (node.kind) {
    case "paragraph":
    case "heading":
      for (const c of node.children) collectKinds(c, into);
      return;
    case "list":
      for (const item of node.items) for (const c of item) collectKinds(c, into);
      return;
    case "table":
      for (const row of node.rows)
        for (const cell of row.cells) for (const c of cell) collectKinds(c, into);
      if (node.caption) for (const c of node.caption) collectKinds(c, into);
      return;
    case "blockquote":
    case "aside":
      for (const c of node.children) collectKinds(c, into);
      return;
    case "localizedBoilerplate":
      for (const c of node.children) collectKinds(c, into);
      return;
    default:
      return; // divider + every other leaf inline kind
  }
}

function collectEntityKinds(entity: CodexEntity): Set<string> {
  const kinds = new Set<string>();
  for (const n of entity.body) collectKinds(n, kinds);
  if (entity.loreBody) for (const n of entity.loreBody) collectKinds(n, kinds);
  if (entity.embeddedItems) {
    for (const item of entity.embeddedItems) for (const n of item.body) collectKinds(n, kinds);
  }
  return kinds;
}

// ---------------------------------------------------------------------------
// part A: the raw-doc mini snapshot
// ---------------------------------------------------------------------------

interface RawSystemManifestEntry {
  name: string;
  path: string;
  type: string;
}

function packDirOf(relPath: string): string {
  const dir = relPath.split("/")[0];
  if (dir === undefined) throw new Error(`extract-fixture: malformed relPath "${relPath}"`);
  return dir;
}

const LOCALIZE_RE = /@Localize\[([^[\]]+)\]/g;

/** Every `system.description.value` / embedded-item description string in a
 * raw Foundry doc, scanned for text worth harvesting `@Localize` keys from. */
function foundryDocTexts(doc: unknown): string[] {
  const texts: string[] = [];
  function walk(d: unknown): void {
    if (d === null || typeof d !== "object") return;
    const rec = d as Record<string, unknown>;
    if (typeof rec.value === "string") texts.push(rec.value);
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) for (const item of v) walk(item);
      else if (v !== null && typeof v === "object") walk(v);
    }
  }
  walk(doc);
  return texts;
}

/** Transitive closure over `@Localize[...]` keys: harvests every key
 * referenced anywhere in `seedTexts`, then also scans each RESOLVED value for
 * further nested `@Localize` references (the real corpus has these — see
 * `foundryHtml.ts`'s Engulf-glossary finding) until no new keys appear.
 * Throws if a referenced key genuinely isn't in the real merged map (would
 * mean one of the hand-picked fixture docs references a key this extractor
 * doesn't know about — a bug in the pick list, not expected residue). */
function collectLocalizeKeys(
  seedTexts: readonly string[],
  fullMap: ReadonlyMap<string, string>,
): Map<string, string> {
  const needed = new Set<string>();
  const queue: string[] = [];
  function scan(text: string): void {
    for (const m of text.matchAll(LOCALIZE_RE)) {
      const key = (m[1] ?? "").trim();
      if (key.length > 0 && !needed.has(key)) {
        needed.add(key);
        queue.push(key);
      }
    }
  }
  for (const t of seedTexts) scan(t);
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    const value = fullMap.get(key);
    if (value !== undefined) scan(value);
  }
  const result = new Map<string, string>();
  for (const key of needed) {
    const value = fullMap.get(key);
    if (value === undefined) {
      fail(
        `@Localize key "${key}" (referenced by a fixture raw doc) is not in the real merged lang map`,
      );
    }
    result.set(key, value);
  }
  return result;
}

function buildRawFixture(
  cfg: ReturnType<typeof loadConfig>,
  foundryTag: string,
  aonSnapshotDate: string,
): number {
  const realFoundryRoot = join(cfg.codex.dataPath, "snapshots", "foundry", foundryTag);
  const realPacksRoot = join(realFoundryRoot, "packs", "pf2e");
  const realAonDir = join(cfg.codex.dataPath, "snapshots", "aon", aonSnapshotDate);

  const rawRoot = join(FIXTURE_ROOT, "raw");
  rmSync(rawRoot, { recursive: true, force: true });
  const fxFoundryRoot = join(rawRoot, "foundry");
  const fxPacksRoot = join(fxFoundryRoot, "packs", "pf2e");
  mkdirSync(fxPacksRoot, { recursive: true });

  // ---- real system.pf2e.json (for the pack registry lookups below) ----
  const realSystemManifest = readJson(join(realFoundryRoot, "system.pf2e.json")) as {
    packs: RawSystemManifestEntry[];
  };
  const packsByDir = new Map<string, RawSystemManifestEntry>();
  for (const p of realSystemManifest.packs) packsByDir.set(p.path.replace(/^packs\//, ""), p);

  // ---- copy each Foundry pick, tracking which packs got used ----
  const usedPackDirs = new Set<string>([JOURNALS_PACK_DIR]);
  const rawTexts: string[] = [];
  let rawBytes = 0;
  for (const pick of ALL_FOUNDRY_PICKS) {
    const src = join(realPacksRoot, pick.relPath);
    const doc = readJson(src);
    usedPackDirs.add(packDirOf(pick.relPath));
    rawTexts.push(...foundryDocTexts(doc));
    const destPath = join(fxPacksRoot, pick.relPath);
    mkdirSync(join(destPath, ".."), { recursive: true });
    const content = canonicalJson(doc);
    writeFileSync(destPath, content);
    rawBytes += Buffer.byteLength(content);
  }

  // ---- trimmed system.pf2e.json (only the packs actually present) ----
  const trimmedPacks: RawSystemManifestEntry[] = [];
  for (const dir of [...usedPackDirs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const entry = packsByDir.get(dir);
    if (!entry) fail(`no system.pf2e.json entry for pack dir "${dir}"`);
    trimmedPacks.push(entry);
  }
  const systemManifestContent = canonicalJson({ packs: trimmedPacks });
  writeFileSync(join(fxFoundryRoot, "system.pf2e.json"), systemManifestContent);
  rawBytes += Buffer.byteLength(systemManifestContent);

  // ---- the 7 journal files, trimmed (only Anadi carries real content) ----
  const journalsDestDir = join(fxPacksRoot, "journals");
  mkdirSync(journalsDestDir, { recursive: true });
  for (const basename of JOURNAL_BASENAMES) {
    const real = readJson(join(realPacksRoot, "journals", `${basename}.json`)) as {
      _id: string;
      name: string;
      pages: Array<{ _id: string; name: string; type?: string; text?: { content?: string } }>;
    };
    const keptNames = JOURNAL_KEPT_PAGES[basename] ?? [];
    const pages = real.pages.filter((p) => keptNames.includes(p.name));
    if (pages.length !== keptNames.length) {
      fail(
        `expected pages [${keptNames.join(", ")}] in the real "${basename}" journal, found ${pages.length} of ${keptNames.length}`,
      );
    }
    for (const p of pages) if (p.text?.content) rawTexts.push(p.text.content);
    const content = canonicalJson({ _id: real._id, name: real.name, pages });
    writeFileSync(join(journalsDestDir, `${basename}.json`), content);
    rawBytes += Buffer.byteLength(content);
  }

  // ---- static/lang/*.json — one real trimmed file (re-en.json, D29-5's
  // highest-precedence file) carrying exactly the @Localize keys this
  // fixture's raw docs (transitively) reference; the other 4 exist as empty
  // objects (loadLangMap in transform.ts reads all 5 names unconditionally). ----
  const realLangDir = join(realFoundryRoot, "static", "lang");
  const order = [
    "action-en.json",
    "kingmaker-en.json",
    "sf2e-overrides-en.json",
    "en.json",
    "re-en.json",
  ];
  const realLangFiles = order.map(
    (name) => readJson(join(realLangDir, name)) as Record<string, unknown>,
  );
  const fullMap = mergeLocalizeMaps(realLangFiles);
  const trimmedLocalize = collectLocalizeKeys(rawTexts, fullMap);

  const fxLangDir = join(fxFoundryRoot, "static", "lang");
  mkdirSync(fxLangDir, { recursive: true });
  for (const name of ["action-en.json", "kingmaker-en.json", "sf2e-overrides-en.json", "en.json"]) {
    const content = canonicalJson({});
    writeFileSync(join(fxLangDir, name), content);
    rawBytes += Buffer.byteLength(content);
  }
  const reEnContent = canonicalJson(Object.fromEntries(trimmedLocalize));
  writeFileSync(join(fxLangDir, "re-en.json"), reEnContent);
  rawBytes += Buffer.byteLength(reEnContent);
  console.log(`  static/lang: ${trimmedLocalize.size} @Localize key(s) trimmed in`);

  // ---- fixtures/raw/aon/<category>.json ----
  const fxAonDir = join(rawRoot, "aon");
  mkdirSync(fxAonDir, { recursive: true });
  const byCategory = new Map<string, AonPick[]>();
  for (const pick of REQUIRED_AON_PICKS) {
    const arr = byCategory.get(pick.category) ?? [];
    arr.push(pick);
    byCategory.set(pick.category, arr);
  }
  for (const [category, picks] of byCategory) {
    const realFile = readJson(join(realAonDir, `${category}.json`)) as {
      category: string;
      hits: Array<{ _id: string; _source: Record<string, unknown> }>;
    };
    const byId = new Map(realFile.hits.map((h) => [h._id, h] as const));
    const hits = picks.map((p) => {
      const hit = byId.get(p.id);
      if (!hit) fail(`AoN doc "${p.id}" (category "${category}") not found in the real snapshot`);
      return hit;
    });
    const content = canonicalJson({ category, hits });
    writeFileSync(join(fxAonDir, `${category}.json`), content);
    rawBytes += Buffer.byteLength(content);
  }

  // ---- trimmed join-aliases.json ----
  const aliasesContent = canonicalJson(FIXTURE_ALIASES);
  writeFileSync(join(FIXTURE_ROOT, "join-aliases.json"), aliasesContent);
  rawBytes += Buffer.byteLength(aliasesContent);

  return rawBytes;
}

// ---------------------------------------------------------------------------
// part B: canonical-form-only entity coverage (from the real emitted corpus)
// ---------------------------------------------------------------------------

interface CorpusEntityRef {
  category: string;
  file: string; // basename incl. .json
  path: string;
  size: number;
}

function listCorpusEntities(corpusRoot: string): CorpusEntityRef[] {
  const out: CorpusEntityRef[] = [];
  for (const category of readdirSync(corpusRoot).sort()) {
    const categoryDir = join(corpusRoot, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir).sort()) {
      if (file === "_index.json") continue; // the D29-21 per-category index, not an entity
      const path = join(categoryDir, file);
      out.push({ category, file, path, size: statSync(path).size });
    }
  }
  return out;
}

/** Required canonical-form picks by exact entity id — the D29-11 identity/
 * join proof points that must land in `fixtures/entities/` verbatim (these
 * are the OUTPUT of the real transform; the raw-doc subset above separately
 * proves the pipeline can REPRODUCE them from scratch). */
const REQUIRED_CANONICAL_IDS: readonly string[] = [
  "spell/heal",
  "spell/heal@legacy",
  "spell/magic-missile",
  "spell/force-barrage",
  "creature/adamantine-dragon-adult",
  "creature/adamantine-dragon-adult-spellcaster",
  "ancestry/anadi",
  "feat/camouflage-coat",
  "creature/grick",
  "creature/grick-2",
  // D29-17 carve-out proof point (S5c): a genuine Foundry-only creature that
  // survives the D29-14 drop pass BECAUSE creature is carved out — see the
  // coverage-matrix assertion below. NOTE `boon` is deliberately NOT listed
  // here anymore (S5c): the D29-14 drop pass removes the ENTIRE `boon`
  // category from the real emitted corpus, so there is no longer a `boon`
  // entity anywhere to select — `desna-major-boon.json` stays a RAW pick
  // (proves the pipeline drops it end-to-end, transform.test.ts) but has no
  // canonical-form counterpart to require here.
  "creature/dune-candle",
  // D29-21 (P1.6): the two real `index`-slug entities the old `index.json`
  // category index used to clobber — required verbatim so P2's route tests
  // can prove the rescue against the fixture corpus.
  "ancestry/index",
  "archetype/index",
  // D29-20 (P1.6): a statblock-bearing complex hazard (isComplex + disable +
  // routine + hardness/stealth in `stats`).
  "hazard/gravehall-trap",
  // P2 S1 (D29-25): the `class` category's own coverage pick
  // (`class/investigator@legacy`, chosen as the smallest-file representative)
  // carries 3 real `embed` nodes in its body, all targeting these 3 `action`
  // docs — required so the S1 class golden proves real depth-1 embed
  // inlining (not just a synthetic unit-test chain). None of the three
  // themselves embed anything further (verified against the real corpus), so
  // this fixture does NOT also exercise the M7 "second-layer renders as a
  // link" case on a real entity — that's covered by a dedicated synthetic
  // unit test instead (see nodes.test.tsx's cycle/depth-guard cases).
  "action/pursue-a-lead-2",
  "action/clue-in-2",
  "action/devise-a-stratagem@legacy",
  // P2 S2 (D29-22 adversarial): a non-ASCII real slug — proves the router's
  // `pathParamsAllowedCharacters`-free default already round-trips non-ASCII
  // path segments end to end (encode/decode), a genuine full creature
  // statblock (not a stub), verified against the real corpus.
  "creature/ixamè",
];

function buildCanonicalCoverage(corpusRoot: string, remainingBudget: number): number {
  const entitiesDestRoot = join(FIXTURE_ROOT, "entities");
  rmSync(entitiesDestRoot, { recursive: true, force: true });
  mkdirSync(entitiesDestRoot, { recursive: true });

  const all = listCorpusEntities(corpusRoot);
  const byId = new Map<string, CorpusEntityRef>();
  for (const ref of all) {
    const raw = readJson(ref.path) as { id: string };
    byId.set(raw.id, ref);
  }

  const selected = new Map<string, CorpusEntityRef>(); // id -> ref

  // required picks first
  for (const id of REQUIRED_CANONICAL_IDS) {
    const ref = byId.get(id);
    if (!ref) fail(`required canonical entity "${id}" not found in the real emitted corpus`);
    selected.set(id, ref);
  }

  // one representative per category — the SMALLEST file, to stay lean
  // (required picks above already claim their own category's slot when
  // applicable; every other category gets its own smallest entity).
  const byCategorySmallest = new Map<string, CorpusEntityRef>();
  for (const ref of all) {
    const current = byCategorySmallest.get(ref.category);
    if (!current || ref.size < current.size) byCategorySmallest.set(ref.category, ref);
  }
  const categoriesAlreadyCovered = new Set([...selected.values()].map((r) => r.category));
  for (const [category, ref] of byCategorySmallest) {
    if (categoriesAlreadyCovered.has(category)) continue;
    const raw = readJson(ref.path) as { id: string };
    selected.set(raw.id, ref);
  }

  // CodexNode kind coverage — scan what's selected so far, then greedily add
  // the smallest entity anywhere in the corpus containing each still-missing
  // kind (linear scan over the full corpus, sorted by size ascending so the
  // FIRST hit for a kind is also the cheapest one to add).
  function kindsCoveredBy(refs: Iterable<CorpusEntityRef>): Set<string> {
    const kinds = new Set<string>();
    for (const ref of refs) {
      const entity = CodexEntitySchema.parse(readJson(ref.path));
      for (const k of collectEntityKinds(entity)) kinds.add(k);
    }
    return kinds;
  }
  let covered = kindsCoveredBy(selected.values());
  let missingKinds = ALL_NODE_KINDS.filter((k) => !covered.has(k));
  /** Kinds that stayed missing AND are allowlisted as corpus-extinct AND whose
   * extinction the full-corpus scan below actually re-proved (no hit found) —
   * excused from the coverage matrix, per `KNOWN_EXTINCT_KINDS`'s doc comment. */
  const provenExtinctKinds = new Set<string>();
  if (missingKinds.length > 0) {
    const bySize = [...all].sort((a, b) => a.size - b.size);
    for (const kind of missingKinds) {
      // This `find` scans the ENTIRE corpus when there's no hit — so a miss
      // here IS the extinction proof for an allowlisted kind, and a HIT for
      // an allowlisted kind means the allowlist is stale (asserted below).
      const hit = bySize.find((ref) => {
        const entity = CodexEntitySchema.parse(readJson(ref.path));
        return collectEntityKinds(entity).has(kind);
      });
      if (hit) {
        const raw = readJson(hit.path) as { id: string };
        selected.set(raw.id, hit);
      } else if (KNOWN_EXTINCT_KINDS.has(kind)) {
        provenExtinctKinds.add(kind);
      }
    }
    covered = kindsCoveredBy(selected.values());
    missingKinds = ALL_NODE_KINDS.filter((k) => !covered.has(k) && !provenExtinctKinds.has(k));
  }

  // write the selected set, tracking budget as we go
  let bytesUsed = 0;
  const selectedByCategory = new Map<string, CodexEntity[]>();
  for (const [, ref] of selected) {
    const entity = CodexEntitySchema.parse(readJson(ref.path));
    const destDir = join(entitiesDestRoot, ref.category);
    mkdirSync(destDir, { recursive: true });
    const content = canonicalJson(entity);
    writeFileSync(join(destDir, ref.file), content);
    bytesUsed += Buffer.byteLength(content);
    const arr = selectedByCategory.get(ref.category) ?? [];
    arr.push(entity);
    selectedByCategory.set(ref.category, arr);
  }

  // D29-21 (P1.6): the fixture corpus mirrors the real one's read surface —
  // a fixture-scoped `_index.json` per category (IndexRows over exactly the
  // fixture-selected entities, sorted by id, same shape `emit.ts` writes) and
  // a fixture-scoped `manifest.json` (fixture categoryCounts) — so P2's
  // corpus reader / route tests / ssrSmoke run against `fixtures/entities/`
  // with zero `data/` reads.
  const fixtureCategoryCounts: Record<string, number> = {};
  for (const category of [...selectedByCategory.keys()].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const entities = selectedByCategory.get(category);
    if (!entities) continue; // unreachable — key came from the map itself
    fixtureCategoryCounts[category] = entities.length;
    const rows = [...entities]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => IndexRowSchema.parse(toIndexRow(e, facetKeysFor(category))));
    const content = canonicalJsonCompact(rows);
    writeFileSync(join(entitiesDestRoot, category, "_index.json"), content);
    bytesUsed += Buffer.byteLength(content);
  }
  const fixtureManifest = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    foundry: { tag: "fixture", docCount: 0, sha256: null, fetchedAt: null },
    aon: {
      snapshotDate: "fixture",
      docCount: 0,
      categoryCounts: {},
      sha256: null,
      fetchedAt: null,
    },
    categoryCounts: fixtureCategoryCounts,
    totalEntityCount: selected.size,
    totalSizeBytes: bytesUsed,
  };
  const fixtureManifestContent = canonicalJson(fixtureManifest);
  writeFileSync(join(entitiesDestRoot, "manifest.json"), fixtureManifestContent);
  bytesUsed += Buffer.byteLength(fixtureManifestContent);

  if (bytesUsed > remainingBudget) {
    fail(
      `canonical-form coverage set is ${bytesUsed} bytes, exceeding the remaining budget of ${remainingBudget} bytes (raw subset already used the rest of the ${BUDGET_BYTES}-byte total)`,
    );
  }

  // ---- assert the full coverage matrix ----
  const problems: string[] = [];
  const categoriesCovered = new Set([...selected.values()].map((r) => r.category));
  const allRealCategories = new Set(all.map((r) => r.category));
  for (const category of allRealCategories) {
    if (!categoriesCovered.has(category)) problems.push(`category "${category}" not covered`);
  }
  if (missingKinds.length > 0)
    problems.push(`CodexNode kind(s) never covered: ${missingKinds.join(", ")}`);
  // The extinction allowlist must stay exact BOTH ways: a listed kind that
  // shows up anywhere in the corpus again must come OFF the list (and the
  // fixture then covers it via the greedy pass automatically).
  for (const kind of KNOWN_EXTINCT_KINDS) {
    if (covered.has(kind)) {
      problems.push(
        `kind "${kind}" is allowlisted as corpus-extinct but the corpus carries it again — remove it from KNOWN_EXTINCT_KINDS`,
      );
    }
  }

  const selectedEntities = [...selected.values()].map((r) =>
    CodexEntitySchema.parse(readJson(r.path)),
  );
  const byIdSelected = new Map(selectedEntities.map((e) => [e.id, e] as const));

  function requireEntity(id: string, label: string): CodexEntity | undefined {
    const e = byIdSelected.get(id);
    if (!e) problems.push(`${label}: entity "${id}" missing from the selected set`);
    return e;
  }
  const heal = requireEntity("spell/heal", "legacy/remaster pair");
  const healLegacy = requireEntity("spell/heal@legacy", "legacy/remaster pair");
  if (heal && heal.legacyOf?.[0] !== "spell/heal@legacy")
    problems.push("spell/heal.legacyOf mismatch");
  if (healLegacy && healLegacy.remasteredAs?.[0] !== "spell/heal")
    problems.push("spell/heal@legacy.remasteredAs mismatch");

  const magicMissile = requireEntity("spell/magic-missile", "AoN-only legacy entity");
  if (magicMissile && !magicMissile.proseOnly)
    problems.push("spell/magic-missile should be proseOnly");

  const dragonBase = requireEntity("creature/adamantine-dragon-adult", "dragon qualifier-reorder");
  const dragonVariant = requireEntity(
    "creature/adamantine-dragon-adult-spellcaster",
    "dragon 1:N variant",
  );
  if (dragonVariant && dragonVariant.variantOf !== "creature/adamantine-dragon-adult") {
    problems.push("dragon spellcaster variantOf mismatch");
  }
  // D29-20 (P1.6): the statblock-bearing dragon must carry CreatureStats +
  // a melee strike with attackBonus/damage; the spellcaster variant must
  // carry a spellcastingEntry with dc/tradition.
  if (dragonBase) {
    if (dragonBase.stats?.kind !== "creature" || dragonBase.stats.speeds === undefined) {
      problems.push("creature/adamantine-dragon-adult should carry CreatureStats with speeds");
    }
    const jaws = dragonBase.embeddedItems?.find((i) => i.type === "melee" && i.name === "Jaws");
    if (!jaws || jaws.attackBonus === undefined || jaws.damage === undefined) {
      problems.push(
        "creature/adamantine-dragon-adult's Jaws strike should carry attackBonus + damage",
      );
    }
  }
  if (dragonVariant) {
    const sc = dragonVariant.embeddedItems?.find((i) => i.type === "spellcastingEntry");
    if (!sc || sc.dc === undefined || sc.tradition === undefined) {
      problems.push(
        "creature/adamantine-dragon-adult-spellcaster should carry a spellcastingEntry with dc + tradition",
      );
    }
  }
  const complexHazard = requireEntity("hazard/gravehall-trap", "P1.6 complex hazard");
  if (complexHazard) {
    const hs = complexHazard.stats?.kind === "hazard" ? complexHazard.stats : undefined;
    if (
      !hs ||
      hs.isComplex !== true ||
      hs.disable === undefined ||
      hs.routine === undefined ||
      hs.stealth === undefined
    ) {
      problems.push(
        "hazard/gravehall-trap should carry HazardStats with isComplex/disable/routine/stealth",
      );
    }
  }
  // D29-21 (P1.6): the two rescued `index`-slug entities.
  requireEntity("ancestry/index", "D29-21 index-slug rescue");
  requireEntity("archetype/index", "D29-21 index-slug rescue");

  const alias = requireEntity("feat/camouflage-coat", "alias-driven join");
  if (alias && alias.aonUrl === undefined)
    problems.push("feat/camouflage-coat should have an aonUrl (joined via alias)");

  const anadi = requireEntity("ancestry/anadi", "journal-merged entity");
  if (anadi && anadi.loreBody === undefined) problems.push("ancestry/anadi should have a loreBody");

  requireEntity("creature/grick", "-2 collision (winner)");
  requireEntity("creature/grick-2", "-2 collision (residual member)");

  // S5c/D29-14/-17: the AoN-primary drop pass already ran (this reads the
  // REAL post-drop emitted corpus) — so a Foundry-only-category entity like
  // the old `boon` pick can no longer exist ANYWHERE to select (the whole
  // category is gone). Assert that directly, and require the D29-17
  // carve-out proof point instead: a genuine Foundry-only CREATURE, which
  // the drop pass must have kept.
  for (const droppedCategory of ["boon", "pfs-boon", "kingdom-feature", "effect"]) {
    if (allRealCategories.has(droppedCategory)) {
      problems.push(
        `category "${droppedCategory}" should have been fully removed by the D29-14 drop pass but still has entities in the real corpus`,
      );
    }
  }
  const carveOut = requireEntity("creature/dune-candle", "D29-17 Foundry-only carve-out");
  if (carveOut && (carveOut.aonUrl !== undefined || carveOut.proseOnly === true)) {
    problems.push("creature/dune-candle should be Foundry-only (no aonUrl, not proseOnly)");
  }

  if (problems.length > 0) {
    fail(`coverage matrix FAILED:\n  - ${problems.join("\n  - ")}`);
  }

  console.log(`  categories covered: ${categoriesCovered.size}/${allRealCategories.size}`);
  const extinctNote =
    provenExtinctKinds.size > 0
      ? ` (corpus-extinct, proven by full scan: ${[...provenExtinctKinds].join(", ")})`
      : "";
  console.log(
    `  CodexNode kinds covered: ${ALL_NODE_KINDS.length - provenExtinctKinds.size}/${ALL_NODE_KINDS.length}${extinctNote}`,
  );
  console.log(`  entities selected: ${selected.size}`);

  return bytesUsed;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const cfg = loadConfig();
  const manifestPath = join(APP_ROOT, "corpus-manifest.json");
  const manifest = parseManifest(readJson(manifestPath));
  if (manifest.aon.snapshotDate === null) fail("no AoN snapshot recorded in corpus-manifest.json");
  const corpusRoot = join(cfg.codex.dataPath, "corpus");
  if (!statSync(corpusRoot, { throwIfNoEntry: false })) {
    fail(`no emitted corpus at ${corpusRoot} — run \`pnpm --filter @astra/codex transform\` first`);
  }

  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  mkdirSync(FIXTURE_ROOT, { recursive: true });

  console.log(
    "Building the raw-doc mini snapshot (parser-grammar + identity/join proof points)...",
  );
  const rawBytes = buildRawFixture(cfg, manifest.foundry.tag, manifest.aon.snapshotDate);
  console.log(`  raw subset: ${rawBytes} bytes`);

  console.log("\nSelecting canonical-form-only category/kind coverage from the real corpus...");
  const canonicalBytes = buildCanonicalCoverage(corpusRoot, BUDGET_BYTES - rawBytes);
  console.log(`  canonical subset: ${canonicalBytes} bytes`);

  const total = rawBytes + canonicalBytes;
  console.log(`\nTotal fixture size: ${total} bytes (budget ${BUDGET_BYTES} bytes)`);
  if (total > BUDGET_BYTES) fail(`fixture exceeds the ${BUDGET_BYTES}-byte budget`);
  console.log("extract-fixture: OK — coverage matrix satisfied, within budget.");
}

main();
