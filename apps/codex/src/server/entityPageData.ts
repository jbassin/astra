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
import { collectEmbedTargetIds } from "../domain/render/nodes";
import { dfsPreOrder } from "../domain/rules/treeModel";
import type { CodexEntity } from "../schema/entity";
import type { RulesTreeBook, RulesTreeFile, TreeNode } from "../schema/rulesTree";
import { CorpusNotFoundError, type CorpusReader } from "./corpusFs";

/** Spec §6 risk: "the loader caps inlined targets (e.g. 100/page, report-logged in
 * dev)" — a pathological page (or a future corpus regen) can't make a single
 * request fan out into an unbounded number of file reads. */
const EMBED_INLINE_CAP = 100;

/** P4 S3 (D29-41) — one ancestor step in a rules entity's breadcrumb trail.
 * `id` present -> a real doc, rendered as a link; absent -> a synthetic
 * group node (pinned at exactly 2 in the real corpus, D29-39's amendment),
 * rendered as plain text. The entity's own book (a plain string, never
 * linked — books aren't tree nodes) and its own name (already known to the
 * caller as `entity.name`) are NOT elements of this array; the caller
 * renders "book › ancestors.map(...) › entity.name". */
export interface RulesTrailItem {
  name: string;
  id?: string;
}

/** P4 S4 (D29-42) — an attached-sidebar aside's own resolved data. Only the
 * fields `AttachedSidebars.tsx` actually renders (title/body/citation/
 * superseded) — NOT the sidebar's full `CodexEntity` (it carries no facets/
 * traits/level worth threading through, and re-using `EntityPage` itself for
 * a sidebar card would risk the recursion this feature explicitly must NOT
 * have, D29-42's own "render depth 1 only" guard). `superseded` mirrors
 * every other corpus surface's own `remasteredAs`-non-empty predicate
 * (`IndexRow.superseded`/`TreeNode.superseded`'s convention). */
export interface AttachedSidebarView {
  id: string;
  name: string;
  body: CodexEntity["body"];
  source: CodexEntity["source"];
  superseded: boolean;
}

/** P4 S3 (D29-41) — a previous/next pager target. Synthetic nodes are never
 * targets (D29-41: "synthetic nodes ... are skipped by the pager, they have
 * no page") — `id`/`name` always describe a real doc. `superseded` mirrors
 * `TreeNode.superseded`'s own convention (omitted, never `false`) — the
 * legacy toggle does NOT re-chain the pager, so a superseded neighbor can
 * legitimately be the prev/next target; the caller renders its edition pill
 * from this flag. */
export interface RulesPagerTarget {
  id: string;
  name: string;
  superseded?: boolean;
}

/** P4 S3 (D29-41) — everything a rules entity page's trail/sidebar/pager
 * need, resolved in ONE pass over `rules-tree.json` (no second round trip,
 * D29-41's own text). `book` is the entity's ENTIRE book section (not just
 * the ancestor path) — the sidebar (`RulesLayout.tsx`) reuses it verbatim
 * as `RulesTree`'s `books` prop, scoped to one book, the exact "same tree
 * island machinery" the spec calls for. */
export interface RulesNavData {
  book: RulesTreeBook;
  ancestors: RulesTrailItem[];
  prev?: RulesPagerTarget;
  next?: RulesPagerTarget;
}

