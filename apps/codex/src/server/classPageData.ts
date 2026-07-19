// P12 S2 (D29-117) — the `/class`/`/class/{slug}` bespoke surface's own
// server-side projection, living beside `entityPageData.ts` and split the
// SAME way (nothing under `src/routes/` imports this directly, only
// `corpusFns.ts` and this app's own tests do — see that file's header
// comment for why the split matters: keeping `node:fs`/`@astra/config` out
// of the client bundle).
//
// `ClassPageData` is a STRUCTURAL SUPERSET of `EntityPageData` (extends it)
// rather than a parallel, unrelated shape: this slice (S2) renders the
// EXISTING `EntityRenderPane` for every `/class/{slug}` page — stats-bearing
// classes included, the bespoke `ClassPage` composition is S3 — so the
// payload must already satisfy exactly what `EntityRenderPane` destructures
// (`entity`/`embeds`/`knownTraitIds`/`attachedSidebars`). The class-specific
// fields (`rail`/`grantedFeatures`/`selectedSubclasses`) ride alongside,
// ignored by `EntityRenderPane` today and consumed by S3's `ClassPage`
// tomorrow — a single server fn / single round trip serves both slices
// without a reshape in between.
//
// Fail-soft design choice (spec's own open question, D29-117): rather than
// have the ROUTE branch between `getEntityPage` (generic) and a class-only
// server fn depending on whether the doc turns out to be stats-bearing —
// which would need a first round trip just to find that out, doubling
// SSR/client latency for every `/class/{slug}` request — `resolveClassPageData`
// ALWAYS returns the full `ClassPageData` shape for ANY doc in the `class`
// category (the 20 `@legacy` + 2 miscategorized docs included), with
// `grantedFeatures`/`selectedSubclasses` simply absent when
// `entity.stats?.kind !== "class"`. One server fn, one loader, one round
// trip, for every `/class/{slug}` request — mirrors the existing
// `rulesNav`/`attachedSidebars` "optional, set only when applicable" fields
// `resolveEntityPageData` already carries.

import { collectEmbedTargetIds } from "../domain/render/nodes";
import type { CodexEntity, GrantedFeature, IndexRow, SubclassOption } from "../schema/entity";
import { CorpusNotFoundError, type CorpusReader } from "./corpusFs";
import {
  EMBED_INLINE_CAP,
  entityEmbedTargetIds,
  type EntityPageData,
  resolveAttachedSidebars,
  splitCodexId,
} from "./entityPageData";

/** D29-117 — one granted feature's resolved doc, projected SLIM (`{id, name,
 * level, body}`, the spec's own literal shape) to keep the router's
 * dehydration payload down (P9 memory: the FULL `CodexEntity` carries
 * `facets`/`traits`/`source`/... a feature-stream render never touches).
 * `level` is the GRANT's own level (`GrantedFeature.level`), NOT the
 * resolved doc's own `entity.level` field — measured on the real fixture:
 * witch grants the shared `class-feature/weapon-specialization` doc at
 * level 13, but that doc's own `level` field is 7 (stamped from fighter's
 * context, the class that doc was originally extracted alongside) — the
 * progression table's placement is a per-class GRANT fact, not a property
 * of the feature doc itself. `name` is the resolved doc's own canonical
 * `name` (not the grant's `name` string) — the two are identical in every
 * measured case (D29-114: "0 renamed/suffixed"), but the doc's name is the
 * one a reader actually lands on. */
export interface SlimFeatureDoc {
  id: string;
  name: string;
  level: number;
  body: CodexEntity["body"];
}

/** D29-118 — one `/class` rail row. Deliberately NOT the full `IndexRow` —
 * the rail only ever renders a name + edition marker + current-slug
 * highlight (spec's own text), so this trims to exactly that rather than
 * shipping `traits`/`source`/`rarity`/`facets` down the wire for a ≤49-row
 * list that's identical on every `/class*` request. */
export interface ClassRailRow {
  id: string;
  name: string;
  edition: CodexEntity["edition"];
}

