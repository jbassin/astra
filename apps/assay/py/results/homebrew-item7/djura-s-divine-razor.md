# Djura's Divine Razor

## Header block

- **Rank:** 5
- **Routing:** quantitative
- **Pool reason:** reclassified-out
- **Current assay line:** verdict −3.15 ranks COLD, residual −3.15 ranks
- **Adapter warnings (flags.assay.adapterWarnings):** none (empty array)
- **Traits:** concentrate, curse, force, kosmoturgy, manipulate (rarity: common)
- **Traditions:** divine
- **Cast:** 1 action
- **Range:** touch
- **Target:** 1 melee weapon you are wielding
- **Defense:** none
- **Duration:** 1 minute (not sustained; `duration.sustained=false`)
- **Structured damage:** `formula "3d10", type "force"` (initial-hit bonus damage only — see What Changed and Open Flags for the per-hit curse damage, which is not in this field)
- **Structured heightening:** `type "interval", interval 1, damage.0 "1d10"` (initial-hit bonus damage growth only)

## The 5e original

- **Level:** 5
- **School:** kosmoturgy
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V, S, M (a martial melee weapon)
- **Duration:** 1 minute (not concentration)
- **Classes:** Cleric, Paladin

> You sharpen your blade to cut through the fabric of reality itself. The first time you hit with a melee weapon attack during this turn, your attack inflicts an additional 2d10 force damage, and the target becomes afflicted by a malignant curse. Until the spell ends, whenever you take the Attack action, you can choose to attack the cursed creature regardless of distance or obstacles, and these attacks deal an additional 1d10 force damage, ignore cover, and cannot suffer disadvantage.

No `entriesHigherLevel` block in the 5e original.

## The conversion (canonical store)

You whisper a divine edge into your weapon, sharpening it to cut the fabric of reality. The next time you hit a creature with a melee Strike using the infused weapon before this spell ends, you deal an additional 3d10 force damage. That creature is also afflicted by a lingering cosmic curse: for the duration of the spell, whenever you hit the cursed creature with a melee Strike, it takes 2d6 additional force damage (no save). The curse ends when the spell ends or when the creature succeeds at a Will saving throw against your spell DC (it may attempt this save at the end of each of its turns). Only one creature can be cursed at a time; a new hit against a different creature transfers the curse.

**Heightened (+1)** The initial bonus damage increases by 1d10, and the per-hit curse damage increases by 1d6.

No `@UUID[...]` references in this description.

## What changed, plain English

The core "sharpen your weapon, first hit deals bonus force damage and curses the target for repeat bonus damage" shape is preserved, but the curse's reach mechanic, its escape condition, and the initial-hit and per-hit damage numbers all changed.

- **Numbers:** initial bonus damage went from 2d10 (5e) to 3d10 (PF2e) — a 50% increase. Per-hit curse damage went from 1d10 (5e) to 2d6 (PF2e) — roughly unchanged in average (5e avg 5.5 vs PF2e avg 7), a modest increase. Heighten growth: 5e has no scaling text; PF2e adds +1d10 initial / +1d6 curse per rank above 5th.
- **Structure:** 5e's bonus action became PF2e's 1-action cast (the converter notes "PF2e has no 'bonus action' concept," a pure organ-mapping). A **Will saving throw at the end of each of the cursed creature's turns** was added as a way for the target to end the curse early — 5e's curse has **no escape condition at all**; it simply lasts until the spell ends. The converter's notes call this "four-degree interactivity" added on top of the 5e design.
- **Content dropped:** the single biggest content change is the removal of 5e's ranged-reach clause — in 5e, once cursed, "whenever you take the Attack action, you can choose to attack the cursed creature regardless of distance or obstacles, and these attacks deal an additional force damage, **ignore cover, and cannot suffer disadvantage**." This let the caster attack the cursed target from any range/through any obstacle for the rest of the duration. The PF2e conversion drops this entirely — the curse's bonus damage in PF2e only triggers on a normal **melee Strike** against the cursed creature; there is no ranged-reach, no cover-ignoring, and no disadvantage-immunity clause anywhere in the PF2e version.
- **Content added:** the **curse-transfer clause** ("a new hit against a different creature transfers the curse") has no 5e basis — 5e's curse simply persists on its original target with no transfer mechanism described. The **per-turn Will save to end the curse early** also has no 5e basis, as noted above.

## Converter's notes

**Anchor:** Wall of Fire (rank 4, sustained damage rider) — adapted as a 1-action self-buff with a per-hit curse

**Archetype:** buff / single-target curse rider

