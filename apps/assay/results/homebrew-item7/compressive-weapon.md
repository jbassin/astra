# Compressive Weapon

## Header

- **Rank:** 2
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** `kind: ledger`, `reasonCode: utility`, `rawSkipReason: "no-priceable-effect (no damage, no conditions, no modifiers)"`, `routing: ledger:utility`
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, kosmoturgy, manipulate — rarity common
- **Traditions:** arcane, divine
- **Cast:** 2 actions
- **Range:** 30 feet — **Target:** 1 creature
- **Defense:** none
- **Duration:** sustained up to 1 minute
- **Structured damage:** none (`{}`)
- **Heightening:** **no `system.heightening` field at all** in the store — see Open flags.

## The 5e original

- **Level:** 2 (source file `gen_homebrew.json`)
- **School:** kosmoturgy
- **Casting time:** 1 bonus action
- **Range:** 30 feet (point)
- **Components:** V only (no S, no M)
- **Duration:** 3 rounds, concentration
- **Classes:** Cleric, Paladin

> You compress the space between your weapon and a creature you can see, reducing the distance required to strike them. You have advantage on your next two attack rolls against the target before the spell ends.

No `entriesHigherLevel` section is present — the 5e original has no upcast text.

## The conversion (canonical store)

> You compress the intervening space between yourself and a target creature, creating a spatial shortcut through which your weapon's reach always finds the target. Choose a weapon you are wielding when you Cast this Spell. While the spell is sustained, you can make Strikes with that weapon against the designated target as if the target were within the weapon's normal reach, regardless of its actual distance from you (up to the spell's range of 30 feet). The weapon still requires line of effect. You cannot use this spell to make Strikes against targets beyond 30 feet. If you move or the target moves beyond 30 feet, the spell ends.
>
> **Heightened (+1)** The range of the compressive reach increases by 10 feet.

This description matches jmnario's baseline conversion (confirmed via `revisions.md` — Compressive Weapon is not in the deviations list, i.e., 0 deviations for this spell).

## What changed, plain English

The mechanic was rebuilt from the ground up rather than translated, because 5e's "advantage on your next two attack rolls" has no PF2e equivalent (PF2e has no advantage/disadvantage system).

- **Effect replaced entirely:** 5e grants advantage on the next two attack rolls against the designated target (a to-hit bonus mechanic). PF2e instead grants extended reach — treat the target as within the weapon's normal melee reach regardless of actual distance, up to 30 feet, for as long as the spell is sustained. These are functionally different effects (accuracy boost vs. range extension) unified only by the "compress the space" fiction.
- **Action economy:** 5e is a 1-bonus-action cast lasting 3 rounds (concentration, no sustain-per-turn cost beyond maintaining concentration). PF2e is a 2-action cast with an ongoing Sustain requirement (implicit in "while the spell is sustained") and no fixed round-count — it lasts until dismissed, disrupted, or the range condition is broken, capped at "sustained up to 1 minute."
- **Numbers:** 5e's flat "two attacks" cap is dropped; PF2e removes any cap on the number of Strikes (as many as your actions allow, every round, for as long as it's sustained) but confines it to the 30-foot range window with no attack-count limit.
- **Content dropped from 5e:** the "advantage" bonus itself (no PF2e replacement bonus to accuracy is granted — the whole benefit is now reach, not accuracy).
- **Content added with no 5e basis:** the explicit "still requires line of effect" clause, the spell-ending condition if either party moves beyond 30 feet, and the entire reach-substitution mechanic itself.

## Converter's notes

- **Anchor:** "no clean analog — closest is True Strike (rank 1, +circumstance to hit) but this is a unique reach-extension effect" *(note: True Strike does not appear to exist in the current Remaster spell snapshot under that name — see Open flags)*
- **Archetype:** utility/buff (melee reach extension via spatial compression)
- **balanceBullets:**
  - "No PF2e analog for 'compress space to extend melee reach.' The 5e 'advantage on next two attacks' was repurposed because PF2e has no advantage mechanic."
  - "Redesigned as a sustained reach-extension: target any creature within 30 ft with melee weapons. This is a genuinely unique tactical effect — casters can contribute melee Strikes at range without the spell being an attack itself."
  - "Sustained duration (up to 1 min) is the appropriate tier for a concentration-requiring combat buff."
  - "The rank-2 placement is justified by the utility: a permanent 30-ft melee range would let a caster always flank, never provoke AoO for retreating, and deny enemies the normal defensive advantage of range — that's above rank-1 budget."
- **overridable:**
  - "Could be rebuilt to mirror the 5e original more closely: '+2 circumstance bonus to the next two attack rolls against a designated target' (closest PF2e equivalent to advantage on 2 attacks)."
  - "The 30-ft range cap (if target moves out, spell ends) could be softened to 'if target moves beyond 30 ft, make a DC 15 flat check to maintain.'"
- **checklistFailures:** none.

## Similar official spells

- **Spiritual Weapon** (rank 2) — a sustained spell that manifests an independent force weapon and Strikes with it each Sustain, targeting anything within 120 feet; contributes to and uses your multiple attack penalty. Closest official comparable for "sustain each round to keep landing melee-style Strikes against a distant target," though Spiritual Weapon is its own independent attacker (force damage, no reach-of-your-own-weapon fiction) rather than channeling the caster's own weapon and proficiency.
- **Enlarge** (rank 2) — grants +5 ft reach (10 ft from Tiny) plus a flat +2 status bonus to melee damage, 5-minute duration, no sustain. Useful reach-potency reference: a small, permanent-for-duration reach bump with a damage bonus attached, versus Compressive Weapon's much larger (30 ft) but sustain-gated, damage-bonus-free reach extension.

## Prior astra touches

None. `revisions.md` does not list Compressive Weapon among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations).

## Open flags

- **No `system.heightening` field at all:** unlike every other spell in this chunk, the store JSON for Compressive Weapon has no `heightening` key whatsoever (not even an empty `levels` object). The "+1: range increases by 10 feet" heighten text exists only in the description; per the adapter warning, an interval-style ('+N') heighten isn't structurally represented, but here there isn't even a placeholder structural entry — a Foundry-side "heighten" UI control would show nothing heightenable for this spell despite the prose implying it.
- **Anchor spell may not exist in the current Remaster snapshot:** the converter's notes cite "True Strike (rank 1, +circumstance to hit)" as the closest analog, but no `true-strike.json` (or equivalent) was found anywhere under the pf2e-8.3.0 spell snapshot search — the named anchor could not be verified against current data.
- No residual 5e-isms (no "bonus action" text survives into the PF2e description, no material component, no death-save language).
- No curse-removal wording, no affliction text, not a reaction (no Trigger line to check).
- Structured damage field is empty, consistent with the prose (this spell deals no damage itself).
