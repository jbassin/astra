# Planar Pyre

## Header block

- **Rank:** 3
- **Routing:** hybrid
- **Pool reason:** wide-range
- **Current assay line:** verdict **-0.68 ranks COLD**; comparables rank range **1-8** (flagged LOW-INFORMATION — this is why it sits in the manual pool); residual **-0.68 ranks**
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, fire, manipulate, planara (rarity: common)
- **Traditions:** arcane, occult, primal
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** 60 feet
- **Target:** 1 creature or object
- **Area:** none (`system.area = null`)
- **Defense:** basic Reflex save
- **Duration:** instantaneous (`system.duration.value = ""`, `sustained: false`)
- **Damage:** 3d8 fire + 3d8 piercing (two separate damage entries, index `0` and `1`)
- **Seeded from:** convertedName "Planar Pyre" / originalName "Planar Pyre" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 3rd
- **School:** Planara (homebrew school)
- **Casting time:** 1 action
- **Range:** Point, 60 feet
- **Components:** V, S, M (a small, sharpened quartz)
- **Duration:** Instantaneous
- **Classes:** Ranger, Seeker (SW), Warlock, Wizard
- **Ritual:** No

> You call forth shards of planar crystal coated in phlostigon from the ground around a target of your choosing. The target must make a Dexterity saving throw. Creatures that are Huge or larger make this saving throw with advantage. If they fail, the target is impaled by the spikes and restrained until the start of your next turn, taking 2d8 fire damage and 3d8 piercing damage. If the target succeeds, they take half as much damage and are not restrained. The spikes fade into dust at the start of your next turn. If the target is slain by this spell, the spikes do not fade, but instead remain and become mundane objects.

**At Higher Levels:** When you cast this spell using a spell slot of 4th level or higher, the fire damage or the piercing damage (your choice) increases by 1d8 per slot level above 3rd.

## The conversion (canonical store)

You call forth shards of planar crystal coated in phlogiston from the ground around a target of your choosing. Crystalline spikes erupt upward, impaling the target. The target takes 3d8 fire damage and 3d8 piercing damage on a failed basic Reflex save.

On a failure, the target is also `Restrained` (`Grabbed` and `Immobilized`) until the start of your next turn by the crystalline spikes. Huge or larger creatures treat the result of their saving throw one degree of success better (they are harder to impale). *(`Restrained`, `Grabbed`, `Immobilized` are `@UUID[Compendium.pf2e.conditionitems.Item...]` links to the condition items.)*

If the target is slain by this spell, the spikes do not fade — they remain as mundane crystalline shards.

**Critical Success** The target is unaffected.
**Success** The target takes half damage and is not restrained.
**Failure** The target takes full damage and is `Restrained` until the start of your next turn.
**Critical Failure** The target takes double damage and is `Restrained` until the start of your next turn.

---

**Heightened (+1)** Both the fire damage and the piercing damage each increase by 1d8.

No structured-field disagreements found — damage entries (3d8 fire, 3d8 piercing), the basic-Reflex defense, and the degree-of-success prose all line up.

## What changed, plain English

The planar-crystal-impaling fiction, the dual fire+piercing damage split, the restrained rider, the Huge-or-larger advantage, and the "spikes remain as mundane objects if the target is slain" flourish are all preserved.

