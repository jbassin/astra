# Ashen Pack

## Header block

- **Rank:** 4 (store: `system.level.value = 4`)
- **Routing:** hybrid — **Pool reason:** wide-range
- **Current assay line:** verdict −1.35 ranks COLD; comparables rank range 1-9 (LOW-INFORMATION — that is why it is in the manual pool); residual −1.35 ranks
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, fire, manipulate, planara, summon
- **Traditions:** arcane, occult, primal
- **Cast:** time.value = "3" (3-action spell)
- **Range:** 30 feet
- **Target:** none specified (`system.target.value = ""`)
- **Defense:** none structured (`system.defense = null`)
- **Duration:** sustained, "1 minute"
- **Damage:** `0`: 4d6 fire
- **Heightening:** no `system.heightening` key present at all — see Open flags (this is the headline finding for this spell)

## The 5e original

- **Level:** 4th
- **School:** Planara
- **Casting time:** 1 action
- **Range:** Self
- **Components:** V, S (no material)
- **Duration:** Concentration, up to 10 minutes
- **Classes:** Ranger, Seeker, Warlock, Wizard
- **Ritual:** No

> With a gesture, you draw upon the depths of the Abyss to summon three flaming wolves made from ash into your space. When you cast this spell, and as an action on each of your turns while it is in effect, you can choose a creature within 60 feet of you. When you do, one of the flaming wolves rushes to the creature, making a melee spell attack using your spell attack modifier. If the attack hits, the target takes 4d10 fire damage and must succeed on a Strength saving throw or they are knocked prone. The flaming wolf then immediately returns to your space, coiling around your feet. The wolves have an AC equal to your spell save DC. If a flaming wolf is struck by a weapon or spell attack or is prevented from returning to your space after making an attack, it vanishes. The spell ends when all three wolves are lost, or you lose concentration.

**At Higher Levels:** When you cast this spell using a spell slot of 5th level or higher, the fire damage of the wolf's attack increases by 1d10 per spell slot level above 4th.

## The conversion (canonical store)

> With a gesture, you draw upon deep planar heat to summon three spectral flaming wolves made of living ash into unoccupied spaces within 30 feet of you. The wolves act on your initiative. When you Sustain this spell, you can Command one wolf to rush to a target within 60 feet of you. That wolf makes a melee spell attack roll against the target using your spell attack modifier. On a hit, the target takes 4d6 fire damage. On a critical hit, the target takes double damage and is also knocked `Prone`. After attacking, the wolf immediately returns to your space.
>
> (`Prone` is a `@UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone}` link.)
>
> Each wolf has AC equal to your spell DC, 1 Hit Point, and is destroyed if it takes any damage or is blocked from returning to your space after attacking. The spell ends when all three wolves are lost, or when it is no longer sustained.
>
> ---
> **Heightened (+1)** The fire damage of each wolf's attack increases by 1d6.

## What changed, plain English

