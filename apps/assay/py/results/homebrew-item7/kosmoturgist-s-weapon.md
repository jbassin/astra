# Kosmoturgist's Weapon

## Header

- **Rank:** 7 · **Routing:** quantitative · **Pool reason:** reclassified-out
- **Current assay line:** verdict **−1.36 ranks (COLD)**; residual **−1.36 ranks**. Per the triage doc (§4a), this row was pulled out of the pure-damage COLD worklist as a **lens artifact** — grouped with Solar Fury, Righteous Pressure, and Planar Shield as "4 sustained/charge... reclassified OUT (per-Strike/per-round dice vs per-cast budget)."
- **Adapter warnings:** `defense text has qualifiers beyond the base save/attack shape, not structurally represented (only the primary save/attack-roll mapped): 'basic Reflex (Control mode) or spell attack roll (Attack/Defend modes)'`
- **Traits:** concentrate, force, kosmoturgy, manipulate (rarity: common)
- **Traditions:** divine
- **Cast:** 2 actions
- **Range:** 60 feet · **Targets:** none listed (mode-dependent) · **Area:** none
- **Defense:** `save.basic = true`, `statistic = reflex` (captures Control mode only — see Open Flags)
- **Duration:** 1 minute, not sustained
- **Damage (structured):** index 0 = `3d10+8` force, index 1 = `3d10+8` force, index 2 = `4d10` force
- **Heightening (structured):** `type: interval`, `interval: 1`, `damage: {"0": "1d10"}` — only index 0 is bumped structurally (see Open Flags)

## The 5e original

- **Level** 7, **school** kosmoturgy (homebrew)
- **Casting time** 1 action
- **Range** 60 feet
- **Components** V, S, M ("a necklace made from a pure precious metal")
- **Duration** 1 minute, no concentration
- **Classes** Cleric, Paladin

> You compress a space within range into a floating, ethereal weapon that lasts for the duration or until you cast this spell again. When you cast this spell and as on a bonus action on each of your subsequent turns for the duration, you may move the weapon up to 20 feet and choose one of the following commands:
>
> **Attack** The weapon makes a melee spell attack. On a hit, the target takes 3d10 + your spellcasting ability modifier force damage.
>
> **Defend** The weapon guards a creature of your choice within 5 feet, granting it partial cover. The first time a hostile creature comes within 5 feet of the weapon, it will attack that creature, making a melee spell attack with your spell modifier. On a hit the creature takes 3d10 + your spellcasting ability modifier force damage, and the sword becomes dormant until the beginning of your next turn.
>
> **Control** The weapon begins to rapidly spin, controlling movement through its space. Creatures that start their turn within or enter the weapon's space must make a Dexterity saving throw against your spell save DC or take 4d10 force damage.
>
> The weapon can take whatever form you choose. Clerics of dieties who are associated with a particular weapon (as Bhaal is known for its twisted dagger and Mask for its garrote) may prefer to make this spell's effect resemble that weapon.

No `entriesHigherLevel` — no upcast text in the 5e original.

## The conversion (canonical store)

> You compress a volume of space into a floating ethereal weapon of force that persists for the duration. On the round you cast the spell, and as a 1-action activity on each subsequent turn, you can move the weapon up to 20 feet and choose one mode: Attack: The weapon makes a melee spell attack roll. On a hit, the struck creature takes 3d10+8 force damage (double damage on a critical hit). Defend: The weapon takes position adjacent to a creature of your choice within its reach. Until the start of your next turn, the first hostile creature that moves to be adjacent to the protected creature is attacked by the weapon (spell attack roll; 3d10+8 force damage on a hit). Control: The weapon spins rapidly. Each creature in or adjacent to the weapon's space must attempt a basic Reflex save; on a failure they take 4d10 force damage. You cannot have more than one Kosmoturgist's Weapon active at a time.
>
> **Critical Success** Unaffected (Control mode only).
> **Success** Half damage (Control mode only).
> **Failure** Full damage (Control mode only).
> **Critical Failure** Double damage (Control mode only).
>
> **Heightened (+1)** Attack and Defend mode damage increases by 1d10; Control mode damage increases by 1d10.

## What changed, plain English

The three-mode structure (Attack/Defend/Control) and the compressed-space fiction survive intact, but several numbers and structures changed in the translation:

- **Casting time:** 5e 1 action → PF2e 2 actions (standard ranked-spell cast); the per-turn *command* action changes from 5e's bonus action to a PF2e "1-action activity (concentrate)."
- **Damage formula:** 5e "3d10 + your spellcasting ability modifier" (a variable, ~+5–7 at this level) → PF2e flat "3d10+8" — the converter's own notes call this out explicitly ("using +8 as a moderate fixed value").
- **Control mode save:** 5e "Dexterity saving throw against your spell save DC" (binary pass/fail) → PF2e "basic Reflex save" with the full four-degree structure (crit success/success/failure/crit failure) added — the 5e original has no degrees of success at all.
- **Defend mode content dropped:** 5e's Defend mode explicitly grants the protected creature "partial cover" — this benefit is **absent** from the PF2e conversion; only the reactive-attack-on-approach half of Defend survives.
- **Flavor text dropped:** the entire closing sentence about the weapon's cosmetic form and the real-world D&D deity references ("Bhaal... Mask...") is dropped from the conversion — correctly excluded as setting-specific content.
- **Material component:** jmnario's own intermediate conversion kept "a necklace of pure precious metal (material component)" in its `cost` field; the current store has an empty `cost.value` and no material text in the prose (Remaster materials-scrub policy).
- **Heightening structural coverage:** the prose promises Attack, Defend, *and* Control modes each gain +1d10 per heighten rank, but the structured `heightening.damage` object only bumps damage index `"0"` (Attack mode) — see Open Flags.

