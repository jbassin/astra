import type { CodexEntity, GrantedFeature, SubclassOption } from "../schema/entity";
import type { InlineNode } from "../schema/nodes";
import type { UuidResolution } from "./enrichers";
import type { RawGrantedFeatureEntry } from "./foundryEntities";

/**
 * D29-114/-115 (P12 S1) + D29-132 (P14 S1): the post-drop `augmentClassStats`
 * pass — a NEW transform pass mirroring the `drop.ts`/`sidebarAttach.ts`
 * precedent (runs over the FINAL kept entity set, right before `emit.ts`).
 * Two jobs, both requiring the final kept-id set / final entity population —
 * neither knowable at extract time (D29-113's scalar-only
 * `extractClassStats`):
 *
 *   - `grantedFeatures` (D29-114, corrected D29-132): each stats-bearing
 *     class's raw `system.items` manifest (`extractRawGrantedFeatures`,
 *     `foundryEntities.ts`), uuid-resolved through the EXISTING
 *     `uuidResolve` seam (`resolveUuid`, the same `createResolveUuid(index)`
 *     `transform.ts` already builds) to a PRE-COLLISION `class-feature/<slug>`
 *     id. **The P12 doc comment here previously claimed "0 renamed/suffixed,
 *     so the raw-uuid-resolved id equals the final id in every resolved
 *     case" — FALSE, corrected by P14's investigation.** `class-feature/`
 *     carries real same-slug collision families (e.g. ~47 separate AoN
 *     "Weapon Specialization" pages — one per class — all slugify to the
 *     SAME base `class-feature/weapon-specialization`, resolved by
 *     `join.ts`'s pass 3 residual-collision scheme into one unsuffixed
 *     winner + `-2`.."-N" siblings; a raw grant uuid resolves to the shared
 *     UNSUFFIXED preId regardless of which class is asking, so the old
 *     "resolvedId in keptIds -> use it" logic silently linked every
 *     non-winning class to the WRONG winner's doc — measured: 164 of 503
 *     resolved grants, 26 of 27 classes affected pre-fix). D29-132 fixes
 *     this with a same-base-slug collision-family index over the FINAL kept
 *     `class-feature` entities (`buildClassFeatureFamilies` below, base slug
 *     = strip a trailing `-\d+` / `@legacy` suffix — the `byCategory`
 *     enumeration shape `buildCategoryOptions` already uses): a family of
 *     size 1 resolves exactly as before (byte-identical, the 153
 *     unambiguous grants); a family of size >1 disambiguates in priority
 *     order — (1) a `mastheadExtra` "Class" label whose text contains the
 *     granting class's name, (2) `legacyOf` naming `class/<grantingSlug
 *     >@legacy`, (3) a unique `level` match among the family — ties within
 *     rule (1)/(2) broken by (a) edition match with the granting class doc,
 *     then (b) lowest collision suffix; no rule resolving a single
 *     candidate -> `targetId: null` (R3 — never a wrong-class card; the
 *     existing null fail-soft at `classPageData.ts:129-137` already renders
 *     plain progression text for a null target). Verified on the real
 *     corpus: rules (2)/(3) never fire today (rule (1) alone resolves all
 *     344 disambiguated grants; 6 remain genuinely undeterminable -> null) —
 *     the cascade is real future-proofing, not current-corpus-load-bearing.
 *   - `subclassOptions` (D29-115): the curated `classSlug -> subclassCategory[]`
 *     map (`SUBCLASS_CATEGORY_MAP` below) + the CURRENT-EDITION UNION —
 *     `currentOptions(category) = docs with remasteredAs == ∅ ∪
 *     dedup(remasteredAs targets of the category's superseded docs)` — a
 *     mechanism uniform across both real shapes: a "living" category (e.g.
 *     `instinct`) has this union collapse to a no-op (its superseded docs'
 *     targets are already inside the 9-current set); a 100%-superseded
 *     category (e.g. `doctrine`, absorbed into `class-feature` by
 *     `join.ts`'s `CATEGORY_EQUIVALENCE`/D29-16) has it follow every pointer
 *     out into `class-feature/`. Legacy husks are ALSO emitted
 *     (`superseded: true`, for the site-convention `?superseded=1` reveal).
 */

export type ReportFn = (cls: string, detail: string) => void;

