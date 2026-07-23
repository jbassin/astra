# Shape Modify: Severity

## Header block

- **Rank:** 3 (store `system.level.value` = 3)
- **Routing:** buff
- **Pool reason:** wide-range (manual pool) — scorer comparables span rank 1–9 (LOW-INFORMATION)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt, manipulate, morph
- **Traditions:** primal
- **Cast:** 1 action (`time.value` = "1")
- **Range:** self
- **Targets:** you
- **Defense:** none (`system.defense` = null)
- **Duration:** until your wild shape ends (`sustained` = false)
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 3
- **School:** gestalt
- **Casting time:** 1 bonus action
- **Range:** Self
- **Components:** V, S, M (a whittled knife)
- **Duration:** Special
- **Classes:** Druid (PHB)

> You draw upon the collective's memory of wildshaping to refine your wildshaping. As part of casting this spell, you also transform as through the Wild Shape ability. Doing so still expends a charge of wildshape, and you cannot cast this spell if you have no charges remaining.
>
> You increase the sharpness of your claws but blunt your senses in the process. For the duration of this wildshape you have an additional +10 to all damage, but your attack rolls are reduced by 5. The effect ends when you lose your form.

No `entriesHigherLevel` in the 5e original (this spell doesn't upcast in 5e terms — see "What changed").

## The conversion (canonical store)

> You draw upon the collective's memory of wildshaping to refine your current form. You must be in wild shape (or another polymorph effect) to Cast this Spell; if you are not, the spell fails with no effect. You hone the natural weapons of your current form to vicious, almost painful keenness, trading reliable aim for devastating power. For the duration, your unarmed Strikes in your current form deal 2d6 additional damage, but take a -2 circumstance penalty to attack rolls. This spell ends immediately when you leave your polymorphed form.
>
> ---
> **Heightened (5th)** The bonus damage increases to 3d6 and the attack roll penalty is reduced to -1.
>
> **Heightened (7th)** The bonus damage increases to 4d6. The attack roll penalty is removed entirely.

Structured fields: `system.damage` = `{}` (empty — the bonus damage is a modifier to unarmed Strikes, not a spell-rolled damage instance, so it isn't represented in the damage object). `system.heightening` = `{type: "fixed", levels: {"5": {}, "7": {}}}` — both level entries are empty objects; the actual damage-die/penalty deltas exist only in the description prose, per the adapter warning.

## What changed, plain English

The core trade-off (bonus damage for an attack penalty, tied to being in wild shape) is preserved intact. The numeric translation and cast-time convention account for the rest.

- **Numbers:** 5e's flat "+10 damage / −5 to attack" becomes PF2e's "+2d6 damage (avg +7) / −2 circumstance to attack." This is a substantial re-scaling in both directions — the flat +10 was very large for a 3rd-level effect, and the −5 attack penalty is likewise steeper than the −2 PF2e uses.
- **Action economy:** 5e bonus action → PF2e 1 action (the store's `time.value` is "1"; the bonus-action concept doesn't exist in PF2e).
- **Heightening structure:** 5e had no upcast text at all (the entry doesn't mention casting at a higher level). PF2e's conversion ADDS two heighten steps (5th: 3d6/−1, 7th: 4d6/no penalty) that have no 5e basis — this is new content invented for the conversion, not translated from anywhere in the original entry.
- **Prerequisite text:** the "you must be in wild shape... spell fails with no effect" sentence is an explicit prerequisite clause not present verbatim in the 5e text (5e says the Wild Shape transformation happens AS PART of casting the spell and expends a charge — i.e., 5e's Severity itself triggers the wildshape; the PF2e version instead REQUIRES you to already be shaped and does not expend/trigger a wildshape charge itself). This is a structural change to what the spell does at the point of casting, not just a numbers translation.
- **Material component:** the 5e material ("a whittled knife") was structurally present in the intermediate jmnario conversion (`cost: "a whittled knife (consumed)"`) but the canonical store's `cost.value` is empty string — the material was dropped between the jmnario stage and the current store.

## Converter's notes

- **Anchor:** "Internal mirror of Shape Modify: Accuracy (attack penalty / damage bonus is the inverse of attack bonus / damage penalty). No published analog."
- **Archetype:** buff (morph modifier; damage bonus / attack penalty trade-off)
- **Balance bullets:**
  - "+2d6 bonus damage (avg +7) at rank 3 is strong for a natural attack but requires a -2 attack roll penalty — the net effect is roughly neutral against most defenses (the bonus damage is offset by the miss chance)."
  - "Expressed as bonus dice (+2d6) rather than flat bonus (+10 as in 5e) for PF2e consistency; dice-based bonus damage is the published convention for spells that modify strikes."
  - "The -2 circumstance penalty to attacks at rank 3 is the same magnitude as the Accuracy bonus, creating perfect symmetry between the two spells."
  - "Heightening removes the attack penalty progressively (still -2 at 3rd, -1 at 5th, 0 at 7th) while increasing damage (+2d6 → +3d6 → +4d6), rewarding higher-rank slots."
  - "Conceptual mirror: Accuracy is 'sniper mode' (precise but weak); Severity is 'berserker mode' (powerful but inaccurate)."
- **Overridable:** "The bonus damage could be changed to persistent damage (e.g., +1d6 persistent bleed on hit) for a 'bleeding wounds' flavor matching the 'whittled knife' material component." / "+2d6 could be +1d12 (similar average, different die) for a 'high variance single blow' feel."
- **Checklist failures:** none recorded.

## Similar official spells

- **Claws of the Otter** (rank 2) — grants a claws unarmed attack (1d4 slashing + 1d6 cold) plus a +1 status bonus to Swim; heightens the bonus damage die by 3 ranks. Comparable axis: a self-buff that adds bonus damage to unarmed/natural strikes, but with no accuracy trade-off.
- **Clawsong** (rank 2) — upgrades a target's existing claw attack's die size/traits (versatile piercing, deadly). Comparable axis: strike modification via targeted buff, no downside.
- **Consecrate Flesh** (rank 3) — adds flat bonus damage (1 spirit) to unarmed attacks plus a reactive damage aura and healing-spell upside; no accuracy penalty.
- **Blazing Armory** (rank 2) — materializes a +1 striking weapon (fire damage) into the target's hand; a flat accuracy/damage upgrade, no downside.
- **Insect Form** (rank 3) — a full polymorph package (not a strike-only modifier) at the same rank; useful as a rank-3 morph-trait reference point.
- Scorer comparables (low-information): rank range 1–9 supplied by the assay scorer's manual pool (wide-range, no specific named comparables).

## Prior astra touches

`sphere-of-ruin`... n/a here — checked `apps/assay/homebrew/revisions.md` directly: **no entry** for "Shape Modify: Severity" (0 deviations from a fresh re-conversion of the vendored baseline; the store matches what the current adapter code produces exactly). The trait set (`concentrate, gestalt, manipulate, morph` — using the custom "gestalt" school-trait tag mapped from the 5e school field, rather than any real PF2e school trait, and dropping "primal" as a duplicate trait/tradition) is baked into the adapter output itself, consistent with the repo-wide trait-hygiene/school-traits convention referenced in project memory — not a spell-specific hand edit.

## Open flags

- `system.damage` is empty even though the spell's entire mechanical effect is a damage/accuracy modifier to Strikes — this is a structural convention (bonus-to-strikes isn't a spell-rolled damage instance) rather than a missing-data bug, but is worth the reviewer's eyes given the adapter had to flag it explicitly.
- `system.heightening.levels` holds two empty objects (`"5": {}`, `"7": {}`) — the heighten deltas exist only as free text in the description; nothing in the structured heightening data reflects the 3d6/4d6 progression or the shrinking attack penalty.
- Material component ("a whittled knife") is present in the jmnario intermediate conversion's `cost` field but absent from the final store's `cost.value` — a materials-scrub artifact, not a hand-authored change to this spell specifically.
- The prerequisite clause ("you must be in wild shape... to Cast this Spell; if you are not, the spell fails with no effect") describes a different causal relationship than the 5e original, where casting the spell itself triggers the Wild Shape transformation and consumes a wildshape charge. In the PF2e version, no wildshape charge is consumed by this spell at all — Severity only refines an already-active form.
- Traits include the custom homebrew school-trait tag "gestalt" (mapped 1:1 from the 5e school field) rather than a standard PF2e trait; Remaster removed spell schools entirely, so this tag has no official PF2e counterpart.
