# Macabredanse

## Header block

- **Rank:** 1 (cantrip) · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (queue.json: `routing: "ledger:utility"`, `poolReason: "ledger"`, `verdict: null`)
- **Adapter warnings:** none
- **Traits:** antillurgy, cantrip, concentrate, manipulate, void · **Rarity:** common
- **Traditions:** divine, occult
- **Cast:** 2 actions · **Range:** 10 feet · **Target/Area:** none
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "10 minutes"
- **Cost:** none (`cost.value` empty string)

## The 5e original

- **Name:** Macabredanse · **Source:** tfc (homebrew) · **Level:** 0 (cantrip) · **School:** antillurgy
- **Casting time:** 1 action
- **Range:** 10 feet (point)
- **Components:** V only (no S, no M)
- **Duration:** 10 minutes, not concentration
- **Classes:** Sorcerer, Warlock, Wizard

> This spell is a minor magical trick that novice antillurgists use for practice. You create one of the following effects within range:
>
> - You create an instantanous, harmless sensory effect, such as the flickering of lit candles, a puff of cold wind, a cacophony of unintelligible disembodied whispers, or the faint odor of decay.
> - Choose the bones or corpse of a Tiny creature within range. Your spell wraps threads of the Weave around it, raising it as an undead creature with CR 0. You do not control the creature, but it is friendly to you and can understand you.
> - You instantly make a flower wither, meat spoil, or milk curdle.
>
> If you cast this spell multiple times, you can have up to three of its non-instantaneous effects active at a time, and you can dismiss such an effect as an action.

No `entriesHigherLevel` block (cantrips don't upcast in 5e).

## The conversion (canonical store)

You conjure one of three minor antillurgical effects within range. Choose one when you Cast the Spell:

- **Memento:** You create a brief, harmless sensory flourish — candles gutter, a cold draft passes, whispers rustle from nowhere, or the scent of old earth drifts through the air. This is purely cosmetic and lasts only a moment.
- **Tiny Thrall:** You animate the bones or corpse of a Tiny dead creature within range, raising it as a harmless Tiny undead with no attack and Speed 10 feet. The creature is friendly to you, can understand your spoken words, but cannot speak. It cannot act in combat (it has 1 HP and is destroyed if it takes any damage). It persists for up to 10 minutes and then crumbles.
- **Wither:** You instantly spoil a single discrete portion of perishable organic matter you can see within range — a flower wilts, meat goes bad, milk curdles. This affects an amount no larger than 1 cubic foot.

You may have up to two non-instantaneous Macabredanse effects active at a time. Dismissing an active effect is a single action with the concentrate trait.

No `@UUID` references. No `successTiers`, no heightening — both match the 5e source (no save, no scaling). Structural fields agree with the prose (`area`/`target` both empty, consistent with a "choose an effect within range" cantrip).

## What changed, plain English

- **Named modes:** the 5e text lists three unnamed bulleted options; the conversion gives each a bold label ("Memento," "Tiny Thrall," "Wither") not present in 5e, purely organizational.
- **Tiny Thrall nerf (numbers):** 5e's raised undead is "CR 0" with no other stated restriction beyond "you do not control the creature." The conversion adds explicit caps: 1 HP, destroyed by any damage, Speed 10 feet, cannot speak, "cannot act in combat" — all new numeric/behavioral constraints with no 5e basis, added specifically (per the converter's notes) to keep a free minor undead within cantrip budget.
- **Wither scope cap:** the conversion adds an explicit size cap ("no larger than 1 cubic foot") not present in the 5e text, which only lists examples (flower, meat, milk) with no stated volume limit.
- **Simultaneous-effect limit reduced:** 5e allows up to **three** non-instantaneous effects active at once; the conversion caps this at **two** — a direct downward numeric change, called out explicitly in the converter's notes.
- **Action economy:** 5e 1 action → PF2e 2 actions to cast; dismissing an active effect stays a single action in both (5e: "as an action"; PF2e: "a single action with the concentrate trait").
- **Traditions:** 5e class list (Sorcerer/Warlock/Wizard) is replaced entirely with divine + occult — a full swap, not a subset/superset relationship (no arcane tradition retained despite all three 5e classes being arcane casters).
- **Traits added with no 5e basis:** antillurgy (school-derived), void, cantrip, concentrate, manipulate.

## Converter's notes

- **Anchor:** "Prestidigitation (cantrip) — three-mode utility cantrip with cosmetic + minor mechanical effects"
- **Archetype:** cantrip-utility (three-mode antillurgy trick cantrip)
- **Balance bullets:**
  - "Anchored to Prestidigitation's three-mode structure; the Tiny Thrall mode is the most powerful and requires explicit nerfs (1 HP, no attack, no combat action) to stay within cantrip budget."
  - "Simultaneous active-effect limit reduced from 3 to 2 to match Prestidigitation's design philosophy — three simultaneous 10-min effects from a cantrip is at the top of the cantrip ceiling."
  - "Void trait applied to the whole spell because the Tiny Thrall and Wither modes both invoke void essence; Memento is purely cosmetic."
  - "No combat use and no damage: checklist item 5 passes by absence — there is no damage to check against the damage table."
- **Overridable:**
  - "The Tiny Thrall mode could be cut and replaced with a third cosmetic effect (e.g., 'breathe out a puff of cold mist') to avoid any combat-adjacent interaction."
  - "The active-effects limit could be raised back to 3 if the GM is comfortable with three simultaneous 10-min undead thralls."
  - "Could add a fourth mode (e.g., animate a skeleton as a Tiny combat aid with 1d4 damage) at rank 2+ for a more combat-relevant version."
- **Checklist failures:** none recorded.

## Similar official spells

- **Prestidigitation (cantrip)** — the converter's own anchor: four sustained modes (Cook/Lift/Make/Tidy), each minor and reversible, no damage, no undead. The direct structural template Macabredanse is measured against, though Prestidigitation's modes are all sustain-to-maintain rather than "cast, then persists for 10 minutes up to a simultaneous-effect cap."
- **Ghost Sound (cantrip)** — auditory-illusion cantrip in the same rank-0 utility-trick space; a narrower single-purpose comparison for the "harmless sensory trick" (Memento) mode specifically, without Macabredanse's undead/spoilage branches.

## Prior astra touches

None. `revisions.md` has no entry for Macabredanse — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- The Tiny Thrall mode raises undead via a cantrip; the store's traits include `void` but not `necromancy` (there is no PF2e "necromancy" trait remaining post-Remaster, so this is expected under the current trait system — noted for completeness, not as a defect).
- No 5e-ism residue found (no death saves, no "bonus action," no material component text, no legacy condition names) — the description reads as clean PF2e prose.
- The "up to two ... active at a time" cap only meaningfully constrains the Memento and Wither modes' persistence framing loosely, since Memento is explicitly "purely cosmetic and lasts only a moment" (i.e., effectively instantaneous) — the cap language ("non-instantaneous effects") already excludes Memento from counting toward it, consistent between prose and the converter's notes.
