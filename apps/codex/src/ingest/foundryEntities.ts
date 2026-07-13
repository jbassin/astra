import { mapCategory } from "../../scripts/categoryMap";
import type { CodexEntity, EmbeddedItem, Facets, Source } from "../schema/entity";
import type { BlockNode } from "../schema/nodes";
import type { EnricherContext } from "./enrichers";
import { parseFoundryHtml } from "./foundryHtml";
import { sluggify } from "./sluggify";

/**
 * Foundry pack doc → `CodexEntity` (D29-1/-3/-7/-8/-13, spec §2/§3, Deliverable
 * 3). One call per non-excluded Item/Actor pack doc — the caller (`parse-
 * foundry.ts`) walks packs via `categoryMap.ts` + `uuidResolve.ts`'s pack
 * registry and hands each doc here with a ready-made `EnricherContext` (its
 * `resolveUuid` already bound to THIS doc as the "containing document" for
 * relative `@UUID[.<id>]` resolution, D29-6).
 *
 * S2 scope note (no legacy-suffix / no join): identity here is always the
 * plain `{category}/{slug}` form — D29-1's `@legacy` suffixing requires
 * knowing which same-slug pairs are true remaster/legacy PAIRS (vs. unrelated
 * collisions), which needs the AoN side (`remaster_id`/`legacy_id`) that
 * doesn't exist until S3/S4. Same-slug collisions found here are collected +
 * reported (see `report("slugCollision", ...)`), not resolved — S4's
 * worklist, per the assignment brief.
 */

// ---------------------------------------------------------------------------
// raw Foundry doc shapes (structural subsets — never leaked past this module)
// ---------------------------------------------------------------------------

interface RawPublication {
  license?: string;
  remaster?: boolean;
  title?: string;
}

interface RawTraits {
  value?: string[];
  rarity?: string;
  size?: { value?: string };
  traditions?: string[];
}

interface RawSystem {
  description?: { value?: string };
  publication?: RawPublication;
  details?: {
    publication?: RawPublication;
    level?: { value?: number };
  };
  traits?: RawTraits;
  attributes?: {
    hp?: { max?: number };
    ac?: { value?: number };
  };
  saves?: {
    fortitude?: { value?: number };
    reflex?: { value?: number };
    will?: { value?: number };
  };
  perception?: { mod?: number };
  level?: { value?: number };
  actionType?: { value?: string };
  actions?: { value?: number | null };
  prerequisites?: { value?: Array<{ value?: string }> };
  price?: { value?: Record<string, number>; per?: number };
  bulk?: { value?: number };
  usage?: { value?: string };
  category?: string;
  time?: { value?: string };
  range?: { value?: string };
  area?: { type?: string; value?: number };
  duration?: { value?: string; sustained?: boolean };
  defense?: { save?: { basic?: boolean; statistic?: string } };
}

export interface RawFoundryDoc {
  _id: string;
  name: string;
  type?: string;
  system?: RawSystem;
  items?: RawFoundryDoc[];
}

export type ReportFn = (cls: string, detail: string) => void;

// ---------------------------------------------------------------------------
// source/edition (D29-13)
// ---------------------------------------------------------------------------

/** Actors carry publication at `system.details.publication`; every other
 * Item-shaped doc carries it at `system.publication` (D29-13, verified on
 * Balor vs. Fireball/weapons/feats/etc). */
function readPublication(
  system: RawSystem | undefined,
  docClass: "Actor" | "Item",
): RawPublication | undefined {
  return docClass === "Actor" ? system?.details?.publication : system?.publication;
}

/**
 * D29-13: `source.license` + `edition` from the doc's own publication data.
 * Missing publication (163 real docs — Kingmaker armies, iconics, pregens,
 * verified) or a license value outside ORC/OGL resolves `"unknown"`
 * (report-counted, per spec allowed as residue reviewed at S4). `remaster`
 * absent OR `false` both read as `edition: "legacy"` — a doc with genuinely no
 * publication metadata has no signal either way, so defaulting to the more
 * conservative (non-remaster) edition is the documented S2 choice, distinct
 * from the `missingPublication` report class that already flags it for
 * review.
 */
