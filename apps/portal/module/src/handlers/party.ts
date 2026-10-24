/**
 * The player-key party tools: the party roster (`query-party`) and one character's sheet
 * (`query-player`). Builders return plain data; the server renders the markdown.
 */
import {
  type PartyCompanionRow,
  type PartyPcRow,
  type PlayerFeatRow,
  type PlayerFeatsSection,
  type PlayerInventoryRow,
  type PlayerInventorySection,
  type PlayerNotesSection,
  type PlayerSaveRow,
  type PlayerSkillRow,
  type PlayerSkillsSection,
  type PlayerSpellcastingEntryGroup,
  type PlayerSpellRankGroup,
  type PlayerSpellRow,
  type PlayerSpellsSection,
  type PlayerStatsSection,
  type PlayerSummarySection,
  QueryPartyParams,
  type QueryPartyResult,
  QueryPlayerParams,
  type QueryPlayerResult,
  type BridgeToolHandlers,
  BridgeError,
} from "@astra/portal-shared";

import { MODULE_ID } from "../constants";
import {
  actorAlliance,
  actorBiography,
  actorHeroPoints,
  actorHp,
  actorLanguages,
  actorLevel,
  actorXp,
  type BiographySection,
  entryPreparedType,
  entrySlot,
  entrySlots,
  entryTradition,
  familiarMasterId,
  featCategory,
  firstItemName,
  itemBulk,
  itemEquipped,
  itemLevel,
  itemQuantity,
  itemRunes,
  itemTraits,
  liveNumberAt,
  liveSkills,
  liveSystem,
  partyMemberUuids as partyMemberUuidsOf,
  type Pf2eSlot,
  type Pf2eSource,
  type Pf2eSystem,
  sourceItems,
  sourceOf,
  sourceSystem,
  spellBaseRank,
  spellcastingEntryDc,
  spellLocation,
} from "../pf2e";
import { resolveByName } from "./shared";

/** `query-party` (0028 S2/D28-4) — resolves the party actor(s) by `type === "party"`
 * AT QUERY TIME (never hardcoded, spec Verified footprint), unions every resolved
 * party's `system.details.members` uuid refs (pf2e allows multiple parties; this
 * world has one), then splits each resolved member into a full PC row (`type ===
 * "character"`) or a labeled minimal companion row (anything else — the live world's
 * familiar Othello is the verified case). A member uuid that no longer resolves
 * (stale reference) is skipped, not a failure — one dangling ref shouldn't sink the
 * whole roster. Zero party actors in the world is the one hard failure (typed
 * `not-found`, per the spec's adversarial-pass answer on a missing/renamed party). */
async function handleQueryParty(rawParams: unknown): Promise<QueryPartyResult> {
  QueryPartyParams.parse(rawParams);
  const parties = Array.from(game.actors.values()).filter((a) => a.type === "party");
  if (parties.length === 0) {
    throw new BridgeError("not-found", "no party actor found in this world");
  }

  const memberUuids = new Set<string>();
  let partyName: string | undefined;
  for (const party of parties) {
    partyName ??= party.name;
    for (const uuid of partyMemberUuidsOf(sourceSystem(sourceOf(party)))) memberUuids.add(uuid);
  }

  const pcs: PartyPcRow[] = [];
  const companions: PartyCompanionRow[] = [];
  for (const uuid of memberUuids) {
    const doc = await fromUuid(uuid);
    if (!doc) continue; // a stale member reference — skip, never fail the whole roster
    if (doc.type === "character") {
      pcs.push(buildPartyPcRow(doc));
    } else {
      companions.push(buildPartyCompanionRow(doc));
    }
  }
  return { partyName, pcs, companions };
}

/** Best-effort owner-player-name resolution (D28-4's roster row) — an OWNER-level
 * (3) `ownership` entry (excluding the special `"default"` key) resolved against
 * `game.users`, skipping the GM's own OWNER grant (every document carries one). Omits
 * the field entirely rather than guessing when nothing resolves. */
function resolveOwnerPlayer(ownership: unknown): string | undefined {
  const OWNER_LEVEL = 3;
  if (!ownership || typeof ownership !== "object") return undefined;
  for (const [userId, level] of Object.entries(ownership as Record<string, unknown>)) {
    if (userId === "default" || level !== OWNER_LEVEL) continue;
    const user = game.users.get(userId);
    if (user && !user.isGM) return user.name;
  }
  return undefined;
}

