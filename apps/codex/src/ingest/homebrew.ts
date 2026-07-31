import { readFileSync } from "node:fs";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode, InlineNode, StatRowNode } from "../schema/nodes";
import { EnricherGrammarError, type EnricherContext } from "./enrichers";
import { assembleFoundryEntity, type RawFoundryDoc } from "./foundryEntities";
import { FoundryHtmlError, parseFoundryHtml } from "./foundryHtml";
import { walkFiles } from "./fsWalk";
import { sluggify } from "./sluggify";
import { createResolveUuid, type UuidIndex } from "./uuidResolve";

/**
 * D30-42/-43 (0030 S1): the homebrew loader — walks the committed
 * `apps/assay/homebrew/spells/*.json` store (the canonical 175-doc "Liturgy
 * of the Iridite Vol.2" set) and assembles it through the SAME
 * `assembleFoundryEntity` the official Foundry side uses (no parallel
 * assembly logic) — the store's own shape (`{name,_id,flags,type:"spell",
 * system}`) is structurally a plain Foundry Item pack doc, just one
 * directory flatter than a real pack (`walkFiles` handles either).
 *
 * Runs AFTER `loadFoundrySide` (`transform.ts`'s own orchestration) — its
 * ctx is built from the OFFICIAL `UuidIndex` (mirroring `transform.ts`'s
 * private `makeCtx(foundry.index, new Map(), report)` verbatim, duplicated
 * locally below rather than imported, which would create a circular import
 * — `transform.ts` calls `loadHomebrewSide`) so the store's
 * `@UUID[Compendium.pf2e.conditionitems.Item.<Condition>]` refs (70/175 on
 * the real store) resolve against real official condition entities; an
 * empty localize map is fine (the store carries zero `@Localize`/`@Damage`/
 * `@Check` enrichers, scoping-doc-verified).
 *
 * Identity (D30-42): the store file BASENAME is the slug —
 * `assembleFoundryEntity` already does exactly this (`basename` wins over
 * `sluggify(doc.name)`, `slugMismatch` report-only on disagreement) with
 * zero changes needed here; 17/175 possessive-apostrophe names disagree by
 * design (`slugMismatchCount` below feeds the D30-46 report section).
 *
 * Ritual reroute (D30-43): the docs carrying a raw `system.ritual` object
 * get BOTH `category` and `id` rebuilt from `spell/<slug>` to
 * `ritual/<slug>` right after assembly — keyed on `system.ritual` PRESENCE
 * only (cast-time text is not a reliable ritual marker, scoping doc §2.1).
 *
 * D30-44 (0030 S2): the sibling `loadHomebrewTraits` below walks the 8
 * committed `apps/assay/homebrew/traits/*.json` school-trait docs (staff-
 * drafted, stakeholder-approved copy) — a SEPARATE loader, not a widening of
 * `loadHomebrewSide` above, since the trait store's `{name,description}`
 * shape isn't a Foundry pack doc and can't go through `assembleFoundryEntity`.
 * `transform.ts` merges both loaders' entities into one combined set before
 * the drop pass (`homebrewIds`/`assertNoHomebrewCollisions`/the report
 * section all see traits and spells/rituals alike).
 */

export type ReportFn = (cls: string, detail: string) => void;

export interface HardFailure {
  path: string;
  message: string;
}

const HOMEBREW_PACK_DIR = "spells";
const RITUAL_CATEGORY = "ritual";
const TRAIT_CATEGORY = "trait";
/** The store's own `system.publication.title` (D30-42/-46) — trait source
 * docs carry no publication block of their own (`{name, description}` only,
 * D30-44), so the book is hardcoded here rather than read per-doc. */
const HOMEBREW_BOOK = "Liturgy of the Iridite Vol.2";

/** Mirrors `transform.ts`'s own private `makeCtx` verbatim — duplicated
 * (not imported) to avoid a circular import, same "small, self-contained
 * duplicate" posture `drop.ts`'s own file header documents for its
 * `reconcileCrossrefs` walker. */
function makeCtx(
  index: UuidIndex,
  localize: ReadonlyMap<string, string>,
  report: ReportFn,
): EnricherContext {
  const ctx: EnricherContext = {
    resolveUuid: createResolveUuid(index),
    localize,
    report,
    parseBlockHtml: (html: string) => parseFoundryHtml(html, ctx),
  };
  return ctx;
}

