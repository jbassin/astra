import type { CodexEntity, EmbeddedItem } from "../schema/entity";
import type { BlockNode, CodexNode, InlineNode } from "../schema/nodes";

/**
 * D29-14/-17: the AoN-primary drop pass — S5c, the final P1.5 slice. Runs
 * AFTER `join.ts`'s full 5-pass join (identity + crossref/embed patching
 * already complete) and BEFORE `emit.ts` writes anything to disk.
 *
 * ## The policy (D29-14, supersedes the P1 "keep everything" default)
 *
 * The corpus keeps:
 *   (a) every AoN-only entity (`proseOnly: true`),
 *   (b) every MERGED entity (has its own `aonUrl` — Foundry+AoN joined),
 *   (c) every 1:N variant of a merged family (`variantOf` set — D29-7; a
 *       variant has NO `aonUrl` of its own by construction, but it's still
 *       part of an AoN-backed family, not standalone Foundry-only content),
 *   (d) Foundry-only entities in `creature`/`hazard` ONLY (D29-17's
 *       carve-out — AP content readers look up that AoN doesn't index).
 * Every OTHER Foundry-only entity (no `aonUrl`, no `proseOnly`, no
 * `variantOf`, category outside the carve-out) is dropped — including the
 * four categories that are Foundry-only in their entirety (`boon`,
 * `pfs-boon`, `kingdom-feature`, `effect`, `categoryMap.ts`'s own documented
 * Foundry-only buckets) AND every partially-joined category's unjoined
 * residue (e.g. the weapon/armor/shield/class-feature/action/creature-ability
 * entities that still don't join even after D29-15's equivalence widening).
 *
 * ## Why this needs its OWN crossref/embed re-validation pass
 *
 * `join.ts`'s pass 5 already downgraded every dangling crossref/embed to
 * `brokenRef` — but it validated against the FULL pre-drop entity set. Once
 * this pass removes entities, some SURVIVING entity's body/loreBody/
 * embeddedItems can point at an id that no longer exists in the corpus (a
 * spell's prose crossref-linking to a `boon` entity that just got dropped,
 * say) — a dangling reference Zod's shape-only validation can never catch
 * (`emit.ts`'s own doc comment: it validates SHAPE, not referential
 * integrity). `reconcileCrossrefs` below re-walks every KEPT entity exactly
 * once more, downgrading any now-dangling crossref/embed to `brokenRef`
 * (report class `postDropBrokenRef`/`postDropEmbedBroken`) — mirroring
 * `join.ts`'s own `patchCrossref`/`patchEmbed`/`patchNode` walker shape
 * (kept as a small, self-contained duplicate here rather than exporting and
 * re-parameterizing that pass-5 machinery, which is coupled to aonId/
 * Foundry-uuid resolution maps this pass doesn't have and doesn't need —
 * this pass only ever needs "does the target id still exist in the kept
 * set").
 */

export type ReportFn = (cls: string, detail: string) => void;

const CARVE_OUT_CATEGORIES: ReadonlySet<string> = new Set(["creature", "hazard"]);

// ---------------------------------------------------------------------------
// D29-98 (P11 S1): widened activation-debris drop — folds INTO this same
// pass (not a separate one) because the entities it targets are otherwise
// AoN-backed `action` entities that D29-14/-17's own `isAonBacked` check
// would keep unconditionally; this predicate overrides that for exactly the
// two nameless-activation shapes below, runs on RESOLVED names (D29-99's
// extract-time rename already landed by the time this pass sees an entity —
// the extract -> join -> drop pipeline order gives that for free), and is
// entirely independent of category-carve-out/AoN-backing status.
// ---------------------------------------------------------------------------

/** Exact entity ids (never the shared, unsuffixed `slug` FIELD — ~456
 * entities share e.g. slug "manipulate") kept despite matching a drop
 * family: the 6 base-slug entities with real inbound crossrefs
 * (`manipulate` 29, `concentrate` 18, `concentration` 5, `command` 2,
 * `concentrate-manipulate` 1, `envision` 1) plus 3 more with real inbound
 * EMBEDS from `armor/hollow-robes` (`concentration-3`, `concentration-4`,
 * `spellshape` — embeds count as inbound too, not just crossrefs). */
const ACTIVATION_KEEP_LIST: ReadonlySet<string> = new Set([
  "action/manipulate",
  "action/concentrate",
  "action/concentration",
  "action/command",
  "action/concentrate-manipulate",
  "action/envision",
  "action/concentration-3",
  "action/concentration-4",
  "action/spellshape",
]);

