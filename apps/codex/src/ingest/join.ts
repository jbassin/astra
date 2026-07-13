import type { CodexEntity, EmbeddedItem, Edition, Source } from "../schema/entity";
import type { BlockNode, CodexNode, InlineNode } from "../schema/nodes";
import type { AonDocMeta } from "./aonFacets";
import { createLinkResolver, type AonLinkTable, type ResolveLinkFn } from "./aonLinkTable";
import { parseAonMarkdown } from "./aonMarkup";
import type { UuidResolution } from "./enrichers";
import type { RemasterRedirectEntry } from "./journals";
import { sluggify } from "./sluggify";

/**
 * D29-7/-1/-8: the cross-corpus join + identity finalization (spec §4 S4,
 * assignment brief). Takes the S2 Foundry-assembled entities (Item/Actor +
 * journal merges/standalone, all still at their S2 plain `{category}/{slug}`
 * ids — `foundryEntities.ts`'s file header) and the S3 AoN doc metas
 * (`aonFacets.ts`) and produces the FINAL entity set: matched, field-owned,
 * identity-finalized (legacy-pair `@legacy` suffixing + residual-collision
 * suffixing), crossref/embed-patched.
 *
 * Orchestration is 5 passes, each pure over the previous pass's output (no
 * disk I/O in this module — `dev-join.ts`/a future `transform.ts` own that):
 *
 *   1. `matchEntities` — exact slug match, THEN qualifier-reorder
 *      normalization, THEN `join-aliases.json` (D29-7's 3-tier match order),
 *      grouped by AoN doc id to detect Foundry 1:N variants (D29-7's
 *      `variantOf`).
 *   2. `buildDrafts` — assembles one `Draft` (a `CodexEntity` at its PRE-
 *      rename plain id) per Foundry entity (joined/variant/unjoined) and per
 *      un-consumed AoN meta (AoN-only, D29-7's third entity class).
 *   3. identity resolution — D29-1's collision resolution: shared-slug
 *      legacy/remaster pairs get `@legacy`, residual collisions get
 *      deterministic `-2`/`-3`… suffixes. Sets `finalId` directly on each
 *      `Draft` (NOT a `preId -> finalId` map — `preId` is exactly the
 *      ambiguous/shared key when a collision exists, so a map keyed on it
 *      can't hold two different values for two different drafts that share
 *      one; see the pass's own comment below).
 *   4. finalize — stamps final ids, resolves `variantOf`, sets
 *      `remasteredAs`/`legacyOf` from the aonId graph (D29-1's arrays,
 *      looked up by the globally-unique aonId, never the ambiguous slug).
 *   5. crossref/embed patching — walks every entity's `body`/`loreBody`/
 *      `embeddedItems[].body`; a crossref whose plain-id target still names a
 *      real entity is left as-is (by construction the collision "winner"
 *      always keeps that bare id), one that names nothing real becomes
 *      `brokenRef`; embed nodes (carrying a genuinely unique aonId/Foundry
 *      uuid, not the ambiguous slug) are resolved for the first time here and
 *      CAN reach a suffixed/`@legacy` target correctly (D29-1's "crossref
 *      patching" bullet — see `patchCrossref`'s own doc comment for the real
 *      ambiguity this can't fully solve for plain crossrefs specifically).
 *
 * Field ownership (D29-7, orchestrator decision documented at `mergeJoined`
 * below): Foundry wins mechanics, AoN wins prose/citations. Legacy/remaster
 * pairing (D29-1): AoN's `remasterId`/`legacyId` arrays are PRIMARY; the
 * Foundry `remaster-changes` redirect table is a CROSS-CHECK ONLY
 * (`crossCheckRedirects` below) — disagreements are report-counted, AoN's own
 * pairing always wins (never silently overridden).
 */

export type ReportFn = (cls: string, detail: string) => void;

// ---------------------------------------------------------------------------
// join-aliases.json shape (committed, hand-curated — see the file itself)
// ---------------------------------------------------------------------------

export interface JoinAlias {
  foundryId: string;
  aonId: string;
  note: string;
}

export interface JoinAliasesFile {
  aliases: JoinAlias[];
}

/** Turns the committed `join-aliases.json` shape into the `foundryId -> aonId`
 * map `matchEntities` consumes. Pure — the caller reads the file. */
export function buildAliasMap(file: JoinAliasesFile): ReadonlyMap<string, string> {
  return new Map(file.aliases.map((a) => [a.foundryId, a.aonId] as const));
}

// ---------------------------------------------------------------------------
// D29-7's qualifier-reorder normalization
// ---------------------------------------------------------------------------

const QUALIFIER_RE = /^(.*\S)\s*\(([^()]+)\)\s*$/;

