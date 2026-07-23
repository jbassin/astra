# Excavation

## Header block

- **Rank:** 4 (store: `system.level.value = 4`)
- **Routing:** ledger:long-cast — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, earth, manipulate, planara
- **Traditions:** arcane, primal
- **Cast:** time.value = "1 hour"
- **Range:** "50 feet"
- **Target:** "" (empty)
- **Area:** `system.area = null` — no area field at all
- **Defense:** `system.defense = null` (no save)
- **Duration:** "1 hour", not sustained
- **Heightening:** **no `heightening` key present in the store JSON at all** (see Open Flags)

## The 5e original

- **Level:** 4th
- **School:** Planara
- **Casting time:** 1 hour
- **Range:** 50 feet (point)
- **Components:** V, S, M ("a mole's claw")
- **Duration:** Concentration, up to 1 hour
- **Classes:** Ranger, Seeker, Warlock, Wizard

> For the duration of this spell, you can excavate a cube 10 feet to a side of earth, sand, stone, or mud each round. You can expand an existing hole or start a new one. You can't dig through artificially constructed stone, such as in a building or wall. The earth removed from the hole is returned to the Plane of Earth.
>
> You can also use this spell to tunnel through earth. If the tunnel is longer than 10 feet, it has a 30% chance of collapsing (roll 1d20; a result of 1–6 means collapse), with an additional 5% per 5 feet beyond 30 feet total tunnel length, unless the tunnel is braced or structurally supported. Creatures normally have enough time to react automatically when you dig beneath them; no saving throw is required to avoid falling into a newly excavated space.

No entriesHigherLevel proper; the 5e original has a heightened-style note appended in the vendored JSON ("Heightened (+1) The volume you can excavate each round increases by a 5-foot-cube (a 15-foot cube at rank 5, a 20-foot cube at rank 6, etc.)"), carried as part of the entries text.

## The conversion (canonical store)

> You channel power from the Plane of Earth, allowing you to excavate terrain at a rapid rate. For the duration, once per round as part of Sustaining the spell, you can excavate a cube up to 10 feet on each side of earth, sand, unworked stone, or mud within range. The removed material is returned to the Plane of Earth. You can expand an existing hole or start a new one. This spell cannot affect artificially constructed stone or masonry (such as building walls, castle foundations, or worked stone floors).
>
> You can also use this spell to tunnel through earth. If you create a tunnel longer than 10 feet, attempt a DC 7 flat check when you finish excavating it; on a failure, the tunnel collapses. The DC increases by 1 for every 5 feet of tunnel beyond 30 feet, and a braced or structurally supported tunnel never collapses. A creature standing above a space you excavate has time to step aside; it doesn't fall in and doesn't need to attempt a save.
>
> ---
> **Heightened (+1)** The volume you can excavate each round increases by a 5-foot-cube (a 15-foot cube at rank 5, a 20-foot cube at rank 6, etc.).

No `@UUID` links present.

## What changed, plain English

The core mechanic is preserved closely: 10-ft cube of earth/sand/unworked stone/mud excavated per round via Sustain, expanding an existing hole or starting a new one, no effect on artificial/worked stone, removed material sent to the Plane of Earth, and creatures above the dig site auto-avoid falling in with no save required. Range (50 ft) and duration (1 hour) carried over 1:1 from the 5e original.

Structure/mechanics:
- 5e "10-foot cube per round" as an implicit free action under concentration → PF2e makes it explicit: "once per round as part of Sustaining the spell." The converter's own notes flag this as a deliberate clarification ("the original was vague about action cost per round; PF2e Sustain = 1 action = 1 excavation event per turn").
- 5e tunnel-collapse chance is a **percentage roll** ("30% chance... roll 1d20, 1–6 means collapse... +5% per 5 ft beyond 30 ft") → PF2e converts this to a **DC flat check**: "DC 7 flat check... DC increases by 1 for every 5 feet of tunnel beyond 30 feet." This is a mechanical-system translation (percentile → PF2e flat-check DC), not a straight numeric copy — DC 7 on a flat check is roughly a 30% failure chance (needing to roll under 7 on d20 fails ~30% of the time, matching the 5e "30% chance" starting point), and the "+5% per 5 ft" 5e scaling becomes "+1 DC per 5 ft" in PF2e terms.
- Material component "a mole's claw" is **dropped** — `system.cost.value = ""` in the store (Remaster convention, no material components).
- 5e's appended heighten note ("+1: volume increases by a 5-ft cube... 15-ft cube at rank 5, 20-ft cube at rank 6") is carried over verbatim in the PF2e description text, but is **not represented in any structured `heightening` field** — the store has no `heightening` key at all for this spell (see Open Flags).
- Traits added with no direct 5e basis: earth, planara (school-as-trait replacing the 5e "Planara" school field), concentrate/manipulate. Traditions arcane+primal replace the 5e Ranger/Seeker/Warlock/Wizard class list.
- Cast time modeled as `time.value = "1 hour"` with no discrete action-count — matches the 5e "1 hour" casting time (this is a long-cast utility spell, not a combat action-economy spell).

