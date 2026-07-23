# Lucky Stars

## Header block

- **Rank:** 3 · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (queue.json: `routing: "ledger:utility"`, `poolReason: "ledger"`, `verdict: null`)
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, fortune, manipulate, mercuromancy · **Rarity:** common
- **Traditions:** arcane, occult, primal
- **Cast:** 2 actions · **Range:** self · **Target:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)

## The 5e original

- **Name:** Lucky Stars · **Source:** tfc (homebrew) · **Level:** 3 · **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V, S, M — "a rabbit's foot or other lucky charm"
- **Duration:** Concentration, up to 1 minute
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> You pluck three small pockets of fate out of the air, for use at a later time. They appear as a triangle of sparkling stars, orbiting your head. Whenever you make an attack roll, an ability check, or a saving throw, you can spend expend one star to roll an additional d20. You can choose to expend one of your stars after you roll the die, but before the outcome is determined. You choose which of the d20s is used for the attack roll, ability check, or saving throw.
>
> You can also expend one star when an attack roll is made against you. Roll a d20, and then choose whether the attack uses the attacker's roll or yours.

No `entriesHigherLevel` block in the 5e source (this spell has no native 5e upcast text).

## The conversion (canonical store)

You pluck three small pockets of fate from the air, manifesting as sparkling stars orbiting your head. You have 3 star charges that persist for the duration.

Whenever you attempt an attack roll, skill check, Perception check, or saving throw, you can spend 1 star charge as a free action to roll an additional d20. You may choose which result to use. You can spend a star charge after you roll but before the outcome is determined.

Whenever an attack roll is made against you, you can spend 1 star charge as a free action (even during another creature's turn) to roll a d20 and force the attacker to use the lower result (misfortune effect). You cannot spend star charges for both fortune and misfortune on the same roll.

The stars fade when all charges are spent or the duration expires.

---

**Heightened (+2)** You gain 1 additional star charge when you cast this spell (starting with 4 at rank 5, 5 at rank 7, etc.).

No `@UUID` references. No `successTiers`/degree-of-success structure — this is a resource-pool buff, not a save spell, so none is expected. Structural note: `system.heightening` is entirely **absent** from the store JSON (no key at all), even though the description carries a "Heightened (+2)" appendix — see Open Flags.

## What changed, plain English

- **Mechanic terminology:** 5e's implicit "roll twice, take the one you want" (an advantage-like grant) is renamed to PF2e's "fortune" vocabulary; the misfortune (force-attacker-to-use-lower-roll) branch is likewise renamed but mechanically identical to the 5e text.
- **Action cost for spending a charge:** 5e doesn't specify an action cost for either use (implicitly free/no-action within the trigger). PF2e makes both explicit "free action" uses, including the defensive one being usable "even during another creature's turn."
- **Added restriction with no 5e basis:** "You cannot spend star charges for both fortune and misfortune on the same roll" — an explicit anti-stacking clause not present in the 5e text.
- **Skill/Perception checks:** 5e's "attack roll, ability check, or saving throw" list is widened in the conversion to explicitly include "skill check, Perception check" — a slight scope clarification (Perception is an ability check in 5e terms but is called out separately here since PF2e treats it as its own category).
- **Action economy:** 5e 1 action → PF2e 2 actions to cast.
- **Material component:** 5e's "a rabbit's foot or other lucky charm" is dropped; `cost.value` is empty.
- **Heightening:** 5e had none. The conversion adds an interval heightening line ("+2": +1 charge, "starting with 4 at rank 5, 5 at rank 7") with no 5e basis, but this text lives only in the description — `system.heightening` is absent from the structured data entirely (not even a `{}` placeholder), unlike other spells in this chunk that have fixed-rank heightening scaffolding.
- **Traditions:** 5e class list (Bard/Druid/Seeker/Sorcerer/Warlock/Wizard) collapses to arcane + occult + primal.

## Converter's notes

- **Anchor:** "Foresight (rank 9) — fortune effect on all d20s; at rank 3 heavily restricted to 3 charges instead of duration"
- **Archetype:** buff (fortune/misfortune charge pool)
- **Balance bullets:**
  - "Anchored to the fortune/misfortune mechanic budget: 3 charges of advantage-equivalent at rank 3 is comparable to a limited-use version of Foresight's always-on fortune (rank 9)."
  - "The misfortune use (force attacker to roll lower) is a significant defensive option — 1 charge spent on attack mitigation is strong but limited to 3 uses per cast."
  - "Heightening adds 1 charge per 2 ranks, which is the auto-hit/Force Barrage cadence — appropriate for a charge-pool spell."
  - "Fortune and misfortune are PF2e-standard terms that don't stack with themselves, preventing cheese with other fortune effects."
- **Overridable:**
  - "Could restrict misfortune use to only attacks that would otherwise hit (to prevent wasted charges on already-failed attacks)."
  - "Could halve the charges to 2 base at rank 3 if the combined fortune+misfortune capability feels too strong versus Heroism at the same rank."
- **Checklist failures:** none recorded.

## Similar official spells

- **Sure Strike (rank 1)** — single fortune re-roll on your own next attack, then 10-minute self-immunity; one-shot per cast versus Lucky Stars' 3(+)-charge pool usable on attack/skill/Perception/save.
- **Perceive the Threads of Fate (rank 3, mythic)** — up to 3 sustained fortune re-rolls (attack or skill check only) plus mythic Perception/Reflex proficiency for the duration; same "3-use fortune pool" cadence at the same rank, but no misfortune/defensive branch and no save-roll coverage.
- **Foresight (rank 9)** — the converter's own anchor: unlimited always-on Perception/AC/Reflex/save benefits including immunity to being Off-Guard when flanked/undetected, for 1 hour, touch range (can target an ally). Six ranks above Lucky Stars; illustrates the "uncapped fortune access" ceiling the charge-pool design is bounded against.
- **Heroism (rank 3)** — flat +1 status bonus (rank-3) to attack/Perception/save/skill for 10 minutes, no resource pool, no misfortune branch; a same-rank flat-bonus buff for contrast against Lucky Stars' charge-based swinginess.

## Prior astra touches

None. `revisions.md` has no entry for Lucky Stars — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- `system.heightening` is entirely absent (no key) despite the description carrying a "Heightened (+2)" appendix block — this differs from the other fixed-rank-heightened spells in this chunk, which at least carry an empty `heightening.levels` scaffold. Here there is no structured heightening representation of any kind, only prose.
- The "misfortune" defensive use is explicitly usable "even during another creature's turn" as a free action with no stated Trigger line (it is a free action, not a reaction, so PF2e's reaction-trigger formatting requirement does not technically apply, but the interrupt-timing language is otherwise informal prose rather than a keyworded action block).
- Material component ("a rabbit's foot or other lucky charm") from the 5e original is fully dropped rather than retained as flavor text or a `cost` value.
