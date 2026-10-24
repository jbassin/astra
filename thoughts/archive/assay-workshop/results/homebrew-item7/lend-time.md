# Lend Time

## Header

- **Rank:** 3 · **Routing:** ledger:utility · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; no priced quantitative verdict.
- **Adapter warnings:** `fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only`
- **Traits:** chronomancy, concentrate, manipulate (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 1 action, `system.time.value = "reaction"`
- **Range:** 60 feet · **Targets:** 1 willing ally
- **Defense:** none
- **Duration:** "until the end of the ally's turn", not sustained
- **Heightening (structured):** `type: fixed`, `levels: {"5": {}}`

## The 5e original

- **Level** 3, **school** chronomancy (homebrew)
- **Casting time** 1 reaction, condition: "taken immediately before your turn"
- **Range** 60 feet
- **Components** V, S, M ("a clock with two hour hands")
- **Duration** 1 turn, no concentration
- **Classes** Bard, Druid, Wizard

> As a reaction taken immediately before your turn, you can lend time to a creature of your choosing within range. You lose the use of your movement, action, and bonus action; and, in return your ally may take a turn in your place. This does not change the initiative order and they will still go as normal when it is their regular turn.

No `entriesHigherLevel` — no upcast text in the 5e original.

## The conversion (canonical store)

> Trigger: Immediately before your turn begins.
>
> You sacrifice your own turn to gift a fragment of your action-potential to a nearby ally. You forfeit all three of your actions and your reaction this turn. In exchange, one willing ally you can see within 60 feet immediately gains one extra turn, inserted right now in the initiative order (before your original turn would have occurred). The ally takes a complete turn: they gain 3 actions and 1 reaction as normal. Their position in the initiative order is otherwise unchanged — they still act again when their own turn arrives.
>
> The ally cannot use their extra turn to cast Lend Time or grant their actions to another creature.
>
> **Heightened (5th)** The ally gains 2 extra actions on their inserted turn (still not a full extra turn, but a powerful burst). Alternatively, you may target 2 willing allies, each gaining 1 action on an inserted partial turn instead.

## What changed, plain English

The reaction-before-your-turn structure and the "no net actions created" zero-sum fiction are preserved, but the specific resources exchanged expanded beyond a literal reading of the 5e text:

- **Trigger encoding:** 5e represents the trigger as a `condition` field on the `time` block; the PF2e store represents it as a leading "Trigger: Immediately before your turn begins." prose line (plain text, not bolded/`<hr>`-separated — see Open Flags), with `system.time.value` correctly set to `"reaction"`.
- **Caster's forfeited resources expanded:** 5e says the caster loses "movement, action, and bonus action" (three 5e resources — reactions are not mentioned as forfeited). The PF2e version has the caster forfeit "all three of your actions **and your reaction**" — adding the reaction to what's given up, which has no direct counterpart in the 5e text.
- **Ally's granted resources expanded:** 5e grants the ally "movement + action + bonus action" (roughly the 5e equivalent of ~1 turn's worth of options, but phrased as three specific named resources). PF2e grants the ally "3 actions and 1 reaction" — an explicit full PF2e turn, including a reaction the 5e text never mentions the ally gaining.
- **Material component dropped:** 5e's "a clock with two hour hands" does not appear anywhere in the store (empty `cost.value`, no material text in prose).
- **Recursion guard added:** "The ally cannot use their extra turn to cast Lend Time or grant their actions to another creature" — no such restriction exists in the 5e text.
- **Heightened (5th) added wholesale:** the 5e original has zero upcast text; both the "2 extra actions" and "2 allies, 1 action each" options at 5th rank are new PF2e-side content.
- **Classes → traditions:** Bard/Druid/Wizard → arcane + occult.

## Converter's notes

- **Anchor:** no clean analog — designed from effect budget for rank 3; closest functional parallel is Haste (rank 3, +1 quickened action for 1 min), but Lend Time is far more dramatic (full gifted turn) balanced by total self-sacrifice
- **Archetype:** buff (action-economy transfer, reaction)
- **Balance bullets:**
  - "Budget logic: the caster forfeits 3 actions + 1 reaction (full turn value) and the ally gains a complete extra turn — the economy is zero-sum; no net actions are created, so power is in positioning/sequencing, not raw action gain."
  - "Reaction cost is appropriate: giving a full turn to an ally in the correct situation (e.g., allowing a martial to double-attack a flanked boss) is a strong rank-3 use but requires burning the caster's entire contribution."
  - "Heightened (5th) escalation to 2 actions or 2 allies is modest for 2 extra ranks, keeping the spell from dominating high-rank play."
  - "No clean analog flag logged per plan: PF2e time-manipulation spells are flagged as design-from-budget only."
- **Overridable:**
  - "The ally's bonus turn could be capped at 2 actions (not 3 + reaction) to reduce the power ceiling, especially if the ally can cast their own full spells on the bonus turn."
  - "Could add a restriction: the ally cannot use the bonus turn to cast a spell of rank 3 or higher, keeping this as an action-economy spell rather than a second-spell spell."
- **Checklist failures:** none.

## Similar official spells

- **Haste** (rank 3) — the converter's own anchor; grants Quickened (1 extra action/round, Strike or Stride only) for 1 minute, sustained.
- **Time Jump** (rank 3) — self-only, 1-action cast, grants 2 extra actions restricted to movement-type actions (Leap/Stand/Step/Stride) while time pauses around you; a rank-exact "burst of extra actions" comparable, though self-targeted rather than ally-gifted.
- **Quicken Time** (rank 5) — area version of Haste's Quickened effect for anyone starting their turn in the zone; cited here as the rank-5 tier comparable to Lend Time's own 5th-rank heighten.

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell.

## Open flags

- The Trigger line ("Trigger: Immediately before your turn begins.") is plain, unbolded prose without the `<hr/>` separator the official reaction-spell convention uses (e.g., Gentle Landing's `<p><strong>Trigger</strong> ...</p><hr />`). Cosmetic only — the structural `time.value: "reaction"` field is already correctly set.
- The caster's forfeited-resources list (adds "your reaction") and the ally's granted-resources list (a full 3-action + 1-reaction turn) both go beyond a literal reading of the 5e text's "movement, action, bonus action" — worth confirming this expansion was an intentional PF2e action-economy remap.
- Duration is recorded as "until the end of the ally's turn"; the 5e original's duration entry is a flat "1 turn." Phrasing differs but appears functionally consistent.