function deriveSourceAndEdition(
  publication: RawPublication | undefined,
  report: ReportFn,
): { source: Source; edition: "remaster" | "legacy" } {
  if (!publication) {
    report("missingPublication", "(no system.publication / system.details.publication)");
    return { source: { book: "unknown", license: "unknown" }, edition: "legacy" };
  }
  const license =
    publication.license === "ORC" || publication.license === "OGL"
      ? publication.license
      : "unknown";
  if (license === "unknown") report("unknownLicense", publication.license ?? "(none)");
  const book = publication.title && publication.title.length > 0 ? publication.title : "unknown";
  return {
    source: { book, license },
    edition: publication.remaster === true ? "remaster" : "legacy",
  };
}

// ---------------------------------------------------------------------------
// facets (field-presence-driven, not category-gated — every field below is
// optional in FacetsSchema, and reading a field that happens not to exist for
// a given category is harmless; this avoids a second, redundant category
// dispatch alongside categoryMap.ts's, per the deliverable's "facets per
// entity.ts's typed sets" brief)
// ---------------------------------------------------------------------------

const DENOM_ORDER = ["pp", "gp", "sp", "cp"] as const;

function formatPrice(price: RawSystem["price"]): string | undefined {
  if (!price?.value) return undefined;
  const parts = DENOM_ORDER.filter((d) => price.value?.[d]).map((d) => `${price.value?.[d]} ${d}`);
  if (parts.length === 0) return undefined;
  const base = parts.join(", ");
  return price.per !== undefined && price.per !== 1 ? `${base} per ${price.per}` : base;
}

function formatArea(area: RawSystem["area"]): string | undefined {
  if (!area?.type || area.value === undefined) return undefined;
  return `${area.value}-foot ${area.type}`;
}

