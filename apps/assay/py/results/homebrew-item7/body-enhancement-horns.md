# Body Enhancement: Horns

## Header

- **Rank:** 2
- **Routing:** quantitative
- **Pool reason:** reclassified-out
- **Current assay line:** `verdict: -1.24 ranks COLD`, `residualRanks: -1.2364485774639777`, `ev: 4.5`, `budget: 12.843989912615635`, `actionBucket: "2"`, `kind: quantitative`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt, manipulate, morph — rarity common
- **Traditions:** primal
- **Cast:** 2 actions
- **Range:** self — **Target:** you
- **Defense:** none
- **Duration:** 1 minute (not sustained)
- **Structured damage:** `{0: 1d8 bludgeoning, kinds: [damage]}`
- **Heightening:** fixed levels 3/5/7/9 (empty structured payloads — text-only, per adapter warning)

## The 5e original

- **Level:** 2 (source file `gen_homebrew.json`, `"level": 2`)
- **School:** gestalt
- **Casting time:** 1 action
- **Range:** 5 feet (point)
- **Components:** S only (V false; M "False")
- **Duration:** instant
- **Classes:** Druid

> You draw upon the collective's memory of wildshaping to partially modify your body. You grow pointed horns on your forehead and rush at a target within range. Make a melee spell attack against the target. On a hit, the target takes 3d12 bludgeoning damage. If you move at least 20 feet straight at the target before casting this spell, you can choose one of the following effects to inflict upon it on a hit:
> - The target must succeed on a Strength saving throw or be pushed 10 feet away from you.
> - The target must succeed on a Strength saving throw or be knocked prone.
> - The target takes an additional 1d12 bludgeoning damage.

**At Higher Levels:** When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d12 for each slot level above 2nd.

## The conversion (canonical store)

> You draw upon the collective's memory of wildshaping to grow a heavy set of curved horns. You grow a horns unarmed Strike that deals 1d8 bludgeoning damage and has the magical, shove, and unarmed traits. You are trained with this attack, and if your weapon proficiency with martial weapons is higher than your unarmed proficiency, your horns use that proficiency instead. The horns count as magical for the purpose of overcoming resistances. If you Stride at least 20 feet in a straight line toward a target immediately before making a horns Strike, the Strike gains the fatal d12 trait and you can attempt to Shove the target as a free action on a hit.
>
> **Heightened (3rd)** The horns' damage die increases to 1d10.
> **Heightened (5th)** The horns' damage increases to 2d8. The minimum Stride distance for the charge bonus reduces to 10 feet.
> **Heightened (7th)** The horns' damage increases to 2d10.
> **Heightened (9th)** The horns' damage increases to 3d10 and a successful charge Shove pushes the target 20 feet instead of 5 feet.

**Structured-vs-prose note:** `system.damage` holds only the base 1d8; every heightened die-size bump (1d10/2d8/2d10/3d10) lives only in the description text, consistent with the adapter warning.

## What changed, plain English

The spell's entire shape changed, not just its numbers. 5e's Body Enhancement: Horns is a one-shot, instantaneous melee spell attack — one action, hits once for 3d12 (avg 19.5), done. The PF2e conversion turns it into a self-buff: a 2-action, 1-minute non-sustained cast that grants a repeatable unarmed Strike (a weapon Strike using weapon proficiency, not a spell attack roll) for the rest of the duration.

