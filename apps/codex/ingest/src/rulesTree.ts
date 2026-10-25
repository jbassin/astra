import type { Edition, License, RulesTreeBook, RulesTreeFile, TreeNode } from "@astra/codex-corpus";

import { deriveBookEdition, deriveBookLicense } from "./bookMeta";

/**
 * The rules-tree builder — the parent-resolution + sibling-ordering algorithm.
 * Pure: takes a flat per-doc input list (already post-identity,
 * post-book-normalize — the caller, `transform.ts`, does the
 * aonId→finalId/book-normalize/link-resolution legwork) and returns the final
 * `{books: [...]}` tree plus a stats object for `report.ts`.
 *
 * ## Parent resolution (with the name-only fallback + tie-breaks)
 *
 * A node's parent doc = the rules doc in the SAME book whose `name` equals
 * the parent breadcrumb element AND whose own breadcrumb path equals the
 * child's path minus its last element (the "path-prefix rule" — since every
 * doc's OWN `breadcrumbs` already IS its complete ancestor chain, this is a
 * single index lookup keyed on `(name, path)`, never a multi-hop walk).
 * Where that finds nothing: fall back to a NAME-ONLY match within the book,
 * preferring a breadcrumb-less (root) doc. Where THAT finds nothing too: a
 * synthetic placeholder node (pinned at exactly 3 in the real corpus — the
 * caller's job to assert that pin and STOP if it grows, this module only
 * counts). All remaining ambiguity (either index step finds >1 candidate)
 * tie-breaks on lowest `aonId` (lexicographic — matches
 * `aonLinkTable.ts`'s own `pickCanonical` tie-break convention, not
 * numeric).
 *
 * ## Sibling ordering (raw links are SIBLING chains, not page-turn)
 *
 * Children at every level are ordered by the next-chain RESTRICTED to that
 * sibling group: only a `nextAonId` whose target is ANOTHER MEMBER OF THE
 * SAME GROUP counts as an edge; the head is the member no other member
 * targets; walk the chain; members never touched by an in-group edge sort
 * after the chained ones, alphabetically. Cross-level/cross-book raw links
 * (780 forks, 986 asymmetries, 106 cross-book hops in the real data) are
 * structurally unreachable here — `nextAonId` is only ever compared against
 * the CURRENT sibling group's own aonId set.
 */

type ReportFn = (cls: string, detail: string) => void;

export interface RulesDocInput {
  aonId: string;
  finalId: string;
  name: string;
  book: string;
  edition: Edition;
  /** This doc's own complete ancestor-name chain, own name excluded, already
   * normalized (`aonFacets.ts`'s `normalizeBreadcrumbElement`). Empty = a
   * tree root. */
  breadcrumbs: readonly string[];
  superseded: boolean;
  /** Resolved via the link table (`normalizeUrlKey` + `byUrl` → `aonId`) —
   * the RAW AoN doc this doc's `next_link`/`previous_link` points at, when
   * that target itself resolves to a known rules doc. `undefined` when the
   * doc has no raw link, or the link's target isn't in this snapshot. */
  nextAonId?: string;
  prevAonId?: string;
}

interface BuildNode {
  name: string;
  /** `undefined` marks a SYNTHETIC node. */
  aonId?: string;
  finalId?: string;
  superseded?: boolean;
  nextAonId?: string;
  breadcrumbs?: readonly string[];
  children: BuildNode[];
}

export interface ParentFallbackHit {
  book: string;
  parentName: string;
  path: readonly string[];
  resolvedTo: string;
}

export interface SiblingChainCoverageRow {
  book: string;
  groups: number;
  fullyChained: number;
  pct: number;
}

export interface RulesTreeStats {
  totalDocs: number;
  bookCount: number;
  rootCount: number;
  childlessRootCount: number;
  syntheticCount: number;
  parentTieBreakCount: number;
  fallbackHits: ParentFallbackHit[];
  siblingChainCoverage: SiblingChainCoverageRow[];
}

