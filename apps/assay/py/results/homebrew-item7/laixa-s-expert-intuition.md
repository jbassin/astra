# Laixa's Expert Intuition

## Header

- **Rank:** 4 · **Routing:** ledger:utility · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; no priced quantitative verdict.
- **Adapter warnings:** `fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only`
- **Traits:** concentrate, detection, memetics, mental (rarity: common)
- **Traditions:** occult
- **Cast:** 2 actions
- **Range:** self · **Targets:** you
- **Defense:** none
- **Duration:** 1 hour, not sustained
- **Heightening (structured):** `type: fixed`, `levels: {"6": {}}`

## The 5e original

- **Level** 4, **school** memetics (homebrew)
- **Casting time** 1 action
- **Range** self
- **Components** S only (no verbal, no material)
- **Duration** up to 1 hour, no concentration
- **Classes** Bard, Seeker (SW), Wizard

> Until the spell ends, when you make a Wisdom (Insight) check to determine a deliberate lie, you can replace the number you roll with a 15.

No `entriesHigherLevel` — the 5e original has no upcast/heightening text at all.

## The conversion (canonical store)

> Laixa's insight sharpens your mind to an uncanny acuity, allowing you to pierce deceptions with preternatural certainty. For the duration, when you Sense Motive to detect a lie or notice a deception, you may use 15 as your Perception check result if your roll is lower than 15; this is a fortune effect.
>
> In addition, while this spell is active you cannot be magically compelled or enchanted into believing false information you have already consciously identified as false during the duration (though new deceptions presented after you cast the spell that you have not examined are not automatically rejected).
>
> **Heightened (6th)** The minimum Perception result for Sense Motive checks increases to 20, and you also gain the same minimum result on Diplomacy checks to read emotions and Deception checks to recognize that someone else is using Deception (if the GM calls for such a check).

## What changed, plain English

The core "floor of 15" mechanic is a close 1:1 translation, but everything else around it is new:

- **Action cost:** 5e 1 action → PF2e 2 actions.
- **Core mechanic:** 5e "replace your roll with a 15" for Wisdom (Insight) checks vs. deliberate lies → PF2e "use 15 as your result if your roll is lower" for Sense Motive Perception checks, explicitly labeled a fortune effect. Functionally equivalent floor mechanic.
- **Content ADDED with no 5e basis:** the entire second paragraph — immunity to being magically compelled/enchanted into believing information you've already identified as false — does not exist anywhere in the 5e text.
- **Heightened tier ADDED wholesale:** the 5e original has zero upcast text; the 6th-rank heighten (floor raised to 20, extended to Diplomacy/read-emotions and Deception/detect-Deception checks) is entirely new PF2e-side content.
- **Components narrowed:** 5e is somatic-only (no verbal); the PF2e store's trait list carries only `concentrate` (no `manipulate`) — the somatic/manipulate component was dropped per the converter's own note that "the spell is entirely internal."
- **Classes → tradition:** 5e's Bard/Seeker/Wizard class list narrows to occult only; arcane is explicitly excluded (per the converter's notes, "arcane excluded because the spell targets inner mental certainty not external magical analysis").
- **Description shortened post-seed:** `revisions.md` records a **−472 character** deviation between the current store text and a fresh re-conversion of the vendored baseline — see Prior astra touches.

## Converter's notes

- **Anchor:** no clean analog — closest is True Strike (rank 1 fortune effect on attack rolls) but applied to social/investigative checks; unique design space for a memetics utility spell
- **Archetype:** utility/divination
- **Balance bullets:**
  - "'Use 15 as result if lower than 15' for Sense Motive checks is exactly the 5e design; at rank 4 this is appropriately powerful for a non-combat divination spell (a comparable combat spell, Heroism, gives +1 status to all checks at rank 3 — a floor of 15 on one specific check type is roughly equivalent power)"
  - "Added secondary immunity to magically-compelled false belief to justify the rank-4 slot; bare 'roll 15 on one check type' might be undersized at rank 4"
  - "Named-caster spell — focus spell suggestion logged in overridable"
  - "1-hour duration is exploration-grade and correct for a social/investigative enhancement"
- **Overridable:**
  - "FOCUS SPELL SUGGESTION: Laixa's Expert Intuition is strongly suited as a focus spell (class cantrip equivalent) for a Memetics practitioner or a Seeker archetype; the named-caster association and narrow effect make it ideal as a 1-focus-point ability rather than a spell slot"
  - "The secondary 'cannot be compelled to believe identified falsehoods' benefit is a design addition not in the 5e text; GM may prefer to remove it and adjust the rank down to 3 if the bare 'roll 15' feels sufficient"
- **Checklist failures:** none.

## Similar official spells

- **Discern Lies** (rank 4) — an exact rank match: +4 status bonus to Perception checks when someone Lies, 10-minute duration, uncommon rarity, arcane/divine/occult. Notably, the converter's own anchor claims "no clean analog," but this official spell is a close functional counterpart worth weighing against.
- **Sure Strike** (rank 1) — the baseline fortune-effect reroll (roll twice, take better) that the converter's anchor cites as the nearest published comparison for the "fortune" mechanic shape.
- **Heroism** (rank 3) — +1/+2/+3 status bonus (by heighten tier) to attack rolls, Perception, saving throws, *and* skill checks broadly, for 10 minutes; cited in the converter's own balance bullet as the power-level yardstick.

## Prior astra touches

`revisions.md` logs a deviation for this spell: `description: length delta -472 chars (store=926, baseline=1398)`. This matches the triage doc's §8 voice sweep, which explicitly names Laixa's Expert Intuition among the spells fixed for "the 'associated with X / conversion noted as unusual / see notes' catalog paragraphs (Almonk's Retribution, Laixa's Expert Intuition, Djura's Divine Protection)" — i.e., jmnario's raw conversion included an out-of-world catalog paragraph (referencing "the mnemetic sage Laixa" and the spell's unusual conversion status) that has since been removed from the store text.

## Open flags

- The converter's notes claim "no clean analog" for this mechanic, but Discern Lies (official, rank 4) is a close functional match.
- The secondary "immune to compulsion re: already-identified falsehoods" benefit and the entire 6th-rank heighten tier both have zero basis in the 5e original — pure PF2e-side additions.
- Description text was hand-edited post-seed (−472 chars, voice sweep); the trimmed material appears to have been flavor/catalog text only, but is flagged here for confirmation that nothing mechanically load-bearing was removed alongside it.
