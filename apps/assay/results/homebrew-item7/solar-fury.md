# Solar Fury

## Header block

- **Rank:** 6 (store `system.level.value` = 6)
- **Routing:** quantitative
- **Pool reason:** reclassified-out
- **Current assay line:** verdict −3.97 ranks COLD; residual −3.97 ranks
- **Adapter warnings:** none
- **Traits:** concentrate, fire, light, manipulate, planara
- **Traditions:** arcane, divine, primal
- **Cast:** 2 actions (`time.value` = "2")
- **Range:** self
- **Targets:** (none — `target.value` = "")
- **Area:** 20-foot emanation
- **Defense:** basic Reflex save
- **Duration:** 1 minute, sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 6
- **School:** planara
- **Casting time:** 1 action
- **Range:** Self
- **Components:** V, S (no material)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Ranger (PHB), Seeker (SW), Warlock (PHB), Wizard (PHB)

> You become a conduit for the great light of Elysium. Your body glows intensely, giving off bright light in a 60-foot radius and dim light for a further 60 feet. For the duration of the spell, you gain immunity to fire damage. You also radiate heat in a 20-foot radius; each creature that begins its turn within 20 feet of you takes 4d6 fire damage, or half damage with a successful Dexterity saving throw.

No `entriesHigherLevel`.

## The conversion (canonical store)

> You become a conduit for the searing light of a solar plane, your body blazing with such intensity that you shed bright light in a 60-foot radius and dim light for a further 60 feet; this counts as sunlight. While Solar Fury is active, you gain immunity to fire damage. Each creature that begins its turn within the 20-foot emanation takes 4d6 fire damage (basic Reflex save). You may Sustain the spell on your turn to maintain the aura; each round you sustain it, creatures within the area at the start of that sustain action are again subject to the damage.
>
> **Critical Success** The creature is unaffected.
> **Success** The creature takes half damage.
> **Failure** The creature takes full damage.
> **Critical Failure** The creature takes double damage.
>
> ---
> **Heightened (+1)** The fire damage increases by 1d6.

Structured fields: `system.damage["0"]` = `{formula: "4d6", type: "fire", kinds: ["damage"]}`; `system.defense.save` = `{statistic: "reflex", basic: true}`; `system.heightening` = `{type: "interval", interval: 1, damage: {"0": "1d6"}}`. All three structured fields agree with the prose exactly — no disagreement found.

## What changed, plain English

The mechanical shape carries over almost unchanged; the differences are entirely in numbers, the save target, and the trigger-to-damage timing.

