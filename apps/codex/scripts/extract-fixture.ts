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
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "@astra/config";

import { CORPUS_SCHEMA_VERSION, canonicalJson, canonicalJsonCompact } from "../src/ingest/emit";
import { mergeLocalizeMaps } from "../src/ingest/enrichers";
import { buildRulesTree } from "../src/ingest/rulesTree";
import { buildSourcesIndex } from "../src/ingest/sourcesIndexBuild";
import {
  CodexEntitySchema,
  IndexRowSchema,
  toIndexRow,
  type CodexEntity,
} from "../src/schema/entity";
import { facetKeysFor } from "../src/schema/facetKeys";
import { parseManifest } from "../src/schema/manifest";
import type { BlockNode, CodexNode } from "../src/schema/nodes";
import { RulesTreeFileSchema } from "../src/schema/rulesTree";
import { SourcesIndexFileSchema } from "../src/schema/sourcesIndex";
import { runTransform } from "./transform";

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
  /** P12 S1 (D29-120): when present, trims the copied class Item's
   * `system.items` granted-feature dict down to exactly these `name`
   * entries (verbatim otherwise — every OTHER field, incl. the D29-113
   * scalar-stats fields, is untouched). Used for the cleric "stub" pick — a
   * real class doc's full granted-feature manifest, trimmed so the fixture
   * exercises BOTH `augmentClassStats` outcomes deterministically: a
   * resolved grant (has a matching AoN class-feature pick below) and a
   * Foundry-only unjoined one (`first-doctrine.json` is copied as its own
   * RAW pick so uuid resolution succeeds structurally, but no AoN
   * counterpart exists — D29-14 drops it, reproducing the real
   * `targetId: null` case without needing the class's full real 16-item
   * manifest). */
  keepItemNames?: readonly string[];
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

/** P12 S1 (D29-113..116/D29-120): the `augmentClassStats` pass's own fixture
 * coverage — fighter (clean 16/16 grants: every raw grant resolves, no
 * nulls), cleric (a trimmed 2-item stub: "Doctrine" resolves, "First
 * Doctrine" stays Foundry-only-and-dropped, reproducing `targetId: null`),
 * plus the `class-features/` docs each class's grants + subclass-absorption
 * mechanism needs (see the matching `REQUIRED_AON_PICKS` entries below for
 * the AoN half of each join). `classes/witch.json` (already a
 * SUPPLEMENTAL pick above) needs no NEW class-doc pick — only its own two
 * absorbed-subclass `class-features/` docs, added here. */
const CLASS_STATS_FOUNDRY_PICKS: readonly FoundryPick[] = [
  {
    relPath: "classes/fighter.json",
    reason: "D29-113/-114: clean 16/16 granted-feature resolution",
  },
  {
    relPath: "classes/cleric.json",
    reason:
      "D29-114 stub case: system.items trimmed to Doctrine (resolves) + First Doctrine (stays Foundry-only-and-dropped -> targetId:null)",
    keepItemNames: ["Doctrine", "First Doctrine"],
  },
  // fighter's 16 granted class-features (each paired with an AoN
  // class-feature-* pick below, all under the real Fighter AoN url ID=35).
  { relPath: "class-features/reactive-strike.json", reason: "fighter grant (level 1)" },
  { relPath: "class-features/shield-block.json", reason: "fighter grant (level 1)" },
  { relPath: "class-features/bravery.json", reason: "fighter grant (level 3)" },
  { relPath: "class-features/fighter-weapon-mastery.json", reason: "fighter grant (level 5)" },
  { relPath: "class-features/battlefield-surveyor.json", reason: "fighter grant (level 7)" },
  { relPath: "class-features/weapon-specialization.json", reason: "fighter grant (level 7)" },
  { relPath: "class-features/battle-hardened.json", reason: "fighter grant (level 9)" },
  { relPath: "class-features/combat-flexibility.json", reason: "fighter grant (level 9)" },
  { relPath: "class-features/fighter-expertise.json", reason: "fighter grant (level 11)" },
  { relPath: "class-features/armor-expertise.json", reason: "fighter grant (level 11)" },
  { relPath: "class-features/weapon-legend.json", reason: "fighter grant (level 13)" },
  { relPath: "class-features/tempered-reflexes.json", reason: "fighter grant (level 15)" },
  { relPath: "class-features/improved-flexibility.json", reason: "fighter grant (level 15)" },
  {
    relPath: "class-features/greater-weapon-specialization.json",
    reason: "fighter grant (level 15)",
  },
  { relPath: "class-features/armor-mastery.json", reason: "fighter grant (level 17)" },
  { relPath: "class-features/versatile-legend.json", reason: "fighter grant (level 19)" },
  // cleric's "Doctrine" grant resolution + D29-115 doctrine subclass
  // absorption (Cloistered Cleric / Warpriest remaster halves merge into
  // class-feature/*, matching CATEGORY_EQUIVALENCE's real doctrine->
  // class-feature rule).
  { relPath: "class-features/doctrine.json", reason: "cleric's Doctrine grant resolves" },
  {
    relPath: "class-features/first-doctrine.json",
    reason: "raw pick only, deliberately NO matching AoN doc — D29-114 null-out proof",
  },
  {
    relPath: "class-features/cloistered-cleric.json",
    reason: "D29-115: absorbs doctrine-4 (remaster Cloistered Cleric) via CATEGORY_EQUIVALENCE",
  },
  {
    relPath: "class-features/warpriest.json",
    reason: "D29-115: absorbs doctrine-5 (remaster Warpriest) via CATEGORY_EQUIVALENCE",
  },
  // witch's D29-115 two-category (lesson/patron) absorbed-remaster targets —
  // "Lesson of the Elements"/"The Unseen Broker" deliberately have NO
  // class-features pick (they stay AoN-only intra-category pairs, matching
  // the real corpus).
  {
    relPath: "class-features/lesson-of-bargains.json",
    reason: "D29-115: absorbs lesson-34 (remaster Lesson of Bargains)",
  },
  {
    relPath: "class-features/baba-yaga.json",
    reason: "D29-115: absorbs patron-27 (remaster Baba Yaga)",
  },
];

