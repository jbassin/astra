# Outside of Time

## Header block

- **Rank:** 8
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score — pooled on the utility-ledger routing reason)
- **Adapter warnings:** none recorded
- **Traits:** chronomancy, concentrate, manipulate (rarity: rare)
- **Traditions:** arcane, occult
- **Cast:** 2 actions
- **Range:** 30 feet
- **Targets:** 1 willing creature or unattended object
- **Defense:** none (`system.defense` is `null`)
- **Duration:** "up to 24 hours (chosen at casting)"

## The 5e original

- **Level:** 8 (Bard, Druid, Wizard)
- **School:** chronomancy (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** 30 feet (point)
- **Components:** V, S (no material)
- **Duration:** 24 hours

> You remove one willing creature or object from the flow of time entirely, causing it to disappear. Any concentration spells the creature was maintaining end immediately. You decide how long the spell lasts, up to 24 hours.
>
> While it is outside of time, the target creature can't be located with divination magic. Not even a *wish* or *miracle* can bring the target back earlier; it's as if it doesn't exist at all.
>
> When the spell ends, the target returns to the same location it disappeared from. If some other object occupies that space, the target is harmlessly displaced into the nearest open space. For the target, no time has elapsed; it's not even aware it was gone. Any timed or ongoing effects that were active on the target creature (with the exception of spells that were being maintained with concentration) continue from where they left off, since those effects skipped through time with the creature.

No `entriesHigherLevel` block (no upcast text).

## The conversion (canonical store)

> You reach into the flow of time and pluck the target entirely out of it. The target disappears from the world. While outside of time, the target cannot be perceived, located, or affected by any means, including by divination magic; for all purposes it does not exist. Any spells the target was Sustaining end immediately. No effect, not even a rank-10 spell, can retrieve the target early — it is genuinely absent.
>
> When you Cast this Spell, you choose the duration, from 1 round to 24 hours. The target returns automatically at the end of the chosen duration, reappearing in the nearest unoccupied space to where it left. The target experiences no subjective passage of time and is not aware it was gone. Any ongoing effects active on the target (except sustained spells) resume exactly as they were.
>
> If cast on an unwilling creature, the creature becomes a valid target only with its explicit consent — this spell functions only on willing targets. A caster intending to trap an unwilling creature must use a different effect (such as Quandary).

Structured fields agree with the prose: `target.value: "1 willing creature or unattended object"` matches; `duration.value` matches the chosen-at-casting framing; `defense: null` matches (no save mechanic — willing-only target).

## What changed, plain English

- **Content dropped:** the intermediate vendor conversion's description ended with an extra sentence — "This spell has no clean analog in standard PF2e time-manipulation magic and is designed from the rank-8 utility budget." — that is **not present in the canonical store's description**. This design-note-style sentence accounts for the store's recorded −119-char delta versus the fresh adapter re-conversion.
- **Explicit minimum duration added with no direct 5e basis:** 5e just says "up to 24 hours" (implicitly any amount, no stated floor). PF2e adds an explicit floor: "from 1 round to 24 hours" — the vendor conversion notes frame this as necessary because "PF2e doesn't have variable-concentration durations."
- **"No effect, not even a rank-10 spell, can retrieve the target early" (PF2e) vs. "Not even a *wish* or *miracle* can bring the target back earlier" (5e):** the specific named-spell callouts (*wish*, *miracle*) were generalized into a rank-10 ceiling statement rather than naming specific PF2e spells.
- **Consent/willingness clause added with no direct 5e basis:** 5e's text never explicitly states the target must be willing — it's implied by target selection but not stated as a rule. PF2e adds an explicit paragraph: "the creature becomes a valid target only with its explicit consent — this spell functions only on willing targets," plus a cross-reference to a different homebrew spell ("Quandary") as the hostile-use alternative. The conversion notes explain this was added specifically to avoid duplicating that other spell's niche and to sidestep needing the incapacitation trait.
- **Trait swapped:** the intermediate vendor conversion used a custom trait `temporal` (flagged in the converter's own checklist failures as "not a standard published PF2e trait"). The canonical store instead carries `chronomancy` (the literal 5e school name) as the trait — this appears to be an adapter-level normalization consistent with the rest of the batch (e.g., Nightfall also uses `chronomancy`), not a hand-edit specific to this spell (it isn't listed as a trait deviation in `revisions.md`).
- **Rarity added with no 5e basis:** `rare` (5e had no rarity concept).
- **Cast time:** 5e 1 action → PF2e 2 actions (standard 5e-1-action → PF2e-2-action default mapping).
- **No heightening in either version.**

## Converter's notes

**Anchor:** no clean analog — designed from rank-8 utility/temporal budget; nearest is Quandary (rank 8, unwilling removal to demiplane) for hostile use

**Archetype:** utility/temporal — willing-target removal from time

**Balance bullets:**
- "Restricted to willing targets only — the 5e version was ambiguous about consent; hostile use would be combat-removal identical to Quandary (rank 8, incapacitation) so restricting to willing avoids doubling that niche"
- "Up to 24-hour chosen duration covers both combat (1-round to hide a dying ally) and exploration (hide an ally for a day-long operation) use cases without overlap with combat incapacitation"
- "No save, no cost, no material: the willing-target restriction is the balance lever; without it this would need incapacitation and a Fortitude save for any hostile use"
- "Rare rarity: pulling a creature out of the timeline entirely for up to 24 hours is extraordinary"

**Overridable:**
- "Willing-only restriction: 5e text did not specify willing; GM may allow hostile use with the addition of incapacitation trait and a Will save (treat as combat-removal parallel to Quandary)"
- "Temporal trait: 'temporal' is a custom trait used in this batch for time-manipulation spells; GM may replace with 'chronomancy' or omit if their PF2e system does not recognize it"

**Checklist failures:**
- "Temporal trait is not a standard published PF2e trait — added as a homebrew descriptor for time-manipulation spells in this batch; consistent with the source material's chronomancy school"

## Similar official spells

- **Quandary** (rank 8) — Directly cited by the converter as the hostile-use analog and cross-referenced in the spell's own description. Single-target sustained effect that transports an unwilling target into a locked extraplanar puzzle room; the target can attempt Occultism/Perception/Thievery checks each turn to solve their way out, and teleportation alone can't free them. Same rank as Outside of Time, but escapable through mechanical effort where Outside of Time is (per its text) genuinely unreachable by any means for its full chosen duration.
- **Disappearance** (rank 8) — Touch, 10-minute duration, makes the target invisible to all precise senses (still findable via Seeking/disturbance detection). Same rank, but a concealment effect rather than true removal-from-reality; the target remains present and interactable, just undetected.
- **Secret Chest** (rank 5) — Banishes a container (not a creature) and its contents to the Ethereal Plane until the caster's next daily prep, retrievable at will. Three ranks lower; the closest official "things vanish from the world and return later" utility pattern, though restricted to non-creature containers.
- **Interplanar Teleport** (rank 7) — Requires a planar-key Requirement; moves up to 8 willing creatures to another plane. One rank lower; comparable "willing-target planar removal" utility niche, though it's a one-way relocation to a real destination plane rather than a total-removal-from-existence effect.

## Prior astra touches

Listed in `revisions.md` deviations: description length delta −119 chars (store=1072, baseline=1191). No other field-level deviations recorded (traits/duration/target all match the fresh adapter re-conversion exactly — meaning the `temporal`→`chronomancy` trait swap happened at the adapter/seed level, not as a subsequent hand edit). Cross-checked against the vendor conversion text above: the length delta corresponds to the dropped "no clean analog... rank-8 utility budget" design-note sentence.

## Open flags

- The vendor conversion's own checklist failure explicitly flags its `temporal` trait as non-standard PF2e; the store carries `chronomancy` instead (matching Nightfall's trait), which resolves that specific flagged issue but was not itself logged as a deviation event in `revisions.md` (it happened upstream of the store, at conversion/seed time).
- The willing-only restriction and the cross-reference to "Quandary" as the hostile-use alternative are both PF2e-conversion additions with no explicit 5e textual basis (5e's ambiguity about consent was resolved by adding a restriction, not by porting an existing 5e rule).
- `system.defense` is `null` — consistent with a willing-only, no-save effect.
- No heightening exists in either version — this is a rank-8 ceiling effect in both source and conversion, not a conversion omission.
