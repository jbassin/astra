# Wall of Time

## Header block

- **Rank:** 5
- **Routing:** `ledger:wall-terrain`
- **Pool reason:** ledger — `rawSkipReason`: "no-priceable-effect (no damage, no conditions,
  no modifiers)". This is the *only* spell in the whole 176-spell set carrying the
  `wall-terrain` reason code (triage §0: "wall 1" under the ledger breakdown).
- **Current assay line (from `apps/assay/out/homebrew/scores.json`):** `kind: ledger`, no
  verdict/EV/residual (deliberately unpriced).
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "area text not structurally parseable, left unmapped (effective-target classification
    falls back to the description's own target-count heuristic): 'a straight wall up to 60
    feet long and 20 feet high, or a ring 20 feet in diameter and 20 feet high, 1 foot
    thick'"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage
    effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, manipulate. Rarity: common.
- **Traditions:** arcane, occult.
- **Cast:** 2 actions (concentrate, manipulate).
- **Range:** 120 feet. **Target:** none (`target.value: ""`) — it's an area/wall effect, not
  a targeted spell. **Area:** `system.area: null` (structured area field is empty — see
  adapter warning; the wall's shape lives only in prose).
- **Defense:** none (`system.defense: null`).
- **Duration:** 1 minute, sustained.
- **Heightened:** fixed-rank, level 7 only (description appendix; no structured effect).

## The 5e original

- **Level/School:** 5th-level, school "chronomancy" (custom 5e school; source `tfc`).
- **Casting time:** 1 action.
- **Range:** 120 feet.
- **Components:** V, S, M (an hourglass).
- **Duration:** Concentration, up to 1 minute.
- **Classes:** Bard, Druid, Wizard.

> You form a rip in time into the shape of a wall within range. You can make a straight wall
> up to 60 feet long, 20 feet high, and 1 foot thick, or a circular wall up to 20 feet high,
> 1 foot thick, and forming a closed circle 20 feet in diameter. Nonmagical ranged attacks
> that cross the wall vanish into time with no other effect. Ranged spell attacks and ranged
> weapon attacks made with magical weapons that pass through the wall are made with
> disadvantage. A creature that intentionally enters or passes through the wall is affected
> as if they had just failed their initial saving throw against the *slow* spell.

No `entriesHigherLevel` field present (5e original has no upcast text).

## The conversion (canonical store)

> You tear a rift in linear time and shape it into a translucent, rippling wall of temporal
> energy at a point within range. The wall is intangible — creatures can move through it
> freely — but crossing it costs significant action economy.
>
> **Crossing the wall.** A creature that crosses the wall (in either direction) must expend
> an additional action to do so; if the creature crosses as part of a Stride, that Stride
> counts as having moved an additional 10 feet of difficult terrain.
>
> **Ranged attacks.** Nonmagical ranged attacks that cross the wall automatically miss.
> Magical ranged attacks that cross the wall must succeed at a flat check (DC 11) or miss.
>
> **Sustained effect.** Each round you Sustain this spell, you may move the wall up to 20
> feet along the ground (the wall cannot be flipped or reoriented, only slid).
>
> ---
> **Heightened (7th)** The wall also imposes a Fortitude save (DC = your spell DC) on any
> creature that passes through it; on a failure, the creature is *Slowed 1* (UUID link to
> `Compendium.pf2e.conditionitems.Item.Slowed`) until the start of its next turn.

No degree-of-success structure at base rank (the base wall has no save; only the rank-7
heighten introduces a Fortitude save). Structured `area: null` disagrees with the prose,
which specifies exact wall dimensions — this is the adapter warning's subject, and it means
none of the assay pipeline's area-based logic can see the wall's true footprint.

**Prose formatting note:** the section headers "**Crossing the wall.**", "**Ranged
attacks.**", and "**Sustained effect.**" are written as literal Markdown double-asterisks
inside the HTML `description.value` field, not as `<strong>` tags — see Open flags.

## What changed, plain English

The wall's core function (intangible, crosses cost action economy, blocks ranged attacks,
slow-adjacent heighten) is preserved, but several concrete numbers and mechanics changed or
were added with no 5e basis:

