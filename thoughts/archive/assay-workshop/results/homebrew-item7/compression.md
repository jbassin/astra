# Compression

## Header

- **Rank:** 3
- **Routing:** buff
- **Pool reason:** wide-range (comparables rank range 1–7 — LOW-INFORMATION, hence the manual pool)
- **Current assay line:** `kind: buff-comparables`, `population: beneficial`, `rankRange: [1, 7]`, `routing: buff`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics, polymorph — rarity common
- **Traditions:** arcane, occult
- **Cast:** 2 actions
- **Range:** touch — **Target:** 1 willing creature
- **Defense:** none
- **Duration:** 8 hours (not sustained)
- **Structured damage:** none (`{}`)
- **Heightening:** fixed levels 5/7 (empty structured payloads — text-only)

## The 5e original

- **Level:** 3 (source file `gen_homebrew.json`)
- **School:** memetics
- **Casting time:** 1 action
- **Range:** touch
- **Components:** S + V + M ("an unfolded piece of origami")
- **Duration:** 8 hours, no concentration
- **Classes:** Bard, Seeker (SW), Wizard

> You temporarily reduce the number of physical dimensions a creature occupies. You touch a willing creature and compress them into a 2D representation of themselves. While in this form, the creature has resistance to damage from non-magical weapons and can move in any direction along any flat, non-living surface. Additionally, the creature has advantage on Dexterity (Stealth) checks and can pass through openings that are at least as wide or as tall as the creature, but not necessarily both (e.g. the gap underneath a closed door). Finally, creatures compressed in this way do not require food or drink, but will continue to age.
>
> The only actions a creature can take in this form are the Dash action or to revert to its normal form. Reverting takes 1 minute, during which time a creature is incapacitated and can't move. Until the spell ends, a creature can revert to its 2D form, which also requires the 1-minute transformation.

No `entriesHigherLevel` section is present — the 5e original has no upcast text.

## The conversion (canonical store)

