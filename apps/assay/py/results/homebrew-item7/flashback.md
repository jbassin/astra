# Flashback

## Header block

- **Rank:** 1 · **Routing:** `hybrid` · **Pool reason:** wide-range
- **Current assay line:** verdict = "in band" · comparables rank range 1–8 (LOW-INFORMATION — this is why the spell sits in the manual pool) · residualRanks = -0.39377942488970674 (scores.json: `budget≈6.04`, `ev=3.5`, `actionBucket="2"`, `population="hostile"`)
- **Scorer comparables (raw):** Paralyze (rank 3), Hypnopompic Terrors (rank 8), Coral Scourge (rank 3), Possession (rank 7), Camel Spit (rank 1)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, incapacitation, manipulate, memetics, mental · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 1 minute · **Range:** touch · **Target:** 1 willing creature
- **Defense:** none (`system.defense = null`)
- **Duration:** sustained, "10 minutes"
- **Cost:** none (`cost.value` empty string)
- **Heightening scaffold:** `system.heightening = {"levels":{"3":{}},"type":"fixed"}`

## The 5e original

- **Name:** Flashback · **Source:** tfc (homebrew) · **Level:** 1 · **School:** memetics
- **Casting time:** 1 minute
- **Range:** touch (point)
- **Components:** V, S (M: null)
- **Duration:** Concentration, up to 10 minutes
- **Classes:** Bard, Seeker (SW), Wizard
- **Ritual flag:** `meta.ritual = true`

> You touch a willing creature. Until the spell ends, the target can revisit its memory of an event that it experienced within the last 24 hours. While a creature is revisiting a memory through this spell, it is paralyzed and hears sounds as if they came from far away. Additionally, you and up to 5 allies of your choice can share in visiting the memory, seeing through the target's eyes and hearing what it heard, gaining the benefits of any special senses that the target had. During this time, you are deaf and blind. If this spell ends due to failure to maintain concentration, both you and the affected creature take 1d6 psychic damage.

**At Higher Levels:** "When you cast this spell using a spell slot of 2nd level or higher, the target can choose an event that took place up to 7 days ago (2nd level), 30 days ago (3rd level), 1 year ago (4th level), or any time in the target's past (5th level)."

## The conversion (canonical store)

You touch a willing creature and guide its mind back to a specific memory it experienced within the last 24 hours. While you sustain the spell, the target relives that memory in vivid detail, becoming `Paralyzed` (UUID link to `Compendium.pf2e.conditionitems.Item.Paralyzed`) as its attention fully occupies the recalled moment — it is aware of its surroundings as if from far away (it can hear but sounds seem distant). You and up to 5 additional willing creatures you designate may share in observing the memory, perceiving it as if through the target's senses (sight, hearing, and any special senses the target possessed at the time). While sharing the memory, you and any observers are `Dazzled` (UUID link to `Compendium.pf2e.conditionitems.Item.Dazzled`) but are otherwise free to act. The spell ends immediately if you stop sustaining it. If the spell ends unexpectedly (you are incapacitated), the primary target takes 1d6 mental damage (no save) from the abrupt severance.

---

**Heightened (3rd)** The memory window extends to 1 week, and observers may also speak into the memory as a whisper the primary target hears (they cannot interact or change events).

