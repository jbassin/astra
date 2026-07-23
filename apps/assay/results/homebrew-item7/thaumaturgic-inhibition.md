# Thaumaturgic Inhibition

## Header block

- **Rank:** 6
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = `null`, rankRange = `null`, residualRanks = `null` (unscored in `queue.json`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** antillurgy, concentrate, manipulate — rarity: common — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** self
- **Area:** 60-foot emanation (`area = {type: emanation, value: 60}`)
- **Target:** `""` (none — it's an area effect)
- **Defense:** `null` (no structured save/attack — the effect is a check against the caster's spell DC using the affected creature's own spellcasting attribute, which PF2e's defense field can't model)
- **Duration:** 1 minute (structured: `duration.sustained = false`)
- **Cost:** `""`
- **Structured `heightening` field:** present — `{levels: {"8": {}}, type: "fixed"}` (an empty level-8 entry; matches the "Heightened (8th)" prose trigger)
- **Structured `damage` field:** empty (`system.damage = {}` — this spell deals no direct damage itself)

## The 5e original

- **Level / School:** 6th-level antillurgy
- **Casting time:** 1 action
- **Range:** sphere, 60 feet
- **Components:** V, S (no material)
- **Duration:** 1 minute, non-concentration
- **Classes:** Sorcerer, Warlock, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> You increase the difficulty of casting spells in a 60-foot radius sphere around yourself. Any spellcaster that casts a spell within 60 feet of you must make an ability check using their spell-casting ability against your spell saving throw DC. If the check fails, the spell takes effect as if it were cast using the minimum slot level that could be used to cast it rather than the slot that was actually used. In addition, if the spell deals damage it has a −1 penalty on each die, to a minimum of one.

**entriesHigherLevel:** none present.

## The conversion (canonical store)

You weave antillurgic interference through the ambient aether, throttling spellcasting within the sphere. Any creature other than you that casts a spell while within the 60-foot emanation must attempt a DC equal to your spell DC check using its key spellcasting attribute. On a failure, the spell is cast as if using the lowest possible spell slot that could produce it (minimum rank 1), and the spell's damage dice each roll one lower than normal (minimum 1 per die). On a success, the spell takes effect normally. The emanation does not move with you; it is centered on the point where you cast the spell.

---

**Heightened (8th)** The emanation moves with you and affects your own higher-rank slots unless you expend a free action each round to maintain your connection to the weave.

**Structured/prose notes:**
- No `@UUID` links.
- No degree-of-success tiers (`successTiers` is null in the intermediate conversion, and the store has no `defense` object) — this is a pass/fail check, not a PF2e saving throw, so the four-degree framework doesn't apply.
- The heightened-8th text is a purely qualitative behavior change (emanation now moves with caster + affects the caster's own higher-rank slots unless a free action is spent) — no damage number is touched, matching adapter warning #1.

## What changed, plain English

The core mechanic — a fixed-point 60-foot zone that forces enemy spellcasters to make an attribute check vs. the caster's spell DC or have their spell downcast to minimum rank plus a −1-per-die damage penalty — is preserved essentially verbatim from the 5e original. The changes are almost entirely systemic/terminology translation rather than substantive content changes.

- **Numbers:** No numeric values changed. 60-foot radius preserved exactly. The −1-per-die damage penalty (minimum 1 per die) is preserved exactly. Minimum-rank downcast on failure is preserved exactly.
- **Structure:**
  - 5e "ability check using spellcasting ability vs. your spell saving throw DC" → PF2e "DC equal to your spell DC check using its key spellcasting attribute" — same mechanic, PF2e vocabulary (spell DC vs. spell save DC are effectively the same concept renamed).
  - Cast time preserved at "1 action" in the 5e text but PF2e's `time.value` is "2" — a genuine action-cost increase (1 action → 2 actions) for the aura-establishing cast.
  - 5e "5e sphere" range type → PF2e `area.type = "emanation"`, the standard PF2e term for this shape.
  - Duration: 5e "1 minute, non-concentration" preserved exactly as PF2e "1 minute," `sustained: false`.
- **Content dropped from 5e:** none identified — the 5e entry text has no upcast/higher-level section, and none was invented in the conversion (contrast with Temporal Discharge, where a heightening structure was invented from nothing).
- **Content added with no 5e basis:**
  - The "Heightened (8th)" rider (emanation now follows the caster, and affects the caster's own higher-rank slots unless a free action is spent each round) has no 5e textual basis — 5e provided no scaling text for this spell at all.
  - Traditions: 5e classes (Sorcerer/Warlock/Wizard) mapped to PF2e traditions arcane + occult — a systemic translation, not new mechanical content, but worth noting the specific class-to-tradition mapping choice (occult chosen alongside arcane, not primal or divine).

## Converter's notes

**Anchor:** "Dispel Magic (rank 1) — counteract check pattern; Thaumaturgic Inhibition applies a passive counteract-adjacent effect without resolving as a full counteract"

**Archetype:** control/debuff (anti-magic field)

**Balance bullets:**
- "Paired with Thaumaturgic Obstruction at rank 6: Inhibition reduces the power of spells cast in the zone; Obstruction increases the action cost. Using both simultaneously would be extremely oppressive — GM should treat as a deliberate power-level choice."
- "The check-vs-DC mechanic (spellcaster's key attribute vs caster's spell DC) is a novel use of skill-check-like resolution in PF2e; it's not a standard mechanic — closest is the counteract check, but counteract applies to the whole spell, not just its power level."
- "Downcasting to minimum rank is a powerful effect against high-rank enemy casters but trivially avoids affecting low-rank utility spells."
- "Non-sustained 1-minute duration differentiates it from Obstruction (sustained) — Inhibition is a fixed-zone trip-wire, not a moving field."
- "60-foot fixed-point emanation prevents trivial abuse of stacking with movement."

**Overridable:**
- "The attribute-check-vs-spell-DC mechanic has no PF2e precedent; could be replaced with 'creatures in the zone must succeed at a DC [caster's spell DC] flat check when casting a spell or it is reduced to minimum rank' — removes the key-attribute dependency."
- "Could require concentration/sustained to match Obstruction's cost, removing the free-zone advantage."
- "The −1-per-die damage penalty is unusual in PF2e; could replace with a flat damage reduction (e.g., −4 to spell damage rolls) for cleaner math."

**Checklist failures:** none listed.

## Similar official spells

- **Thaumaturgic Obstruction** (rank 6, this dossier's sibling spell) — same source spell pair, action-economy debuff instead of power debuff; explicitly designed as a matched set per the converter's own notes.
- **Antimagic Field** (rank 8) — `apps/codex/.../spells/rank-8/antimagic-field.json`. The nearest official zone-based anti-magic effect: 10-foot emanation, sustained, total spellcasting shutdown ("no one inside can cast spells... including yourself") — two ranks higher and categorically stronger (total suppression vs. Inhibition's partial downcast-and-weaken), also has a smaller radius (10 ft vs. Inhibition's 60 ft) and affects the caster too (Inhibition explicitly exempts the caster).
- **Slow** (rank 3) — `apps/codex/.../spells/rank-3/slow.json`. Fortitude save, four-degree slowed condition — cited by the converter for the Obstruction sibling's action-economy angle; listed here for comparison of a rank-3 single-target action-tax vs. Inhibition's rank-6 zone-wide power-tax.
- **Dispel Magic** (rank 2) — `apps/codex/.../spells/rank-2/dispel-magic.json`. The converter's own cited anchor for the counteract-check pattern; a single-target/effect counteract rather than a standing zone.

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **Defense field is null despite a check mechanic existing**: the spell's core effect (attribute check vs. spell DC) is not represented in `system.defense` at all, since PF2e's structured defense field only models saves/attack rolls, not arbitrary attribute checks. The mechanic is entirely prose-only.
- **Heightening entry is non-mechanical for a "damage bump" adapter but is itself a real mechanical change** (moves with caster + affects own higher-rank slots) — flagged by the adapter as non-parseable, correctly, but worth the reviewer's attention since it's not merely flavor text; it materially changes what the level-8 version of the spell does (self-affecting) versus the base version (explicitly excludes the caster).
- No `trap`-style trait drop or material-component drop issue on this spell (jmnario's conversion also shows no cost/material for it).
- **School trait**: jmnario's intermediate conversion lists `abjuration` as a trait; the canonical store's traits (`antillurgy, concentrate, manipulate`) do not include `abjuration`. Since revisions.md shows 0 deviations for this spell, this is adapter policy (antillurgy is a custom homebrew school, not mapped to the official `abjuration` trait), not a hand edit. Same pattern on the sibling spell Thaumaturgic Obstruction.
