# Incensed Bestial Rage

## Header block

- **Rank:** 5 (store `system.level.value = 5`)
- **Routing:** ledger:no-comparable-profile
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual figure supplied in the chunk 6 manifest for this spell — only routing/pool-reason.
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, gestalt (custom trait), manipulate, morph, polymorph — rarity common
- **Traditions:** primal
- **Cast:** `1` action
- **Range:** self
- **Targets:** none specified (`system.target.value = ""`)
- **Defense:** none
- **Duration:** "1 minute", `sustained: false`
- **Cost:** `system.cost.value = ""` (empty — no material cost recorded in the store)
- **Heightening:** **no `system.heightening` object present in the store at all** — the "Heightened (+2)" text exists only in the description prose (see Open flags).

## The 5e original

- **Level:** 5 · **School:** gestalt (source: `tfc`)
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V, S, M — "a sharper tooth" (no gp cost given)
- **Duration:** special
- **Classes:** Druid

**Entries:**

> You draw upon the collective's memory of wildshaping to refine your wildshaping. As part of casting this spell, you also transform as through the Wild Shape ability (expending an action to do so). Doing so still expends a charge of wildshape, and you cannot cast this spell if you have no charges remaining.
>
> You greatly increase the speed and power of your wildshape but also increase its bulk. For the duration of this wildshape you have advantage on all melee attacks and deal an additional 2d6 damage, but all melee attacks on you have advantage as well. The effect ends when you lose your form. When the spell ends you gain a level of exhaustion.

No `entriesHigherLevel` block — the 5e original has no upcast/heightening text at all.

## The conversion (canonical store)

> You tap into the collective memory of generations of shapeshifters, pushing your wild form to its most primal extreme. You must be in a battle form created by a polymorph spell of rank 3 or lower (such as Animal Form heightened to rank 4 or Insect Form) to cast this spell; it enhances that existing form rather than replacing it.
>
> While Incensed Bestial Rage is active, your battle form gains the following benefits and drawbacks:
> - Your unarmed Strikes from the battle form deal 2d6 additional damage.
> - Your battle form's AC is reduced by 2 (the rage makes your movements aggressive and predictable).
> - You gain 20 temporary HP.
> - You gain a +2 status bonus to Athletics checks.
> - You cannot use the Sustain action to alter the details of the original polymorph spell; the incensed form is locked in its most feral configuration.
>
> This effect ends when your underlying battle form ends.
>
> **Heightened (+2)** The additional damage increases by 1d6 and the temporary HP increases by 10.

