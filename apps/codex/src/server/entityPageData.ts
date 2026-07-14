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
import type { CodexEntity } from "../schema/entity";
import { CorpusNotFoundError, type CorpusReader } from "./corpusFs";

/** Spec §6 risk: "the loader caps inlined targets (e.g. 100/page, report-logged in
 * dev)" — a pathological page (or a future corpus regen) can't make a single
 * request fan out into an unbounded number of file reads. */
const EMBED_INLINE_CAP = 100;

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

  return { entity, embeds, knownTraitIds, embedCapHit };
}
