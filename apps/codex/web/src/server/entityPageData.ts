// The pure, directly-testable core of the entity-page server fn — split into its
// OWN module (not co-located with `corpusFns.ts`'s `createServerFn` wrapper) so
// the client bundle never has a reason to reach it: nothing under `src/routes/`
// imports this file at all, only `corpusFns.ts` (from inside its handler) and
// this app's own tests do. Verified by hand: co-locating this in `corpusFns.ts`
// (an earlier version of this file) left `@astra/config`'s KDL-parsing code
// sitting inert-but-present in the CLIENT bundle — the tanstackStart splitter
// only rewrites the specific `.handler(fn)` argument it's asked about, so any
// OTHER export sharing that file (even one nothing client-side imports) still
// drags its own imports along for the ride. A dedicated, route-unreachable file
// is what actually keeps `node:fs`/`@astra/config` out.
import {
  collectEmbedTargetIds,
  type CodexEntity,
  type RulesTreeBook,
  type RulesTreeFile,
  type TreeNode,
} from "@astra/codex-corpus";
import { CorpusNotFoundError, type CorpusReader } from "@astra/codex-corpus/reader";

import { dfsPreOrder } from "../domain/rules/treeModel";

/** The loader caps inlined embed targets per page (logged when hit), so a
 * pathological page (or a future corpus regen) can't make a single request fan
 * out into an unbounded number of file reads. Exported so `classPageData.ts`'s
 * own embed-collection pass — which merges targets from the class body AND every
 * granted-feature body AND the SSR-selected subclass bodies into ONE map before
 * capping — reuses this SAME limit rather than declaring a second one. */
export const EMBED_INLINE_CAP = 100;

/** One ancestor step in a rules entity's breadcrumb trail.
 * `id` present -> a real doc, rendered as a link; absent -> a synthetic
 * group node (exactly 2 exist in the real corpus), rendered as plain text.
 * The entity's own book (a plain string, never linked — books aren't tree
 * nodes) and its own name (already known to the caller as `entity.name`) are
 * NOT elements of this array; the caller renders "book › ancestors.map(...) › entity.name". */
export interface RulesTrailItem {
  name: string;
  id?: string;
}

/** An attached-sidebar aside's own resolved data. Only the
 * fields `AttachedSidebars.tsx` actually renders (title/body/citation/
 * superseded) — NOT the sidebar's full `CodexEntity` (it carries no facets/
 * traits/level worth threading through, and re-using `EntityPage` itself for
 * a sidebar card would risk the recursion this feature must NOT have:
 * sidebars render at depth 1 only). `superseded` mirrors
 * every other corpus surface's own `remasteredAs`-non-empty predicate
 * (`IndexRow.superseded`/`TreeNode.superseded`'s convention). */
export interface AttachedSidebarView {
  id: string;
  name: string;
  body: CodexEntity["body"];
  source: CodexEntity["source"];
  superseded: boolean;
}

/** A previous/next pager target. Synthetic nodes are never targets (they
 * have no page, so the pager skips them) — `id`/`name` always describe a
 * real doc. `superseded` mirrors
 * `TreeNode.superseded`'s own convention (omitted, never `false`) — the
 * legacy toggle does NOT re-chain the pager, so a superseded neighbor can
 * legitimately be the prev/next target; the caller renders its edition pill
 * from this flag. */
export interface RulesPagerTarget {
  id: string;
  name: string;
  superseded?: boolean;
}

/** Everything a rules entity page's trail/sidebar/pager need, resolved in
 * ONE pass over `rules-tree.json` (no second round trip). `book` is the
 * entity's ENTIRE book section (not just the ancestor path) — the sidebar
 * (`RulesLayout.tsx`) reuses it verbatim as `RulesTree`'s `books` prop,
 * scoped to one book, so the sidebar runs on the same tree island. */
export interface RulesNavData {
  book: RulesTreeBook;
  ancestors: RulesTrailItem[];
  prev?: RulesPagerTarget;
  next?: RulesPagerTarget;
}