- **Numbers:** 5e's fixed 2d8 fire + 3d8 piercing (12.25 avg on fail, restrained regardless of success/fail in 5e's own text... actually 5e ties restrained to the fail branch too) becomes a symmetric 3d8 fire + 3d8 piercing (27 avg on fail) in the store — the fire die was bumped up to match the piercing die, and both dice types heighten identically (+1d8 each per rank) rather than 5e's "choose one damage type to bump" upcast rule.
- **Structure:** 5e's Dexterity save becomes PF2e basic Reflex (direct organ mapping for a dodgeable area/physical effect). 5e's binary pass/fail becomes full four-degree PF2e structure (crit success = unaffected, success = half damage/no restrain, failure = full damage/restrained, critical failure = double damage/restrained) — PF2e's crit-failure "double damage" tier has no 5e counterpart since 5e has no critical-failure-on-saves concept.
- **Condition mapping:** 5e's single "restrained" condition becomes PF2e's compound Restrained (which itself folds in Grabbed + Immobilized) — a like-for-like PF2e condition-stack translation, not a buff.
- **Rider-timing tightened:** 5e restrains the target "if they fail" (i.e., on any failure including presumably crit fail, since 5e has no crit-fail tier) with no explicit "restrained only on failure, not on a plain fail-adjacent success" carve-out; the store explicitly excludes restrained from the success tier ("takes half damage and is not restrained"), a PF2e-convention rider placement.
- **Content dropped:** the 5e detail that the crystal spikes "fade into dust at the start of your next turn" (when the target is *not* slain) is dropped from the store's prose — the store only states the shards remain as mundane objects when the target *is* slain; what happens to the spikes on a normal miss/hit-but-alive outcome is left unstated.
- **Material component:** the 5e "M (a small, sharpened quartz)" component is dropped; `system.cost.value` is empty in the store.

## Converter's notes

**Anchor:** "Vampiric Feast (rank 3, basic Fortitude, 6d6 void single-target) — Planar Pyre is a dual-damage single-target basic Reflex at same rank"

**Archetype:** single-target damage with control rider (save)

**Balance bullets:**
- "Dual damage type (3d8 fire + 3d8 piercing = 27 avg on fail) vs rank-3 single-target basic-save budget of ~21 (6d6). The 6-point overage is offset by: (1) Dex/Reflex save is not the most penalized save, (2) restrained rider only on fail (not crit fail), which costs ~2 rows of budget reduction — so effective budget is 21 + restrained-rider cost ≈ 27-30 range, which is within 1 row of the table."
- "Huge-or-larger advantage (treated as one degree better) is a correct balance lever — large creatures are much harder to impale on crystal spikes."
- "The 'mundane spike remains' narrative hook (if target dies) is flavorful and mechanically inert — zero power cost."
- "Heightening +1d8 each (fire and piercing) per rank equals +2d8 total per rank, which is the canonical single-target-save rate (+1d8 per rank for basic save, doubled because dual-type)."

**Overridable:**
- "The restrained rider could be moved to crit fail only (rather than any failure) to bring damage back in line with the standard 6d6 budget without the 2-row reduction."
- "The fire and piercing damage could be unified into a single pool (e.g., 6d8 all) if dual-type tracking feels fiddly at the table."

**Checklist failures:** none.

## Similar official spells

- **Cave Fangs** (rank 3) — 6d6 piercing, basic Reflex, area effect, difficult-terrain rider (no restrain/grab). Same rank, same damage-type family (piercing), similar total die count (6d6 ≈ 21 avg vs Planar Pyre's 6d8 = 27 avg across two damage types), useful single-damage-type baseline for the budget math in the converter's own anchor note.
- **Vampiric Feast** (rank 3) — 6d6 void, basic Fortitude, single target, no rider besides temp HP for the caster. The converter's own stated anchor; directly confirms the "~21 avg = rank-3 single-target basic-save budget" baseline the balance bullets cite.
- **Grasping Earth** (rank 4) — Fortitude save, area effect, grabs/restrains and then deals ongoing bludgeoning damage to grabbed/restrained creatures each sustain; one rank above Planar Pyre, shows what a restrain-centric (rather than damage-centric) spell looks like when restrain is the primary payload rather than a rider.

## Prior astra touches

None found — no `planar-pyre` entries in `revisions.md` (matches the fresh baseline re-conversion exactly).

## Open flags

- Assay verdict flags this spell **-0.68 ranks COLD** with comparables spanning rank 1-8 — explicitly called LOW-INFORMATION in the triage data, meaning the automated comparable set for this spell was too rank-dispersed to trust as a quantitative signal.
- The 5e "spikes fade into dust at the start of your next turn" detail (for the non-lethal outcome) has no counterpart in the store prose — only the lethal-outcome flourish ("spikes remain as mundane objects") survived the conversion; whether the spikes are supposed to disappear, remain as terrain, or something else on a normal fail/success is unstated in the current store text.
- Heightening is text-only (description appendix), not structurally represented in `system.heightening`, per the adapter warning — no `heightening` key exists on this spell's JSON.