/**
 * The curated `classSlug -> subclassCategory[]` map (D29-115, spec's
 * per-doc-verified attribution table). `commander`/`fighter`/`guardian`/
 * `magus`/`swashbuckler` map to `[]` — verified: no standalone subclass
 * options category for any of them this round (magus hybrid-studies/
 * exemplar ikons/animist practices are absorbed into `class-feature` and NOT
 * resurrected, per spec scope). Deliberately excludes `draconic-exemplar`
 * (a nested sub-choice of `bloodline/draconic`, not a tab),
 * `hellknight-order` (archetype), and `deviant-ability-classification`
 * (cross-class) — none of these are a `classSlug`'s own subclass category.
 */
const SUBCLASS_CATEGORY_MAP: ReadonlyMap<string, readonly string[]> = new Map([
  ["alchemist", ["research-field"]],
  ["animist", ["apparition"]],
  ["barbarian", ["instinct"]],
  ["bard", ["muse"]],
  ["champion", ["cause", "tenet"]],
  ["cleric", ["doctrine"]],
  ["commander", []],
  ["druid", ["druidic-order"]],
  ["exemplar", ["epithet"]],
  ["fighter", []],
  ["guardian", []],
  ["gunslinger", ["way"]],
  ["inventor", ["innovation"]],
  ["investigator", ["methodology"]],
  ["kineticist", ["element"]],
  ["magus", []],
  ["monk", ["style"]],
  ["oracle", ["mystery"]],
  ["psychic", ["conscious-mind", "subconscious-mind"]],
  ["ranger", ["hunters-edge"]],
  ["rogue", ["racket"]],
  ["sorcerer", ["bloodline"]],
  ["summoner", ["eidolon"]],
  ["swashbuckler", []],
  ["thaumaturge", ["implement"]],
  ["witch", ["lesson", "patron"]],
  ["wizard", ["arcane-school", "arcane-thesis"]],
]);

function codepointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface AugmentClassStatsInput {
  /** The final kept entity set — post drop/dedupe/levelDefault/bookNorm/
   * sidebarAttach (identity + `remasteredAs` are settled by drop time; the
   * later passes never remove entities or touch `remasteredAs`). */
  entities: readonly CodexEntity[];
  /** Class entity id -> its raw `system.items` granted-feature manifest
   * (`foundryEntities.ts`'s `extractRawGrantedFeatures`, threaded through by
   * `transform.ts`'s `loadFoundrySide`). Only classes present here get a
   * `grantedFeatures` array. */
  classGrantedFeatures: ReadonlyMap<string, readonly RawGrantedFeatureEntry[]>;
  /** The existing `createResolveUuid(foundry.index)` instance — resolves a
   * `Compendium.pf2e.classfeatures.Item.<name>` uuid to its PRE-collision
   * `class-feature/<slug>` id (D29-132: this id is the SHARED, unsuffixed
   * base of whatever same-slug collision family it belongs to — see the
   * file header for why "resolvedId in keptIds" alone is not enough to
   * disambiguate which family member a specific grant means). */
  resolveUuid: (uuid: string) => UuidResolution;
  report: ReportFn;
}

export interface AugmentClassStatsResult {
  /** The full entity array — stats-bearing class entities gain
   * `grantedFeatures`/`subclassOptions` on their `stats`; every other entity
   * (including the 20 `@legacy`/non-stats class docs) passes through
   * unchanged. */
  entities: CodexEntity[];
  /** Stats-bearing class entities processed (pins at 27 on the real corpus). */
  classStatsEmitted: number;
  grantedFeaturesResolved: number;
  grantedFeaturesUnresolved: number;
  /** Total subclassOptions rows emitted across every class (current +
   * legacy, all mapped categories). */
  subclassOptionsEmitted: number;
  /** Per (class, category) current/legacy counts — the spec's spot-check
   * pins (barbarian 9+6, sorcerer 18+10, cleric current == its 2 remaster
   * targets) live here, one row per mapped category actually processed
   * (never capped — small, ≤26 rows on the real corpus). */
  subclassOptionCounts: SubclassOptionCount[];
}

export interface SubclassOptionCount {
  classId: string;
  category: string;
  current: number;
  legacy: number;
}

/** Sorted (level, then name) — deterministic, matching `emit.ts`'s own
 * codepoint-comparison convention (never `localeCompare`). */
function sortGrantedFeatures(features: readonly GrantedFeature[]): GrantedFeature[] {
  return [...features].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return codepointCompare(a.name, b.name);
  });
}