export interface EntityPageData {
  entity: CodexEntity;
  /** Depth-0 embed target id -> its entity, prefetched so the render layer's
   * `RenderCtx.resolveEmbed` is a pure in-memory lookup (D29-25). A target NOT in
   * this map (unresolved id, read failure, or past the cap) renders exactly like
   * an unresolved embed — fail-soft, `renderEmbed`'s own posture. */
  embeds: Record<string, CodexEntity>;
  /** Full `trait/<slug>` ids known to exist, for `CodexTraitPills`'s membership
   * check (D29-24). A plain array (not a `Set`) — this crosses the createServerFn
   * RPC boundary as a client-nav response, and the route rebuilds the `Set`. */
  knownTraitIds: string[];
  /** True if this entity's own depth-0 embed targets exceeded `EMBED_INLINE_CAP` —
   * surfaced so a dev/S3 polish pass can see it without re-deriving it. */
  embedCapHit: boolean;
  /** P4 S3 (D29-41) — set ONLY for `entity.category === "rules"` (every other
   * category's payload is byte-identical to pre-S3, spec's own "only
   * rules-category entities get trail/pager/sidebar data" text). Absent (not
   * `undefined`-valued key) when the entity's book/tree position couldn't be
   * resolved (a rules doc missing from `rules-tree.json` would be a genuine
   * corpus bug — this fails soft to "no nav" rather than 500ing the page). */
  rulesNav?: RulesNavData;
  /** P4 S4 (D29-42) — the host entity's own `attachedSidebars` ids, resolved
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
 * deduplicated, in first-encountered order. */
function entityEmbedTargetIds(entity: CodexEntity): string[] {
  const ids = new Set<string>();
  for (const id of collectEmbedTargetIds(entity.body)) ids.add(id);
  if (entity.loreBody) for (const id of collectEmbedTargetIds(entity.loreBody)) ids.add(id);
  if (entity.embeddedItems) {
    for (const item of entity.embeddedItems) {
      for (const id of collectEmbedTargetIds(item.body)) ids.add(id);
    }
  }
  return [...ids];
}

/** A codex id (`{category}/{slug}`) is exactly one slash-separated pair
 * (`entity.ts`'s own `CodexId` regex) — split on the FIRST slash only, since a
 * `sluggify()`-produced slug is itself guaranteed slash-free. */
function splitCodexId(id: string): { category: string; slug: string } | null {
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
 * P4 S3 (D29-41) — resolves a rules entity's breadcrumb ancestors + DFS
 * previous/next pager targets from `rules-tree.json`, in one pass. Pure over
 * the already-loaded `tree` (no `CorpusReader` — the caller already read it
 * for `rulesTree()`'s own cache).
 *
 * Book scoping: `entity.source.book` is the SAME normalized book string the
 * S1 tree builder grouped `RulesTreeBook.book` by (both derive from the
 * post-book-normalize `source.book`, `rulesTree.ts`'s own `RulesDocInput.book`
 * doc comment) — a direct map lookup, no fuzzy matching.
 *
 * Pager derivation (D29-41's DFS pre-order, reusing S2's `dfsPreOrder`):
 * flatten the book's tree in pre-order, then filter to id-bearing (real doc)
 * nodes only — synthetic nodes are structurally skipped (D29-41: "synthetic
 * nodes ... are skipped by the pager") without disturbing relative order,
 * so `prev`/`next` are simple array-adjacency around the current node's
 * index in that filtered list. This is symmetric by construction (array
 * adjacency is its own inverse), never crosses a book boundary (scoped to
 * one book's `nodes` alone), and is one-sided at the filtered array's ends
 * — exactly D29-41's three pinned properties. The legacy toggle plays no
 * part here at all (the full, unpruned tree is walked) — D29-41's "the
 * legacy toggle does NOT re-chain the pager".
 */
export function resolveRulesNav(
  tree: RulesTreeFile,
  entity: CodexEntity,
): RulesNavData | undefined {
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
 * (D29-25), and the trait index (D29-24) — everything a single `RenderCtx`
 * needs. Returns `null` for an unknown category/slug/traversal attempt
 * (`CorpusNotFoundError`, D29-23's guard). Takes a `CorpusReader` explicitly (not
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
    console.warn(
      `[codex] ${entity.id} references ${targetIds.length} depth-0 embed targets — ` +
        `capping inlining to the first ${EMBED_INLINE_CAP} (spec §6 risk).`,
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
      // exactly like `resolved: false` (fail-soft, D29-25).
    }
  }

  const knownTraitIds = reader.index("trait").map((row) => row.id);

  let rulesNav: RulesNavData | undefined;
  if (entity.category === "rules") {
    try {
      rulesNav = resolveRulesNav(reader.rulesTree(), entity);
    } catch (err) {
      // Fail-soft (D29-23/-25's own posture): a genuinely missing/malformed
      // `rules-tree.json` shouldn't 500 the entity page, only strip its nav.
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
 * P4 S4 (D29-42) — resolves `entity.attachedSidebars` (a list of `CodexId`s,
 * S1's `sidebarAttach.ts` reverse-join) to their full `AttachedSidebarView`s.
 * Depth 1 ONLY, by construction: this reads each sidebar's own entity file
 * once and never looks at ITS `attachedSidebars` field (a sidebar hosting
 * further sidebars isn't a real corpus shape, 0/689 measured, D29-42's own
 * "not a thing in the data" — but the guard is structural here regardless,
 * not a runtime check, so it can't silently regress). Measured max 7
 * sidebars/host — a plain loop of `reader.entity()` calls needs no
 * `EMBED_INLINE_CAP`-style cap.
 */
function resolveAttachedSidebars(
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
      console.warn(
        `[codex] attached sidebar "${sidebarId}" on ${entity.id} failed to resolve: ${String(err)}`,
      );
    }
  }
  return resolved.length > 0 ? resolved : undefined;
}
