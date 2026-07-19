import { z } from "zod";

import { REMASTER_CUTOVER_DATE, licenseForBook, normalizeBookName } from "../../scripts/licenseMap";
import { EditionSchema, LicenseSchema } from "../schema/entity";
import type { Edition } from "../schema/entity";
import { sluggify } from "./sluggify";

/**
 * AoN doc → `AonDocMeta` field extraction (D29-3/-7/-13, spec §2/§3,
 * Deliverable 3). One call per AoN ES hit across all 93 categories (C-5) —
 * the typed precursor row S4's `join.ts` consumes to build the final
 * `CodexEntity`/`Facets` (this module does NOT build `Facets` itself: field
 * OWNERSHIP between Foundry and AoN is a join-time decision, D29-7, out of
 * S3's scope).
 *
 * ## Field survey (verified against the real `2026-07-13` AoN snapshot, all
 * 93 category files, 43,684 docs)
 *
 * Every doc, regardless of category, carries `id`/`category`/`name`/`url`/
 * `markdown`/`rarity`/`primary_source`/`primary_source_raw`/`release_date` —
 * verified universal (0 missing across all 93 files' first-doc samples;
 * `url`/`release_date` verified non-empty across ALL 43,684 docs; `name` is
 * present on all but EMPTY on exactly 53 — the fragment class `aonSkipReason`
 * below identifies and the caller skips, verified by the full-snapshot
 * smoke). Category-varying fields, always the SAME name where present
 * (never a synonym): `trait` (creature/spell/feat/... — `string[]`, absent
 * entirely for prose-shaped categories like `background`/`article`/`sidebar`/
 * `rules`/`source`), `level` (`number`, spell rank / creature level / feat
 * level — absent for e.g. `archetype`), `breadcrumbs` (`string[]`, ONLY on
 * `rules` docs — the P4 rules-tree input), `remaster_id`/`legacy_id`
 * (`string[]` of AoN doc ids, verified ALWAYS an array when present across
 * every occurrence in the real snapshot — never a bare scalar — but
 * `normalizeIdList` below still defensively accepts a scalar in case a future
 * refresh regresses this).
 *
 * ## The `source`/`source_raw` multi-citation gotcha
 *
 * `source`/`source_raw` are PARALLEL arrays (verified: length always equal
 * across all 43,684 docs) that can hold >1 entry (up to 4, verified) for
 * reprinted content (e.g. an archetype printed in both an AP and a later
 * hardcover) — `primary_source`/`primary_source_raw` is just the FIRST/
 * canonical one. `CodexEntity.source` (entity.ts) only has room for one
 * book/page, so this module keeps BOTH: `primarySource` (what becomes
 * `Source.book`/`page` at join time) and the full `allSources` list
 * (preserved for a future citation-list feature — not lost, per spec's "don't
 * quietly collapse scope").
 *
 * ## Page parsing
 *
 * `primary_source_raw`/each `source_raw[i]` is `"{book} pg. {n}"`, or just
 * `"{book}"` when the doc has no page (378 of 43,684 real docs, verified —
 * always a bare integer after "pg. ", never a range/list). Rather than split
 * book-vs-page out of the SAME raw string (ambiguous if a title ever
 * contained "pg."), this module trusts the dedicated `primary_source`/
 * `source[i]` field for the book name and only mines `_raw` for the trailing
 * page digits.
 *
 * ## The CRLF book-name gotcha (shared with `licenseMap.ts`)
 *
 * 476 real docs carry a `primary_source` with trailing CRLF garbage (e.g.
 * `"Draconic Codex\r\n"` alongside 315 clean `"Draconic Codex"` docs for the
 * exact same book) — `normalizeBookName` (licenseMap.ts) cleans this before
 * the book name lands in `primarySource.book`/`allSources[].book`, so a
 * downstream citation never renders the garbage and the license lookup
 * always hits.
 *
 * ## Edition derivation for AoN docs (a considered interpretation, not
 * spec-dictated verbatim — Foundry's own `remaster` boolean has no AoN
 * equivalent)
 *
 * `remaster_id` non-empty → this doc IS the remaster half (points BACK at its
 * legacy predecessor's id) → `edition: "remaster"`. `legacy_id` non-empty →
 * this doc IS the legacy half → `edition: "legacy"` (verified against the
 * real Heal/Magic-Missile/Force-Barrage pairs: `spell-148` "Heal" carries
 * `remaster_id: ["spell-1554"]` and IS the legacy doc; `spell-1554` "Heal"
 * carries `legacy_id: ["spell-148"]` and IS the remaster doc). For the
 * majority of docs with NEITHER array populated (no remaster/legacy pairing
 * exists at all), this module falls back to the same `release_date >=
 * REMASTER_CUTOVER_DATE` signal `licenseMap.ts` uses for licensing — every
 * AoN doc carries a `release_date` (0 missing, verified), so this is a
 * fully-informed default, unlike `foundryEntities.ts`'s `edition: "legacy"`
 * fallback (which exists there only because Foundry's publication data can
 * be entirely ABSENT with no signal at all).
 */

