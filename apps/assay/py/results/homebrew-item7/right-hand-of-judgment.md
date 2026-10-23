# Right Hand of Judgment

## Header block

- **Rank:** 4 (store `system.level.value = 4`)
- **Routing:** `ledger:utility` — **pool reason:** ledger
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: null`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, fortune, kosmoturgy
- **Traditions:** divine
- **Cast:** 1 action (`system.time.value = "1"`)
- **Range:** self
- **Targets:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** 1 minute (not sustained)
- **Heightening:** fixed, levels 6 and 8

## The 5e original

- **Name:** Right Hand of Judgment (source: `tfc`)
- **Level:** 4th
- **School:** kosmoturgy
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V, S (no M)
- **Duration:** 1 minute (no concentration)
- **Classes:** Cleric, Paladin

**Entries:**

> You rob the force behind enemies' attacks and turn it back on them. For the duration of the spell, taking the dodge action grants you a charge. When you make a successful attack, you may expend a charge to turn the normal hit into a critical hit. Charges disappear when the spell ends.

No `entriesHigherLevel` in the 5e original (no upcast text, and no mention of a companion "Left Hand" spell in the 5e entries themselves).

## The conversion (canonical store)

> You channel kosmoturgy through your right hand, siphoning the kinetic force of incoming blows and storing it as a cosmic charge that you can spend to devastate your enemies. For the duration, once per round when a creature's attack roll against you fails (including a critical failure), you gain 1 charge. You can hold a maximum of 3 charges at one time. Charges dissipate when the spell ends.
>
> **Expend Charge:** When you successfully make a Strike, you may expend 1 charge as part of that Strike (before the damage roll). That Strike's damage roll gains the following fortune effect: you roll the damage dice twice and take the higher result.
>
> This spell is paired with Left Hand of Judgment (which governs the counter-attack reaction). Both spells can be active simultaneously, but casting a second of the pair while the other is already active does not suppress the first — unlike Left Hand, Right Hand is passive and does not interfere with reactions.
>
> **Heightened (6th)** You can hold up to 5 charges, and you also gain 1 charge the first time each round that you successfully hit a creature with a Strike (stacks with charges from missed attacks against you).
> **Heightened (8th)** Expending a charge on a Strike also increases the Strike's damage by a number equal to your spellcasting ability modifier.

No `@UUID[...]` links in this description. Structured fields agree with the prose: `duration.value = "1 minute"`, `duration.sustained = false`; `heightening.levels` has both `"6"` and `"8"` keys present (both empty `{}` objects, per the adapter warning — heighten text lives in the description appendix only).

## What changed, plain English

The charge-accumulation-then-spend fiction is preserved, but the trigger for gaining a charge and the payoff for spending one were both substantially reworked, because 5e's "Dodge → auto-crit" pairing doesn't translate cleanly to PF2e's crit math:

- **Charge trigger changed:** 5e grants a charge for **taking the Dodge action** (a defensive choice the caster actively makes each turn). The conversion instead grants a charge **"once per round when a creature's attack roll against you fails"** — a passive, reactive trigger tied to what enemies do to you, not an action the caster spends. This is a full mechanical replacement of the trigger condition, not a numbers tweak — the 5e version rewards actively choosing not to attack; the PF2e version rewards being missed regardless of what the caster does.
- **Charge cap added:** 5e has **no stated cap** on charges (Dodge every round, accumulate indefinitely within the 1-minute duration). The conversion adds an explicit **3-charge cap** (5 at heighten 6th) — a new resource-management constraint absent from the source.
- **Payoff changed (the core rebalance):** 5e lets you spend a charge to **turn a normal hit into a critical hit outright**. The conversion instead lets you spend a charge for a **fortune effect on the damage roll** (roll twice, take the higher) — explicitly *not* a crit conversion. The converter's own notes state this plainly: an auto-crit-conversion mechanic "would be overwhelmingly strong in PF2e where crits deal double damage on all damage dice." This is the single largest structural change in the spell.
- **Heighten vs 5e upcast:** the 5e original has no upcast text at all. The conversion adds two new fixed-tier heighten unlocks with no 5e precedent: heighten 6th raises the charge cap to 5 and adds a second charge-generation trigger (landing a hit, not just being missed); heighten 8th adds flat bonus damage (spellcasting ability modifier) when a charge is spent. Both heighten tiers are wholly new content relative to the source, not scaled translations of anything in the 5e text.
- **Content added — the "Left Hand of Judgment" cross-reference paragraph:** the entire third paragraph ("This spell is paired with Left Hand of Judgment... unlike Left Hand, Right Hand is passive and does not interfere with reactions") has no counterpart anywhere in the 5e Right Hand of Judgment entry. It exists because a separate 5e spell, "Left Hand of Judgment," is a real companion entry in the vendored 5e source file (rank 4, kosmoturgy, Cleric/Paladin, reaction-based counter-attack) — the cross-reference paragraph is new connective content added during conversion, describing how two independently-converted homebrew spells interact.
- **Nothing dropped** from the core "accumulate charges, spend one for a combat payoff" fiction.

## Converter's notes

- **Anchor:** "no clean analog for a charge-accumulation Strike-enhancer as a spell; closest is Sure Strike (rank 1 fortune on one attack) but Right Hand is a sustained multi-charge system"
- **Archetype:** buff/combat-enhancement
- **Balance bullets:**
  - "Fortune on damage rolls (roll twice, take higher) rather than auto-crit conversion: 5e's 'convert hit to crit' would be overwhelmingly strong in PF2e where crits deal double damage on all damage dice — fortune-damage is the proportionate PF2e equivalent at rank 4"
  - "Charges from missed attacks against you creates a counterintuitive incentive (being missed is good) — but this preserves the 5e 'Dodge to charge' fiction of gathering enemies' kinetic energy"
  - "3-charge cap prevents snowballing over a long fight; maximum stored fortune investment is capped"
  - "1-action cast for a passive charge-accumulation buff is correct (does not provide immediate combat value)"
- **Overridable:**
  - "Fortune on damage (not crit conversion) is the biggest departure from 5e; GM may want to restore a limited crit-conversion (e.g., 'your next Strike is a hit if it would otherwise be a failure, and a critical hit if it would be a hit') as a more faithful translation — this would need incapacitation evaluation"
  - "Charges from missed attacks (not from Dodge) is an interpretation change: 5e said 'Dodge action grants a charge'; PF2e has no exact Dodge action; missed-attacks is the functional equivalent"
- **Checklist failures:** none listed.

## Similar official spells

- **Sure Strike** (rank 1) — the converter's own named anchor. Grants fortune (roll twice, take higher) on the *attack roll* of your next attack this turn, then a 10-minute self-immunity. Comparison axis: shows the going rate for a fortune effect at the cheap end (rank 1, single-use, attack roll only) versus Right Hand's rank-4 version (fortune on *damage* roll, gated behind a multi-round charge-accumulation system, reusable every time a charge is available).
- **Winning Streak** (rank 4) — grants Quickened contingent on landing a critical hit against a significant foe, and extends the effect chain-style as crits keep landing. Comparison axis: another rank-4 combat buff whose big payoff is conditional on landing/critting attacks, useful for judging where a "your good rolls snowball into more good stuff" design should sit on the rank ladder.
- **Heroism** (rank 3) — flat +1 status bonus (scaling +2/+3 at heighten 6th/9th) to attack rolls, Perception, saves, and skill checks, no trigger or resource gate. Comparison axis: a baseline unconditional combat buff one rank below Right Hand, useful for judging how much a gated/conditional charge-based payoff (Right Hand) should be worth relative to a simple always-on numeric bonus (Heroism) at a nearby rank.

**Scorer comparables:** none available — this spell routes through `ledger:utility`, not the comparables scorer pool, so no rank-range or named-comparable data exists in the queue for it.

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly.

## Open flags

- The description's cross-reference to "Left Hand of Judgment" describes cross-spell interaction rules (stacking behavior between the two paired spells) inside this spell's own description text — factually accurate (Left Hand of Judgment does exist as a separate homebrew spell in the store, `left-hand-of-judgment.json`) but worth flagging since it means this spell's balance/behavior is partly defined by reference to a second spell's own text, not fully self-contained.
- The charge-generation trigger ("once per round when a creature's attack roll against you fails, including a critical failure") is a passive, reactive resource-gain mechanic with no player agency involved in triggering it — a genuine structural departure from the 5e original's active "take the Dodge action" trigger, flagged for review attention given how central it is to the spell's whole design.
- No `@UUID[...]` compendium links anywhere in this description.
