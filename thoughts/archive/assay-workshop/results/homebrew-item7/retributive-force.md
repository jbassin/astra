# Retributive Force

## Header block

- **Rank:** 1 (store `system.level.value = 1`)
- **Routing:** `comparables` — **pool reason:** wide-range, scorer comparables rank range **1–9** (LOW-INFORMATION — flagged in the pool as the reason for manual review)
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: [1, 9]`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, force, kosmoturgy, manipulate
- **Traditions:** arcane, divine
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** self
- **Targets:** you
- **Defense:** Fortitude save (`system.defense.save = {basic: false, statistic: "fortitude"}`)
- **Duration:** 1 minute, **sustained**
- **Heightening:** interval-style "+1" trigger text in the description (no structured `heightening` block in the store JSON — see Open flags)

## The 5e original

- **Name:** Retributive Force (source: `tfc`)
- **Level:** 1st
- **School:** kosmoturgy
- **Casting time:** 1 bonus action
- **Range:** self
- **Components:** V (no S, no M)
- **Duration:** concentration, up to 1 minute
- **Classes:** Cleric, Paladin

**Entries:**

> The first time you hit with a melee weapon attack during this spell's duration, retributive energy rushes through your weapon. The attack deals an extra 1d6 force damage to the target. Additionally, the target must succeed on a Constitution saving throw or suffer the following effect. When one makes a melee attack on their turn while under the effect of this spell, the force of their attack is returned back to them. They are launched backwards ten feet and fall prone from the force. This movement does not provoke opportunity attacks, and the creature may repeat its saving throw at the end of its turn.

**At Higher Levels:**

> When you cast this spell using a spell slot of 2nd level or higher, the force damage increases by 1d6 (scaling dice table, 1–9) per spell slot level above 1st.

## The conversion (canonical store)

> Retributive energy flows through your weapon, ready to rebound. While this spell is sustained, the first time on your turn that you hit with a melee Strike, that Strike deals 1d6 extra force damage. In addition, when a creature within melee reach hits you with a melee Strike while the spell is sustained, that creature must attempt a Fortitude save against your spell DC. On a failure, it is launched 5 feet away from you (this movement does not trigger reactions) and falls Prone. On a critical failure, it is launched 10 feet away and falls Prone. The creature may attempt a new Fortitude save at the end of each of its turns to end the Prone condition early; the launch is instantaneous.
>
> **Critical Success** The striking creature is unaffected.
> **Success** The striking creature is unaffected.
> **Failure** The striking creature is launched 5 feet away from you and falls Prone.
> **Critical Failure** The striking creature is launched 10 feet away from you and falls Prone.
>
> **Heightened (+1)** The extra force damage on your Strikes increases by 1d4 and the launch distance on failure increases by 5 feet.

`Prone` appears as `@UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone}` — a UUID link to the condition item, rendered above as plain "Prone" text (three occurrences). Structured `defense.save.statistic = "fortitude"` and `defense.save.basic = false` agree with the prose (full 4-tier save, not a basic save). `duration.sustained = true` / `duration.value = "1 minute"` matches "sustained" language in the prose.

## What changed, plain English

The core retaliation fiction (attacker who hits you gets launched + prone on a failed save) is preserved, but the trigger condition, save mapping, and structure of the retaliation were all rebuilt:

- **Numbers:** 5e's force-damage rider is 1d6 (identical in the conversion, 1d6). Launch distance: 5e uses a **flat 10 feet always** (no fail/crit-fail split) → the conversion splits it into **5 ft on failure / 10 ft on crit failure** — the conversion's *baseline* (fail) launch distance is half the 5e flat value; crit failure matches the old flat number.
- **Action economy:** 5e "1 bonus action + concentration, up to 1 minute" → PF2e "2 actions + sustained, up to 1 minute." The PF2e version costs one more action to get running than the 5e mapping of bonus-action→1-action would suggest (converter flags this as overridable — see notes).
- **Trigger changed:** 5e's retaliation clause is ambiguous — "When **one** makes a melee attack on their turn while under the effect of this spell, the force of their attack is returned back to them" reads as if it fires whenever the *warded/affected* creature attacks (echoing a self-punish or "cursed" framing, or possibly a typo for "when a creature attacks **you**"). The conversion resolves this ambiguity explicitly: retaliation now fires only "when a creature within melee reach **hits you**" — i.e., an attacker landing a hit on the caster is the sole trigger. This is a structural disambiguation, not merely a numbers change.
- **Save type:** 5e Constitution save → PF2e Fortitude (organ-mapped: Con→Fort per the converter's stated convention).
- **Structure — degrees of success added:** the 5e original has a single pass/fail outcome (save or be launched+prone). The conversion formalizes this into full PF2e 4-tier degrees of success (crit success/success/failure/crit failure), with crit failure adding the harsher 10-ft launch that didn't exist as a separate tier in 5e (5e's flat "10 feet" applied on any failed save, full stop).
- **Heighten vs 5e upcast:** 5e's upcast scales the melee force-damage rider by 1d6 per slot level above 1st (an interval/per-rank scaling table). The conversion's heighten (+1) instead adds 1d4 to the rider *and* extends the failure-tier launch distance by 5 ft per heighten step — a smaller damage die (1d4 vs 1d6) but an added secondary scaling axis (forced-movement distance) that the 5e original never scaled.
- **Content dropped/added:** nothing structurally dropped from the core mechanic; the "may repeat its saving throw at the end of its turn to end the condition early" clause is preserved near-verbatim in both versions. No new mechanical content was added beyond the degrees-of-success formalization described above.

## Converter's notes

- **Anchor:** "Bless (rank 1 self-buff) + Force Barrage (rank 1 force damage); hybrid melee-buff + retributive-force cantrip pattern"
- **Archetype:** self-buff / retributive (combat-grade sustained melee enhancement + retaliation)
- **Balance bullets:**
  - "Anchored to Bless (rank 1) for sustained combat buff pattern and Force Barrage for force damage calibration. 1d6 force extra damage per Strike is at the Force Barrage per-missile average (1d4+1 ~3.5)."
  - "The retributive push (Fortitude fail → launched + prone) is priced into the crit-fail tier: launch + prone on fail, escalated launch on crit fail; success does nothing."
  - "Sustained up to 1 minute: appropriate for a combat-grade buff; combat buffs cap at 1 min or sustained per the plan."
  - "Force damage on Strikes is at the low end of rank-1 additional-damage riders; the retributive element is the novel design space, not the damage."
- **Overridable:**
  - "Cast time could be reduced to 1 action (bonus action in 5e) for closer 5e fidelity; at 1 action it would be strictly weaker than the 2-action version and may need a damage reduction."
  - "Launch distance on fail could be increased to 10 ft (5e original) if the GM is comfortable with more aggressive forced movement at rank 1."
- **Checklist failures:** none listed.

## Similar official spells

Rank 1 is a low-information pool for the scorer (comparables rank range 1–9 recorded in the queue), so hand-picked comparables from adjacent ranks:

- **Bless** (rank 1) — self+ally sustained buff, +1 status to attack rolls in an emanation, sustainable to grow radius. Comparison axis: the going rate for a rank-1 sustained combat buff with no damage rider; Bless spends its whole budget on the attack-bonus/ally-scope axis, where Retributive Force spends its budget on a self-only damage rider + forced-movement retaliation instead.
- **Force Barrage** (rank 1) — 1d4+1 force damage per action spent (up to 3 shards), auto-hit, no save. Comparison axis: this is the converter's own damage-calibration anchor for the 1d6 force rider (Force Barrage's per-shard average ~3.5 is close to 1d6's ~3.5).
- **Sure Strike** (rank 1) — one-attack fortune (roll twice, take higher) until end of turn, then 10-minute self-immunity. Comparison axis: shows a different rank-1 "make your next hit count" design (fortune on the attack roll itself) versus Retributive Force's flat damage rider on the first hit each turn.
- **Winning Streak** (rank 4) — grants Quickened contingent on landing crits, extends on chained crits. Comparison axis: a higher-rank example of a combat buff whose payoff is conditional on landing attacks, similar in spirit to Retributive Force's "first hit each turn" trigger, useful for judging where a conditional-payoff combat buff should sit on the rank ladder.

**Scorer comparables (low-information):** none named — the queue only records the rank range (1–9) that routed this spell to manual comparables review; no per-spell comparable list has been computed yet (verdict/rankRange fields are otherwise null).

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly.

## Open flags

- **No structured `heightening` field** in the store JSON at all (`system.heightening` key is absent) despite the description containing a "Heightened (+1)" clause. Contrast with several sibling spells in this batch (Reflective Defense, Return Spell, Revisit, Right Hand of Judgment, both Shape Modify spells) which all carry a `system.heightening.type` / `.levels` structured block even when the adapter can't parse the heighten numerically. Retributive Force has neither `type: "interval"` nor `type: "fixed"` recorded structurally — the heighten text lives in prose only, with no structural marker of any kind.
- The 5e original's retaliation trigger wording ("When one makes a melee attack on their turn while under the effect of this spell...") is genuinely ambiguous about who "one" refers to; the conversion resolved it to "attacker hits you," which is a defensible reading but is a judgment call worth surfacing, not a mechanical transcription.
- The description references the condition via `@UUID[Compendium.pf2e.conditionitems.Item.Prone]{Prone}` three times — standard UUID-link pattern, not a broken reference, flagged here only per the dossier instructions to note UUID usage.