## Converter's notes

- **Anchor:** Spiritual Weapon (rank 2, divine) — floating weapon that attacks as a bonus action; Kosmoturgist's Weapon is the rank-7 force version with three modes
- **Archetype:** sustained damage (floating weapon, force)
- **Balance bullets:**
  - "Spiritual Weapon at rank 2 deals 1d8+spellcasting-mod spiritual damage as a bonus action. Kosmoturgist's Weapon at rank 7 deals 3d10+8 force on attack (≈24 avg) — appropriate scaling for a 5-rank increase, especially with the 1-minute non-sustained duration."
  - "Control mode (4d10 AoE basic Reflex ≈ 22 avg) is weaker than the standard 8d12 Chain Lightning at rank 6, appropriately so since it's a per-turn sub-action of a sustained weapon."
  - "1-minute non-sustained duration is the distinctive cost: the weapon runs for 1 minute without needing a Sustain, but the caster must use a 1-action concentrate to command it each turn."
  - "Three distinct modes (Attack/Defend/Control) preserve the 5e design intent and provide tactical flexibility."
  - "Force damage is rarely resisted and matches the compressed-space kosmoturgy fiction."
- **Overridable:**
  - "The Defend mode's reactive attack (triggered when enemy approaches protected creature) is a reaction-equivalent granted to the weapon — could limit to one Defend attack per round to prevent stacking."
  - "Focus spell flag: Kosmoturgist's Weapon is a strong focus spell candidate for a Kosmoturgist class."
  - "The +8 modifier on damage could be replaced with the caster's spellcasting ability modifier for a more dynamic feel."
- **Checklist failures:** none.

## Similar official spells

- **Spiritual Weapon** (rank 2) — floating force weapon, sustained, 2d8 force melee spell attack. The converter's own anchor for the whole spell family.
- **Deity's Strike** (rank 7) — divine, force, manifested weapon that resolves via spell attack roll for 7d12 force (double on crit); a rank-exact match for the general shape of Attack mode (spell-attack-roll force damage from a summoned divine weapon), though it is a single burst rather than a sustained multi-turn effect.
- **Chain Lightning** (rank 6) — 8d12 electricity, basic Reflex save; cited directly in the converter's notes as the comparison point for Control mode's 4d10 basic-Reflex AoE.

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell.

## Open flags

- The structured `heightening.damage` object bumps **only** damage index `"0"` (Attack mode's 3d10+8). The prose heighten text states Defend *and* Control modes also gain +1d10/rank, but neither Defend's (index 1) nor Control's (index 2) entries have a corresponding heighten bump in the structured data.
- `system.defense` only records the Control-mode basic Reflex save; the Attack/Defend "spell attack roll" resolution has no structured field of its own (already flagged by the adapter warning).
- Defend mode's "partial cover" benefit, present in the 5e original, does not appear anywhere in the PF2e description.
- The closing flavor sentence naming real D&D deities (Bhaal, Mask) is dropped entirely — a correct exclusion, but confirms no replacement homebrew-setting flavor was substituted.
- Material component present in jmnario's intermediate conversion (`cost` field) but absent from the current store.
- Pool reason "reclassified-out": this spell carries a priced quantitative COLD verdict (−1.36 ranks) but has been pulled from the pure-damage worklist as a per-mode/per-turn lens artifact rather than a per-cast nuke.

## Options & staff lean (enrichment, 2026-07-23)

**Stale flag note:** batch-0 (`b737e18`) already fixed the heightening gap — the interval
block now bumps all three damage partitions, matching the prose. The −1.36 COLD is the
§4a sustained/charge artifact (a per-turn 1A engine over a non-sustained minute priced
against the per-cast budget); the converter's Spiritual-Weapon-family scaling logic reads
sound next to Deity's Strike r7 (one 7d12 burst vs ~24 avg per commanded action here).

The one real content drop: 5e's Defend mode granted the guarded creature **partial
cover**; the conversion kept only the reactive attack. The flat +8 (vs 5e's ability mod)
is fine — fixed numbers are the PF2e battle-form idiom; don't regress to mod-based.

- **A. Record artifact + restore Defend's cover as lesser cover (+1 AC)** — the PF2e
  translation of partial cover; one sentence in Defend mode. Dice untouched.
- **B. Keep as-is** — accept the cover drop as a deliberate trim (nothing in the
  converter's notes marks it deliberate).
- **C. Swap +8 → spellcasting modifier** — restores the 5e formula but fights PF2e idiom.

**Lean: A.** Cover was half of Defend's identity in 5e; cheap restore, no pricing impact.
