# Instant Exit

## Header block

- **Rank:** 4 (store `system.level.value = 4`)
- **Routing:** ledger:teleport-utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual figure supplied in the chunk 6 manifest for this spell — only routing/pool-reason.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, planara (custom trait), teleportation — rarity common
- **Traditions:** arcane, occult
- **Cast:** `2` actions
- **Range:** 30 feet
- **Targets:** none specified (`system.target.value = ""`)
- **Defense:** none
- **Duration:** "1 round", `sustained: false`
- **Cost:** `system.cost.value = ""` (empty)
- **Heightening:** fixed-rank, at 5th and 7th

## The 5e original

- **Level:** 4 · **School:** planara (source: `tfc`)
- **Casting time:** 1 action
- **Range:** 30 feet
- **Components:** V, S (no material)
- **Duration:** 1 round, non-concentration
- **Classes:** Ranger, Seeker (SW), Warlock, Wizard

**Entries:**

> You cause a doorlike portal to appear on a nearby wall you can see. Any creature that steps through the portal is instantly teleported to a random location within 1,000 feet of the door. You have no control over where the creatures are transported, but all creatures that step through will be transported to the same location. The door disappears at the end of your next turn.
>
> There is a 5% chance the spell malfunctions and instead leads to a random plane. This is determined once, the first time a creature steps through the portal, and applies throughout the spell's duration.

No `entriesHigherLevel` block — the 5e original has no upcast/heightening text at all.

## The conversion (canonical store)

> You rip open a shimmering, door-shaped portal on a flat surface you can see within range. Any creature that deliberately Strides or Steps through the portal during the duration (including you) is instantly teleported to a random unoccupied location within 1,000 feet. The destination is determined randomly the first time any creature passes through, and all subsequent creatures that pass through during the same casting arrive at the same location. The portal is visible and any creature can observe it before choosing whether to step through.
>
> At the end of the duration (the end of your next turn), the portal closes and disappears.
>
> When the first creature passes through the portal, roll a d20. On a 1, the portal malfunctions and instead leads to a random plane as determined by the GM; this outcome applies to all creatures that pass through during the casting.
>
> **Heightened (5th)** The destination range increases to 5,000 feet, and you may choose whether all creatures that step through arrive at the same location or each one arrives at a different random location within that range.
> **Heightened (7th)** The malfunction result on the d20 expands to 1–3, and you can set a rough directional preference for the destination (GM chooses the exact location within ±90 degrees of your indicated direction).

Structured fields agree with the prose (30 ft range, 1-round non-sustained duration).

## What changed, plain English

- **Portal surface:** 5e explicitly requires "a nearby wall you can see." The store widens this to "a flat surface you can see" — floors and ceilings would now qualify, not just walls.
- **Destination clarified as "unoccupied":** the store adds "unoccupied location" to the destination description; 5e's text doesn't specify whether the random destination avoids occupied spaces.
- **Action cost:** 5e is a 1-action cast; the store is 2 actions — jmnario's own notes flag this as a deliberate rank-appropriateness change ("1-action teleportation effects are below rank-4 power level"), not a straight port.
- **Deliberate-use clause ADDED:** the store specifies "any creature that **deliberately** Strides or Steps through" — 5e's text just says "steps through," without the deliberateness qualifier (relevant for creatures forced/pushed through involuntarily).
- **Malfunction odds preserved but re-expressed:** 5e states "5% chance," resolved narratively. The store re-expresses the identical probability as "roll a d20, on a 1" — same math, different die-based framing (matches jmnario's own note: "same probability, expressed as d20 for PF2e die economy").
- **Heightening ADDED wholesale:** the 5e original has zero upcast/heightening text. The store adds two full heightened tiers (5th: range to 5,000 ft + choice of same/different destinations per creature; 7th: malfunction chance expands to 1–3 on d20 + directional preference) — entirely new content invented for the conversion, not sourced from the 5e entries at all.
- **Traditions:** 5e's class list (Ranger/Seeker/Warlock/Wizard) becomes arcane + occult in the store — Ranger doesn't map cleanly to either of those traditions in typical PF2e conversions, per jmnario's own justification ("teleportation is primarily arcane; occult for the random/chaotic planar connection").

## Converter's notes

- **Anchor:** "Dimension Door (rank 4 teleportation, 120 ft, controlled destination) — Instant Exit is the chaotic-random variant; far greater range (1,000 ft) but no destination control"
- **Archetype:** utility/teleportation
- **Balance bullets:**
  - "Random destination (no control) vs Dimension Door's precise destination: this is the core design trade-off at rank 4; Instant Exit offers 1,000-ft range and group teleport capability in exchange for unpredictability"
  - "1-round portal duration means enemies can also use the portal — this is a deliberate risk/reward element, not a flaw"
  - "d20=1 malfunction (5%) leads to random plane; this creates real narrative stakes and prevents Instant Exit from being a reliable 'get out of jail free' card at rank 4"
  - "2-action cast is correct for rank 4 teleportation; 1-action would be too efficient given the area-of-effect nature"
- **Overridable:**
  - "GM may prefer that the portal requires an object (a wall) to attach to, not just 'any flat surface' — the 5e text implied walls specifically"
  - "The malfunction table (d20=1 = random plane) could be expanded to a more interesting table if the GM wants more variety in destinations"
- **Checklist failures:** none recorded.

Note: jmnario's own anchor cites "Dimension Door" as the reference spell, but no spell by that name exists in the current PF2e Remaster snapshot searched for this dossier (see Similar official spells below) — the closest structural analog found is Translocate.

## Similar official spells

- **Translocate (rank 4)** — same rank, same `teleportation` trait. Controlled self-teleport to an unoccupied space you can see within range; no randomness, no group-transport, and explicitly fails if it would carry an unwilling second creature. The direct rank-4 contrast to Instant Exit's uncontrolled, group-capable, longer-range portal.
- **Flicker (rank 4)** — same rank, teleports the caster 10 feet in a GM-determined random direction each turn (sustained) while granting damage resistance; a smaller-scale, self-only analog of Instant Exit's "randomness determined outside the caster's control" design.
- **Teleport (rank 6)** — precise, multi-target teleport to any known location, with a "mishap" chance (arriving off-target, or worse, on imprecise knowledge) rather than Instant Exit's flat malfunction-to-random-plane chance. Two ranks above Instant Exit; shows what the fully-controlled, higher-rank version of "everyone teleports together" looks like.

## Prior astra touches

None found — `Instant Exit` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly).

## Open flags

- jmnario's own conversion notes cite "Dimension Door" as the anchor spell, but that exact spell name was not found in the searched PF2e Remaster snapshot (`apps/codex/data/snapshots/foundry/pf2e-8.3.0`) — worth confirming whether it was renamed/replaced in the Remaster or the anchor reference is stale.
- The `planara` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set.
- Heightening content (both 5th and 7th tiers) has no 5e source and was invented wholesale during conversion.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose; no curse-removal language present.