// ---------------------------------------------------------------------------
// raw doc shape (structural, defensive reads only — never leaked past this
// module as a type; every field is read through a typed helper below)
// ---------------------------------------------------------------------------

export interface AonHit {
  readonly _id: string;
  readonly _source: Readonly<Record<string, unknown>>;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** P4 (D29-39): a `next_link`/`previous_link` raw field is `{label, url}` or
 * absent — this module only needs the `url` (the sibling-chain edge target;
 * `label` is display text `join.ts`/the P4 tree builder never needs). */
function readLinkUrl(v: unknown): string | undefined {
  if (v === null || typeof v !== "object") return undefined;
  const url = (v as Record<string, unknown>).url;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

/** P4 (D29-39, spec §1 "data wart"): 192 real GMG "Chapter 2: Tools" child
 * breadcrumb elements (plus 47 "Building Creatures" ones, 239 dirty elements
 * total repo-wide) carry embedded `\r`/`\n`/`\t` garbage — an ES indexing
 * artifact, the same disease `licenseMap.ts`'s `normalizeBookName` already
 * fixes for `primary_source`. Strips those three control characters entirely
 * (not just CRLF — spec explicitly calls out tab too), then collapses any
 * remaining internal whitespace run to a single space and trims. Applied to
 * EVERY breadcrumb element before it's stored, so the corpus only ever holds
 * normalized strings — the tree builder never re-normalizes. */
export function normalizeBreadcrumbElement(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Defensive normalization for `remaster_id`/`legacy_id`: verified always an
 * array-or-absent across the real snapshot, but accepts a bare scalar too in
 * case a future refresh regresses this (D29-1's own "may be scalar-or-array"
 * caution). */
function normalizeIdList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}

const PAGE_RE = /pg\.\s*(?<page>\d+)\s*$/;

/** Mines the trailing page NUMBER off a `*_raw` citation string (`"Book pg.
 * 26"` → `26`); returns `undefined` when the raw string carries no page
 * (378 real docs) or is itself absent. */
function parsePage(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[\r\n]+/g, "").trim();
  const match = PAGE_RE.exec(cleaned);
  const page = match?.groups?.page;
  return page !== undefined ? Number(page) : undefined;
}

/** Builds one `SourceCitation` from a raw (possibly CRLF-dirty) book name +
 * its paired `*_raw` string — shared by `primarySource` and every
 * `allSources[]` entry. A plain function (not inlined in `.map()`) so no
 * object-spread appears inside a map callback. */
function makeCitation(rawBook: string, rawPage: string | undefined): SourceCitation {
  const page = parsePage(rawPage);
  return page !== undefined
    ? { book: normalizeBookName(rawBook), page }
    : { book: normalizeBookName(rawBook) };
}

// ---------------------------------------------------------------------------
// AonDocMeta schema + type
// ---------------------------------------------------------------------------

const SourceCitationSchema = z
  .object({
    book: z.string().min(1),
    page: z.number().int().positive().optional(),
  })
  .strict();
export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const AonDocMetaSchema = z
  .object({
    /** The raw AoN `_id` (e.g. `"spell-180"`) — kept because `remasterId`/
     * `legacyId` are arrays of OTHER docs' `aonId`s; S4's join needs an
     * aonId → codexId map to resolve them, which this module doesn't build
     * (out of S3 scope, needs the full corpus assembled first). */
    aonId: z.string().min(1),
    category: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    /** The doc's own site-relative `url` field — becomes `CodexEntity.aonUrl`
     * verbatim at join time, and is also `aonLinkTable.ts`'s indexing key. */
    aonUrl: z.string().min(1),
    level: z.number().optional(),
    traits: z.array(z.string()),
    rarity: z.string().optional(),
    primarySource: SourceCitationSchema,
    /** Every `source`/`source_raw` citation, in AoN's own order (index 0 is
     * always the same book as `primarySource`) — length ≥ 1 always. */
    allSources: z.array(SourceCitationSchema).min(1),
    license: LicenseSchema,
    edition: EditionSchema,
    /** Raw AoN doc ids (NOT yet codex ids) this doc's remaster half(es)
     * point at — empty when unpaired. */
    remasterId: z.array(z.string()),
    /** Raw AoN doc ids (NOT yet codex ids) this doc's legacy half(es) point
     * at — empty when unpaired. */
    legacyId: z.array(z.string()),
    /** `rules`-category only (the P4 tree input) — absent for every other
     * category, never an empty array (same convention as `CodexEntity`'s
     * `loreBody`/`proseOnly`). Every element is already normalized
     * (`normalizeBreadcrumbElement`, above) at extraction time. */
    breadcrumbs: z.array(z.string()).min(1).optional(),
    /** P4 (D29-39): the raw AoN `next_link`/`previous_link.url` — per-level
     * SIBLING chain edges (adversarial B1, NOT page-turn order), consumed
     * transform-internally only by the P4 rules-tree builder to order a
     * sibling group; never stored on `CodexEntity` (no `readingOrder`
     * field). Present whenever the raw doc carries the link (3,642/3,645
     * real rules docs carry `next_link`, same count minus 3 for `prev`). */
    nextUrl: z.string().min(1).optional(),
    prevUrl: z.string().min(1).optional(),
    /** P4 (D29-39, D29-43): raw AoN `primary_source_category` (e.g.
     * "Rulebooks", "Lost Omens", "Adventure Paths") — the `/sources`
     * product-line signal, present on 43,684/43,684 real AoN docs. Consumed
     * only by the sources-index builder (book-level aggregate), never
     * stored on `CodexEntity` itself. */
    productLine: z.string().min(1).optional(),
    hasMarkdown: z.boolean(),
    /** D29-33b (P3 S1): `creature`-category only — the display text mined
     * out of `creature_family_markdown`'s `"[Name](/MonsterFamilies.aspx?ID=…)"`
     * markdown-link form (verified: all 2,672 non-empty real occurrences
     * match this exact shape). `join.ts` populates `CodexEntity.facets.family`
     * from this at merge/AoN-only-build time; absent for every other
     * category and for the ~43% of creature docs with an empty
     * `creature_family_markdown` (no family grouping at all — a real,
     * measured gap, not an extraction miss). */
    family: z.string().min(1).optional(),
    /** D29-60 (R8, P6): `equipment`-category only — AoN's raw
     * `item_category`/`item_subcategory` (verified: 36/75 distinct real
     * values respectively on the `equipment` category file, incl. 323
     * `"Runes"`-tagged items). Gated to `equipment` the same way `family` is
     * gated to `creature` — the SAME two fields are trivial, zero-
     * information constants on the `weapon`/`armor`/`shield` category files
     * ("Weapons"/"Base Weapons", "Armor"/"Base Armor", "Shields"/"Base
     * Shields" on 100% of those hits, verified) and extracting them there
     * would just be dead weight; `join.ts`'s `mergeJoined`/
     * `buildAonOnlyEntity` fill `CodexEntity.facets.itemCategory`/
     * `itemSubcategory` from these ONLY when Foundry's own `system.category`
     * produced no value (D29-60's Foundry-wins-mechanics correction). */
    itemCategory: z.string().min(1).optional(),
    itemSubcategory: z.string().min(1).optional(),
  })
  .strict();
export type AonDocMeta = z.infer<typeof AonDocMetaSchema>;

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

/** Thrown for a doc missing a field this module treats as non-negotiable
 * (`name`/`url`/`release_date`/`primary_source` — universal across the real
 * snapshot EXCEPT the 53 empty-name fragments `aonSkipReason` identifies
 * below, so a miss on a doc the caller didn't pre-skip is corpus drift, not
 * expected residue) — carries the doc id so the caller (a future
 * `transform.ts`/dev-sweep) can report it precisely, matching
 * `CategoryMapError`/`EnricherGrammarError`'s "hard-fail loudly, never guess"
 * posture (D29-6). */
export class AonFacetError extends Error {
  readonly docId: string;

