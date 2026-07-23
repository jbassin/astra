# Patishvat's Perfect Pocket

## Header block

- **Rank:** 1
- **Routing:** `ledger:long-cast`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score — pooled on the long-cast ledger routing reason, flagging the 1-minute cast time on a rank-1 spell for review)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, extradimensional, manipulate, planara, teleportation (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 1 minute
- **Cost:** a small velvet bag (consumed)
- **Range:** self
- **Targets:** you
- **Defense:** none (`system.defense` is `null`)
- **Duration:** until dispelled

## The 5e original

- **Level:** 1 (Ranger, Seeker, Warlock, Wizard)
- **School:** planara (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V, S, M — "a small velvet bag" (no cost/consumed flag specified in the source text)
- **Duration:** Permanent

> You create a pocket of extraplanar space to hold knick-knacks. Once created, the pocket remains tied to your person and only disappears once dispelled. You may spend an action to store any non-living object that fits in a 5x5x5 foot cube in the pocket. You may also spend an action to retrieve anything placed in the pocket back into your hand. The space has a limit of 150 pounds, and if this limit is exceeded or the pocket is dispelled all of the pocket's contents are emptied onto the ground in front of the caster. The pocket is normally invisible, but a creature with truesight can see it as an opaque, floating orb circling the caster's head.

No `entriesHigherLevel` block (no upcast text).

## The conversion (canonical store)

> You fold a small pocket of extraplanar space and anchor it to your person. The pocket can hold any number of objects that individually fit within a 5-foot cube, up to a combined weight of 150 pounds. The pocket does not count against your Bulk unless a single item exceeds 4 Bulk, in which case that item's excess Bulk counts normally. You can stow or retrieve a single held or worn item into or from the pocket as a single action with the manipulate trait. Objects stored in the pocket experience no passage of time and are perfectly preserved. Living creatures cannot be placed in the pocket; the spell automatically fails if attempted on a living creature.
>
> The pocket is invisible to normal senses. A creature with Truesight can see it as a faint opaque orb orbiting your head. If the spell is dispelled or you die, all contents are deposited in a pile in your space (or the nearest unoccupied space).
>
> **Heightened (3rd)** The weight limit increases to 500 pounds and items of up to 10 Bulk individually can be stored.

Structured fields agree with the prose: `time.value: "1 minute"` matches (see "What changed" — this differs from 5e's 1-action); `cost.value: "a small velvet bag (consumed)"` matches; `duration.value: "until dispelled"` matches; `heightening.levels: {3}` matches the single heightened tier.

## What changed, plain English

- **Cast time lengthened:** 5e 1 action → PF2e **1 minute**. This is the single largest mechanical change and is exactly why this spell routed to `ledger:long-cast` — a rank-1 utility spell with a 1-minute cast is unusually slow relative to most rank-1 spells (typically 1–2 actions).
- **Bulk system introduced with no direct 5e basis:** 5e used a flat "150 pounds" weight limit with no other encumbrance interaction. PF2e adds "The pocket does not count against your Bulk unless a single item exceeds 4 Bulk, in which case that item's excess Bulk counts normally" — a wholly new clause translating 5e's pounds-based system into PF2e's Bulk system, beyond a simple unit conversion.
- **Time-preservation clause added with no 5e basis:** "Objects stored in the pocket experience no passage of time and are perfectly preserved" — 5e's original never mentions time dilation or preservation inside the pocket at all.
- **Living-creature restriction made explicit with a new failure clause:** 5e says nothing about what happens if you try to store a living creature (silently implied not to work, since it says "non-living object"). PF2e explicitly states "the spell automatically fails if attempted on a living creature" — a new, explicit failure-mode clause.
- **Store/retrieve mechanic reworded:** 5e allowed storing "any non-living object that fits in a 5x5x5 foot cube" and separately retrieving "anything placed in the pocket back into your hand" as two separate action uses. PF2e frames it as "stow or retrieve a single held or worn item ... as a single action with the manipulate trait" — narrowing the storable-item class from "any non-living object" to "a single held or worn item," which is a meaningfully tighter scope than the 5e original's broader "any object."
- **Dispel-overflow behavior changed:** 5e says exceeding the weight limit *or* being dispelled empties everything "onto the ground in front of the caster." PF2e's version only mentions the pocket being "dispelled or you die" as triggers, dropping the weight-limit-exceeded trigger and adding "or you die" as a new trigger with no 5e basis; contents land "in your space (or the nearest unoccupied space)" rather than "in front of" the caster.
- **Cost note added:** the store's `cost.value` marks the velvet bag "(consumed)" — the 5e original's material component text doesn't specify whether the bag is consumed.
- **Traits added with no 5e basis:** `extradimensional`, `teleportation` (per the converter's notes, added because these are the PF2e-required traits for pocket-dimension spells — extradimensional for Dimensional Lock interactions, teleportation for the retrieve-from-nowhere action). `planara` mirrors the 5e school field (adapter-level normalization seen across this batch).
- **Duration framing:** 5e "Permanent" → PF2e "until dispelled," described in the converter's notes as functionally identical phrasing for a counterable permanent effect (counteract rank 1).

## Converter's notes

**Anchor:** Bag of Holding (rank 1 consumable item) / Portable Hole (rank 4 item) — extradimensional storage; no clean spell analog

**Archetype:** utility (extradimensional storage, permanent)

**Balance bullets:**
- "No PF2e spell analog for permanent extradimensional storage at rank 1; the Bag of Holding is a rank-1 consumable item. This spell essentially creates a Bag of Holding effect permanently tied to the caster."
- "Key limiter: until dispelled = counteract rank 1, meaning any Dispel Magic at rank 1 can dump all contents. This is the primary balance lever."
- "1-minute cast time and consumed material cost (velvet bag) are the rank-appropriate taxes for a permanent utility effect."
- "Named-caster spell (Patishvat's) — flagged per plan: the PF2e-idiomatic form would be a focus spell or class feat, not a general spell. Kept as regular spell per plan instructions."

**Overridable:**
- "The PF2e-idiomatic conversion is a focus spell or class feat tied to a Planarist/Seeker class. Keeping it as a regular spell means any caster with access to the spell list can pick it up."
- "Could raise to rank 3 (matching the Bag of Holding's item level) with a larger weight cap and more safety valves."
- "The extradimensional/teleportation traits could be simplified — some GMs prefer not to add teleportation to a storage spell."

**Checklist failures:**
- "Duration 'until dispelled' at rank 1 is an unusual PF2e pattern (most rank-1 spells last 1 min/10 min at most). The 5e original was explicitly permanent. Decision: kept as 'until dispelled' with counteract rank 1, which means Dispel Magic can end it — this is the safety valve. Flagged for GM awareness."

## Similar official spells

- **Secret Chest** (rank 5) — Touch, banishes a container (up to 10 Bulk) and its contents to the Ethereal Plane, retrievable at will until the caster's next daily prep. Four ranks higher; the closest official "extraplanar storage" spell, though it's a fixed-duration container-banishment rather than a persistent personal pocket, and stores a whole container rather than individual items.
- **Rope Trick** (rank 4) — Touch, creates an 8-hour extradimensional space accessible by climbing a rope; different function (a hideable room, not item storage) but shares the `extradimensional` trait and the "no clean lower-rank analog" positioning the converter flagged. Three ranks higher.
- **Creation** (rank 4) — Conjures temporary objects rather than storing existing ones; included as a same-rank-band utility reference for what a rank-4 "matter-manipulation" utility spell looks like, though functionally unrelated to storage.
- **Wall of Force** (rank 6) — Not functionally similar, but shares the converter's own comparison point for "sustained/permanent utility effects with a counteract safety valve" (see Mystic Negation's dossier for the same anchor usage); included here only as a cross-reference for reviewers tracking anchor reuse across this batch.

## Prior astra touches

Not in `revisions.md`'s deviations list — the store's fields match the fresh adapter re-conversion exactly (0 deviations recorded for this slug). No hand edits since seeding.

## Open flags

- Routing reason is `ledger:long-cast` — the 1-minute cast time on a rank-1 spell is the explicit reason this spell is in the manual-review pool; no other numeric flag is attached.
- The converter's own overridable/checklist notes flag two unresolved tensions: (1) this may be more PF2e-idiomatic as a focus spell/class feat rather than a general spell, and (2) "until dispelled" duration at rank 1 is an unusual pattern for the rank band, with counteract rank 1 as the stated safety valve.
- The store's storable-item scope ("a single held or worn item") is narrower than the 5e original's ("any non-living object that fits in a 5x5x5 foot cube") — the store text doesn't restate the 5e original's cube-size language for what counts as storable, relying instead on the Bulk/weight caps.
- `system.defense` is `null` and there is no target other than the caster — consistent with a pure self-utility effect, no save/defense mechanic needed.
