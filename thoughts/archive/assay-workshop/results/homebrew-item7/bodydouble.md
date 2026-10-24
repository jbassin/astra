# Bodydouble

## Header

- **Rank:** 3
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Current assay line:** `kind: ledger`, `reasonCode: utility`, `rawSkipReason: "no-priceable-effect (no damage, no conditions, no modifiers)"`, `routing: ledger:utility`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, illusion, kosmoturgy, manipulate, teleportation, visual — rarity common
- **Traditions:** arcane, divine, occult
- **Cast:** 2 actions
- **Range:** self — **Target:** you
- **Defense:** none
- **Duration:** sustained up to 1 minute
- **Structured damage:** none (`{}`)
- **Heightening:** fixed levels 5/7 (empty structured payloads — text-only)

## The 5e original

- **Level:** 3 (source file `gen_homebrew.json`)
- **School:** kosmoturgy
- **Casting time:** 1 action
- **Range:** self
- **Components:** S + V (no material)
- **Duration:** 1 minute, concentration
- **Classes:** Cleric, Paladin

> You twist space in such a way that you can be in two places at once. You gain control of a double that begins by occupying the same space as you. As a bonus action, you can manifest the double up to 20 feet away from you; you can also use it as the source of any weapon attack you make or spell you cast, as if you were standing in the double's spot. At the end of your turn, the double returns to your space.
>
> The bodydouble can't be attacked, and is only visible at the moment of attack. It has no real, physical presence except in the moment when it appears.

No `entriesHigherLevel` section is present in the 5e source — the original has no upcast text.

## The conversion (canonical store)

> You fold space around yourself, creating a flickering double that exists simultaneously where you stand and where you project it. The double occupies the same space as you when the spell is cast. The double has no physical presence and cannot be attacked, damaged, or interacted with by creatures. It appears only at the moment of an attack or spell cast, visible as a brief spatial shimmer.
>
> Each time you Sustain this spell, you can take one of the following actions:
>
> **Project (1 action):** You shift the double to any point within 20 feet of you. The double remains projected until the start of your next turn unless you return it sooner.
> **Strike or Cast from Double (free action, once per round):** When you make a Strike or Cast a Spell with a range other than self or touch, you may use the double's current location as the origin point for that action (measuring range, area, and line of sight from the double's position instead of your own).
>
> The double collapses if it would be more than 30 feet from you at any time. Creatures may attempt a Perception check against your spell DC to realize the double is illusory (this check is triggered when they witness the spell's effect).
>
> **Heightened (5th)** You can project the double up to 40 feet away. The double also functions as a cover source (you can take cover relative to the double's position).
> **Heightened (7th)** You can maintain two doubles simultaneously. Each double can be the source of separate Strikes or Spells (once per double per round). Both doubles must remain within 30 feet of you.

This description is byte-identical to jmnario's baseline conversion (confirmed via `revisions.md` — 0 deviations for this spell).

## What changed, plain English

- **Action economy:** 5e used a free-standing bonus action each turn to (re-)manifest the double, no ongoing spell-slot commitment beyond initial cast + concentration. PF2e reworks this onto the Sustain mechanic — Project is the Sustain action (1 action) each round, and a separate free action (once per round) lets you Strike/Cast from the double's location. Net action load is similar in spirit but restructured onto PF2e's sustain/free-action grammar rather than a bonus action.
- **Range cap added:** PF2e adds a hard 30-foot leash — the double collapses if it would be more than 30 feet from the caster. 5e has no such cap (only the 20-foot manifest distance, with no stated maximum once manifested at a fixed spot).
- **Disbelief mechanic added:** PF2e adds a Perception check vs. spell DC, triggered when a creature witnesses the double's effect, to realize it's illusory. 5e has no disbelief/detection mechanic for the double at all.
- **Traits added with no clean 5e basis:** illusion, visual, teleportation, kosmoturgy (school-as-trait). 5e assigned only a homebrew "kosmoturgy" school, no illusion/visual/teleportation trait tagging.
- **Heightening is entirely new content:** 5e Bodydouble has zero upcast/higher-level text. Both PF2e heightened tiers (5th: 40 ft projection + cover; 7th: two simultaneous doubles) are wholly invented for the conversion — there is no 5e basis for either.
- **Numbers:** 5e's fixed 20-foot manifest distance carries over as the PF2e base-rank projection range unchanged; the "end of turn" auto-return became "remains until start of next turn unless returned sooner" — functionally similar but phrased around PF2e's turn-order convention.

## Converter's notes

- **Anchor:** "Mirror Image (rank 2, illusion, self, 1 min — 3 images intercept attacks); Bodydouble is rank 3 and adds offensive projection rather than defensive intercept"
- **Archetype:** utility/combat (spatial double for offense/positioning)
- **balanceBullets:**
  - "Mirror Image (rank 2) is purely defensive; Bodydouble (rank 3) is primarily offensive — using the double as an attack origin point rather than an attack-intercept screen. This is the correct rank-step difference."
  - "The double cannot be attacked or interacted with, which means it has no defensive value at all — unlike Mirror Image — preserving the offensive-only niche."
  - "Sustained up to 1 min (PF2e combat cap) with a Sustain-to-reposition design means the double's position must be actively maintained, preventing free persistent range extension."
  - "Perception-check disbelieve (DC = spell DC) gives counterplay without trivializing the double; creatures that witness the effect can attempt to understand it."
  - "Traditions arcane + divine + occult (kosmoturgy/space-bending spans matter+mind / spirit+life / mind+spirit); primal excluded."
- **overridable:**
  - "Could add the teleportation trait if the GM interprets the double's projection as a spatial shift for the caster rather than a separate constructed image — this would make Dimensional Lock affect the spell."
  - "The double could be given a defensive function (counts as cover for the caster) at the base rank — currently it's purely offensive, which may disappoint players who want the defensive Mirror-Image feel."
- **checklistFailures:** none.

## Similar official spells

- **Mirror Image** (rank 2) — three illusory duplicates that intercept attacks with a shrinking chance to hit the real you; purely defensive, no offensive-origin function. The explicit conversion anchor.
- **Wooden Double** (rank 3) — a reaction spell: a wooden block substitute (Hardness 5, 20 HP) takes a critical hit in your place, then you Step. Same rank, same "stand-in that absorbs harm" fiction, but reactive/defensive rather than a sustained offensive-projection tool.
- **Mislead** (rank 6) — turns you invisible and creates an independently-acting illusory duplicate that can take a full turn of actions (sustained 1 minute). Shows the high-rank ceiling for "a double that can act": Mislead's duplicate can fully act on its own, well beyond Bodydouble's origin-point-only function, three ranks higher.

## Prior astra touches

None. `revisions.md` does not list Bodydouble among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations).

## Open flags

- **Internal contradiction in jmnario's own vendor data:** the conversion's `traits` array (both in `all_spells_pf2e.json` and the store) includes `teleportation`, but the accompanying `changedElements` note explicitly states "Teleportation trait NOT added for the double itself (the double doesn't teleport; the caster stays in place)." The trait list and the note disagree with each other.
- No residual 5e-isms (no "bonus action" text survives into the PF2e description, no material component, no death-save language).
- No curse-removal wording, no affliction text.
- Not a reaction spell — no Trigger line to check.
- Structured damage field is empty (`{}`), consistent with the prose (no damage anywhere in the spell).
