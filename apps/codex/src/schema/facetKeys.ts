import type { Facets } from "./entity";

/**
 * D29-32/-33 (P3 S1, adversarial B3): the per-category facet-KEY allowlist —
 * keys into `entity.facets` ONLY. The core row fields (`level`/`rarity`/
 * `traits`/`source`/`edition`) are already top-level `IndexRow` fields and
 * never appear here — this module is exclusively about which of `Facets`'s
 * named fields are worth exposing as a FILTER for a given category.
 *
 * Owned by S1 (this slice) so `emit.ts` can trim `IndexRow.facets` at write
 * time; imported UNCHANGED by S3's `src/domain/browse/facetDefs.ts` (the UI
 * metadata layer — widget/labelMap/parse per key) — a conformance test there
 * asserts `facetDefs` keys == `facetKeys` exactly. Nothing under
 * `src/domain/` exists yet (S3), so this module has zero repo dependents
 * beyond `emit.ts` today.
 *
 * ## The classifier (D29-32)
 *
 * A candidate key SHIPS here when, measured against the real corpus:
 * coverage ≥40% of the category's final entities AND cardinality in the
 * 2..~60 range (soft upper bound — `equipment.usage` ships at 116 because its
 * top-15 values already cover 76% of occurrences; `armor.price`/
 * `shield.price`/`weapon.price` ship well past 60 for the same reason, price
 * being a near-continuous but still meaningfully-filterable value). A key
 * failing coverage OR sitting at a degenerate cardinality of 1 (no
 * discriminating power at all) stays page-detail-only.
 *
 * SPILLOVER keys — `featLevel` and `rank` — are proven EXACT duplicates of
 * the core `level` field on every category that carries them (100% match,
 * measured) and are BANNED from every entry below; `SPILLOVER_FACET_KEYS`
 * exists so a conformance test can assert their absence mechanically rather
 * than by inspection. `prerequisites` (feat, cardinality 1,811 — free prose)
 * is likewise explicitly excluded, never a facet.
 *
 * ## Per-category provenance (measured against the real 46,192-entity/
 * 88-category corpus this slice — S1 — was built against; re-verify against
 * a fresh `report.md` facet-coverage section after any corpus refresh)
 *
 * Only 15/88 categories carry ANY `facets` key at all (facets populate only
 * on Foundry-merged entities, never `proseOnly` — the P3 spec's own §1
 * finding). Of those 15:
 *
 *   - **feat** (8,484 total): `actionCost` 70.5%/6, `itemCategory` 70.5%/7 —
 *     both pass; `prerequisites` explicitly excluded (see above).
 *   - **creature** (7,296 total): `size` 85.6%/6, `hp` 85.6%/281, `ac`
 *     85.6%/50, `fortitudeSave`/`reflexSave`/`willSave` 85.6%/~45-48,
 *     `perception` 85.6%/47 — all pass. `family` (D29-33b, AoN
 *     `creature_family_markdown`) ships REGARDLESS of the classifier — a
 *     stakeholder-sanctioned navigational facet even though its measured
 *     coverage (36.6% of final creature entities — AoN-derived-only,
 *     variants/Foundry-only creatures never carry it) sits under the 40%
 *     floor and its cardinality (467 raw families) sits well past the soft
 *     upper bound.
 *   - **equipment** (7,295 total): `bulk` 54.5%/17, `price` 51.7%/317,
 *     `usage` 52.4%/116 pass; `itemCategory` FAILS (21.5% coverage).
 *   - **spell** (2,604 total): `traditions` 69%/4, `castTime` 69%/26, `range`
 *     69%/54 pass; `rank` excluded (spillover-equivalent — spell's core
 *     `level` field already carries the same value via the Foundry Item
 *     `system.level.value` path); `area`/`duration`/`defense` fail coverage
 *     (15.6%/45.7%/26.1%).
 *   - **hazard** (1,309 total): `size` 90.2%/2, `hp` 89.8%/88, `ac` 81.1%/38,
 *     `fortitudeSave` 85.3%/38, `reflexSave` 84.9%/38, `willSave` 79%/27 all
 *     pass — hazards never carry `perception` (verified: no hazard Actor doc
 *     in the real snapshot has `system.perception` at all), so it's absent
 *     from this set unlike creature's.
 *   - **weapon** (1,293 total): `itemCategory` 72.9%/4, `usage` 72.9%/4,
 *     `bulk` 72.9%/7, `price` 68.4%/167 all pass.
 *   - **armor** (225 total): `itemCategory` 83.1%/5, `bulk` 83.1%/7, `price`
 *     80.4%/88 pass; armor never carries `usage` (no `system.usage` field on
 *     the real armor docs — unlike weapon/shield's raw shape).
 *   - **shield** (134 total): `bulk` 88.1%/6, `price` 85.8%/75 pass; shields
 *     carry neither `itemCategory` nor `usage` (verified: no `system.category`/
 *     `system.usage` on the real shield docs).
 *   - **deity** (718 total): `itemCategory` 66.2%/4 passes (spec-pinned
 *     regardless).
 *   - **creature-ability** (85 total): `actionCost` 56.5%/6, `itemCategory`
 *     56.5%/3 pass (mirrors feat's own pair — creature abilities are
 *     feat-shaped).
 *   - **vehicle** (137 total): `ac` 68.6%/30, `fortitudeSave` 68.6%/30, `hp`
 *     68.6%/38, `size` 68.6%/4 all pass — vehicles carry no reflex/will save
 *     or perception (verified: PF2e vehicles are hardness/HP/AC/Fort-only).
 *   - **warfare-army** (11 total): `hp` 63.6%/2 passes (a thin population,
 *     11 entities — the classifier's literal rule still clears it); `size`
 *     FAILS (cardinality 1 — every warfare-army entity that carries it
 *     carries the SAME value, zero discriminating power).
 *   - **class-feature** (1,500 total): `actionCost`/`itemCategory` sit at
 *     39.6% coverage — under the 40% floor, core-only (matches the spec's
 *     explicit "class-feature = level·rarity·traits" pin).
 *   - **action** (4,025 total): `actionCost` 10.3%, `itemCategory` 10% — both
 *     fail, core-only (matches the spec's explicit "action = rarity·traits").
 *   - **familiar-ability** (191 total): `actionCost`/`itemCategory` sit at
 *     38.2% coverage — under the 40% floor (also `itemCategory`'s
 *     cardinality is a degenerate 1) — core-only. NOT named in the spec's
 *     big-12/classifier-derived list explicitly; included here for
 *     completeness since it's one of the measured 15 facet-bearing
 *     categories, and the classifier cleanly rejects both its candidates.
 *
 * `rules`/`item-bonus`/`trait` never appear in the facets-bearing 15 at
 * all — core-only, per the spec's explicit pin.
 *
 * ## The 5 extractor-gap categories (D29-33a)
 *
 * `ancestry`/`class`/`background`/`condition`/`heritage` gained NEW facet
 * extraction this slice (`foundryEntities.ts`'s category-gated
 * `extractGapFacets`) — every one of the 6 candidates clears the classifier
 * against the real corpus:
 *
 *   - **ancestry** (99 total): `hp` 50.5%/3, `size` 50.5%/4, `speed` 50.5%/4
 *     — all pass (the 49.5% miss is real: `system.hp`/`size`/`speed` are all
 *     read off the SAME ancestry Item doc, so they're always present or
 *     absent together — the gap is every `proseOnly` AoN-only ancestry page
 *     with no Foundry ancestry Item at all).
 *   - **class** (49 total): `hp` 55.1%/4, `keyAbility` 55.1%/6 — pass
 *     (`keyAbility` kept even for a doc whose raw array is empty, e.g.
 *     Psychic's `[]` — see the field's own `FacetsSchema` comment).
 *   - **background** (613 total): `trainedSkills` 80.1%/16 — passes
 *     (`system.trainedSkills.value`, the fixed skill-slug list only —
 *     `.lore` deliberately excluded, free-text background flavor with
 *     near-1:1 cardinality, e.g. "Academia Lore").
 *   - **condition** (98 total): `valued` 42.9%/2 — passes, just clearing the
 *     40% floor (a real boolean flag: clumsy/frightened/etc. are
 *     value-bearing, controlled/helpful/blinded/etc. are flat flags).
 *   - **heritage** (436 total): `ancestrySlug` 70.2%/50 — passes
 *     (`system.ancestry.slug`, the parent-ancestry linkage).
 *
 * Every one of these 6 ships below. Had any failed, it would still round-trip
 * into `entity.facets` (page detail) — dropped from THIS allowlist only,
 * never silently discarded from the corpus itself (D29-33a's "no silent junk
 * facets" guard) — see `report.md`'s facet-coverage section (S1) for the
 * live-measured numbers this doc comment transcribes.
 */