/** The store doc's own `system.ritual` field — read via a narrow structural
 * cast (`RawFoundryDoc["system"]` doesn't declare `ritual` at all; official
 * Foundry spell docs never carry one, so `foundryEntities.ts`'s `RawSystem`
 * has no reason to). */
function hasRitual(rawDoc: unknown): boolean {
  return (rawDoc as { system?: { ritual?: unknown } }).system?.ritual !== undefined;
}

/** The store doc's own `system.cost`/`system.ritual` stat fields, read via
 * the same narrow-structural-cast posture as `hasRitual` above (official
 * Foundry spell docs never carry `ritual`, and `RawSystem` declares neither
 * field). */
interface RawStatFields {
  system?: {
    cost?: { value?: unknown };
    ritual?: {
      primary?: { check?: unknown };
      secondary?: { casters?: unknown; checks?: unknown };
    };
  };
}

function statCell(label: string, value: string): InlineNode[] {
  const marks = { italic: false, superscript: false };
  return [
    { kind: "text", content: label, marks: { ...marks, bold: true } },
    { kind: "text", content: ` ${value}`, marks: { ...marks, bold: false } },
  ];
}

/**
 * Synthesizes the AoN-style statblock rows an official ritual/costed spell
 * gets from its AoN side — which homebrew docs don't pass through, so
 * `system.cost` and `system.ritual` were invisible on every homebrew page
 * (hellforging's 50,000 gp body, the ritual caster requirements the
 * 2026-07-31 review asked after). Mirrors `ritual/resurrect`'s real shape:
 * row one `Cost`/`Secondary Casters`, row two `Primary Check`/`Secondary
 * Checks`, each cell a bold label + plain ` value` run. `Cast` is
 * deliberately NOT synthesized — the entity header already renders
 * `facets.castTime`. Rows with no populated cell are omitted entirely, so a
 * plain costless spell gains nothing; a row left with a SINGLE cell emits as
 * a bold-label paragraph instead (`CodexEntitySchema` pins `statRow.cells`
 * to >=2, mirroring the P10 candidacy rule — a lone bold-label line IS a
 * paragraph, pre-collapse AoN shape).
 */
function synthesizeStatRows(rawDoc: unknown): BlockNode[] {
  const sys = (rawDoc as RawStatFields).system;
  const rowOne: InlineNode[][] = [];
  const rowTwo: InlineNode[][] = [];

  const cost = sys?.cost?.value;
  if (typeof cost === "string" && cost.trim() !== "") rowOne.push(statCell("Cost", cost.trim()));

  const casters = sys?.ritual?.secondary?.casters;
  if (typeof casters === "number" && casters > 0) {
    rowOne.push(statCell("Secondary Casters", String(casters)));
  }

  const primaryCheck = sys?.ritual?.primary?.check;
  if (typeof primaryCheck === "string" && primaryCheck.trim() !== "") {
    rowTwo.push(statCell("Primary Check", primaryCheck.trim()));
  }
  const secondaryChecks = sys?.ritual?.secondary?.checks;
  if (typeof secondaryChecks === "string" && secondaryChecks.trim() !== "") {
    rowTwo.push(statCell("Secondary Checks", secondaryChecks.trim()));
  }

  const rows: BlockNode[] = [];
  for (const cells of [rowOne, rowTwo]) {
    if (cells.length >= 2) {
      const row: StatRowNode = { kind: "statRow", cells };
      rows.push(row);
    } else if (cells.length === 1 && cells[0] !== undefined) {
      rows.push({ kind: "paragraph", children: cells[0] });
    }
  }
  return rows;
}

function withSynthesizedStats(entity: CodexEntity, rawDoc: unknown): CodexEntity {
  const rows = synthesizeStatRows(rawDoc);
  if (rows.length === 0) return entity;
  const body: BlockNode[] = [...rows, ...entity.body];
  return { ...entity, body };
}

function rerouteToRitual(entity: CodexEntity, report: ReportFn): CodexEntity {
  const rerouted: CodexEntity = {
    ...entity,
    category: RITUAL_CATEGORY,
    id: `${RITUAL_CATEGORY}/${entity.slug}`,
  };
  report("homebrewRitualRerouted", rerouted.id);
  return rerouted;
}