/** Family (i): a name starting with `(` — the "(manipulate)"/"(concentrate,
 * manipulate)" nameless-activation shape. */
function isParenFamily(name: string): boolean {
  return name.startsWith("(");
}

const DIGIT_LEADING_RE = /^\d/;
const HAS_PARENTHESIZED_RE = /\([^)]*\)/;

/** Family (ii): a name starting with a digit AND containing a parenthesized
 * activation string — the "1 hour (envision, Interact)" / "10 minutes
 * (concentrate, manipulate)" shape (stakeholder-widened amendment, D29-98). */
function isDigitFamily(name: string): boolean {
  return DIGIT_LEADING_RE.test(name) && HAS_PARENTHESIZED_RE.test(name);
}

export type ActivationDropFamily = "paren" | "digit";

/** Which family (if any) `entity` matches — `undefined` for anything not a
 * drop candidate (wrong category, not AoN-only, on the keep-list, or
 * matching neither shape). Scoped to `proseOnly === true` (AoN-only, no
 * Foundry pairing at all — same predicate `isAonBacked` uses for that one
 * component) per D29-98's own wording ("drop AoN-only `action` entities") —
 * verified against the real corpus: a real-content Foundry action doc can
 * ALSO carry a parenthetical-prefixed name (e.g. AP-specific actions named
 * `"(Affinity Ablaze) Arms of Balance: …"`) that must NOT be swept up by
 * this nameless-activation-fragment predicate; every one of the 9 keep-list
 * entities is itself `proseOnly: true`, confirming the scope. Exported so a
 * caller/test can reason about family membership without re-deriving the
 * regexes. */
export function activationDropFamily(
  entity: Pick<CodexEntity, "id" | "category" | "name" | "proseOnly">,
): ActivationDropFamily | undefined {
  if (entity.category !== "action") return undefined;
  if (entity.proseOnly !== true) return undefined;
  if (ACTIVATION_KEEP_LIST.has(entity.id)) return undefined;
  if (isParenFamily(entity.name)) return "paren";
  if (isDigitFamily(entity.name)) return "digit";
  return undefined;
}

export interface ActivationDropAccounting {
  total: number;
  parenFamily: number;
  digitFamily: number;
  /** Every family-(ii) (digit-leading) dropped NAME — NOT capped (D29-98's
   * own explicit "the report must list every family-(ii) name dropped"
   * requirement, for orchestrator eyeball review before the S1 commit), one
   * entry per dropped entity (`"id: name"`), sorted by id for determinism. */
  digitFamilyNames: string[];
}

function isAonBacked(entity: CodexEntity): boolean {
  return entity.aonUrl !== undefined || entity.proseOnly === true || entity.variantOf !== undefined;
}

/** True when `entity` would be dropped under D29-14/-17 — exported for tests
 * + for anything that wants to reason about the policy without running the
 * whole pass. */
export function isDropCandidate(
  entity: Pick<CodexEntity, "category" | "aonUrl" | "proseOnly" | "variantOf">,
): boolean {
  if (isAonBacked(entity as CodexEntity)) return false;
  return !CARVE_OUT_CATEGORIES.has(entity.category);
}

// ---------------------------------------------------------------------------
// post-drop crossref/embed reconciliation
// ---------------------------------------------------------------------------

function reconcileInline(
  node: InlineNode,
  keptIds: ReadonlySet<string>,
  report: ReportFn,
): InlineNode {
  switch (node.kind) {
    case "crossref":
      if (keptIds.has(node.targetId)) return node;
      report("postDropBrokenRef", `${node.targetId} -> dropped by the D29-14 AoN-primary pass`);
      return { kind: "brokenRef", target: node.targetId, display: node.display };
    case "embed":
      if (!node.resolved || keptIds.has(node.target)) return node;
      report("postDropEmbedBroken", `${node.target} -> dropped by the D29-14 AoN-primary pass`);
      return { ...node, resolved: false };
    case "localizedBoilerplate":
      return {
        ...node,
        children: node.children.map((c) => reconcileNode(c, keptIds, report)),
      };
    default:
      return node;
  }
}

