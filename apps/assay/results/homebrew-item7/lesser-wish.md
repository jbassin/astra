# Lesser Wish

## Header

- **Rank:** 2 · **Routing:** ledger:utility · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; no priced quantitative verdict.
- **Adapter warnings:**
  - `excluded 2 self-directed damage dice from EV (1d6 mental, 2d6 mental) — a cost paid by the caster, not the spell's output`
  - `fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only`
- **Traits:** concentrate, fortune, mental, mercuromancy (rarity: common)
- **Traditions:** arcane, divine, occult, primal
- **Cast:** 1 action
- **Range:** self · **Targets:** you
- **Defense:** none
- **Duration:** empty string (`""`), not sustained
- **Heightening (structured):** `type: fixed`, `levels: {"3": {}, "4": {}}`

## The 5e original

- **Level** 2, **school** mercuromancy (homebrew)
- **Casting time** 1 action
- **Range** self
- **Components** V only (no somatic, no material)
- **Duration** instantaneous
- **Classes** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> You briefly experience your life as it would have been had you taken a different path. You pull on your alternate version's spellcasting ability to cast any 1st level spell that takes either an action or bonus action to cast and is not from an exotic school of magic. You must still fulfill the requirements of the spell (such as material components), but the spell uses your normal spellcasting modifier and does not consume an additional spell slot.
>
> Each time you cast this spell the movement between streams of fate puts immense stress on your body. When you cast this spell roll a d20. If the result is a one the stress becomes too much and your hit points are reduced to zero. Each time you cast this spell the die reduces from a d20 to a d12 to a d10 and so on. The die resets back to a d20 on a long rest.

**At Higher Levels:** "When you cast this spell using a spell slot of 3rd level or higher, you gain the ability to test fate further. When a 3rd level slot is expended you may select any spell 2nd level or lower, but the stress threshold is raised from one to two. This pattern continues on: cast at 4th level you may replicate a 3rd level spell but the threshold is raised from two to three, and so on."

## The conversion (canonical store)

