/**
 * `query-player`'s `spells` section: each spellcasting entry's spells, grouped by the rank
 * they are cast at, with slot counts and the entry DC.
 */
import {
  type PlayerSpellcastingEntryGroup,
  type PlayerSpellRankGroup,
  type PlayerSpellRow,
  type PlayerSpellsSection,
} from "@astra/portal-shared";

import {
  entryPreparedType,
  entrySlot,
  entrySlots,
  entryTradition,
  itemTraits,
  liveSystem,
  type Pf2eSlot,
  type Pf2eSource,
  sourceItems,
  spellBaseRank,
  spellcastingEntryDc,
  spellLocation,
} from "../pf2e";

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

/** `query-player`'s `spells` section — groups by spellcasting entry
 * then rank (slot rank when the spell is in a prepared slot, else its own innate
 * `system.level.value`), names + traits only (full descriptions are `query-item`'s
 * job). Both `entryFilter`/`rankFilter` narrow the module-side result — cheap,
 * since these are already the full parsed source items; the 12,000-char
 * markdown cap and its group-summary fallback are entirely server-side (the
 * module stays dumb: it never measures or truncates markdown). */
export function buildSpells(
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
    // live entry's own system (both found in live testing), so `spellcastingEntryDc` falls back to
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
