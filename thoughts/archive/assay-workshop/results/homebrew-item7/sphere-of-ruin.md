# Sphere of Ruin

## Header block

- **Rank:** 7 (store `system.level.value` = 7)
- **Routing:** comparables
- **Pool reason:** wide-range (manual pool) — scorer comparables span rank 2–9 (LOW-INFORMATION)
- **Adapter warnings:** none
- **Traits:** concentrate, incapacitation, manipulate, mental, mercuromancy
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`time.value` = "2")
- **Range:** 120 feet
- **Targets:** 1 creature
- **Area:** none (`system.area` = null — the "sphere" is a summoned object, not a spell area)
- **Defense:** Will save (not basic)
- **Duration:** 1 minute, sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 7
- **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** 120 feet
- **Components:** V, S, M (an iridescent gem worth 500 gp)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Bard, Druid, Sorcerer, Warlock, Wizard (PHB), Seeker (SW)

> You summon a sliver of Ruin and choose a creature you can see to be its target. The sliver is a 1-foot-radius sphere of chaotic, swirling color that appears adjacent to you. At the end of each of your turns, the sphere moves 30 feet toward its target along the shortest path. The sliver can fly and can pass through creatures and solid objects. Creatures that occupy the same space as the sphere at any time must make a Charisma saving throw. On a failure, roll 1d10 on the table below to discover its effect on their behavior.
>
> You can change the sliver's target to another creature you can see as a bonus action; the sliver then pursues that target.

| d10 | Behavior |
|---|---|
| 1 | Creature must expend the entirety of its movement moving in a straight line in a random direction. |
| 2–6 | The creature is stunned until the start of your next turn. |
| 7–8 | The creature immediately makes a melee attack against the nearest creature within its reach. |
| 9–10 | The creature is unaffected. |

No `entriesHigherLevel`.

## The conversion (canonical store)

> You summon a swirling iridescent sliver of Ruin — a one-foot sphere of chaotic unreality — adjacent to a creature you can see within range. At the end of each of your turns while you sustain this spell, the sphere moves up to 30 feet toward its current target; it can fly and pass through solid objects and creatures, though it cannot end its movement inside a solid object. When the sphere occupies the same space as a creature for the first time on a turn, that creature must attempt a Will save against your spell DC.
>
> As a single action, you can redirect the sphere to a new creature you can see; the sphere then pursues that target instead.
>
> If you are sustaining both this spell and Sphere of Preservation, this spell's save DC increases by 2.
>
> **Critical Success** The creature is unaffected and is temporarily immune to this casting for 10 minutes.
> **Success** The creature is unaffected.
> **Failure** Roll 1d6 to determine the effect: 1–3: the creature is `Stunned 1`; 4–5: the creature is `Confused` until the start of your next turn; 6: the creature is `Slowed 1` until the start of your next turn.
> **Critical Failure** Roll 1d6 to determine the effect: 1–3: the creature is `Stunned 2`; 4–5: the creature is `Confused` for 1 round and must attempt a Will save at the start of its next turn to end the confusion; 6: the creature Strides in a random direction using its full Speed and falls `Prone` at the destination.

(`Stunned`, `Confused`, `Slowed`, `Prone` are `@UUID[Compendium.pf2e.conditionitems.Item...]` links in the source HTML, rendered here as plain labels.)

Structured fields: `system.damage` = `{}` (no direct damage — matches prose, all effects are conditions). `system.defense.save` = `{statistic: "will", basic: false}` — matches ("must attempt a Will save," non-basic since outcomes are qualitative condition tiers, not half/full damage).

## What changed, plain English

The pursuing-sphere concept, its movement/phasing rules, and the target-redirect option are all preserved. The failure table and the summoning point are where the conversion diverges most.

