# Kosmoturgist's Armor

## Header

- **Rank:** 6 · **Routing:** ledger:utility · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; no priced quantitative verdict recorded for this spell in the chunk data.
- **Adapter warnings:** `interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented`
- **Traits:** concentrate, kosmoturgy, manipulate (rarity: common)
- **Traditions:** divine
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** touch · **Targets:** 1 willing creature · **Area:** none
- **Defense:** none (`system.defense = null`)
- **Duration:** 10 minutes, not sustained
- No structured `heightening` key exists in the store JSON at all (see Open Flags).

## The 5e original

- **Level** 6, **school** kosmoturgy (homebrew)
- **Casting time** 1 action
- **Range** touch (point)
- **Components** V, S, M ("a piece of wrought iron")
- **Duration** 10 minutes, no concentration
- **Classes** Cleric, Paladin

> You grant one willing creature a hardened layer of air compressed to the point of becoming solid around their body. For the duration of the spell, the target creature gains resistance to bludgeoning, piercing, slashing, and force damage. You may not have this effect active on multiple creatures at the same time.

No `entriesHigherLevel` block — the 5e original has no upcast/heightening text of any kind. Note also that the 5e text never specifies a resistance *amount*; 5e's generic "resistance" rule halves incoming damage of that type, so the original spell is fully defined without a number.

## The conversion (canonical store)

> You compress the ambient air around a creature you touch, hardening it into a near-solid shell of force-locked atmosphere. For the duration, the target gains resistance 10 to bludgeoning, piercing, slashing, and force damage. The resistance applies to all four types simultaneously; the shell does not stack with other resistance effects of the same type (highest applies). You cannot have this spell active on more than one creature at a time — casting it again ends the previous casting.
>
> **Heightened (+1)** The resistance increases by 5 (to 15 at 7th, 20 at 8th, etc.).

The heightened line is prose-only appendix text; there is no `system.heightening` object structurally backing it (unlike, e.g., Kosmoturgist's Weapon, which does carry a structured interval-heightening object).

## What changed, plain English

The core fiction (compressed-air shell, touch, single willing creature, one-at-a-time restriction) is preserved closely. The mechanical translation required real invention because 5e "resistance" and PF2e "resistance" are different mechanics:

- **Action cost:** 5e 1 action → PF2e 2 actions (standard buff-cast mapping).
- **Resistance value invented:** 5e never states a number (its "resistance" rule just halves damage); PF2e needed a flat number and picked **resistance 10** to four types, heightening +5/rank. This has no direct 1:1 source in the 5e text — it's a new numeric design decision, not a translation.
- **Heightening added wholesale:** the 5e original has *no* higher-level text at all; the PF2e "+5 per rank" heighten line is entirely new content.
- **Added clarifiers with no 5e basis:** "does not stack with other resistance effects of the same type (highest applies)" and "casting it again ends the previous casting" — the "one creature at a time" restriction itself IS in the 5e text ("You may not have this effect active on multiple creatures at the same time"), but the same-type-stacking clarifier and the explicit self-supersede clause are new.
- **Material component dropped:** 5e's "a piece of wrought iron" material does not appear anywhere in the store (`cost.value` is empty, no material text in prose) — consistent with the project's Remaster materials-scrub policy.
- **Classes → tradition:** 5e Cleric/Paladin class list narrowed to divine tradition only.
- **Trait divergence from the vendor conversion:** jmnario's intermediate conversion (`all_spells_pf2e.json`) lists traits `abjuration, concentrate, manipulate` (a guessed standard PF2e school trait). The current store instead carries `concentrate, kosmoturgy, manipulate` — `abjuration` dropped, `kosmoturgy` (the homebrew school name) kept as a trait instead.

## Converter's notes

- **Anchor:** Energy Aegis (rank 7) — resistance 5 to all 8 energy types
- **Archetype:** buff (resistance)
- **Balance bullets:**
  - "Energy Aegis at rank 7 gives resistance 5 to 8 types; Kosmoturgist's Armor at rank 6 gives resistance 10 to 4 types (bludgeoning, piercing, slashing, force) — narrower type list but higher value; trade is broadly equivalent."
  - "Physical + force coverage is the distinctive niche: armors against the most common weapon damage types, making it a pre-combat defensive option for martials."
  - "10-minute duration is acceptable for an exploration-tier physical-defense buff at rank 6; it would be broken at 1 hour but 10 minutes matches the Mystic Armor bracket."
  - "Single-target restriction and one-at-a-time limit prevent stacking on a whole party."
  - "Heightened +5 resistance per rank is a clean, predictable scaling; at rank 9 it reaches resistance 25 which is very high but resistance doesn't block all damage."
- **Overridable:**
  - "Resistance value could be reduced to 5 to match Energy Aegis exactly — would need to add more types to compensate or lower to rank 5."
  - "Could include a 10-minute duration hard cap instead of a heightening option if the GM is concerned about stacking in long exploration combats."
  - "Focus spell flag: this is a strong candidate for a Kosmoturgist class focus spell rather than a general tradition spell."
- **Checklist failures:** none.

## Similar official spells

- **Energy Aegis** (rank 7) — resistance 5 to 8 energy types (10 at heightened 9th), touch, duration "until your next daily preparations" (i.e., all-day). The converter's own anchor; note the official spell's duration is far longer than Kosmoturgist's Armor's flat 10 minutes.
- **Resist Energy** (rank 2, heightened 4th ≈ rank 6) — resistance 10 to ONE chosen energy type for up to 2 targets at the heightened-4th tier; 10-minute duration (matches Kosmoturgist's Armor's duration exactly). Narrower type coverage (1 type vs. 4) at the same duration and rank-equivalent tier.
- **Mystic Armor** (rank 1) — different axis (AC/Dex-cap buff, not resistance) but the same "all-day defensive buff" family cited in the converter's own notes ("matches the Mystic Armor bracket"); duration is also "until your next daily preparations."

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell — the store is byte-faithful to a fresh adapter re-conversion of the vendored baseline (no hand-edit history logged).

## Open flags

- The 5e original never specifies a resistance amount (5e's default "resistance" rule halves damage instead); the PF2e conversion's "resistance 10" (and its +5/rank heighten) is invented, not translated from a source number.
- No structured `heightening` field exists in the store JSON — the heighten text is prose-appendix only, consistent with the logged adapter warning.
- The 5e original has zero heightened/upcast text; the entire heighten-by-rank mechanic is a PF2e-side addition.
- Material component ("a piece of wrought iron") is dropped with no note in the description or cost field.
- Trait list currently reads `concentrate, kosmoturgy, manipulate` — the homebrew "kosmoturgy" school trait is retained per the project's declared policy of keeping the 8 homebrew schools as traits, differing from jmnario's own intermediate `abjuration` guess.