/** D29-118 — the rail's two tiers: `visible` (non-superseded, stats-bearing
 * — exactly 27 in the real corpus) always renders; `hidden` (the 20
 * `@legacy` rows) renders only under `?superseded=1`. The 2 miscategorized
 * `class/` docs (non-superseded, NOT stats-bearing) are deliberately in
 * NEITHER list — spec's own "reachable-but-unlisted" scope note, same
 * posture as `draconic-exemplar` — so `visible`'s predicate is
 * `!superseded && facets?.keyAbility !== undefined`, not a bare
 * `!superseded`. */
export interface ClassRailData {
  visible: ClassRailRow[];
  hidden: ClassRailRow[];
}

export interface ClassPageData extends EntityPageData {
  rail: ClassRailData;
  /** Absent when `entity.stats?.kind !== "class"` (fail-soft docs) OR every
   * grant on a stats-bearing class failed to resolve (shouldn't happen on a
   * real corpus doc — belt-and-braces); never an empty array otherwise,
   * matching every other optional-array field's convention on this payload. */
  grantedFeatures?: SlimFeatureDoc[];
  /** The URL-selected subset of `entity.stats.subclassOptions` ONLY (full
   * `CodexEntity` docs, in `subclassOptions` order) — absent when no
   * `?subclass=` targets were requested/resolved. Unselected pills fetch
   * on demand client-side via the existing `memoizedEntity` seam
   * (`listingClient.ts`) — S3's concern, this payload never carries more
   * than what SSR needs to render. */
  selectedSubclasses?: CodexEntity[];
}

function toRailRow(row: IndexRow): ClassRailRow {
  return { id: row.id, name: row.name, edition: row.edition };
}

/**
 * D29-118 — the `/class` rail, from `class/_index.json` alone (no per-doc
 * reads). Shared by both the bare `/class` index route and every
 * `/class/{slug}` detail page (identical payload either way — the current
 * slug's highlight is a pure render-time comparison against `entity.id`,
 * not baked in here).
 */
export function resolveClassRail(reader: CorpusReader): ClassRailData {
  const rows = reader.index("class");
  const byName = (a: ClassRailRow, b: ClassRailRow) => a.name.localeCompare(b.name);
  const visible = rows
    .filter((r) => !r.superseded && r.facets?.keyAbility !== undefined)
    .map(toRailRow)
    .sort(byName);
  const hidden = rows
    .filter((r) => r.superseded)
    .map(toRailRow)
    .sort(byName);
  return { visible, hidden };
}

/** D29-114/-117 — resolves each non-null `targetId` grant to its slim
 * feature doc, fail-soft per grant (an unresolvable target is skipped with a
 * `console.warn`, same posture as `resolveAttachedSidebars` — this should
 * never actually miss on a real corpus doc post-`augmentClassStats`, but a
 * genuinely stale/hand-edited fixture shouldn't 500 the page over it). The
 * 17 real `targetId: null` grants (D29-114) are NOT represented here at
 * all — they render as plain, non-linked text directly off
 * `entity.stats.grantedFeatures` in the progression table (S3), never
 * synthesized into a fake slim doc. */
function resolveGrantedFeatures(
  reader: CorpusReader,
  grants: readonly GrantedFeature[],
): SlimFeatureDoc[] | undefined {
  const out: SlimFeatureDoc[] = [];
  for (const grant of grants) {
    if (grant.targetId === null) continue;
    const split = splitCodexId(grant.targetId);
    if (!split) continue; // malformed target id — same fail-soft posture as an embed target
    try {
      const doc = reader.entity(split.category, split.slug);
      out.push({ id: doc.id, name: doc.name, level: grant.level, body: doc.body });
    } catch (err) {
      console.warn(`[codex] granted feature "${grant.targetId}" failed to resolve: ${String(err)}`);
    }
  }
  return out.length > 0 ? out : undefined;
}

/** D29-115/-117 — resolves the URL-requested subclass targetIds against
 * `entity.stats.subclassOptions` (never an arbitrary corpus id — a
 * `?subclass=` token that doesn't match any of THIS class's own options is
 * silently ignored, not a general-purpose entity fetch). Iterates
 * `options` (not `requested`) so the resolved array's order always matches
 * the pill layout regardless of the URL's own token order, and a
 * duplicate/repeated token in the URL resolves at most once. */
