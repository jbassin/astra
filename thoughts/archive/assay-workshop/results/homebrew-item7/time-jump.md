# Time Jump

## Header block

- **Rank:** 8
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = `null`, rankRange = `null`, residualRanks = `null` (unscored in `queue.json`)
- **Adapter warnings** (`flags.assay.adapterWarnings`): none (empty list)
- **Traits:** chronomancy, concentrate, incapacitation, manipulate — rarity: rare — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** touch
- **Target:** 1 creature
- **Defense:** Fortitude save (structured: `defense.save = {basic: false, statistic: fortitude}`)
- **Duration:** varies (see text) (structured: `duration.sustained = false`)
- **Cost:** `""`
- **Structured `heightening` field:** absent (there is also no heightening prose text — none present at any level)
- **Structured `damage` field:** empty (`system.damage = {}` — this spell deals no damage, purely a removal/control effect)

## The 5e original

- **Level / School:** 8th-level chronomancy
- **Casting time:** 1 action
- **Range:** Touch (point)
- **Components:** V, S (no material)
- **Duration:** Instantaneous
- **Classes:** Bard, Druid, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> You throw a creature forward in time, if it fails a Constitution saving throw. The creature disappears for 1d4 + 2 rounds, during which time it cannot act or be acted upon in any way. When the creature returns, it is unaware that any time has passed.

**entriesHigherLevel:** none present — no upcast text at all.

## The conversion (canonical store)

You grab hold of the target and thrust it forward in time. The target must attempt a Fortitude save. On a failure, the creature disappears from the current moment for a duration determined by the save result (see below). While displaced in time, the target cannot act, cannot be targeted, and does not exist from the perspective of the current timeline. When the target returns, it appears in the space it occupied when displaced (or the nearest unoccupied space); it is unaware that any time has passed and any ongoing effects it was subject to (except those that expired during the displacement) resume as normal.

**Critical Success** The target is unaffected.

**Success** The target disappears until the start of its next turn.

**Failure** The target disappears for 1d4+1 rounds. At the start of each round after the first, it may attempt a new Fortitude save to return early (success = reappears at start of its turn that round).

**Critical Failure** The target disappears for 1d4+2 rounds with no intermediate save to return early.

**Structured/prose notes:**
- No `@UUID` links.
- No `system.damage` — matches the 5e original, which also deals no damage.
- No structured `heightening` field, and none needed — the prose has no heightened text either, matching the 5e original's total absence of upcast text.

## What changed, plain English

The core fiction (touch a creature, it fails a save, it vanishes for roughly 1d4+2 rounds unable to act or be acted upon, returns unaware time passed) is preserved closely. The main change is restructuring the previously binary pass/fail into PF2e's four-degree save framework, which required inventing new success/critical-failure behavior that has no 5e counterpart, plus adding an escape mechanism mid-effect.

- **Numbers:**
  - 5e critical-failure-equivalent duration ("1d4+2 rounds," the full 5e failure-case duration) is preserved exactly as PF2e's critical failure tier.
  - PF2e's failure tier is shortened to "1d4+1 rounds" (one die-step less severe than 5e's binary failure), specifically to leave room under the new critical-failure tier — the converter's own notes call this out ("slightly shorter than 5e's 1d4+2 to give failure tier room").
  - Cast time preserved: 5e "1 action" listed, but PF2e store time.value = "2" — a genuine action-cost increase (1 → 2 actions).
  - Save type: 5e Constitution → PF2e Fortitude (direct organ-map).
