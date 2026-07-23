# Time Loop

## Header block

- **Rank:** 6
- **Routing:** `comparables`
- **Pool reason:** wide-range
- **Current assay line:** verdict = `null`, rankRange = `[1, 9]`, residualRanks = `null` — flagged LOW-INFORMATION per the task brief (the comparables scorer returned a rank span of 1–9, which is why this spell sits in the manual pool)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, incapacitation, manipulate, mental — rarity: common — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** 60 feet
- **Target:** 1 creature
- **Defense:** Will save (structured: `defense.save = {basic: false, statistic: will}`)
- **Duration:** 1 minute (structured: `duration.sustained = true`)
- **Cost:** `""` (empty — see Open flags; jmnario's conversion carried "a metal loop (material component)")
- **Structured `heightening` field:** present — `{levels: {"8": {}}, type: "fixed"}` (matches the "Heightened (8th)" prose trigger — multi-target scaling)
- **Structured `damage` field:** empty (`system.damage = {}` — this spell deals no direct damage)

## The 5e original

- **Level / School:** 6th-level chronomancy
- **Casting time:** 1 action
- **Range:** 30 feet (point)
- **Components:** V, S, M — "a metal loop"
- **Duration:** up to 1 minute, concentration
- **Classes:** Bard, Druid, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> You capture a target in a loop of time. The creature is teleported to the space where it began its previous turn. The target then makes a Wisdom saving throw. If it succeeds the spell's effect ends; but, if it fails the creature must repeat the actions it took on its previous turn, following the same sequence of moves and actions to the best of its ability. It doesn't need to move along the same path or attack the same target but if it moved then attacked on its previous turn, its only option is to move then attack this turn. If the space where the target began its previous turn is occupied or it's impossible for the target to take the same action (if it cast a spell but it's now unable to do so, for example), the target is incapacitated.
>
> An affected target repeats the saving throw at the end of its turn, ending the effect on itself on a success. For as long as the duration lasts, the target teleports back to its starting point at the start of each of its turns and it must repeat the same sequence of moves and actions.

**entriesHigherLevel:** none present.

## The conversion (canonical store)

You trap a creature in a closed loop of time, forcing it to replay the broad strokes of its previous turn. The target must attempt a Will save.

**Critical Success** The creature is unaffected.

**Success** The creature is unaffected, and is temporarily immune to Time Loop for 24 hours.

**Failure** The creature is pulled back to its approximate position at the start of its previous turn (within 5 feet) and must spend its actions this turn in the same categories as last turn: if it Moved then Struck, it can only Move then Strike (with any targets and directions). If the required action type is impossible (the spell was expended, the target died, the square is blocked), the creature is instead `Slowed 2` until the start of its next turn. The creature repeats the saving throw at the end of each of its turns; on a success the effect ends.

**Critical Failure** As failure, except the creature also gains the `Stunned 1` condition at the start of each looped turn, and it must succeed at the Will save twice consecutively to end the effect.

---

**Heightened (8th)** You can target up to 3 creatures. Each makes its own Will save.

**Structured/prose notes:**
- Two `@UUID` links: `Slowed 2` and `Stunned 1`, both correctly formed condition-item links.
- `duration.sustained = true`, `duration.value = "1 minute"` — matches the jmnario "sustained up to 1 minute" duration string.
- The heightened-8th text (multi-target, up to 3 creatures) is a non-damage effect and is exactly the kind of thing the adapter warning describes as "not structurally represented" beyond the bare `heightening.levels["8"]` marker.

## What changed, plain English

The core fiction — pull a creature back to (approximately) where it started its previous turn and force it to repeat the same broad action categories, with a saving throw at the end of each turn to break free — is preserved closely. The biggest structural departure from 5e is the addition of temporary immunity on a save success and a harsher stacking penalty (stunned + double-save requirement) on a critical failure, both of which have no 5e counterpart.

- **Numbers:** No damage numbers involved in either version (this is a pure control effect). Range: 5e 30 feet → PF2e 60 feet (a doubling of range). Cast time: 5e 1 action → PF2e 2 actions.
- **Structure:**
  - Save type: 5e Wisdom → PF2e Will (organ-map).
  - 5e's binary "succeeds → effect ends; fails → repeat actions, or incapacitated if impossible" becomes PF2e's four-degree structure: crit success = unaffected (new tier), success = unaffected + 24-hour immunity (the immunity clause is new — see below), failure = repeat action categories or Slowed 2 if impossible (matches 5e's failure/impossible-action clauses fairly closely), critical failure = as failure but also Stunned 1 each looped turn and requires two consecutive successful saves to end (both new — 5e had no critical-failure-specific escalation since it was binary).
  - The "impossible action" fallback changes from 5e's blanket "the target is incapacitated" to PF2e's specific "Slowed 2 until the start of its next turn" — a more precisely-scoped condition than 5e's vaguer "incapacitated" (which in 5e is a broader catch-all state, not the same as PF2e's Incapacitation trait).
  - The "teleported to the space where it began its previous turn" (5e, exact position) is softened in PF2e to "pulled back to its approximate position... (within 5 feet)" — the converter's own notes flag this explicitly as a deliberate softening to avoid requiring the `teleportation` trait.
  - The `incapacitation` trait is added (mandatory per the converter's framing, since a failed save fully directs the target's actions).