const ALL_FOUNDRY_PICKS: readonly FoundryPick[] = [
  ...REQUIRED_FOUNDRY_PICKS,
  ...SUPPLEMENTAL_FOUNDRY_PICKS,
  ...CLASS_STATS_FOUNDRY_PICKS,
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
  {
    category: "condition",
    id: "condition-92",
    reason:
      "0030 S1 (D30-42, B3): Slowed (remaster) — the AoN join partner for the real conditions/slowed.json Foundry pick, so condition/slowed SURVIVES the AoN-primary drop pass and the homebrew UUID-resolution fixture proof (fixture-warding-glyph.json's @UUID[...conditionitems...Slowed]) resolves as a real crossref, not a post-drop brokenRef",
  },
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
  // P4 (D29-39/D29-44) — the rules-tree/sidebar-attach/sources-index fixture
  // composition (see the module doc's "part A" note).
  {
    category: "rules",
    id: "rules-994",
    reason: "P4: 'Chapter 2: Tools' — the depth-3 chain's breadcrumb-less root (GMG)",
  },
  {
    category: "rules",
    id: "rules-995",
    reason:
      "P4: 'Building Creatures' — depth-2 mid node, real CRLF-dirty breadcrumbs (['Chapter 2: Tools\\r\\n'])",
  },
  {
    category: "rules",
    id: "rules-1002",
    reason:
      "P4: 'Ability Modifiers' — depth-3 leaf, COMPLETE ancestor chain, both breadcrumb elements CRLF-dirty",
  },
  {
    category: "rules",
    id: "rules-3280",
    reason:
      "P4: Counteracting (remaster half, Player Core, Chapter 8/Afflictions) — the edition path-shift pair",
  },
  {
    category: "rules",
    id: "rules-371",
    reason:
      "P4: Counteracting (legacy half, Core Rulebook, Chapter 9/General Rules) — DIFFERENT path than its remaster pair",
  },
  {
    category: "rules",
    id: "rules-2001",
    reason: "P4: 'Tools of Play' — attached-sidebar host (rules category)",
  },
  { category: "sidebar", id: "sidebar-2121", reason: "P4: 'Dice' — attaches to rules-2001's url" },
  {
    category: "class",
    id: "class-16",
    reason: "P4: Witch (legacy) — the M8 shared-url host (/Classes.aspx?ID=16)",
  },
  {
    category: "class-feature",
    id: "class-feature-402",
    reason: "P4: 'Ability Boosts' — shares class-16's url, must NOT itself become a sidebar host",
  },
  {
    category: "sidebar",
    id: "sidebar-1046",
    reason: "P4: 'In Service to the Unknown' — attaches to the shared class-16 url (M8 case)",
  },
  { category: "source", id: "source-1", reason: "P4: 'Core Rulebook' — the D29-44 source entity" },
  // P11 S1 (D29-98/-99/-100) — fixture-level regression coverage for all
  // three P11 ingest mechanisms, currently ZERO at fixture level.
  {
    category: "action",
    id: "action-2910",
    reason: "D29-98 family (i): paren-leading nameless-activation debris '(arcane)' — dropped",
  },
  {
    category: "action",
    id: "action-4171",
    reason:
      "D29-99 name-template resolution: ACTION.TYPES glyph resolves to a name in NEITHER drop family (survives, renamed)",
  },
  {
    category: "action",
    id: "action-2461",
    reason:
      "D29-99/D29-98 overlap: TRAITS-glyph template resolves to '10 minutes (concentrate, manipulate)' — a family (ii) drop AFTER resolution",
  },
  {
    category: "domain",
    id: "domain-113",
    reason:
      "D29-100 adjacent-crossref dedupe: Naga domain's Deities masthead double-links Ravithra (legacy ID=218 + remaster ID=620 both repoint to deity/ravithra)",
  },
  {
    category: "deity",
    id: "deity-313",
    reason: "Nalinivati (remaster) — domain-113's Deities masthead target",
  },
  {
    category: "deity",
    id: "deity-218",
    reason: "Ravithra (legacy) — domain-113's duplicate masthead link, repoints to deity-620",
  },
  {
    category: "deity",
    id: "deity-620",
    reason: "Ravithra (remaster) — domain-113's duplicate masthead link target",
  },
  { category: "deity", id: "deity-601", reason: "Velgaas — domain-113's Deities masthead target" },
  { category: "deity", id: "deity-422", reason: "Vorasha — domain-113's Deities masthead target" },
  {
    category: "feat",
    id: "feat-2649",
    reason:
      "D29-101b leads-to exclusion: 'Fledgling Flight leads to...' heading + crossref paragraph",
  },
  {
    category: "feat",
    id: "feat-2653",
    reason: "Juvenile Flight — resolves feat-2649's 'leads to...' crossref target",
  },
  // P12 S1 (D29-113..116/D29-120) — the `augmentClassStats` fixture coverage.
  { category: "class", id: "class-35", reason: "Fighter (remaster) — clean 16/16 grants" },
  {
    category: "class",
    id: "class-33",
    reason: "Cleric (remaster) — D29-114 stub (Doctrine resolves, First Doctrine nulls)",
  },
  // fighter's 16 granted-feature AoN docs — all real Fighter-class-page
  // hits (url /Classes.aspx?ID=35), each name-exact-matching its
  // CLASS_STATS_FOUNDRY_PICKS class-features/*.json counterpart above.
  { category: "class-feature", id: "class-feature-691", reason: "Reactive Strike" },
  { category: "class-feature", id: "class-feature-693", reason: "Shield Block" },
  { category: "class-feature", id: "class-feature-695", reason: "Bravery" },
  { category: "class-feature", id: "class-feature-699", reason: "Fighter Weapon Mastery" },
  { category: "class-feature", id: "class-feature-700", reason: "Battlefield Surveyor" },
  { category: "class-feature", id: "class-feature-701", reason: "Weapon Specialization" },
  { category: "class-feature", id: "class-feature-702", reason: "Battle Hardened" },
  { category: "class-feature", id: "class-feature-703", reason: "Combat Flexibility" },
  { category: "class-feature", id: "class-feature-704", reason: "Armor Expertise" },
  { category: "class-feature", id: "class-feature-705", reason: "Fighter Expertise" },
  { category: "class-feature", id: "class-feature-706", reason: "Weapon Legend" },
  { category: "class-feature", id: "class-feature-707", reason: "Greater Weapon Specialization" },
  { category: "class-feature", id: "class-feature-708", reason: "Improved Flexibility" },
  { category: "class-feature", id: "class-feature-709", reason: "Tempered Reflexes" },
  { category: "class-feature", id: "class-feature-710", reason: "Armor Mastery" },
  { category: "class-feature", id: "class-feature-711", reason: "Versatile Legend" },
  {
    category: "class-feature",
    id: "class-feature-813",
    reason:
      "Doctrine (Cleric remaster page ID=33, matching the class-33 pick) — cleric's ONE resolved grant",
  },
  // cleric's doctrine subclass pair (D29-115: the 100%-superseded-category
  // shape — both legacy halves stay standalone `doctrine/*`, both remaster
  // halves absorb into `class-feature/*`).
  {
    category: "doctrine",
    id: "doctrine-2",
    reason: "Cloistered Cleric (legacy) — stays doctrine/cloistered-cleric",
  },
  {
    category: "doctrine",
    id: "doctrine-4",
    reason: "Cloistered Cleric (remaster) — absorbed into class-feature/cloistered-cleric",
  },
  {
    category: "doctrine",
    id: "doctrine-3",
    reason: "Warpriest (legacy) — stays doctrine/warpriest",
  },
  {
    category: "doctrine",
    id: "doctrine-5",
    reason: "Warpriest (remaster) — absorbed into class-feature/warpriest",
  },
  // witch's lesson/patron pair — D29-115's OTHER shape: an intra-category
  // legacy/remaster pair that is NOT absorbed (no Foundry class-features
  // doc exists for either "Lesson of the Elements" or "The Unseen Broker"),
  // alongside one absorbed pair per category (Lesson of Bargains / Baba
  // Yaga) — proving the union mechanism handles both shapes in the SAME
  // category simultaneously.
  {
    category: "lesson",
    id: "lesson-14",
    reason: "Lesson of Bargains (legacy) — stays lesson/lesson-of-bargains",
  },
  {
    category: "lesson",
    id: "lesson-34",
    reason: "Lesson of Bargains (remaster) — absorbed into class-feature/lesson-of-bargains",
  },
  {
    category: "lesson",
    id: "lesson-2",
    reason: "Lesson of the Elements (legacy) — intra-category pair, NOT absorbed",
  },
  {
    category: "lesson",
    id: "lesson-17",
    reason: "Lesson of the Elements (remaster) — intra-category pair target",
  },
  { category: "patron", id: "patron-9", reason: "Baba Yaga (legacy) — stays patron/baba-yaga" },
  {
    category: "patron",
    id: "patron-27",
    reason: "Baba Yaga (remaster) — absorbed into class-feature/baba-yaga",
  },
  {
    category: "patron",
    id: "patron-11",
    reason: "Pacts (legacy) — intra-category pair, renamed remaster target (NOT absorbed)",
  },
  {
    category: "patron",
    id: "patron-29",
    reason: "The Unseen Broker (remaster) — Pacts' intra-category pair target",
  },
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
// 4. the homebrew mini fixture (D30-47, 0030 S1)
// ---------------------------------------------------------------------------

interface HomebrewFixtureDoc {
  basename: string;
  doc: Record<string, unknown>;
}

/** Hand-authored synthetic docs — NOT copied from the real 175-doc
 * `apps/assay/homebrew/spells/` store, unlike every Foundry/AoN raw pick
 * above. The real store is versioned assay content, not a codex fetch
 * snapshot; hand-splicing IT into the fixture would be the exact P12
 * "hand-spliced fixtures get wiped by a canonical-coverage sweep" trap this
 * whole extractor exists to avoid. These docs ARE the canonical fixture
 * source — emitted by this script like everything else under
 * `fixtures/raw/`, never hand-edited afterward. Three, per D30-47: a plain
 * spell (no ritual, no `@UUID`), a `system.ritual` ritual (D30-43 reroute),
 * and a spell bearing a real `@UUID[Compendium.pf2e.conditionitems.Item.
 * Slowed]` ref — "Slowed" resolves because `conditions/slowed.json` is
 * already a `SUPPLEMENTAL_FOUNDRY_PICKS` entry above (same official
 * `UuidIndex` the real store's 70 ref-bearing docs resolve against). */
const HOMEBREW_FIXTURE_DOCS: readonly HomebrewFixtureDoc[] = [
  {
    basename: "fixture-cinder-bolt",
    doc: {
      _id: "hbfixture0000001",
      flags: { assay: { seededFrom: { repo: "fixture" } } },
      name: "Fixture Cinder Bolt",
      system: {
        description: {
          value:
            "<p>A 0030 S1 fixture spell (plain, no ritual, no @UUID refs) — synthetic content only.</p>",
        },
        level: { value: 1 },
        publication: { license: "OGL", remaster: true, title: "Liturgy of the Iridite Vol.2" },
        range: { value: "30 feet" },
        target: { value: "1 creature" },
        time: { value: "2" },
        traits: { rarity: "common", traditions: ["arcane"], value: ["attack", "fire"] },
      },
      type: "spell",
    },
  },
  {
    basename: "fixture-abyssal-forging",
    doc: {
      _id: "hbfixture0000002",
      flags: { assay: { seededFrom: { repo: "fixture" } } },
      name: "Fixture Abyssal Forging",
      system: {
        description: {
          value:
            "<p>A 0030 S1 fixture ritual — synthetic content only, exercises the D30-43 ritual reroute.</p>",
        },
        level: { value: 5 },
        publication: { license: "OGL", remaster: true, title: "Liturgy of the Iridite Vol.2" },
        range: { value: "touch" },
        ritual: {
          primary: { check: "Arcana (expert)" },
          secondary: { casters: 1, checks: "Crafting" },
        },
        target: { value: "1 object" },
        time: { value: "6 hours" },
        traits: { rarity: "uncommon", traditions: [], value: ["arcane"] },
      },
      type: "spell",
    },
  },
  {
    basename: "fixture-warding-glyph",
    doc: {
      _id: "hbfixture0000003",
      flags: { assay: { seededFrom: { repo: "fixture" } } },
      name: "Fixture Warding Glyph",
      system: {
        description: {
          value:
            "<p>A 0030 S1 fixture spell — on a failed save, the target becomes @UUID[Compendium.pf2e.conditionitems.Item.Slowed] for 1 round.</p>",
        },
        level: { value: 3 },
        publication: { license: "OGL", remaster: true, title: "Liturgy of the Iridite Vol.2" },
        range: { value: "60 feet" },
        target: { value: "1 creature" },
        time: { value: "2" },
        traits: { rarity: "common", traditions: ["divine", "occult"], value: ["mental"] },
      },
      type: "spell",
    },
  },
];

/** D30-47's negative-path collision fixture — deliberately basenamed
 * "fireball" so its homebrew id (`spell/fireball`) collides with the real
 * `spells/spells/rank-3/fireball.json` supplemental Foundry pick above.
 * Lives OUTSIDE `fixtures/raw/homebrew/` (a SEPARATE directory the default
 * pipeline test never points `TransformPaths.homebrewDir` at) so the normal
 * fixture transform run never sees it — only a dedicated test constructing
 * its own `TransformPaths` with `homebrewDir` pointed here asserts the
 * D30-43 collision guard throws. */
const HOMEBREW_COLLISION_FIXTURE_DOC: HomebrewFixtureDoc = {
  basename: "fireball",
  doc: {
    _id: "hbfixturecollide1",
    flags: { assay: { seededFrom: { repo: "fixture" } } },
    name: "Fixture Colliding Fireball",
    system: {
      description: {
        value:
          "<p>D30-43 negative-path fixture — this basename deliberately collides with the official spell/fireball id.</p>",
      },
      level: { value: 3 },
      publication: { license: "OGL", remaster: true, title: "Liturgy of the Iridite Vol.2" },
      range: { value: "30 feet" },
      target: { value: "1 creature" },
      time: { value: "2" },
      traits: { rarity: "common", traditions: ["arcane"], value: ["fire"] },
    },
    type: "spell",
  },
};

/** Writes `fixtures/raw/homebrew/` (3 docs, read by the default pipeline
 * test) and `fixtures/raw/homebrew-collision/` (1 doc, read only by the
 * dedicated negative-path collision test) — wholesale-wiped + rewritten,
 * same "committed fixture, never hand-edited" contract as `buildRawFixture`
 * above. */
function buildHomebrewFixture(): number {
  const homebrewDir = join(FIXTURE_ROOT, "raw", "homebrew");
  rmSync(homebrewDir, { recursive: true, force: true });
  mkdirSync(homebrewDir, { recursive: true });
  let bytes = 0;
  for (const { basename, doc } of HOMEBREW_FIXTURE_DOCS) {
    const content = canonicalJson(doc);
    writeFileSync(join(homebrewDir, `${basename}.json`), content);
    bytes += Buffer.byteLength(content);
  }

  const collisionDir = join(FIXTURE_ROOT, "raw", "homebrew-collision");
  rmSync(collisionDir, { recursive: true, force: true });
  mkdirSync(collisionDir, { recursive: true });
  const collisionContent = canonicalJson(HOMEBREW_COLLISION_FIXTURE_DOC.doc);
  writeFileSync(
    join(collisionDir, `${HOMEBREW_COLLISION_FIXTURE_DOC.basename}.json`),
    collisionContent,
  );
  bytes += Buffer.byteLength(collisionContent);

  return bytes;
}

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

/** All `CodexNode.kind` values (P10, D29-93/94: 19-member union — 8 block + 11
 * inline) — the coverage matrix this extractor asserts against. */
const ALL_NODE_KINDS: readonly string[] = [
  "paragraph",
  "heading",
  "list",
  "table",
  "blockquote",
  "divider",
  "aside",
  "statRow",
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
    case "statRow":
      // P10 (D29-94): cells are InlineNode[][] — recurse the same as any
      // other cell-shaped field (table's own case above).
      for (const cell of node.cells) for (const c of cell) collectKinds(c, into);
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

interface ClassDocWithItems {
  system?: { items?: Record<string, { name?: string }> };
}

/** P12 S1 (D29-120): trims a copied class Item's `system.items` dict down to
 * exactly the entries named in `keepNames` (`FoundryPick.keepItemNames`'s
 * own doc comment) — every other field on the doc (incl. the D29-113 scalar
 * stats the class doc's own `system.*` carries) passes through verbatim. */
function trimClassItems(doc: unknown, keepNames: readonly string[], relPath: string): unknown {
  const typed = doc as ClassDocWithItems;
  const rawItems = typed.system?.items;
  if (!rawItems) fail(`keepItemNames trim requested for "${relPath}" but it has no system.items`);
  const keep = new Set(keepNames);
  const trimmedItems: Record<string, { name?: string }> = {};
  for (const [key, item] of Object.entries(rawItems)) {
    if (item.name !== undefined && keep.has(item.name)) trimmedItems[key] = item;
  }
  if (Object.keys(trimmedItems).length !== keepNames.length) {
    fail(
      `keepItemNames trim for "${relPath}" expected ${keepNames.length} matches (${keepNames.join(", ")}), found ${Object.keys(trimmedItems).length}`,
    );
  }
  return {
    ...(doc as Record<string, unknown>),
    system: { ...(typed.system as Record<string, unknown>), items: trimmedItems },
  };
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
    const doc =
      pick.keepItemNames !== undefined
        ? trimClassItems(readJson(src), pick.keepItemNames, pick.relPath)
        : readJson(src);
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
  "class/investigator@legacy",
  // P2 S1 golden (`rules-nature-crafting.html`) — a real rules-body render
  // fixture predating P4; the "rules" category's smallest-file auto-pick
  // used to satisfy this, before P4's own required rules picks (below)
  // claimed that category's coverage slot.
  "rules/nature-crafting-3",
  "action/pursue-a-lead-2",
  "action/clue-in-2",
  "action/devise-a-stratagem@legacy",
  // P2 S2 (D29-22 adversarial): a non-ASCII real slug — proves the router's
  // `pathParamsAllowedCharacters`-free default already round-trips non-ASCII
  // path segments end to end (encode/decode), a genuine full creature
  // statblock (not a stub), verified against the real corpus.
  "creature/ixamè",
  // P4 (D29-39/D29-44) — real ids, verified against the live corpus by
  // `aonUrl` (not guessed by slug: many same-named rules docs across 45
  // books collide and push a pick onto a `-N`/`@legacy` suffix, e.g. this
  // "Ability Modifiers" is `ability-modifiers-2`, not the bare slug).
  "rules/chapter-2-tools", // depth-3 chain root, breadcrumb-less
  "rules/building-creatures@legacy", // depth-3 chain mid (CRLF-dirty source, D29-39 heals it)
  "rules/ability-modifiers-2", // depth-3 chain leaf — COMPLETE ancestor chain present
  "rules/counteracting-2", // Counteracting remaster half (Player Core, Ch8/Afflictions)
  "rules/counteracting-4", // Counteracting legacy half (Core Rulebook, Ch9/General Rules) — DIFFERENT path
  "rules/tools-of-play", // attached-sidebar host (rules category)
  "sidebar/dice", // attaches to rules/tools-of-play
  "class/witch@legacy", // the M8 shared-url host (/Classes.aspx?ID=16)
  "class-feature/ability-boosts-15", // shares the SAME url — must NOT be a sidebar host
  "sidebar/in-service-to-the-unknown", // attaches to class/witch@legacy (M8 case)
  "source/core-rulebook", // the D29-44 source entity
  // P6 (D29-65, Track B glyph gate + Integration's real-specimen check): the
  // fixture corpus had ZERO free-action entities before this — the smallest
  // real `facets.actionCost === "free"` feat.
  "feat/spellshape-channel",
  // P6 (D29-59, R4 ritual re-categorization) — the widened selection list the
  // spec's own §4 Track A gate requires, so downstream tracks' deferred
  // real-specimen proofs have material: the commune many-to-one pair (a
  // single mover, `ritual/commune`, whose `legacyOf` lists BOTH legacy
  // halves — the exact-slug collider `ritual/commune@legacy` AND the
  // fresh-slug `ritual/commune-with-nature`), the shadow-double/simulacrum
  // fresh-slug pair, and (implementation-time addition, D29-59's own
  // correction note — the real 143-mover population is 87/143 pairing-less,
  // not the rare case the spec first assumed) a pairing-less mover with
  // neither `legacyOf` nor `remasteredAs` at all.
  "ritual/commune",
  "ritual/commune@legacy",
  "ritual/commune-with-nature",
  "ritual/shadow-double",
  "ritual/simulacrum",
  "ritual/unbearable-cacophony",
  // P7 (D29-72, review M3): a JOINED vehicle carrying both a non-empty body
  // AND non-empty embeddedItems (16 body blocks + 4 action items, verified
  // against the real corpus) — the category-smallest vehicle auto-pick has
  // zero embeddedItems, so the S2 vehicle item-section-suppression test
  // can't run hermetically without this.
  "vehicle/armored-sleigh",
  // P11 S1 (D29-101b): a real "leads to..." prerequisite-chain heading +
  // crossref paragraph — `build-search.test.ts`'s end-to-end proof that the
  // excluded excerpt text never lands in the search index. (`class-feature/
  // ability-boosts-15`, already required above, already covers D29-101a's
  // `meta.class` mechanism — it carries a real `Class` mastheadExtra entry.)
  "feat/fledgling-flight",
];

/**
 * P12 S1 (D29-113..116/D29-120): ids that must be sourced from the FIXTURE'S
 * OWN trimmed pipeline rerun (`buildFixturePipelineCorpus` below), never the
 * real emitted corpus. `class/fighter`/`class/cleric`/`class/witch` and
 * everything their `stats.grantedFeatures`/`subclassOptions` reference are
 * shaped by exactly the curated raw-pick subset in `CLASS_STATS_FOUNDRY_PICKS`/
 * the matching `REQUIRED_AON_PICKS` entries above (fighter clean 16/16
 * grants, cleric's 2-item stub with the First Doctrine `targetId:null`
 * case, witch's curated lesson/patron pair-set) — the REAL corpus's
 * same-named entities carry the FULL real (much larger — e.g. witch's real
 * 44-row subclassOptions) population instead, which is a different corpus
 * entirely from what this fixture's own raw picks reproduce
 * (`transform.test.ts`'s whole point). Verified exhaustively against a
 * throwaway rerun before being pinned here — see the D29-120 build record.
 */
const FIXTURE_PIPELINE_REQUIRED_IDS: readonly string[] = [
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
  // cleric's ONE resolved grant ("First Doctrine" nulls — no target to
  // require) + the doctrine subclass pair (both shapes: legacy husks stay
  // standalone `doctrine/*`, remaster halves absorb into `class-feature/*`).
  "class-feature/doctrine",
  "class-feature/cloistered-cleric",
  "class-feature/warpriest",
  "doctrine/cloistered-cleric",
  "doctrine/warpriest",
  // witch's lesson/patron pair-set (each category: one absorbed pair, one
  // intra-category legacy/remaster pair that stays unabsorbed).
  "class-feature/lesson-of-bargains",
  "lesson/lesson-of-the-elements",
  "lesson/lesson-of-the-elements@legacy",
  "lesson/lesson-of-bargains",
  "class-feature/baba-yaga",
  "patron/the-unseen-broker",
  "patron/baba-yaga",
  "patron/pacts",
];
const FIXTURE_PIPELINE_REQUIRED_ID_SET = new Set(FIXTURE_PIPELINE_REQUIRED_IDS);

/** A short stand-in paragraph, replacing `body`/`loreBody` when writing a
 * FIXTURE_PIPELINE_REQUIRED_IDS entity (below) — real class-page/
 * class-feature prose runs into the hundreds of KB (3 full class bodies
 * alone blew the D29-11 2MB budget), and this fixture's whole point is the
 * `stats`/`facets`/id shape, not prose depth (the same trade-off the
 * `ritual/virt-*` synthetic fixtures already make). Zod-valid, schema-shape
 * unaffected. */
function trimmedBodyPlaceholder(id: string): BlockNode[] {
  return [
    {
      kind: "paragraph",
      children: [
        {
          kind: "text",
          content: `P12 S1 (D29-113..120) fixture stub — "${id}"'s real prose is trimmed to stay inside the fixture byte budget; only its stats/facets/id shape is exercised.`,
          marks: { bold: false, italic: false, superscript: false },
        },
      ],
    },
  ];
}

/**
 * Runs the fixture's OWN raw picks (`fixtures/raw/`, already written to disk
 * by `buildRawFixture`) through the REAL `runTransform` — the exact same
 * code path `transform.test.ts`'s `runOnce()` uses — to a throwaway temp
 * dir, so `FIXTURE_PIPELINE_REQUIRED_IDS` above can be sourced from THIS
 * run's output rather than the real emitted corpus (see that const's own
 * doc comment for why). Hard-fails on any hard failure (this raw subset is
 * already proven clean by the CI-hermetic pipeline test; a failure here
 * means the two have drifted out of sync).
 */
function buildFixturePipelineCorpus(): string {
  const outDir = mkdtempSync(join(tmpdir(), "codex-fixture-pipeline-"));
  const result = runTransform({
    foundrySnapshotDir: join(FIXTURE_ROOT, "raw", "foundry"),
    aonSnapshotDir: join(FIXTURE_ROOT, "raw", "aon"),
    homebrewDir: join(FIXTURE_ROOT, "raw", "homebrew"),
    corpusRoot: outDir,
    aliasesFile: FIXTURE_ALIASES,
    pins: {
      foundry: { tag: "fixture", docCount: 0, sha256: null, fetchedAt: null },
      aon: {
        snapshotDate: "fixture",
        docCount: 0,
        categoryCounts: {},
        sha256: null,
        fetchedAt: null,
      },
    },
  });
  if (result.hardFailures.length > 0) {
    fail(
      `the fixture's own raw picks hard-failed when re-run through runTransform: ${result.hardFailures.map((f) => `${f.path}: ${f.message}`).join("; ")}`,
    );
  }
  return outDir;
}

function buildCanonicalCoverage(
  corpusRoot: string,
  fixturePipelineCorpusRoot: string,
  remainingBudget: number,
): number {
  const entitiesDestRoot = join(FIXTURE_ROOT, "entities");
  rmSync(entitiesDestRoot, { recursive: true, force: true });
  mkdirSync(entitiesDestRoot, { recursive: true });

  const all = listCorpusEntities(corpusRoot);
  const byId = new Map<string, CorpusEntityRef>();
  for (const ref of all) {
    const raw = readJson(ref.path) as { id: string };
    byId.set(raw.id, ref);
  }

  // P12 S1: the SEPARATE fixture-pipeline source (`FIXTURE_PIPELINE_REQUIRED_IDS`'
  // own doc comment) — kept as its own map, never merged into `all`/`byId`
  // above, so the category-smallest sweep and the CodexNode kind-coverage
  // scan below stay scoped to the real corpus exactly as before.
  const fixturePipelineRefs = listCorpusEntities(fixturePipelineCorpusRoot);
  const byIdFixturePipeline = new Map<string, CorpusEntityRef>();
  for (const ref of fixturePipelineRefs) {
    const raw = readJson(ref.path) as { id: string };
    byIdFixturePipeline.set(raw.id, ref);
  }

  const selected = new Map<string, CorpusEntityRef>(); // id -> ref

  // required picks first
  for (const id of REQUIRED_CANONICAL_IDS) {
    const ref = byId.get(id);
    if (!ref) fail(`required canonical entity "${id}" not found in the real emitted corpus`);
    selected.set(id, ref);
  }
  for (const id of FIXTURE_PIPELINE_REQUIRED_IDS) {
    const ref = byIdFixturePipeline.get(id);
    if (!ref) {
      fail(
        `required fixture-pipeline canonical entity "${id}" not found in the fixture's own trimmed pipeline rerun`,
      );
    }
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
  //
  // `readSelectedEntity` (not a bare `readJson`) — a FIXTURE_PIPELINE_
  // REQUIRED_IDS entity's body gets trimmed (byte-budget, see
  // `trimmedBodyPlaceholder`'s doc comment) at EVERY read site, including
  // this kind-coverage scan, so the coverage matrix never credits a
  // CodexNode kind that the trim then removes from the actually-written file.
  function readSelectedEntity(ref: CorpusEntityRef): CodexEntity {
    const entity = CodexEntitySchema.parse(readJson(ref.path));
    if (!FIXTURE_PIPELINE_REQUIRED_ID_SET.has(entity.id)) return entity;
    return { ...entity, body: trimmedBodyPlaceholder(entity.id) };
  }

  function kindsCoveredBy(refs: Iterable<CorpusEntityRef>): Set<string> {
    const kinds = new Set<string>();
    for (const ref of refs) {
      for (const k of collectEntityKinds(readSelectedEntity(ref))) kinds.add(k);
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
    const entity = readSelectedEntity(ref);
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

  // P4 (D29-39/D29-44): regenerate `rules-tree.json`/`sources-index.json`
  // INTO the fixture, built from exactly the selected canonical entities —
  // so CI route/ssrSmoke tests exercise real shapes hermetically. Degenerate
  // vs. the real transform in one respect: no raw AoN aonId/next-link side
  // channel survives into `fixtures/entities/` (only canonical CodexEntity
  // JSON does), so sibling ordering here falls back to alphabetical (never
  // asserted chain-order-correct by this fixture — that's `rulesTree.test.ts`'s
  // job, over hand-crafted fixtures with real chain data). Entity `id` doubles
  // as a stand-in `aonId` (both unique/deterministic — tie-breaks stay stable).
  const allSelectedEntities = [...selectedByCategory.values()].flat();
  const rulesDocs = allSelectedEntities
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
  const bookSourceLicense = new Map<string, CodexEntity["source"]["license"]>();
  const sourceEntityRefByBook = new Map<string, string>();
  for (const e of allSelectedEntities) {
    if (e.category !== "source") continue;
    bookSourceLicense.set(e.source.book, e.source.license);
    sourceEntityRefByBook.set(e.source.book, e.id);
  }
  const noopReport = (): void => {};
  const { file: fixtureRulesTree } = buildRulesTree(rulesDocs, bookSourceLicense, noopReport);
  const rulesTreeContent = canonicalJson(RulesTreeFileSchema.parse(fixtureRulesTree));
  writeFileSync(join(entitiesDestRoot, "rules-tree.json"), rulesTreeContent);
  bytesUsed += Buffer.byteLength(rulesTreeContent);

  const { file: fixtureSourcesIndex } = buildSourcesIndex({
    finalEntities: allSelectedEntities,
    aonCitations: [],
    bookNameMap: new Map(),
    bookSourceLicense,
    sourceEntityRefByBook,
  });
  const sourcesIndexContent = canonicalJson(SourcesIndexFileSchema.parse(fixtureSourcesIndex));
  writeFileSync(join(entitiesDestRoot, "sources-index.json"), sourcesIndexContent);
  bytesUsed += Buffer.byteLength(sourcesIndexContent);

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

  const selectedEntities = [...selected.values()].map(readSelectedEntity);
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

  // P4 (D29-39/D29-44): the rules-tree/sidebar-attach coverage proof points.
  const root = requireEntity("rules/chapter-2-tools", "P4 depth-3 chain root");
  if (root && (root.breadcrumbs?.length ?? 0) > 0) {
    problems.push("rules/chapter-2-tools should be breadcrumb-less (a tree root)");
  }
  const mid = requireEntity("rules/building-creatures@legacy", "P4 depth-3 chain mid");
  if (mid && mid.breadcrumbs?.[0] !== "Chapter 2: Tools") {
    problems.push(
      `rules/building-creatures@legacy.breadcrumbs should be CRLF-healed to ["Chapter 2: Tools"], got ${JSON.stringify(mid.breadcrumbs)}`,
    );
  }
  const leaf = requireEntity("rules/ability-modifiers-2", "P4 depth-3 chain leaf");
  if (leaf && (leaf.breadcrumbs?.length ?? 0) !== 2) {
    problems.push("rules/ability-modifiers-2 should carry a 2-element (depth-3) breadcrumb chain");
  }
  const counterRemaster = requireEntity("rules/counteracting-2", "P4 edition path-shift pair");
  const counterLegacy = requireEntity("rules/counteracting-4", "P4 edition path-shift pair");
  if (
    counterRemaster &&
    counterLegacy &&
    JSON.stringify(counterRemaster.breadcrumbs) === JSON.stringify(counterLegacy.breadcrumbs)
  ) {
    problems.push("the Counteracting pair should carry DIFFERENT breadcrumb paths (D29-39)");
  }
  const rulesHost = requireEntity("rules/tools-of-play", "P4 attached-sidebar rules host");
  if (rulesHost && !rulesHost.attachedSidebars?.includes("sidebar/dice")) {
    problems.push("rules/tools-of-play should have attachedSidebars including sidebar/dice");
  }
  requireEntity("sidebar/dice", "P4 attached-sidebar rules host");
  const classHost = requireEntity("class/witch@legacy", "P4 M8 shared-url host");
  if (classHost && !classHost.attachedSidebars?.includes("sidebar/in-service-to-the-unknown")) {
    problems.push(
      "class/witch@legacy should have attachedSidebars including sidebar/in-service-to-the-unknown",
    );
  }
  const sharedUrlFeature = requireEntity(
    "class-feature/ability-boosts-15",
    "P4 M8 shared-url non-host",
  );
  if (sharedUrlFeature && sharedUrlFeature.attachedSidebars !== undefined) {
    problems.push(
      "class-feature/ability-boosts-15 shares its url with class/witch@legacy and must NOT itself be a sidebar host",
    );
  }
  requireEntity("sidebar/in-service-to-the-unknown", "P4 M8 shared-url case");
  requireEntity("source/core-rulebook", "P4 source entity");

  // P12 S1 (D29-113..116/D29-120): the augmentClassStats fixture coverage —
  // sourced from FIXTURE_PIPELINE_REQUIRED_IDS (the fixture's OWN trimmed
  // pipeline rerun), not the real corpus.
  const fighterClass = requireEntity("class/fighter", "P12 clean 16/16 grants");
  if (fighterClass) {
    if (fighterClass.stats?.kind !== "class") {
      problems.push("class/fighter should carry ClassStats (stats.kind === 'class')");
    } else {
      const grants = fighterClass.stats.grantedFeatures ?? [];
      if (grants.length !== 16 || grants.some((g) => g.targetId === null)) {
        problems.push(
          `class/fighter should carry 16 grantedFeatures, ALL resolved (clean 16/16) — got ${grants.length}, ${grants.filter((g) => g.targetId === null).length} null`,
        );
      }
    }
  }
  const clericClass = requireEntity("class/cleric", "P12 stub case (targetId:null proof)");
  if (clericClass) {
    if (clericClass.stats?.kind !== "class") {
      problems.push("class/cleric should carry ClassStats (stats.kind === 'class')");
    } else {
      const grants = clericClass.stats.grantedFeatures ?? [];
      const doctrine = grants.find((g) => g.name === "Doctrine");
      const firstDoctrine = grants.find((g) => g.name === "First Doctrine");
      if (doctrine?.targetId !== "class-feature/doctrine") {
        problems.push('class/cleric "Doctrine" grant should resolve to class-feature/doctrine');
      }
      if (firstDoctrine?.targetId !== null) {
        problems.push(
          'class/cleric "First Doctrine" grant should be targetId:null (D29-14 unjoined-residue drop)',
        );
      }
      const subclass = clericClass.stats.subclassOptions ?? [];
      if (subclass.length !== 4 || subclass.filter((o) => o.superseded).length !== 2) {
        problems.push(
          `class/cleric should carry 4 doctrine subclassOptions (2 current + 2 legacy) — got ${subclass.length}`,
        );
      }
    }
  }
  const witchClass = requireEntity("class/witch", "P12 two-category subclass pills");
  if (witchClass) {
    if (witchClass.stats?.kind !== "class") {
      problems.push("class/witch should carry ClassStats (stats.kind === 'class')");
    } else {
      const categories = new Set((witchClass.stats.subclassOptions ?? []).map((o) => o.category));
      if (!categories.has("lesson") || !categories.has("patron")) {
        problems.push("class/witch should carry BOTH lesson and patron subclassOptions categories");
      }
    }
  }
  requireEntity("class-feature/doctrine", "P12 cleric's resolved grant target");
  requireEntity("class-feature/cloistered-cleric", "P12 doctrine absorbed-remaster target");
  requireEntity("class-feature/warpriest", "P12 doctrine absorbed-remaster target");
  requireEntity("doctrine/cloistered-cleric", "P12 doctrine legacy husk");
  requireEntity("doctrine/warpriest", "P12 doctrine legacy husk");
  requireEntity("class-feature/lesson-of-bargains", "P12 lesson absorbed-remaster target");
  requireEntity("lesson/lesson-of-the-elements", "P12 lesson intra-category current");
  requireEntity("lesson/lesson-of-the-elements@legacy", "P12 lesson intra-category legacy");
  requireEntity("lesson/lesson-of-bargains", "P12 lesson legacy husk");
  requireEntity("class-feature/baba-yaga", "P12 patron absorbed-remaster target");
  requireEntity("patron/the-unseen-broker", "P12 patron intra-category current");
  requireEntity("patron/baba-yaga", "P12 patron legacy husk");
  requireEntity("patron/pacts", "P12 patron intra-category legacy");

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

  console.log("\nBuilding the homebrew mini fixture (D30-47, 0030 S1)...");
  const homebrewBytes = buildHomebrewFixture();
  console.log(`  homebrew subset: ${homebrewBytes} bytes`);

  console.log(
    "\nRunning the fixture's own trimmed pipeline (P12 S1 class-stats coverage source)...",
  );
  const fixturePipelineCorpusRoot = buildFixturePipelineCorpus();

  console.log("\nSelecting canonical-form-only category/kind coverage from the real corpus...");
  const canonicalBytes = buildCanonicalCoverage(
    corpusRoot,
    fixturePipelineCorpusRoot,
    BUDGET_BYTES - rawBytes - homebrewBytes,
  );
  console.log(`  canonical subset: ${canonicalBytes} bytes`);
  rmSync(fixturePipelineCorpusRoot, { recursive: true, force: true });

  const total = rawBytes + homebrewBytes + canonicalBytes;
  console.log(`\nTotal fixture size: ${total} bytes (budget ${BUDGET_BYTES} bytes)`);
  if (total > BUDGET_BYTES) fail(`fixture exceeds the ${BUDGET_BYTES}-byte budget`);
  console.log("extract-fixture: OK — coverage matrix satisfied, within budget.");
}

main();
