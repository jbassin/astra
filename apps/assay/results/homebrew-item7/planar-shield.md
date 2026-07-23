# Planar Shield

## Header block

- **Rank:** 2
- **Routing:** quantitative
- **Pool reason:** reclassified-out
- **Current assay line:** verdict **-0.85 ranks COLD**; residual **-0.85 ranks** (no comparable range given for this spell in the chunk-10 data)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "mixed '+N' and fixed-rank heightening triggers on the same spell — Foundry heightening is one shape per spell, not structurally represented (kept as a description appendix only)"
- **Traits:** concentrate, light, manipulate, planara, vitality (rarity: common)
- **Traditions:** arcane, divine, occult
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** self
- **Target:** you
- **Area:** none
- **Defense:** `system.defense = null` (no save on the triggered burst)
- **Duration:** not sustained, "until expended (up to 1 hour)"
- **Damage:** 2d6 vitality (single damage entry, index `0`)
- **Seeded from:** convertedName "Planar Shield" / originalName "Planar Shield" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 2nd
- **School:** Planara (homebrew school)
- **Casting time:** 1 action
- **Range:** Point, self
- **Components:** S (no verbal, no material)
- **Duration:** 1 hour, no concentration
- **Classes:** Ranger, Seeker (SW), Warlock, Wizard
- **Ritual:** No

> You manifest the phlogiston from between planes as a protective layer on your shield. As a reaction to a melee attack, you may cause some of the phlostigon on your shield to burst, causing all creatures within 5 feet of you to take 2d6 radiant damage. You may do this four times before you've expended all of the phlostigon and the spell ends.

**At Higher Levels:** When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d6 for each slot level above 2nd.

## The conversion (canonical store)

You condense raw phlogiston — the luminous substance between planes — onto your shield or held weapon, forming a flickering shell of planar light. The spell stores 4 charges. While this spell is active, you can expend a charge as a reaction (trigger: you are hit by a melee attack while holding your shield or the weapon you imbued) to release a burst of phlogiston that scorches attackers and nearby foes.

When you expend a charge in this way, each creature within 5 feet of you (including the attacker) takes 2d6 vitality damage with no save. This is not a spell attack — it is an automatic burst. When all 4 charges are expended, the spell ends.

---

**Heightened (+1)** The damage per charge increases by 1d6 (for example, at rank 3 each burst deals 3d6 vitality damage).
**Heightened (5th)** The number of charges increases to 6.

No structured-field disagreements found — the 4-charge economy, 5-foot burst radius, and 2d6 vitality damage all match between prose and structured `system.damage`. Note the store's `system.duration.value` string ("until expended (up to 1 hour)") duplicates information that is also only prose-described (the 4-charge cap), consistent across both.

## What changed, plain English

The phlogiston-shield-burst fiction, the reaction trigger (hit by a melee attack while holding the imbued shield/weapon), the 4-charge economy, the 5-foot burst radius, and the no-save automatic-hit design are all preserved.