function nodeKey(name: string, path: readonly string[]): string {
  return `${name}\u0001${path.join("\u0000")}`;
}

/** Lexicographic — matches `aonLinkTable.ts`'s `pickCanonical` tie-break
 * convention (never numeric: real aonIds are `"{category}-{n}"` strings). */
function byLowestAonId(a: BuildNode, b: BuildNode): number {
  const aa = a.aonId ?? "";
  const bb = b.aonId ?? "";
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function byNameThenAonId(a: BuildNode, b: BuildNode): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return byLowestAonId(a, b);
}

// ---------------------------------------------------------------------------
// one book's tree
// ---------------------------------------------------------------------------

interface BookBuildResult {
  roots: BuildNode[];
  syntheticCount: number;
  parentTieBreakCount: number;
  fallbackHits: ParentFallbackHit[];
  siblingChainCoverage: SiblingChainCoverageRow;
}

function buildBookTree(
  book: string,
  docs: readonly RulesDocInput[],
  report: ReportFn,
): BookBuildResult {
  const nodeByAonId = new Map<string, BuildNode>();
  const exactIndex = new Map<string, BuildNode[]>();
  const nameIndex = new Map<string, BuildNode[]>();

  for (const doc of docs) {
    const node: BuildNode = {
      name: doc.name,
      aonId: doc.aonId,
      finalId: doc.finalId,
      superseded: doc.superseded ? true : undefined,
      nextAonId: doc.nextAonId,
      breadcrumbs: doc.breadcrumbs,
      children: [],
    };
    nodeByAonId.set(doc.aonId, node);
    const key = nodeKey(doc.name, doc.breadcrumbs);
    const exactArr = exactIndex.get(key) ?? [];
    exactArr.push(node);
    exactIndex.set(key, exactArr);
    const nameArr = nameIndex.get(doc.name) ?? [];
    nameArr.push(node);
    nameIndex.set(doc.name, nameArr);
  }

  const syntheticIndex = new Map<string, BuildNode>();
  const roots: BuildNode[] = [];
  let syntheticCount = 0;
  let parentTieBreakCount = 0;
  const fallbackHits: ParentFallbackHit[] = [];

  /** Resolves (creating + wiring, if needed) the node whose OWN `name`/
   * `breadcrumbs` match `(name, path)`, per the file-header algorithm.
   * Memoized via `syntheticIndex` for the synthetic case so repeated
   * children of the same missing parent share one placeholder. `depth`
   * guards against a pathological cycle (never expected in real data). */
  function resolveParent(name: string, path: readonly string[], depth: number): BuildNode {
    if (depth > 50) {
      throw new Error(
        `rulesTree: parent-resolution recursion depth exceeded for "${name}" in "${book}" — likely a cyclical breadcrumb chain`,
      );
    }
    const key = nodeKey(name, path);

    const exact = exactIndex.get(key);
    if (exact !== undefined && exact.length > 0) {
      if (exact.length > 1) {
        parentTieBreakCount++;
        report(
          "rulesTreeParentTieBreak",
          `${book}: "${name}" @ [${path.join(" > ")}] — ${exact.length} candidates`,
        );
      }
      return [...exact].sort(byLowestAonId)[0] as BuildNode;
    }

    const byName = nameIndex.get(name);
    if (byName !== undefined && byName.length > 0) {
      const rootCandidates = byName.filter((n) => (n.breadcrumbs?.length ?? 0) === 0);
      const pool = rootCandidates.length > 0 ? rootCandidates : byName;
      if (pool.length > 1) {
        parentTieBreakCount++;
        report(
          "rulesTreeParentTieBreak",
          `${book}: "${name}" (fallback) — ${pool.length} candidates`,
        );
      }
      const chosen = [...pool].sort(byLowestAonId)[0] as BuildNode;
      fallbackHits.push({
        book,
        parentName: name,
        path,
        resolvedTo: chosen.finalId ?? "(synthetic)",
      });
      report(
        "rulesTreeParentFallback",
        `${book}: "${name}" @ [${path.join(" > ")}] -> ${chosen.finalId ?? "(synthetic)"}`,
      );
      return chosen;
    }

    const existingSynthetic = syntheticIndex.get(key);
    if (existingSynthetic !== undefined) return existingSynthetic;

    const synthetic: BuildNode = { name, children: [] };
    syntheticIndex.set(key, synthetic);
    syntheticCount++;
    report("rulesTreeSyntheticNode", `${book}: "${name}" @ [${path.join(" > ")}]`);

    if (path.length === 0) {
      roots.push(synthetic);
    } else {
      const grandParentName = path.at(-1) as string;
      const grandParentPath = path.slice(0, -1);
      const grandParent = resolveParent(grandParentName, grandParentPath, depth + 1);
      grandParent.children.push(synthetic);
    }
    return synthetic;
  }

  for (const doc of docs) {
    const node = nodeByAonId.get(doc.aonId) as BuildNode;
    if (doc.breadcrumbs.length === 0) {
      roots.push(node);
      continue;
    }
    const parentName = doc.breadcrumbs.at(-1) as string;
    const parentPath = doc.breadcrumbs.slice(0, -1);
    const parent = resolveParent(parentName, parentPath, 0);
    parent.children.push(node);
  }

  // ---- sibling ordering ----
  let groupCount = 0;
  let fullyChainedCount = 0;

  function orderGroup(members: BuildNode[]): BuildNode[] {
    if (members.length <= 1) {
      groupCount++;
      fullyChainedCount++;
      return members;
    }
    groupCount++;

    const groupAonIds = new Set(
      members
        .filter((m): m is BuildNode & { aonId: string } => m.aonId !== undefined)
        .map((m) => m.aonId),
    );
    const byAonId = new Map(
      members
        .filter((m): m is BuildNode & { aonId: string } => m.aonId !== undefined)
        .map((m) => [m.aonId, m] as const),
    );
    const targeted = new Set<string>();
    for (const m of members) {
      if (m.aonId !== undefined && m.nextAonId !== undefined && groupAonIds.has(m.nextAonId)) {
        targeted.add(m.nextAonId);
      }
    }
    const chainParticipants = new Set<string>();
    for (const m of members) {
      if (m.aonId === undefined) continue;
      const hasOutEdge = m.nextAonId !== undefined && groupAonIds.has(m.nextAonId);
      if (hasOutEdge || targeted.has(m.aonId)) chainParticipants.add(m.aonId);
    }
    const heads = [...chainParticipants]
      .filter((id) => !targeted.has(id))
      .map((id) => byAonId.get(id))
      .filter((m): m is BuildNode & { aonId: string } => m !== undefined)
      .sort(byNameThenAonId);

    const visited = new Set<string>();
    const ordered: BuildNode[] = [];
    for (const head of heads) {
      let current: (BuildNode & { aonId: string }) | undefined = head;
      while (current !== undefined && !visited.has(current.aonId)) {
        visited.add(current.aonId);
        ordered.push(current);
        const nextId: string | undefined = current.nextAonId;
        current = nextId !== undefined && groupAonIds.has(nextId) ? byAonId.get(nextId) : undefined;
      }
    }
    if (chainParticipants.size > 0 && heads.length === 0) {
      report(
        "rulesTreeSiblingChainCycle",
        `${book}: group of ${members.length} has chain edges but no head`,
      );
    }

    const unchained = members
      .filter((m) => m.aonId === undefined || !visited.has(m.aonId))
      .sort(byNameThenAonId);
    if (unchained.length === 0) fullyChainedCount++;

    return [...ordered, ...unchained];
  }

  function orderRecursive(node: BuildNode): void {
    node.children = orderGroup(node.children);
    for (const child of node.children) orderRecursive(child);
  }

  const orderedRoots = orderGroup(roots);
  for (const root of orderedRoots) orderRecursive(root);

  return {
    roots: orderedRoots,
    syntheticCount,
    parentTieBreakCount,
    fallbackHits,
    siblingChainCoverage: {
      book,
      groups: groupCount,
      fullyChained: fullyChainedCount,
      pct: groupCount > 0 ? Math.round((fullyChainedCount / groupCount) * 1000) / 10 : 100,
    },
  };
}

