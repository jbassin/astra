# Monstrous Copy: Eye Stalks

## Header block

- **Rank:** 7
- **Routing:** `ledger:no-comparable-profile`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score recorded — pooled purely on the ledger routing reason, not a numeric gate)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "table-roll spell — table-entry dice excluded from EV"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt, incapacitation, manipulate, morph, visual (rarity: common)
- **Traditions:** primal
- **Cast:** 3 actions
- **Range:** 120 feet
- **Targets:** 3 creatures
- **Defense:** Will save (non-basic)
- **Duration:** varies

## The 5e original

- **Level:** 7 (Druid)
- **School:** gestalt (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** 120 feet (point)
- **Components:** V, S (no material)
- **Duration:** Instantaneous

> You draw upon your knowledge of monsters to fight like them. You sprout three Beholder eye stalks and shoot rays of light from them. You can direct the rays at the same target or at different ones. For each ray, roll 1d10 to determine its effect. If you roll the same result more than once, reroll until you have no duplicate results.

**d10 table:**
1. **Charm Ray.** Wisdom save or charmed 1 hour, or until you/companions harm it.
2. **Paralyzing Ray.** Constitution save or paralyzed 1 minute (save each turn to end).
3. **Fear Ray.** Wisdom save or frightened 1 minute (save each turn, disadvantage if caster visible).
4. **Slowing Ray.** Dexterity save or speed halved 1 minute, no reactions, action-or-bonus-action only (save each turn).
5. **Enervation Ray.** Constitution save, 8d8 necrotic damage (half on success).
6. **Telekinetic Ray.** Strength save or moved up to 30 feet and restrained until start of caster's next turn or caster incapacitated.
7. **Sleep Ray.** Wisdom save or falls unconscious 1 minute; wakes on damage or an adjacent creature spending an action. No effect on constructs/undead.
8. **Petrification Ray.** Dexterity save or begins turning to stone and restrained; repeats save at end of its next turn — success ends it, failure = petrified until *greater restoration* or similar magic.
9. **Disintegration Ray.** Dexterity save or 10d8 force damage; reduced to dust at 0 HP.
10. **Death Ray.** Dexterity save or 10d10 necrotic damage; dies if reduced to 0 HP.

**At Higher Levels:** Using a slot of 8th level or higher creates one additional ray per slot level above 7th.

## The conversion (canonical store)

> You draw upon your knowledge of the Beholder, sprouting three writhing eye stalks from your skull. Each eye stalk fires a magical ray at a different target within range (or the same target, if you choose). For each of the three rays, roll 1d8 on the following table to determine its effect. Reroll duplicate results until you have three distinct effects. Each ray is resolved separately and uses your spell DC. All rays fire simultaneously when you Cast the Spell.
>
> 1. **Charm Ray.** Will save; failure = *Fascinated* by you, spends its first action each turn approaching/aiding you; lasts 1 minute or until you/allies harm it.
> 2. **Fear Ray.** Will save; failure = *Frightened 3* (*Frightened 4* on crit failure), decreasing by 1 at the end of each of its turns.
> 3. **Slowing Ray.** Will save; failure = *Slowed 1* for 1 minute (*Slowed 2* on crit failure); can re-save at end of each turn to end it.
> 4. **Sleep Ray.** Will save; failure = falls *Unconscious* 1 minute; wakes on damage or an adjacent creature spending an action to rouse it. No effect on constructs/undead.
> 5. **Enervation Ray.** Fortitude save; failure = 6d10 void damage (12d10 crit failure; half on success).
> 6. **Telekinetic Ray.** Fortitude save; failure = moved up to 20 feet and *Grabbed* until start of caster's next turn.
> 7. **Petrification Ray.** Fortitude save; failure = *Slowed 1* and becoming *Petrified*; another Fortitude save at start of caster's next turn — failure = *Petrified*, success ends it.
> 8. **Disintegration Ray.** Fortitude save; failure = 10d10 force damage (20d10 crit failure; half on success); reduced to dust at 0 HP.
>
> **Heightened (8th)** Fire four rays instead of three (roll 1d8 four times, rerolling duplicates). Enervation and Disintegration damage each +2d10.
> **Heightened (9th)** Fire five rays instead of four. All ray damage +2d10 further over the 8th-rank totals.

Structured fields agree with the prose: `defense.save.statistic: "will"` covers only the default/example listing (individual table entries actually split Will vs Fortitude by ray — the top-level `defense` field can only record one statistic, so it reflects the majority-Will table, not a per-entry field). `heightening.type: "fixed"` with levels `{8, 9}` matches the two heightened blocks. `duration.value: "varies"` matches the mixed-duration table entries.

## What changed, plain English

The core beholder-ray-table conceit survives intact — three rays, target selection flexibility, reroll-on-duplicate, resolved simultaneously — but the table itself was restructured rather than ported 1:1.

- **Table size cut d10 → d8** (10 effects → 8). Two 5e entries were removed outright: **Paralyzing Ray** (folded into the reworked Petrification Ray's staged approach) and **Death Ray** (removed entirely — a save-or-die at rank 7 with no incapacitation trait had no precedent).
- **Damage numbers changed:** Enervation 8d8 necrotic → 6d10 void (avg 44→33, but now half-on-success instead of only half-on-success already present); Disintegration 10d8 force → 10d10 force (avg 45→55); Death Ray's 10d10 necrotic save-or-die was dropped along with the entry.
- **Save types reassigned per-ray:** 5e used a different ability per ray (Wis/Con/Dex/Str across the table); the PF2e version collapses everything to just Will (Charm/Fear/Slowing/Sleep) or Fortitude (Enervation/Telekinetic/Petrification/Disintegration).
- **Range on the Telekinetic Ray:** 30 feet → 20 feet; condition *restrained* → *grabbed*, and the "until incapacitated" release clause was dropped (now just "until start of your next turn").
- **Petrification staging changed:** 5e = restrained → re-save at end of *its own* next turn; PF2e = slowed 1 + becoming petrified → re-save at start of *caster's* next turn, with success now ending the petrification outright (5e's failure path led to petrified "until freed by *greater restoration*"; the PF2e version doesn't specify a removal method in the ray text itself).
- **Cast time:** 5e 1 action → PF2e 3 actions (per adapter warning, this is a structural default since "3" isn't independently parsed as a special action-time).
- **Traits added with no 5e basis:** `incapacitation` (applied to the whole table because several rays can remove a creature from the fight), `morph` (from the "gestalt" 5e school), `visual`, `gestalt` itself as a literal trait name.
- **Heightening restructured:** 5e's "+1 ray per slot level above 7th" (open-ended) becomes two fixed PF2e heightened tiers (8th: 4 rays, +2d10 to two rays; 9th: 5 rays, +2d10 further) — capped rather than linear.

## Converter's notes

**Anchor:** Sunburst (rank 7, 8d10 large AoE) for rank-7 power budget; Mask of Terror (rank 7, fear multi-target) for multi-target ray reference

**Archetype:** control/debuff (morph; multi-target random ray table, incapacitation)

**Balance bullets:**
- "Three rays at rank 7 with 3-action cast: calibrated against the rank-7 power budget. Each individual ray is below the rank-7 single-target save budget (the random table introduces variance as the cost)."
- "Incapacitation covers the entire table because multiple rays (Sleep, Charm, Slowing, Petrification) can remove creatures from the fight on a failed save."
- "Death Ray from 5e removed: a save-or-die at rank 7 without established precedent (Massacre is rank 9) and the random-table context would make it appear uncapped; its slot is filled by Disintegration Ray which deals very high damage instead."
- "Paralyzing Ray (5e #2) absorbed: paralysis was covered by Petrification Ray's staged approach, avoiding a duplicate paralysis effect."
- "Enervation (void) and Disintegration (force) ray damages calibrated against rank-7 single-target save damage: 6d10 void (avg 33) on failure for Enervation, 10d10 force (avg 55) on failure for Disintegration — Disintegration is high because it's the damage-only ray without a condition."

**Overridable:**
- "Could restore the d10 table (10 effects) including a Death Ray with explicit incapacitation and a DC threshold (e.g., 'if this damage would reduce the target to 0 HP, it dies' — but add incapacitation trait)."
- "Charm Ray could be 'charmed by you for 1 minute' instead of 'fascinated' for a more standard effect — fascinated is slightly weaker and more appropriate for a non-incapacitation table context."

**Checklist failures:** none recorded.

## Similar official spells

- **Petrify** (rank 6) — Single-target Fortitude staged petrification: success = slowed 1 for 1 round, failure = slowed 1 + repeating incapacitation Fortitude save, critical failure = petrified. Directly comparable to the Petrification Ray sub-effect, one rank lower and as the spell's whole payload rather than 1 of 8 possible outcomes.
- **Disintegrate** (rank 6) — Single-target spell attack, 12d10 damage (no type) with basic Fortitude save on a hit, destroys up to a 10-foot cube of unattended matter/objects with no save. Comparable to the Disintegration Ray sub-effect at one rank lower and roughly the same damage die count (12d10 vs the ray's 10d10).
- **Chain Lightning** (rank 6) — Single roll of 8d12 electricity, basic Reflex, chains to additional targets within 30 feet of each prior target (caster chooses how many, no duplicate targets). A same-rank-band comparison for "one casting, multiple targets, one resolved effect each," though it deals one damage type to everyone rather than rolling a per-target random table.
- **Sunburst** (rank 7) — 8d10 fire in an area, basic Reflex, all creatures in the burst. Cited by the converter as the rank-7 power-budget anchor; differs from Eye Stalks in being a single area effect rather than 3 separately-targeted, separately-resolved rays.
- **Mask of Terror** (rank 7) — Single-target Will save, makes attackers see the target as horrifying; on failure the attacker becomes fear-immune to it until end of its next turn (a defensive/deterrent effect, not damage or debuff). Cited by the converter as the multi-target-ray-table anchor reference, though its own mechanic is single-target and non-random.

## Prior astra touches

Not in `revisions.md`'s deviations list — the store's description/traits/duration/etc. for this spell match the fresh adapter re-conversion exactly (0 deviations recorded for this slug). No hand edits since seeding.

## Open flags

- The top-level `system.defense.save.statistic` field is fixed to `"will"`, but the description's per-ray table actually alternates between Will (rays 1–4) and Fortitude (rays 5–8) — the single structured field cannot represent this split, so it only reflects part of the description.
- `system.duration.value` is the free-text string `"varies"` rather than a structured duration, matching the description's mixed effect durations (instant damage vs. sustained conditions).
- The store keeps the literal trait `gestalt` (the 5e/vendor school name) as a player-facing PF2e trait; it is not a standard published PF2e trait.
- Adapter warning notes table-roll EV was excluded from any scoring pass and that the 8th/9th heightening text (extra rays, not a pure damage bump) is kept as prose-only, not structurally represented in `heightening`.
- Reroll-duplicates language ("roll 1d8... Reroll duplicate results until you have three distinct effects") is preserved from 5e but is manual GM/player-tracked, not automated by any structured field.

## Options & staff lean (enrichment, 2026-07-23)

Billed as the most mechanically novel spell in the set, and the conversion turns out to
be one of the most careful: Death Ray removed with stated precedent reasoning (save-or-die
lives at rank 9, Massacre), Paralyzing Ray folded into the staged Petrification (matching
the official Petrify r6 idiom and consistent with our Grey Frost affliction precedent),
incapacitation applied table-wide, damage rays calibrated against the r7 budget, and the
open-ended 5e ray scaling capped into two fixed tiers. The Will/Fort split being
unrepresentable in the single structured defense field is a Foundry schema limit — prose
governs, nothing to fix.

- **A. Keep as-is.**
- **B. Restore the Death Ray per his overridable** — reintroduces a rank-7 save-or-die
  the converter deliberately removed for precedent reasons; anti-lean.
- **C. Nudge incapacitation off the pure-damage rays** — technically over-gated (a
  higher-level creature saves better even vs plain damage), but per-ray trait splits
  aren't expressible; the simple table-wide trait is the right call.

**Lean: A.** Fast review despite the page count.
