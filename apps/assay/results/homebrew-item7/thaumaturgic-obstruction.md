# Thaumaturgic Obstruction

## Header block

- **Rank:** 6
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = `null`, rankRange = `null`, residualRanks = `null` (unscored in `queue.json`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** antillurgy, concentrate, manipulate — rarity: common — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** self
- **Area:** 60-foot emanation
- **Target:** `""` (none)
- **Defense:** `null` (no save/attack — a flat mechanical tax on other casters' action cost)
- **Duration:** 1 minute (structured: `duration.sustained = true`)
- **Cost:** `""`
- **Structured `heightening` field:** absent (no `system.heightening` object at all, despite a "Heightened (+2)" prose clause)
- **Structured `damage` field:** empty (`system.damage = {}`)

## The 5e original

- **Level / School:** 6th-level antillurgy
- **Casting time:** 1 action
- **Range:** sphere, 60 feet
- **Components:** V, S (no material)
- **Duration:** 10 minutes, concentration
- **Classes:** Sorcerer, Warlock, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> You increase the difficulty of casting spells in a 60-foot radius sphere around yourself. Spellcasters in the sphere require additional time to cast their spells: spells that take a bonus action to cast now require 1 action; 1 action increases to 1 round; and other spells have their casting times doubled. The sphere of effect moves with you, and does not affect you.

**entriesHigherLevel:** none present.

## The conversion (canonical store)

You envelope yourself in a field of temporal-aetheric drag that slows the casting process for all spellcasters other than yourself within range. While you sustain this spell, any creature within the 60-foot emanation (other than you) that casts a spell requires one additional action beyond the spell's normal casting time. Spells that normally require 1 action to cast require 2 actions; spells requiring 2 actions require 3 actions; spells requiring 3 actions cannot be cast at all while within the emanation. Free-action and reaction spells are unaffected. The emanation moves with you.

---

**Heightened (+2)** The emanation radius increases by 30 feet (90 feet at 8th, 120 feet at 10th).

**Structured/prose notes:**
- No `@UUID` links.
- `duration.sustained = true` correctly reflects the "While you sustain this spell..." prose and the intermediate conversion's "sustained up to 1 minute" duration string, which the astra adapter split into `sustained: true` + `value: "1 minute"`.
- The heightening rider (radius growth) has no structured `system.heightening` object — it exists only in prose, consistent with the adapter warning.

## What changed, plain English

The core fiction (a moving zone that taxes the casting time of every spellcaster but you) survives the conversion, but the specific tax mechanism is substantially rewritten to fit PF2e's action-count vocabulary rather than 5e's bonus-action/1-action/round taxonomy, and the duration model changes from a long-duration exploration-tier concentration spell to a short combat-tier sustained spell.

- **Numbers:**
  - 60-foot radius preserved exactly at base rank.
  - Heightening rate: PF2e's "+30 feet at +2 ranks (90 ft at 8th, 120 ft at 10th)" has no 5e counterpart at all — 5e provided no upcast text.
- **Structure:**
  - 5e casting-time tax: "bonus action → 1 action; 1 action → 1 round; other spells' casting times doubled" (three-tier, D&D-specific action economy). PF2e casting-time tax: "1-action spells → 2 actions; 2-action spells → 3 actions; 3-action spells cannot be cast at all" (three-tier, but restructured around PF2e's uniform action-count system, and the top tier changes from "doubled" to "blocked entirely").
  - Duration: 5e "10 minutes, concentration" → PF2e "1 minute, sustained" — a substantial duration reduction (10 min → 1 min) reflecting PF2e's combat-tier duration convention for a spell this powerful, per the converter's own balance notes ("the correct combat-grade cap").
  - Cast time: 5e 1 action → PF2e 2 actions (a genuine action-cost increase for establishing the aura).
  - The 5e clause "The sphere of effect moves with you, and does not affect you" is preserved essentially verbatim ("The emanation moves with you" + the "other than you" qualifier in the trigger clause).
- **Content dropped from 5e:** none identified in the core mechanic.
- **Content added with no 5e basis:**
  - "Free-action and reaction spells are unaffected" is an explicit new carve-out with no 5e textual counterpart (5e has no direct free-action/reaction-spell concept to carve out in the first place, since D&D 5e reaction spells and PF2e reaction spells work differently) — the converter's own notes describe this as added specifically "to avoid invalidating class features like Counterspell reactions."
  - The entire "+30 feet per +2 ranks" heightening progression is new content; 5e had no upcast text for this spell.

## Converter's notes

**Anchor:** "Slow (rank 3) — action economy reduction; Thaumaturgic Obstruction applies a targeted slow specifically to casting actions"

**Archetype:** control/debuff (action-economy field)

**Balance bullets:**
- "Paired with Thaumaturgic Inhibition at rank 6: Obstruction penalizes casting speed (action cost), Inhibition penalizes casting power (rank reduction). Each is balanced individually; combined they are extremely powerful."
- "3-action spells cannot be cast in the aura — this is the strongest element; effectively prevents enemy casters from using their most powerful spells while in range."
- "Sustained up to 1 minute is the correct combat-grade cap; the caster must commit a sustain action each round to maintain the effect."
- "Free and reaction spells excluded prevents the spell from disabling core class features (Counterspell, Shield reactions)."
- "Moving with the caster means the caster can act as a mobile anti-magic zone."

**Overridable:**
- "3-action spells could be allowed but with an additional 1-action cost (4 total) rather than being blocked entirely — less absolute but still punishing."
- "Could add a Will or Fortitude save for affected spellcasters to resist the drag each time they try to cast, turning it into a per-spell check rather than an automatic effect."

**Checklist failures:** none listed.

## Similar official spells

- **Thaumaturgic Inhibition** (rank 6, this dossier's sibling spell) — same source pair; power-debuff counterpart to Obstruction's action-economy tax.
- **Antimagic Field** (rank 8) — `apps/codex/.../spells/rank-8/antimagic-field.json`. The nearest official zone-based caster-shutdown effect: 10-foot emanation, sustained, total spellcasting block for everyone including the caster — two ranks higher, smaller radius, and categorically stronger (total block vs. Obstruction's action-cost tax that still permits 1–2-action spells).
- **Slow** (rank 3) — `apps/codex/.../spells/rank-3/slow.json`. The converter's own cited anchor: single-target Fortitude save into Slowed 1/Slowed 2, at half Obstruction's rank and single-target rather than zone-wide.
- **Haste** (rank 3) — `apps/codex/.../spells/rank-3/haste.json`, listed for the inverse action-economy comparison point (a rank-3 spell that grants an extra action, vs. Obstruction's rank-6 zone that taxes an action from every other caster's spellcasting specifically).

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **No structured heightening despite a live prose rider**: `system.heightening` is entirely absent even though the description contains a "Heightened (+2)" radius-growth clause (adapter warning explains why — interval heightening isn't structurally parseable by the current adapter).
- **Duration structural split**: `duration.sustained = true` + `duration.value = "1 minute"` correctly encode the intermediate conversion's single string "sustained up to 1 minute," but a reviewer reading only the structured fields (without the description prose) would see duration "1 minute" with no immediately-visible cue that it requires an ongoing sustain action each round beyond the boolean flag.
- No material-component or trait-drop issue identified on this spell (jmnario's conversion shows no cost/material for it, and traits match between jmnario's conversion and the store aside from the fixed `abjuration` vs. store's lack of a school trait — see next point).
- **School trait**: jmnario's intermediate conversion lists `abjuration` as a trait; the canonical store's traits (`antillurgy, concentrate, manipulate`) do not include `abjuration`. Since revisions.md shows 0 deviations for this spell, this is adapter policy (antillurgy is a custom homebrew school, not mapped to the official `abjuration` trait), not a hand edit.
