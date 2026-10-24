# Djura's Righteous Pressure

## Header block

- **Rank:** 4
- **Routing:** quantitative
- **Pool reason:** reclassified-out
- **Current assay line:** verdict −2.92 ranks COLD, residual −2.92 ranks
- **Adapter warnings (flags.assay.adapterWarnings):** none (empty array)
- **Traits:** concentrate, holy, kosmoturgy, manipulate (rarity: uncommon)
- **Traditions:** divine
- **Cast:** 2 actions
- **Range:** self
- **Area:** 30-foot emanation
- **Target:** — (none; area effect)
- **Defense:** Fortitude save (non-basic; `defense.save.basic=false`)
- **Duration:** sustained, up to 1 minute
- **Structured damage:** `formula "2d6", type "vitality"`
- **Structured heightening:** `type "fixed", level "6" → damage.0 "2d6"` (additional vitality damage at heighten only; the humanoid-evil expansion is not captured structurally)

## The 5e original

- **Level:** 4
- **School:** kosmoturgy
- **Casting time:** 1 action
- **Range:** Self (30-foot radius sphere)
- **Components:** V, S, M (holy symbol)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Cleric, Paladin

> You radiate a great pressure in a 30-foot radius that is anathema to undead and fiends. Any undead or fiend that enters the aura or begins its turn in the aura takes 2d6 radiant damage and must make a Constitution saving throw; if the saving throw fails, the creature is forced out of the radius and cannot attempt to reenter until its next turn.

**At Higher Levels:** "When cast with a spell slot higher than 4th, the pressure may affect all humanoids as well as undead and fiends."

## The conversion (canonical store)

You radiate a great holy pressure that is anathema to undead and fiends. The emanation moves with you. Any undead or fiend that starts its turn inside the emanation or enters the emanation must immediately attempt a Fortitude save. Once a creature attempts this save against a given round of the aura, it is not forced to save again until the start of its next turn.

Creatures hit by this aura also take 2d6 vitality damage (which is only harmful to undead as normal for vitality damage).

- **Critical Success** The creature is unaffected and not pushed.
- **Success** The creature takes half vitality damage but is not pushed.
- **Failure** The creature takes full vitality damage and is pushed 5 feet directly away from you. It cannot willingly move back into the emanation until the start of its next turn.
- **Critical Failure** The creature takes double vitality damage and is pushed 10 feet directly away from you. It cannot willingly move back into the emanation until the start of its next turn.

**Heightened (6th)** The aura also affects humanoids with the evil trait (not merely undead and fiends). The vitality damage increases by 2d6.

No `@UUID[...]` references in this description. Structured fields agree with the prose: `area.type="emanation", area.value=30` matches "30-foot emanation"; `defense.save.basic=false, statistic="fortitude"` matches the non-basic four-tier structure; `duration.sustained=true, value="1 minute"` matches.

## What changed, plain English

The core "anti-undead/fiend aura, damage + forced-out effect, Constitution/Fortitude save" shape is preserved, with the damage type re-mapped for Remaster compliance and a push mechanic replacing 5e's binary expulsion.