The "Heightened (+2)" paragraph has no matching entry in `system.heightening` (the field is entirely absent from this spell's JSON) — a prose/structured-field disagreement (see Open flags).

## What changed, plain English

- **Prerequisite mechanic completely rebuilt:** 5e requires the caster to Wild Shape (expending a wildshape charge) *as part of casting this spell* — it's a combined "shapeshift + rage" action. The store instead requires the caster to *already* be in an existing rank-3-or-lower polymorph-spell battle form before casting; Incensed Bestial Rage no longer transforms the caster itself, it only buffs an existing form. This is a different resource economy: 5e spends a wildshape charge, the store spends nothing extra (just an existing ongoing polymorph spell).
- **"Advantage" translated to numbers/penalty:** 5e gives the caster advantage on all melee attacks (and gives enemies advantage against the caster too — a symmetric drawback). PF2e has no advantage mechanic; the store instead gives +2d6 bonus damage (offense) and −2 AC (defense penalty) as the closest numeric analogs — not a literal translation, a redesigned mechanic pair.
- **Bonus damage target changed:** 5e's +2d6 applies to "all melee attacks" (any melee weapon or unarmed Strike while in the form). The store narrows this to "unarmed Strikes from the battle form" only.
- **ADDED, no 5e basis:** 20 temporary HP and a +2 status bonus to Athletics checks — neither appears anywhere in the 5e entries.
- **ADDED, no 5e basis:** the "cannot use the Sustain action to alter the details of the original polymorph spell" clause — a PF2e-specific mechanical restriction with no 5e counterpart (5e has no equivalent "sustain to alter form details" option to restrict).
- **DROPPED from 5e:** "When the spell ends you gain a level of exhaustion." PF2e has no exhaustion condition, and no replacement end-of-spell cost was substituted — the drawback is simply gone.
- **Action cost:** 5e's bonus action becomes a full 1 action in the store (not a 1:1 economy port, but PF2e has no bonus-action equivalent).
- **Duration:** 5e's vague "special" duration (tied to losing wildshape form) becomes a flat "1 minute" in the store, while ALSO retaining "this effect ends when your underlying battle form ends" — the store effectively has two independent end conditions (1-minute timer AND form-loss) where 5e had only one (form-loss).

## Converter's notes

- **Anchor:** "Animal Form (rank 2-5 polymorph template) — this is the rank-5 escalation of Bestial Rage (rank 3)"
- **Archetype:** polymorph / buff (battle-form rider)
- **Balance bullets:**
  - "Requires an existing battle form to cast — not a standalone polymorph; power budget is a rider on top of Animal Form's rank-5 tier"
  - "+2d6 bonus damage on all unarmed Strikes from the form: at rank 5, Animal Form unarmed attacks deal double dice already; the rider adds avg +7 per hit, which is meaningful but not broken"
  - "−2 AC tradeoff models the '5e advantage on attacks against you' accurately; net power is roughly zero-sum (more offense, less defense)"
  - "20 temp HP + +2 Athletics matches the Animal Form rank-5 row standard; the rider enhances within the expected range"
  - "1-action cast while in form — reflects the bonus-action 5e nature without breaking action economy"
- **Overridable:**
  - "The morph trait (vs full polymorph replacement) could be changed to polymorph if the DM prefers this to be a fresh transformation rather than an enhancement"
  - "The −2 AC penalty could be removed if the author feels the crit-fail-enabling cost is sufficient flavor without mechanical teeth"
- **Checklist failures:** none recorded.

## Similar official spells

- **Moon Frenzy (rank 5)** — same rank, `morph` trait (not `polymorph`), grants 5 temp HP plus new natural weapon attacks (fangs 2d8, claws 2d6) layered onto the target's existing kit without replacing it. Notably grants only 5 temp HP and no AC penalty, versus Incensed Bestial Rage's 20 temp HP + −2 AC at the same rank.
- **Insect Form (rank 3)** — explicitly named in Incensed Bestial Rage's own prose as one of the qualifying prerequisite forms ("such as Animal Form heightened to rank 4 or Insect Form"); included here to show what the underlying battle form Incensed Bestial Rage rides on top of actually provides.
- **Animal Form (rank 2)** — the other prerequisite form named in the prose; base-rank battle-form template for comparison against the rider's added numbers.
- No official spell requires the caster to *already be under a different polymorph spell's effect* as a casting prerequisite — this "rider that requires an existing separate polymorph" structure has no direct official precedent in the searched rank range.

## Prior astra touches

None found — `Incensed Bestial Rage` does not appear in `revisions.md`'s deviation list (store matches the fresh baseline re-conversion exactly).

## Open flags

- **Structured/prose disagreement:** the description contains a full "Heightened (+2)" paragraph, but `system.heightening` is entirely absent from this spell's JSON (no `type` or `levels` object at all) — every other spell in this chunk has at least a `heightening` object even when its structural content is thin. This is the one spell in the chunk with zero structural heightening representation.
- The `gestalt` trait is a custom, non-canonical PF2e trait mirroring the 5e school name — recurring pattern across this homebrew set.
- 5e's "gain a level of exhaustion when the spell ends" drawback was dropped with no PF2e-equivalent replacement cost.
- No death-save, bonus-action, or other Remaster-incompatible 5e-isms remain in the prose; no curse-removal language present.