// ---------------------------------------------------------------------------
// D29-132 (P14 S1): same-base-slug collision-family disambiguation for
// grantedFeatures — see the file header for the WHY.
// ---------------------------------------------------------------------------

const TRAILING_SUFFIX_RE = /-(\d+)$/;
const LEGACY_SUFFIX = "@legacy";

/** The collision-family key for a `class-feature/<slug>[-N][@legacy]` id —
 * strips a trailing `@legacy` marker THEN a trailing `-N` collision suffix,
 * so a raw grant's unsuffixed resolved preId and every one of its
 * post-join-suffixed/`@legacy` siblings land in the SAME family bucket. */
function classFeatureBaseSlug(id: string): string {
  const withoutLegacy = id.endsWith(LEGACY_SUFFIX) ? id.slice(0, -LEGACY_SUFFIX.length) : id;
  return withoutLegacy.replace(TRAILING_SUFFIX_RE, "");
}

/** The numeric collision suffix `join.ts`'s pass 3 assigned (`preId-N`) — the
 * unsuffixed collision WINNER (and any `@legacy` id, which never itself
 * carries a `-N`) sorts as suffix 0, lower than every `-2`.."-N" sibling
 * (tie-break (b), "lowest collision suffix"). */
function collisionSuffixOf(id: string): number {
  const withoutLegacy = id.endsWith(LEGACY_SUFFIX) ? id.slice(0, -LEGACY_SUFFIX.length) : id;
  const match = TRAILING_SUFFIX_RE.exec(withoutLegacy);
  return match?.[1] !== undefined ? Number(match[1]) : 0;
}

/** Builds the same-base-slug family index over every FINAL kept
 * `class-feature` entity (D29-132) — the shape `buildCategoryOptions`'s own
 * `byCategory` enumeration already uses, one level up. Built once per
 * `augmentClassStats` call, shared across every class's grant resolution. */
function buildClassFeatureFamilies(
  classFeatureEntities: readonly CodexEntity[],
): ReadonlyMap<string, readonly CodexEntity[]> {
  const families = new Map<string, CodexEntity[]>();
  for (const e of classFeatureEntities) {
    const key = classFeatureBaseSlug(e.id);
    const arr = families.get(key) ?? [];
    arr.push(e);
    families.set(key, arr);
  }
  return families;
}

/** Plain text of a masthead line's `InlineNode[]` value — a small
 * self-contained duplicate rather than reaching into `domain/render`'s
 * `collectText` (`drop.ts`'s own file header states the same "no new
 * ingest -> domain coupling" posture for its crossref walker): masthead
 * lines are, by construction, text runs with the occasional crossref
 * (entity.ts's own `mastheadExtra` doc comment), so only those two kinds
 * matter here. */
function inlineText(value: readonly InlineNode[]): string {
  return value
    .map((n) => {
      switch (n.kind) {
        case "text":
          return n.content;
        case "crossref":
        case "brokenRef":
          return n.display;
        default:
          return "";
      }
    })
    .join("");
}

/** Rule (1): does `candidate`'s masthead "Class" label mention
 * `grantingClassName` (case-insensitive substring — review-verified moot on
 * the real corpus, since no class name is a substring of another and 0
 * class-feature docs masthead more than one class)? */
function mastheadNamesClass(candidate: CodexEntity, grantingClassName: string): boolean {
  const needle = grantingClassName.toLowerCase();
  return (candidate.mastheadExtra ?? []).some(
    (m) => m.label === "Class" && inlineText(m.value).toLowerCase().includes(needle),
  );
}

/** Ties within rule (1)/(2) — (a) edition match with the granting class
 * doc, then (b) lowest collision suffix (`collisionSuffixOf`). `candidates`
 * is always non-empty at the call site. */
function breakGrantTie(candidates: readonly CodexEntity[], grantingClass: CodexEntity): string {
  const editionMatched = candidates.filter((c) => c.edition === grantingClass.edition);
  const pool = editionMatched.length > 0 ? editionMatched : candidates;
  const winner = [...pool].sort((a, b) => collisionSuffixOf(a.id) - collisionSuffixOf(b.id))[0];
  // `pool` is derived from a non-empty `candidates`, so `[0]` always exists —
  // `noUncheckedIndexedAccess` still requires the runtime guard.
  if (winner === undefined) {
    throw new Error("augmentClassStats: unreachable — breakGrantTie called with 0 candidates");
  }
  return winner.id;
}