export interface HomebrewSide {
  entities: CodexEntity[];
  /** D30-46 report section: how many store docs' basename disagrees with
   * `sluggify(doc.name)` (possessive apostrophes — codex `sluggify` strips
   * `'`, store basenames hyphenate; expect exactly 17 on the real store,
   * gate A). */
  slugMismatchCount: number;
}

/**
 * Walks `homebrewDir` (sorted, `walkFiles`'s own contract — determinism)
 * and assembles every `*.json` doc into a `CodexEntity`, rerouting the
 * ritual trio to `ritual/*`. Hard failures (malformed enricher grammar/
 * HTML) push onto the shared `hardFailures` array exactly like
 * `loadFoundrySide`'s own per-doc try/catch — the caller aborts before
 * join/emit when non-empty.
 */
export function loadHomebrewSide(
  homebrewDir: string,
  foundryIndex: UuidIndex,
  report: ReportFn,
  hardFailures: HardFailure[],
): HomebrewSide {
  const entities: CodexEntity[] = [];
  const seenIds = new Set<string>();
  let slugMismatchCount = 0;

  for (const file of walkFiles(homebrewDir)) {
    if (!file.relPath.endsWith(".json")) continue;
    const basename = file.relPath.replace(/\.json$/, "");
    const rawDoc = JSON.parse(readFileSync(file.absPath, "utf8")) as unknown;
    const doc = rawDoc as RawFoundryDoc;
    if (sluggify(doc.name) !== basename) slugMismatchCount++;

    const ctx = makeCtx(foundryIndex, new Map(), report);
    try {
      const entity = assembleFoundryEntity({
        packDir: HOMEBREW_PACK_DIR,
        docClass: "Item",
        basename,
        doc,
        ctx,
        report,
        seenIds,
      });
      if (!entity) continue; // defensive: mapCategory("spells","spell") never excludes
      const withStats = withSynthesizedStats(entity, rawDoc);
      entities.push(hasRitual(rawDoc) ? rerouteToRitual(withStats, report) : withStats);
    } catch (e) {
      if (e instanceof EnricherGrammarError || e instanceof FoundryHtmlError) {
        hardFailures.push({ path: file.relPath, message: e.message });
        continue;
      }
      throw e;
    }
  }

  return { entities, slugMismatchCount };
}

// ---------------------------------------------------------------------------
// D30-44 (0030 S2): the 8 school-trait docs
// ---------------------------------------------------------------------------

/** The trait store doc's own shape (D30-44) — `{name, description:{value}}`
 * and nothing else, ever (a stray `level` would flip `Lvl` onto every /trait
 * row site-wide, `columnDefs.ts`'s `categoryHasLevelCoverage`). */
interface RawHomebrewTraitDoc {
  name: string;
  description: { value: string };
}

export interface HomebrewTraitsSide {
  entities: CodexEntity[];
}

/**
 * Walks `traitsDir` (sorted, same `walkFiles` contract as `loadHomebrewSide`)
 * and assembles every `*.json` doc into a `trait/<token>` `CodexEntity` —
 * built directly rather than through `assembleFoundryEntity` (that function's
 * `RawFoundryDoc` shape — `_id`/`type`/`system.*` — has no analog here; the
 * trait store's `{name, description}` shape isn't a Foundry pack doc at all).
 * Identity (D30-44): the file basename IS the trait token (`memetics`,
 * `kosmoturgy`, ... — never `sluggify(name)`, though the two happen to agree
 * on all 8 real names; `trait/worldweaver` would dangle the Worldweaver pill
 * a spell's school pill links to). `rarity:"common"` matches the official
 * trait rows (`trait/aasimar`) so the /trait Rarity column doesn't em-dash;
 * `traits:[]`/`facets:{}` — a trait entity has no traits/facets of its own.
 * No `level`, no `proseOnly` (homebrew rides the D30-43 drop keep-arm, not
 * the AoN-join `proseOnly` convention). The description HTML is parsed
 * through the same `parseFoundryHtml`/ctx machinery `loadHomebrewSide` uses
 * (empty localize map, official `foundryIndex` for `@UUID` resolution — the
 * real copy carries none, but this is the real parser, not a hand-rolled
 * one).
 */
