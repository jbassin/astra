# Fumble

## Header block

- **Rank:** 4 · **Routing:** `comparables` · **Pool reason:** wide-range
- **Current assay line:** verdict = none recorded / comparables rank range 1–9 (LOW-INFORMATION — this is why the spell sits in the manual pool) / residualRanks = none (scores.json: `kind: "comparables"`, `population: "hostile"`)
- **Scorer comparables (raw):** Grease (rank 1), Shape Stone (rank 4), Undertaker (rank 9), Gravitational Pull variant 1 (rank 1), Kinetic Ram variant 1 (rank 1)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, curse, fortune, manipulate, mental, mercuromancy, misfortune · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 2 actions · **Range:** 30 feet · **Target:** 1 creature
- **Defense:** `save.statistic = "will"`, `save.basic = false`
- **Duration:** sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)
- **Heightening scaffold:** `system.heightening = {"levels":{"6":{}},"type":"fixed"}`

## The 5e original

- **Name:** Fumble · **Source:** tfc (homebrew) · **Level:** 4 · **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** 30 feet (point)
- **Components:** V, S; M — "a broken finger bone"
- **Duration:** Concentration, up to 1 minute
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> You twist the strands of fate to make a creature more clumsy than normal. A creature you can see must make a Wisdom saving throw against your spell DC or become cursed with clumsiness. While cursed, the creature must make a Dexterity saving throw whenever it moves 20 feet or farther during its turn. If the saving throw fails, the creature falls prone at the end of the movement. It also must make a Dexterity saving throw at the end of each of its turns in which it attacked with a hand-held weapon. If the saving throw fails, it drops the weapon.
>
> The spell ends early if the creature rolls a natural 20 on any of the saving throws required by the spell.

No `entriesHigherLevel` block in the 5e source (this spell has no native 5e upcast text).

## The conversion (canonical store)

You weave strands of misfortune around a target creature, cursing it with magical clumsiness. The target must attempt a Will save. The curse ends if the target rolls a critical success on any save required by this spell, or when the spell ends.

**Critical Success** The target is unaffected and is temporarily immune to Fumble for 24 hours.

**Success** The target is unaffected.

**Failure** The target is afflicted by stumbling clumsiness. Whenever the target uses a move action that moves it 10 or more feet, it must succeed at an Acrobatics check against your spell DC or fall `Prone` (UUID link) at the end of that movement. Additionally, whenever the target makes a Strike with a held weapon, it must succeed at an Acrobatics check against your spell DC or drop the weapon (your choice of which hand it drops from if it wields two weapons). The target can attempt a new Will save at the end of each of its turns; on a success, the spell ends.

**Critical Failure** As failure, but the target also takes a -2 status penalty to Reflex saves for the duration, and the initial Will save at the end of each of its turns is not granted — the target must succeed at two consecutive Will saves (one at the end of a turn and one at the start of the next) before the effect ends.

---

**Heightened (6th)** The penalty to Reflex saves on a critical failure increases to -3, and the spell also imposes `Clumsy 1` (UUID link) on a critical failure for the duration.

`successTiers` present in structured data, matches prose exactly. `system.defense.save = {statistic: "will", basic: false}` matches. No `@UUID` references outside the two condition links noted above. `system.heightening.levels."6"` is an empty object — the heightened text (Reflex penalty escalation, added Clumsy 1) lives only in the description.

## What changed, plain English

- **Save type on the triggered checks changed from saving throw to skill check:** 5e requires a Dexterity *saving throw* against the caster's spell DC for both the movement-trigger and the weapon-Strike-trigger. The conversion changes both triggers to *Acrobatics skill checks* against the caster's spell DC — a mechanical-category swap (save → skill check) rather than a straight rename, per the converter's own notes ("this is the correct PF2e mapping for environmental/triggered fumble checks; saves are reserved for the initial Will save and the end-of-turn recovery save").
- **Initial save type:** 5e Wisdom saving throw → PF2e Will save.
- **Movement-trigger threshold lowered:** 5e triggers the fall-prone check at "moves 20 feet or farther." The conversion lowers this to "10 or more feet" — a meaningful tightening of when the clumsiness check fires, explicitly called out by the converter as a PF2e movement-increment adjustment (with an acknowledged alternative of 15 ft in `overridable`).
- **Early-end condition changed:** 5e ends the spell "if the creature rolls a natural 20 on any of the saving throws required by the spell" (i.e., on *any* die-roll nat-20, including the triggered Dex saves). The conversion narrows this to "the target rolls a critical success on any save required by this spell" — since the triggered checks are now Acrobatics skill checks (not saves) in the conversion, the early-end condition can now only be triggered by a critical success on a *save* (the initial Will save, or the end-of-turn recovery Will save), not by a natural 20 on an Acrobatics check. This is a meaningful narrowing of the escape valve versus the 5e source, where any of the (then-all-saving-throw) rolls could end the curse early.
- **Full four-degree structure added, no 5e basis:** the 5e original is a flat pass/fail save (fail = cursed, pass = nothing — no distinct critical-success or critical-failure text at all). The conversion adds a critical-success tier (24-hour immunity — new content) and a critical-failure tier (Reflex penalty + harder recovery condition — new content), both invented for PF2e's mandatory four-tier structure.
- **Recovery/end condition reworked and split by save-tier:** 5e has no "recurring save to end early" mechanic at all — the curse in 5e lasts the full concentration duration (up to 1 minute) unless a nat-20 is rolled on a triggered save. The conversion adds an entirely new recurring end-of-turn Will save (on a plain failure) that can end the spell early, but *removes* that same recovery option on a critical failure (requiring two consecutive successful saves instead) — this recurring-save escape mechanic and its critical-failure-tier removal are both new structure with no 5e basis.
- **Action cost:** 5e 1 action → PF2e 2 actions.
- **Heightening, wholly new content:** 5e has no upcast text; the conversion adds a rank-6 tier (Reflex penalty -2→-3, plus a new Clumsy 1 condition on critical failure) with no 5e basis.
- **Traditions:** 5e class list (Bard/Druid/Seeker/Sorcerer/Warlock/Wizard) → arcane + occult (Druid's primal access explicitly dropped per the converter's notes).