- **Numbers:** base hit damage dropped from 3d12 (one-shot) to 1d8 (repeatable weapon Strike); the charge bonus die became a "fatal d12" trait rather than the 5e's simultaneous push/prone/+1d12 rider menu.
- **Structure:** the 5e "melee spell attack" (spellcasting modifier) became a PF2e "unarmed Strike" (class DC/weapon proficiency), with an added proficiency-substitution clause ("if your weapon proficiency with martial weapons is higher... your horns use that proficiency instead") that has no 5e basis. The 5e Strength saving throw for push/prone is gone; the PF2e charge-shove is instead "you can attempt to Shove... as a free action" (i.e., it triggers the normal Shove action's own defense, not a bespoke save).
- **Heightening:** 5e scales by spell-slot level, uncapped, +1d12 per slot above 2nd every time it's cast. PF2e heightening is fixed at ranks 3/5/7/9 with die-size bumps only (and the rank-9 tier restores a push, 20 ft instead of 5 ft).
- **Content dropped from 5e:** the knock-prone charge option; the Strength saving throw entirely; the "choose one of three" charge-rider menu (collapsed to a single fixed shove+fatal outcome).
- **Content added with no 5e basis:** the entire "1-minute self-buff granting a repeatable Strike" structure (5e was instantaneous, no duration); the weapon-proficiency-substitution clause; "counts as magical for the purpose of overcoming resistances" language; being "trained" with the attack.

## Converter's notes

- **Anchor:** "Body Enhancement: Claws (rank 1 template); Hydraulic Push (rank 1, spell-attack with push rider) — Horns is the rank-2 step-up for push/charge"
- **Archetype:** buff (morph; natural attack grant with charge bonus)
- **balanceBullets:**
  - "Rank bumped to 2 (from 5e level 1): 3d12 bludgeoning (avg 19.5) at level 1 is far above the rank-1 budget (max ~7 avg for a slotted 1-target spell); rank 2 with 1d8 and a charge rider is the correct calibration."
  - "Charge bonus (fatal d12 + free Shove after 20 ft Stride) is the horns-specific flourish. Fatal d12 on a 1d8 base brings the crit ceiling to 1d12 minimum, rewarding the setup."
  - "Three simultaneous 5e charge options (push, prone, or +1d12) collapsed to one (shove + fatal) to avoid the 'Everything Spell' anti-pattern."
  - "Bludgeoning at 1d8 base (larger die than Claws/Fangs at 1d6 piercing) is appropriate for a heavier-impact natural weapon at the rank-2 tier."
  - "Morph (not polymorph) — partial horn growth, same rationale as other BE entries."
- **overridable:**
  - "Knock-prone on charge could be restored as a Fortitude save on hit if you want the traditional 'goring charge' flavor — would require a save action and slightly more complexity."
  - "The fatal d12 could be replaced with a +1d12 damage bonus on charge, closer to the original +1d12 option in the 5e text."
- **checklistFailures:** none.

## Similar official spells

- **Claws of the Otter** (rank 2) — self buff granting a claws unarmed Strike (1d4 slashing + 1d6 cold, agile/finesse) plus a Swim-Athletics bonus; 1-hour duration, 2-action cast. Closest direct analog: same "buff grants a natural weapon Strike" template, but built around a persistent, no-rider bonus-damage die rather than a charge-triggered rider.
- **Clawsong** (rank 2) — buffs an *ally's* existing claw attack (adds versatile piercing / bumps the die, deadly 1d8 if already upgraded); sustained 1 minute, 30 ft range. Comparable rank and duration tier, but targets another creature's existing natural weapon rather than granting a new one.
- **Enlarge** (rank 2) — self/ally buff granting +5 ft reach (10 ft from Tiny) and a flat +2 status bonus to melee damage rolls, 5-minute duration, no action-gated rider. Useful potency reference: a flat, no-setup +2 damage bonus vs. Horns' setup-gated fatal d12 + shove.

## Prior astra touches

None. `revisions.md` does not list Body Enhancement: Horns among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations), so no sweep or hand-edit has touched it since seeding.

## Open flags

- **Data mismatch:** the vendored 5e original (`gen_homebrew.json`) records `"level": 2`, but both jmnario's `convertedFromSpiritOf.originalLevel` and `_conversion_notes.json` state `"originalLevel": 1`, and the balance bullet text explicitly reasons from "5e level 1" ("Rank bumped to 2 (from 5e level 1)... at level 1 is far above the rank-1 budget"). The actual 5e source is level 2, not level 1 — the stated rationale for the rank bump is built on a level that doesn't match the source data.
- Structured `system.damage` is frozen at the base 1d8; all heightened die-size increases (1d10/2d8/2d10/3d10) exist only as description prose, per the adapter warning — nothing heightenable shows up outside the description text.
- No residual 5e-isms (no death saves, no "bonus action" language, no material component text — matches Remaster's no-materials convention).
- No curse-removal wording, no affliction text, no reaction/Trigger line to check (not a reaction spell).

## Options & staff lean (enrichment, 2026-07-23)

The −1.24 COLD is the §4a weapon/morph artifact (repeatable Strike vs per-cast budget).
The conversion is a deliberate full redesign — one-shot 3d12 nuke → BE-family morph
Strike-grant (1d8, heavier die than Claws/Fangs' 1d6) with the charge flourish as fatal
d12 + free Shove — and it reads rank-fair next to Claws of the Otter r2. The dossier's
level mismatch (notes reason from "5e level 1" but the source is level 2) lands harmless:
rank 2 matches the actual source level anyway — record as vendor-notes errata only.

- **A. Record artifact, keep as-is** — family-consistent, the collapsed charge menu was
  a stated anti-Everything-Spell choice.
- **B. Restore knock-prone via the converter's overridable Fort-save** — traditional
  goring-charge flavor at the cost of the complexity he deliberately avoided.
- **C. Swap fatal d12 → flat +1d12 on charge** — closer to the 5e menu option, lower
  crit ceiling.

**Lean: A.**