/** `{value, max}` when both are numbers, else `undefined` (the wire's pool shape). */
function fullPool(
  pool: { value?: number; max?: number } | undefined,
): { value: number; max: number } | undefined {
  return pool?.value !== undefined && pool.max !== undefined
    ? { value: pool.value, max: pool.max }
    : undefined;
}

function buildPartyPcRow(doc: FoundryDocumentLike): PartyPcRow {
  const src = sourceOf(doc);
  const source = sourceSystem(src);
  // A PC's hp.max exists only on the live side; the source fallback covers a test double
  // or a document with no prepared `system`. Hero points and level come from the source.
  const live = liveSystem(doc);
  const hp = (live && actorHp(live)) ?? actorHp(source);
  return {
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    level: actorLevel(source),
    hp: fullPool(hp),
    heroPoints: fullPool(actorHeroPoints(source)),
    ancestry: firstItemName(src, "ancestry"),
    className: firstItemName(src, "class"),
    ownerPlayer: resolveOwnerPlayer(src.ownership),
  };
}

function buildPartyCompanionRow(doc: FoundryDocumentLike): PartyCompanionRow {
  const master = familiarMasterId(sourceSystem(sourceOf(doc)));
  const masterActor = master !== undefined ? game.actors.get(master) : undefined;
  return {
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    type: doc.type ?? "unknown",
    master: masterActor?.name,
  };
}

/** `query-player`'s D28-13 resolution: `uuid` (a full `Actor.<id>` uuid, or a bare
 * world actor id — either form accepted) resolves via `fromUuid`; `name` resolves via
 * {@link resolveByName} across every world actor (the D28-4 type predicate is checked
 * AFTER resolution, uniformly for both paths, so an unambiguous name match against an
 * NPC still resolves — and then gets the correct typed `not-a-player-character`
 * refusal, not a confusing `not-found`). The params schema's own `.refine()` already
 * guarantees exactly one of `name`/`uuid` is present. */
async function resolvePlayerActor(params: QueryPlayerParams): Promise<FoundryDocumentLike> {
  if (params.uuid !== undefined) {
    const uuid = params.uuid.includes(".") ? params.uuid : `Actor.${params.uuid}`;
    const doc = await fromUuid(uuid);
    if (!doc) throw new BridgeError("not-found", `not found: ${uuid}`);
    return doc;
  }
  // The schema refine guarantees `name` is set whenever `uuid` isn't.
  return resolveByName(Array.from(game.actors.values()), params.name as string);
}

/** Reads a dot-path off the LIVE prepared actor's `system` tree (D28-2) — fail-soft:
 * a missing/wrong-shaped path logs a module `console.warn` naming the path and
 * returns `undefined`, NEVER throws (the spec's Risks: pf2e-internal derived paths
 * can drift across system majors, and a familiar/edge-case actor may legitimately
 * lack a path like `attributes.classDC`). `warnings` collects the same message the
 * console gets, so `query-player`'s `stats` result carries a machine-readable record
 * of what came back missing alongside the human-readable console line. */
function readDerivedNumber(
  live: Pf2eSystem<"live"> | undefined,
  path: string,
  warnings: string[],
): number | undefined {
  const value = liveNumberAt(live, path);
  if (value !== undefined) return value;
  const message = `query-player stats: missing/invalid derived path "system.${path}"`;
  warnings.push(message);
  // oxlint-disable-next-line no-console -- Foundry module: the browser console is the GM's log
  console.warn(`[${MODULE_ID}] ${message}`);
  return undefined;
}

const SAVE_SLUGS = ["fortitude", "reflex", "will"];
const ABILITY_SLUGS = ["str", "dex", "con", "int", "wis", "cha"];

/** `query-player`'s `stats` section (0028 S2/D28-2) — the curated derived-stats
 * projection, read off the LIVE prepared actor (`doc.system`, never `toObject()`):
 * AC, saves, perception, ability modifiers, class DC, spell DC. Every individual
 * field is read via {@link readDerivedNumber} — fail-soft per field, never throws. */