- **Trigger cadence:** 5e's damage triggers "each creature that begins its turn within 20 feet of you" (i.e., it hits creatures based on THEIR turn start). The PF2e conversion keeps that same trigger for the initial cast ("each creature that begins its turn within the 20-foot emanation") but the Sustain-action re-trigger clause is new mechanical text: "each round you sustain it, creatures within the area at the start of that sustain action are again subject to the damage" — this re-anchors re-triggering to the CASTER's sustain action rather than each creature's own turn start, which is a meaningful timing change from the 5e original (not present in the 5e text at all, since 5e concentration spells don't have a discrete "sustain" action to re-trigger from).
- **Save:** 5e Dexterity save (half on success, no crit tiers) → PF2e basic Reflex save (adds critical-success = no damage, critical-failure = double damage; 5e had no degree-of-success spread beyond half/full).
- **Action cost:** 5e 1 action → PF2e 2 actions to cast (then a 1-action Sustain each subsequent round, per PF2e's standard sustained-spell convention — this convention isn't spelled out in the 5e text since 5e concentration doesn't cost an action to maintain each round, only to cast and to avoid breaking concentration).
- **Heighten:** 5e has no upcast text; PF2e adds "+1d6 fire damage per +1 rank" as new heighten content with no 5e basis.
- **Traditions:** 5e class list (Ranger/Seeker/Warlock/Wizard) is replaced by PF2e traditions arcane/divine/primal — divine is new (5e's class list has no divine-caster class), a re-derivation rather than a literal translation.
- **Nothing dropped:** the bright/dim light radii, "counts as sunlight," fire immunity, and 20-ft emanation damage are all preserved.

## Converter's notes

- **Anchor:** "Wall of Fire (rank 4) — 4d6 fire per round sustained; Solar Fury is an emanation equivalent at rank 6"
- **Archetype:** sustained area damage (emanation)
- **Balance bullets:**
  - "Wall of Fire at rank 4 deals 4d6 fire per round sustained; Solar Fury at rank 6 also deals 4d6 fire per round — this is intentionally below-curve because Solar Fury also grants fire immunity (a significant buff rider)."
  - "Per-round emanation damage at 4d6 is 1–2 rows below the static AoE benchmark, which is correct: sustained zone damage scales slower than burst damage."
  - "Fire immunity is a major defensive benefit; at rank 6 this justifies the below-curve per-round damage."
  - "Sunlight rider (bright light 60 ft) is the narrative signature — anti-vampire/shadow utility, negligible combat multiplier."
  - "Heightened +1d6 per rank is the canonical sustained-zone scaling rate."
- **Overridable:** "Could remove fire immunity and raise per-round damage to 6d6 to better match the zone-damage expectation without a buff rider." / "Could make the per-round damage also hit undead without halving to add an anti-undead niche matching the light flavor."
- **Checklist failures:** none recorded.

## Similar official spells

- **Wall of Fire** (rank 4) — the converter's own anchor: a static wall/ring dealing 4d6 fire per round to anything crossing or occupying it. Two ranks below Solar Fury for the same per-round damage number, but Wall of Fire has no self-buff rider (no fire immunity, no light).
- **Fire Shield** (rank 4) — a personal fire-aura spell at 2 ranks below Solar Fury: grants cold resistance 5, a raisable shield (+1 AC, Shield Block), but its damage-to-attackers clause and self-buff shape is the nearest personal-aura fire-buff comparable.
- **Sunburst** (rank 7) — one rank above: a 60-ft burst dealing 8d10 fire (basic Reflex) plus extra vitality to undead, single-cast (no sustain). Useful as a burst-vs-sustained contrast at adjacent rank.
- **Chain Lightning** (rank 6) — same rank, single-target-chaining burst damage (8d12 electricity, basic Reflex) with no sustain and no self-buff rider; a same-rank burst-damage reference point for how much raw damage a rank-6 slot buys without a rider attached.

## Prior astra touches

Checked `apps/assay/homebrew/revisions.md`: **no entry** for "Solar Fury" — 0 deviations from a fresh re-conversion of the vendored baseline (store matches adapter output exactly, no hand edits recorded).

## Open flags

- The re-trigger timing for the Sustain action ("creatures within the area **at the start of that sustain action**") is new mechanical phrasing not present in the 5e text and differs from the initial-cast trigger ("begins its turn within") — both trigger conditions coexist in the same paragraph, which a stakeholder may want to read closely for consistency (a creature that begins its turn mid-emanation is hit once by its own turn-start trigger, and potentially again by the caster's later sustain-action trigger in the same round, depending on initiative order).
- No residual 5e-isms (no bonus-action language, no flat-DC-only wording, no material component text) — the description is clean Remaster-consistent prose throughout.
- No curse-removal, affliction, or reaction-trigger text present — not applicable to this spell.
- Traits include the custom homebrew school-trait tag "planara" (mapped 1:1 from the 5e school field "planara"), which has no counterpart in the standard PF2e trait taxonomy (Remaster removed spell schools entirely).

## Options & staff lean (enrichment, 2026-07-23)

The −3.97 COLD is the §4a sustained/charge lens artifact (per-round 4d6 vs the per-cast
r6 budget). The converter's pricing logic is sound: Wall of Fire r4 sets the 4d6/round
zone precedent, and the +2 ranks buy fire IMMUNITY (official immunity territory is Fiery
Body r7) + the sunlight rider. Precedent: Darkseeker's Aura (item 1) — aura-engine
artifact, dice kept.

The real defect is the DOUBLE TRIGGER the dossier flags: turn-start damage AND a
sustain-action re-trigger coexist, so a creature can be hit twice per round depending on
initiative order — new text with no 5e basis (5e was turn-start only).

- **A. Record artifact + fix the trigger to turn-start only** — keep 4d6/immunity/
  sunlight; rewrite so the aura persists while sustained and damages each creature that
  begins its turn inside it (Sustain maintains, never re-triggers). Restores 5e's exact
  cadence and kills the double-dip.
- **B. Keep both triggers** — strictly stronger than the 5e original and double-charges
  the same round; no design rationale in the converter's notes.
- **C. Converter's overridable** — drop immunity, raise to 6d6/round; a real redesign
  with no motivating complaint.

**Lean: A.** Text-only fix, dice untouched, artifact recorded.
