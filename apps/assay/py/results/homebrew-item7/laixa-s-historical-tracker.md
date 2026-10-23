# Laixa's Historical Tracker

## Header

- **Rank:** 2 · **Routing:** ledger:utility · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; no priced quantitative verdict.
- **Adapter warnings:** `fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only`
- **Traits:** chronomancy, concentrate (rarity: common)
- **Traditions:** arcane, occult, primal
- **Cast:** 2 actions
- **Range:** self · **Targets:** you
- **Defense:** none
- **Duration:** 10 minutes, not sustained
- **Heightening (structured):** `type: fixed`, `levels: {"4": {}, "6": {}}`

## The 5e original

- **Level** 2, **school** chronomancy (homebrew)
- **Casting time** 1 action
- **Range** self
- **Components** S, M ("a hound's hair and some sand") — no verbal
- **Duration** 1 hour, **concentration required**
- **Classes** Bard, Druid, Wizard

> You imbue a looking glass with chronomantic energy. You can look briefly into the past of the path you're on, and can see the footprints of the last creature who traveled along this same path, diplayed as ghostly footsteps.

**At Higher Levels:** "When cast at level 4, you can identify the race of the creature, and when cast at level 6 you can identify its name (if it has one and the individual is known to you)."

## The conversion (canonical store)

> You imbue a small looking glass or lens with chronomantic sight, allowing you to perceive the recent past of your immediate surroundings. For the duration, you can use a single Seek action to look at a path, road, corridor, or open area within 30 feet of you and see ghostly footprints of the last creature that traveled through that space — displayed as translucent, shimmering impressions that only you can see. You learn the size of the creature and the direction it was headed. The ghostly trail shows only the most recent traveler and persists visually until the spell ends or you use this ability again.
>
> **Heightened (4th)** You can identify the ancestry or creature type of the tracked creature in addition to its size and direction. The duration increases to 1 hour.
> **Heightened (6th)** If the tracked creature has a proper name and is known to you (or to your Recall Knowledge), you also learn that name. The duration increases to 8 hours.

## What changed, plain English

The core "ghostly footprints of the most recent traveler" fiction and the 4th/6th progression are preserved closely, but the action structure and duration model were substantially rebuilt:

- **Action cost:** 5e 1 action → PF2e 2 actions.
- **Duration/concentration:** 5e requires **concentration** for its full 1-hour duration; PF2e drops concentration/Sustain entirely, using a flat **10-minute** base duration instead (concentration is not represented anywhere in the store).
- **Heighten-tier duration bumps are new:** the 5e `entriesHigherLevel` text only ever changes *what information you learn* (race at 4th, name at 6th) — it never touches duration. The PF2e conversion additionally bumps duration at each tier (10 min → 1 hour at 4th → 8 hours at 6th), a structural addition with no 5e counterpart.
- **Seek-action gating added:** the 5e original describes a passive/always-on vision ("You can look briefly into the past..."); the PF2e version requires spending a Seek action each time you want to view the trail. This is a deliberate PF2e action-economy addition (confirmed by the converter's own notes).
- **Range cap added:** "within 30 feet of you" — the 5e text has no explicit distance limit on the vision at all.
- **Descriptive flavor added:** "displayed as translucent, shimmering impressions that only you can see" and the trail-persistence clarifier ("persists visually until the spell ends or you use this ability again") are new phrasing not present in the 5e text.
- **Material component preserved:** "hound's hair and sand" carries over from 5e into the PF2e `cost` text nearly verbatim.
- **Classes → traditions:** 5e's Bard/Druid/Wizard maps to arcane + occult + primal (three traditions, broad access preserved).

## Converter's notes

- **Anchor:** no clean analog — designed from utility divination budget at rank 2; closest is Locate (rank 3) for general creature-finding, but Tracker is weaker (most recent only, short duration at base)
- **Archetype:** utility/divination (retrocognitive tracking)
- **Balance bullets:**
  - "No published PF2e spell does exactly this (see the recent past of a physical location). The closest is Locate (rank 3, finds general creature types or specific objects) — Tracker is weaker: it shows only the most recent traveler and doesn't locate them, just their path."
  - "10-minute base duration is the standard rank-2 exploration utility floor; 1-hour is the 4th-rank heightened unlock, exactly as plan rules specify."
  - "Ancestry/type at 4th, name at 6th — progression preserved verbatim from 5e at 4th/6th level, which maps cleanly to PF2e heightened 4th/6th."
  - "Seek-action activation adds meaningful per-use action cost (prevents the spell from being a passive always-on scanner while maintaining the fiction of looking through the glass)."
  - "Cost (hound's hair + sand) is a thematic material but not expensive — appropriate for a rank-2 utility."
- **Overridable:**
  - "Could be made passive (no Seek required) if the GM prefers a simpler interaction — the PF2e Seek action wrapper adds realism but may feel over-procedural in play."
  - "Named-caster (Laixa's): PF2e-idiomatic is a focus spell for a chronomancy specialist. Kept as regular spell per plan directive."
- **Checklist failures:**
  - "Named-caster spell (Laixa's): PF2e-idiomatic conversion is a focus spell; kept as regular spell per plan directive."
  - "'time' trait used in Ebb and Flow (see that entry) but not here — considered, but Tracker is retrocognitive divination rather than active time manipulation; divination is sufficient."

## Similar official spells

- **Erase Trail** (rank 2) — an exact rank match with the mirror-image mechanic: reduces/hides signs of a creature's passage (footprints, handprints, etc.) rather than revealing them.
- **Locate** (rank 3) — the converter's own anchor; direction-finding divination for a known object or creature type, one rank above.
- **Retrocognition** (rank 7) — general psychic impressions of past events at your location over rolling day-long windows; a much higher-power, higher-rank take on "seeing the past" with no footprint/tracking specificity.
- **Glowing Trail** (cantrip) — the opposite/self-only version: your own movement leaves a visible trail for others, rather than revealing someone else's past movement to you.

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell.

## Open flags

- The 5e original requires concentration for its full 1-hour duration; the PF2e conversion drops concentration/Sustain entirely in favor of a flat 10-minute (heightened 1 hr/8 hr) duration — a structural remapping rather than a direct translation.
- The heighten-tier duration bumps (10 min → 1 hr → 8 hr) have no basis in the 5e text, which only ever changes the *information learned* at higher levels, never the duration.
- Seek-action gating and the 30-foot range cap are both PF2e-side additions with no counterpart in the 5e original.