- **Action cost:** 5e 1 action → PF2e 2 actions to cast (standard conversion multiplier).
- **Concentration → Sustain:** 5e used standard Concentration up to 1 minute; PF2e uses
  Sustain up to 1 minute (structurally equivalent upkeep mechanic).
- **Wall dimensions:** preserved essentially verbatim — 60 ft long / 20 ft high straight wall
  or a 20-ft-diameter, 20-ft-high, 1-ft-thick ring. (Store area field is null/unstructured —
  see Open flags — but the prose numbers match 5e almost exactly, modulo very minor rewording
  of "circular wall...forming a closed circle" → "ring".)
- **Nonmagical ranged attacks:** 5e "vanish into time with no other effect" → PF2e
  "automatically miss." Functionally near-identical (attack fails either way); reworded for
  PF2e framing per jmnario's notes.
- **Magical ranged attacks:** 5e gave these *disadvantage* (a native 5e mechanic with no
  direct PF2e equivalent). PF2e replaces this with a **flat DC 11 check to avoid missing
  outright** — this is a structurally different (and, per the converter's own
  `checklistFailures`, potentially *stronger*) mechanic with no direct 5e numeric basis; DC
  11 was invented for the conversion, not derived from 5e text.
- **Added, no 5e basis: mandatory extra action to cross the wall.** 5e only implied a
  creature "intentionally enters or passes through" triggers the slow-equivalent effect; it
  never charged an action-economy tax just to cross. The PF2e version adds a hard action
  cost (or +10 ft difficult terrain if crossing via Stride) for *every* crossing, in *either*
  direction — this is new content, not a reframe of an existing 5e clause.
- **Base-rank save dropped, moved to heighten:** 5e's slow-on-crossing effect applied
  *immediately at base level* (any creature intentionally crossing is affected as if it
  failed its save vs. *slow*). PF2e's base version has **no save and no slow effect at
  all** — that entire clause is deferred to the 7th-rank heightening, where it reappears as
  a Fortitude save vs. Slowed 1 (one round, until start of next turn — noticeably weaker and
  shorter than 5e's full *slow* spell effect for a whole round). This is a genuine downgrade
  of the base spell's power relative to the 5e original, restructured as an upcast bonus.
  Fortitude was chosen (not specified in 5e, since 5e's version borrowed *slow*'s save type,
  which is a group saving throw dependent on Wisdom in 5e terms — not directly portable).
  This should be read alongside the checklist failure noting the "nonmagical ranged auto-miss
  vs. Wall of Force's physical block" tension.
- **Sustain-move mechanic:** 5e moved the wall via a bonus action (implied, per the
  converter's `preservedElements` note); PF2e maps this onto the Sustain action itself (no
  separate action spent to reposition).

## Converter's notes

**Anchor:** no clean analog — Wall of Stone (rank 5) and Wall of Force (rank 6) are the
closest; Wall of Time is intangible but blocks attacks and costs movement.

**Archetype:** utility / control (wall, area control)

**balanceBullets:**
- "Intangible wall (no HP/Hardness) that blocks ranged attacks and costs 1 extra action to
  cross: weaker than Wall of Force (Hardness 30, 60 HP) but unique in being passable"
- "Nonmagical ranged attacks auto-miss; magical ranged attacks need a flat DC 11 check:
  meaningful but not absolute for magical attackers"
- "Sustained up to 1 minute: forces the caster to invest action economy each round; Sustain
  also allows repositioning (20 feet per round)"
- "Rank-7 heightening adds a Fortitude save (slowed 1) for crossing — reasonable escalation
  that makes the wall punishing to cross"

**overridable:**
- "The wall could be given HP/Hardness if the author prefers a destructible barrier (e.g.,
  AC 10, Hardness 10, 40 HP — similar to Wall of Ice at rank 5)"
- "The flat DC 11 check for magical ranged attacks could be replaced with a counteract check
  at rank 5 vs the attacking spell's rank"

**checklistFailures:**
- "The 'time' trait is a custom homebrew trait. See Jolt note for series-wide flag."
  (Note: the canonical store's `traits.value` no longer contains "time" — it was replaced
  with "chronomancy," the spell's actual custom school, at some point between jmnario's
  conversion and the store. See Open flags.)
