# Containment Orbs

## Header block

- **Rank:** 7
- **Routing:** ledger:utility
- **Pool reason:** ledger (assigned to the 73-spell manual pool seeded by jmnario's own balanceBullets, not auto-scored)
- **Current assay line:** no quantitative verdict recorded for this spell in the chunk list (ledger routing — manual review item, not a scored damage/hybrid row)
- **Adapter warnings (flags.assay.adapterWarnings):**
  - "defense text has qualifiers beyond the base save/attack shape, not structurally represented (only the primary save/attack-roll mapped): 'basic Reflex (when an orb detonates)'"
  - "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** antillurgy, concentrate, force, manipulate (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 2 actions (concentrate, manipulate)
- **Range:** self
- **Target:** — (none; self-centered orbs)
- **Defense:** basic Reflex save (only on detonation, per adapter warning)
- **Duration:** sustained, up to 10 minutes

## The 5e original

- **Level:** 7
- **School:** antillurgy (tfc's homebrew school renaming)
- **Casting time:** 1 action
- **Range:** self
- **Components:** V, S (no material)
- **Duration:** Concentration, up to 10 minutes
- **Classes:** Sorcerer, Warlock, Wizard

> You are surrounded by three small orbs of multicolored force that can absorb certain spells. When you cast containment orbs, you choose a school of magic for each orb (e.g., abjuration, evocation, planara). Any spells of the appropriate type that would affect you are absorbed by the corresponding orb and have no further effect.
>
> Each orb can absorb only one spell. Once an orb has absorbed a spell, you can use an action to cause it to explode. All creatures within 20 feet of you take 2d6 damage per level of the spell the orb absorbed, or half damage with a successful Dexterity saving throw. The DC for the saving throw is set by you, not by the spell's original caster.
>
> An orb is destroyed after it has exploded. All orbs disappear with no further effect when the spell ends.

No `entriesHigherLevel` block in the 5e original (this spell has no explicit upcast text).

## The conversion (canonical store)

Three small orbs of multicolored force orbit you. When you cast Containment Orbs, assign each orb one magical tradition (arcane, divine, occult, or primal). Each orb can absorb the next spell of its assigned tradition that targets you or includes you in its area, negating that spell entirely. An orb can absorb only one spell and is then loaded. You can Sustain the spell each round to keep the orbs active. As a 2-action activity (concentrate, manipulate), you can cause a loaded orb to detonate: all creatures within 20 feet of you take force damage equal to 3d6 per rank of the absorbed spell (basic Reflex save using your spell DC). Each detonated orb is destroyed. When the spell ends, any remaining orbs (loaded or empty) dissolve harmlessly.

- **Critical Success** The creature takes no damage.
- **Success** The creature takes half damage.
- **Failure** The creature takes full damage.
- **Critical Failure** The creature takes double damage.

**Heightened (+1)** You gain one additional orb (4 orbs at 8th, 5 at 9th, etc.).

No `@UUID[...]` references in this description. Structured fields agree with the prose: `defense.save.basic=true/statistic=reflex` matches the basic Reflex line (with the adapter-warning caveat that the "only on detonation" qualifier isn't structurally captured); `duration.sustained=true, value="10 minutes"` matches; `time.value="2"` matches the 2-action detonation activity (note: this is the cost to *detonate*, not to *cast* — see Open Flags).

## What changed, plain English

The core absorb-then-detonate shape is preserved, but the trigger mechanism, damage scaling, and action economy were all changed from the 5e original.

- **Numbers:** damage-per-absorbed-level went from 2d6 (5e) to 3d6-per-rank (PF2e) — a 50% increase in the per-tier multiplier. Detonation action cost went from "1 action" (5e) to a "2-action activity" (PF2e) — explicitly to prevent free-action-economy detonation spam, per the converter's balance notes.
- **Structure:** the absorption trigger was changed from **school of magic** (5e: abjuration, evocation, "planara") to **magical tradition** (PF2e: arcane, divine, occult, primal) — a necessary structural swap since PF2e Remaster doesn't track schools of magic. The save was changed from Dexterity (5e) to basic Reflex (PF2e) — a standard organ-mapping, not a content change.
- **Duration:** 5e "Concentration, up to 10 minutes" became PF2e "sustained up to 10 minutes" — the converter's notes call this an exploration-tier duration appropriate for a reactive defense.
- **Content dropped:** none identified — all core beats (three orbs, one-spell-per-orb absorption, 20-ft detonation burst, orb destroyed on use, orbs dissolve at spell end) are present in both.
- **Content added:** force damage as the explicit detonation type (5e is silent on damage type; PF2e specifies force, "antillurgy releasing stored magical energy as pure force" per the converter). The heightened (+1) entry granting one additional orb per rank above 7th has no 5e basis — 5e's original has no `entriesHigherLevel` at all.

## Converter's notes

**Anchor:** Spell Turning (5e rank 7) — spell reflection; PF2e closest is Dispel Magic + readied reaction, but Containment Orbs adds an explosive payoff

**Archetype:** control/buff (reactive absorption + detonation)

**balanceBullets:**
- "The detonation damage (3d6 per absorbed spell rank) is the payoff: absorbing a rank-7 enemy spell and detonating deals 21d6 (~73 avg) to a 20-foot burst — this matches Fireball at rank 9–10, but requires the orb to successfully absorb a high-rank spell first, which is a conditional benefit."
- "Three orbs create up to three opportunities to absorb and detonate — but each orb is specific to one tradition, so players must predict enemy spell types."
- "Sustained up to 10 minutes is exploration-tier — appropriate since the spell is a reactive defense, not an active attack."
- "The 2-action detonation cost prevents zero-action-economy payoffs."
- "Force damage on detonation is thematically appropriate (magical energy released) and rarely resisted."

**overridable:**
- "Detonation damage multiplier (3d6 per rank) could be reduced to 2d6 per rank if the potential maximum feels too swingy (absorbing a rank-10 spell would deal 30d6 ≈ 105 avg at 3d6/rank)."
- "Tradition assignment (arcane/divine/occult/primal) could be replaced with school of magic if the GM prefers the 5e school system."
- "Could limit detonation range to 'within 30 feet' rather than 'within 20 feet of you' to prevent the caster from retreating to safety."

**checklistFailures:** none.

## Similar official spells

- **Spell Turning (rank 7)** — reflects a targeted spell back at its caster via a reaction + counteract check; single-shot per casting attempt, no stored payload. Compares on rank and "defensive magic-absorption" niche, but Spell Turning is purely defensive (no detonation payoff) and works via counteract rather than a stored/triggered burst.
- **Dispel Magic (rank 2)** — counteracts a targeted spell or effect outright; no absorb-then-detonate structure, included as the low-rank baseline for "remove an incoming spell."
- **Antimagic Field (rank 8)** — a much higher-rank blanket suppression of all magic in an area (including the caster's own); compares on "high-rank anti-magic utility" scale but is a totally different mechanism (area denial vs. targeted absorption).

## Prior astra touches

None found in `revisions.md` — Containment Orbs is not listed among the 52 deviating (hand-edited) spells; the store is byte-faithful to the fresh adapter re-conversion of jmnario's baseline (0 deviations for this spell).

## Open flags

- The `time.value: "2"` field represents the **detonation** activity's action cost, not the spell's own casting time (casting Containment Orbs itself has no explicit action-cost field distinct from this — the store's single `time` field is doing double duty for "cast" and "detonate," per the adapter's schema for this spell shape).
- The adapter warning flags that "basic Reflex (when an orb detonates)" is a qualifier beyond the base save shape not structurally represented — i.e., a reader of the structured `defense` field alone would not know the save only applies at detonation, not at cast time.
- The heightened (+1) entry ("4 orbs at 8th, 5 at 9th, etc.") is present only as a description appendix, per the second adapter warning — not structurally represented in a `heightening` field at all (no `heightening` key exists in this spell's JSON).
- 5e's original absorption trigger (school of magic, using flavor examples "abjuration, evocation, planara") was replaced with tradition-based absorption; the 5e "planara" school name (itself a tfc homebrew school) is not preserved anywhere in the PF2e conversion.
