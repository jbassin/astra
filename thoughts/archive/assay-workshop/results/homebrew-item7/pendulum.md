# Pendulum

## Header block

- **Rank:** 3
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score — pooled on the utility-ledger routing reason)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, fortune, incapacitation, manipulate, mental, mercuromancy, misfortune (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 2 actions
- **Range:** touch
- **Targets:** 1 creature
- **Defense:** Will save (non-basic)
- **Duration:** sustained, 1 minute

## The 5e original

- **Level:** 3 (Bard, Druid, Seeker, Sorcerer, Warlock, Wizard)
- **School:** mercuromancy (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** touch (point)
- **Components:** V, S, M — "a small pendulum or metronome made of brass and rosewood worth 10 gp" (cost 10 gp, not marked consumed)
- **Duration:** 1 minute, Concentration

> You bend fate to move in predictable patterns. The target must succeed on a Wisdom saving throw or else for the duration of the spell it doesn't make d20 die rolls but instead follows the sequence 20, 1, 19, 2, 18, 3, 17, 4...

That is the entire 5e entry — no degree-of-success breakdown, no `entriesHigherLevel` block (no upcast text).

## The conversion (canonical store)

> You bend fate to move in perfectly predictable patterns. The target must attempt a Will save.
>
> While the spell is active, if the target fails its Will save, its d20 results follow a rigid oscillating sequence instead of being random: its first roll is treated as 20, second as 1, third as 19, fourth as 2, fifth as 18, sixth as 3, and so on, alternating between high and low results. The target still makes its roll visibly but replaces the result with the next number in the sequence.
>
> Sustaining the spell requires you to Concentrate at the start of each of your turns.
>
> **Critical Success** The target is unaffected.
> **Success** The target is unaffected.
> **Failure** The target's d20 rolls follow the oscillating fate sequence for as long as you sustain this spell (up to 1 minute). The target is aware that something is wrong but cannot determine the pattern.
> **Critical Failure** As failure, and the target doesn't realize the sequence is predictable until it has rolled at least twice.
>
> **Heightened (+2)** You can target 1 additional creature with this spell.

Structured fields agree with the prose: `defense.save.statistic: "will"` matches; `duration.sustained: true, value: "1 minute"` matches "sustained... up to 1 minute"; there is no `heightening` block in `system` at all for the fixed-rank tiers — instead the `+2` interval heightening lives only in the description text, consistent with the adapter warning that interval heightening text isn't structurally represented.

## What changed, plain English

- **Save ability changed:** 5e Wisdom saving throw → PF2e Will save (standard Wis→Will organ-mapping).
- **Degree-of-success structure added:** 5e was a flat pass/fail with no crit tiers at all. PF2e adds a full 4-tier successTiers block — critical success/success both "unaffected," failure = the sequence effect applies, critical failure = a **new clause with no 5e basis**: "the target doesn't realize the sequence is predictable until it has rolled at least twice" (5e's target never gets any explicit awareness/unawareness clause at all).
- **Target awareness clause added with no 5e basis:** on a regular failure, PF2e adds "The target is aware that something is wrong but cannot determine the pattern" — the 5e original says nothing about whether the target notices anything.
- **Duration mechanic changed:** 5e = standard Concentration (no explicit per-turn action cost stated beyond the general concentration rules). PF2e = "Sustaining the spell requires you to Concentrate at the start of each of your turns" — an explicit sustain-action requirement made structural (`duration.sustained: true`), consistent with PF2e's sustained-spell action economy rather than 5e's passive concentration.
- **Heightening added with no 5e basis:** 5e had no upcast text at all for this spell. PF2e adds a `+2`-interval heightening entry ("target 1 additional creature") that doesn't exist anywhere in the 5e source.
- **Cast time:** 5e 1 action → PF2e 2 actions (standard 5e-1-action → PF2e-2-action default mapping).
- **Traits added with no 5e basis:** `incapacitation` (justified in the notes: predictable d20 replacement functionally removes a creature from meaningful tactical participation), `fortune` and `misfortune` both (the mechanic swaps results in both directions — good and bad — for the target), `mental` (mind-affecting framing). `mercuromancy` mirrors the 5e school field (adapter-level normalization seen across this batch).
- **Core mechanic itself is unchanged:** the exact oscillating sequence (20, 1, 19, 2, 18, 3...) is preserved verbatim, and range/duration length (touch, up to 1 minute) carry over numerically unchanged.

## Converter's notes

**Anchor:** Paralyze (rank 3, incapacitation, Will save) — Pendulum is a Will-save incapacitation effect at the same rank, though less binary

**Archetype:** control/debuff (deterministic die replacement, incapacitation)

**Balance bullets:**
- "Incapacitation trait is mandatory: replacing a creature's d20 rolls with a predictable sequence removes the target from meaningful tactical participation. Knowledgeable players/enemies can guarantee hits on the 'natural 20' rolls and avoid the '1' rolls, effectively giving the caster turn-by-turn control of the target's effectiveness."
- "The Will save (Wis organ mapping from 5e) is correct — this is a mind-affecting fate manipulation."
- "Sustained up to 1 minute (combat cap) matches Slow and Paralyze conventions at rank 3."
- "The success tiers give no partial effect (success = unaffected) because the mechanic is binary by nature — there is no 'slightly deterministic' die result."

**Overridable:**
- "Could give a success-tier partial effect: on success, the target must use the higher of 2d20 (rather than free choice) — essentially a misfortune effect only."
- "The sequence starting point could be rolled randomly on a d20 rather than always starting at 20, to reduce predictability for combats where the enemy has been forewarned."

**Checklist failures:** none recorded.

## Similar official spells

- **Paralyze** (rank 3) — Directly cited by the converter as the anchor. Single-target, Will save, 30-foot range, incapacitation trait; graduated failure severity (stunned 1 on success, paralyzed 1 round on failure). Same rank; both are Will-save incapacitation control effects, though Paralyze is a hard lock-out for its duration where Pendulum is a longer-running "manipulate the target's own rolls" effect.
- **Confusion** (rank 4) — 30-foot range, single-target Will save, forces the target to act semi-randomly (attack nearest creature, wander, or babble) for 1 minute; degree-of-success graduated. One rank higher; the closest official example of a rank-band-adjacent "force randomized/unreliable behavior on the target" effect, though it randomizes *actions* rather than *die results*.
- **Thief of Fortune** (rank 3) — 60-foot range, counteract check against a beneficial spell effect on another creature, siphoning it for the caster instead. Same rank and shares the `fortune` trait family, though functionally unrelated (buff-stealing vs. die-result manipulation).
- **Mirror's Misfortune** (rank 4) — Illusory-double effect that curses attackers with misfortune on their next attack. One rank higher; shares the `misfortune` trait family as a thematic reference, though it's a defensive counter-effect rather than an offensive debuff on a target.

## Prior astra touches

Not in `revisions.md`'s deviations list — the store's fields match the fresh adapter re-conversion exactly (0 deviations recorded for this slug). No hand edits since seeding.

## Open flags

- The adapter warning notes the `+2`-interval heightening text ("target 1 additional creature") is kept purely as description prose with no structural `heightening` field to back it — `system.heightening` is entirely absent from this spell's JSON (neither `fixed` nor `interval` type is set), even though the description contains a heightened block.
- The critical-failure "doesn't realize the sequence is predictable until it has rolled at least twice" clause and the failure-tier "aware that something is wrong but cannot determine the pattern" clause are both PF2e-conversion additions with no 5e textual basis.
- The 5e original spell has literally one paragraph and no degree-of-success structure at all — the entire 4-tier successTiers apparatus, the sustain-action framing, and the heightening entry are all conversion-added structure layered onto a very terse source.
- `mercuromancy` is a non-standard/added trait mirroring the 5e school field (adapter-level normalization, not spell-specific).
