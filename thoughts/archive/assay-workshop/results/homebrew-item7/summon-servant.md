# Summon Servant

## Header block

- **Rank:** 1 (store `system.level.value` = 1)
- **Routing:** ledger:summon
- **Pool reason:** ledger
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, planara, summon
- **Traditions:** arcane, occult
- **Cast:** 3 actions (`time.value` = "3")
- **Range:** 30 feet
- **Targets:** (none — `target.value` = "")
- **Defense:** none (`system.defense` = null)
- **Duration:** 1 minute, sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 1
- **School:** planara
- **Casting time:** 1 action
- **Range:** 30 feet
- **Components:** V, S, M (a small metal tuning fork)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Ranger (PHB), Seeker (SW), Warlock (PHB), Wizard (PHB)

> You summon and bind a tiny, extraplanar spirit to your service. The spirit enters battle immediately after you in the initiative order, and can only take the Attack and Dash actions. You can direct the spirit as a free action on your turn, and it will carry out your orders to the best of its ability. You choose the general appearance of the spirit, but it must be the size dictated by the spell slot expended.
>
> The summoned spirit has a Constitution of 10, Intelligence and Wisdom 3, Charisma 1, and deals force damage. Other characteristics are determined by the spirit's size as follows.

| Size | HP | AC | Attack | Str | Dex | Spell Slot |
|---|---|---|---|---|---|---|
| Tiny | 15 | 12 | +3 to hit, 1d4+4 dmg | 4 | 16 | 1st |
| Small | 25 | 13 | +4 to hit, 1d8+2 dmg | 6 | 14 | 2nd |
| Medium | 40 | 14 | +5 to hit, 2d6+1 dmg | 10 | 12 | 3rd |
| Large | 50 | 15 | +6 to hit, 2d10+2 dmg | 14 | 10 | 4th |
| Huge | 80 | 16 | +8 to hit, 2d12+4 dmg | 18 | 8 | 5th |
| Gargantuan | 100 | 17 | +10 to hit, 4d8+6 dmg | 20 | 6 | 6th |

**At Higher Levels:** Casting this spell using higher level spell slots allows you to increase the size of the summoned spirit, as shown on the table.

## The conversion (canonical store)

> You strike a small metal tuning fork and bind a flicker of extraplanar spirit to your service. You summon a level −1 creature with the construct trait to an unoccupied space within range. The summoned servant acts on your initiative count, and you direct it as part of Sustaining the spell. Replace any physical damage on the chosen stat block's Strikes with force damage to represent the spirit's incorporeal nature. The servant lacks free will and follows only the Attack and Stride orders you give it.
>
> ---
> **Heightened (2nd)** The summoned spirit can be a level 1 creature.
> **Heightened (3rd)** Level 2 creature.
> **Heightened (4th)** Level 3 creature.
> **Heightened (5th)** Level 5 creature.
> **Heightened (6th)** Level 7 creature.
> **Heightened (7th)** Level 9 creature.
> **Heightened (8th)** Level 11 creature.
> **Heightened (9th)** Level 13 creature.
> **Heightened (10th)** Level 15 creature.

Structured fields: `system.damage` = `{}` (correct — the summoned creature carries its own stat block/damage, not the spell). `system.heightening` = `{type: "fixed", levels: {"2":{}, "3":{}, ..., "10":{}}}` — all nine level entries are empty objects; the creature-level progression exists only in prose, per the adapter warning.

## What changed, plain English

The spirit-summon fiction, the tuning-fork flavor, and the "deals force damage" rule carry over. The mechanical resolution method is completely rebuilt.

- **Resolution method — the biggest change:** 5e gives a bespoke stat block (HP/AC/Str/Dex/attack bonus by size) directly in the spell text. PF2e drops this entirely and instead references PF2e's generic "summon a level N creature with the [trait] trait" convention, leaving stat-block selection to the GM at the table. This is a wholesale structural replacement, not a numbers translation — none of the specific 5e numbers (15 HP, AC 12, +3 to hit, etc.) survive anywhere in the conversion.
- **Trait swap:** 5e's spirit has no stated creature trait; PF2e assigns it the "construct" trait specifically (needed to anchor to PF2e's Summon Construct convention — see Converter's notes).
- **Size → level mapping:** 5e scales the spirit by physical SIZE category (Tiny→Gargantuan) tied to slot level (1st–6th slot). PF2e instead scales by creature LEVEL (−1 through 15) tied to spell RANK (1st–10th rank) — sizes and levels aren't the same axis, so this is a re-derivation, not a like-for-like translation. Notably 5e's original upcast range only goes to 6th-level slots (Gargantuan); PF2e extends the heighten chart all the way to 10th rank (level 15 creature), covering 4 additional heighten steps with no 5e basis.
- **Action economy:** 5e 1 action → PF2e 3 actions (the PF2e "summon spell" convention).
- **Directing the creature:** 5e "free action on your turn" → PF2e "you direct it as part of Sustaining the spell" (folded into the sustain-action economy rather than a separate free action).
- **Action repertoire:** 5e "Attack and Dash" → PF2e "Attack and Stride" (direct terminology translation, same restriction).
- **Material component dropped:** 5e's material "a small metal tuning fork" only ever appears as descriptive prose in both the jmnario conversion and the store — no version of this spell (jmnario's or the store's) has ever carried a structured `cost` value for it; jmnario's own `cost` field is `null`. Nothing was dropped between jmnario and the store here — the material never had structured representation.