/** The D29-132 disambiguation cascade for a family of size >1 — rule (1)
 * masthead-Class-contains-name, else (2) `legacyOf` naming the granting
 * class's own `@legacy` id, else (3) a UNIQUE `level` match; no rule
 * resolving a single candidate (post tie-break) -> `null` (R3, never a
 * wrong-class card). */
function disambiguateGrantFamily(
  family: readonly CodexEntity[],
  grantLevel: number,
  grantingClass: CodexEntity,
): string | null {
  const rule1 = family.filter((c) => mastheadNamesClass(c, grantingClass.name));
  if (rule1.length > 0) return breakGrantTie(rule1, grantingClass);

  const legacyTarget = `class/${grantingClass.slug}${LEGACY_SUFFIX}`;
  const rule2 = family.filter((c) => c.legacyOf?.includes(legacyTarget) === true);
  if (rule2.length > 0) return breakGrantTie(rule2, grantingClass);

  const rule3 = family.filter((c) => c.level === grantLevel);
  if (rule3.length === 1) return rule3[0]?.id ?? null;

  return null;
}

function buildGrantedFeatures(
  raw: readonly RawGrantedFeatureEntry[] | undefined,
  grantingClass: CodexEntity,
  keptIds: ReadonlySet<string>,
  resolveUuid: (uuid: string) => UuidResolution,
  classFeatureFamilies: ReadonlyMap<string, readonly CodexEntity[]>,
): { grantedFeatures: GrantedFeature[]; resolved: number; unresolved: number } {
  let resolved = 0;
  let unresolved = 0;
  const features = (raw ?? []).map((g): GrantedFeature => {
    const resolution = resolveUuid(g.uuid);
    const preId = resolution.kind === "crossref" ? resolution.id : undefined;
    let targetId: string | null;
    if (preId === undefined) {
      targetId = null;
    } else {
      const family = classFeatureFamilies.get(classFeatureBaseSlug(preId)) ?? [];
      targetId =
        family.length <= 1
          ? keptIds.has(preId)
            ? preId
            : null
          : disambiguateGrantFamily(family, g.level, grantingClass);
    }
    if (targetId === null) unresolved++;
    else resolved++;
    return { level: g.level, name: g.name, targetId };
  });
  return { grantedFeatures: sortGrantedFeatures(features), resolved, unresolved };
}

/**
 * D29-115's current-edition union + legacy husks, for ONE mapped category.
 * STOP conditions (thrown — an unexplained delta here means the real
 * mechanism drifted from the spec's measured pins, per the P6/P10 rule):
 * the mapped category has zero entities in the kept corpus; a superseded
 * doc's `remasteredAs` has 0 or 2+ targets; a target isn't in the kept set;
 * a target lands outside BOTH `class-feature/` and the category's own
 * namespace.
 */
function buildCategoryOptions(
  classId: string,
  category: string,
  byId: ReadonlyMap<string, CodexEntity>,
  byCategory: ReadonlyMap<string, readonly CodexEntity[]>,
): SubclassOption[] {
  const categoryDocs = byCategory.get(category) ?? [];
  if (categoryDocs.length === 0) {
    throw new Error(
      `augmentClassStats: class "${classId}" maps to subclass category "${category}", which has zero entities in the final kept corpus`,
    );
  }

  const current = new Map<string, { targetId: string; name: string }>();
  const legacy: Array<{ targetId: string; name: string }> = [];

  for (const doc of categoryDocs) {
    const remasteredAs = doc.remasteredAs ?? [];
    if (remasteredAs.length === 0) {
      current.set(doc.id, { targetId: doc.id, name: doc.name });
      continue;
    }
    legacy.push({ targetId: doc.id, name: doc.name });
    if (remasteredAs.length !== 1) {
      throw new Error(
        `augmentClassStats: superseded subclass doc "${doc.id}" (category "${category}") has ${remasteredAs.length} remasteredAs targets, expected exactly 1`,
      );
    }
    const targetId = remasteredAs[0];
    if (targetId === undefined) {
      throw new Error(`augmentClassStats: unreachable — empty remasteredAs slot for "${doc.id}"`);
    }
    const target = byId.get(targetId);
    if (!target) {
      throw new Error(
        `augmentClassStats: subclass doc "${doc.id}" remasteredAs target "${targetId}" is not in the final kept set`,
      );
    }
    if (target.category !== "class-feature" && target.category !== category) {
      throw new Error(
        `augmentClassStats: subclass doc "${doc.id}" remasteredAs target "${targetId}" (category "${target.category}") is outside both class-feature/ and its own mapped category "${category}"`,
      );
    }
    current.set(targetId, { targetId, name: target.name });
  }

  const currentSorted = [...current.values()].sort((a, b) => codepointCompare(a.name, b.name));
  const legacySorted = [...legacy].sort((a, b) => codepointCompare(a.name, b.name));

  const options: SubclassOption[] = [];
  for (const c of currentSorted) {
    options.push({ category, targetId: c.targetId, name: c.name, superseded: false });
  }
  for (const l of legacySorted) {
    options.push({ category, targetId: l.targetId, name: l.name, superseded: true });
  }
  return options;
}

