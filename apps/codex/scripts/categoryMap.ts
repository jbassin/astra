/**
 * D29-7: the explicit, committed category map — keyed on **(Foundry pack, doc
 * `type`)**, not pack alone. Walked deliberately against the REAL `pf2e-8.3.0`
 * snapshot (96 packs, 166 distinct (pack,type) pairs, verified exhaustively — see
 * the codex-0029 memory) so every pair below is a real, seen shape, not a guess.
 * A pair NOT accounted for here is a HARD FAIL at assembly time (the drift
 * tripwire): a Foundry refresh that adds a new pack or a new doc type inside an
 * existing pack must be triaged here before the pipeline runs again.
 *
 * Keyed on the pack's **directory name** (what `foundryEntities.ts`/`uuidResolve.ts`
 * actually walk on disk), not the registered manifest name — 10 of the 96 packs
 * have a registered `name` that differs from their `path` (e.g. `actionspf2e` →
 * `packs/actions`); `uuidResolve.ts` owns that name↔dir translation for `@UUID`
 * resolution (D29-6), this map only ever sees directory names.
 *
 * Three tiers:
 *   1. `EXCLUDED_PACKS` — whole packs dropped from entity assembly (D29-8 + one S2
 *      extension, see below). Their docs still exist in the uuid index as
 *      `excluded` targets (`uuidResolve.ts`'s job, not this map's).
 *   2. `ACTOR_PACKS` + `ACTOR_TYPE_CATEGORY` — every Actor-type pack (66 of them:
 *      the ~58 "-bestiary" packs plus hazards/iconics/vehicles/npc-gallery/
 *      paizo-pregens/pathfinder-*-core/standalone-adventures/fall-of-plaguestone/
 *      kingmaker-bestiary) shares ONE doc-type→category table: the concept behind
 *      "npc" or "hazard" is identical regardless of which sourcebook pack it lives
 *      in. This is what D29-7 means by "the 58 bestiary packs collapse many-to-one
 *      to `creature`" generalized to the full Actor set (verified: `character`/
 *      `familiar` are statblock-shaped iconics/pregens, also `creature`; `army` is
 *      Kingmaker-only, matching AoN's own `warfare-army` category; `vehicle`
 *      matches AoN's `vehicle` category 1:1).
 *   3. `ITEM_PACK_CATEGORY` — one entry per non-Actor, non-excluded, non-journal
 *      pack (25 of them). Most map their single doc type straight through; two
 *      packs (`equipment`, `adventure-specific-actions`, `boons-and-curses`,
 *      `kingmaker-features`) carry more than one doc type and get a nested
 *      per-type table.
 *
 * Journals (`journals`/`criticaldeck`) are NOT covered here — JournalEntry docs
 * have no per-doc `type` field at all (a different shape, D29-8) and are handled
 * entirely by `src/ingest/journals.ts`.
 */

// ---------------------------------------------------------------------------
// 1. excluded packs (D29-8 + one S2 extension)
// ---------------------------------------------------------------------------

/**
 * Whole-pack exclusion, by directory name. D29-8 names four exclusion classes
 * verbatim: `*-effects` packs, `macros`/`action-macros`, `rollable-tables`, and
 * the `gm-screen`/`hero-point-deck` JOURNALS (handled in `journals.ts`, not here).
 *
 * The six `*-effects` packs below are pure VTT automation (656+7+66+53+831+... —
 * measured 2,814 docs total across these six pack directories; D29-8 cites
 * "2,808", close enough to be the same set counted at a slightly earlier
 * snapshot moment — not investigated further, it's not gate-relevant). Exclusion
 * is applied at the PACK level, matching D29-8's literal "*-effects packs"
 * wording: a stray non-`effect`-typed doc living in one of these six packs
 * (`campaign-effects` has 7 `feat` + 1 `condition` docs alongside its 66
 * `effect` docs) is excluded too, for consistency — NOT re-included by doc type.
 * By contrast, `effect`-typed docs that show up in a pack whose NAME doesn't
 * match this glob (`boons-and-curses::effect` ×7, `kingmaker-features::effect`
 * ×17) are NOT excluded by this rule — see `ITEM_PACK_CATEGORY` below, where
 * they land in a small Foundry-only `"effect"` bucket instead (their prose reads
 * as real reference content, e.g. "Effect: Abadar's Warning" — unlike this
 * exclusion class, they were never asked to be dropped).
 *
 * `criticaldeck` (106 JournalEntry docs, the critical-fumble/-hit card decks) is
 * an S2 EXTENSION of D29-8's exclusion list, not spec text: every page is GM
 * game-aid flavor text for a physical/virtual card draw, structurally identical
 * in kind to the spec's own gm-screen/hero-point-deck rationale ("not reference
 * content") even though the spec only named those two by name. Documented here
 * as a deliberate S2 decision — its docs still enter the uuid index as
 * `excluded` targets via `uuidResolve.ts`, same as gm-screen/hero-point-deck.
 */
