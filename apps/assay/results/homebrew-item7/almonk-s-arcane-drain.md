# Almonk's Arcane Drain

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** ledger:utility — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** antillurgy, concentrate, manipulate, mental
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Range:** 120 feet
- **Target:** "1 creature with spell slots or focus points"
- **Defense:** Will save (non-basic)
- **Duration:** instantaneous (duration.value = "", sustained = false)
- **Heightening:** no `system.heightening` key present at all (see Open flags)

## The 5e original

- **Level:** 3rd
- **School:** Antillurgy
- **Casting time:** 1 action
- **Range:** 120 feet
- **Components:** V, S (no material)
- **Duration:** Instantaneous
- **Classes:** Sorcerer, Warlock, Wizard
- **Ritual:** No

> A silvery ray of energy shoots from your hand to one creature you can see, ripping a hole in their connection to the Weave. That creature must make a saving throw in your spellcasting ability (e.g. if a Wizard casts this spell they must make an Intelligence saving throw, if a Warlock casts it it's a Charisma saving throw, etc.) On a failure, the creature loses one 4th-level spell slot as if the spell was cast. If it has no 4th-level spells, it loses a 3rd-level slot instead; if it has no 3rd-level slot, it loses a 2nd-level spell; and so on. Arcane Drain has no effect on creatures that don't have spell slots.

**At Higher Levels:** Arcane Drain can be cast using a spell slot of 3rd level or higher. It wipes out a spell slot one level higher than the slot used to cast the spell.

## The conversion (canonical store)

> A silvery ray of disruptive energy shoots from your outstretched hand, tearing at the target's connection to arcane or spiritual power. The target must attempt a Will saving throw. This spell has no effect on creatures that lack spell slots or focus points.
>
> **Critical Success** The target is unaffected and is temporarily immune to Almonk's Arcane Drain for 1 day.
> **Success** The target loses one 1st-rank spell slot or 1 focus point (target's choice).
> **Failure** The target loses its highest available spell slot of rank 4 or lower (or the next lower rank if that one is exhausted, down to rank 1; or 1 focus point if no slots remain).
> **Critical Failure** As failure, but the target loses two spell slots (highest available, working downward) instead of one.
>
> ---
> **Heightened (+1)** The maximum rank of spell slot the target can lose on a failure increases by 1 (so at rank 4 it targets a 5th-rank slot or lower, at rank 5 a 6th-rank slot or lower, etc.).

No `@UUID` links present.

## What changed, plain English

The core fiction (silvery ray, tears at the target's connection to magic, drains a spell slot, no effect on non-casters) is preserved. Range (120 feet) is unchanged.

Structure/mechanics:
- 5e single ability save (varies by caster's casting stat: Int/Wis/Cha) → PF2e fixed Will save. Both the 5e "stat varies by caster class" mechanic and the flat pass/fail collapse into a single always-Will four-degree structure.
- 5e single pass/fail → PF2e four-degree structure. Both the critical-success tier (1-day immunity) and the graduated success tier (loses only a 1st-rank slot or 1 focus point instead of nothing) are net-new, with no 5e basis. The critical-failure tier (lose two slots instead of one) is also net-new.
- 5e "cast at slot level N → drains an (N+1)-rank slot" formula → PF2e "rank 3 base drains rank-4-or-lower; heightened +1 raises the cap by 1 rank." Functionally similar shape, cleanly re-expressed.
- 5e cascading "if no slot at that level, step down one level, repeat" is preserved essentially verbatim in the failure tier.
- 5e "no effect on creatures without spell slots" is preserved, and the PF2e version explicitly extends the target list/lack-of-effect clause to also cover PF2e's focus point resource (a PF2e-only concept with no 5e equivalent) — the target can lose a focus point in place of a spell slot at multiple tiers.
- 5e action cost 1 action → PF2e 2 actions.
- Traits added with no 5e basis: antillurgy (5e's homebrew school name, carried over as a PF2e trait verbatim — see Open flags), mental, concentrate, manipulate (PF2e action-component vocabulary).
- Traditions arcane + occult replace the 5e Sorcerer/Warlock/Wizard class list.

## Converter's notes

- **Anchor:** "no clean analog — closest is Slow (rank 3, slowed 1 min on fail) or Feeblemind (rank 7, stupefied 4); Arcane Drain targets spell economy, not action economy"
- **Archetype:** control/debuff (spell-slot drain)
- **Balance bullets:**
  - "No published PF2e spell drains spell slots. The effect is unique: it directly reduces the target's spellcasting resources rather than their actions or conditions. This is potent against spellcaster enemies but useless against non-casters."
  - "Will save is the correct mapping: 'disrupting the spellcasting faculty' is a mental/willpower contest, not a physical one."
  - "Base rank drains a slot of rank 4 or lower — at rank 3, the caster-level is 5, so draining a 4th-rank slot is targeting one rank above the spell itself, appropriate for a control spell."
  - "Heightening by +1 rank-cap-per-rank is clean and canonical: no need to track the 5e 'cast at N → drain N-rank slot' formula."
  - "Named-caster series (Almonk's Arcane Drain/Siphon/Retribution): the three share an anti-magic Weave antillurgy theme; this entry is the offensive member."
- **Overridable:**
  - "Named-caster (Almonk's): PF2e-idiomatic is a focus spell for an antillurgy specialist. Kept as regular spell per plan directive."
  - "The 'useless against non-spellcasters' limitation could be addressed by adding a secondary effect on non-casters (e.g., stupefied 1 for 1 round) — but this would change the spell's tight niche design."
- **Checklist failures:**
  - "Named-caster spell (Almonk's): PF2e-idiomatic conversion is a focus spell; kept as regular spell per plan directive."

## Similar official spells

- **Slow (rank 3)** — Fortitude save, degrees of success grade Slowed 1/Slowed 2 vs. unaffected; same rank as Arcane Drain but attacks action economy rather than spell-slot economy. No published spell drains slots directly (matches the converter's own anchor note).
- **Stupefy (rank 2)** — Will save mental debuff, one rank lower; graduated Stupefied 1/2/3 by degree, a useful reference point for how PF2e scales a Will-save mental-disruption spell one rank below Arcane Drain.
- **Never Mind (rank 6)** — Will save, curse trait, graduates to permanent Stupefied 4 on a failure and permanent Intelligence reduction on a critical failure; a much higher-rank, much more severe mental-faculty-reduction spell for comparison of how PF2e escalates severity across ranks.
- **Dispel Magic (rank 2)** — the nearest official "remove/negate a magical resource" mechanic (counteract check against a spell or magic item), though it targets active effects rather than unused spell slots.

## Prior astra touches

None found in `revisions.md` — Almonk's Arcane Drain matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.heightening` is entirely absent from the store JSON (no key at all), even though the description contains a "Heightened (+1)" block. This matches the adapter warning ("interval heightening text... kept as a description appendix only, not structurally represented") — the heighten effect here (raising the rank-cap of drainable slots) is not a pure damage bump, so it is not structurally representable under the current schema; the effect exists in prose only.
- The trait "antillurgy" is the 5e original's homebrew school name, carried over verbatim as a PF2e trait. It is not a real PF2e trait/school. jmnario's own conversion (`all_spells_pf2e.json`) does **not** include "antillurgy" in its traits list at all (traits: concentrate, manipulate, mental) — the store adds it on top of jmnario's list. This school-as-trait pattern recurs across several of this chunk's spells (see each dossier's Open flags).
- The 5e text explicitly varies the saving-throw ability by the caster's class (Int/Wis/Cha); the PF2e conversion collapses this to a fixed Will save for all casters, which is a structural simplification worth noting even though the converter's notes justify it explicitly.