> You compress a willing creature into a two-dimensional representation of itself — a flat, living silhouette that retains awareness and sensation but occupies no physical depth. The transformation takes 1 minute of sustained physical contact. The target gains the following benefits and restrictions for the duration:
>
> **Benefits:**
> - Resistance 5 to physical damage from non-magical sources (bludgeoning, piercing, slashing).
> - The target can move across any flat, non-living surface in any direction, including walls and ceilings, at its normal Speed.
> - The target gains a +4 status bonus to Stealth checks.
> - The target can pass through any gap or opening that is at least as wide OR as tall as the target (not requiring both dimensions to be met), such as the gap under a closed door.
> - The target does not require food or drink, but continues to age normally.
>
> **Restrictions:**
> - The target can only use the Stride action or choose to revert to three-dimensional form (see below).
> - Reverting to 3D form requires 1 minute of concentration (the target is Slowed 1 and can't use the Stride action during this process). The target can re-enter 2D form as another 1-minute process.
>
> The target can dismiss this spell as a 1-minute concentrate activity at any time.
>
> **Heightened (5th)** The resistance increases to 10. The target can also pass through locked doors and windows (but not magically sealed ones) without opening them. The reversion time is reduced to 1 action.
> **Heightened (7th)** The resistance extends to magical physical sources as well. The target can pass through any solid non-magical barrier up to 1 foot thick as part of a Stride action.

This description matches jmnario's baseline conversion (confirmed via `revisions.md` — 0 deviations for this spell). The `@UUID` reference — `@UUID[Compendium.pf2e.conditionitems.Item.Slowed]{Slowed 1}` — renders above as "Slowed 1"; it's a UUID link to the Slowed condition item.

## What changed, plain English

- **Action structure, Dash → Stride:** 5e restricts the creature to the Dash action or reverting. PF2e restricts it to the Stride action or reverting — the direct PF2e-native translation of "move but do nothing else."
- **Resistance quantified and partial:** 5e grants flat "resistance to damage from non-magical weapons" (full resistance, no number attached in 5e's damage-halving convention). PF2e converts this to a specific Resistance 5 (10 at rank 5), and explicitly limits it to non-magical sources until rank 7, where it's extended to magical physical sources too — a numeric, tiered version of a binary 5e trait.
- **Stealth bonus quantified:** 5e's "advantage on Dexterity (Stealth) checks" becomes a flat +4 status bonus in PF2e (there's no advantage mechanic in PF2e).
- **Reversion penalty added:** 5e's reversion just says the creature is "incapacitated and can't move" for the 1-minute process — no PF2e-condition equivalent is named. PF2e explicitly assigns Slowed 1 during the 1-minute reversion, and reduces reversion time to 1 action at rank 5 (no 5e equivalent for this heighten).
- **Passing through barriers extended at rank 7:** entirely new content — 5e never allows passing through solid barriers at any tier; PF2e's rank-7 heighten adds passing through a 1-foot-thick solid non-magical barrier as part of a Stride, which has no 5e basis.
- **Locked-door passage added at rank 5:** also new — 5e's gap-passage clause only ever covers openings ("gap under a closed door"), never locked mechanisms; PF2e's rank-5 heighten adds passing through locked (but not magically sealed) doors/windows without opening them.
- **Polymorph trait added:** classifies the spell for PF2e's polymorph-stacking rules; 5e has no equivalent classification concept.

## Converter's notes

- **Anchor:** "no clean analog — closest is Gaseous Form (rank 4, primal, pass through cracks, resist physical) but Compression is rank 3 with more restrictions and willing only"
- **Archetype:** utility/polymorph (2D form for movement and infiltration)
- **balanceBullets:**
  - "Gaseous Form (rank 4) gives similar benefits (pass through gaps, resist physical damage) but the target can fly and take more actions. Compression at rank 3 is weaker: no flying, only Stride or revert, 1-minute reversion time."
  - "Action restriction (only Stride or revert) is the primary cost that keeps this at rank 3 rather than rank 4. A 2D creature that can still attack, cast, and use skills would be stronger than Gaseous Form."
  - "Resistance 5 to non-magical physical is below full resistance; appropriate for rank 3 as a partial protection."
  - "Polymorph trait is correctly applied: this is a body-shape transformation. Does not stack with wild shape or other polymorphs."
  - "8-hour duration (exploration tier) is appropriate for an infiltration/scouting utility that requires time to use, not a combat tool."
- **overridable:**
  - "The action restriction (only Stride or revert) could relax at the GM's discretion for specific narrative uses — e.g., 'the 2D form can use social skills by speaking' — but full action access would make this too powerful at rank 3."
  - "Resistance 5 to physical could extend to magical physical sources if the GM wants the spell to feel more 'complete' — currently only non-magical is covered at base."
- **checklistFailures:** none.

## Similar official spells

- **Vapor Form** (rank 4, in Remaster — the current name for the 5e-equivalent "Gaseous Form," renamed) — transforms the target into an amorphous vaporous state: resistance 8 to physical damage, immunity to precision damage, can't cast/activate items/use attack-or-manipulate actions, gains a 10-foot fly Speed and can slip through tiny cracks. This is the direct anchor spell named in the converter's own notes; it's a rank higher, grants flight, and has broader gap-passage but a hard action lockout (no attack/manipulate actions at all) rather than Compression's Stride-or-revert restriction.
- **Shrink** (rank 2) — shrinks a willing target to Tiny size (reach 0 ft, equipment shrinks too), 5-minute duration. Rank-2 polymorph comparable for potency scaling on "temporary friendly-target body transformation for utility purposes," though its benefit (small size) is unrelated to Compression's dimensional/movement effects.
- **scorer comparables (low-information):** Magnetic Repulsion (rank 2), Aerial Form (rank 4), Angel Form (rank 7), Animal Form (rank 2), Ant Haul (rank 1) — the assay tool's auto-selected buff comparables for this spell's rank-1–7 range; the battle-form transformations and the metal-repulsion spell are functionally distant from a 2D-compression movement/infiltration spell, which is why this spell sits in the manual/low-information pool.

## Prior astra touches

None. `revisions.md` does not list Compression among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations).

## Open flags

- No residual 5e-isms (no "bonus action" text, no death-save language, no material component text — matches Remaster's no-materials convention despite 5e specifying an origami-paper material).
- No curse-removal wording, no affliction text, not a reaction (no Trigger line to check).
- Structured damage field is empty, consistent with the prose.
- "Resistance 5 to physical damage from non-magical sources" is spelled out as bludgeoning/piercing/slashing explicitly in the PF2e prose — a more precise translation than 5e's blanket "non-magical weapons" phrasing, worth noting as a scope clarification rather than a power change.
