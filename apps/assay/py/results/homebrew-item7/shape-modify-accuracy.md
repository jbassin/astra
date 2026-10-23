# Shape Modify: Accuracy

## Header block

- **Rank:** 3 (store `system.level.value = 3`)
- **Routing:** `buff` — **pool reason:** wide-range, scorer comparables rank range **1–9** (LOW-INFORMATION — flagged in the pool as the reason for manual review)
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: [1, 9]`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt, manipulate, morph
- **Traditions:** primal
- **Cast:** 1 action (`system.time.value = "1"`)
- **Range:** self
- **Targets:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** until your wild shape ends (not sustained)
- **Heightening:** fixed, levels 5 and 7

## The 5e original

- **Name:** Shape Modify: Accuracy (source: `tfc`)
- **Level:** 3rd
- **School:** gestalt
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V, S, M ("a preserved eye")
- **Duration:** special
- **Classes:** Druid

**Entries:**

> You draw upon the collective's memory of wildshaping to refine your wildshaping. As part of casting this spell, you also transform as through the Wild Shape ability. Doing so still expends a charge of wildshape, and you cannot cast this spell if you have no charges remaining.
>
> You increase the sharpness of your senses but blunt your claws in the process. For the duration of this wildshape you have an additional +5 to hit, but your damage is reduced by 10. The effect ends when you lose your form.

No `entriesHigherLevel` in the 5e original (no upcast text).

## The conversion (canonical store)

> You draw upon the collective's memory of wildshaping to refine your current form. You must be in wild shape (or another polymorph effect) to Cast this Spell; if you are not, the spell fails with no effect. You sharpen the senses of your current form, trading raw striking power for precision. For the duration, your unarmed Strikes in your current form gain a +2 circumstance bonus to attack rolls, but deal 2d6 less damage (minimum 1). If this penalty would reduce the damage to 1, the attack still deals 1 damage. This spell ends immediately when you leave your polymorphed form.
>
> **Heightened (5th)** The circumstance bonus to attack rolls increases to +3.
> **Heightened (7th)** The circumstance bonus to attack rolls increases to +4, and the damage penalty is reduced to 1d6 less.

No `@UUID[...]` links in this description. Structured fields agree with the prose: `duration.value` matches "until your wild shape ends"; `heightening.levels` has both `"5"` and `"7"` keys (both empty `{}`, per the adapter warning); `target.value = "you"` matches self-only framing.

## What changed, plain English

The trade-off fiction (sharper senses, blunter strikes) survives intact, but 5e's flat modifiers were converted to PF2e's bonus-type system, and the spell's relationship to the transformation itself was inverted:

- **Numbers:** 5e is **+5 to hit / −10 damage flat**. The conversion is **+2 circumstance to attack rolls / −2d6 damage** (average −7), scaling at heighten 5th (+3 to-hit) and heighten 7th (+4 to-hit, damage penalty reduced to −1d6). The converter's own notes call out that 5e's flat numbers "are extremely high for their level and reflect 5e's different math scale" — this is a genuine down-scaling of the raw numbers, not a like-for-like transcription (5e +5/−10 flat vs. PF2e's typical +1 to +4 circumstance-bonus range for buffs).
- **Bonus type:** 5e's +5/−10 are untyped flat modifiers. The conversion expresses the attack bonus as a **circumstance bonus** specifically (a PF2e-typed bonus, subject to standard stacking rules with other circumstance bonuses) rather than an untyped number.
- **Structure — the transformation trigger is inverted:** in 5e, **casting this spell itself transforms you** ("As part of casting this spell, you also transform as through the Wild Shape ability. Doing so still expends a charge of wildshape") — it is a combined transform-and-modify spell. The conversion instead requires the caster to **already be in wild shape (or another polymorph effect)** before casting, and the spell "fails with no effect" if not — it modifies an existing transformation rather than initiating one. This is a structural redesign, not a numbers change: the entire "expends a wildshape charge" clause and the "you cannot cast this spell if you have no charges remaining" gate are both dropped, replaced by a prerequisite-check-and-fail-if-absent gate instead.
- **Content dropped:** the wildshape-charge-expenditure clause from 5e ("Doing so still expends a charge of wildshape, and you cannot cast this spell if you have no charges remaining") has no PF2e equivalent in the conversion — PF2e has no wild-shape-charge resource to spend, so this entire mechanical clause is dropped rather than translated (documented explicitly in the converter's own notes as an intentional design choice, "PF2e has no wild shape charges").
- **Heighten vs 5e upcast:** the 5e original has no upcast text at all (no `entriesHigherLevel`). The conversion's two heighten tiers (5th: +3 to-hit; 7th: +4 to-hit and damage penalty softened to −1d6) are wholly new scaling content with no 5e precedent to compare against.
- **Minimum-damage floor added:** the conversion adds "deal 2d6 less damage (minimum 1)... If this penalty would reduce the damage to 1, the attack still deals 1 damage" — a PF2e-standard damage-floor clause not present in the 5e text (5e's flat −10 damage has no stated floor either, though 5e damage rolls generally can't go below 0 by default rule).
- **Material component dropped from the store (present in both 5e source and jmnario's conversion):** the 5e original requires "a preserved eye" as a material component, and jmnario's own conversion preserved this as `cost: "a preserved eye (consumed)"`. The astra canonical store has `system.cost.value = ""` — the material component has been dropped entirely, with no replacement in `requirements` either. Same pattern as Return Spell and Shape Modify: Armor elsewhere in this batch.

## Converter's notes

- **Anchor:** "Heroism (rank 3, +1 status to attacks) — Accuracy gives +2 circumstance (different bonus type, higher value) with a -2d6 damage penalty as the trade-off cost."
- **Archetype:** buff (morph modifier; attack bonus / damage penalty trade-off)
- **Balance bullets:**
  - "+2 circumstance to attack rolls is strong but narrowly scoped (unarmed Strikes in current form only, requires existing polymorph effect)."
  - "-2d6 damage penalty is meaningful at rank 3 (typically removes 1–2 dice from an Animal Form's natural attacks) and creates a genuine strategic trade-off."
  - "1-action cast is correct for a modifier layered onto an existing transformation — matches PF2e's convention for 1-action buff adjustments (like many Focus Spells)."
  - "Prerequisite (must be in polymorph) strictly limits when this is usable — not a spam-able universal attack buff."
  - "Heightened (5th/7th) improves the attack bonus (+3/+4) while lessening the damage penalty (-2d6 → -1d6 → 0), rewarding investment in higher-rank slots."
- **Overridable:**
  - "The damage penalty could be expressed as -5 flat (matching 5e more closely) rather than -2d6 — simpler but less variable."
  - "Could allow a Perception check bonus as an alternative to the attack roll bonus, matching the 'sharpen senses' fiction more literally."
- **Checklist failures:** none listed.
- **Series template note:** "SM template entry at rank 3. Accuracy-specific: +2 circumstance to attack rolls, -2d6 damage, 1-action cast, prerequisite polymorph."

## Similar official spells

- **Heroism** (rank 3) — the converter's own named anchor. Flat +1 status bonus (scaling to +2/+3 at heighten 6th/9th) to attack rolls, Perception, saves, and skill checks, no trade-off cost, no prerequisite. Comparison axis: shows the going rate for an unconditional, no-cost combat buff at rank 3, against which Shape Modify: Accuracy's higher (+2) but trade-off-gated and prerequisite-gated bonus can be judged.
- **Animal Form** (rank 2) — the base polymorph spell this series is designed to layer on top of. Grants a **fixed** attack modifier (e.g., "+9" at a stated level) and fixed unarmed-attack damage dice per chosen animal, replacing the caster's own attack math while transformed. Comparison axis: illustrates that the "current form" Shape Modify: Accuracy modifies typically comes with its own fixed, level-scaled attack bonus already baked in (not derived from the caster's own proficiency/ability score bonuses) — relevant context for judging what a further +2/+3/+4 circumstance bonus on top of an already-fixed battle-form attack number is worth.
- **Sure Strike** (rank 1) — single-attack fortune (roll twice, take higher) rather than a flat bonus, self-limiting via a 10-minute reuse immunity. Comparison axis: a cheaper, different-mechanism way to buy "more likely to hit," useful for bracketing what a guaranteed +2–4 circumstance bonus at rank 3+ should be worth against a fortune-based alternative at rank 1.

**Scorer comparables (low-information):** none named — the queue only records the rank range (1–9) that routed this spell to the buff comparables pool; no per-spell comparable list has been computed yet (verdict/rankRange fields are otherwise null).

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly.

## Open flags

- The prerequisite clause ("You must be in wild shape (or another polymorph effect) to Cast this Spell; if you are not, the spell fails with no effect") is a full structural inversion of the 5e original's "casting this spell also transforms you" design — worth confirming this reframing (modifier-on-existing-transformation vs. transformation-that-includes-the-modifier) is the intended house design for the whole Shape Modify series (both Accuracy and Armor share this same pattern — see `shape-modify-armor.md`).
- Material component ("a preserved eye") is dropped from `system.cost.value` in the store despite being present in both the 5e source and jmnario's own conversion — same drop pattern as Return Spell and Shape Modify: Armor elsewhere in this batch; since `revisions.md` shows zero deviation for this spell, the drop is consistent across a fresh re-conversion of jmnario's baseline (i.e., an adapter-level pattern, not a one-off hand edit).
- No `@UUID[...]` compendium links anywhere in this description.
