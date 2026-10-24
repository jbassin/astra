# Nightfall

## Header block

- **Rank:** 3
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score — pooled on the utility-ledger routing reason)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, illusion, manipulate, visual (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 2 actions
- **Range:** 100 feet
- **Targets:** (none — area effect)
- **Area:** cylinder, 60 feet
- **Defense:** none (`system.defense` is `null`)
- **Duration:** "until midnight (special)"

## The 5e original

- **Level:** 3 (Bard, Druid, Wizard)
- **School:** chronomancy (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** 100 feet (point)
- **Components:** V, S (no material)
- **Duration:** Special
- **Ritual:** true (5e `meta.ritual` flag is set — no ritual-casting equivalent carried into the PF2e conversion)

> You call upon night to arrive ahead of schedule. With a sharp word, you create a 60-foot-diameter cylinder centered on a point within range. Creatures and objects inside the cylinder are unaffected, but the sky above the area darkens as the sun quickly sets and the moon rises. While inside the area, all creatures perceive their surroundings as if it were night, but those outside the area cannot see that anything changed. *(Source text has "percieve" and "affect" for "perceive"/"effect" — verbatim vendor typos, reproduced for accuracy.)* The effect lasts until the rest of the world catches up to the time shift at midnight, at which point the spell fades.

**At Higher Levels:** Using a slot of 4th level or higher increases the cylinder's area — 600 ft at 4th level, 1 mile at 5th level, 10 miles at 6th level and up.

## The conversion (canonical store)

> You call upon night to arrive ahead of schedule. A 60-foot-diameter cylinder descends from the sky, centered on a point within range. Creatures and objects inside the cylinder are unaffected by the time-shifted sky, but the sky above and within the area darkens — the sun quickly sets, stars emerge, and the moon rises as if midnight had come early. All creatures inside the cylinder perceive their environment as if it were nighttime (darkness outside of any artificial light sources). Creatures outside the cylinder cannot perceive any change in the wider sky.
>
> Effects that depend on natural darkness or nighttime conditions (such as darkvision, light sensitivity, or moonsong abilities) apply within the area as if it were true night. The spell ends automatically at midnight as the wider world catches up to the time-shift and the effect dissolves naturally.
>
> **Heightened (4th)** The cylinder's diameter expands to 600 feet.
> **Heightened (5th)** The cylinder's diameter expands to 1 mile (approximately 5,280 feet).
> **Heightened (6th)** The diameter expands to 10 miles.

Structured fields agree with the prose: `area.type: "cylinder"`, `area.value: 60` matches "60-foot-diameter cylinder"; `duration.value: "until midnight (special)"` matches; `heightening.levels: {4,5,6}` matches the three heightened tiers.

## What changed, plain English

- **Ritual status dropped:** the 5e original is flagged `ritual: true` (castable without expending a spell slot, at the cost of extra time). No ritual-casting mechanism carries over into the PF2e conversion — it converts as a straight 2-action spell with no ritual alternative.
- **Content dropped:** the intermediate vendor conversion's description included an extra sentence — "This spell has no direct mechanical effect on creatures — it creates a localized nighttime environment with all the attendant conditions (darkness, moonlight)." — that is **not present in the canonical store's description**. This design-note-style sentence accounts for the store's recorded −163-char delta versus the fresh adapter re-conversion.
- **Mechanical clarification added with no direct 5e basis:** the store's second paragraph spells out that "Effects that depend on natural darkness or nighttime conditions (such as darkvision, light sensitivity, or moonsong abilities) apply within the area as if it were true night" — the 5e original only said creatures "perceive their surroundings as if it were night" without naming specific mechanical interactions (darkvision, light-sensitivity, moonsong).
- **Traits added with no 5e basis:** `illusion` and `visual` (justified in the conversion notes as: the spell creates false sensory information and should be defeated by illusion-immune/visual-immune creatures — a PF2e-native addition, not present in 5e's rules text). `chronomancy` is the literal 5e school name carried through as a trait (adapter-level normalization seen across this whole batch, e.g. also on Outside of Time).
- **Cast time:** 5e 1 action → PF2e 2 actions (standard 5e-1-action → PF2e-2-action default mapping).
- **No mechanical/numeric change to core payload:** the cylinder size (60 ft), the midnight-termination duration, and the heightened expansion tiers (600 ft / 1 mile / 10 miles at +1/+2/+3 ranks) are numerically identical between 5e and PF2e.

## Converter's notes

**Anchor:** Darkness (rank 2, 20-ft burst, 1 min) as rough anchor for light-affecting area spells; Nightfall is a dramatically larger area with no mechanical penalty, hence rank 3

**Archetype:** utility (environmental, time-manipulation illusion)

**Balance bullets:**
- "The spell has no direct mechanical combat effect — it creates an environmental darkness condition over a wide area. Creatures with darkvision or light sources are unaffected mechanically."
- "The 'special' midnight-termination duration is unusual in PF2e but thematically essential; it can last anywhere from moments to hours depending on time of day."
- "Heightening expands the area dramatically (from 60-ft diameter to 600 ft to 1 mile to 10 miles) — clearly a narrative-scale spell for affecting towns, ships, or battlefields."
- "Illusion + visual traits are necessary: the spell creates false sensory information (premature night) that can be immune to/disbelieved by creatures with illusion-immunity."

**Overridable:**
- "The 'special' duration could be simplified to a fixed 1-hour duration for easier table adjudication if the midnight-countdown feels complex."
- "Could add a Perception/Stealth bonus for creatures in the darkened area (standard darkness benefit) if the GM wants a minor mechanical hook."

**Checklist failures:** none recorded.

## Similar official spells

- **Darkness** (rank 2) — 20-foot burst of magical darkness, 1 minute. Cited directly by the converter as the light-affecting area anchor, though it's a much smaller, shorter, genuinely-mechanical (blocks vision, can be dispelled) area effect one rank lower.
- **Ravenous Darkness** (rank 6) — a larger, more hostile darkness/damage area spell; useful contrast for how official PF2e scales darkness-themed area effects with actual combat teeth, vs. Nightfall's purely environmental/no-save design at a much lower rank.
- **Chilling Darkness** (rank 3) — same rank, darkness-plus-damage area effect with a save; a same-rank-band comparison showing what an official rank-3 darkness-adjacent spell asks of its target (a save and damage) where Nightfall asks nothing at all.
- **Time Beacon** (rank 7) — thematically pairs on the "chronomancy" trait/time-manipulation angle (create a point to rewind to), though mechanically unrelated to environmental darkness; included as a same-trait-family reference rather than a functional comparable.

## Prior astra touches

Listed in `revisions.md` deviations: description length delta −163 chars (store=1150, baseline=1313). No other field-level deviations recorded (traits/area/duration/heightening all match the fresh adapter re-conversion exactly). Cross-checked against the vendor conversion text above: the delta corresponds to the dropped "no direct mechanical effect on creatures" design-note sentence.

## Open flags

- The 5e original carries a `ritual: true` flag; nothing in the PF2e conversion preserves a ritual-casting option — the spell is a straight 2-action-cast spell only.
- `system.defense` is `null` — no save or defense mechanic anywhere in the spell (consistent with the description's "no direct mechanical effect on creatures" framing, even though that exact sentence was removed from the player-facing text).
- The conversion notes explicitly acknowledge leaving the spell at `common` rarity ("left common for now") despite noting the 5e ritual tag "in spirit" suggested something rarer — a recorded but unresolved tension in the notes themselves, not something the store text currently reflects either way.
- `chronomancy` and `illusion`/`visual` are non-standard/added traits with no 5e-text basis for illusion/visual specifically (chronomancy mirrors the 5e school field via adapter-level normalization).