function buildStats(doc: FoundryDocumentLike): PlayerStatsSection {
  const live = liveSystem(doc);
  const warnings: string[] = [];
  const read = (path: string): number | undefined => readDerivedNumber(live, path, warnings);

  const saves: PlayerSaveRow[] = SAVE_SLUGS.map((type) => ({
    type,
    value: read(`saves.${type}.value`),
    dc: read(`saves.${type}.dc`),
  }));
  const abilityMods: Record<string, number> = {};
  for (const slug of ABILITY_SLUGS) {
    const mod = read(`abilities.${slug}.mod`);
    if (mod !== undefined) abilityMods[slug] = mod;
  }

  return {
    section: "stats",
    ac: read("attributes.ac.value"),
    perception: { value: read("perception.value"), dc: read("perception.dc") },
    saves,
    abilityMods,
    classDC: { value: read("attributes.classDC.value"), rank: read("attributes.classDC.rank") },
    spellDC: { value: read("attributes.spellDC.value") },
    warnings,
  };
}

/** `query-player`'s `skills` section (0028 S2) — the LIVE `system.skills` map, which
 * (unlike stored source) carries a total `value`/`dc` per skill AND every lore skill
 * (added by `prepareSkills()`'s loreItems merge, verified in pf2e.mjs). */
function buildSkills(doc: FoundryDocumentLike): PlayerSkillsSection {
  const skills: PlayerSkillRow[] = liveSkills(liveSystem(doc)).map((s) => ({
    slug: s.slug,
    label: s.label,
    rank: s.rank,
    value: s.value,
    dc: s.dc,
    lore: s.lore,
  }));
  skills.sort((a, b) => a.slug.localeCompare(b.slug));
  return { section: "skills", skills };
}

function buildSummary(doc: FoundryDocumentLike, src: Pf2eSource): PlayerSummarySection {
  const source = sourceSystem(src);
  // Prefer the live `system` (has derived hp.max) but fall back to the stored source
  // (familiars/edge cases where the live surface isn't stubbed, e.g. in tests).
  const system: Pf2eSystem = liveSystem(doc) ?? source;
  const hp = actorHp(system);
  const masterId = familiarMasterId(system);
  // Resolve the master's NAME like the party companion row does — an id is useless
  // to a player-facing render (S4 live-gate find).
  const master = masterId !== undefined ? (game.actors.get(masterId)?.name ?? masterId) : undefined;

  return {
    section: "summary",
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    actorType: doc.type ?? "unknown",
    level: actorLevel(system),
    xp: fullPool(actorXp(system)),
    hp: hp?.value !== undefined ? { value: hp.value, max: hp.max, temp: hp.temp } : undefined,
    // Hero points come from the stored source (pf2e zeroes the live value; 0/0 rendered at
    // the 0028 S4 live gate while the source said 1/3).
    heroPoints: fullPool(actorHeroPoints(source, system)),
    ancestry: firstItemName(src, "ancestry"),
    heritage: firstItemName(src, "heritage"),
    background: firstItemName(src, "background"),
    className: firstItemName(src, "class"),
    deity: firstItemName(src, "deity"),
    languages: actorLanguages(system),
    alliance: actorAlliance(system),
    master,
  };
}

interface SpellSlotState {
  rank: number;
  prepared: boolean;
  expended?: boolean;
}

/** Locates a spell's slot state in a spellcastingEntry's `system.slots.slot0..11`
 * (spec Verified footprint) by scanning every slot's `prepared[]` list for a matching
 * item id — this is how a PREPARED caster's spell gets its cast-at rank (which can
 * differ from the spell's own innate rank via heightening into a higher slot); a
 * spontaneous/innate/focus spell simply never appears in any slot's `prepared[]`. */
function findSlotState(slots: readonly Pf2eSlot[], spellId: string): SpellSlotState | undefined {
  for (const slot of slots) {
    const hit = slot.prepared.find((p) => p.id === spellId);
    if (hit) return { rank: slot.rank, prepared: true, expended: hit.expended };
  }
  return undefined;
}