// `Extract<..., string>` (not a bare `keyof Facets`): `FacetsSchema`'s
// `.catchall()` widens the inferred type's index signature to `string |
// number` keys (standard TS object-index-signature behavior), and every real
// facet key is a string.
type FacetKey = Extract<keyof Facets, string>;

/** Proven exact duplicates of the core `level` field — banned from every
 * entry below (a conformance test asserts this mechanically). */
export const SPILLOVER_FACET_KEYS: readonly FacetKey[] = ["featLevel", "rank"];

export const FACET_KEYS: Readonly<Record<string, readonly FacetKey[]>> = {
  feat: ["actionCost", "itemCategory"],
  creature: ["size", "family", "hp", "ac", "fortitudeSave", "reflexSave", "willSave", "perception"],
  equipment: ["bulk", "price", "usage"],
  spell: ["traditions", "castTime", "range"],
  hazard: ["size", "hp", "ac", "fortitudeSave", "reflexSave", "willSave"],
  weapon: ["itemCategory", "usage", "bulk", "price"],
  armor: ["itemCategory", "bulk", "price"],
  shield: ["bulk", "price"],
  deity: ["itemCategory"],
  "creature-ability": ["actionCost", "itemCategory"],
  vehicle: ["ac", "fortitudeSave", "hp", "size"],
  "warfare-army": ["hp"],
  ancestry: ["hp", "size", "speed"],
  class: ["hp", "keyAbility"],
  background: ["trainedSkills"],
  condition: ["valued"],
  heritage: ["ancestrySlug"],
  // class-feature / action / rules / item-bonus / trait / familiar-ability:
  // core-only — see the file-level provenance comment for why each
  // candidate the classifier considered didn't clear the bar.
};

/** The facetKeys allowlist for `category`, or `[]` for the 73 categories
 * with no derived facets at all (the "core-only" long tail). */
export function facetKeysFor(category: string): readonly FacetKey[] {
  return FACET_KEYS[category] ?? [];
}