- **Where it appears:** 5e's sphere "appears adjacent to **you**" (the caster); PF2e's sphere appears "adjacent to a creature you can see within range" (the target) — a genuine mechanical change to the opening position, not just a numbers translation. This changes how quickly the sphere can threaten the target on the first round.
- **Save trigger:** 5e triggers the save when a creature "occupy[ies] the same space as the sphere **at any time**" (i.e., every time, repeatedly); PF2e narrows this to "**the first time** on a turn" — a meaningful frequency reduction (a creature standing in the sphere's space for a whole turn is only tested once, not continuously).
- **Save stat:** 5e Charisma save → PF2e Will save (organ-mapping convention).
- **Failure table:** 5e's d10 four-row table (1: forced move; 2–6: stunned until your next turn; 7–8: forced melee attack; 9–10: unaffected) is replaced by an entirely restructured d6 three-tier table split across TWO degrees of success (failure vs. critical failure), rather than one table for "failure." The specific effects also changed: the 5e "forced melee attack against nearest creature" outcome (rows 7–8, a 20% chance) has **no equivalent** anywhere in the PF2e version — it was dropped entirely, not merely renamed. The PF2e version instead adds Confused (which subsumes a similar "attack something/someone" idea but via the Confused condition's own random-target rules) and a new "Stride randomly and fall Prone" critical-failure-only outcome not present in 5e at all.
- **Critical success:** 5e's table has no separate "critical success" tier at all (5e is a flat pass/fail save with a table only for failure); PF2e adds a wholly new critical-success clause ("unaffected AND temporarily immune... for 10 minutes") with no 5e basis.
- **Redirect action:** 5e bonus action → PF2e single action.
- **Cross-spell synergy clause** ("If you are sustaining both this spell and Sphere of Preservation, this spell's save DC increases by 2") has no 5e counterpart — entirely new content tying this spell to its rank-6 sibling.
- **Material component dropped:** the 5e original requires "an iridescent gem worth 500 gp," and this was still present as a structured cost in the jmnario intermediate conversion (`cost: "an iridescent gem worth 500 gp (consumed)"`). The canonical store's `cost.value` is now empty string — the 500 gp cost has been dropped entirely. This is notable because the converter's own balance bullets (below) explicitly cite the gem cost as a load-bearing balance lever ("a meaningful per-cast cost at rank 7... makes the sphere less spammable than a typical rank-7 slot").
- **Prose trim recorded in revisions.md:** the store's description is 65 characters shorter than a fresh re-conversion of the current baseline would produce (1,818 vs. 1,883 chars) — see Prior astra touches.

## Converter's notes

- **Anchor:** "Quandary / Confusion (rank 8/4) — sustained single-target incapacitation; designed at rank 7 with a mobile-sphere framing"
- **Archetype:** control/save-or-suck (sustained single-target)
- **Balance bullets:**
  - "No damage: the sphere deals no direct damage, relying entirely on the chaos-condition table — consistent with pure-control anchors like Confusion (no damage, rank 4) and Slow (no damage primary, rank 3)"
  - "500 gp consumed gem is a meaningful per-cast cost at rank 7; this tax makes the sphere less spammable than a typical rank-7 slot"
  - "Incapacitation trait: stunned and confused outcomes on failure/crit fail qualify (confused is Tier S, hard disable); incapacitation means bosses save one degree better"
  - "Sphere mobility (30 ft/turn, can fly and pass through objects) paired with sustained duration creates a pressure mechanic — target cannot simply move away"
- **Overridable:** "D6 vs d10 table: the 5e source had a d10 table; collapsed to d6 three-tier for PF2e simplicity; GM may restore a d10 version with additional rows" / "Synergy DC bonus with Sphere of Preservation: +2 to save DC when both are sustained simultaneously; this assumes Sphere of Preservation (rank 6) exists as a companion spell from batch 6 — if batch 6 differs, remove this synergy note"
- **Checklist failures:** "Stunned 1 technically requires incapacitation per conditions.md Tier A table; added. No silent fix — documented here."

## Similar official spells