function reconcileNode(node: CodexNode, keptIds: ReadonlySet<string>, report: ReportFn): CodexNode {
  switch (node.kind) {
    case "paragraph":
    case "heading":
      return { ...node, children: node.children.map((c) => reconcileInline(c, keptIds, report)) };
    case "list":
      return {
        ...node,
        items: node.items.map((item) => item.map((c) => reconcileNode(c, keptIds, report))),
      };
    case "table":
      return {
        ...node,
        rows: node.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => cell.map((c) => reconcileNode(c, keptIds, report))),
        })),
        ...(node.caption
          ? { caption: node.caption.map((c) => reconcileNode(c, keptIds, report)) }
          : {}),
      };
    case "blockquote":
    case "aside":
      return { ...node, children: node.children.map((c) => reconcileNode(c, keptIds, report)) };
    case "divider":
      return node;
    case "statRow":
      // P10 (D29-94): same "cells are InlineNode[][], map through
      // reconcileInline directly" shape as `join.ts`'s `patchNode`.
      return {
        ...node,
        cells: node.cells.map((cell) => cell.map((c) => reconcileInline(c, keptIds, report))),
      };
    default:
      return reconcileInline(node, keptIds, report);
  }
}

function reconcileEmbeddedItem(
  item: EmbeddedItem,
  keptIds: ReadonlySet<string>,
  report: ReportFn,
): EmbeddedItem {
  return { ...item, body: item.body.map((n) => reconcileNode(n, keptIds, report)) as BlockNode[] };
}

/** Re-walks every kept entity's `body`/`loreBody`/`embeddedItems`, downgrading
 * any crossref/embed whose target got dropped to `brokenRef` (crossref) or
 * `resolved: false` (embed — its `target` string is preserved so the id is
 * still visible for debugging, same as a never-resolved pre-join embed). */
