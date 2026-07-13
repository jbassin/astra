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
}

export interface DropResult {
  keptEntities: CodexEntity[];
  accounting: DropAccounting;
}

/**
 * The full D29-14/-17/-18(post-drop) pass: partitions `entities` into
 * kept/dropped per the policy above, re-validates crossrefs/embeds against
 * the surviving set, and returns both the final entity list AND the
 * drop-accounting the report renders. Pure — no disk I/O.
 */
export function applyAonPrimaryDrop(
  entities: readonly CodexEntity[],
  report: ReportFn,
): DropResult {
  const kept: CodexEntity[] = [];
  const droppedByCategory = new Map<string, number>();
  const carveOutKeptByCategory = new Map<string, number>();

  for (const e of entities) {
    const backed = isAonBacked(e);
    const carveOut = CARVE_OUT_CATEGORIES.has(e.category);
    if (backed || carveOut) {
      kept.push(e);
      if (!backed && carveOut) {
        carveOutKeptByCategory.set(e.category, (carveOutKeptByCategory.get(e.category) ?? 0) + 1);
      }
      continue;
    }
    droppedByCategory.set(e.category, (droppedByCategory.get(e.category) ?? 0) + 1);
    report("aonPrimaryDrop", `${e.id} (${e.category})`);
  }

  const keptEntities = reconcileCrossrefs(kept, report);

  const byCategory = [...droppedByCategory.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([category, dropped]) => ({ category, dropped }));
  const carveOut = [...carveOutKeptByCategory.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([category, keptCount]) => ({ category, kept: keptCount }));
  const totalDropped = byCategory.reduce((sum, c) => sum + c.dropped, 0);

  return { keptEntities, accounting: { totalDropped, byCategory, carveOut } };
}