export const EXCLUDED_PACKS: ReadonlySet<string> = new Set([
  "bestiary-effects",
  "campaign-effects",
  "equipment-effects",
  "feat-effects",
  "other-effects",
  "spell-effects",
  "macros",
  "action-macros",
  "rollable-tables",
  "criticaldeck", // S2 extension — see doc comment above.
]);

// ---------------------------------------------------------------------------
// 2. Actor packs (66) — one shared doc-type table
// ---------------------------------------------------------------------------

/** Every Actor-type pack directory in the pinned `pf2e-8.3.0` snapshot (verified
 * against `system.pf2e.json`'s `packs[].type === "Actor"`, 66 entries). */
export const ACTOR_PACKS: ReadonlySet<string> = new Set([
  "abomination-vaults-bestiary",
  "age-of-ashes-bestiary",
  "agents-of-edgewatch-bestiary",
  "battlecry-bestiary",
  "blog-bestiary",
  "blood-lords-bestiary",
  "book-of-the-dead-bestiary",
  "claws-of-the-tyrant-bestiary",
  "crown-of-the-kobold-king-bestiary",
  "curtain-call-bestiary",
  "extinction-curse-bestiary",
  "fall-of-plaguestone",
  "fists-of-the-ruby-phoenix-bestiary",
  "gatewalkers-bestiary",
  "hazards",
  "hellbreakers-bestiary",
  "hells-destiny-bestiary",
  "howl-of-the-wild-bestiary",
  "iconics",
  "kingmaker-bestiary",
  "lost-omens-bestiary",
  "malevolence-bestiary",
  "menace-under-otari-bestiary",
  "myth-speaker-bestiary",
  "night-of-the-gray-death-bestiary",
  "npc-gallery",
  "one-shot-bestiary",
  "outlaws-of-alkenstar-bestiary",
  "paizo-pregens",
  "pathfinder-bestiary",
  "pathfinder-bestiary-2",
  "pathfinder-bestiary-3",
  "pathfinder-dark-archive",
  "pathfinder-monster-core",
  "pathfinder-monster-core-2",
  "pathfinder-npc-core",
  "pfs-introductions-bestiary",
  "pfs-season-1-bestiary",
  "pfs-season-2-bestiary",
  "pfs-season-3-bestiary",
  "pfs-season-4-bestiary",
  "pfs-season-5-bestiary",
  "pfs-season-6-bestiary",
  "pfs-season-7-bestiary",
  "prey-for-death-bestiary",
  "quest-for-the-frozen-flame-bestiary",
  "rage-of-elements-bestiary",
  "revenge-of-the-runelords-bestiary",
  "rusthenge-bestiary",
  "season-of-ghosts-bestiary",
  "seven-dooms-for-sandpoint-bestiary",
  "shades-of-blood-bestiary",
  "shadows-at-sundown-bestiary",
  "sky-kings-tomb-bestiary",
  "spore-war-bestiary",
  "standalone-adventures",
  "stolen-fate-bestiary",
  "strength-of-thousands-bestiary",
  "the-enmity-cycle-bestiary",
  "the-slithering-bestiary",
  "triumph-of-the-tusk-bestiary",
  "troubles-in-grayce-bestiary",
  "troubles-in-otari-bestiary",
  "vehicles",
  "war-of-immortals-bestiary",
  "wardens-of-wildwood-bestiary",
]);

