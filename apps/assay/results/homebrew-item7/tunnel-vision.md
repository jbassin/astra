# Tunnel Vision

## Header block

- **Rank:** 1
- **Routing:** `ledger:no-comparable-profile`
- **Pool reason:** ledger
- **Current assay line:** verdict = `null`, rankRange = `null`, residualRanks = `null` (unscored in `queue.json`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, fortune, manipulate, mental — rarity: common — traditions: arcane, occult
- **Cast:** 2 actions (`time.value = "2"`)
- **Range:** touch
- **Target:** 1 willing creature
- **Defense:** `null` (no save — willing-target buff)
- **Duration:** 8 hours (structured: `duration.sustained = false`)
- **Cost:** `""` (empty — see Open flags; jmnario's conversion carried "a handful of caltrops (consumed)")
- **Structured `heightening` field:** present — `{levels: {"3": {}}, type: "fixed"}` (matches the "Heightened (3rd)" prose trigger)
- **Structured `damage` field:** empty (`system.damage = {}` — no damage in this spell)

## The 5e original

- **Level / School:** 1st-level chronomancy
- **Casting time:** 1 action
- **Range:** Touch (point)
- **Components:** V, S, M — "a handful of caltrops"
- **Duration:** 8 hours, non-concentration
- **Classes:** Bard, Druid, Wizard
- **Source:** `tfc`, ritual: false

**Entries:**

> A willing creature you touch is imbued with foresight. For the duration of the spell the creature may use an additional 1d8 when rolling for initiative.
>
> If this spell is cast while its effect is already active on another creature, the original spell's effect fades.

**entriesHigherLevel:**

> When you cast this spell using a 2nd level spell slot or higher, the number of creatures you can target with this spell increases by one for each slot level above first.

## The conversion (canonical store)

You imbue a willing creature with an acute foresight that sharpens its reflexes just before danger strikes. For the duration, the target gains a +1 status bonus to initiative rolls. If the target's initiative result is a critical success (a natural 20 or 10 or more above the DC), it also acts before enemies on the first round even if initiative ties would normally resolve otherwise. Additionally, once during the duration, the target can invoke the foresight as a free action at the start of a combat to roll initiative twice and take the higher result (the fortune trait applies; additional fortune effects cannot further alter the roll). Once the fortune effect is used, only the +1 status bonus remains.

---

**Heightened (3rd)** The status bonus to initiative increases to +2, and the fortune re-roll can be used twice instead of once.

**Structured/prose notes:**
- No `@UUID` links.
- One heightened tier structurally represented (3rd), matching the prose trigger exactly.
- No `defense` object — correct, since this is a willing-target buff with no save.

## What changed, plain English

Both versions grant a willing touched creature a bonus to a single initiative roll for a long (8-hour, prep-tier) duration. The PF2e conversion changes the bonus mechanism from a flat extra-die roll to a status bonus plus a separate fortune-reroll mechanic, and — notably — the heightening rider is not a scaled-up version of the 5e upcast text but an entirely different scaling axis.

- **Numbers:**
  - 5e: "an additional 1d8" bonus die on the initiative roll.
  - PF2e: "+1 status bonus" (base) — the converter's own notes explicitly frame this as the rank-1-appropriate translation of the 1d8 bonus-die fiction, plus a supplementary once-per-duration fortune re-roll ("roll initiative twice and take the higher result") added to further capture the "extra die" feel.
  - Cast time: 5e 1 action → PF2e 2 actions.
  - Duration preserved exactly: 8 hours.
- **Structure:**
  - PF2e adds a new mechanical clause with no 5e basis: "If the target's initiative result is a critical success (a natural 20 or 10 or more above the DC), it also acts before enemies on the first round even if initiative ties would normally resolve otherwise" — a full new rules interaction (critical-success initiative tiebreak) not present in the 5e text at all.
  - The `fortune` trait is added on the reroll mechanic, which by PF2e convention blocks stacking with other fortune effects — the converter's notes describe this explicitly.
- **Content dropped from 5e:**
  - 5e's exclusivity clause — "If this spell is cast while its effect is already active on another creature, the original spell's effect fades" — is entirely absent from the PF2e description. In 5e this spell can only ever be active on ONE creature globally per caster; recasting on a new creature silently ends it on the previous one. The PF2e version has no such restriction at all: nothing in the description prevents the same caster from having Tunnel Vision active on multiple different willing creatures simultaneously (each cast independently uses its own action/slot). The converter's own notes describe this as "converted to 'fortune re-roll is once-per-duration,'" but that substitution addresses a different axis (limiting a single target's fortune-reroll usage) — it does not reproduce or replace the original one-active-target-globally restriction, which is simply gone.
  - The 5e higher-level upcast text — "the number of creatures you can target with this spell increases by one for each slot level above first" — is NOT carried forward at all. The PF2e Heightened (3rd) entry instead increases the status bonus to +2 and the fortune-reroll count to twice — a completely different scaling axis (bigger bonus per creature, not more creatures targeted). The 5e multi-target upcast mechanic has no PF2e equivalent anywhere in this spell.
- **Content added with no 5e basis:**
  - The critical-success initiative tiebreak clause (discussed above).
  - The `fortune` trait and its once-per-duration reroll framing.

## Converter's notes

**Anchor:** "Guidance (cantrip) — status bonus to a single roll for 1 minute; scaled up to 8-hour exploration buff"

**Archetype:** buff/utility (initiative bonus + once-per-duration fortune re-roll)

**Balance bullets:**
- "Anchored to Guidance (+1 status to one check, 1 min) scaled to initiative-only, 8-hour duration. Narrowing to initiative only justifies the longer duration."
- "Fortune re-roll added to capture the '1d8 bonus die' fiction; fortune tag prevents stacking with other fortune effects."
- "8-hour duration is appropriate for an exploration prep buff that only activates at the start of a combat encounter. It does not provide ongoing combat value."
- "Heightened (3rd) doubles the fortune uses and raises the bonus to +2, which is the rank-3 status-bonus tier (Heroism is +1 to everything at rank 3; +2 to initiative only at rank 3 is slightly below Heroism's breadth)."

**Overridable:**
- "The fortune re-roll could be moved to a separate heightened entry (e.g., baseline is just +1 status, fortune re-roll unlocks at 3rd)."
- "Duration could be reduced to 1 hour for tighter PF2e alignment."

**Checklist failures:** none listed.

## Similar official spells

- **Anticipate Peril** (rank 1) — `apps/codex/.../spells/rank-1/anticipate-peril.json`. The closest direct functional match: "+1 status bonus to its next initiative roll, after which the spell ends," 30-foot range (not touch), 10-minute duration (not 8 hours), heightens +1 per +2 ranks to a max of +4 at 7th rank — Tunnel Vision's own base +1 initiative bonus is identical in size, but Tunnel Vision holds the bonus "live" for 8 hours (an exploration-prep buff) versus Anticipate Peril's single-use-then-gone within 10 minutes.
- **Guidance** (cantrip) — `apps/codex/.../spells/cantrip/guidance.json`. The converter's own cited anchor: +1 status bonus to one attack roll/Perception/save/skill check (broader scope than initiative-only), "until the start of your next turn" duration, then 1-hour immunity — the converter explicitly scaled Guidance's short single-roll shape up to Tunnel Vision's narrower-but-much-longer-duration form.
- **Heroism** (rank 3) — `apps/codex/.../spells/rank-3/heroism.json`. Touch, +1 status bonus (rising to +2/+3 at 6th/9th) to attack rolls, Perception, saves, AND skill checks — cited by the converter as the rank-3 status-bonus benchmark ("Heroism is +1 to everything at rank 3; +2 to initiative only at rank 3 is slightly below Heroism's breadth").
- **Sure Strike** (rank 1) — `apps/codex/.../spells/rank-1/sure-strike.json`. Not directly comparable in function, listed for the `fortune` trait family (a fortune-based reroll/replace mechanic at the same rank tier as Tunnel Vision's base rank).

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **Dropped 5e content, not merely reworded**: the 5e "5e multi-target-per-upcast-level" heightening mechanic is fully absent from the PF2e version — Tunnel Vision never gains the ability to target more than 1 willing creature at any rank in this conversion, despite the 5e original explicitly scaling target count with slot level. This is a genuine capability loss relative to the 5e source, not a renaming (see "What changed" above for detail).
- **Dropped 5e content, not merely reworded (second instance)**: the 5e "only one creature can have this active at a time, globally, per caster" exclusivity clause is also fully absent. The converter's own notes claim this was "converted to 'fortune re-roll is once-per-duration,'" but that substitution constrains a different mechanic (each target's own fortune-reroll count) and does not reproduce any limit on how many different creatures can simultaneously benefit from the caster's castings of this spell.
- **Material component dropped**: jmnario's intermediate conversion (`all_spells_pf2e.json`) carried `cost: "a handful of caltrops (consumed)"`, directly preserved from the 5e original's material component text. The canonical store's `cost.value` is empty (`""`). Since revisions.md shows 0 deviations for this spell (store matches a fresh adapter re-conversion exactly), the drop is adapter policy, not a hand edit — same pattern as Temporal Threshold and Time Loop.
- **Routing note**: this spell's routing (`ledger:no-comparable-profile`) is the only one of the eight in this chunk flagged with that specific sub-reason, distinct from the other ledger-routed spells' `ledger:utility`/`ledger:long-cast` — recorded here as a fact for the reviewer's context, no further data available on what specifically produced that routing subtype.