// ---------------------------------------------------------------------------
// tree -> schema conversion + book-level rollups
// ---------------------------------------------------------------------------

function toTreeNode(n: BuildNode): TreeNode {
  return {
    name: n.name,
    ...(n.finalId !== undefined ? { id: n.finalId } : {}),
    ...(n.superseded === true ? { superseded: true } : {}),
    children: n.children.map(toTreeNode),
  };
}

function countSupersededReal(nodes: readonly BuildNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.aonId !== undefined && n.superseded === true) count++;
    count += countSupersededReal(n.children);
  }
  return count;
}

function countChildlessReal(nodes: readonly BuildNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.aonId !== undefined && n.children.length === 0) count++;
  }
  return count;
}

interface BuildRulesTreeResult {
  file: RulesTreeFile;
  stats: RulesTreeStats;
}

/**
 * Pure: `docs` should be every FINAL (post-drop, post-book-normalize,
 * post-identity) `rules`-category entity, one `RulesDocInput` each.
 * `bookSourceLicense` is the caller's normalized-book → `source`-entity
 * license lookup (the book-level license derivation's second tier,
 * `bookMeta.ts`'s `deriveBookLicense`).
 */
export function buildRulesTree(
  docs: readonly RulesDocInput[],
  bookSourceLicense: ReadonlyMap<string, License>,
  report: ReportFn,
): BuildRulesTreeResult {
  const byBook = new Map<string, RulesDocInput[]>();
  for (const doc of docs) {
    const arr = byBook.get(doc.book) ?? [];
    arr.push(doc);
    byBook.set(doc.book, arr);
  }

  const books: RulesTreeBook[] = [];
  let syntheticCount = 0;
  let parentTieBreakCount = 0;
  const fallbackHits: ParentFallbackHit[] = [];
  const siblingChainCoverage: SiblingChainCoverageRow[] = [];
  let rootCount = 0;
  let childlessRootCount = 0;

  for (const [book, bookDocs] of [...byBook.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const built = buildBookTree(book, bookDocs, report);
    syntheticCount += built.syntheticCount;
    parentTieBreakCount += built.parentTieBreakCount;
    fallbackHits.push(...built.fallbackHits);
    siblingChainCoverage.push(built.siblingChainCoverage);
    rootCount += built.roots.length;
    childlessRootCount += countChildlessReal(built.roots);

    const edition = deriveBookEdition(
      book,
      bookDocs.map((d) => d.edition),
    );
    const license = deriveBookLicense(book, bookSourceLicense.get(book));
    const hiddenWhenLegacyOff = countSupersededReal(built.roots);

    books.push({
      book,
      edition,
      license,
      hiddenWhenLegacyOff,
      nodes: built.roots.map(toTreeNode),
    });
  }

  books.sort((a, b) => {
    if (a.edition !== b.edition) return a.edition === "remaster" ? -1 : 1;
    return a.book.localeCompare(b.book);
  });

  return {
    file: { books },
    stats: {
      totalDocs: docs.length,
      bookCount: books.length,
      rootCount,
      childlessRootCount,
      syntheticCount,
      parentTieBreakCount,
      fallbackHits,
      siblingChainCoverage: siblingChainCoverage.sort((a, b) => a.book.localeCompare(b.book)),
    },
  };
}
