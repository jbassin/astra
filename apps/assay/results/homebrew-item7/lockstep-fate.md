# Lockstep Fate

## Header block

- **Rank:** 2 · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (queue.json: `routing: "ledger:utility"`, `poolReason: "ledger"`, `verdict: null`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, fortune, manipulate, mental, mercuromancy · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 2 actions · **Range:** 30 feet · **Target:** 1 creature
- **Defense:** Will save (basic: false)
- **Duration:** sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)

## The 5e original

- **Name:** Lockstep Fate · **Source:** tfc (homebrew) · **Level:** 2 · **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** 30 feet (point)
- **Components:** V, S, M — "a pair of identical pebbles"
- **Duration:** Concentration, 1 minute
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> You tie your fate to another. A creature you can see must make a Wisdom saving throw or your luck becomes entangled with theirs. For the duration of the spell, whenever you make an ability check, saving throw, or attack roll that you dislike, make a note of your original result, then roll again and use the second result. The next time the targeted creature would make an ability check, saving throw, or attack roll, it automatically uses your original result instead and the spell ends. Once you select a roll to hold in reserve you cannot replace it with a different roll.

No `entriesHigherLevel` block in the 5e source.

## The conversion (canonical store)

You reach across the threads of fate and entangle your luck with that of one creature you can see. The target must attempt a Will save. On a failure, your fortunes are linked for the spell's duration.

While the link holds, once per round when you roll any d20 (an attack roll, skill check, or saving throw) and dislike the result, you may choose to Hold the Roll — mentally noting the result. The next time the linked creature would roll any d20, it automatically uses your Held Roll as its result instead, and the Hold is discharged. You can only hold one roll at a time; if you have already held a roll, you must discharge it before holding another.

The link ends when you discharge a held roll, when you stop sustaining the spell, or when the duration expires.

- **Critical Success** The target is unaffected and immune to this spell for 24 hours.
- **Success** The target is unaffected.
- **Failure** The link forms for the duration.
- **Critical Failure** The link forms and the first Held Roll you discharge is treated as a natural 1 for the target (regardless of what the roll actually was).

---

**Heightened (4th)** You can hold up to two rolls simultaneously. You choose which held roll to assign when the linked creature makes its roll.

**Heightened (6th)** You can target up to 3 creatures. Each must save separately. You maintain a single pool of held rolls (maximum 2 at a time) and may assign any held roll to any linked creature's next d20.

No `@UUID` references in this description. Structured fields agree with the prose: `defense.save.statistic = "will"` matches the Will save text; `heightening.levels = {"4": {}, "6": {}}` matches the two Heightened blocks (both entries are empty objects — no structured payload, text-only per the adapter warning).

## What changed, plain English

- **Save:** 5e Wisdom save → PF2e Will save (both map to the "resist a mental/fate effect" slot).
- **Structure:** 5e had a single pass/fail outcome with no degrees of success. The conversion adds full four-degree PF2e structure: a Critical Success clause (24-hour immunity, absent from 5e) and a Critical Failure clause (the held roll is forced to a natural 1 for the target, also absent from 5e — 5e's held roll was always "your original result," never floored to a 1).
- **Mechanic wording:** 5e's "ability check, saving throw, or attack roll" is generalized to PF2e's "any d20 roll" (all three 5e roll types collapse into one d20-roll category in PF2e).
- **Action economy:** 5e 1 action → PF2e 2 actions to cast (both cast in a single turn either way; PF2e's action-per-cast baseline is higher).
- **Material component:** 5e's "a pair of identical pebbles" is dropped entirely — `cost.value` is an empty string in the store.
- **Heightening:** 5e had no upcast text at all for this spell. The conversion adds two ADDED heightened tiers with no 5e basis: 4th (hold 2 rolls) and 6th (target up to 3 creatures, shared pool of up to 2 held rolls).
- **Traits added with no 5e basis:** fortune, mental, mercuromancy (school-derived), concentrate, manipulate (all PF2e-standard tags with no explicit 5e counterpart, since 5e has no trait system).
- **Traditions:** 5e class list (Bard/Druid/Seeker/Sorcerer/Warlock/Wizard) collapses to arcane + occult.

## Converter's notes

- **Anchor:** "Acid Grip (rank 2, non-basic Reflex, condition rider) — both are rank-2 spells with a save and a persistent conditional effect; Lockstep is control not damage"
- **Archetype:** control/debuff (fate-entanglement)
- **Balance bullets:**
  - "The core mechanic (hold a die result, impose it on the target) is a unique fate-swap control effect. Closest analog in terms of power budget is a rank-2 debuff with a sustained component — the 'held roll' imposes an unknown penalty on the target's next key moment."
  - "Will save with sustained-up-to-1-min duration matches the combat-grade buff cap for PF2e control spells."
  - "The 'hold only one roll at a time' constraint (preserved from 5e) prevents snowballing — you can't bank 6 bad rolls and choose the worst."
  - "Fortune + divination + mental trait combination correctly gates this against mindless creatures and applies the correct immunity layers." (Note: the current store's trait list does not include "divination" — see Open Flags.)
  - "Crit-fail natural-1 imposition is the four-degree escalation that 5e lacked — gives a meaningful crit tier without making the spell a guaranteed win."
- **Overridable:**
  - "Could remove the crit-fail natural-1 escalation if the GM finds it too swingy (an imposed nat-1 at rank 2 is a harsh outcome, though rare at ~5%)."
  - "The 'hold only 1 roll at a time' constraint could relax to 2 at base rank — the 5e version implied this limit but the spell would be meaningfully stronger."
- **Checklist failures:** none recorded.

## Similar official spells

- **Sure Strike (rank 1)** — fortune trait, roll twice on your own next attack and take the better; single-target self-buff, no target save. Compares on the "manipulate a d20 outcome" axis but is self-only and single-roll, vs. Lockstep Fate's targeted, cross-creature, repeatable-per-round mechanic.
- **Perceive the Threads of Fate (rank 3, mythic)** — grants mythic Perception/Reflex proficiency and up to 3 sustained fortune re-rolls on your own attack/skill checks. Self-only fortune-pool spell one rank up; no targeting or save involved.
- **Perseiss's Precautions (rank 3)** — touch a target, grants one fortune re-roll on a specific future initiative-adjacent check, then the target is immune for 24 hours. Shares the "banked, one-shot re-roll that expires" shape and the 24-hour-immunity-after-use idiom that Lockstep Fate's Critical Success clause echoes, one rank up and touch-range rather than 30 ft.

## Prior astra touches

None. `revisions.md` has no entry for Lockstep Fate — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- The converter's own balance bullet cites a "fortune + divination + mental" trait combination as load-bearing for immunity gating, but the store's trait list is `concentrate, fortune, manipulate, mental, mercuromancy` — no "divination" trait is present. The bullet and the structured traits disagree.
- Both fixed-rank Heightened entries (4th, 6th) are text-only in `system.heightening.levels` (empty `{}` objects) — the adapter cannot structurally represent "hold N rolls" / "target N creatures" as a parseable bump, per its own adapterWarning.
- Material component ("a pair of identical pebbles") from the 5e original is fully dropped rather than retained as flavor text or a `cost` value.
