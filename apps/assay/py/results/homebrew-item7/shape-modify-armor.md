# Shape Modify: Armor

## Header block

- **Rank:** 3 (store `system.level.value = 3`)
- **Routing:** `ledger:no-comparable-profile` — **pool reason:** ledger
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: null`, `residualRanks: null`)
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

- **Name:** Shape Modify: Armor (source: `tfc`)
- **Level:** 3rd
- **School:** gestalt
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V, S, M ("a smooth river stone")
- **Duration:** special
- **Classes:** Druid

**Entries:**

> You draw upon the collective's memory of wildshaping to refine your wildshaping. As part of casting this spell, you also transform as through the Wild Shape ability. Doing so still expends a charge of wildshape, and you cannot cast this spell if you have no charges remaining.
>
> You increase the protection your wildshape but also decrease its speed. For the duration of this wildshape you add 2 to your AC, but your movement speed of every type is reduced to 10ft and you lose the ability to dash. The effect ends when you lose your form.

No `entriesHigherLevel` in the 5e original (no upcast text).

## The conversion (canonical store)

> You draw upon the collective's memory of wildshaping to refine your current form. You must be in wild shape (or another polymorph effect) to Cast this Spell; if you are not, the spell fails with no effect. You reinforce the exterior of your current form into thick, rigid plates, trading agility for protection. For the duration, you gain a +2 circumstance bonus to AC in your current form, but your Speed is reduced to 15 feet for all movement types (you cannot Dash or use Sudden Charge). This spell ends immediately when you leave your polymorphed form.
>
> **Heightened (5th)** The circumstance bonus to AC increases to +3, and your Speed penalty is lessened: your Speed is reduced by 10 feet rather than being set to 15 feet.
> **Heightened (7th)** The circumstance bonus to AC increases to +4. The Speed penalty is reduced by a further 5 feet (total: Speed reduced by 5 feet).

No `@UUID[...]` links in this description. Structured fields agree with the prose: `duration.value` matches "until your wild shape ends"; `heightening.levels` has both `"5"` and `"7"` keys (both empty `{}`, per the adapter warning); `target.value = "you"` matches self-only framing.

## What changed, plain English

The AC-for-speed trade-off fiction is preserved, but the numbers, bonus type, and the spell's relationship to the transformation itself all changed, same pattern as its Shape Modify: Accuracy sibling:

- **Numbers — AC:** 5e is a flat **+2 AC**. The conversion is **+2 circumstance bonus to AC** at base rank — the number is identical, but the bonus is now explicitly typed (circumstance) rather than an untyped flat add, and it scales at heighten 5th (+3) and heighten 7th (+4), where 5e has no scaling at all.
- **Numbers — Speed penalty (the headline change):** 5e sets Speed to a flat **10 feet for all movement types**. The conversion instead sets Speed to **15 feet** at base rank — a *smaller* penalty than the 5e original (5 feet more mobility retained). The converter's own notes explain the rationale explicitly: "10-ft speed in PF2e is effectively immobilizing (most enemies will just ignore you); 15 ft is a meaningful but not crippling penalty." At heighten 5th and 7th, the penalty shape changes further, from a flat *set-to-value* to a *reduction-from-base*: 5th heighten reduces Speed by 10 ft (rather than setting to 15 ft flat), and 7th heighten reduces it by only 5 ft total — meaning at higher heighten tiers the penalty scales with the *creature's own base Speed* rather than clamping to a fixed low number, a structurally different penalty shape than 5e's single flat 10-ft floor.
- **Structure — the transformation trigger is inverted (same pattern as Shape Modify: Accuracy):** in 5e, casting this spell also transforms the caster via Wild Shape, expending a wildshape charge, and the spell can't be cast without a charge remaining. The conversion instead requires the caster to **already be in wild shape (or another polymorph effect)**, failing with no effect otherwise — it modifies an existing transformation rather than initiating one. The entire wildshape-charge-expenditure clause from 5e has no PF2e counterpart and is dropped (PF2e has no analogous wildshape-charge resource).
- **"Cannot Dash" → "cannot Dash or use Sudden Charge":** the conversion adds "Sudden Charge" (a PF2e-specific action/feat name) alongside the 5e "cannot dash" restriction — a PF2e-terminology addition naming a second specific action that's blocked, not present by name in the 5e text (5e has no Sudden Charge action to reference).
- **Material component dropped from the store (present in both 5e source and jmnario's conversion):** the 5e original requires "a smooth river stone" as a material component, and jmnario's own conversion preserved this as `cost: "a smooth river stone (consumed)"`. The astra canonical store has `system.cost.value = ""` — the material component has been dropped entirely, with no replacement in `requirements` either. Same pattern as Return Spell and Shape Modify: Accuracy elsewhere in this batch.
- **Heighten vs 5e upcast:** the 5e original has no upcast text at all. Both of the conversion's heighten tiers (5th, 7th) are wholly new scaling content, softening the Speed penalty and raising the AC bonus as the slot improves — no 5e precedent to compare against.

## Converter's notes

- **Anchor:** "No direct anchor — closest is Mystic Armor (rank 1, item bonus AC) but this is circumstance bonus + Speed penalty. The Armor/Speed mirror pair within Shape Modify is its own internal reference."
- **Archetype:** buff (morph modifier; AC bonus / Speed penalty trade-off)
- **Balance bullets:**
  - "+2 circumstance AC is meaningful but offset by Speed reduced to 15 ft — effectively turning the caster's form into a nearly-immobile tank."
  - "Speed 15 ft (not 10 ft as in 5e) is the correct PF2e calibration: 10 ft is effectively immobilizing in a 5-ft-grid system; 15 ft is still a severe penalty without making the caster useless."
  - "The 'cannot Sudden Charge' restriction follows from the Speed reduction and matches the 5e 'cannot dash' rule."
  - "Heightening progressively relaxes the Speed penalty (set-to-15 → -10 ft → -5 ft) rather than increasing the AC bonus, keeping the trade-off identity as the rank improves."
  - "+2 circumstance AC alongside a polymorph's replacement AC: circumstance bonuses apply correctly on top of replacement AC values, so stacking is not an issue."
- **Overridable:**
  - "Could express the Speed penalty as 'halved' rather than a fixed reduction, scaling naturally with the polymorph form's base Speed."
  - "Could swap the Speed penalty for an increased Bulk capacity or item Bulk limit (thematic for a heavily-armored form) if the group doesn't want penalized movement."
- **Checklist failures:** none listed.
- **Series template note:** "SM template entry at rank 3. Armor-specific: +2 circumstance AC, Speed to 15 ft, cannot Sudden Charge, 1-action cast."

## Similar official spells

This spell is routed `ledger:no-comparable-profile` — the ledger pathway explicitly flags it as lacking a comparable-profile match, consistent with the converter's own "No direct anchor" note. Hand-picked official spells nearest in function:

- **Mystic Armor** (rank 1) — the converter's own named partial-anchor. Grants a flat +1 item bonus to AC (scaling to +2 at heighten 6th/8th) plus a raised Dexterity cap, using unarmored proficiency; no downside, no speed penalty, no prerequisite. Comparison axis: shows the going rate for AC-only gain with zero trade-off cost at rank 1 — useful for judging how much of Shape Modify: Armor's higher (+2 at rank 3, scaling to +4) AC bonus is "paid for" by the Speed penalty versus simply being priced for a higher rank.
- **Tempest Cloak** (rank 3) — grants +2 circumstance bonus to AC specifically against physical ranged attacks (not all attacks) plus difficult terrain around the target and a defense bonus against auditory effects; no speed penalty. Comparison axis: another rank-3 circumstance-AC buff, but narrower in scope (ranged-only) and with zero downside — contrasts with Shape Modify: Armor's broader (all-attacks) +2 circumstance AC bonus that's paid for entirely via the Speed penalty.
- **Animal Form** (rank 2) — the base polymorph spell this series modifies. Grants a fixed AC formula ("16 + your level," ignoring armor check penalty/Speed reduction) and fixed per-animal Speed values. Comparison axis: establishes what AC and Speed values a caster typically already has while transformed, which is the baseline Shape Modify: Armor's +2/+3/+4 circumstance bonus and Speed penalty are applied against.

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly.

## Open flags

- The prerequisite clause ("You must be in wild shape (or another polymorph effect) to Cast this Spell; if you are not, the spell fails with no effect") is a full structural inversion of the 5e original's "casting this spell also transforms you" design — same pattern as Shape Modify: Accuracy in this batch; worth confirming this reframing is the intended house design for the whole Shape Modify series rather than an independent per-spell decision.
- Material component ("a smooth river stone") is dropped from `system.cost.value` in the store despite being present in both the 5e source and jmnario's own conversion — same drop pattern as Return Spell and Shape Modify: Accuracy elsewhere in this batch; since `revisions.md` shows zero deviation for this spell, the drop is consistent across a fresh re-conversion of jmnario's baseline (i.e., an adapter-level pattern, not a one-off hand edit).
- The heighten-tier Speed-penalty shape change (flat set-to-15-ft at base rank → reduce-by-10-ft at heighten 5th → reduce-by-5-ft-total at heighten 7th) means the *effective* Speed at higher heighten tiers depends on the transformed creature's own base Speed, unlike the base-rank version's flat clamp to 15 ft — worth confirming this shape shift (clamp vs. reduction) across heighten tiers is intentional.
- No `@UUID[...]` compendium links anywhere in this description.