## Converter's notes

- **Anchor:** "Confusion (rank 4, incapacitation) — Fumble is the non-incapacitation version; the creature is not out of the fight, just impaired at specific triggered actions"
- **Archetype:** control/debuff
- **Balance bullets:**
  - "Incapacitation trait NOT required: Fumble does not remove a creature from the fight; it creates a risk of prone on movement and weapon drop on attacks, but the creature still acts fully each turn."
  - "Acrobatics checks vs spell DC (not a saving throw) for the triggered events: this is the correct PF2e mapping for environmental/triggered fumble checks; saves are reserved for the initial will save and the end-of-turn recovery save."
  - "Sustained up to 1 minute (5e concentration 1 min) is appropriate for a debuff of this power level — comparable to Slow's duration."
  - "The curse + fortune + misfortune traits are all warranted: mercuromancy fate-manipulation is textbook fortune/misfortune magic."
- **Overridable:**
  - "Crit-fail tier adds Reflex penalty and double-save requirement — this is a design decision to make crit fail meaningfully worse; GM may simplify to 'clumsy 1' instead."
  - "Movement threshold lowered from 20 ft (5e) to 10 ft (PF2e has shorter movement increments and combat spacing); GM may prefer 15 ft if the 10 ft threshold feels too punishing."
- **Checklist failures:** none recorded.

## Similar official spells

- **Slow (rank 3)** — Will-save debuff imposing Slowed 1 (success) or Slowed 2 (crit fail) for 1 minute, no recurring escape save, no movement/attack-triggered checks. One rank below Fumble; a flatter, simpler action-tax debuff for direct comparison on the "1-minute Will-save debuff" axis.
- **Confusion (rank 4)** — the converter's own anchor; same rank, `incapacitation` trait (unlike Fumble), forces random actions on a failure with a recurring end-of-turn save. Directly comparable rank and Will-save structure; illustrates what the incapacitation trait buys (or costs) at the same rank as Fumble's non-incapacitation design.
- **Bestial Curse (rank 4)** — same rank, `curse` trait, Fortitude-gated (not Will) transformation that inflicts Clumsy 1 as part of its success tier, 1-hour duration on a failure. Direct rank/trait comparable for the "curse that imposes Clumsy" mechanic that Fumble only reaches at its rank-6 heightened tier.
- **Ill Omen (rank 1)** — Will-save curse imposing "roll twice, take worse" on attack rolls/skill checks; the `misfortune` trait's baseline expression at a much lower rank, useful for contrasting how much a `misfortune`-tagged debuff typically costs versus Fumble's rank-4 movement/weapon-drop package.

**Scorer comparables (low-information):** Grease (rank 1), Shape Stone (rank 4), Undertaker (rank 9), Gravitational Pull variant 1 (rank 1), Kinetic Ram variant 1 (rank 1).

## Prior astra touches

None. `revisions.md` has no entry for Fumble.

## Open flags

- The early-end escape condition was narrowed in the conversion: 5e ends the spell on a natural 20 rolled on *any* required saving throw (including what are now Acrobatics checks in PF2e), while the conversion's "critical success on any save required by this spell" can no longer be triggered by the (now skill-check) movement/weapon-drop rolls at all — only by the initial or recovery Will saves. This narrowing isn't discussed in `balanceBullets` or `overridable`.
- The recurring end-of-turn Will save (escape valve on a plain failure) and its removal on critical failure are both entirely new PF2e structure invented for this conversion; the 5e original has no equivalent recurring-save mechanic at all (the curse simply runs the full duration absent a nat-20).
- `system.heightening.levels."6"` is an empty object; the rank-6 heightened text (Reflex penalty escalation to -3, new Clumsy 1 on crit fail) exists only in the description appendix.
- The `mercuromancy` trait appears in `system.traits.value` but is *not* among the `traits` array in the jmnario intermediate conversion (which lists `occult` in that slot instead) — worth a cross-check that this is a deliberate astra-side trait addition rather than a copy artifact, since it doesn't appear in `convertedFromSpiritOf.changedElements` as a discussed change.

## Options & staff lean (enrichment, 2026-07-23)

Wide-range routing (1-9) is honest low-information; the manual read against Slow r3 /
Confusion r4 puts the rank-4 slot about right for a non-incapacitation action-tax curse
with a recovery save. The conversion's added degree tiers and recovery-save structure are
good PF2e practice. Two real review items, both flagged in this dossier's What-changed:

1. **The narrowed escape valve** (the headline): 5e ended the curse on a nat-20 on ANY
   triggered roll; the conversion's triggered rolls became Acrobatics checks, which can
   no longer end it — only the Will saves can. Unacknowledged narrowing.
2. The movement threshold dropped 20 ft → 10 ft (converter-flagged, 15 ft offered as the
   overridable middle).

- **A. Restore the escape valve at the checks: "a critical success on any Acrobatics
  check against this spell also ends the curse"** — restores 5e's any-roll escape in
  PF2e language; keep 10 ft threshold.
- **B. A plus threshold 10→15 ft** — if the trigger feels too frequent at the table;
  the converter's own fallback.
- **C. Keep as converted** — strictest version; the recovery save already gives agency,
  so this is defensible, but the narrowing was never a stated design choice.

**Lean: A.** Rank stays 4; text-only.