> You briefly brush against an alternate version of your life and borrow a small sliver of its magic. Choose one of the following effects:
>
> - Reroll a single die you just rolled (before the GM reveals the result) and use the new result. This is a fortune effect.
> - Treat any single skill check you are about to make as if you had rolled a 10 on the die (this is not a fortune effect and can't be combined with other reroll effects).
> - Gain a +2 status bonus to your next saving throw against a specific threat you are aware of; this bonus expires at the end of your next turn.
> - Recall a single cantrip or 1st-rank spell you cast earlier this turn as if it had not been expended (you still expended the slot; this simply allows you to cast that spell again this turn without spending an additional slot — once per casting of this spell).
>
> Each time you cast Lesser Wish in the same day, the strain of crossing fate-streams builds. The first casting each day is free of consequence. The second casting, you take 1d6 mental damage. The third, 2d6 mental damage. Each subsequent casting adds 1d6. This damage cannot be healed until you have taken a full night's rest. This damage does not trigger any effects based on taking damage.
>
> **Heightened (3rd)** Add the following option: Attempt any skill check that is at most trained-rank difficulty (DC 15) as if you had rolled a 15, without rolling. Additionally, the fate-stream strain begins at the second casting (not the first).
> **Heightened (4th)** You may apply the fortune effect to an ally's die roll if they are within 30 feet. The reroll must happen before the GM reveals the result.

## What changed, plain English

This is the most heavily rewritten spell in the set. The 5e core mechanic — "cast any known 1st-level spell for free using your own modifier" — does not survive in any form; it is replaced wholesale with a bounded menu of unrelated fortune/utility effects, and the risk mechanic is replaced with a different kind of cost:

- **Core mechanic replaced entirely:** 5e's "cast any 1st-level spell you can cast with an action/bonus action, non-exotic school, using your own modifier and no extra slot" has **no PF2e equivalent in the store text at all**. In its place is a menu of four options: (a) reroll a die (fortune), (b) treat a skill check as a natural 10, (c) +2 status bonus to your next save vs. a known threat, (d) recall a cantrip/1st-rank spell cast earlier *this turn*. Option (d) is the closest surviving echo of the 5e idea, but it is scoped only to spells already cast this turn — not "any known 1st-level spell."
- **Risk mechanic replaced:** 5e's escalating chance-of-instant-death (roll a d20 each same-day cast; natural 1 = HP to 0; die shrinks d20→d12→d10→... with each cast, resets on long rest) is replaced with a **deterministic** escalating mental-damage cost (free/1d6/2d6/+1d6 each subsequent cast, unhealable until a full rest, no on-damage triggers). This is a different risk *model*, not a renumbering of the same one — a guaranteed scaling chip cost instead of a shrinking chance of sudden death.
- **Heightened (3rd) adds a new menu option** (auto-succeed DC-15 skill checks) with no 5e basis, and changes the strain onset from the 1st cast to the 2nd.
- **Heightened (4th) adds ally-targeting** for the reroll option — no 5e basis.
- **5e's own upcast rule is dropped entirely:** "cast at a higher slot to replicate a spell up to 2 levels below your slot, threshold++ each tier" has no counterpart anywhere in the PF2e conversion.
- **Traditions widened beyond the 5e class list:** 5e's six classes (Bard, Druid, Seeker, Sorcerer, Warlock, Wizard) do not include a divine-coded class, yet the PF2e conversion grants **divine** tradition access alongside arcane/occult/primal.
- **Duration recorded as an empty string** rather than an explicit "instantaneous" (jmnario's own intermediate conversion used the literal text "instantaneous").

## Converter's notes

- **Anchor:** no clean analog — designed as rank-2 fortune/utility menu per plan directive; closest published analog is Sure Strike (rank 1, fortune reroll) and Heroism (rank 3, status bonus)
- **Archetype:** utility/fortune
- **Balance bullets:**
  - "Per plan: 'Lesser Wish at rank 2 is utility, NOT actual wish; design as rank-2 specific-effect helper.' The 5e mechanic (free 1st-level spell from alternate self) would break PF2e's slot economy — replaced with a bounded menu of fortune effects."
  - "The reroll (fortune) option is equivalent to Sure Strike (rank 1) — so the full menu of four options together justifies rank 2."
  - "Escalating mental damage on repeated daily casts preserves the 5e 'your die shrinks until it hits 1 and you die' stress fiction without using the instant-0-HP mechanic that doesn't exist in PF2e."
  - "1-action cost is appropriate: this spell produces only one of four utility effects, none of which involve dice, saves, or attacks."
  - "All four traditions (wide access) matches the 5e class list spanning all six casting classes; fortune/fate magic doesn't belong to a single essence pairing."
- **Overridable:**
  - "The escalating-damage rider could be removed entirely for a cleaner, simpler spell — the flavor of 'fate stress' was preserved at the cost of some bookkeeping."
  - "The 'recall a cantrip/1st-rank spell' option is the closest the menu gets to the 5e core mechanic (free extra spell) — could be expanded to recall any 2nd-rank spell at the GM's discretion, pushing this toward rank 3."
- **Checklist failures:**
  - "Design note (not a failure): The 5e core mechanic (free 1st-level spell cast) is fundamentally incompatible with PF2e slot economy. The redesign as a fortune/utility menu is intentional per plan directive. Flagged for GM awareness."

## Similar official spells

- **Sure Strike** (rank 1) — the baseline fortune reroll-and-take-better mechanic; the converter's own anchor for the reroll option.
- **Heroism** (rank 3) — broad +1/2/3 status bonus to attack rolls, Perception, saving throws, *and* skill checks for its whole 10-minute duration; the converter's own power-level yardstick, and a much cheaper/broader version of option (c)'s single-save bonus.
- **Perseis's Precautions** (rank 3) — carries the `fortune` trait, "leaving nothing to chance" flavor, and a once-per-duration "roll twice, take the better" mechanic on a specific check type; thematically the closest official "fate-menu" spell found, though scoped to initiative rolls rather than a general skill-check menu.

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell.

## Open flags

- This is the most heavily redesigned spell of the eight: essentially none of the 5e mechanic (free duplicate-spell cast) survives; only the "escalating strain on repeated same-day casts" fiction is preserved, with the underlying math replaced (chance-of-death → guaranteed scaling damage).
- Divine tradition access has no counterpart in the 5e class list (Cleric is absent from the 5e Bard/Druid/Seeker/Sorcerer/Warlock/Wizard list).
- `adapterWarnings` note 2 self-damage dice (1d6, 2d6) are excluded from EV scoring as a caster-paid cost rather than spell output — consistent with the ledger:utility routing.
- Duration is an empty string rather than an explicit "instantaneous" (jmnario's intermediate conversion used the literal word); the store's convention differs, though it doesn't change the mechanical meaning.