export interface EntityPageData {
  entity: CodexEntity;
  /** Depth-0 embed target id -> its entity, prefetched so the render layer's
   * `RenderCtx.resolveEmbed` is a pure in-memory lookup. A target NOT in
   * this map (unresolved id, read failure, or past the cap) renders exactly like
   * an unresolved embed — fail-soft, `renderEmbed`'s own posture. */
  embeds: Record<string, CodexEntity>;
  /** Full `trait/<slug>` ids known to exist, for `CodexTraitPills`'s membership
   * check. A plain array (not a `Set`) — this crosses the createServerFn
   * RPC boundary as a client-nav response, and the route rebuilds the `Set`. */
  knownTraitIds: string[];
  /** True if this entity's own depth-0 embed targets exceeded `EMBED_INLINE_CAP` —
   * surfaced so a dev pass can see it without re-deriving it. */
  embedCapHit: boolean;
  /** Set ONLY for `entity.category === "rules"` (only rules-category entities
   * get trail/pager/sidebar data; every other category's payload omits it).
   * Absent (not `undefined`-valued key) when the entity's book/tree position couldn't be
   * resolved (a rules doc missing from `rules-tree.json` would be a genuine
   * corpus bug — this fails soft to "no nav" rather than 500ing the page). */
  rulesNav?: RulesNavData;
  /** The host entity's own `attachedSidebars` ids, resolved
   * to full sidebar bodies in THIS same server-side pass (one serverFn, no
   * second round-trip, mirroring `resolveRulesNav`'s own text) — set on ANY
   * category (attached sidebars render everywhere, not just rules).
   * Fail-soft per id (an unresolvable target — e.g. the real corpus's own
   * `sidebar/key-terms-38` gap on a fixture pick — is skipped with a
   * console.warn, never a 500); absent entirely (never an empty array) when
   * the entity has no `attachedSidebars` field OR every id failed to
   * resolve. */
  attachedSidebars?: AttachedSidebarView[];
}

/** Every depth-0 embed target reachable from an entity's own body/loreBody/
 * embedded-item bodies (the exact set `collectEmbedTargetIds` computes for each),
 * PLUS its own `remasteredAs`/`legacyOf` pointer ids —
 * `EditionBanner`'s pointer-box name resolves through this SAME prefetch map
 * (`ctx.resolveEmbed`), no second server round-trip. Deduplicated, in
 * first-encountered order. Exported so `classPageData.ts`
 * reuses this exact "class body's own embed/pointer targets" computation as
 * the FIRST layer of its own wider (class body + granted features + selected
 * subclasses) embed-target set, rather than re-deriving it. */
export function entityEmbedTargetIds(entity: CodexEntity): string[] {
  const ids = new Set<string>();
  for (const id of collectEmbedTargetIds(entity.body)) ids.add(id);
  if (entity.loreBody) for (const id of collectEmbedTargetIds(entity.loreBody)) ids.add(id);
  if (entity.embeddedItems) {
    for (const item of entity.embeddedItems) {
      for (const id of collectEmbedTargetIds(item.body)) ids.add(id);
    }
  }
  for (const id of entity.remasteredAs ?? []) ids.add(id);
  for (const id of entity.legacyOf ?? []) ids.add(id);
  return [...ids];
}

/** A codex id (`{category}/{slug}`) is exactly one slash-separated pair
 * (`entity.ts`'s own `CodexId` regex) — split on the FIRST slash only, since a
 * `sluggify()`-produced slug is itself guaranteed slash-free. Exported because
 * `classPageData.ts` resolves granted-feature/subclass target
 * ids that live in OTHER categories (`class-feature/*`, `doctrine/*`,
 * `lesson/*`, `patron/*`, ...), the exact same split-then-`reader.entity()`
 * shape this function already serves every other embed/sidebar target. */
export function splitCodexId(id: string): { category: string; slug: string } | null {
  const idx = id.indexOf("/");
  if (idx <= 0 || idx === id.length - 1) return null;
  return { category: id.slice(0, idx), slug: id.slice(idx + 1) };
}