/**
 * Foundry `"X (A)"` / `"X (A, B)"` → candidate AoN-slug keys, in try-order:
 * `"A X"`, then (only when ≥2 qualifiers) `"A B X"` (all qualifiers, original
 * order), then bare `"X"` — exactly D29-7's verified creature divergence
 * (`"Adamantine Dragon (Adult)"` → AoN `"Adult Adamantine Dragon"`). Returns
 * `[]` for a name with no trailing parenthetical.
 */
export function qualifierCandidates(name: string): string[] {
  const m = QUALIFIER_RE.exec(name.trim());
  if (!m) return [];
  const base = m[1];
  const qualPart = m[2];
  if (base === undefined || qualPart === undefined) return [];
  const quals = qualPart
    .split(",")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  const first = quals[0];
  if (first === undefined) return [];

  const candidates: string[] = [sluggify(`${first} ${base}`)];
  if (quals.length > 1) candidates.push(sluggify(`${quals.join(" ")} ${base}`));
  candidates.push(sluggify(base));

  // De-dupe while preserving try-order (a single-qualifier name never needs
  // this, but stays harmless if it ever collapses).
  return [...new Set(candidates)];
}

// ---------------------------------------------------------------------------
// matching
// ---------------------------------------------------------------------------

export type MatchVia = "exact" | "normalized" | "alias";

export interface MatchResult {
  aonId: string;
  via: MatchVia;
}

/**
 * Matches one Foundry entity against the AoN metas in its OWN category (D29-7:
 * "within each codex category"), in the 3-tier order: exact slug, then
 * qualifier-reorder normalization, then `join-aliases.json`. `aonSlugIndex` is
 * keyed on `${category}/${slug}`.
 */
export function matchFoundryEntity(
  entity: Pick<CodexEntity, "id" | "category" | "slug" | "name">,
  aonSlugIndex: ReadonlyMap<string, AonDocMeta>,
  aliasMap: ReadonlyMap<string, string>,
  aonMetaById: ReadonlyMap<string, AonDocMeta>,
): MatchResult | undefined {
  const exact = aonSlugIndex.get(`${entity.category}/${entity.slug}`);
  if (exact) return { aonId: exact.aonId, via: "exact" };

  for (const candidateSlug of qualifierCandidates(entity.name)) {
    const hit = aonSlugIndex.get(`${entity.category}/${candidateSlug}`);
    if (hit) return { aonId: hit.aonId, via: "normalized" };
  }

  const aliasAonId = aliasMap.get(entity.id);
  if (aliasAonId !== undefined) {
    const meta = aonMetaById.get(aliasAonId);
    if (meta && meta.category === entity.category) return { aonId: meta.aonId, via: "alias" };
  }

  return undefined;
}

/** D29-7's Foundry 1:N variant rule: the base of a join group is the entity
 * with the shortest name, then alphabetical (deterministic — never depends on
 * map/iteration order). */