function reconcileCrossrefs(entities: readonly CodexEntity[], report: ReportFn): CodexEntity[] {
  const keptIds = new Set(entities.map((e) => e.id));
  return entities.map((e) => {
    const body = e.body.map((n) => reconcileNode(n, keptIds, report)) as BlockNode[];
    const loreBody = e.loreBody
      ? (e.loreBody.map((n) => reconcileNode(n, keptIds, report)) as BlockNode[])
      : undefined;
    const embeddedItems = e.embeddedItems?.map((item) =>
      reconcileEmbeddedItem(item, keptIds, report),
    );
    return {
      ...e,
      body,
      ...(loreBody ? { loreBody } : {}),
      ...(embeddedItems ? { embeddedItems } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// drop accounting (S5c: the report's drop-accounting section)
// ---------------------------------------------------------------------------

export interface CategoryDropStat {
  category: string;
  dropped: number;
}

export interface CarveOutStat {
  category: string;
  kept: number;
}

export interface DropAccounting {
  totalDropped: number;
  byCategory: CategoryDropStat[]; // sorted by category, dropped > 0 only
  carveOut: CarveOutStat[]; // sorted by category — creature/hazard Foundry-only-but-kept counts
  /** D29-98 (P11 S1): the widened activation-debris drop — kept SEPARATE
   * from `totalDropped`/`byCategory` above (a different policy: these
   * entities ARE AoN-backed and would otherwise survive the D29-14/-17
   * pass) so the report's D29-14/-17 section keeps its original meaning. */
  activationDrop: ActivationDropAccounting;
  /** D29-98: `remasteredAs`/`legacyOf` edges stripped off SURVIVING entities
   * that pointed into the (activation ∪ AoN-primary) drop set — one count
   * per stripped pointer, derive-at-build against the final predicate. */
  editionPointersStripped: number;
}

export interface DropResult {
  keptEntities: CodexEntity[];
  accounting: DropAccounting;
}

/** D29-98: strips every id in `dropSet` out of `ids`, report-counting each
 * removal; returns `undefined` (never `[]`) when nothing survives, matching
 * this schema's "absent, never empty array" convention elsewhere
 * (`loreBody`/`embeddedItems`/`attachedSidebars`). */
function stripDroppedIds(
  ids: readonly string[] | undefined,
  dropSet: ReadonlySet<string>,
  report: ReportFn,
  entityId: string,
  fieldName: "remasteredAs" | "legacyOf",
): string[] | undefined {
  if (ids === undefined) return undefined;
  const survivors = ids.filter((id) => {
    if (!dropSet.has(id)) return true;
    report("postDropEditionPointerStripped", `${entityId}.${fieldName} -> ${id}`);
    return false;
  });
  return survivors.length > 0 ? survivors : undefined;
}

/** D29-98: re-walks every KEPT entity's `remasteredAs`/`legacyOf` arrays,
 * dropping any id that points into `dropSet` (the union of this pass's
 * activation-drop AND the existing D29-14/-17 AoN-primary drop). Mirrors
 * `reconcileCrossrefs`' own "re-validate against the surviving set" posture,
 * but for the two top-level edition-pointer fields `reconcileNode`'s body/
 * loreBody/embeddedItems walk never touches — without this, S5's
 * `EditionBanner` would render a raw dangling id (D29-109a) on every kept
 * entity whose edition-pair sibling got dropped this pass (e.g.
 * `action/interact-142`). */
function stripEditionPointers(
  entities: readonly CodexEntity[],
  dropSet: ReadonlySet<string>,
  report: ReportFn,
): CodexEntity[] {
  return entities.map((e) => {
    const remasteredAs = stripDroppedIds(e.remasteredAs, dropSet, report, e.id, "remasteredAs");
    const legacyOf = stripDroppedIds(e.legacyOf, dropSet, report, e.id, "legacyOf");
    if (remasteredAs === e.remasteredAs && legacyOf === e.legacyOf) return e;
    const next: CodexEntity = { ...e };
    if (remasteredAs !== undefined) next.remasteredAs = remasteredAs;
    else delete next.remasteredAs;
    if (legacyOf !== undefined) next.legacyOf = legacyOf;
    else delete next.legacyOf;
    return next;
  });
}

/**
 * The full D29-14/-17/-18(post-drop)/D29-98 pass: partitions `entities` into
 * kept/dropped per BOTH policies (the original AoN-backing/carve-out
 * decision, plus the widened activation-debris override, which fires
 * regardless of AoN-backing), strips dangling `remasteredAs`/`legacyOf`
 * pointers off the survivors, re-validates crossrefs/embeds against the
 * surviving set, and returns both the final entity list AND the
 * drop-accounting the report renders. Pure — no disk I/O.
 */
export function applyAonPrimaryDrop(
  entities: readonly CodexEntity[],
  report: ReportFn,
): DropResult {
  const kept: CodexEntity[] = [];
  const droppedByCategory = new Map<string, number>();
  const carveOutKeptByCategory = new Map<string, number>();
  const droppedIds = new Set<string>();
  let parenFamilyDropped = 0;
  let digitFamilyDropped = 0;
  const digitFamilyNames: string[] = [];

  for (const e of entities) {
    const activationFamily = activationDropFamily(e);
    if (activationFamily !== undefined) {
      droppedIds.add(e.id);
      if (activationFamily === "paren") {
        parenFamilyDropped++;
      } else {
        digitFamilyDropped++;
        digitFamilyNames.push(`${e.id}: ${e.name}`);
      }
      report("activationDropped", `${e.id} (${activationFamily}): ${e.name}`);
      continue;
    }

    const backed = isAonBacked(e);
    const carveOut = CARVE_OUT_CATEGORIES.has(e.category);
    if (backed || carveOut) {
      kept.push(e);
      if (!backed && carveOut) {
        carveOutKeptByCategory.set(e.category, (carveOutKeptByCategory.get(e.category) ?? 0) + 1);
      }
      continue;
    }
    droppedIds.add(e.id);
    droppedByCategory.set(e.category, (droppedByCategory.get(e.category) ?? 0) + 1);
    report("aonPrimaryDrop", `${e.id} (${e.category})`);
  }

  const editionPointersStripped: string[] = [];
  const strippedReport: ReportFn = (cls, detail) => {
    if (cls === "postDropEditionPointerStripped") editionPointersStripped.push(detail);
    report(cls, detail);
  };
  const keptWithStrippedPointers = stripEditionPointers(kept, droppedIds, strippedReport);
  const keptEntities = reconcileCrossrefs(keptWithStrippedPointers, report);

  const byCategory = [...droppedByCategory.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([category, dropped]) => ({ category, dropped }));
  const carveOut = [...carveOutKeptByCategory.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([category, keptCount]) => ({ category, kept: keptCount }));
  const totalDropped = byCategory.reduce((sum, c) => sum + c.dropped, 0);

  return {
    keptEntities,
    accounting: {
      totalDropped,
      byCategory,
      carveOut,
      activationDrop: {
        total: parenFamilyDropped + digitFamilyDropped,
        parenFamily: parenFamilyDropped,
        digitFamily: digitFamilyDropped,
        digitFamilyNames: [...digitFamilyNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      },
      editionPointersStripped: editionPointersStripped.length,
    },
  };
}