  constructor(docId: string, message: string) {
    super(message);
    this.name = "AonFacetError";
    this.docId = docId;
  }
}

function required(docId: string, field: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new AonFacetError(docId, `AoN doc "${docId}" is missing required field "${field}"`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// D29-99: AoN name-template resolution
// ---------------------------------------------------------------------------

export type ReportFn = (cls: string, detail: string) => void;

const TRAITS_GLYPH_RE = /<%TRAITS%\d+%%>([\s\S]*?)<%END>/g;
const ACTION_TYPES_GLYPH_RE = /<%ACTION\.TYPES#(\d+)%%>/g;

/** The pinned `<%ACTION.TYPES#N%%>` -> action-cost-phrase table (D29-99) — NO
 * repo mapping source exists for this glyph (the census stores only
 * already-resolved verbatim strings), and a naive `#N -> "N Actions"` guess
 * is off-by-one on every one of the 9 real docs that carry the glyph (AoN's
 * own id space is shifted). Derived instead from those same 9 docs' own
 * pre-resolved `markdown` field. */
const ACTION_TYPES_LABELS: ReadonlyMap<number, string> = new Map([
  [2, "Single Action"],
  [3, "Two Actions"],
  [4, "Three Actions"],
]);

/** Resolves AoN's raw glyph-template forms in a doc's `name` (D29-99,
 * `aonFacets.ts:362`'s own seam) — called BEFORE `required()` so a
 * template-only name still counts as present. `<%TRAITS%N%%>display<%END>`
 * is a trait-linked span (the numeric N is an AoN-internal trait id,
 * irrelevant here — only the `display` text between the tags survives);
 * `<%ACTION.TYPES#N%%>` is an action-cost phrase, resolved via the pinned
 * table above. Verified: across the full 43,684-doc snapshot, both glyph
 * forms appear ONLY on `action`-category docs, never a third template form.
 * Report-counts `nameTemplateResolved` exactly once per doc whose raw name
 * actually contained a glyph (never double-counts a doc carrying both glyph
 * kinds) — the report is the caller's audit trail for the D29-99 pin
 * (exactly 12 real docs). A raw name with NO glyph is returned unchanged,
 * report untouched. */
function resolveNameTemplates(raw: string, docId: string, report: ReportFn): string {
  TRAITS_GLYPH_RE.lastIndex = 0;
  ACTION_TYPES_GLYPH_RE.lastIndex = 0;
  const hadTemplate = TRAITS_GLYPH_RE.test(raw) || ACTION_TYPES_GLYPH_RE.test(raw);
  TRAITS_GLYPH_RE.lastIndex = 0;
  ACTION_TYPES_GLYPH_RE.lastIndex = 0;
  if (!hadTemplate) return raw;

  let resolved = raw.replace(TRAITS_GLYPH_RE, (_match, display: string) => display);
  resolved = resolved.replace(ACTION_TYPES_GLYPH_RE, (_match, numStr: string) => {
    const label = ACTION_TYPES_LABELS.get(Number(numStr));
    if (label === undefined) {
      throw new AonFacetError(
        docId,
        `unknown <%ACTION.TYPES#${numStr}%%> id in name template (no pinned label)`,
      );
    }
    return label;
  });
  report("nameTemplateResolved", `${docId}: "${raw}" -> "${resolved}"`);
  return resolved;
}

// ---------------------------------------------------------------------------
// pre-extraction skip predicate
// ---------------------------------------------------------------------------

/**
 * The one verified, by-design skip class: exactly 53 of the real snapshot's
 * 43,684 docs (52 `action` + 1 `sidebar`) carry `name: ""` — item/creature
 * activation-effect FRAGMENTS ("**Activate** ... **Effect** ..." markdown
 * with no title of their own; 51 of the 53 are marked
 * `exclude_from_search: true` by AoN itself). A nameless doc can't be a codex
 * entity at all (`slug = sluggify(name)` would be empty, D29-1), so the
 * caller skips + report-counts these BEFORE `extractAonMeta` (suggested
 * report class: `aonNamelessFragment`). Kept as a separate predicate — NOT a
 * silent skip inside `extractAonMeta` — so the skip is always a visible,
 * counted decision, and a doc that reaches extraction nameless still
 * hard-fails as genuine drift.
 */
export function aonSkipReason(hit: AonHit): string | undefined {
  const name = readString(hit._source.name);
  if (name === undefined || name.trim() === "") return "aonNamelessFragment";
  return undefined;
}

// ---------------------------------------------------------------------------
// edition derivation
// ---------------------------------------------------------------------------

function deriveEdition(remasterId: string[], legacyId: string[], releaseDate: string): Edition {
  if (legacyId.length > 0) return "remaster";
  if (remasterId.length > 0) return "legacy";
  return releaseDate >= REMASTER_CUTOVER_DATE ? "remaster" : "legacy";
}

// ---------------------------------------------------------------------------
// D29-33b: creature family (from `creature_family_markdown`)
// ---------------------------------------------------------------------------

const FAMILY_MARKDOWN_RE = /^\[([^[\]]+)\]\([^()]+\)$/;

/**
 * `creature`-category only — mines the display text out of AoN's
 * `"[Name](/MonsterFamilies.aspx?ID=…)"` markdown-link field. Fails SOFT
 * (returns `undefined`) rather than hard-failing the whole doc on a
 * malformed value — this is a presentation/navigational facet, not
 * load-bearing identity data, matching `foundryEntities.ts`'s
 * `formatPrice`/`formatArea`-style facet helpers rather than the body-parse
 * hard-fail posture (D29-6/the README's "what a hard-fail means").
 */
function extractFamily(category: string, raw: unknown): string | undefined {
  if (category !== "creature") return undefined;
  const markdown = readString(raw);
  if (markdown === undefined || markdown.trim().length === 0) return undefined;
  const match = FAMILY_MARKDOWN_RE.exec(markdown.trim());
  return match?.[1];
}

// ---------------------------------------------------------------------------
// D29-60 (R8, P6): equipment item_category/item_subcategory
// ---------------------------------------------------------------------------

/** `equipment`-category only — see the `AonDocMeta.itemCategory` field's own
 * doc comment for why `weapon`/`armor`/`shield` are deliberately excluded
 * (their own `item_category`/`item_subcategory` are trivial constants). */
function extractItemCategory(category: string, raw: unknown): string | undefined {
  if (category !== "equipment") return undefined;
  return readString(raw);
}

// ---------------------------------------------------------------------------
// extraction
// ---------------------------------------------------------------------------

/**
 * Pure: extracts + validates one AoN ES hit into an `AonDocMeta`. Throws
 * `AonFacetError` for a doc missing `name`/`url`/`release_date`/
 * `primary_source` (verified universal — a miss is drift, not residue).
 *
 * `report` is optional (defaults to a no-op) — only the real transform run
 * and any test specifically exercising D29-99 need to observe the
 * `nameTemplateResolved` counter; the ~40 pre-existing call sites across this
 * module's own test file and `join.test.ts` construct fixtures that never
 * carry a glyph-template name, so they're left unchanged (an explicit
 * `ReportFn` at every one of those call sites would be pure churn with no
 * behavioral value — a deliberate, minimal-footprint deviation from the
 * rest of this pipeline's "report is always threaded explicitly" convention,
 * recorded here rather than silently done).
 */
export function extractAonMeta(
  category: string,
  hit: AonHit,
  report: ReportFn = () => {},
): AonDocMeta {
  const src = hit._source;
  const rawName = required(hit._id, "name", readString(src.name));
  const name = resolveNameTemplates(rawName, hit._id, report);
  const url = required(hit._id, "url", readString(src.url));
  const releaseDate = required(hit._id, "release_date", readString(src.release_date));
  const primaryBookRaw = required(hit._id, "primary_source", readString(src.primary_source));

  const primaryBook = normalizeBookName(primaryBookRaw);
  const primarySource = makeCitation(primaryBookRaw, readString(src.primary_source_raw));

  const sourceBooks = readStringArray(src.source);
  const sourceRaws = readStringArray(src.source_raw);
  const allSources: SourceCitation[] =
    sourceBooks.length > 0
      ? sourceBooks.map((book, i) => makeCitation(book, sourceRaws[i]))
      : [primarySource];

  const remasterId = normalizeIdList(src.remaster_id);
  const legacyId = normalizeIdList(src.legacy_id);
  const breadcrumbs = readStringArray(src.breadcrumbs).map(normalizeBreadcrumbElement);
  const level = readNumber(src.level);
  const rarity = readString(src.rarity);
  const markdown = readString(src.markdown);
  const family = extractFamily(category, src.creature_family_markdown);
  const itemCategory = extractItemCategory(category, src.item_category);
  const itemSubcategory = extractItemCategory(category, src.item_subcategory);
  const nextUrl = readLinkUrl(src.next_link);
  const prevUrl = readLinkUrl(src.previous_link);
  const productLine = readString(src.primary_source_category);

  const meta: AonDocMeta = {
    aonId: hit._id,
    category,
    name,
    slug: sluggify(name),
    aonUrl: url,
    traits: readStringArray(src.trait),
    primarySource,
    allSources,
    license: licenseForBook(primaryBook),
    edition: deriveEdition(remasterId, legacyId, releaseDate),
    remasterId,
    legacyId,
    hasMarkdown: markdown !== undefined && markdown.trim().length > 0,
    ...(level !== undefined ? { level } : {}),
    ...(rarity !== undefined ? { rarity } : {}),
    ...(breadcrumbs.length > 0 ? { breadcrumbs } : {}),
    ...(family !== undefined ? { family } : {}),
    ...(itemCategory !== undefined ? { itemCategory } : {}),
    ...(itemSubcategory !== undefined ? { itemSubcategory } : {}),
    ...(nextUrl !== undefined ? { nextUrl } : {}),
    ...(prevUrl !== undefined ? { prevUrl } : {}),
    ...(productLine !== undefined ? { productLine } : {}),
  };

  return AonDocMetaSchema.parse(meta);
}
