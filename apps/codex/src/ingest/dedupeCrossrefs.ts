import type { CodexEntity, HazardStats, Stats } from "../schema/entity";
import type { BlockNode, CodexNode, InlineNode } from "../schema/nodes";

/**
 * D29-100 (P11 S1): whole-document adjacent-crossref dedupe — ONE post-join,
 * pre-emit walk (drop.ts-adjacent, this is the ONE owner: body crossrefs
 * finalize in `join.ts` pass 5, masthead crossrefs at the parse-time
 * resolver seam, and pass 5 never walks `mastheadExtra` at all — so "after
 * resolution" isn't one place upstream; this pass is).
 *
 * ## Root cause
 *
 * AoN cites legacy/remaster same-named pairs as TWO distinct links (e.g.
 * `Deities.aspx?ID=218` + `?ID=620`, both "Ravithra"); codex's deliberate
 * legacy->remaster link repointing (P1 S5d / P6 family) lands both on the
 * SAME `targetId`, producing identical adjacent crossrefs
 * ("Ravithra, Ravithra" in a domain page's Deities masthead list — the
 * epicenter, `domain/*`). Since the repointing itself is by design
 * (remaster-primary), the resulting duplicates are a policy ARTIFACT, not a
 * source-data fact — dedupe is the policy-consistent fix, not a workaround.
 *
 * ## The walk
 *
 * Covers `body` + `loreBody` + `embeddedItems[].body` + `mastheadExtra[]
 * .value` + hazard `stats.disable`/`routine`/`reset` (the P6 latent-gap
 * surface this module ALSO closes — 0 dupes there today, but walking it
 * keeps the gap closed going forward). Collapses RUNS (not just pairs — a
 * genuine triple exists in the real corpus) of crossref nodes with
 * identical `targetId` and equivalent `display` (folds `'`/`'` apostrophe
 * variants and case — 18 near-dupes measured: Cyth-V'sug/Cyth-V'sug,
 * Ma'at/Ma'at, Palatine Eye title-case), separated only by
 * whitespace/punctuation-only text nodes, down to a single crossref + one
 * trailing separator, keeping the FIRST display. Genuinely-distinct
 * displays sharing punctuation ("Frightened 1"/"Frightened 2") never
 * collapse — display-keying is load-bearing, and since they also carry
 * DIFFERENT `targetId`s, they're safe by construction.
 *
 * `collapseSiblings` operates on ONE sibling array at a time;
 * `collapseNode`'s recursion applies it at EVERY nested array this schema
 * has (list items, table cells/caption, blockquote/aside children,
 * `localizedBoilerplate` children, `statRow` cells) — mirroring
 * `drop.ts`'s own `reconcileNode`/`reconcileInline` recursive-walker shape,
 * so a run anywhere in the tree collapses the same way, not just at the
 * top level.
 */

export type ReportFn = (cls: string, detail: string) => void;

type CrossrefNode = Extract<InlineNode, { kind: "crossref" }>;

/** Lowercase + fold both apostrophe glyphs (`'`/`'`) to one form — display
 * EQUIVALENCE, not identity; the corpus keeps both raw display strings
 * intact everywhere except the dropped duplicate (never mutates the kept
 * node's own `display`). */
function foldDisplay(display: string): string {
  return display.toLowerCase().replace(/[’']/g, "'");
}

/** A text node whose content is entirely non-letter/non-digit (whitespace
 * and/or punctuation) — the ", "/"; " separators AoN's own list-join
 * produces. Unicode-aware (`\p{L}`/`\p{N}`) so an accented display name's
 * OWN text (never itself a separator candidate — this only ever tests
 * "text", never "crossref", nodes) can't accidentally confuse the class;
 * matters here only in that it keeps the predicate correct in principle. */
const SEPARATOR_ONLY_RE = /^[^\p{L}\p{N}]*$/u;

function isSeparatorText(node: CodexNode): boolean {
  return node.kind === "text" && SEPARATOR_ONLY_RE.test(node.content);
}

function isCrossref(node: CodexNode): node is CrossrefNode {
  return node.kind === "crossref";
}

function isDuplicateCrossref(a: CrossrefNode, b: CrossrefNode): boolean {
  return a.targetId === b.targetId && foldDisplay(a.display) === foldDisplay(b.display);
}

/**
 * Collapses adjacent RUNS of duplicate crossref nodes in ONE sibling array
 * to a single crossref + one trailing separator, keeping the FIRST
 * crossref's display. `onDrop` fires once per REMOVED duplicate node (the
 * report/occurrence-counting hook). Generic over `T extends CodexNode` so
 * the SAME implementation serves both `InlineNode[]` (paragraph/heading
 * children, masthead `value`, `statRow` cells) and mixed `CodexNode[]`
 * (list items, table cells, blockquote/aside/`localizedBoilerplate`
 * children) call sites — the algorithm only ever inspects `.kind`, which is
 * agnostic to which tier a sibling belongs to.
 */
function collapseSiblings<T extends CodexNode>(
  nodes: readonly T[],
  onDrop: (dropped: CrossrefNode) => void,
): T[] {
  const result: T[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (node === undefined) break; // unreachable — i < nodes.length
    result.push(node);
    if (!isCrossref(node)) {
      i += 1;
      continue;
    }
    let cursor = i + 1;
    for (;;) {
      let k = cursor;
      for (;;) {
        const candidate = nodes[k];
        if (candidate === undefined || !isSeparatorText(candidate)) break;
        k += 1;
      }
      const maybeDupe = nodes[k];
      if (
        maybeDupe !== undefined &&
        isCrossref(maybeDupe) &&
        isDuplicateCrossref(maybeDupe, node)
      ) {
        onDrop(maybeDupe);
        cursor = k + 1;
        continue;
      }
      break;
    }
    i = cursor;
  }
  return result;
}

/** Recursively collapses `nodes` (bottom-up: each element's own nested
 * arrays are collapsed first, then this array's own siblings). */
function collapseCodexArray(
  nodes: readonly CodexNode[],
  onDrop: (dropped: CrossrefNode) => void,
): CodexNode[] {
  const recursed = nodes.map((n) => collapseNode(n, onDrop));
  return collapseSiblings(recursed, onDrop);
}

function collapseNode(node: CodexNode, onDrop: (dropped: CrossrefNode) => void): CodexNode {
  switch (node.kind) {
    case "paragraph":
    case "heading":
      return { ...node, children: collapseCodexArray(node.children, onDrop) as InlineNode[] };
    case "list":
      return { ...node, items: node.items.map((item) => collapseCodexArray(item, onDrop)) };
    case "table":
      return {
        ...node,
        rows: node.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => collapseCodexArray(cell, onDrop)),
        })),
        ...(node.caption ? { caption: collapseCodexArray(node.caption, onDrop) } : {}),
      };
    case "blockquote":
    case "aside":
      return { ...node, children: collapseCodexArray(node.children, onDrop) };
    case "statRow":
      return {
        ...node,
        cells: node.cells.map((cell) => collapseCodexArray(cell, onDrop) as InlineNode[]),
      };
    case "localizedBoilerplate":
      return { ...node, children: collapseCodexArray(node.children, onDrop) };
    case "divider":
      return node;
    default:
      return node; // every other inline leaf — no nested CodexNode arrays
  }
}