## Converter's notes

- **Anchor:** "Passwall (rank 5, permanently opens a passage through a wall) — Excavation is a lower-rank, sustained, bulk-excavation version appropriate for rank 4"
- **Archetype:** utility (earth-manipulation, terrain alteration)
- **Balance bullets:**
  - "This spell has no combat application — it is a pure terrain-alteration utility for exploration, dungeon-construction, or siege play."
  - "The 10-ft cube per round rate allows significant earthwork over the 1-hour duration (up to 60 excavated cubes) — appropriate for rank 4."
  - "The collapse mechanic for tunnels >10 ft is preserved as a risk element; tunnels require engineering support for safety."
  - "No saving throw for creatures standing above the excavation — correctly handled as a narrative auto-avoid."
- **Overridable:**
  - "The 1-hour duration could be shortened to 10 minutes (with the same per-round volume) for more limited but usable utility."
  - "Could allow excavation of worked stone at a slower rate (a 5-ft cube per round) to expand applicability without removing the limitation entirely."
- **Checklist failures:** none

## Similar official spells

- **Shape Stone (rank 4)** — exact-rank comparable: touch range, reshapes a cube of stone up to 10 ft across, Reflex save for creatures standing atop it (fall Prone on failure). Different axis (precision reshaping vs. bulk removal) but same rank and same "earth" trait/element.
- **Sprawling Tunnels (ritual, level 7)** — the closest functional analog for tunneling: creates a full tunnel network between two named locations, 10 ft wide/15 ft tall, difficult-to-navigate passageways, earth trait, uncommon rarity. Ritual-tier (not a spell slot), much higher effective level, but the clearest official comparison for "magically create traversable tunnels."
- **Wall of Stone (rank 5)** — inverse function (creates stone rather than removes it) at one rank above Excavation; useful as a scale reference for "earth-manipulation utility spell, one rank up."

No scorer comparables were supplied for this spell in the routing brief (routed via ledger, not the comparables pool).

## Prior astra touches

`revisions.md` records Excavation as a **deviation** from the fresh in-memory re-conversion baseline:

> ### Excavation (`excavation`)
> - description: length delta -17 chars (store=1135, baseline=1152)

This is a small (17-character) hand-edit to the description prose relative to what the adapter would generate fresh today; no field-level (damage/range/duration/etc.) deviation is listed, only the description-length delta.

## Open flags

- **No `heightening` key at all** in the store JSON (`system` has no `heightening` field), despite the description containing a full "Heightened (+1)" block. Every other spell in this chunk with appendix-only heighten text (Do My Bidding, Earworm, Ebb and Flow, Erase, Farsight) at least carries a `heightening: {type: "fixed", levels: {...}}` skeleton with empty-object entries; Excavation has neither a fixed nor interval `heightening` block.
- `system.area = null` and `system.target.value = ""` — the spell affects a location/volume within range but has no structured area or target field encoding what it acts on (the 10-ft cube is prose-only).
- The 5e percentage-based collapse chance ("30%... +5% per 5 ft") was translated to a PF2e flat-check DC ("DC 7... +1 per 5 ft") — this is a system-appropriate mechanical translation rather than a literal number carryover; flagging for visibility since the two systems' math isn't a direct 1:1 (percentile roll vs. d20-under-DC).
- Material component "a mole's claw" from the 5e original is dropped with no replacement (Remaster convention — no material components).
- The store has an unlogged 17-character description-prose edit relative to the fresh adapter baseline (see Prior astra touches); the specific wording change is not itself visible in `revisions.md` (only the character-count delta is recorded there).