- **Structure:**
  - PF2e adds a critical-success tier ("The target is unaffected") and a success tier ("disappears until the start of its next turn") — both new, since 5e was a binary Con-save-or-suffer-full-effect spell with no partial-success outcome at all.
  - PF2e adds a mid-effect escape mechanism on the failure tier only: "At the start of each round after the first, it may attempt a new Fortitude save to return early" — this intermediate-save option does not exist in the 5e original at all. The converter's own notes flag this explicitly as an addition ("5e allowed no save to return early").
  - The `incapacitation` trait is added (mandatory per the converter's framing, since the target is fully removed from play on a failed save).
- **Content dropped from 5e:** none identified — the core removal/displacement fiction, the "unaware time has passed," and the resumption of ongoing effects are all preserved.
- **Content added with no 5e basis:**
  - The intermediate escape save on the failure tier (discussed above).
  - The explicit success tier ("disappears until the start of its next turn") — a wholly new outcome with no 5e equivalent, needed only because PF2e requires four save degrees.
  - Traditions: 5e classes (Bard/Druid/Wizard) mapped to arcane + occult.

## Converter's notes

**Anchor:** "no clean analog — designed from rank-8 incapacitation budget; Quandary (rank 8, extradimensional removal) is the nearest published PF2e anchor for 'remove creature from fight'"

**Archetype:** control/save-or-suck — temporal removal (incapacitation)

**Balance bullets:**
- "Touch range is the primary balance lever — to remove a creature from combat for 1d4+1 rounds you must touch it, which means a melee-range action against the target's AC or an opportunity for the target to step away"
- "Fortitude save (5e Con → PF2e Fort): withstanding temporal ejection is a test of physical endurance against the fabric of time"
- "Incapacitation trait mandatory: creature cannot act or be acted upon — the canonical definition of removed from fight"
- "At rank 8 the incapacitation gate is level 17+ (level > 16); most rank 8-encounter bosses are level 16-18, so the gate is relevant ~50% of the time against intended targets"

**Overridable:**
- "Intermediate save on failure: 5e allowed no save to return early; PF2e version adds an intermediate Fortitude save each round on failure to soften the effect; GM may remove the intermediate save to match 5e strictly"
- "Temporal trait: custom trait — see Outside of Time notes" *(note: the store's actual trait list does not include a "temporal" trait at all — it uses `incapacitation`, not a custom `temporal` tag; see Open flags)*

**Checklist failures:**
- "No clean PF2e analog for touch temporal removal; closest is Quandary which is extradimensional (different fiction). Flagged 'no clean analog' in anchor."

## Similar official spells

- **Quandary** (rank 8) — `apps/codex/.../spells/rank-8/quandary.json`. The converter's own cited anchor: teleports the target into an extradimensional puzzle room, sustained duration, escape via a repeatable skill check rather than a save; both spells solve "remove a creature from the fight at rank 8" but via different fiction (extradimensional imprisonment vs. temporal displacement) and different escape mechanisms (skill-check puzzle-solving vs. save-based duration/early-return).
- **Maze of Locked Doors** (rank 7) — `apps/codex/.../spells/rank-7/maze-of-locked-doors.json`. Will save, incapacitation + extradimensional + teleportation traits, escape via forcing/picking doors gated by save degree — one rank below Time Jump, same broad category (save-gated removal with an escape path tied to the save result).
- **Banishment** (rank 5) — plain save-based extraplanar removal, listed for the lower-rank comparison point in the same "remove from combat" family (three ranks below Time Jump).
- **Slow** (rank 3) — `apps/codex/.../spells/rank-3/slow.json`. Not a removal spell, but the converter's broader "time dilation" fiction family reference point (Fortitude save into a lesser action-economy penalty rather than full removal).

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **"Temporal" custom trait referenced in converter's notes but absent from the store**: the converter's `overridable` list mentions a "Temporal trait: custom trait — see Outside of Time notes," but the canonical store's actual trait list is `chronomancy, concentrate, incapacitation, manipulate` — there is no `temporal` trait present. (The intermediate jmnario conversion does list `temporal` as a trait, so the store dropped it relative to jmnario's output, consistent with the "0 deviations from fresh adapter baseline" status — this is adapter policy discarding the custom non-canonical trait, not a hand edit.)
- No material-component drop or `damage` structural-field concern (spell deals no damage) on this entry.