The core fiction (three flaming ash-wolves summoned into unoccupied spaces, commanded one-at-a-time to melee-spell-attack a target, wolves have AC equal to the caster's spell DC, wolves are destroyed by any damage or a failed return, spell ends when all wolves are lost) is preserved closely, including the 60-foot command range and the "wolf returns to caster's space after attacking" clause.

Structure/mechanics:
- 5e "4d10 fire damage on a hit, AND a Strength save or knocked prone" (attack roll + separate save, both triggered on any hit) → PF2e "4d6 fire damage on a hit; prone only on a CRITICAL hit" — the converter's notes describe this as collapsing a 5e "double-dip" (attack roll AND save) into a single-roll PF2e idiom (attack-roll-only, crit-gated rider). This is a genuine structural change, not just a numeric rebalance: prone no longer has its own save, and is now gated to critical hits only.
- 5e "as an action on each of your turns... choose a creature" (implying the caster could, in principle, send a wolf as part of their normal action economy each turn, separate from any other action) → PF2e "when you Sustain this spell, you can Command one wolf" — normalizes wolf commands to exactly 1 per Sustain action, explicitly called out in the converter's notes as halving effective throughput from 5e's potential.
- 5e "Concentration, up to 10 minutes" → PF2e "sustained up to 1 minute" — a substantial duration cut (10 minutes → 1 minute), justified in the converter's notes as the standard PF2e combat-buff duration cap.
- 5e summon range "your space" (wolves appear directly in the caster's own space) → PF2e "unoccupied spaces within 30 feet of you" — wolves now occupy their own map spaces rather than the caster's square, and appear within a 30-foot radius rather than exactly at the caster.
- 5e "1d10 fire damage per slot level above 4th" on upcast → PF2e "Heightened (+1): fire damage... increases by 1d6" — the base damage die shrank from d10 to d6, and the per-rank heighten increment also shrank from d10 to d6, per rank.
- 5e action cost 1 action → PF2e 3 actions.
- Traits: PF2e adds "planara" (school-as-trait pattern, present alongside "summon" which jmnario's conversion also has) — this spell's trait discrepancy is additive (extra "planara") rather than a replacement, unlike the abjuration/transmutation-displacement pattern seen elsewhere in this chunk.
- Traditions arcane + occult + primal replace the 5e Ranger/Seeker/Warlock/Wizard class list (all three traditions preserved, matching the broader 5e class spread).

## Converter's notes

- **Anchor:** "Flaming Sphere (rank 2, 3d6 fire basic Reflex sustained) — Ashen Pack is 3x Flaming Sphere equivalent at rank 4, with spell attack instead of basic Reflex and a knockdown rider"
- **Archetype:** summon-adjacent (sustained spell attack, three-charge)
- **Balance bullets:**
  - "4d6 fire (14 avg) per wolf hit via spell attack roll vs rank-4 spell attack moderate budget (~12-14 avg at level 7) — within 1 row of table."
  - "Three charges across the spell's 1-minute duration provide meaningful sustained damage potential; wolves are fragile and can be destroyed, creating resource management."
  - "Knockdown (prone) on crit hit is appropriate: crit-only riders are free per the design checklist."
  - "5e's double-dip (attack roll AND strength save vs prone) was collapsed to attack-roll-only with prone on crit — this is the correct PF2e idiom for attack-plus-condition effects."
- **Overridable:**
  - "Could restore the Fortitude save vs prone on any hit (not just crit) if the GM wants more reliable crowd control, but would require reducing damage to ~3d6 to compensate."
  - "Wolf AC (= spell DC) is unusual in PF2e — could simplify to a fixed value (e.g., AC 20 at rank 4, scaling +2 per rank heightened)."
- **Checklist failures:**
  - "Checklist item 3 — action cost: 5e allowed sending a wolf as 'an action on each of your turns'; PF2e normalizes to 1 wolf per Sustain action. This halves the throughput from 5e's potential 3 wolves per round to 1 per round, which is necessary to fit PF2e's Sustain economy."

## Similar official spells

- **Spiritual Weapon (rank 2)** — a sustained spell-attack combat pet, structurally close to a single Ashen Pack wolf (Sustain to move/attack, spell-attack-roll melee strikes). Two ranks below, useful for gauging per-attack damage-per-rank pacing against a single wolf's 4d6.
- **Wall of Fire (rank 4)** — same rank as Ashen Pack, a persistent fire-damage zone rather than a spell-attack combatant; useful for comparing how much rank PF2e spends on sustained fire-damage sources generally.
- **Flame Wisp (rank 2)** — a lower-rank fire-rider mechanic (1d4 fire on a Strike hit) for contrast against Ashen Pack's much larger per-hit damage at twice the rank.

**Scorer comparables (low-information):** rank range 1-9 — no named comparable spells were supplied by the scorer for this spell; it was routed to the manual comparables pool specifically because that range is too wide to be informative.

## Prior astra touches

None found in `revisions.md` — Ashen Pack matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- **`system.heightening` is entirely absent from the store JSON (no key present at all)**, despite the description containing a "Heightened (+1)" block that increases the wolf's fire damage by 1d6 per rank. Unlike Almonk's Arcane Drain/Siphon (where the "+1 rank cap" heighten genuinely isn't a pure damage bump), Ashen Pack's heighten effect IS a pure damage-die bump on an existing structured `system.damage` field — the same shape that other homebrew spells in this store (e.g., per `revisions.md`, Repetitious Trauma and Solar Rebuke) DO represent structurally as `{"damage": {"0": "1d6"}, "interval": 1, "type": "interval"}`. The adapter warning attached to Ashen Pack ("interval heightening text is not a pure damage bump") does not appear to match the actual heighten text here, which is a straightforward per-rank damage increase to the wolf's fire attack.
- The 5e original's action-economy clause ("as an action on each of your turns while it is in effect, you can choose a creature") is somewhat ambiguous about whether sending a wolf costs a full separate action beyond the initial cast; the PF2e conversion resolves this ambiguity by tying wolf commands strictly to the Sustain action (one per round, per the converter's own checklist-failure note acknowledging this halves 5e's potential throughput).
- Trait note: "planara" (the 5e homebrew school name) is present in the store's traits alongside "summon" and "fire" — unlike several other spells in this chunk, this is additive to jmnario's trait list (which already had `[concentrate, fire, manipulate, summon]`) rather than a replacement of a real PF2e school trait.
