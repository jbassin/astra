# Flicker

## Header block

- **Rank:** 3 · **Routing:** `ledger:teleport-utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (scores.json: `kind: "ledger"`, `rawSkipReason: "no-priceable-effect (no damage, no conditions, no modifiers)"`, `reasonCode: "teleport-utility"`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, kosmoturgy, manipulate, teleportation · **Rarity:** common
- **Traditions:** arcane, divine, occult
- **Cast:** 2 actions · **Range:** self · **Target:** you
- **Defense:** none (`system.defense = null`)
- **Duration:** sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)
- **Heightening scaffold:** `system.heightening = {"levels":{"5":{},"7":{}},"type":"fixed"}`

## The 5e original

- **Name:** Flicker · **Source:** tfc (homebrew) · **Level:** 3 · **School:** kosmoturgy
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V, S, M — "a tuft of displacer beast fur"
- **Duration:** Concentration, up to 1 minute
- **Classes:** Cleric, Paladin

> You gain better control of the eddies in the space around you, letting you find small shortcuts from place to place. For the duration of the spell, you can use your bonus action to teleport 5 feet. Additionally, when you are targeted by an attack you can use your reaction to attempt to teleport out of harm's way. Roll a d20. On a roll of 11 or higher, the attack automatically misses, and you teleport 5 feet. Otherwise, the attack is made as normal and you teleport 5 feet shortly after.

No `entriesHigherLevel` block in the 5e source (this spell has no native 5e upcast text).

## The conversion (canonical store)

You gain intuitive control of the spatial eddies around you, bending short distances through the gaps between places. For the duration of the spell, you gain the following abilities:

**Flicker Step (1 action):** You teleport to an unoccupied space within 5 feet. This does not trigger Reactive Strikes.

**Spatial Dodge (reaction, trigger: a creature targets you with an attack roll):** Roll a d20. On an 11 or higher, you teleport 5 feet to an unoccupied space and the attack misses automatically (the attacker's action is not wasted — they simply missed). On a 10 or lower, you teleport 5 feet after the attack resolves (the attack is made normally). You may use Spatial Dodge once per round.

You can Sustain this spell on each of your turns to maintain the effect. The 5-foot teleports from both abilities count as forced movement for the purpose of abilities that react to movement.

---

**Heightened (5th)** Flicker Step increases to 15 feet, and Spatial Dodge increases to a 15-foot teleport. The d20 threshold for Spatial Dodge decreases to 8 or higher.

**Heightened (7th)** Flicker Step increases to 30 feet. You can use Spatial Dodge twice per round. Once per round when you successfully dodge an attack with Spatial Dodge, you may Flicker Step as a free action immediately after.

No `@UUID` references. No `successTiers`/degree-of-success structure (the spell's only "roll" is a flat d20 threshold check, not a PF2e save/skill check against a DC). `system.damage = {}` (empty) — correctly reflects that this spell deals no damage of its own. Both `system.heightening.levels."5"` and `."7"` entries are empty objects; the actual heightened text (range increases, threshold change, double-use, free-action chaining) exists only in the description appendix.

## What changed, plain English

- **Action-cost split, added structure:** 5e collapses the "5-ft teleport" into a single bonus-action-usable ability, used identically whether at-will mobility or defensively. PF2e's conversion splits this into two named abilities — a 1-action "Flicker Step" (proactive movement) and a distinct reaction "Spatial Dodge" (defensive, trigger-gated) — a structural decomposition not present in the 5e text, which describes only one bonus-action teleport plus one reaction dodge sharing the same 5-foot distance.
- **Explicit no-Reactive-Strike clause added:** Flicker Step "does not trigger Reactive Strikes" — new text with no 5e equivalent (5e has no opportunity-attack-on-movement rule tied to this ability at all; PF2e's Reactive Strike is a different mechanic that the conversion had to explicitly neutralize).
- **Once-per-round cap on Spatial Dodge, added:** not present in the 5e text (5e implicitly limits by "one reaction per round" as a general rule; PF2e's conversion states this explicitly as a spell-level restriction).
- **Forced-movement classification, added:** "The 5-foot teleports from both abilities count as forced movement for the purpose of abilities that react to movement" — an entirely new rules clarification with no 5e basis (5e has no analogous "forced movement" categorization to map from).
- **Cast time:** 5e 1 action → PF2e 2 actions (the conversion makes the spell notably more expensive to cast than the source, in exchange for the expanded two-ability structure above).
- **Heightening, wholly new content:** 5e has zero at-higher-levels text for this spell. The conversion adds two full heightened tiers (5th: range 5→15 ft, threshold 11→8; 7th: range →30 ft, second Spatial Dodge use/round, free-action chained Flicker Step after a successful dodge) — none of this scaling exists in the 5e source at all.
- **Traditions:** 5e class list (Cleric/Paladin) → arcane + divine + occult.

## Converter's notes

- **Anchor:** "no clean analog — closest is Blink (rank 4, teleports self semi-randomly on end of turn, 50% miss chance) but Flicker is a controlled short-teleport with a reaction dodge"
- **Archetype:** utility/combat (micro-teleport mobility + reaction dodge)
- **Balance bullets:**
  - "Blink (rank 4) has stronger defensive value (50% miss chance passively) but no offensive mobility application. Flicker (rank 3) provides controlled 5-ft teleports and a reaction dodge that requires a d20 check — weaker than Blink defensively, more controllable offensively."
  - "The Spatial Dodge d20 (11+ miss, 10- normal) is roughly a 50% chance to avoid an attack as a reaction, which is significant. Once-per-round cap prevents it from negating all attacks on a turn."
  - "5-ft teleport range is minimal — primarily useful for avoiding Reactive Strikes and positioning micro-adjustments. This is intentionally narrow at rank 3."
  - "Sustained up to 1 minute (combat cap). Displacer beast fur material component is a flavor anchor that also signals the spell's illusion-adjacent spatial nature."
  - "Traditions arcane + divine + occult (kosmoturgy/space manipulation spans matter+mind / spirit+life / mind+spirit)."
- **Overridable:**
  - "The 50% d20 threshold (11+) for Spatial Dodge could be replaced with a flat +2 circumstance bonus to AC (PF2e-standard) rather than a d20 check — simpler but loses the 'risky teleport dodge' flavor."
  - "Could add the fortune trait to the Spatial Dodge d20 roll to allow fortune effects to interact with it — currently it's a plain d20, not a save or check."
- **Checklist failures:** none recorded.

## Similar official spells

- **Flicker (rank 4, official PF2e)** — a completely different spell of the *same name*: resistance 5 to all damage except force, plus an automatic 10-foot random teleport at the end of each turn while sustained. One rank above the homebrew spell, shares the `concentrate`/`manipulate`/`teleportation` traits and `arcane`/`occult` traditions exactly, but the mechanic (defensive resistance + involuntary random movement) is unrelated to the homebrew's controlled short-hop + reaction dodge. See Open Flags.
- **Echo Jump (rank 3)** — same rank; a 1-action teleport that leaves behind a force-damage burst at the origin point. Direct rank-3 teleport-utility comparable, offensive rather than defensive/mobility-focused.
- **Translocate (rank 4)** — one rank above; a longer-range self/ally teleport utility spell, useful as a contrast point for what "teleportation" traits buy at the next rank up when the effect is pure repositioning rather than combat mobility + defense.
- **Infiltrator's Tunnel (rank 4)** — one rank above; creates linked portals for repeated movement, illustrating a different "sustained/persistent teleport infrastructure" archetype at adjacent rank.

## Prior astra touches

None. `revisions.md` has no entry for Flicker.

## Open flags

- **Name collision with an official PF2e spell.** The snapshot contains an official spell also named "Flicker" at rank 4 (`spells/spells/rank-4/flicker.json`), sharing the exact same trait set (`concentrate`, `manipulate`, `teleportation`) and tradition set (`arcane`, `occult` — the official version omits `divine`), but with an entirely different mechanic (passive damage resistance + involuntary random teleport at end of turn, no reaction-dodge, no controlled short-hop). Two spells of the identical name exist in the combined corpus at different ranks with different effects.
- Both `system.heightening.levels."5"` and `."7"` are empty objects — all heightened text (range scaling, threshold change, double-use-per-round, free-action chaining) lives only in the description appendix with zero structured representation, consistent with the adapter warning.
- The 5e original has no heightening/upcast text whatsoever; the two heightened tiers (5th, 7th) in the conversion are entirely new content with no 5e-text basis, unlike some other spells in this chunk whose heightening at least extends an existing 5e progression.
- `system.damage = {}` (empty object, not absent) — correctly signals no damage, but worth noting the shape differs from spells with no damage key at all (e.g., a completely omitted `damage` field would parse identically for scoring purposes; this is a data-shape observation, not a functional issue).