/** Depth-first search for the node bearing `targetId`, returning the full
 * path from a root DOWN TO AND INCLUDING that node (`path.slice(0, -1)` is
 * its ancestor chain, root-first) — the "own breadcrumbs already IS its
 * complete ancestor chain" fact `rulesTree.ts`'s builder relies on means
 * there's exactly one path to any node, so the first hit is THE hit, no
 * backtracking-for-ambiguity needed. `null` when `targetId` isn't anywhere
 * in this book's tree (shouldn't happen for a genuine rules entity — surfaced
 * to the caller as "no nav" rather than a thrown error). */
function findNodePath(nodes: readonly TreeNode[], targetId: string): TreeNode[] | null {
  for (const n of nodes) {
    if (n.id === targetId) return [n];
    const inChild = findNodePath(n.children, targetId);
    if (inChild) return [n, ...inChild];
  }
  return null;
}

function toPagerTarget(n: TreeNode & { id: string }): RulesPagerTarget {
  const target: RulesPagerTarget = { id: n.id, name: n.name };
  if (n.superseded === true) target.superseded = true;
  return target;
}

function toTrailItem(n: TreeNode): RulesTrailItem {
  const item: RulesTrailItem = { name: n.name };
  if (n.id !== undefined) item.id = n.id;
  return item;
}

/**
 * Resolves a rules entity's breadcrumb ancestors + DFS
 * previous/next pager targets from `rules-tree.json`, in one pass. Pure over
 * the already-loaded `tree` (no `CorpusReader` — the caller already read it
 * for `rulesTree()`'s own cache).
 *
 * Book scoping: `entity.source.book` is the SAME normalized book string the
 * tree builder grouped `RulesTreeBook.book` by (both derive from the
 * post-book-normalize `source.book`, `rulesTree.ts`'s own `RulesDocInput.book`
 * doc comment) — a direct map lookup, no fuzzy matching.
 *
 * Pager derivation (DFS pre-order, reusing `treeModel.ts`'s `dfsPreOrder`):
 * flatten the book's tree in pre-order, then filter to id-bearing (real doc)
 * nodes only — synthetic nodes are structurally skipped without disturbing
 * relative order,
 * so `prev`/`next` are simple array-adjacency around the current node's
 * index in that filtered list. This is symmetric by construction (array
 * adjacency is its own inverse), never crosses a book boundary (scoped to
 * one book's `nodes` alone), and is one-sided at the filtered array's ends
 * — the three properties the pager tests pin. The legacy toggle plays no
 * part here at all (the full, unpruned tree is walked), so it does NOT
 * re-chain the pager.
 */
