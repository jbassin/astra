# Fluid Form

## Header block

- **Rank:** 4 · **Routing:** `buff` · **Pool reason:** wide-range
- **Current assay line:** verdict = none recorded / comparables rank range 2–8 (LOW-INFORMATION — this is why the spell sits in the manual pool) / residualRanks = none (scores.json: `kind: "buff-comparables"`, `actionBucket: "2"`, `population: "beneficial"`)
- **Scorer comparables (raw):** Magnetic Repulsion (rank 2), Sure Footing (rank 2), Ferrous Form (rank 8), Aerial Form (rank 4), Angel Form (rank 7)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt, manipulate, morph · **Rarity:** common
- **Traditions:** primal
- **Cast:** 2 actions · **Range:** self · **Target:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "1 hour"
- **Cost:** none (`cost.value` empty string)
- **Heightening scaffold:** `system.heightening = {"levels":{"6":{}},"type":"fixed"}`

## The 5e original

- **Name:** Fluid Form · **Source:** tfc (homebrew) · **Level:** 4 · **School:** gestalt
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V only (S: false, M: null)
- **Duration:** Concentration, up to 1 hour
- **Classes:** Druid

> You turn your wildshape abilities inward, to reconstruct your form. You transform yourself and all items you are carrying into thick liquid. The amount of liquid has the same mass and volume as your normal body, but it is amorphous, allowing you to squeeze through gaps that are at least an inch wide. In this form, you are immune to poison, paralysis, and stun. Your speed becomes 20 feet.
>
> You can't speak, attack, or cast spells in fluid form. You gain resistance to bludgeoning, slashing, and piercing damage done by nonmagical weapons.
>
> You can end this spell as an action. If the spell ends when you are in a container that's too tight for your full form, the container shatters if it can; if it can't, then you remain in fluid form until you are released from the container.

No `entriesHigherLevel` block in the 5e source (this spell has no native 5e upcast text).

## The conversion (canonical store)

You turn your gestalt wildshaping energy inward, dissolving your solid body into an animated mass of thick, viscous liquid that retains your mass and volume but becomes fully amorphous. While in Fluid Form you can Squeeze through any gap at least 1 inch wide without needing to succeed at an Acrobatics check. You gain resistance 10 to bludgeoning, piercing, and slashing damage from non-magical weapons. You are immune to the `Paralyzed` condition (UUID link). Your Speed becomes 20 feet, and you gain a 20-foot swim Speed.

While in Fluid Form you cannot speak, cast spells, or make Strikes. You cannot use manipulate actions that require hands. If the spell ends while you are in a space too small for your normal form, you are automatically expelled to the nearest unoccupied space large enough to contain you; if no such space is within 30 feet, you are squeezed out over 1 round and become `Slowed 1` (UUID link) for 1 minute from the traumatic reconstitution.

You can Dismiss this spell as a 2-action activity.

---

**Heightened (6th)** The resistance increases to 15 and you also gain resistance 10 to acid damage. You can flow up walls and across ceilings, gaining a 20-foot climb Speed.

No `@UUID` non-condition references. No `successTiers`/degree-of-success structure — this is a self-buff/polymorph with no save (matches the 5e original). `system.damage = {}` (empty). `system.heightening.levels."6"` is an empty object — the heightened text (resistance bump, acid resistance, climb Speed) exists only in the description appendix.

## What changed, plain English

- **Immunity list narrowed:** 5e grants immunity to poison, paralysis, *and* stun. The conversion keeps only Paralyzed immunity — poison immunity and the stun-equivalent are dropped entirely. In their place, the conversion substitutes a *different* restriction: "cannot use manipulate actions that require hands" (framed by the converter's notes as the PF2e-side translation of "immune to stun," since PF2e's stunned condition works differently). This is a content trade, not a straight drop: poison immunity has no PF2e-side replacement at all.
- **Damage resistance numbered and expanded:** 5e says "resistance to bludgeoning, slashing, and piercing damage done by nonmagical weapons" with no numeric value (5e resistance is typically half-damage, not a flat number). The conversion assigns a specific flat "resistance 10" (PF2e's numeric resistance model) — a necessary system-translation rather than an added power, but worth flagging as a structural difference in how "resistance" behaves between the two systems.
- **New capability with no 5e basis — swim Speed:** the conversion adds "a 20-foot swim Speed" at base rank. The 5e original grants no swimming capability at all (only "Speed becomes 20 feet," implicitly a walking Speed). Confirmed in the converter's own `overridable` notes as an added, non-source-text capability.
- **New capability with no 5e basis — Squeeze without a check:** the conversion explicitly waives the Acrobatics check for the Squeeze action while amorphous ("without needing to succeed at an Acrobatics check"). The 5e text only states you *can* squeeze through 1-inch gaps; it says nothing about waiving PF2e's Squeeze skill-check mechanic (which doesn't exist in 5e to begin with) — this is new PF2e-specific mechanical text.
- **Ending-the-spell mechanic reworked:** 5e's "container shatters, or you're stuck in fluid form until released" clause is replaced with a PF2e-native mechanic: automatic expulsion to the nearest space, or (if none within 30 feet) a 1-round forced squeeze-out that inflicts `Slowed 1` for 1 minute. This is a full rewrite of the edge-case consequence, not present in the 5e text at all (5e never inflicts a condition for this scenario; it either shatters the container or traps you).
- **Dismiss formalized as 2 actions:** 5e's "end this spell as an action" (1 action, implicitly) becomes a PF2e "Dismiss as a 2-action activity" — doubling the cost to end the spell, per the converter's stated rationale of preventing instant combat re-entry.
- **Duration structure:** 5e Concentration (attention-limited but re-triggerable each round via nothing) up to 1 hour → PF2e flat 1-hour duration **without** Sustain (i.e., not concentration-gated at all in PF2e terms — the spell simply runs for the full hour once cast, unlike most PF2e "sustained" buffs that must be actively maintained).
- **Traits/traditions:** `polymorph` (the natural PF2e trait for a full-body transformation) is deliberately avoided in favor of `morph`, per the converter's rationale that the spell suppresses rather than replaces combat actions. Traditions collapse from Druid-only (5e) to `primal` only.