## Converter's notes

- **Anchor:** "Summon Construct (rank 1) — level −1 creature, 3-action, sustained up to 1 min"
- **Archetype:** summon
- **Balance bullets:**
  - "Anchored to Summon Construct at rank 1: 3 actions, sustained up to 1 min, 30 ft, level −1 creature."
  - "Heightening uses the canonical summon table (creature level ≈ 2×rank−3 for ranks 1–4; 2×rank−5 for 5–10)."
  - "Force-damage substitution preserves the 5e 'spirit deals force damage' rule and gives the spell a small but distinct niche — force is rarely resisted."
  - "Bound-spirit fiction (the tuning-fork material) is fully preserved; the GM picks a level-appropriate construct stat block, swapping physical damage to force."
  - "Cast time bumped from 5e's 1 action to PF2e's standard 3-action summon cost — non-negotiable per the skill's summon template."
- **Overridable:** "Could be locked to a specific stat block (e.g., 'always uses Summon Construct's animated armor') rather than 'GM picks level-appropriate' — more rules-tight, less flexible." / "Force-damage substitution could be replaced with the chosen creature's natural damage type if you want simpler bookkeeping."
- **Checklist failures:** none recorded.

## Similar official spells

- **Summon Construct** (rank 1) — the converter's own anchor and a near-exact structural match: 3 actions, level −1 construct, sustained up to 1 minute, single-sentence "summon a creature with [trait] and level [N]" template. This is the spell the conversion is directly modeled on.
- **Summon Animal** (rank 1) — same structural template, different trait (animal); confirms the generic-summon convention is applied consistently across the official line.
- **Summon Elemental** (rank 2) — one rank up, level 1 (not −1) creature; shows the official rank-to-level step size for comparison against Servant's rank 2 → level 1 heighten step (identical at this point).
- **Summon Fey** (rank 1) — another same-rank/same-template official summon, for breadth of comparison.

## Prior astra touches

Checked `apps/assay/homebrew/revisions.md`: **no entry** for "Summon Servant" — 0 deviations from a fresh re-conversion of the vendored baseline (store matches adapter output exactly, no hand edits recorded). The trait set (`concentrate, manipulate, planara, summon`) adds the custom "planara" school-trait tag (mapped from the 5e school field) on top of jmnario's traits — baked into the current adapter, consistent with the repo-wide trait-hygiene/school-traits sweep.

## Open flags

- The converter's own stated heighten formula ("creature level ≈ 2×rank−3 for ranks 1–4; 2×rank−5 for 5–10") does not exactly reproduce the actual heighten values in the store. Checking the real progression (rank→level): 1→−1, 2→1, 3→2, 4→3, 5→5, 6→7, 7→9, 8→11, 9→13, 10→15 — the "2×rank−3" formula only matches ranks 1–2 (rank 3 would predict level 3, actual is 2; rank 4 would predict level 5, actual is 3). The "2×rank−5" formula for ranks 5–10 DOES match exactly. This is a documentation-accuracy note about the converter's own commentary, not about the store's actual values (which read as a coherent, monotonic progression regardless of the imprecise formula describing them).
- `system.heightening.levels` holds nine empty objects — none of the nine level-by-level creature-level values are structurally represented; they exist only as free text across nine separate `<p><strong>Heightened (Nth)</strong>...` lines in the description.
- No material-component residue, no residual 5e condition names, no curse/affliction text, no reaction trigger — clean on those axes. This spell's material was never structurally represented at any stage (jmnario's `cost` was already `null`), so there is nothing to compare a "drop" against here (contrast with Shape Modify: Severity and Sphere of Ruin, where a structured cost WAS dropped between jmnario and the store).
- Traits include the custom homebrew school-trait tag "planara" (mapped from the 5e school field), which has no counterpart in the standard PF2e trait taxonomy.