export function pickVariantBase(entities: readonly CodexEntity[]): CodexEntity {
  const sorted = [...entities].sort((a, b) => {
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const base = sorted[0];
  if (base === undefined) throw new Error("pickVariantBase: empty group (unreachable)");
  return base;
}

// ---------------------------------------------------------------------------
// field ownership (D29-7)
// ---------------------------------------------------------------------------

/** AoN book titles never carry Foundry's "Pathfinder " prefix (verified: e.g.
 * Foundry `"Pathfinder Bestiary"` vs AoN `"Bestiary"`) — stripped before
 * comparing so this systematic naming-convention difference doesn't flood the
 * report as a false "citationBookMismatch" on nearly every joined entity
 * (documented judgment call, not spec-dictated verbatim). */
function normalizeBookForCompare(title: string): string {
  return title
    .replace(/^Pathfinder\s+/i, "")
    .trim()
    .toLowerCase();
}

function traitSetsDiffer(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a.map((t) => t.toLowerCase()));
  const sb = new Set(b.map((t) => t.toLowerCase()));
  if (sa.size !== sb.size) return true;
  for (const t of sa) if (!sb.has(t)) return true;
  return false;
}

export interface JoinDeps {
  aonMarkdownById: ReadonlyMap<string, string>;
  resolveLink: ResolveLinkFn;
  report: ReportFn;
}

/**
 * Merges one matched (Foundry, AoN) pair per D29-7's field ownership:
 * **Foundry wins mechanics** (facets, embeddedItems, level/traits/rarity —
 * kept from `foundryEntity` verbatim; disagreements vs. the AoN side are
 * report-counted, never applied). **AoN wins prose + citations**: `body` =
 * the AoN markdown parse when the AoN doc has markdown (the orchestrator
 * decision this deliverable owns, D29-7's brief), else Foundry's own body is
 * kept (AoN-markdown-less docs + this is also the codepath for Foundry-only
 * entities, which never call this function at all); `source.book`/`page`
 * come from AoN's `primarySource`, `source.license` keeps Foundry's own value
 * when known (Foundry has real in-source license data) and only falls back
 * to AoN's book-table license when Foundry's is `"unknown"`. `loreBody`
 * (journal-derived) is untouched — a separate field entirely, unaffected by
 * which side "wins" `body`.
 */
export function mergeJoined(
  foundryEntity: CodexEntity,
  meta: AonDocMeta,
  deps: JoinDeps,
): CodexEntity {
  const markdown = deps.aonMarkdownById.get(meta.aonId);
  const body: BlockNode[] =
    markdown !== undefined && markdown.trim().length > 0
      ? parseAonMarkdown(markdown, { resolveLink: deps.resolveLink, report: deps.report })
      : foundryEntity.body;

  if (
    foundryEntity.source.book !== "unknown" &&
    normalizeBookForCompare(foundryEntity.source.book) !==
      normalizeBookForCompare(meta.primarySource.book)
  ) {
    deps.report(
      "citationBookMismatch",
      `${foundryEntity.id}: foundry="${foundryEntity.source.book}" aon="${meta.primarySource.book}"`,
    );
  }
  const license =
    foundryEntity.source.license !== "unknown" ? foundryEntity.source.license : meta.license;
  const source: Source = {
    book: meta.primarySource.book,
    license,
    ...(meta.primarySource.page !== undefined ? { page: meta.primarySource.page } : {}),
  };

  if (foundryEntity.edition !== meta.edition) {
    deps.report(
      "editionMismatch",
      `${foundryEntity.id}: foundry=${foundryEntity.edition} aon=${meta.edition}`,
    );
  }
  if (
    meta.level !== undefined &&
    foundryEntity.level !== undefined &&
    meta.level !== foundryEntity.level
  ) {
    deps.report(
      "levelMismatch",
      `${foundryEntity.id}: foundry=${foundryEntity.level} aon=${meta.level}`,
    );
  }
  if (
    meta.rarity !== undefined &&
    foundryEntity.rarity !== undefined &&
    meta.rarity !== foundryEntity.rarity
  ) {
    deps.report(
      "rarityMismatch",
      `${foundryEntity.id}: foundry=${foundryEntity.rarity} aon=${meta.rarity}`,
    );
  }
  if (meta.traits.length > 0 && traitSetsDiffer(foundryEntity.traits, meta.traits)) {
    deps.report("traitsMismatch", foundryEntity.id);
  }

  return { ...foundryEntity, source, body, aonUrl: meta.aonUrl };
}

/** AoN-only entity (D29-7's third class): no Foundry counterpart at all —
 * either the category has no Foundry pack, or this particular AoN doc didn't
 * match. `facets: {}` (no AoN-specific facet extraction in this deliverable's
 * scope — mirrors `journals.ts`'s own standalone-entity convention).
 * `proseOnly: true` uniformly (judgment call, documented at the call site in
 * `runJoin`). */
function buildAonOnlyEntity(meta: AonDocMeta, deps: JoinDeps): CodexEntity {
  const markdown = deps.aonMarkdownById.get(meta.aonId);
  const body: BlockNode[] =
    markdown !== undefined && markdown.trim().length > 0
      ? parseAonMarkdown(markdown, { resolveLink: deps.resolveLink, report: deps.report })
      : [];
  return {
    id: `${meta.category}/${meta.slug}`,
    slug: meta.slug,
    category: meta.category,
    name: meta.name,
    edition: meta.edition,
    source: {
      book: meta.primarySource.book,
      license: meta.license,
      ...(meta.primarySource.page !== undefined ? { page: meta.primarySource.page } : {}),
    },
    ...(meta.level !== undefined ? { level: meta.level } : {}),
    traits: meta.traits,
    ...(meta.rarity !== undefined ? { rarity: meta.rarity } : {}),
    aonUrl: meta.aonUrl,
    body,
    proseOnly: true,
    facets: {},
  };
}

// ---------------------------------------------------------------------------
// drafts (pre-rename working entities)
// ---------------------------------------------------------------------------

interface Draft {
  entity: CodexEntity;
  preId: string;
  /** Set for a join base and for an AoN-only entity; unset for an unjoined
   * Foundry-only entity and for a variant extra (extras don't own their
   * shared aonId — D29-7's "NO aonUrl/citations of their own"). */
  aonId?: string;
  origin: "foundry" | "aon";
  /** The post-collision-resolution id (pass 3 sets this on the DRAFT OBJECT
   * itself, not via a `preId -> finalId` map — see pass 3's own comment for
   * why: `preId` is, BY DEFINITION, the shared/ambiguous key of a collision
   * group, so a plain map keyed on it can't hold two different values for
   * two different drafts that share one). Defaults to `preId` until pass 3
   * runs. */
  finalId: string;
}

export interface CategoryStat {
  category: string;
  foundryTotal: number;
  aonTotal: number;
  exact: number;
  normalized: number;
  alias: number;
  variants: number;
  unjoinedForeign: Array<{ id: string; name: string }>;
  unjoinedAon: Array<{ id: string; name: string }>;
}

export interface CollisionReport {
  preId: string;
  kind: "legacyPair" | "residual" | "legacyPairAnomaly";
  members: Array<{ finalId: string; origin: "foundry" | "aon"; edition: Edition; name: string }>;
}

export interface RedirectCrossCheck {
  agreements: number;
  disagreements: number;
}

export interface PatchStats {
  patchedCrossrefs: number;
  brokenAfterPatch: number;
  resolvedEmbeds: number;
  unresolvedEmbeds: number;
}

export interface JoinResult {
  entities: CodexEntity[];
  categoryStats: CategoryStat[];
  collisions: CollisionReport[];
  redirectCrossCheck: RedirectCrossCheck;
  patchStats: PatchStats;
  pairingCount: number;
  aliasesApplied: Array<{ foundryId: string; aonId: string; note: string }>;
}

export interface RunJoinInput {
  /** Every S2 Foundry-origin entity (Item/Actor-assembled + journal merges +
   * journal standalone), keyed by its S2 plain `{category}/{slug}` id. */
  foundryEntities: ReadonlyMap<string, CodexEntity>;
  aonMetas: readonly AonDocMeta[];
  aonMarkdownById: ReadonlyMap<string, string>;
  linkTable: AonLinkTable;
  remasterRedirects: readonly RemasterRedirectEntry[];
  aliasesFile: JoinAliasesFile;
  /** Resolves a raw Foundry `@Embed` uuid (the `Compendium.pf2e....` form) to
   * a `UuidResolution` — optional: the caller only has this when it rebuilt
   * the S2 `UuidIndex` (e.g. `dev-join.ts`); without it, Foundry-origin embed
   * nodes are report-counted as unresolved rather than resolved (AoN
   * `<document>` embeds always resolve regardless, via the aonId map this
   * module builds for legacy pairing anyway). */
  resolveForeignEmbed?: (uuid: string) => UuidResolution;
  report: ReportFn;
}

/**
 * The full S4 join (spec §4 S4, this deliverable): matches, merges, finalizes
 * identity, and patches crossrefs. See the file header for the 5-pass shape.
 */
export function runJoin(input: RunJoinInput): JoinResult {
  const { report } = input;
  const aliasMap = buildAliasMap(input.aliasesFile);
  const aliasesApplied: Array<{ foundryId: string; aonId: string; note: string }> = [];
  const aliasNoteByFoundryId = new Map(
    input.aliasesFile.aliases.map((a) => [a.foundryId, a] as const),
  );

  const aonMetaById = new Map(input.aonMetas.map((m) => [m.aonId, m] as const));
  const aonSlugIndex = new Map<string, AonDocMeta>();
  for (const m of input.aonMetas) {
    const key = `${m.category}/${m.slug}`;
    const existing = aonSlugIndex.get(key);
    if (!existing) {
      aonSlugIndex.set(key, m);
    } else if (existing.edition !== "remaster" && m.edition === "remaster") {
      // D29-1's COMMON case (an unrenamed remaster pair, e.g. Heal) shares
      // ITS OWN (category,slug) between the legacy and remaster AoN docs —
      // NOT rare. A Foundry entity matching this slug should match the
      // REMASTER doc (Foundry's own content mirrors the current ruleset;
      // the legacy half, when it has no Foundry counterpart at all, becomes
      // the AoN-only entity that gets the `@legacy` suffix, D29-1). Any
      // OTHER same-slug duplicate (not a legacy/remaster pair at all —
      // genuinely rare) keeps whichever meta was indexed first, deterministic
      // regardless of `aonMetas`'s own input order.
      aonSlugIndex.set(key, m);
    }
  }

  const deps: JoinDeps = {
    aonMarkdownById: input.aonMarkdownById,
    resolveLink: createLinkResolver(input.linkTable, report),
    report,
  };

  // ---- pass 1: match ----
  const matchByFoundryId = new Map<string, MatchResult>();
  for (const [preId, entity] of input.foundryEntities) {
    const m = matchFoundryEntity(entity, aonSlugIndex, aliasMap, aonMetaById);
    if (m) {
      matchByFoundryId.set(preId, m);
      if (m.via === "alias") {
        const note = aliasNoteByFoundryId.get(preId);
        aliasesApplied.push({ foundryId: preId, aonId: m.aonId, note: note?.note ?? "" });
      }
    }
  }

  const groupsByAonId = new Map<string, string[]>();
  for (const [preId, m] of matchByFoundryId) {
    const arr = groupsByAonId.get(m.aonId) ?? [];
    arr.push(preId);
    groupsByAonId.set(m.aonId, arr);
  }

  const baseIdByAonId = new Map<string, string>();
  const variantOfByPreId = new Map<string, string>();
  for (const [aonId, preIds] of groupsByAonId) {
    const entities = preIds.map((id) => {
      const e = input.foundryEntities.get(id);
      if (!e) throw new Error(`runJoin: unreachable — no foundry entity for preId "${id}"`);
      return e;
    });
    const base = pickVariantBase(entities);
    baseIdByAonId.set(aonId, base.id);
    for (const e of entities) if (e.id !== base.id) variantOfByPreId.set(e.id, base.id);
  }

  // ---- pass 2: drafts ----
  const categoryStats = new Map<string, CategoryStat>();
  function statFor(category: string): CategoryStat {
    let s = categoryStats.get(category);
    if (!s) {
      s = {
        category,
        foundryTotal: 0,
        aonTotal: 0,
        exact: 0,
        normalized: 0,
        alias: 0,
        variants: 0,
        unjoinedForeign: [],
        unjoinedAon: [],
      };
      categoryStats.set(category, s);
    }
    return s;
  }

  const drafts: Draft[] = [];
  for (const [preId, entity] of input.foundryEntities) {
    const stat = statFor(entity.category);
    stat.foundryTotal++;
    const match = matchByFoundryId.get(preId);
    const variantOfPre = variantOfByPreId.get(preId);

    if (match && baseIdByAonId.get(match.aonId) === preId) {
      const meta = aonMetaById.get(match.aonId);
      if (!meta) throw new Error(`runJoin: unreachable — no meta for aonId "${match.aonId}"`);
      const merged = mergeJoined(entity, meta, deps);
      drafts.push({ entity: merged, preId, aonId: match.aonId, origin: "foundry", finalId: preId });
      if (match.via === "exact") stat.exact++;
      else if (match.via === "normalized") stat.normalized++;
      else stat.alias++;
    } else if (variantOfPre) {
      drafts.push({
        entity: { ...entity, variantOf: variantOfPre },
        preId,
        origin: "foundry",
        finalId: preId,
      });
      stat.variants++;
    } else {
      drafts.push({ entity, preId, origin: "foundry", finalId: preId });
      stat.unjoinedForeign.push({ id: preId, name: entity.name });
    }
  }

  const consumedAonIds = new Set(baseIdByAonId.keys());
  for (const meta of input.aonMetas) {
    const stat = statFor(meta.category);
    stat.aonTotal++;
    if (consumedAonIds.has(meta.aonId)) continue;
    const preId = `${meta.category}/${meta.slug}`;
    const entity = buildAonOnlyEntity(meta, deps);
    drafts.push({ entity, preId, aonId: meta.aonId, origin: "aon", finalId: preId });
    stat.unjoinedAon.push({ id: preId, name: meta.name });
  }

  // ---- pass 3: identity resolution (collisions) ----
  // `preId` is, BY DEFINITION, the shared/ambiguous key whenever a collision
  // exists — so this pass mutates `finalId` directly on each DRAFT OBJECT
  // (the group's own array elements), never through a `preId -> finalId`
  // map. A map keyed on `preId` cannot hold two different values for two
  // different drafts that share one (an earlier draft of this module had
  // exactly that bug: the legacy half of a shared-slug pair silently lost
  // its own `@legacy` suffix because the remaster half's `.set()` on the
  // SAME key overwrote it right back to the plain form).
  const byPreId = new Map<string, Draft[]>();
  for (const d of drafts) {
    const arr = byPreId.get(d.preId) ?? [];
    arr.push(d);
    byPreId.set(d.preId, arr);
  }

  const collisions: CollisionReport[] = [];

  function isLegacyRemasterPair(a: Draft, b: Draft): boolean {
    if (a.aonId === undefined || b.aonId === undefined) return false;
    const ma = aonMetaById.get(a.aonId);
    const mb = aonMetaById.get(b.aonId);
    if (!ma || !mb) return false;
    return (
      ma.remasterId.includes(b.aonId) ||
      ma.legacyId.includes(b.aonId) ||
      mb.remasterId.includes(a.aonId) ||
      mb.legacyId.includes(a.aonId)
    );
  }

  function residualComparator(a: Draft, b: Draft): number {
    const editionRank = (d: Draft): number => (d.entity.edition === "remaster" ? 0 : 1);
    const sourceRank = (d: Draft): number => (d.origin === "foundry" ? 0 : 1);
    const er = editionRank(a) - editionRank(b);
    if (er !== 0) return er;
    const sr = sourceRank(a) - sourceRank(b);
    if (sr !== 0) return sr;
    if (a.entity.name !== b.entity.name) return a.entity.name < b.entity.name ? -1 : 1;
    return a.preId < b.preId ? -1 : a.preId > b.preId ? 1 : 0;
  }

  for (const [preId, group] of byPreId) {
    if (group.length === 1) {
      const only = group[0];
      if (!only) continue;
      only.finalId = preId; // already the default, explicit for clarity
      continue;
    }

    const first = group[0];
    const second = group[1];
    const isPair =
      group.length === 2 &&
      first !== undefined &&
      second !== undefined &&
      isLegacyRemasterPair(first, second);

    if (isPair && first !== undefined && second !== undefined) {
      const legacy =
        first.entity.edition === "legacy"
          ? first
          : second.entity.edition === "legacy"
            ? second
            : undefined;
      const remaster =
        first.entity.edition === "remaster"
          ? first
          : second.entity.edition === "remaster"
            ? second
            : undefined;
      if (legacy && remaster && legacy !== remaster) {
        legacy.finalId = `${preId}@legacy`;
        remaster.finalId = preId;
        report("legacyPairShareSlug", preId);
        collisions.push({
          preId,
          kind: "legacyPair",
          members: group.map((d) => ({
            finalId: d.finalId,
            origin: d.origin,
            edition: d.entity.edition,
            name: d.entity.name,
          })),
        });
        continue;
      }
      report("legacyPairSameEdition", preId);
      // fall through to the residual scheme below, still reported as an
      // anomaly kind so it's visible as distinct from an ordinary collision.
    }

    const sorted = [...group].sort(residualComparator);
    sorted.forEach((d, i) => {
      d.finalId = i === 0 ? preId : `${preId}-${i + 1}`;
      report("slugCollisionResolved", `${d.preId} -> ${d.finalId}`);
    });
    collisions.push({
      preId,
      kind: isPair ? "legacyPairAnomaly" : "residual",
      members: sorted.map((d) => ({
        finalId: d.finalId,
        origin: d.origin,
        edition: d.entity.edition,
        name: d.entity.name,
      })),
    });
  }

  // ---- pass 4: finalize ids, variantOf, remasteredAs/legacyOf ----
  // `aonIdToFinalId` is keyed on the globally-UNIQUE aonId (never the
  // ambiguous preId) — safe regardless of collisions, and the only map that
  // can genuinely DISAMBIGUATE which specific corpus doc (legacy vs.
  // remaster) a reference meant (D29-1's legacy/remaster arrays, and AoN
  // `<document id>` embeds, both address by aonId, never by the shared
  // slug string).
  const aonIdToFinalId = new Map<string, string>();
  // `foundryFinalIdByPreId` is keyed on the Foundry entity's OWN pre-join id
  // — safe because Foundry ids never collide AMONG THEMSELVES (S2's own
  // `slugCollision` report already collapsed any true Foundry-vs-Foundry
  // duplicate before this module ever saw it); used for `variantOf`
  // resolution (a variant's base is always a Foundry-origin draft) and for
  // Foundry `@Embed` uuid resolution (`resolveForeignEmbed` returns a
  // Foundry-origin preId, never an AoN one).
  const foundryFinalIdByPreId = new Map<string, string>();
  for (const d of drafts) {
    if (d.aonId !== undefined) aonIdToFinalId.set(d.aonId, d.finalId);
    if (d.origin === "foundry") foundryFinalIdByPreId.set(d.preId, d.finalId);
  }

  let pairingCount = 0;
  for (const d of drafts) {
    d.entity.id = d.finalId;
    if (d.entity.variantOf !== undefined) {
      d.entity.variantOf = foundryFinalIdByPreId.get(d.entity.variantOf) ?? d.entity.variantOf;
    }
    if (d.aonId !== undefined) {
      const meta = aonMetaById.get(d.aonId);
      if (!meta) throw new Error(`runJoin: unreachable — no meta for aonId "${d.aonId}"`);
      const remasteredAs: string[] = [];
      for (const id of meta.remasterId) {
        const target = aonIdToFinalId.get(id);
        if (target) remasteredAs.push(target);
        else report("pairingTargetMissing", `${d.aonId} remasterId ${id} not in the joined corpus`);
      }
      const legacyOf: string[] = [];
      for (const id of meta.legacyId) {
        const target = aonIdToFinalId.get(id);
        if (target) legacyOf.push(target);
        else report("pairingTargetMissing", `${d.aonId} legacyId ${id} not in the joined corpus`);
      }
      if (remasteredAs.length > 0) {
        d.entity.remasteredAs = remasteredAs;
        pairingCount += remasteredAs.length;
      }
      if (legacyOf.length > 0) d.entity.legacyOf = legacyOf;
    }
  }

  const redirectCrossCheck = crossCheckRedirects(drafts, input.remasterRedirects, report);

  // ---- pass 5: crossref/embed patching ----
  const finalIds = new Set(drafts.map((d) => d.entity.id));
  const patchStats: PatchStats = {
    patchedCrossrefs: 0,
    brokenAfterPatch: 0,
    resolvedEmbeds: 0,
    unresolvedEmbeds: 0,
  };
  const patchCtx: PatchCtx = {
    finalIds,
    aonIdToFinalId,
    foundryFinalIdByPreId,
    resolveForeignEmbed: input.resolveForeignEmbed,
    report,
    stats: patchStats,
  };
  for (const d of drafts) {
    d.entity.body = d.entity.body.map((n) => patchNode(n, patchCtx)) as BlockNode[];
    if (d.entity.loreBody) {
      d.entity.loreBody = d.entity.loreBody.map((n) => patchNode(n, patchCtx)) as BlockNode[];
    }
    if (d.entity.embeddedItems) {
      d.entity.embeddedItems = d.entity.embeddedItems.map((item) =>
        patchEmbeddedItem(item, patchCtx),
      );
    }
  }

  return {
    entities: drafts.map((d) => d.entity),
    categoryStats: [...categoryStats.values()].sort((a, b) => a.category.localeCompare(b.category)),
    collisions,
    redirectCrossCheck,
    patchStats,
    pairingCount,
    aliasesApplied,
  };
}

// ---------------------------------------------------------------------------
// remaster-changes redirect cross-check (D29-7: Foundry cross-check, AoN wins)
// ---------------------------------------------------------------------------

function crossCheckRedirects(
  drafts: readonly Draft[],
  redirects: readonly RemasterRedirectEntry[],
  report: ReportFn,
): RedirectCrossCheck {
  // Keyed by preId for lookup convenience only — `r.oldId`/`r.newId` come
  // from Foundry's OWN crossref resolution (D29-6), which always names a
  // SPECIFIC Foundry-origin doc, never an ambiguous shared slug, so a
  // preId-keyed map is safe here even though it wouldn't be for the general
  // collision case (ties to a single Draft object, whose own `.finalId` is
  // read directly below — never re-derived from the map key).
  const byPreId = new Map(drafts.map((d) => [d.preId, d] as const));
  let agreements = 0;
  let disagreements = 0;
  for (const r of redirects) {
    if (r.oldId === undefined || r.newId === undefined) continue; // not crossref-resolved, can't cross-check
    const oldDraft = byPreId.get(r.oldId);
    const newDraft = byPreId.get(r.newId);
    if (!oldDraft || !newDraft) continue; // targets outside the joined set, not fatal
    const agrees = (oldDraft.entity.remasteredAs ?? []).includes(newDraft.finalId);
    if (agrees) {
      agreements++;
    } else {
      disagreements++;
      report(
        "redirectDisagreement",
        `${r.oldName} -> ${r.newName} (remaster-changes/${r.page}): Foundry redirect disagrees with AoN's own remasterId/legacyId pairing — AoN wins`,
      );
    }
  }
  return { agreements, disagreements };
}

// ---------------------------------------------------------------------------
// crossref/embed patching (D29-1's "crossref patching" bullet)
// ---------------------------------------------------------------------------

interface PatchCtx {
  finalIds: ReadonlySet<string>;
  aonIdToFinalId: ReadonlyMap<string, string>;
  foundryFinalIdByPreId: ReadonlyMap<string, string>;
  resolveForeignEmbed: ((uuid: string) => UuidResolution) | undefined;
  report: ReportFn;
  stats: PatchStats;
}

/**
 * A crossref's `targetId` is always a PLAIN pre-join id (set by S2's
 * `resolveUuid`/S3's link resolver, both string-only, no richer provenance) —
 * so it's INHERENTLY ambiguous for a shared-slug collision group (nodes.ts's
 * `CrossrefNode` has no field to say "the legacy one specifically"). By
 * construction (pass 3), exactly one member of every collision group keeps
 * the bare preId as its `finalId` — so a crossref target that still names a
 * real entity ALWAYS already equals that entity's current `finalId` (no
 * rewrite needed); one that names nothing real becomes `brokenRef`. This
 * means a plain crossref can never be patched to reach the SUFFIXED member of
 * its own collision group specifically — a real, documented residue class
 * (see the file header), not fixable without widening `CrossrefNode` itself
 * (out of this deliverable's scope). AoN `<document>`/Foundry `@Embed`
 * targets don't have this problem (`patchEmbed` below) because they carry a
 * genuinely unique id (aonId / Foundry uuid), not the shared slug string.
 */
function patchCrossref(node: Extract<CodexNode, { kind: "crossref" }>, ctx: PatchCtx): CodexNode {
  if (ctx.finalIds.has(node.targetId)) return node;
  ctx.report("joinBrokenRef", `${node.targetId} -> unresolved after identity finalization`);
  ctx.stats.brokenAfterPatch++;
  return { kind: "brokenRef", target: node.targetId, display: node.display };
}

function patchEmbed(node: Extract<CodexNode, { kind: "embed" }>, ctx: PatchCtx): CodexNode {
  if (node.resolved) return node; // already resolved (defensive — never true pre-join)

  if (node.target.startsWith("Compendium.")) {
    if (!ctx.resolveForeignEmbed) {
      ctx.report("embedUnresolvedForeign", node.target);
      ctx.stats.unresolvedEmbeds++;
      return node;
    }
    const resolution = ctx.resolveForeignEmbed(node.target);
    if (resolution.kind === "crossref") {
      // `resolution.id` names a SPECIFIC Foundry doc (via its own uuid) —
      // genuinely disambiguating even inside a collision group, unlike a
      // plain crossref's string (see `patchCrossref`'s doc comment).
      const finalId = ctx.foundryFinalIdByPreId.get(resolution.id) ?? resolution.id;
      ctx.stats.resolvedEmbeds++;
      return { ...node, target: finalId, resolved: true };
    }
    ctx.report("embedUnresolvedForeign", node.target);
    ctx.stats.unresolvedEmbeds++;
    return node;
  }

  // Not a Foundry uuid → an AoN raw doc id (every genuine `<document id>` embed
  // target, D29-2/D29-7).
  const finalId = ctx.aonIdToFinalId.get(node.target);
  if (finalId) {
    ctx.stats.resolvedEmbeds++;
    return { ...node, target: finalId, resolved: true };
  }
  ctx.report("embedBrokenAon", node.target);
  ctx.stats.unresolvedEmbeds++;
  return node;
}

function patchInline(node: InlineNode, ctx: PatchCtx): InlineNode {
  switch (node.kind) {
    case "text":
    case "brokenRef":
    case "check":
    case "damage":
    case "inlineRoll":
    case "inlineAction":
    case "template":
    case "actionGlyph":
      return node;
    case "crossref":
      return patchCrossref(node, ctx) as InlineNode;
    case "embed":
      return patchEmbed(node, ctx) as InlineNode;
    case "localizedBoilerplate":
      return { ...node, children: node.children.map((c) => patchNode(c, ctx)) };
  }
}

function patchEmbeddedItem(item: EmbeddedItem, ctx: PatchCtx): EmbeddedItem {
  const body = item.body.map((n) => patchNode(n, ctx)) as BlockNode[];
  return { ...item, body };
}

/** Generic walker over `CodexNode` (both block and inline tiers — recursive
 * fields on list/table/blockquote/aside/caption hold arbitrary `CodexNode`,
 * `nodes.ts`'s own doc comment). Paragraph/heading `children` are narrowly
 * `InlineNode[]`, handled via `patchInline` so the return type stays exact. */
function patchNode(node: CodexNode, ctx: PatchCtx): CodexNode {
  switch (node.kind) {
    case "paragraph":
      return { ...node, children: node.children.map((c) => patchInline(c, ctx)) };
    case "heading":
      return { ...node, children: node.children.map((c) => patchInline(c, ctx)) };
    case "list":
      return { ...node, items: node.items.map((item) => item.map((c) => patchNode(c, ctx))) };
    case "table":
      return {
        ...node,
        rows: node.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => cell.map((c) => patchNode(c, ctx))),
        })),
        ...(node.caption ? { caption: node.caption.map((c) => patchNode(c, ctx)) } : {}),
      };
    case "blockquote":
      return { ...node, children: node.children.map((c) => patchNode(c, ctx)) };
    case "divider":
      return node;
    case "aside":
      return { ...node, children: node.children.map((c) => patchNode(c, ctx)) };
    default:
      return patchInline(node, ctx);
  }
}