## Converter's notes

- **Anchor:** "Gaseous Form (rank 4, comparable utility polymorph) — no identical PF2e analog; closest is Gaseous Form for infiltration movement at rank 4"
- **Archetype:** polymorph/utility
- **Balance bullets:**
  - "Morph (not polymorph) trait because Fluid Form suppresses attacks rather than replacing them; it is a movement/infiltration form, not a battle form — this prevents it from competing with Animal Form's damage budget."
  - "Resistance 10 at rank 4 to three physical damage types from non-magical weapons is equivalent to the defensive budget of rank-4 utility morphs; not a combat buff since you cannot attack."
  - "1-hour duration approved: Fluid Form is an exploration mode (infiltration through 1-inch gaps) equivalent to Gaseous Form; combat buffs cap at 1 min but movement/infiltration utility is exploration-tier."
  - "Speed reduction to 20 ft balances the squeeze-any-gap benefit (cannot sprint through a dungeon)."
  - "No heightening at rank 5 (gap): rank 6 adds climb speed and acid resistance, giving a meaningful jump for the next natural slot."
- **Overridable:**
  - "Added 20-ft swim speed at base (logical but not in 5e text); GM may prefer to require heightening for swim speed."
  - "Dismiss is 2-action rather than 1-action to prevent instant combat re-entry while in melee; GM may allow 1-action dismiss if desired."
- **Checklist failures:** none recorded.

## Similar official spells

- **Vapor Form (rank 4)** — the closest true functional match in the current snapshot (the "Gaseous Form" the converter's notes reference by its pre-Remaster name): amorphous state, resistance 8 physical + immune to precision, fly Speed 10 feet, can't cast/activate items/use attack-or-manipulate actions, Dismissable. Same rank; notably shorter duration (5 minutes, not sustained) than Fluid Form's 1 hour, and grants flight rather than swim/squeeze.
- **Aerial Form (rank 4)** — full animal battle form (gains the `animal` trait, Strikes, flight) rather than a suppressed-combat morph; same rank, useful contrast for what a rank-4 form spell looks like when it *keeps* offensive capability instead of trading it away like Fluid Form.
- **Angel Form (rank 7)** — a stronger, later battle-form comparable from the scorer's low-information pool; three ranks above Fluid Form, illustrates the top of the "form spell" power curve for context.
- **Ferrous Form (rank 8)** — another scorer-flagged battle form, four ranks above; included for the same reason (upper-band reference point given the wide comparable range).

**Scorer comparables (low-information):** Magnetic Repulsion (rank 2), Sure Footing (rank 2), Ferrous Form (rank 8), Aerial Form (rank 4), Angel Form (rank 7).

## Prior astra touches

None. `revisions.md` has no entry for Fluid Form.

## Open flags

- The 5e original's poison immunity has no PF2e-side replacement anywhere in the conversion — it is a straight drop, not translated into an equivalent PF2e mechanic, unlike the stun→no-hand-manipulate substitution which the converter's notes explicitly address.
- The swim Speed (20 ft) and the check-free Squeeze clause are both additions with no 5e-text basis; the swim Speed is flagged as `overridable` by the converter, but the check-free Squeeze waiver is not discussed anywhere in the notes.
- Duration classification: the store's `duration.sustained = false` with a flat "1 hour" value means this spell is *not* concentration-gated in PF2e terms at all (unlike the 5e original's Concentration requirement, which can be broken by damage/distraction). This is a full removal of the concentration-vulnerability mechanic from the 5e source, framed in the notes only as "combat buffs cap at 1 min but movement/infiltration utility is exploration-tier" — the concentration-breakability aspect specifically isn't addressed.
- `system.heightening.levels."6"` is an empty object; all heightened content (resistance 10→15, +resistance 10 acid, climb Speed) lives only in the description appendix.
- The forced-squeeze-out `Slowed 1` consequence is a new PF2e-native mechanic invented for this conversion with no 5e-text analog (5e's failure state was container-shattering or permanent entrapment, not a condition).