export function loadHomebrewTraits(
  traitsDir: string,
  foundryIndex: UuidIndex,
  report: ReportFn,
  hardFailures: HardFailure[],
): HomebrewTraitsSide {
  const entities: CodexEntity[] = [];

  for (const file of walkFiles(traitsDir)) {
    if (!file.relPath.endsWith(".json")) continue;
    const token = file.relPath.replace(/\.json$/, "");
    const raw = JSON.parse(readFileSync(file.absPath, "utf8")) as RawHomebrewTraitDoc;
    const ctx = makeCtx(foundryIndex, new Map(), report);
    try {
      const body = parseFoundryHtml(raw.description.value, ctx);
      entities.push({
        id: `${TRAIT_CATEGORY}/${token}`,
        slug: token,
        category: TRAIT_CATEGORY,
        name: raw.name,
        edition: "remaster",
        source: { book: HOMEBREW_BOOK, license: "OGL" },
        rarity: "common",
        traits: [],
        facets: {},
        body,
      });
    } catch (e) {
      if (e instanceof EnricherGrammarError || e instanceof FoundryHtmlError) {
        hardFailures.push({ path: file.relPath, message: e.message });
        continue;
      }
      throw e;
    }
  }

  return { entities };
}

// ---------------------------------------------------------------------------
// D30-43 (M3-widened) collision guard
// ---------------------------------------------------------------------------

/**
 * Every homebrew final id, checked against BOTH the pre-drop assembled
 * OFFICIAL Foundry entity set (catches a homebrew id shadowing an official
 * doc the AoN-primary drop pass then removes — the one Gate-B drift vector:
 * a dropped id's own crossrefs would otherwise silently re-resolve against
 * the wrong, homebrew doc) AND the post-drop kept set (catches a live
 * collision against a SURVIVING official entity, which `emitCorpus` has no
 * dup-id guard of its own for). Throws on the first hit, naming the id —
 * never a silent overwrite.
 */
export function assertNoHomebrewCollisions(
  homebrewIds: ReadonlySet<string>,
  foundryAssembledEntities: ReadonlyMap<string, CodexEntity>,
  keptEntities: readonly CodexEntity[],
): void {
  for (const id of homebrewIds) {
    if (foundryAssembledEntities.has(id)) {
      throw new Error(
        `transform: homebrew id "${id}" collides with a pre-drop assembled official Foundry entity`,
      );
    }
  }
  const keptCounts = new Map<string, number>();
  for (const e of keptEntities) keptCounts.set(e.id, (keptCounts.get(e.id) ?? 0) + 1);
  for (const id of homebrewIds) {
    if ((keptCounts.get(id) ?? 0) > 1) {
      throw new Error(
        `transform: homebrew id "${id}" collides with a surviving official corpus id`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// D30-46 report: @UUID resolved-as-crossref vs brokenRef, over homebrew
// bodies only (a dedicated small walker — mirrors `drop.ts`'s
// `reconcileNode`/extract-fixture.ts's `collectKinds` traversal shape, kept
// as its own self-contained duplicate for the same reason those are: no
// generic report-class counter exists upstream for "this @UUID resolved" —
// only the broken case reports today).
// ---------------------------------------------------------------------------

export interface UuidRefCounts {
  resolved: number;
  broken: number;
}

function walkRefCounts(node: CodexNode, counts: UuidRefCounts): void {
  switch (node.kind) {
    case "crossref":
      counts.resolved++;
      return;
    case "brokenRef":
      counts.broken++;
      return;
    case "paragraph":
    case "heading":
      for (const c of node.children) walkRefCounts(c, counts);
      return;
    case "list":
      for (const item of node.items) for (const c of item) walkRefCounts(c, counts);
      return;
    case "table":
      for (const row of node.rows)
        for (const cell of row.cells) for (const c of cell) walkRefCounts(c, counts);
      if (node.caption) for (const c of node.caption) walkRefCounts(c, counts);
      return;
    case "blockquote":
    case "aside":
    case "localizedBoilerplate":
      for (const c of node.children) walkRefCounts(c, counts);
      return;
    case "statRow":
      for (const cell of node.cells) for (const c of cell) walkRefCounts(c, counts);
      return;
    default:
      return;
  }
}

/** Counts crossref (resolved) vs brokenRef (unresolved) inline nodes across
 * every homebrew entity's `body` — the report section's "70 resolved / 0
 * broken" gate-A pin (D30-46), verified by KIND, not just "0 broken". */
export function countHomebrewUuidRefs(entities: readonly CodexEntity[]): UuidRefCounts {
  const counts: UuidRefCounts = { resolved: 0, broken: 0 };
  for (const e of entities) for (const n of e.body) walkRefCounts(n, counts);
  return counts;
}
