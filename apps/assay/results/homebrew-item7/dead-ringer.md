# Dead Ringer

## Header block

- **Rank:** 4
- **Routing:** ledger:utility
- **Pool reason:** ledger (manual pool, seeded by jmnario's balanceBullets)
- **Current assay line:** no quantitative verdict recorded for this spell in the chunk list (ledger routing — manual review item)
- **Adapter warnings (flags.assay.adapterWarnings):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, illusion, manipulate, memetics, visual (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** reaction
- **Range:** self
- **Target:** you
- **Defense:** none
- **Duration:** sustained, 1 hour

## The 5e original

- **Level:** 4
- **School:** memetics
- **Casting time:** 1 reaction, "which you make after succeeding on a saving throw or missed by a ranged attack"
- **Range:** self
- **Components:** S only (no verbal, no material)
- **Duration:** Concentration, up to 1 hour
- **Classes:** Bard, Seeker (SW), Wizard

> You make your foes see what they want to see. You turn invisible and an illusory duplicate appears in your place, seemingly undergoing the effects of whatever ailment you avoided. This double suffers a horrific fate from the affect, resulting in your apparent death. The illusion lasts for the duration of the spell. You remain invisible for the duration, or until you attack or cast a spell.
>
> Physical interaction with the double reveals it to be an illusion, as things can pass through it. A creature that uses its action to examine the double can determine that it is an illusion with a successful Intelligence (Investigation) check against your spell save DC. If a creature discerns the illusion for what it is, the creature can see through the image, and its other sensory qualities become faint to the creature.

No `entriesHigherLevel` block in the 5e original.

## The conversion (canonical store)

**Trigger:** You succeed at a saving throw or are missed by a Strike.

You make your foes see what they want to see. You instantly turn invisible and an illusory duplicate appears in your exact position, apparently undergoing a horrific fate corresponding to the effect you just evaded — struck down, poisoned, burned, etc. The illusion makes you appear to have died dramatically. The duplicate remains in place for the duration.

You remain invisible for the duration, or until you make an attack roll or Cast a Spell. Physical interaction with the duplicate reveals it to be an illusion, as objects and creatures pass through it. A creature that uses an Interact action to examine the duplicate can attempt a Perception check against your spell DC to discern it as an illusion; if the check succeeds, that creature can see through the duplicate.

When the invisibility ends (because you attacked or cast a spell), the duplicate also vanishes.

**Heightened (6th)** Your invisibility persists for 1 minute after you attack or cast a spell (rather than ending immediately).

No `@UUID[...]` references in this description. Structured fields agree with the prose (`time.value="reaction"`, `duration.sustained=true, value="1 hour"`).

## What changed, plain English

The core "reactive invisibility + illusory-corpse decoy" concept is preserved closely, with a broadened trigger, a re-mapped detection skill, and an added late-rank benefit.

- **Numbers:** none of the core dice/duration numbers changed — 1 hour duration in both, no damage in either version.
- **Structure:** the trigger was **broadened** — 5e triggers on "succeeding on a saving throw **or being missed by a ranged attack**"; PF2e triggers on "succeed at a saving throw **or are missed by a Strike**" (any Strike, not just ranged). The detection check changed from 5e's Intelligence (Investigation) to PF2e's Perception — both are the closest available "notice something is off" skill in their respective systems, so this is an organ-mapping rather than a content change. 5e's component list is S-only (no V, no M); the PF2e conversion keeps only the `concentrate` trait (no `manipulate`) per the converter's notes, reflecting the reaction's mental-focus-only nature.
- **Content dropped:** none of the core beats (invisibility, illusory dying duplicate, ends on attack/spell, physical-interaction reveal, skill-check detection) are missing.
- **Content added:** the **visual** trait (making explicit that the illusion is sight-based, implicit but untagged in 5e). The **heightened (6th)** entry (invisibility persists 1 minute after attacking/casting, instead of ending immediately) has no 5e basis — 5e Dead Ringer has no scaling text at all.

## Converter's notes

**Anchor:** Invisibility heightened to 4th (rank 4, 1 min, hostile-immune) — Dead Ringer adds the illusory-corpse component and uses a reaction trigger, placing it at rank 4 but with a more restrictive trigger

**Archetype:** utility/illusion (reaction invisibility + decoy illusion)

**balanceBullets:**
- "Reaction trigger (succeed on a save or be missed) is a strong but fair condition — it requires the enemy to have just failed to harm you, so it is situationally rather than universally applicable."
- "Invisibility ending on attack/spell is the standard rule — no special exception granted, keeping this in line with Invisibility's balance."
- "The illusory corpse duplicate is primarily a narrative/social tool (convincing enemies you're dead) rather than a combat power multiplier."
- "Sustained up to 1 hour is acceptable: the invisibility ends on any attack/spell, so the hour-long duration only matters for extended stealth sequences, not combat."

**overridable:**
- "The trigger could be restricted to 'missed by a melee attack' only (removing the 'succeed on a saving throw' trigger) to tighten the reaction window."
- "Could add a Stealth bonus while invisible in addition to the undetected condition."

**checklistFailures:** none.

## Similar official spells

- **Mislead (rank 6)** — turns you invisible and creates an illusory duplicate of yourself that can act with your full action economy; hostile actions don't end the invisibility. Two ranks above Dead Ringer and considerably more powerful (a mobile, actionable double vs. a stationary decoy), but the closest official "invisibility + illusory double" combo spell.
- **Invisibility (rank 2)** — the base invisibility effect Dead Ringer builds on top of; ends on a hostile action in both versions. Two ranks below Dead Ringer, useful as the "bare invisibility" baseline for comparing what the illusory-corpse rider is worth.
- **Wooden Double (rank 3)** — reaction-triggered (on a critical hit or damage-dealing effect); a decoy takes the hit in your place while you Step away, then collapses. One rank below Dead Ringer and a different trigger (must be critically hit, vs. Dead Ringer's succeed-a-save-or-be-missed), but the closest official "reactive decoy substitutes for you" spell.

## Prior astra touches

None found in `revisions.md` — Dead Ringer is not listed among the 52 deviating (hand-edited) spells; the store is byte-faithful to the fresh adapter re-conversion of jmnario's baseline (0 deviations for this spell).

## Open flags

- The reaction has an explicit leading **Trigger** line in the current store prose ("Trigger: You succeed at a saving throw or are missed by a Strike."), consistent with the action-economy repair pass noted in the triage doc for other reaction spells (Deja Vu, Disperse Magic, Solar Rebuke) — Dead Ringer was not listed among those repairs and was not a deviation in `revisions.md`, suggesting it already had this leading Trigger line at seed time.
- The adapter warning notes the heightened (6th) entry has "no structurally-parseable damage bump" and is kept as a description appendix only — there is no structured `heightening.levels["6"]` payload beyond an empty object (`{}`), consistent with the warning.