/** `query-player`'s `spells` section (0028 S2/D28-11) — groups by spellcasting entry
 * then rank (slot rank when the spell is in a prepared slot, else its own innate
 * `system.level.value`), names + traits only (full descriptions are `query-item`'s
 * job, S3). Both `entryFilter`/`rankFilter` narrow the module-side result — cheap,
 * since these are already the full parsed source items; the D28-11 12,000-char
 * markdown cap and its group-summary fallback are entirely server-side (D28-6: the
 * module stays dumb, it never measures or truncates markdown). */
function buildSpells(
  doc: FoundryDocumentLike,
  src: Pf2eSource,
  entryFilter: string | undefined,
  rankFilter: number | undefined,
): PlayerSpellsSection {
  const items = sourceItems(src);
  const entryItems = items.filter((i) => i.type === "spellcastingEntry");
  const spellItems = items.filter((i) => i.type === "spell");
  const needle = entryFilter?.toLowerCase();
  const liveActor = liveSystem(doc);

  const entries: PlayerSpellcastingEntryGroup[] = [];
  for (const entry of entryItems) {
    const entryId = String(entry._id ?? "");
    const entryName = typeof entry.name === "string" ? entry.name : "Spells";
    if (
      needle !== undefined &&
      entryId !== entryFilter &&
      !entryName.toLowerCase().includes(needle)
    ) {
      continue;
    }
    // The entry DC is derived: 0 in the stored source for a prepared caster and on the
    // live entry's own system (0028 S4 live finds), so `spellcastingEntryDc` falls back to
    // the live actor's `attributes.spellDC.value`.
    const dc = spellcastingEntryDc(entry, liveSystem(doc.items?.get(entryId)), liveActor);
    const slots = entrySlots(entry);

    const rankGroups = new Map<number, PlayerSpellRow[]>();
    for (const spell of spellItems) {
      if (spellLocation(spell) !== entryId) continue;
      const spellId = String(spell._id ?? "");
      const slotState = findSlotState(slots, spellId);
      const rank = slotState?.rank ?? spellBaseRank(spell);
      if (rankFilter !== undefined && rank !== rankFilter) continue;
      const row: PlayerSpellRow = {
        id: spellId,
        name: typeof spell.name === "string" ? spell.name : "Unnamed",
        rank,
        traits: itemTraits(spell) ?? [],
        prepared: slotState?.prepared,
        expended: slotState?.expended,
      };
      const bucket = rankGroups.get(rank) ?? [];
      bucket.push(row);
      rankGroups.set(rank, bucket);
    }

    const ranks: PlayerSpellRankGroup[] = Array.from(rankGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([rank, spellsAtRank]) => {
        const slot = entrySlot(entry, rank);
        const slotCounts =
          slot?.max !== undefined ? { value: slot.value ?? 0, max: slot.max } : undefined;
        spellsAtRank.sort((a, b) => a.name.localeCompare(b.name));
        return { rank, slots: slotCounts, spells: spellsAtRank };
      });

    entries.push({
      entryId,
      entryName,
      tradition: entryTradition(entry),
      preparedType: entryPreparedType(entry),
      dc,
      ranks,
    });
  }

  return { section: "spells", entries };
}

const FEAT_CATEGORY_FALLBACK = "other";

/** `query-player`'s `feats` section (0028 S2) — grouped by category (`system.category`,
 * e.g. "ancestry"/"class"/"skill"/"general"/"classfeature") with the feat's own level. */
function buildFeats(src: Pf2eSource): PlayerFeatsSection {
  const feats: PlayerFeatRow[] = sourceItems(src)
    .filter((i) => i.type === "feat")
    .map((f) => ({
      id: String(f._id ?? ""),
      name: typeof f.name === "string" ? f.name : "Unnamed",
      category: featCategory(f) ?? FEAT_CATEGORY_FALLBACK,
      level: itemLevel(f),
    }));
  feats.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.level ?? 0) - (b.level ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return { section: "feats", feats };
}

const INVENTORY_ITEM_TYPES = new Set([
  "weapon",
  "armor",
  "equipment",
  "consumable",
  "backpack",
  "treasure",
  "kit",
  "shield",
  "ammo",
]);

/** `query-player`'s `inventory` section (0028 S2) — every embedded item whose type is
 * physical gear, with quantity/bulk/carry-state/runes. Fusion/property runes are
 * summarized as short labels (e.g. "+1 potency", "striking 2") rather than the raw
 * rune source objects. */