function resolveRulesNav(tree: RulesTreeFile, entity: CodexEntity): RulesNavData | undefined {
  const book = tree.books.find((b) => b.book === entity.source.book);
  if (!book) return undefined;

  const path = findNodePath(book.nodes, entity.id);
  if (!path) return undefined;
  const ancestors: RulesTrailItem[] = path.slice(0, -1).map((n) => toTrailItem(n));

  const realDocs = dfsPreOrder(book.nodes).filter(
    (n): n is TreeNode & { id: string } => n.id !== undefined,
  );
  const idx = realDocs.findIndex((n) => n.id === entity.id);
  const prev = idx > 0 ? toPagerTarget(realDocs[idx - 1] as TreeNode & { id: string }) : undefined;
  const next =
    idx >= 0 && idx < realDocs.length - 1
      ? toPagerTarget(realDocs[idx + 1] as TreeNode & { id: string })
      : undefined;

  return { book, ancestors, ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}

/**
 * The pure core: resolves the entity, prefetches its depth-0 embed targets
 * and the trait index — everything a single `RenderCtx` needs. Returns `null`
 * for an unknown category/slug/traversal attempt (the reader's
 * `CorpusNotFoundError` guard). Takes a `CorpusReader` explicitly (not
 * the module singleton) so it's directly unit-testable against the fixture
 * corpus with zero Start-runtime/AsyncLocalStorage machinery involved — a bare
 * `createServerFn(...).handler(...)` can ONLY run inside an actual
 * request/`RouterProvider` context (verified: calling one directly under plain
 * vitest throws "No Start context found in AsyncLocalStorage"), so
 * `corpusFns.ts`'s server fn stays a thin wrapper over this.
 */
export function resolveEntityPageData(
  reader: CorpusReader,
  input: { category: string; slug: string },
): EntityPageData | null {
  let entity: CodexEntity;
  try {
    entity = reader.entity(input.category, input.slug);
  } catch (err) {
    if (err instanceof CorpusNotFoundError) return null;
    throw err;
  }

  const targetIds = entityEmbedTargetIds(entity);
  const embedCapHit = targetIds.length > EMBED_INLINE_CAP;
  const capped = embedCapHit ? targetIds.slice(0, EMBED_INLINE_CAP) : targetIds;
  if (embedCapHit) {
    // oxlint-disable-next-line no-console -- server-side warning to stdout; codex has no OTel logger yet
    console.warn(
      `[codex] ${entity.id} references ${targetIds.length} depth-0 embed targets — ` +
        `capping inlining to the first ${EMBED_INLINE_CAP}.`,
    );
  }

  const embeds: Record<string, CodexEntity> = {};
  for (const targetId of capped) {
    const split = splitCodexId(targetId);
    if (!split) continue; // malformed target id — falls back to unresolved, same as a read miss
    try {
      embeds[targetId] = reader.entity(split.category, split.slug);
    } catch {
      // Unresolved (postDrop brokenRef-adjacent, or a genuinely missing target) —
      // leave it out of the map; `renderEmbed` treats an absent resolver hit
      // exactly like `resolved: false` (fail-soft).
    }
  }

  const knownTraitIds = reader.index("trait").map((row) => row.id);

  let rulesNav: RulesNavData | undefined;
  if (entity.category === "rules") {
    try {
      rulesNav = resolveRulesNav(reader.rulesTree(), entity);
    } catch (err) {
      // Fail-soft, like the embed reads above: a genuinely missing/malformed
      // `rules-tree.json` shouldn't 500 the entity page, only strip its nav.
      // oxlint-disable-next-line no-console -- server-side warning to stdout; codex has no OTel logger yet
      console.warn(`[codex] failed to resolve rules nav for ${entity.id}: ${String(err)}`);
    }
  }

  const attachedSidebars = resolveAttachedSidebars(reader, entity);

  return {
    entity,
    embeds,
    knownTraitIds,
    embedCapHit,
    ...(rulesNav ? { rulesNav } : {}),
    ...(attachedSidebars ? { attachedSidebars } : {}),
  };
}

/**
 * Resolves `entity.attachedSidebars` (a list of `CodexId`s, the ingest's
 * `sidebarAttach.ts` reverse-join) to their full `AttachedSidebarView`s.
 * Depth 1 ONLY, by construction: this reads each sidebar's own entity file
 * once and never looks at ITS `attachedSidebars` field (a sidebar hosting
 * further sidebars isn't a real corpus shape, 0/689 measured — but the guard
 * is structural here regardless, not a runtime check, so it can't silently regress). Measured max 7
 * sidebars/host — a plain loop of `reader.entity()` calls needs no
 * `EMBED_INLINE_CAP`-style cap.
 *
 * Exported — `classPageData.ts` reuses this UNCHANGED rather than
 * re-implementing depth-1 sidebar resolution for the `class` category.
 */
export function resolveAttachedSidebars(
  reader: CorpusReader,
  entity: CodexEntity,
): AttachedSidebarView[] | undefined {
  if (entity.attachedSidebars === undefined || entity.attachedSidebars.length === 0) {
    return undefined;
  }
  const resolved: AttachedSidebarView[] = [];
  for (const sidebarId of entity.attachedSidebars) {
    const split = splitCodexId(sidebarId);
    if (!split) continue; // malformed id — same fail-soft posture as an embed target
    try {
      const sidebar = reader.entity(split.category, split.slug);
      resolved.push({
        id: sidebar.id,
        name: sidebar.name,
        body: sidebar.body,
        source: sidebar.source,
        superseded: (sidebar.remasteredAs?.length ?? 0) > 0,
      });
    } catch (err) {
      // oxlint-disable-next-line no-console -- server-side warning to stdout; codex has no OTel logger yet
      console.warn(
        `[codex] attached sidebar "${sidebarId}" on ${entity.id} failed to resolve: ${String(err)}`,
      );
    }
  }
  return resolved.length > 0 ? resolved : undefined;
}