function resolveSelectedSubclasses(
  reader: CorpusReader,
  options: readonly SubclassOption[],
  requested: ReadonlySet<string>,
): CodexEntity[] | undefined {
  if (requested.size === 0) return undefined;
  const out: CodexEntity[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (seen.has(option.targetId) || !requested.has(option.targetId)) continue;
    seen.add(option.targetId);
    const split = splitCodexId(option.targetId);
    if (!split) continue;
    try {
      out.push(reader.entity(split.category, split.slug));
    } catch (err) {
      console.warn(
        `[codex] selected subclass "${option.targetId}" failed to resolve: ${String(err)}`,
      );
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * The pure core `corpusFns.ts`'s `getClassPage` server fn wraps (same split
 * as `resolveEntityPageData` — see that file's header for why). `null` for
 * an unknown slug in the `class` category (`CorpusNotFoundError`, D29-23's
 * guard) — the route loader's `notFound()`, identical convention to every
 * other resolver in this directory.
 *
 * Embed-prefetch scope (D29-117, the review's own blocker): ONE merged,
 * deduplicated, first-encountered-order target set — the class entity's own
 * body/loreBody/embeddedItems/remasteredAs/legacyOf targets
 * (`entityEmbedTargetIds`, unchanged from `resolveEntityPageData`) FIRST,
 * then every resolved granted-feature body's embed targets (in
 * `grantedFeatures` order), then every SSR-selected subclass body's embed
 * targets (in `selectedSubclasses` order) — capped ONCE at the existing
 * `EMBED_INLINE_CAP` (100), not per-source. Without merging before capping,
 * an inlined feature's own embed (e.g. a granted feature that itself embeds
 * an `action/*` doc) would silently render fail-soft plain text even though
 * the class page's OWN body embeds were comfortably under the cap.
 */
export function resolveClassPageData(
  reader: CorpusReader,
  input: { slug: string; subclassTargetIds?: readonly string[] },
): ClassPageData | null {
  let entity: CodexEntity;
  try {
    entity = reader.entity("class", input.slug);
  } catch (err) {
    if (err instanceof CorpusNotFoundError) return null;
    throw err;
  }

  const rail = resolveClassRail(reader);
  const knownTraitIds = reader.index("trait").map((row) => row.id);
  const attachedSidebars = resolveAttachedSidebars(reader, entity);

  const targetIds = new Set<string>(entityEmbedTargetIds(entity));

  let grantedFeatures: SlimFeatureDoc[] | undefined;
  let selectedSubclasses: CodexEntity[] | undefined;

  if (entity.stats?.kind === "class") {
    const stats = entity.stats;
    grantedFeatures = resolveGrantedFeatures(reader, stats.grantedFeatures ?? []);
    if (grantedFeatures) {
      for (const feature of grantedFeatures) {
        for (const id of collectEmbedTargetIds(feature.body)) targetIds.add(id);
      }
    }

    const requested = new Set(input.subclassTargetIds ?? []);
    selectedSubclasses = resolveSelectedSubclasses(reader, stats.subclassOptions ?? [], requested);
    if (selectedSubclasses) {
      for (const doc of selectedSubclasses) {
        for (const id of collectEmbedTargetIds(doc.body)) targetIds.add(id);
      }
    }
  }

  const allTargetIds = [...targetIds];
  const embedCapHit = allTargetIds.length > EMBED_INLINE_CAP;
  const capped = embedCapHit ? allTargetIds.slice(0, EMBED_INLINE_CAP) : allTargetIds;
  if (embedCapHit) {
    console.warn(
      `[codex] ${entity.id} references ${allTargetIds.length} depth-0 embed targets across ` +
        `its class body, granted features, and selected subclasses — capping inlining to the ` +
        `first ${EMBED_INLINE_CAP} (D29-117).`,
    );
  }

  const embeds: Record<string, CodexEntity> = {};
  for (const targetId of capped) {
    const split = splitCodexId(targetId);
    if (!split) continue;
    try {
      embeds[targetId] = reader.entity(split.category, split.slug);
    } catch {
      // Unresolved — leave it out of the map, same fail-soft posture as
      // `resolveEntityPageData`'s own embed loop.
    }
  }

  return {
    entity,
    embeds,
    knownTraitIds,
    embedCapHit,
    ...(attachedSidebars ? { attachedSidebars } : {}),
    rail,
    ...(grantedFeatures ? { grantedFeatures } : {}),
    ...(selectedSubclasses ? { selectedSubclasses } : {}),
  };
}