- **Confusion** (rank 4) — the converter's own partial anchor; area save-based random-behavior effect on Will save, three outcomes (babble/stunned, wander, attack nearest). Three ranks below Sphere of Ruin, useful as a same-family behavioral-randomization comparable at a much lower rank/cost.
- **Warp Mind** (rank 7) — same rank, Will-save mental control spell; a same-rank Will-save-mental reference point (not independently opened for full text here but confirmed present in the snapshot at rank 7).
- **Slow** (rank 3) — no-damage single-target control via Will/Fortitude-style tiered save outcomes (Slowed 1 for 1 round on success, longer on failure); a low-rank tiered-condition-table comparable.
- **Nightmare** (rank 4) — a delayed-trigger Will-save debuff with graduated failure/critical-failure consequences; useful as a "no direct damage, condition-table-driven" structural comparable at a lower rank.
- Scorer comparables (low-information): rank range 2–9 supplied by the assay scorer's manual pool (wide-range, no specific named comparables).

## Prior astra touches

`apps/assay/homebrew/revisions.md` **does** carry an entry for this spell:

> ### Sphere of Ruin (`sphere-of-ruin`)
> - description: length delta -65 chars (store=1818, baseline=1883)

This means the current store's description text is 65 characters shorter than what a fresh re-conversion of the vendored jmnario baseline (run through the current adapter) would produce — i.e., someone hand-edited the prose after seeding. Comparing the store text to jmnario's raw conversion text, the most likely source of the delta is the final synergy sentence: jmnario's version reads "The sphere is paired with Sphere of Preservation (rank 6): while both spells are sustained by the same caster simultaneously, the Ruin sphere's save DC increases by 2." — the store's version reads "If you are sustaining both this spell and Sphere of Preservation, this spell's save DC increases by 2," a shorter rephrasing that drops the explicit "(rank 6)" cross-reference and the "paired with" framing language, while keeping the same mechanical content.

## Open flags

- The 500 gp material-component cost, explicitly called a load-bearing "spam tax" in the converter's own balance bullets, has been dropped from the structured `cost` field in the current store (present as structured cost in the jmnario intermediate stage, absent now).
- The converter's own "changedElements" note states "5e bonus-action redirect → PF2e single action redirect" and separately "Heightened array left empty: rank 7 hard-CC... no clean +1 delta available" — confirmed: `system.heightening` is entirely absent from the store JSON (no `heightening` key at all), consistent with "left empty," though note this is a fully absent field rather than an empty-object placeholder (contrast with other spells in this batch that keep an empty-object placeholder per level).
- One 5e failure-table outcome (the 20%-chance "forced melee attack against the nearest creature") has no analog anywhere in the PF2e version's failure or critical-failure tables — a clean content drop, not renamed or folded into another outcome.
- Asymmetric cross-reference: this spell's text explicitly references Sphere of Preservation's synergy bonus, but Sphere of Preservation's own description makes no reciprocal mention of Sphere of Ruin — a reviewer reading either spell in isolation would only learn about the synergy from this side.
- Curse-removal convention: not applicable — this spell has no curse trait.
- Traits include the custom homebrew school-trait tag "mercuromancy" (mapped from the 5e school field), which has no counterpart in the standard PF2e trait taxonomy.

## Options & staff lean (enrichment, 2026-07-23)

**This is the deferred batch-0 spam-tax decision point** (500 gp consumed gem stripped by
the cost policy; his balanceBullets call it load-bearing). Key observation: the PF2e
conversion already self-nerfed relative to 5e in exactly the ways the tax was paying
for — saves once per turn instead of continuously, a d6 table lighter on hard-stun than
5e's 50% stun band, the incapacitation trait (bosses save one tier better), and degree
tiers with crit-success immunity. The tax looks vestigial on this version.

One real fidelity item: the sphere now appears **adjacent to the target** instead of 5e's
adjacent to YOU — the slow inexorable pursuit was the spell's dread fiction, and the
caster-adjacent start is also a mild pacing nerf that neatly offsets the lost tax.

- **A. Leave the cost stripped; restore the caster-adjacent start** — pursuit fiction
  back, first save typically delayed a round, rank 7 carries the rest. No cost-policy
  exception needed.
- **B. Restore the 500 gp consumed gem** — his stated lever, as a policy exception;
  double-taxes an already-toned-down conversion.
- **C. Both** — strictly harshest; unmotivated.

Minor: the Sphere of Preservation synergy is one-directional in text — add the
reciprocal sentence to Preservation when its (fast-lane) review comes up.

**Lean: A.**