- **Numbers:** base damage stayed 2d6 in both versions. Heighten (6th) damage growth: 5e's original text is silent on a damage increase at the higher-level expansion (only the target-type widening is mentioned); PF2e adds an explicit +2d6 at heighten 6th on top of the target-type widening.
- **Structure:** 5e's **radiant** damage type became PF2e's **vitality** — the converter calls this the "Remaster equivalency," but flags in `checklistFailures` that vitality damage in PF2e rules **only harms undead, not fiends** — unlike 5e's radiant, which damages both. The converter's fix for the anti-fiend gap is the **push mechanic**: 5e's original binary "forced out of the radius, can't reenter until next turn" became PF2e's **distance-scaled push** (5 ft on failure, 10 ft on critical failure) plus the same "can't willingly move back in until your next turn" clause. The save changed from 5e's Constitution to PF2e's Fortitude (a direct organ-mapping, not a content change). A **critical-success/critical-failure degree structure** was added — 5e's original is pass/fail only (no crit tiers).
- **Content dropped:** none of the core beats (30-ft emanation moving with the caster, undead/fiend targeting, damage + save, forced-out effect, can't-reenter clause, higher-level humanoid-evil expansion) are missing from the conversion.
- **Content added:** the four-degree critical-success/critical-failure structure (with distinct push distances) has no 5e basis. The explicit +2d6 damage bump at heighten 6th (on top of the target-widening) has no 5e basis — 5e's "At Higher Levels" text only mentions the humanoid-evil expansion, not a damage increase.

## Converter's notes

**Anchor:** Spirit Song (rank 4, occult, 20-ft emanation that deals spirit damage to undead) — Djura's is divine-only, 30-ft radius, with forced expulsion rather than pure damage

**Archetype:** control/debuff (holy aura, expulsion)

**balanceBullets:**
- "Named-caster spell (Djura's) flagged — PF2e-idiomatic form would be a champion reaction or focus spell; kept as slotted spell per plan rules."
- "2d6 vitality damage per round only harms undead (vitality is harmless to fiends unless they have undead-type vulnerability). The forced-expulsion on failure is the primary anti-fiend mechanism."
- "Holy trait is correct: this is explicitly an anti-fiend/anti-undead divine aura."
- "Fortitude save (Con organ mapping from 5e Con save) is correct for a physical-body-based expulsion."

**overridable:**
- "The vitality damage could be changed to spirit damage (which bypasses incorporeality and affects both undead and fiends equally) for a more unified anti-supernatural effect."
- "The 'cannot reenter until next turn' clause could be tightened to 'must succeed on a new Fortitude save to reenter' to allow persistent reentry attempts."

**checklistFailures:**
- "Checklist item 6 — vitality damage only harms undead (not fiends) under PF2e rules. The anti-fiend component relies entirely on the expulsion effect. Logged as a deviation from 5e's 'radiant damages both' design intent. Overridable: change to spirit damage or holy damage to affect both equally."

## Similar official spells

- **Holy Cascade (rank 4)** — same rank; divine; throws an enhanced vial of holy water for a burst of bludgeoning damage, with additional spirit damage scaled to caster level against creatures with the unholy trait. Compares on "same-rank divine anti-evil burst," though it is a single burst rather than a sustained emanation, and targets the unholy trait rather than undead/fiend specifically.
- **Spirit Song (rank 8)** — the converter's own cited anchor. Occult/divine; deals 14d6 spirit damage in an area based on a Fortitude save, penetrating into but not through solid barriers, with a can't-use-reactions rider on a success. Four ranks above Righteous Pressure; spirit damage (unlike vitality) is explicitly noted elsewhere in the corpus as bypassing the undead-only harm restriction, making it the type the converter's own `overridable` note suggests as an alternative.
- **Anointed Ground (rank 3)** — divine; sanctifies an area, granting all creatures within it a +1 status bonus to AC, attack rolls, damage rolls, and saves against a chosen creature type (aberrations, celestials, dragons, fiends, monitors, or undead). One rank below; compares on "area ward targeted at a specific hostile creature category," though it's a buff-to-allies rather than a damage/push aura.
- **Reaper's Lantern (rank 2)** — divine/occult/primal; a light-emitting aura that forces Fortitude saves from both living and undead creatures in the area, with different effects for each (undead risk true death on repeated failures; living creatures get reduced healing). Two ranks below; another same-family "aura targeting undead specifically via Fortitude."

## Prior astra touches

None found in `revisions.md` — Djura's Righteous Pressure is not listed among the 52 deviating (hand-edited) spells; the store is byte-faithful to the fresh adapter re-conversion of jmnario's baseline (0 deviations for this spell). Per `homebrew-triage.md` §4a, Righteous Pressure was one of 4 "sustained/charge" rows **reclassified out** of the pure-damage COLD list (per-round dice measured against a per-cast budget is a scoring-lens artifact, not necessarily a content defect) — this reclassification is a scoring/methodology note, not a store edit.

## Open flags

- The converter's own `checklistFailures` entry explicitly documents that the vitality damage type "only harms undead (not fiends)" — meaning, per the converter's own admission, the spell's damage component provides **zero mechanical effect against fiends** despite the spell's flavor text and header claiming it's "anathema to undead and fiends" equally. The anti-fiend function relies entirely on the push/can't-reenter mechanism, not the damage.
- This spell carries an assay verdict (−2.92 ranks COLD) despite `routing: quantitative` and `pool reason: reclassified-out` — i.e., it was scored quantitatively and found underweight, then pulled out of the auto-scored bucket for manual review rather than auto-applying the residual.
- `adapterWarnings` is empty for this spell, but the heighten-6th structured field only captures the +2d6 damage bump — the target-type widening ("also affects humanoids with the evil trait") is present only in the prose, with no adapter warning flagging this incompleteness (unlike several other item-7 spells, which do carry a warning for equivalent non-damage heighten text).

## Options & staff lean (enrichment, 2026-07-23)

The −2.92 COLD is the §4a sustained-aura artifact. The genuine defect is
converter-acknowledged in his own checklistFailures: **vitality damage does ZERO to
fiends**, so a spell whose header claims it is anathema to undead AND fiends mechanically
blanks half its target list — the exact class item 6 fixed on Solar Rebuke
(vitality→fire because it dealt zero vs living). The Remaster-native fix here is
**spirit damage** (his own overridable suggests it): spirit harms both undead and fiends,
and the spell already carries the holy trait for the anti-unholy interplay.

- **A. 2d6 vitality → 2d6 spirit (heighten bump likewise)** — Solar Rebuke precedent,
  converter's own suggested fix, makes the damage half real against fiends. Re-run
  score-homebrew after (damage-type multiplier may shift the residual slightly; expected
  immaterial, verify don't assume).
- **B. Keep vitality** — the aura stays push-only against fiends; honest only if the
  description is rewritten to stop claiming damage-parity.
- **C. Tighten the reentry clause per his other overridable** — independent, optional.

**Lean: A.** Push mechanics + degrees structure are already good conversions; only the
damage type needs the fix.