No `successTiers`/degree-of-success structure (no save — matches the 5e original's willing-target-only design). The structured `system.heightening.levels."3"` entry is an empty object (no parseable content), while the prose carries the actual "1 week + whisper" text — this is the adapter-warning gap: the heightening effect is not a damage bump, so nothing structural was extracted.

## What changed, plain English

- **Casting time:** 1 minute preserved exactly (both 5e and PF2e).
- **Damage type:** 5e psychic → PF2e mental (standard Remaster terminology mapping).
- **Observer sensory restriction, changed from full to partial:** 5e says observers "are deaf and blind" during the shared memory. The conversion changes this to Dazzled only — a much lighter restriction (Dazzled imposes concealment on the observer's own vision but doesn't remove hearing or fully blind). This is a meaningful nerf to the drawback/cost side of participating as an observer, with no 5e-text basis for softening it.
- **Trigger for the severance-damage clause narrowed:** 5e triggers the 1d6 psychic damage "if this spell ends due to failure to maintain concentration" (any concentration break, e.g. damage, distraction). The conversion narrows this to "if the spell ends unexpectedly (you are incapacitated)" — a much narrower trigger condition (only caster incapacitation, not any lost-concentration event) with no 5e-text basis for the narrowing.
- **Incapacitation trait added:** not present in the 5e original at all; added per the converter's design rule ("if it could paralyze in combat, it needs the trait") even though the target must be willing.
- **Traditions:** 5e class list (Bard/Seeker/Wizard) → arcane + occult.
- **Heightening restructure:** 5e's at-higher-levels clause is a smooth ladder (2nd: 7 days, 3rd: 30 days, 4th: 1 year, 5th: any time). The conversion collapses this to a single fixed-rank-3 jump straight to "1 week" (not 30 days) and discards the 2nd/4th/5th-level tiers entirely — the 5e version's full ladder up to "any time in the target's past" has no PF2e-side equivalent at any rank in this spell. The conversion also adds a wholly new capability at rank 3 with no 5e basis: observers can whisper into the memory to the primary target (a two-way communication feature absent from the source).

## Converter's notes

- **Anchor:** "no clean analog — utility/divination; closest is Scrying (rank 6) for shared memory observation"
- **Archetype:** utility/divination (memory replay with observers)
- **Balance bullets:**
  - "No PF2e analog at rank 1 for memory replay. Anchored to the utility tier: 1-minute cast, 24-hour memory window, sustained up to 10 minutes, touch range — all consistent with exploration-tier utility."
  - "Incapacitation trait required — the primary target is paralyzed during the flashback; this is a combat-removal effect on a willing target, but the trait is still mandatory to gate abuse against high-level creatures if ever used non-consensually."
  - "1d6 mental damage on abrupt severance is symbolic — it's the 5e 1d6 psychic preserved; at rank 1 this is below the damage floor and acts as a minor deterrent to reckless concentration-breaking."
  - "Observers are only dazzled (not blinded+deafened) — the 5e version fully blinded observers, which is too punishing for rank 1; dazzled is the minor sensory restriction that still communicates the immersive experience."
- **Overridable:**
  - "Could remove the incapacitation trait if the spell explicitly requires consent at the time of casting (always willing) — but the trait is still cleanest for edge cases."
  - "Could reduce duration to 1 minute (not 10) for a tighter combat-compatible version."
- **Checklist failures:** none recorded.

## Similar official spells

- **Paralyze (rank 3)** — pure Will-save single-target Paralyzed-condition spell, no observer mechanic. Two ranks above Flashback; shows the actual PF2e cost of applying the Paralyzed condition even with a save gate, versus Flashback applying it to a *willing* target for free at rank 1.
- **Scrying (rank 6)** — the converter's own anchor; a long-cast (10-minute) spy spell that creates a viewing sensor near the target, functioning like Clairvoyance. Five ranks above Flashback; both are "share a target's senses remotely" spells, but Scrying doesn't need the target's memory or consent and has a Perception-based counter.
- **Sudden Recollection (rank 3)** — Will-save memory alteration (implant/suppress knowledge) on unwilling or willing targets, with a willing-creature auto-fail option. Two ranks above Flashback; both are memetics-adjacent memory spells, but Sudden Recollection edits memory rather than replaying it and works on unwilling targets by default.
- **Mind Probe (rank 5)** — sustained per-round interrogation of a target's memories/knowledge, resisted by Will then Deception per question. Four ranks above Flashback; a heavier, repeatable-question memory-access spell for contrast against Flashback's single fixed memory replay.

## Prior astra touches

None. `revisions.md` has no entry for Flashback.

## Open flags

- The observer drawback was softened from 5e's "deaf and blind" to PF2e's "dazzled" with no discussion in `balanceBullets` beyond a one-line justification; this reduces the cost side of the spell's group-scrying utility relative to the source.
- The severance-damage trigger was narrowed from "any lost concentration" (5e) to "caster incapacitation only" (conversion) — a scope change not mentioned in `changedElements` as a deliberate narrowing (it's listed only as "damage on abrupt end of concentration ... preserved," which undersells the trigger-condition change).
- The rank-3 heightening entirely replaces the 5e ladder (7 days/30 days/1 year/any-time across four upgrade levels) with a single flat "1 week" jump plus a new whisper-communication feature that has no 5e basis; `system.heightening.levels."3"` is an empty object in the structured data, so the heightened effect exists only as prose.
- `incapacitation` trait applied to a spell whose target must already be willing — flagged by the converter's own notes as a design compromise ("even on a willing target... still mandatory to gate abuse"), worth confirming intent since incapacitation traits normally exist to weaken effects against higher-level unwilling targets, a scenario this spell's willing-target requirement precludes.

## Options & staff lean (enrichment, 2026-07-23)

In band at r1; the wide range is comparables noise on a utility spell. One dossier flag
is a FALSE POSITIVE: the "narrowed" severance trigger is actually the correct PF2e
mapping — 5e's damage-broken concentration has no PF2e analog (sustain can't be broken
by damage); caster incapacitation IS the involuntary-end case, and a voluntary
stop-sustaining shouldn't shock anyone. No change needed there. The observer soften
(deaf+blind → dazzled) is converter-reasoned and fine at r1.

The real loss: 5e's heighten ladder (7 days / 30 days / 1 year / ANY time in the
target's past at slots 2-5) collapsed to a single rank-3 "1 week" tier — the spell's
whole high-rank fantasy (reliving any memory ever) is gone.

- **A. Restore the full ladder as fixed-rank tiers** — H2: 1 week · H3: 1 month (+ the
  whisper feature, kept) · H4: 1 year · H5: any time in the target's past. Faithful,
  utility-only, no pricing concern.
- **B. Keep the single r3 tier** — simpler, but drops the signature top end.
- **C. A plus revert observers to blinded+deafened** — 5e-faithful cost; the converter's
  soften was deliberate and defensible, so only if fidelity wins.

**Lean: A.**
