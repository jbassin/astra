# Rearrange Fate

## Header block

- **Rank:** 3
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual supplied in the chunk-10 triage list (ledger-routed, not quantitatively scored)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, fortune, manipulate, mercuromancy (rarity: common)
- **Traditions:** arcane, occult, primal
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** touch
- **Target:** 1 willing creature
- **Area:** none
- **Defense:** none
- **Duration:** not sustained, "1 hour"
- **Damage:** none
- **Seeded from:** convertedName "Rearrange Fate" / originalName "Rearrange Fate" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 3rd
- **School:** Mercuromancy (homebrew school)
- **Casting time:** 1 action
- **Range:** Point, touch
- **Components:** V, S, M (two grains of salt)
- **Duration:** 1 hour, no concentration
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard
- **Ritual:** No

> You grant a willing creature to take control of their own fate. The creature rolls two d20s and notes the rolls. The creature must use those two results for its next two d20 rolls during the spell's duration, but it can choose the order in which the results are used.

**At Higher Levels:** For each spell slot used higher than 3rd level, you can affect one additional creature.

## The conversion (canonical store)

You grant a willing creature the ability to take control of their own immediate fate. The creature rolls two d20s and notes both results. For the next two d20 rolls the creature makes during the spell's duration, it must use those pre-rolled results — but it can choose which pre-rolled result applies to which roll. The creature cannot roll d20s normally for these two rolls; it draws from its fate pool instead. Any unused fate results are lost when the spell ends.

A creature can only benefit from one casting of Rearrange Fate at a time.

---

**Heightened (+1)** You can target 1 additional willing creature.

No structured-field disagreements found — the store has no damage/save/heightening structured fields to check against prose (this is a pure narrative/mechanical-text utility spell), and the described mechanic (2 pre-rolled d20s, order chosen by the creature, touch range, 1-hour duration) is consistent throughout.

## What changed, plain English

The two-pre-rolled-d20s-in-reserve mechanic, the "choose which result applies to which roll" flexibility, the touch range on a willing creature, and the 1-hour non-concentration duration are all preserved essentially verbatim.

- **Numbers:** casting time is unchanged (1 action in 5e vs. the store's 2-action cast — note this is actually an increase in action cost, since 5e's original is 1 action and the store's `system.time.value` is "2"). Duration is unchanged (1 hour). The core mechanic (2 stored d20 results, usable for the next 2 d20 rolls) is unchanged.
- **Content added:** two explicit clauses are new in the store's prose that aren't in the terser 5e original: (1) "The creature cannot roll d20s normally for these two rolls; it draws from its fate pool instead" — an explicit anti-mixing clarification (5e's text implies this but doesn't state it), and (2) "A creature can only benefit from one casting of Rearrange Fate at a time" — an explicit no-stacking clause with no 5e counterpart at all. Also new: "Any unused fate results are lost when the spell ends" — 5e's text doesn't address what happens to unused pre-rolled results when the duration expires.
- **Heightening restructured:** 5e's upcast rule ("for each spell slot used higher than 3rd level, affect one additional creature") becomes the store's `+1`-per-rank interval heighten — functionally the same rate (1 additional creature per rank above base), just phrased in PF2e's per-rank-heighten convention instead of 5e's per-slot-level convention.
- **Material component:** the 5e "M (two grains of salt)" component is dropped; `system.cost.value` is empty in the store.

## Converter's notes

**Anchor:** "Sure Strike (rank 1, reroll an attack) and Foresight (rank 9, fortune on all rolls) — Rearrange Fate is a middle tier: 2 pre-rolled results stored for future use at rank 3"

**Archetype:** buff (fortune, pre-rolled die pool)

**Balance bullets:**
- "The mechanic is weaker than Heroism (rank 3, +1 status to everything for 10 min) but more flexible — you can guarantee a high roll or dump a low one on any 2 checks over 1 hour."
- "1-hour duration at rank 3 is the exploration tier; appropriate for a planning/preparation spell."
- "The inability to re-roll within the effect (must use the two stored results) is a key balance lever — you're locked into what the dice gave you, good or bad."
- "Heightening at +1 target per +1 rank is conservative but clean."

**Overridable:**
- "Could reduce to a 10-minute duration to match Heroism if the 1-hour window feels too strong for a rank-3 fortune spell."
- "Could allow the target to choose when to make the two pre-rolls (at any point during the duration) rather than rolling at cast time — gives more control but less 'fate' flavor."

**Checklist failures:** none.

## Similar official spells

- **Sure Strike** (rank 1) — roll twice, take the better, for the caster's next attack roll only; the converter's own low-end anchor, shows the baseline single-roll "advantage" pattern Rearrange Fate is built up from (single free re-roll vs. two banked pre-rolled results usable across an hour).
- **Bit of Luck** (rank 1, focus) — target rolls twice and takes the better on its next saving throw, then the spell ends; another single-use "roll twice, take better" pattern at the opposite end of the action-economy spectrum (a cheap focus spell vs. Rearrange Fate's 2-action rank-3 slot spell).
- **Heroism** (rank 3) — flat +1 status bonus to attack rolls, Perception, saves, and skill checks; the converter's own direct same-rank comparison point, illustrating the "guaranteed small bonus to everything" alternative against Rearrange Fate's "two banked strong results, usable on anything."
- **Foresight** (rank 9) — grants a sustained sixth-sense/fortune-adjacent defensive benefit; the converter's own high-end anchor, showing what "fortune magic" costs when scaled up to its most powerful published form.

## Prior astra touches

None found — no `rearrange-fate` entries in `revisions.md` (matches the fresh baseline re-conversion exactly).

## Open flags

- Action-cost increase: the 5e original is a 1-action cast; the store's `system.time.value` is "2" — this is a cost increase relative to the 5e source that isn't discussed in jmnario's `changedElements` list at all (his notes only discuss the duration, fortune trait, heightening rate, no-stacking clause, and tradition broadening — action cost isn't mentioned).
- Two new mechanical clauses (no-mixing-with-normal-rolls, no-stacking-multiple-castings) and one new narrative clause (unused results lost on expiry) were added during conversion with no 5e-source basis, though all three read as clarifying/safety-valve text rather than power changes.
- Heightening is text-only (description appendix), not structurally represented in `system.heightening`, per the adapter warning — no `heightening` key exists on this spell's JSON.