**balanceBullets:**
- "1-action rank-5 slot is strictly weaker than 2-action; justified because the effect is a self-melee-rider, not a damage spell in its own right"
- "3d10 initial bonus (avg 16.5 force) + 2d6 per-hit curse (avg 7 force) lands in the 'strong crit-hit rider' range for rank 5 — similar power to Polar Ray's drained 2 rider but self-melee-gated"
- "Force damage type pricing 0.80× means nominal dice are slightly generous; acceptable because it's a class-flavor spell with a melee weapon restriction"
- "Per-turn Will save to remove the curse gives the target meaningful agency; the curse typically lasts ~3 rounds before the target breaks free, giving the caster 2–3 bonus hits"

**overridable:**
- "The per-turn Will save to remove the curse could instead be 'end of turn after taking damage from the curse' to make it more dramatic"
- "Focus spell suggestion: Djura's Divine Razor fits the pattern of a Champion or Cleric divine weapon-enhancement focus spell perfectly; flag for the author"

**checklistFailures:** none.

## Similar official spells

- **Envenom Companion (rank 3)** — the first Strike each round that hits with an unarmed piercing/slashing attack deals an extra 1d8 poison damage, with a Fortitude save vs. Clumsy 1 as a rider; targets a companion, not the caster. Two ranks below Divine Razor; compares on the "recurring per-hit bonus damage from a buffed attacker" mechanic.
- **Implement of Destruction (rank 4)** — the target weapon deals an additional 2d6 mental damage the first time it hits an enemy, based on a Will save against the wielder's spell DC. One rank below Divine Razor; compares on "weapon gains a bonus-damage rider tied to a specific enemy," though the mechanism (fear-based, Will-save-gated at cast time) differs from Divine Razor's curse-with-escape-save structure.
- **Bandit's Doom (rank 5)** — wards an item; a creature that takes the item takes 8d8 mental damage and becomes doomed, based on a Will save. Same rank; included as the nearest official same-rank "curse" trait spell, though its trigger (theft) and payload (one-shot mental damage + doomed) are unrelated to Divine Razor's melee-Strike rider.

## Prior astra touches

None found in `revisions.md` — Djura's Divine Razor is not listed among the 52 deviating (hand-edited) spells; the store is byte-faithful to the fresh adapter re-conversion of jmnario's baseline (0 deviations for this spell). Per `homebrew-triage.md` §4a, Divine Razor was one of 5 "weapon/morph" rows **reclassified out** of the pure-damage COLD list (per-Strike/per-round dice measured against a per-cast budget is a scoring-lens artifact, not necessarily a content defect) — this reclassification is a scoring/methodology note, not a store edit.

## Open flags

- `adapterWarnings` is empty for this spell, but the structured `damage` field (`3d10 force`) and `heightening.damage` field (`1d10`) only capture the **initial-hit** bonus damage — the **per-hit curse damage** (2d6 base, +1d6 per heighten) exists only in the description prose and is not represented in any structured field. This is the same kind of structural incompleteness other item-7 spells flag via an adapter warning, but no warning is present here.
- The spell has the `curse` trait and ends via a Will save the cursed creature can attempt each turn, rather than via the standing PF2e curse-removal convention (counteract check vs. the spell's rank) — there is no counteract-based removal path mentioned anywhere in the description.
- 5e's ranged-reach/ignore-cover/no-disadvantage clause for attacking the cursed creature was dropped without an adapter warning or a `changedElements` bullet in jmnario's own conversion notes explicitly calling out the cover/disadvantage-immunity loss (the notes mention the melee-Strike-only restriction generally but do not itemize the ignore-cover and no-disadvantage clauses as dropped).
- This spell carries an assay verdict (−3.15 ranks COLD) despite `routing: quantitative` and `pool reason: reclassified-out` — i.e., it was scored quantitatively and found underweight, then pulled out of the auto-scored bucket for manual review rather than auto-applying the residual.

## Options & staff lean (enrichment, 2026-07-23)

The −3.15 COLD is the §4a weapon-rider artifact (per-Strike curse dice vs the per-cast
budget) — record it either way. The real decision is the dropped identity clause: 5e's
cursed target could be attacked "regardless of distance or obstacles" (ignore cover, no
disadvantage) — the reality-cutting razor WAS the spell. The conversion kept only a
melee-Strike rider, added an escape save (nerf) and a transfer clause (small buff), so
the coolest beat is gone uncompensated. Note: the per-turn Will escape save is fine as-is
— the curse-removal counteract convention governs removal-by-other-effects text, which
this 1-minute combat curse doesn't have.

- **A. Keep melee-only as converted, record artifact** — playable, but the name and
  fiction overpromise.
- **B. Restore the reality-cut PF2e-native** — e.g. your melee Strikes against the cursed
  creature reach it anywhere within 60 feet, cutting through intervening space and
  ignoring cover. Bounded (range cap, cursed-target-only), restores the identity;
  unpriced by the model either way (reach is unmodeled), so no scorer gate applies.
- **C. B plus trim the initial 3d10 back toward 5e's 2d10** — if restoring reach feels
  like it needs paying for.

**Lean: B.** The clause is why the spell exists; 60-ft cap + single-cursed-target keeps
it honest at rank 5.
