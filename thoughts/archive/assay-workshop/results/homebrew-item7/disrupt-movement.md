# Disrupt Movement

## Header block

- **Rank:** 1
- **Routing:** ledger:utility
- **Pool reason:** ledger (manual pool, seeded by jmnario's balanceBullets)
- **Current assay line:** no quantitative verdict recorded for this spell in the chunk list (ledger routing — manual review item)
- **Adapter warnings (flags.assay.adapterWarnings):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, kosmoturgy, manipulate (rarity: common)
- **Traditions:** arcane, divine
- **Cast:** 2 actions
- **Range:** 60 feet
- **Target:** up to 3 creatures
- **Defense:** Reflex save (non-basic; `defense.save.basic=false`)
- **Duration:** sustained, up to 1 minute

## The 5e original

- **Level:** 1
- **School:** kosmoturgy
- **Casting time:** 1 action
- **Range:** 60 feet
- **Components:** V, S (no material)
- **Duration:** 1 minute (not concentration)
- **Classes:** Cleric, Paladin

> You send ripples of contracted space toward three separate targets. Each target must make a Dexterity saving throw or its speed is halved and it gains disadvantage on Dexterity ability checks. An affected creature may repeat its saving throw at the end of its turn, ending the effect on a success.

**At Higher Levels:** "When you cast this spell using a spell slot of 2nd level or higher, you can create an additional ripple to target one additional creature for each slot level above 1st."

## The conversion (canonical store)

You send ripples of contracted space toward up to three creatures you can see within range. Each target must attempt a Reflex save against your spell DC.

- **Critical Success** The creature is unaffected.
- **Success** The creature is unaffected.
- **Failure** The creature's Speed is halved and it takes a -1 circumstance penalty to Reflex saves and Acrobatics checks for as long as the spell is sustained (up to 1 minute). At the end of each of its turns, the creature can attempt a new Reflex save against your spell DC to end the effect on itself.
- **Critical Failure** As failure, but the Speed reduction is to 0 and the circumstance penalty is -2.

**Heightened (3rd)** You can target up to 5 creatures, and the critical failure effect also causes the target to be `Immobilized` (`@UUID[Compendium.pf2e.conditionitems.Item.Immobilized]` — a link to the PF2e condition item, rendered here as plain text) until it succeeds at its end-of-turn save.

Structured fields agree with the prose: `defense.save.basic=false` matches the non-basic (unaffected/unaffected/halved/zeroed) degree structure rather than a half/full/double damage ladder; `duration.sustained=true, value="1 minute"` matches.

## What changed, plain English

The core "ripple hits up to 3 targets, halves speed on a fail, end-of-turn save to shake it" concept survives, but the higher-level scaling model was restructured and a fourth degree of success was added.

- **Numbers:** target count stayed at 3 in both versions at base rank. Duration is 1 minute in both, though 5e's is a flat (non-concentration) duration and PF2e's is sustained.
- **Structure:** 5e's **Dexterity ability checks with disadvantage** became PF2e's **-1 circumstance penalty to Reflex saves and Acrobatics checks** (PF2e has no advantage/disadvantage, so this is a flat-penalty organ-mapping, with Acrobatics chosen as the closest Dexterity-check analog). The save itself went from a 5e Dexterity save to a PF2e **non-basic** Reflex save — non-basic because, per the converter, "this is a condition spell, not damage-primary." A **critical failure tier** was added (Speed to 0, -2 penalty) — 5e's original has no degrees of success at all (pass/fail only), so PF2e's four-tier structure (with a duplicated "unaffected" result on both crit-success and success) is new structure, not a direct port.
- **The biggest structural change: heightening/upcast scaling.** 5e's original scales **linearly and unboundedly** — "for each slot level above 1st" you get one additional target, meaning a 9th-level slot cast would hit roughly 9 targets. The PF2e conversion instead uses a **single fixed heighten at 3rd** (3 → 5 targets, plus the crit-fail Immobilize upgrade) with no further scaling shown at any higher heighten level. This drops the continued per-level target growth entirely — a rank-9 casting of the PF2e version still only reaches 5 targets, versus 5e's ~9.
- **Content dropped:** the unbounded "+1 target per slot level above 1st" scaling is not present in the PF2e conversion in any form.
- **Content added:** the fourth degree-of-success tier (critical failure, worse than a plain failure) and the heighten-3rd Immobilize-on-crit-fail upgrade have no 5e basis.

## Converter's notes

**Anchor:** Slow (rank 3, single target) — Speed reduction + action debuff; adapted to rank 1 multi-target with sustained duration

**Archetype:** control/debuff (Speed reduction, multi-target)

**balanceBullets:**
- "Anchored to Slow at rank 3 (single target, slowed 1 = speed halved + 1 action lost); Disrupt Movement does only Speed-halved (no action loss) across up to 3 targets at rank 1."
- "Speed reduction without action loss is a Tier B debuff — appropriate at rank 1 with sustained duration and end-of-turn saves."
- "Three-target spread at rank 1 is offset by: (a) sustained requirement, (b) each target gets an end-of-turn save, (c) Reflex save (not Will/Fort, which enemies tend to be weaker at)."
- "Heightened 3rd adds immobilized on crit fail only, scaling toward Slow's level of control without reaching it."

**overridable:**
- "Save could be changed to Will (Wis→Will) since spatial confusion might be more mental; Fortitude would also work as a bodily resistance to spatial compression."
- "Could target only 1 creature at rank 1 for tighter balance, and heighten to 3 targets at rank 3."

**checklistFailures:** none.

## Similar official spells

- **Slow (rank 3)** — the converter's own cited anchor. Single-target non-basic Fortitude save inflicting the Slowed condition (1 action lost) for 1 round on success, 1 minute on failure, Slowed 2 on critical failure; heightens to up to 10 targets at 6th. Two ranks above Disrupt Movement's base rank; the direct comparison point for "speed/action debuff at scale," and the spell whose heighten pattern (fixed jump to a much larger target count at a specific rank) most resembles Disrupt Movement's own heighten-3rd structure. Note the save-type differs from Disrupt Movement's Reflex (Slow uses Fortitude).
- **Frostbite (rank 1, listed as a leveled rank-1 spell in the codex snapshot)** — single-target Fortitude save for cold damage, with a weakness rider on critical failure; included as a rank-1 baseline for "single-target debuff-on-fail" even though it deals damage rather than reducing Speed.

No official rank-1 or rank-2 spell matching "multi-target Reflex save that halves Speed" was found in the codex snapshot search — Disrupt Movement's base-rank multi-target Speed debuff appears to be a lower-rank power level than any comparable official spell found (the closest match, Slow, sits two ranks higher and single-target at base rank).

## Prior astra touches

None found in `revisions.md` — Disrupt Movement is not listed among the 52 deviating (hand-edited) spells; the store is byte-faithful to the fresh adapter re-conversion of jmnario's baseline (0 deviations for this spell).

## Open flags

- The success-tier table lists **both** Critical Success and Success as "The creature is unaffected" — a duplicated result across two degrees rather than a distinct critical-success benefit (e.g., no additional upside for critically succeeding vs. simply succeeding).
- The adapter warning notes the heightened (3rd) entry has "no structurally-parseable damage bump" and is kept as a description appendix only — there is no structured `heightening.levels["3"]` payload beyond an empty object (`{}`), consistent with the warning.
- 5e's per-slot-level unbounded target scaling has no equivalent representation anywhere in the PF2e store (not in the heighten text, not in an adapter warning, not in the converter's notes beyond the single "Heightened 3rd adds immobilized on crit fail only" bullet) — a reader relying solely on the converter's notes or the store would not know the 5e original scaled indefinitely with slot level.