- **Content dropped from 5e:**
  - The material component ("a metal loop") does not appear in the store's `cost.value` field at all (empty), even though jmnario's intermediate conversion preserved it as "a metal loop (material component)." See Open flags.
- **Content added with no 5e basis:**
  - The 24-hour temporary immunity on a saving-throw success ("is temporarily immune to Time Loop for 24 hours") — 5e's success case is simply "the spell's effect ends," with no immunity clause at all.
  - The critical-failure escalation (Stunned 1 each looped turn + requiring two consecutive successful saves instead of one to break free) — entirely new; 5e's binary structure had no equivalent tier.
  - The heightened-8th multi-target rider (up to 3 creatures, each with its own save) — 5e provided no upcast text for this spell at all.
  - A custom `time` trait appeared in jmnario's intermediate conversion (flagged there as "no PF2e precedent... overridable"); the canonical store's trait list does not include it (see Open flags for the trait comparison).

## Converter's notes

**Anchor:** "no clean analog — time-manipulation spell with no PF2e precedent; designed from incapacitation control budget at rank 6"

**Archetype:** control/save-or-suck (action constraint)

**Balance bullets:**
- "No PF2e analog for action-category constraints; closest is Slow (rank 3 for slowed 1, rank 6 for 10 creatures) — Time Loop is single-target but qualitatively more constrained than slowed."
- "Incapacitation trait is mandatory: on a failed save, the creature's actions are directed by the spell, not by the creature's will — this is removal-from-meaningful-action."
- "Will save is correct (Wis→Will organ-map for a mind-affecting time illusion)."
- "End-of-turn repeat save prevents permanent lockout; a creature with a good Will modifier escapes within 1–2 rounds on average."
- "The 'impossible action → slowed 2' fallback is important to prevent the spell from being nullified entirely when the constrained action is unavailable."

**Overridable:**
- "'time' is a custom trait with no PF2e precedent — GM may omit it or substitute 'occult' as the school tag."
- "The 'two consecutive successes to end crit-fail' requirement could be simplified to one success for cleaner table play."
- "The teleportation-back-to-starting-position element (softened to 'within 5 feet') could be removed entirely and replaced with 'must use the same action types regardless of position.'"

**Checklist failures:** none listed.

## Similar official spells

- **Slow** (rank 3) — `apps/codex/.../spells/rank-3/slow.json`. The converter's own cited anchor: Fortitude save into Slowed 1 (1 round) / Slowed 1 (1 min) / Slowed 2 (1 min); heightens to 10 targets at rank 6. Time Loop is single-target but the converter explicitly frames it as "qualitatively more constrained than slowed" at the same or lower effective rank comparison point.
- **Dominate** (rank 6) — `apps/codex/.../spells/rank-6/dominate.json`. Will save, incapacitation + mental traits, same rank, degree-of-success structure that escalates from "unaffected" through "stunned" to "controlled" — the closest official rank-6 mental-control incapacitation spell with a comparable save/degree shape, though Dominate hands the caster direct command rather than forcing a scripted action replay.
- **Quandary** (rank 8) — listed for the broader "remove agency via forced-action-loop" family, though functionally an extradimensional puzzle rather than an action-replay compulsion (see the Time Jump dossier for detail).
- **Maze of Locked Doors** (rank 7) — Will save, incapacitation trait — another rank-adjacent Will-save incapacitation control spell for comparison.
- **scorer comparables (low-information):** none listed in `queue.json` beyond the bare rank range `[1, 9]` — no named comparable spells were supplied by the scorer.

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **Material component dropped**: jmnario's intermediate conversion (`all_spells_pf2e.json`) carried `cost: "a metal loop (material component)"`, directly preserved from the 5e original's material component text. The canonical store's `cost.value` is empty (`""`). Since revisions.md shows 0 deviations for this spell (store matches a fresh adapter re-conversion exactly), the drop is adapter policy, not a hand edit — same pattern seen on Temporal Threshold and Tunnel Vision, contrasted with Temporal Discharge's retained gemstone cost.
- **Custom "time" trait dropped**: jmnario's intermediate conversion lists a custom `time` trait, explicitly flagged in the converter's own overridable notes as "no PF2e precedent — GM may omit it or substitute 'occult'." The canonical store's traits (`chronomancy, concentrate, incapacitation, manipulate, mental`) omit `time` entirely — consistent with the "omit it" option the converter's own notes suggested, and consistent with 0 deviations (adapter policy, not a hand edit).
- **"Incapacitated" (5e) vs. `Slowed 2` (PF2e) terminology**: the 5e original's impossible-action fallback uses the generic 5e condition name "incapacitated," which is not the same state as PF2e's `incapacitation` trait or any PF2e condition — worth noting since the spell also carries the PF2e `incapacitation` trait for an unrelated reason (removal-from-meaningful-action on a failed save), which could read as a false echo of the 5e term to a reviewer skimming quickly.
- Damage field is empty (`system.damage = {}`), consistent with this being a pure control effect — not a discrepancy, noted for completeness.