- "Wall of Time at rank 5 vs Wall of Force at rank 6: the intangible nature makes it weaker
  than Wall of Force overall, which is appropriate for being 1 rank lower. However, the
  'nonmagical ranged attacks auto-miss' is stronger than Wall of Force's behavior (which
  blocks movement physically). This is an 'Everything Spell' partial risk — mitigated by the
  intangible design choice."

## Similar official spells

- **Wall of Stone (rank 5)** — same rank, same 120-ft range, a 120-ft-long/20-ft-high solid
  wall with HP/Hardness per section; physically blocks movement and has no auto-miss ranged
  clause. Wall of Time trades the physical/destructible axis for a "costs an action to cross
  + ranged-attack denial" axis at the same rank — the direct point of comparison the
  converter's own anchor calls out.
- **Wall of Force (rank 6)** — one rank higher, AC 10/Hardness 30/60 HP, fully blocks
  physical effects including magic missile; the converter's own anchor for "what a hard wall
  costs one rank up." Wall of Time's auto-miss-on-nonmagical clause is comparably strong to
  Wall of Force's total physical block, despite sitting a rank lower and being intangible.
- **Wall of Ice (rank 5)** — same rank, 60 ft/10 ft or hemisphere variant, opaque, has its
  own HP/Hardness-shatter mechanic and a cold-splash effect on breaking; another same-rank
  destructible-wall data point.
- **Slow (rank 3)** — the spell Wall of Time's rank-7 heighten borrows its condition
  language from (Slowed via a Fortitude-style save structure, escalating Slowed 1/1
  round → Slowed 1/1 minute → Slowed 2 on crit fail). Useful to see how much a full-strength
  Slow effect costs (rank 3, single target, degrees of success) against Wall of Time's
  flattened single-outcome "fail = Slowed 1 until your next turn" version at rank 7.

## Prior astra touches

None found. `revisions.md` has no `Wall of Time` entry (store matches a fresh re-conversion
of the vendored baseline exactly — 0 hand-edit deviations). Not named in the voice-sweep
(§8) or item-6 deep-COLD list (§10) of `homebrew-triage.md`.

## Open flags

- **Markdown asterisks embedded in HTML description:** "**Crossing the wall.**", "**Ranged
  attacks.**", and "**Sustained effect.**" appear as literal `**...**` characters inside the
  `<p>` tags of `system.description.value`, not as `<strong>` elements. Every other bolded
  element in this same description (the "Heightened (7th)" label) correctly uses
  `<strong>`. This is a formatting inconsistency within the same field.
- **`system.area` is null** despite the wall having a fully-specified shape in prose (60 ft
  long × 20 ft high straight wall, or a 20-ft-diameter/20-ft-high/1-ft-thick ring) — flagged
  by the adapter itself as not structurally parseable. No downstream tooling that reads the
  structured area field can see the wall's footprint.
- **`system.target.value` is empty string** (consistent with an area/wall effect rather than
  a targeted spell, but worth confirming this is the intended empty-vs-null convention used
  elsewhere in the store).
- **Trait renamed, not just added:** jmnario's intermediate conversion listed a "time" trait
  (flagged in his own `checklistFailures` as a custom homebrew trait needing a series-wide
  decision); the canonical store instead carries "chronomancy" and drops "time" entirely.
  This happened before/outside the revisions.md-tracked hand-edit history (0 deviations),
  so it was presumably a structural adapter-level policy decision rather than a manual
  stakeholder edit — worth confirming that's the intended resolution to the checklist
  failure.
- **DC 11 flat check has no explicit heighten-scaling text** — it stays "DC 11" verbatim
  through the 7th-rank heighten (which only adds the Fortitude save/Slowed clause), so a
  rank-5 flat DC 11 and a heightened rank-7 flat DC 11 are numerically identical; whether
  that's intended or an oversight isn't stated anywhere in the text.
- **Heighten text is prose-only:** `heightening.levels["7"]` is an empty object; the Fortitude
  save/Slowed 1 effect exists only in the description's "Heightened (7th)" paragraph, per
  the adapter warning.