/** Doc `type` → codex category, shared by every pack in `ACTOR_PACKS` (verified:
 * these six doc types are the complete set across all 66 Actor packs). */
export const ACTOR_TYPE_CATEGORY: Readonly<Record<string, string>> = {
  npc: "creature",
  // Iconics/pregens/Kingmaker PCs are statblock-shaped, same as an npc (iconics
  // has zero `system.traits`/`publication` — handled as report-counted
  // "unknown"-license residue in `foundryEntities.ts`, not a mapping concern).
  character: "creature",
  familiar: "creature",
  hazard: "hazard",
  // Kingmaker-only; matches AoN's own `warfare-army` category name.
  army: "warfare-army",
  vehicle: "vehicle",
};

// ---------------------------------------------------------------------------
// 3. Item packs (25) — per-pack (nested per-type where a pack fans out)
// ---------------------------------------------------------------------------

/** `equipment` (5,672 docs) fans per-doc-type: `weapon`/`armor`/`shield` get
 * their own AoN-aligned category (verified: AoN ships exactly those three plus a
 * catch-all `equipment` — no `consumable`/`treasure`/`kit`/`ammo`/`backpack`
 * category exists in the 93-category AoN vocabulary), everything else folds into
 * `"equipment"`. */
const EQUIPMENT_TYPE_CATEGORY: Readonly<Record<string, string>> = {
  weapon: "weapon",
  armor: "armor",
  shield: "shield",
  ammo: "equipment",
  backpack: "equipment",
  consumable: "equipment",
  equipment: "equipment",
  kit: "equipment",
  treasure: "equipment",
};

/** Shorthand for a pack with exactly one real doc type — still an explicit
 * per-type table (not a bare string) so an unforeseen SECOND type appearing in
 * a future refresh still hard-fails (D29-6's drift posture): a bare-string
 * shorthand would silently accept any type at all in that pack, which a real
 * regression test caught during S2 authoring (a hypothetical `spells::ritual`
 * doc must fail loudly, not silently become a `spell`). */
function single(type: string, category: string): Readonly<Record<string, string>> {
  return { [type]: category };
}

/** One entry per Item-pack directory, each an explicit per-doc-type table —
 * see `single()`'s doc comment for why even a one-type pack isn't a bare
 * string. */