- **Numbers:** damage type changes from 5e radiant to PF2e vitality (2d6 unchanged in magnitude). Reach/trigger unchanged (5-foot radius, melee-attack-hit trigger). Duration changes from 5e's flat "1 hour, no concentration" to PF2e's "until expended (up to 1 hour)" — functionally the same cap, phrased around the charge economy instead of a pure clock.
- **Structure:** 5e's plain reaction becomes PF2e's reaction with an explicit **Trigger** requirement folded into the description text rather than a structured trigger line (see Open flags). Heightening structure changes shape entirely: 5e scales via "cast at a higher slot → +1d6 per slot level" (a single linear +1d6/level rule); the store instead splits this into two separate heighten triggers — a `+1` interval rule (+1d6 per rank to each charge's damage) *and* a fixed-rank `5th` trigger (charges 4→6) that has no 5e counterpart at all.
- **Content added:** the charge-count-doubling at 5th rank ("The number of charges increases to 6") is new — it does not exist anywhere in the 5e original, which only ever scales per-charge damage, never the charge count itself.
- **Cast expansion:** the weapon-imbuing option ("your shield **or held weapon**") is broader than 5e's shield-only text ("onto your shield"); the store lets the spell be imbued into any held weapon, not just a shield.
- **No material/verbal components:** 5e had only a Somatic component (no V, no M); the store's `system.cost.value` is empty and consistent with that (nothing dropped here).

## Converter's notes

**Anchor:** "no clean analog — closest is Shield (cantrip, reaction to intercept an attack) + Flaming Sphere (rank 2, fire burst); Planar Shield is a charge-based reactive AoE"

**Archetype:** reactive damage / defensive (charge-based)

**Balance bullets:**
- "No save on the burst: justified by (1) reaction trigger limits uses to 4 total per casting, (2) 5-foot radius hits very few targets on average, (3) reaction cost means the caster can't also do other reactions that turn."
- "4 charges × 2d6 vitality = 8d6 total output per casting (average 28). At rank 2, limited-use AoE is 4d6 (14) per 2-action cast. The charge-spread over multiple reactions makes the total output comparable to two full 2-action casts, which is reasonable for a spell that requires melee danger."
- "Vitality (radiant→vitality mapping) preserves the anti-undead niche. Traditions (arcane/divine/occult) exclude primal as interplanar phlogiston is not nature-coded."
- "+1d6 per rank heightening is slower than the AoE norm (+2d6) because each burst still hits without a save."
- "1-hour until-expended duration is the exploration-tier equivalent of the 5e non-concentration permanent-until-used duration."

**Overridable:**
- "Could add a basic Reflex save to the burst to align with standard PF2e burst damage conventions — this would then justify starting at 4d6 (matching rank-2 basic-save AoE) rather than 2d6."
- "Could reduce charges to 3 to tighten the total output if the no-save auto-hit feels too powerful."

**Checklist failures:** none.

## Similar official spells

- **Pyrefowl Rebuke** (rank 2) — reaction, trigger "a creature within 10 feet of you Strikes and deals damage to you," 1d6 fire damage **with** a basic Reflex save, plus a fly-away rider. Same rank, same reactive-retaliation-damage design, but single-use (not charge-based) and roughly a third of Planar Shield's per-trigger damage while also requiring a save.
- **Blood Vendetta** (rank 2) — reaction, trigger "a creature deals piercing/slashing/persistent-bleed damage to you," 2d6 persistent bleed with a Will save (half on success, none on crit success). Same rank and reactive-retaliation shape; damage magnitude matches Planar Shield's 2d6 per trigger but is persistent/save-gated rather than instant/no-save, and is single-use per cast (no charge pool).
- **Fire Shield** (rank 4) — a sustained self-buff that grants Shield Block + resistance and deals fire damage back to melee attackers; two ranks above Planar Shield, useful as an upper reference point for what an "always-on retaliatory shield" costs when it isn't capped by a burn-down charge pool.

## Prior astra touches

None found — no `planar-shield` entries in `revisions.md` (matches the fresh baseline re-conversion exactly).

## Open flags

- Assay verdict is **-0.85 ranks COLD**, quantitatively routed, and its pool reason is "reclassified-out" (i.e., pulled out of automatic quantitative-only handling into the manual-review pool) — the routing/pool-reason pairing itself is worth noting since "quantitative" + "reclassified-out" is a distinct combination from the other spells in this chunk.
- The reaction has no dedicated **Trigger** line separate from the general description prose — the trigger condition ("you are hit by a melee attack while holding your shield or the weapon you imbued") is embedded mid-paragraph rather than called out as a standalone Trigger statement the way official PF2e reaction spells format it (e.g., Pyrefowl Rebuke's dedicated "**Trigger** A creature within 10 feet of you Strikes and deals damage to you.").
- Heightening mixes an interval trigger (`+1`) with a fixed-rank trigger (`5th`) on the same spell, per the adapter warning — not structurally representable in the current Foundry heightening schema, so `system.heightening` is entirely absent and both rules live only in the description prose appendix.
- The 5e original had no Verbal component (S only); this carries through cleanly, but the "single damage type radiant→vitality" swap and the shield→shield-or-weapon broadening are both unflagged in `changedElements` beyond the tradition/damage-type note — the weapon-imbuing expansion in particular isn't called out anywhere in jmnario's notes.
