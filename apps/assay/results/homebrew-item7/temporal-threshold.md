# Temporal Threshold

## Header block

- **Rank:** 4
- **Routing:** `comparables`
- **Pool reason:** wide-range
- **Current assay line:** verdict = `null`, rankRange = `[1, 8]`, residualRanks = `null` — flagged LOW-INFORMATION per the task brief (the comparables scorer returned a rank span of 1–8, which is why this spell sits in the manual pool)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "defense text has qualifiers beyond the base save/attack shape, not structurally represented (only the primary save/attack-roll mapped): 'Will save (when triggered)'"
  2. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** chronomancy, concentrate, force, incapacitation, manipulate — rarity: rare — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** touch
- **Target:** 1 doorway, gate, window, or similar threshold
- **Defense:** Will save (structured: `defense.save = {basic: false, statistic: will}`)
- **Duration:** 24 hours (structured: `duration.sustained = false`)
- **Cost:** `""` (empty — see Open flags; jmnario's conversion carried "a small broken key (not consumed)")
- **Structured `heightening` field:** absent
- **Structured `damage` field:** empty (`system.damage = {}`)

## The 5e original

- **Level / School:** 4th-level chronomancy
- **Casting time:** 1 action
- **Range:** Touch (point)
- **Components:** V, S, M — "a small broken key"
- **Duration:** 24 hours (timed, non-concentration)
- **Classes:** Bard, Druid, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> You change the flow of time ever-so-slightly at the threshold of a location. When you cast this spell, you touch a doorway, gate, window, or other construction that serves as an opening between two locations. You must select a word, phrase, or action that must be performed to secure safe passage through the door. The first creature that does not perform this safeguard while passing through the doorway finds their body being ripped apart as they're subjected to different speeds of time simultaneously. They must succeed a Charisma saving throw or take 8d10 force damage and be paralyzed until the start of their next turn. The creature recieves half damage and is not paralyzed if they succeed.

**entriesHigherLevel:**

> When you cast this spell using a spell slot of 5th level or higher, the force damage increases by `{@scaledice 5d10|4-9|2d10}` per spell slot level above 4th.

Note: the 5e `{@scaledice 5d10|4-9|2d10}` notation denotes a base value of 5d10 (for levels 4–9) that increases by 2d10 per level above 4th — this base of "5d10" does not match the base damage figure given in the main entry text ("8d10 force damage"). This is an internal inconsistency in the 5e source itself, not something introduced by the conversion.

## The conversion (canonical store)

You lace the fabric of time around a threshold — a doorway, gate, window, or other constructed opening — with catastrophic temporal distortion. When you cast the spell, choose a word, phrase, or simple action (such as knocking twice) that serves as the safe passage. The threshold shimmers faintly if examined with a successful Perception or Recall Knowledge check against your spell DC.

**Trigger:** The first creature that passes through the threshold without performing the safeguard within the same round finds itself subjected to violently conflicting time-flows. That creature must attempt a Will save. The threshold resets after triggering and can trigger again on the next creature that passes without the safeguard.

**Critical Success** The creature is unaffected.

**Success** The creature takes half damage (4d10 force) and is not paralyzed.

**Failure** The creature takes full damage: 8d10 force and is `Paralyzed` until the start of its next turn. *(`Paralyzed` is an `@UUID[Compendium.pf2e.conditionitems.Item.Paralyzed]` link.)*

**Critical Failure** The creature takes double damage: 16d10 force and is `Paralyzed` until the end of its next turn. It must then succeed at a Will save or remain `Paralyzed` for an additional round. *(both `Paralyzed` instances are `@UUID` links to the same condition item.)*

---

**Heightened (+1)** The damage on failure increases by 2d10 force, and the duration of the `Paralyzed` condition on a critical failure increases by 1 round.

**Structured/prose notes:**
- The "Trigger:" line is again written as markdown `**Trigger:**` inside an HTML `<p>` tag rather than an HTML `<strong>` tag (see temporal-discharge for the identical pattern; both spells share this).
- Three `@UUID` links to the Paralyzed condition item, all correctly formed.
- `system.damage = {}` — damage numbers exist only in prose.
- No `system.heightening` structured object despite the "Heightened (+1)" prose clause.

## What changed, plain English

The 5e original is a threshold trap that triggers once ("the first creature") for 8d10 force damage + paralysis on a failed Charisma save, half damage and no paralysis on success, 1-action cast, 24-hour duration, a small broken key as a material component. The PF2e conversion keeps the core threshold-ward fiction and the 8d10-force-on-failure number, but restructures around four save degrees and changes several mechanical details.

- **Numbers:**
  - Base failure damage preserved exactly: 8d10 force (5e) = 8d10 force (PF2e failure tier).
  - PF2e adds explicit crit-success (unaffected) and crit-failure (double damage, 16d10, + longer paralysis + a follow-up Will save) tiers not present in 5e's binary structure.
  - Cast time: 5e 1 action → PF2e 2 actions (a genuine action-cost increase for the trigger-setting cast).
  - Save type: 5e Charisma → PF2e Will (organ-map).
  - Duration preserved exactly: 24 hours.
  - Heightening rate: 5e's "+2d10 per slot level above 4th" (per the entriesHigherLevel note, despite its base-value inconsistency) is preserved 1:1 as PF2e's "+2d10 per rank."
- **Structure:**
  - Paralysis duration: 5e says paralyzed "until the start of their next turn" on a failed save (no separate crit-fail tier since 5e was binary). PF2e maps this failure-tier paralysis to the same "until the start of its next turn" and adds a new, harsher critical-failure tier (paralyzed until the end of its next turn, then a follow-up Will save or remain paralyzed one more round) — this critical-failure escalation has no 5e basis.
  - The `incapacitation` trait is added — mandatory in the conversion notes' framing because paralysis removes a creature from the fight.
  - The ward is changed from an implied one-shot trap ("the first creature") to an explicitly resettable/repeating trap ("The threshold resets after triggering and can trigger again on the next creature that passes without the safeguard") — the conversion notes explicitly flag this as a design addition beyond the 5e text, which implied a single trigger.
- **Content dropped from 5e:**
  - The material component ("a small broken key") does not appear in the store's `cost.value` field at all (it is empty), even though the jmnario intermediate conversion preserved it as "a small broken key (not consumed)." See Open flags.
- **Content added with no 5e basis:**
  - The entire heightened duration extension is absent here (unlike Temporal Discharge) — instead only damage and crit-fail paralysis duration scale with heightening, which does track the 5e higher-level text reasonably closely.
  - Detection method changed from unstated in the 5e entry (5e never describes a way to detect the threshold in advance) to "a successful Perception or Recall Knowledge check against your spell DC" reveals a faint shimmer — this detection clause has no 5e textual basis at all; it is new content.
  - The multi-trigger/resetting behavior (discussed above) is new content relative to 5e's single-trigger implication.
  - The `trap` trait present in jmnario's intermediate conversion is absent from the canonical store's trait list.

## Converter's notes

**Anchor:** "no clean analog — closest is Symbol of Pain (rank 5, trap-glyph) or Alarm (rank 1, detection trap); Temporal Threshold is a unique paralysis-trap on a threshold"

**Archetype:** utility/trap + control

**Balance bullets:**
- "Incapacitation trait mandatory: paralysis on failed Will save removes the creature from the fight for at least 1 round — this meets the incapacitation threshold per plan checklist"
- "8d10 force damage on failure (avg 44) for a rank-4 trap is slightly above the single-target save damage benchmark (8d6 ≈ 28) but justified for a trap that: (a) targets only creatures who fail to perform the safeguard, (b) requires the caster to commit a rank-4 slot to a threshold, (c) does not require the caster to be present at detonation"
- "Will save (5e Cha save → PF2e Will per organ-map) is correct: temporal disruption affects the creature's psychic coherence, not its physical endurance"
- "24-hour duration is appropriate for a threshold ward; unlike Temporal Discharge, this ward can trigger multiple times (one creature per pass, resetting each time)"

**Overridable:**
- "Multiple-trigger design (resets after each trigger) is a design addition: 5e said 'the first creature' implying a one-shot ward; GM may prefer one-shot behavior to make the spell feel more like a consumable trap"
- "Paralysis duration (1 round on failure, 2 rounds + ongoing save on crit fail) is more conservative than the 5e text which implied paralysis 'until start of their next turn' — in PF2e, paralysis 'until start of next turn' = 1 round (preserved at failure tier)"

**Checklist failures:** none listed.

## Similar official spells

- **Temporary Glyph** (rank 5) — `apps/codex/.../spells/rank-5/temporary-glyph.json`. Password-gated hostile trigger with an area of effect ("Speaking it when entering the spell's area prevents the glyph from triggering"), closest functional match to the safe-passage/command-word mechanic, one rank higher.
- **Antlion Trap** (rank 3) — basic-Reflex-save terrain trap, one rank below Temporal Threshold's function class, different defense stat.
- **Slow** (rank 3) — `apps/codex/.../spells/rank-3/slow.json`. Not a trap; listed as the reference the converter cites elsewhere for time-dilation control fiction (Fortitude save, four-degree Slowed 1/1 round → Slowed 2/1 minute).
- **Maze of Locked Doors** (rank 7) — `apps/codex/.../spells/rank-7/maze-of-locked-doors.json`. Will save, incapacitation trait, extradimensional removal spell — comparable defense stat and incapacitation-trait pairing, though functionally a banishment rather than a paralysis trap.
- **scorer comparables (low-information):** none listed in `queue.json` beyond the bare rank range `[1, 8]` — no named comparable spells were supplied by the scorer.

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **Trigger-line markdown**: `**Trigger:**` is written as markdown bold inside an HTML `<p>` tag rather than an HTML `<strong>` tag, inconsistent with the rest of the description (which correctly uses `<strong>` for Critical Success/Success/Failure/Critical Failure/Heightened).
- **Material component dropped**: jmnario's intermediate conversion (`all_spells_pf2e.json`) carried `cost: "a small broken key (not consumed)"`, directly preserved from the 5e original's material component text. The canonical store's `cost.value` is empty (`""`). Since revisions.md shows 0 deviations for this spell (store matches a fresh adapter re-conversion exactly), the drop is adapter policy, not a hand edit. Compare: Temporal Discharge's consumed 25 gp gemstone cost *was* retained by the same adapter.
- **5e source internal inconsistency**: the 5e `entriesHigherLevel` scaledice notation implies a base of 5d10 for the upcast formula while the main entry text states a flat 8d10 base — these two numbers in the 5e original disagree with each other (noted for completeness, not a PF2e conversion defect).
- **No structured heightening**: `system.heightening` is absent despite the "Heightened (+1)" prose clause (adapter warning #2 explains why).
- **Damage not structurally represented**: `system.damage = {}` despite four degrees of typed force damage in prose.
- **Trait drop vs. jmnario's conversion**: jmnario's intermediate conversion lists `"trap"` as a trait; the canonical store's traits (`chronomancy, concentrate, force, incapacitation, manipulate`) omit it.
