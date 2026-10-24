# Rewind and Playback

## Header block

- **Rank:** 3 (store `system.level.value = 3`)
- **Routing:** `ledger:utility` — **pool reason:** ledger
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: null`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** chronomancy, concentrate, healing, manipulate, void
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** touch
- **Targets:** 1 willing living creature other than yourself
- **Defense:** none (`system.defense = null`)
- **Duration:** none set (`system.duration.value = ""`, not sustained) — instantaneous by omission
- **Heightening:** none structurally recorded (see Open flags — no `system.heightening` key at all, same gap as Retributive Force)

## The 5e original

- **Name:** Rewind and Playback (source: `tfc`)
- **Level:** 3rd
- **School:** chronomancy
- **Casting time:** 1 action
- **Range:** touch
- **Components:** V, S (no M)
- **Duration:** instantaneous
- **Classes:** Bard, Druid, Wizard

**Entries:**

> You lay your hands on one willing creature and rewind past wounds, playing them back onto yourself instead. Choose a number of hit points to heal on the target. For every 6 points of damage you heal on the affected creature (rounded up to the nearest multiple of 6), you take 1d6 necrotic damage. This damage can't be reduced by resistance, immunity, or any other means as you're absorbing it, but once you've taken the damage, it can be healed normally. A target creature can't heal more than 60 hit points from one casting of this spell.

No `entriesHigherLevel` in the 5e original (no upcast text) — the 5e version has a flat 60-HP ceiling with no stated way to raise it via higher slots.

## The conversion (canonical store)

> You reach through time and pull a creature's wounds backward, rewinding the damage into the past and redirecting it through yourself as a conduit. The target regains up to 3d8+24 Hit Points (your choice of how many to restore, up to the maximum). You then take void damage equal to the number of Hit Points restored; this damage cannot be reduced by any means, but it can be healed normally after you take it.
>
> This spell cannot restore more than 3d8+24 Hit Points per casting. The damage you take is not subject to resistances, immunities, or damage reduction.
>
> **Heightened (+1)** The maximum healing increases by 1d8+8.

No `@UUID[...]` links in this description. Structured fields agree with the prose: `duration.value` empty matches instantaneous framing; `target.value` matches "1 willing living creature other than yourself"; no `heightening` structured block exists at all despite the "Heightened (+1)" text in prose (see Open flags).

## What changed, plain English

The self-sacrifice fiction (heal the target, take equivalent unmitigated damage yourself, heal that damage normally afterward) survives intact, but the healing-to-damage *ratio* and the cap mechanism were both rebuilt around PF2e's Heal-spell math rather than 5e's flat numbers:

- **Numbers — healing cap:** 5e caps healing at a flat **60 HP** per casting, with the caster taking necrotic damage at a rate of **1d6 per 6 HP healed** (rounded up) — i.e., a healer who restores the full 60 HP takes 10d6 necrotic (average ~35). The conversion instead caps healing at **3d8+24** (average ~37.5) and has the caster take **void damage equal to the exact number of HP restored, 1:1** — no die-per-6-HP conversion, just a direct point-for-point damage transfer. Both land at a similar *average* total (5e ~35 necrotic for max healing vs. PF2e ~37.5 void for max healing), but the underlying math is structurally different: 5e used a stepped die-per-increment conversion, PF2e uses flat 1:1 transfer with the healing itself expressed as dice (matching the rank-3 Heal 2-action benchmark per the converter's own anchor note).
- **Numbers — healing ceiling shape:** 5e's ceiling is a **flat 60**, independent of caster level/rank beyond "you cast this spell" (no upcast scaling shown at all in the source). The conversion's ceiling is **dice-based (3d8+24)** and does scale via the heighten (+1) tier (+1d8+8 max healing per heighten step) — a genuine new scaling axis the 5e original didn't have (the 5e original has zero `entriesHigherLevel` content).
- **Damage type:** 5e necrotic → PF2e **void** (stated Remaster equivalency mapping).
- **Action cost:** identical, 1 action (5e) → the conversion still lists 2 actions in the store (`system.time.value = "2"`) despite the 5e original being a 1-action spell — this is the standard-ish PF2e 2-action baseline for a touch spell rather than a literal 1-for-1 mapping.
- **Content added:** two new traits not implied by a literal reading of the 5e text — `healing` (mechanically necessary in PF2e to flag the spell as a healing effect) and `void` (flags the self-damage type). Traditions also changed: 5e Bard/Druid/Wizard → PF2e arcane + occult, explicitly **excluding primal** despite Druid being a 5e source class — the converter's own notes explain this ("primal excluded because void is not a primal essence").
- **Nothing dropped** from the core mechanic; the "damage cannot be reduced... but can be healed normally afterward" clause survives near-verbatim in both.

## Converter's notes

- **Anchor:** "no clean analog — designed from rank-3 Heal template (3d8+24 for 2-action touch/30-ft). This spell matches the 2-action touch Heal variant with self-damage as the cost."
- **Archetype:** healing (self-sacrifice transfer)
- **Balance bullets:**
  - "Healing output (3d8+24 avg ≈37.5) matches the rank-3 Heal 2-action benchmark exactly — the self-sacrifice (caster takes equal void damage) is the pricing mechanism."
  - "The self-damage is void-typed and irresistible — stronger than normal damage because it cannot be reduced, but it CAN be healed afterward, so the caster isn't permanently injured."
  - "Unlike standard Heal, this spell targets only living creatures and requires touch range — appropriate for a sympathetic time-reversal effect."
  - "No clean analog flag: the self-damage-for-ally-healing pattern exists in 5e (this spell) but not in PF2e's core; the closest is the Sanguinist archetype. Logged as no clean analog per plan."
- **Overridable:**
  - "The self-damage could be set to a fixed amount (e.g., equal to half the healing granted) rather than 1:1 to make the risk calculation more player-friendly."
  - "Could be restructured as a 3-action spell (touch + mental concentration) to align with the heavy cost of self-damaging healing."
- **Checklist failures:** none listed.

## Similar official spells

- **Heal** (rank 1, heightenable) — the converter's own named anchor. Its 2-action, touch-range-extended-to-30-ft variant heals 1d8+8 at base rank, scaling +1d8 (+8 to the 2-action bonus) per heighten; at rank 3 (two heighten steps above 1st) this works out to exactly 3d8+24 — the same number Rewind and Playback caps at. Comparison axis: Rewind and Playback pays for the *exact* Heal rank-3 benchmark output entirely via self-damage rather than spell-slot rank alone, i.e., it's "Heal, but you personally foot the HP bill instead of the spell."
- **Share Life** (rank 2) — forges a link where the target takes half damage from all incoming Hit Point damage and the caster takes the other half, unresisted, until the link ends (30-ft range cap) or either party hits 0 HP. Comparison axis: the closest official example of "caster absorbs another creature's Hit Point loss, unmitigated" — but Share Life is an ongoing damage-splitting *link* against future incoming damage, not a one-time retroactive heal-by-self-sacrifice; useful for judging the going rate of "caster eats unmitigated damage on someone else's behalf" as a rank-2 mechanic versus this spell's rank-3, one-shot version.

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly.

## Open flags

- **No structured `heightening` field** in the store JSON at all (`system.heightening` key is absent), despite the description containing a "Heightened (+1)" clause. Same gap pattern seen on Retributive Force in this same batch — contrast with the sibling spells that do carry a `system.heightening.type`/`.levels` block even when empty.
- Traditions explicitly exclude primal despite the 5e class list including Druid — a deliberate converter choice (documented in the converter's own notes: "primal excluded because void is not a primal essence"), included here as a factual note on a source-class-vs-tradition mismatch, not a recommendation.
- No `@UUID[...]` compendium links anywhere in this description.