function collapseBlockArray(
  nodes: readonly BlockNode[],
  onDrop: (dropped: CrossrefNode) => void,
): BlockNode[] {
  return collapseCodexArray(nodes, onDrop) as BlockNode[];
}

function collapseHazardStats(
  stats: Stats | undefined,
  onDrop: (dropped: CrossrefNode) => void,
): Stats | undefined {
  if (stats === undefined || stats.kind !== "hazard") return stats;
  const next: HazardStats = { ...stats };
  if (stats.disable) next.disable = collapseBlockArray(stats.disable, onDrop);
  if (stats.routine) next.routine = collapseBlockArray(stats.routine, onDrop);
  if (stats.reset) next.reset = collapseBlockArray(stats.reset, onDrop);
  return next;
}

export interface CollapseCrossrefsResult {
  entities: CodexEntity[];
  /** Total dropped-duplicate-node count across the whole run (the 1,147
   * pin) — one per `report("adjacentCrossrefDeduped", ...)` call. */
  totalOccurrences: number;
  /** Entities with >=1 collapse (the 123 pin). */
  entitiesTouched: number;
}

/**
 * The full D29-100 pass: walks every entity's body/loreBody/embeddedItems/
 * mastheadExtra/hazard-stats surfaces, collapsing adjacent duplicate
 * crossref runs. Pure — no disk I/O. Report-counts `adjacentCrossrefDeduped`
 * once per dropped duplicate node (NOT once per entity — the report class's
 * total count is the 1,147-occurrence pin; `entitiesTouched` on the return
 * value is the separate 123-entity pin, surfaced by the caller into
 * `report.json`/`report.md` alongside the generic counter).
 */
export function collapseAdjacentCrossrefs(
  entities: readonly CodexEntity[],
  report: ReportFn,
): CollapseCrossrefsResult {
  let totalOccurrences = 0;
  let entitiesTouched = 0;

  const result = entities.map((e) => {
    let entityOccurrences = 0;
    const onDrop = (dropped: CrossrefNode): void => {
      entityOccurrences += 1;
      report("adjacentCrossrefDeduped", `${e.id}: ${dropped.targetId} ("${dropped.display}")`);
    };

    const body = collapseBlockArray(e.body, onDrop);
    const loreBody = e.loreBody ? collapseBlockArray(e.loreBody, onDrop) : undefined;
    const embeddedItems = e.embeddedItems?.map((item) => ({
      ...item,
      body: collapseBlockArray(item.body, onDrop),
    }));
    const mastheadExtra = e.mastheadExtra?.map((entry) => ({
      ...entry,
      value: collapseCodexArray(entry.value, onDrop) as InlineNode[],
    }));
    const stats = collapseHazardStats(e.stats, onDrop);

    if (entityOccurrences > 0) {
      entitiesTouched += 1;
      totalOccurrences += entityOccurrences;
    }

    return {
      ...e,
      body,
      ...(loreBody !== undefined ? { loreBody } : {}),
      ...(embeddedItems !== undefined ? { embeddedItems } : {}),
      ...(mastheadExtra !== undefined ? { mastheadExtra } : {}),
      ...(stats !== undefined ? { stats } : {}),
    };
  });

  return { entities: result, totalOccurrences, entitiesTouched };
}