function formatDuration(duration: RawSystem["duration"]): string | undefined {
  if (duration?.sustained) return duration.value ? `sustained (${duration.value})` : "sustained";
  return duration?.value && duration.value.length > 0 ? duration.value : undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDefense(defense: RawSystem["defense"]): string | undefined {
  const statistic = defense?.save?.statistic;
  if (!statistic) return undefined;
  return defense.save?.basic ? `basic ${capitalize(statistic)}` : capitalize(statistic);
}

/** `system.actionType.value` ("action"/"reaction"/"free"/"passive") +
 * `system.actions.value` (1/2/3, only meaningful when actionType is "action")
 * → the display action-cost token entity.ts's `actionCost` field expects. */
function extractActionCost(system: RawSystem | undefined): string | undefined {
  const actionType = system?.actionType?.value;
  if (!actionType) return undefined;
  if (actionType === "action") {
    const n = system?.actions?.value;
    return n === null || n === undefined ? undefined : String(n);
  }
  return actionType;
}

/**
 * S4 emit-gate finding (real corpus, not caught by any S2/S3 unit fixture): a
 * real minority of docs carry an explicit JSON `null` for a field this module
 * otherwise treats as "absent" (`system.category`, `system.attributes.ac.value`,
 * a hazard's AC, ...) — a bare `!== undefined` check let those literal
 * `null`s through into a non-nullable-typed `Facets` field, failing
 * `CodexEntitySchema.parse` at emit time (acceptance C's 100%-Zod-valid gate
 * is the FIRST real runtime validation of a full `CodexEntity`, so this is
 * exactly the kind of drift it exists to catch). A type-guard narrows the
 * same optional-chain expression the same way `!== undefined` did, so every
 * call site below is a mechanical swap, not a logic change. */
function present<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

function extractFacets(system: RawSystem | undefined): Facets {
  const facets: Facets = {};

  // creature (Actor)
  if (present(system?.attributes?.hp?.max)) facets.hp = system.attributes.hp.max;
  if (present(system?.attributes?.ac?.value)) facets.ac = system.attributes.ac.value;
  if (present(system?.saves?.fortitude?.value)) facets.fortitudeSave = system.saves.fortitude.value;
  if (present(system?.saves?.reflex?.value)) facets.reflexSave = system.saves.reflex.value;
  if (present(system?.saves?.will?.value)) facets.willSave = system.saves.will.value;
  if (present(system?.perception?.mod)) facets.perception = system.perception.mod;
  if (present(system?.traits?.size?.value)) facets.size = system.traits.size.value;

  // spell
  if (present(system?.level?.value)) facets.rank = system.level.value;
  if (present(system?.traits?.traditions)) facets.traditions = system.traits.traditions;
  if (present(system?.time?.value)) facets.castTime = system.time.value;
  if (present(system?.range?.value)) facets.range = system.range.value;
  const area = formatArea(system?.area);
  if (area !== undefined) facets.area = area;
  const duration = formatDuration(system?.duration);
  if (duration !== undefined) facets.duration = duration;
  const defense = formatDefense(system?.defense);
  if (defense !== undefined) facets.defense = defense;

  // equipment family
  const price = formatPrice(system?.price);
  if (price !== undefined) facets.price = price;
  if (present(system?.bulk?.value)) facets.bulk = system.bulk.value;
  if (present(system?.usage?.value)) facets.usage = system.usage.value;
  if (present(system?.category)) facets.itemCategory = system.category;

  // feat
  if (present(system?.level?.value)) facets.featLevel = system.level.value;
  if (present(system?.prerequisites?.value)) {
    facets.prerequisites = system.prerequisites.value
      .map((p) => p.value)
      .filter((v): v is string => v !== undefined);
  }
  const actionCost = extractActionCost(system);
  if (actionCost !== undefined) facets.actionCost = actionCost;

  return facets;
}

// ---------------------------------------------------------------------------
// embedded items (S2 widening, entity.ts's EmbeddedItemSchema)
// ---------------------------------------------------------------------------

function assembleEmbeddedItem(item: RawFoundryDoc, ctx: EnricherContext): EmbeddedItem {
  const html = item.system?.description?.value ?? "";
  const body: BlockNode[] = html.length > 0 ? parseFoundryHtml(html, ctx) : [];
  const level = item.system?.level?.value;
  const actionCost = extractActionCost(item.system);
  return {
    name: item.name,
    slug: sluggify(item.name),
    type: item.type ?? "unknown",
    ...(present(level) ? { level } : {}),
    ...(actionCost !== undefined ? { actionCost } : {}),
    traits: item.system?.traits?.value ?? [],
    body,
  };
}

// ---------------------------------------------------------------------------
// the assembly entry point
// ---------------------------------------------------------------------------

export interface AssembleFoundryEntityParams {
  packDir: string;
  docClass: "Actor" | "Item";
  /** The pack file's own basename (no `.json`) — D29-1's identity source; also
   * checked against `sluggify(doc.name)` (report class `slugMismatch` on
   * disagreement — verified 0/28,636 in the real snapshot, so this should
   * never fire on real data). */
  basename: string;
  doc: RawFoundryDoc;
  ctx: EnricherContext;
  report: ReportFn;
  /** Every codex id assigned SO FAR in this run, `id → true` — used only to
   * detect + report same-slug collisions (S4's worklist, not resolved here).
   * Mutated in place (the caller owns one shared set across the whole walk). */
  seenIds: Set<string>;
}

/**
 * Assembles one non-excluded Item/Actor pack doc into a `CodexEntity`.
 * Returns `undefined` when `categoryMap.ts` says this (pack,type) pair is
 * excluded (D29-8) — the caller should simply skip it (still present in the
 * uuid index as an `excluded` target via `uuidResolve.ts`, independent of this
 * function).
 */
export function assembleFoundryEntity(
  params: AssembleFoundryEntityParams,
): CodexEntity | undefined {
  const { packDir, docClass, basename, doc, ctx, report, seenIds } = params;
  const decision = mapCategory(packDir, doc.type ?? "__NO_TYPE__");
  if (decision.kind === "excluded") return undefined;

  const expectedSlug = sluggify(doc.name);
  if (expectedSlug !== basename) {
    report(
      "slugMismatch",
      `${packDir}/${basename}.json: sluggify("${doc.name}") = "${expectedSlug}"`,
    );
  }
  const slug = basename;
  const id = `${decision.category}/${slug}`;
  if (seenIds.has(id)) {
    report("slugCollision", id);
  } else {
    seenIds.add(id);
  }

  const publication = readPublication(doc.system, docClass);
  const { source, edition } = deriveSourceAndEdition(publication, report);

  const level = docClass === "Actor" ? doc.system?.details?.level?.value : doc.system?.level?.value;

  const html = doc.system?.description?.value ?? "";
  const body: BlockNode[] = html.length > 0 ? parseFoundryHtml(html, ctx) : [];

  const embeddedItems =
    doc.items && doc.items.length > 0
      ? doc.items.map((item) => assembleEmbeddedItem(item, ctx))
      : undefined;

  return {
    id,
    slug,
    category: decision.category,
    name: doc.name,
    edition,
    source,
    ...(present(level) ? { level } : {}),
    traits: doc.system?.traits?.value ?? [],
    ...(present(doc.system?.traits?.rarity) ? { rarity: doc.system.traits.rarity } : {}),
    body,
    facets: extractFacets(doc.system),
    ...(embeddedItems !== undefined ? { embeddedItems } : {}),
  };
}