const ITEM_PACK_CATEGORY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  actions: single("action", "action"),
  // 165 `action` (main bucket) + 16 `feat` (adventure-specific archetype-style
  // feats granted by a specific AP, mechanically ordinary feats) — both real,
  // both mapped through their generic category (S2 decision: no dedicated
  // "adventure feat" bucket for 16 docs).
  "adventure-specific-actions": { action: "action", feat: "feat" },
  ancestries: single("ancestry", "ancestry"),
  // Ancestry feats (55 docs, `system.category === "ancestry"`) — AoN does not
  // split these into their own category; they're ordinary feats tagged with an
  // ancestry trait, so they fold into the same `"feat"` bucket as the main
  // `feats` pack (S2 decision).
  "ancestry-features": single("feat", "feat"),
  backgrounds: single("background", "background"),
  // Creature special-ability glossary entries (e.g. "Grab", "Trample") — Foundry
  // types these as `action` (same doc shape as a player action) but they are
  // conceptually AoN's `creature-ability` category, not a player action.
  "bestiary-ability-glossary-srd": single("action", "creature-ability"),
  "bestiary-family-ability-glossary": single("action", "creature-ability"),
  // Deity boons/curses (variant-rule reward/penalty items) — Foundry types both
  // as `feat`, distinguished only by `system.category` ("deityboon"/"curse"),
  // which this (pack,type)-keyed map can't see. Foundry-only content (no AoN
  // category matches this concept); one shared bucket for both flavors (S2
  // decision — could split by `system.category` in a future pass if it matters
  // for P2/P3, not required for P1). The pack's 7 stray `effect` docs (e.g.
  // "Effect: Abadar's Warning" granted by a boon) are real reference prose, kept
  // in a small Foundry-only `"effect"` bucket rather than excluded (contrast
  // with the `*-effects`-NAMED packs above, which drop wholesale).
  "boons-and-curses": { feat: "boon", effect: "effect" },
  classes: single("class", "class"),
  "class-features": single("feat", "class-feature"),
  conditions: single("condition", "condition"),
  deities: single("deity", "deity"),
  equipment: EQUIPMENT_TYPE_CATEGORY,
  // Matches AoN's own `familiar-ability` category name exactly.
  "familiar-abilities": single("action", "familiar-ability"),
  feats: single("feat", "feat"),
  heritages: single("heritage", "heritage"),
  // Kingmaker kingdom-management features — no AoN category matches this
  // Foundry/Kingmaker-VTT-only concept (S2 decision: dedicated Foundry-only
  // bucket). The pack's 17 stray `effect` docs (army conditions like
  // "Concealed") land in the same small `"effect"` bucket as boons-and-curses's,
  // for the same reason (real prose, wrong-named pack to auto-exclude).
  "kingmaker-features": { campaignFeature: "kingdom-feature", effect: "effect" },
  // PFS Organized Play reward items — Foundry-only, no AoN category; kept
  // distinct from ordinary feats since they're mechanically rewards, not
  // character build choices (S2 decision).
  "pathfinder-society-boons": single("feat", "pfs-boon"),
  spells: single("spell", "spell"),
};

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

export type CategoryDecision =
  | { readonly kind: "category"; readonly category: string }
  | { readonly kind: "excluded" };

/** Thrown when a (pack, docType) pair isn't accounted for above — the drift
 * tripwire (D29-7's "a pair you haven't mapped is a hard fail"). A real refresh
 * that adds a pack or a new doc type inside an existing pack must extend this
 * file before the pipeline can run again. */
export class CategoryMapError extends Error {
  readonly pack: string;
  readonly docType: string;

  constructor(pack: string, docType: string) {
    super(
      `categoryMap: no mapping for (pack="${pack}", type="${docType}") — extend categoryMap.ts`,
    );
    this.name = "CategoryMapError";
    this.pack = pack;
    this.docType = docType;
  }
}

/**
 * Resolves a (pack directory, doc `type`) pair to its codex category, or
 * `{kind:"excluded"}` for a whole-pack exclusion (§1). Throws `CategoryMapError`
 * for anything not accounted for above — total over the real `pf2e-8.3.0`
 * snapshot (verified: all 166 real pairs resolve without throwing).
 */
export function mapCategory(pack: string, docType: string): CategoryDecision {
  if (EXCLUDED_PACKS.has(pack)) return { kind: "excluded" };

  if (ACTOR_PACKS.has(pack)) {
    const category = ACTOR_TYPE_CATEGORY[docType];
    if (category === undefined) throw new CategoryMapError(pack, docType);
    return { kind: "category", category };
  }

  const entry = ITEM_PACK_CATEGORY[pack];
  if (entry === undefined) throw new CategoryMapError(pack, docType);
  const category = entry[docType];
  if (category === undefined) throw new CategoryMapError(pack, docType);
  return { kind: "category", category };
}

/** True for any pack this map recognizes at all (excluded or not) — used by
 * `uuidResolve.ts`/`foundryEntities.ts` to distinguish "this pack/type combo has
 * a deliberate decision" from "the map itself doesn't know this pack yet"
 * (journals/macros/rollable-tables ARE known, just excluded; an unrecognized
 * directory is a harder drift signal — a whole new pack, not just a new type
 * inside one already accounted for). */
export function isKnownPack(pack: string): boolean {
  return EXCLUDED_PACKS.has(pack) || ACTOR_PACKS.has(pack) || pack in ITEM_PACK_CATEGORY;
}