function buildInventory(src: Pf2eSource): PlayerInventorySection {
  const rows: PlayerInventoryRow[] = sourceItems(src)
    .filter((i) => typeof i.type === "string" && INVENTORY_ITEM_TYPES.has(i.type))
    .map((it) => {
      const equipped = itemEquipped(it);
      const runeData = itemRunes(it);
      const runes: string[] = [];
      if (runeData) {
        const { potency, striking, resilient } = runeData;
        if (potency !== undefined && potency > 0) runes.push(`+${potency} potency`);
        if (striking !== undefined && striking > 0) runes.push(`striking ${striking}`);
        if (resilient !== undefined && resilient > 0) runes.push(`resilient ${resilient}`);
        runes.push(...runeData.property);
      }
      return {
        id: String(it._id ?? ""),
        name: typeof it.name === "string" ? it.name : "Unnamed",
        type: String(it.type),
        quantity: itemQuantity(it),
        bulk: itemBulk(it),
        carryType: equipped?.carryType,
        invested: equipped?.invested,
        runes: runes.length > 0 ? runes : undefined,
      };
    });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { section: "inventory", items: rows };
}

/** `query-player`'s `notes` section (0028 S2, S3-amended) — deity (an embedded
 * `deity`-type item's name, never gated) plus non-empty biography prose fields,
 * EXCLUDING any subsection the GM has left/set GM-only via pf2e's own biography
 * visibility toggles (`actorBiography(...).visible`, `pf2e/actor.ts`). Two of the
 * four prose fields (`likes`/`dislikes` under `personality`; `campaignNotes` under
 * `campaign`) share a flag with sibling fields this section doesn't surface; gating by
 * that shared flag is correct, it's the section pf2e itself groups them under.
 * D28-5's uniform rationale
 * — the bridge runs as GM and must not leak GM-hidden content in ANY scope —
 * applies here too (the S2-amendment gap this fixes): the shared player key having
 * no per-player identity (D28-1) means "hide this from players" always means
 * "hide from every holder of this key", the same posture as a GM-hidden world item
 * or a spoiler compendium pack. */
function buildNotes(src: Pf2eSource): PlayerNotesSection {
  const bio = actorBiography(sourceSystem(src));
  const visibleProse = (v: string | undefined, section: BiographySection): string | undefined =>
    v !== undefined && v.length > 0 && bio.visible(section) ? v : undefined;
  return {
    section: "notes",
    deity: firstItemName(src, "deity"),
    appearance: visibleProse(bio.appearance, "appearance"),
    backstory: visibleProse(bio.backstory, "backstory"),
    likes: visibleProse(bio.likes, "personality"),
    dislikes: visibleProse(bio.dislikes, "personality"),
    campaignNotes: visibleProse(bio.campaignNotes, "campaign"),
  };
}

/** `query-player` (0028 S2/D28-4/D28-11) — resolves the target actor (D28-13), refuses
 * anything that isn't `type ∈ {character, familiar}` with the typed
 * `not-a-player-character` error, then builds exactly the requested `section`. */
async function handleQueryPlayer(rawParams: unknown): Promise<QueryPlayerResult> {
  const params = QueryPlayerParams.parse(rawParams);
  const doc = await resolvePlayerActor(params);
  if (doc.type !== "character" && doc.type !== "familiar") {
    throw new BridgeError(
      "not-a-player-character",
      `"${doc.name}" is a ${doc.type ?? "unknown-type"} actor — query-player only serves ` +
        "player characters and familiars",
    );
  }
  const src = sourceOf(doc);
  switch (params.section) {
    case "summary":
      return buildSummary(doc, src);
    case "stats":
      return buildStats(doc);
    case "skills":
      return buildSkills(doc);
    case "spells":
      return buildSpells(doc, src, params.entry, params.rank);
    case "feats":
      return buildFeats(src);
    case "inventory":
      return buildInventory(src);
    case "notes":
      return buildNotes(src);
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const partyHandlers = {
  "query-party": handleQueryParty,
  "query-player": handleQueryPlayer,
} satisfies Partial<BridgeToolHandlers>;