export function augmentClassStats(input: AugmentClassStatsInput): AugmentClassStatsResult {
  const { entities, classGrantedFeatures, resolveUuid, report } = input;

  const byId = new Map(entities.map((e) => [e.id, e] as const));
  const keptIds = new Set(byId.keys());
  const byCategory = new Map<string, CodexEntity[]>();
  for (const e of entities) {
    const arr = byCategory.get(e.category) ?? [];
    arr.push(e);
    byCategory.set(e.category, arr);
  }
  const classFeatureFamilies = buildClassFeatureFamilies(byCategory.get("class-feature") ?? []);

  let classStatsEmitted = 0;
  let grantedFeaturesResolved = 0;
  let grantedFeaturesUnresolved = 0;
  let subclassOptionsEmitted = 0;
  const claimedCategories = new Map<string, string>(); // category -> claiming classId
  const subclassOptionCounts: SubclassOptionCount[] = [];

  // A plain for-loop (not `.map()`) — the per-entity object literal below
  // needs an object SPREAD (`...entity`), which oxlint's `no-map-spread`
  // bans specifically inside a `.map()` callback (the `report.ts`
  // `toAonCitation` precedent: pull the per-item builder out of the call
  // expression entirely).
  const resultEntities: CodexEntity[] = [];
  for (const entity of entities) {
    if (entity.stats?.kind !== "class") {
      resultEntities.push(entity);
      continue;
    }
    classStatsEmitted++;

    const { grantedFeatures, resolved, unresolved } = buildGrantedFeatures(
      classGrantedFeatures.get(entity.id),
      entity,
      keptIds,
      resolveUuid,
      classFeatureFamilies,
    );
    grantedFeaturesResolved += resolved;
    grantedFeaturesUnresolved += unresolved;
    report("grantedFeaturesEmitted", `${entity.id}: ${resolved} resolved / ${unresolved} null`);

    const categories = SUBCLASS_CATEGORY_MAP.get(entity.slug);
    if (categories === undefined) {
      throw new Error(
        `augmentClassStats: no subclass-category mapping for class "${entity.id}" (slug "${entity.slug}") — extend SUBCLASS_CATEGORY_MAP`,
      );
    }

    const subclassOptions: SubclassOption[] = [];
    for (const category of categories) {
      const claimedBy = claimedCategories.get(category);
      if (claimedBy !== undefined && claimedBy !== entity.id) {
        throw new Error(
          `augmentClassStats: subclass category "${category}" is claimed by both "${claimedBy}" and "${entity.id}" — SUBCLASS_CATEGORY_MAP must map each category to exactly one class`,
        );
      }
      claimedCategories.set(category, entity.id);
      const options = buildCategoryOptions(entity.id, category, byId, byCategory);
      subclassOptions.push(...options);
      subclassOptionCounts.push({
        classId: entity.id,
        category,
        current: options.filter((o) => !o.superseded).length,
        legacy: options.filter((o) => o.superseded).length,
      });
    }
    subclassOptionsEmitted += subclassOptions.length;

    resultEntities.push({
      ...entity,
      stats: {
        ...entity.stats,
        ...(grantedFeatures.length > 0 ? { grantedFeatures } : {}),
        ...(subclassOptions.length > 0 ? { subclassOptions } : {}),
      },
    });
  }

  return {
    entities: resultEntities,
    classStatsEmitted,
    grantedFeaturesResolved,
    grantedFeaturesUnresolved,
    subclassOptionsEmitted,
    subclassOptionCounts: subclassOptionCounts.sort(
      (a, b) => codepointCompare(a.classId, b.classId) || codepointCompare(a.category, b.category),
    ),
  };
}
