# Bestial Rage

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** buff — **Pool reason:** wide-range
- **Current assay line:** comparables rank range 1-9 (LOW-INFORMATION — that is why it is in the manual pool)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, gestalt, manipulate, morph
- **Traditions:** primal
- **Cast:** time.value = "1" (1-action spell)
- **Cost:** "" (empty — see Open flags)
- **Range:** self
- **Target:** "you"
- **Defense:** none structured (`system.defense = null`)
- **Duration:** "until your wild shape ends", not sustained
- **Heightening:** fixed, levels "5" and "7" (both empty objects — appendix-only text)

## The 5e original

- **Level:** 3rd
- **School:** Gestalt
- **Casting time:** 1 bonus action
- **Range:** Self
- **Components:** V, S, M (a sharp tooth)
- **Duration:** Special
- **Classes:** Druid
- **Ritual:** No

> You draw upon the collective's memory of wildshaping to refine your wildshaping. As part of casting this spell, you also transform as through the Wild Shape ability (expending an action to do so). Doing so still expends a charge of wildshape, and you cannot cast this spell if you have no charges remaining.
>
> You increase the speed and power of your wildshape but also increase its bulk. For the duration of this wildshape you have advantage on all melee attacks, but all melee attacks on you have advantage as well. The effect ends when you lose your form.

No `entriesHigherLevel` block in the 5e original — no upcast/higher-level text at all.

Note: the 5e text's own casting-time fields disagree internally — the `time` field says "bonus action" but the `entries` prose says "expending an action to do so" for the accompanying Wild Shape transformation (a pre-existing ambiguity in the 5e source itself, not something introduced by the PF2e conversion).

## The conversion (canonical store)

> You channel the gestalt collective's memory of wildshaping at its most savage, sharpening your current beast form into a state of heightened frenzy. This spell must be cast simultaneously with a wild shape polymorph spell or as part of activating a wild shape ability — if you are not transforming into a beast form on the same action, this spell fails harmlessly and the slot is not spent.
>
> For the duration of your current wild shape:
> - You gain a +1 status bonus to melee attack rolls made with your beast form's natural attacks.
> - Your beast form's natural attack damage dice increase by one step (d4 → d6 → d8 → d10 → d12).
> - Creatures attacking you with melee Strikes gain a +1 circumstance bonus to their attack rolls.
>
> This is a morph effect that layers on top of your wild shape polymorph. It does not stack with other morph effects applied to the same attack.
>
> If you have the Wild Shape class feat and use this spell on the same action as your wild shape activation, you expend the wild shape use normally. If your wild shape ends for any reason, this spell ends as well.
>
> ---
> **Heightened (5th)** The status bonus to melee attacks increases to +2, and the damage die step increases by two steps instead of one.
> **Heightened (7th)** You also gain a +2 status bonus to Athletics checks while in the frenzied form, and once per round when you score a critical hit with a natural attack, you may immediately make one additional natural attack as a free action (this additional attack takes the normal multiple-attack penalty).

## What changed, plain English

The core fiction (must be cast alongside a wild-shape transformation, sharpens the beast form into a state of frenzy, ends when the wild shape ends, both the caster's attacks and attacks against the caster are affected) is preserved, and the "cast fails harmlessly / doesn't apply if not transforming" gating carries over from the 5e "you cannot cast this spell if you have no charges remaining" restriction (though re-worded from a charge-based gate to an action-simultaneity gate — see below).

Structure/mechanics:
- 5e "advantage on all melee attacks" (Druid's own attacks) → PF2e "+1 status bonus to melee attack rolls made with your beast form's natural attacks" — advantage has no direct PF2e equivalent, converted to a flat status bonus.
- 5e "attacks on you [also] have advantage" → PF2e "creatures attacking you with melee Strikes gain a +1 circumstance bonus to their attack rolls" — same advantage-to-flat-bonus conversion, on the drawback side.
- **Content ADDED with no 5e basis:** "your beast form's natural attack damage dice increase by one step (d4 → d6 → d8 → d10 → d12)." The 5e original text says nothing about damage dice at all — its entire mechanical effect is "advantage on melee attacks" (to-hit only) plus the bulk/downside clause. The PF2e version invents an entirely new damage-scaling axis that has no 5e counterpart.
- 5e "also increase its bulk" (a stated but mechanically unspecified drawback — the 5e text never says what "increased bulk" does in play) → PF2e drops this clause entirely; there is no bulk-increase effect or downside of that kind in the PF2e version. This is a genuine DROP: the 5e original's stated cost is bulk increase, and the PF2e version's cost is instead "attackers get +1 circumstance to hit you," which is not equivalent (bulk affects size/space/carrying, not attack rolls).
- 5e "expending an action to [transform]... still expends a charge of wildshape" (Wild Shape treated as a 5e per-day-charge resource, consumed as part of casting this spell) → PF2e "if you have the Wild Shape class feat... you expend the wild shape use normally" — the converter's checklist-failure note explicitly states PF2e has no per-day Wild Shape charge system (Wild Shape is a class feat, not a resource pool), so this requirement was "softened to 'must be cast simultaneously with a wild shape polymorph spell.'" This is a structural departure flagged by the converter itself as needing GM review.
- 5e has NO higher-level text. PF2e ADDS two heighten tiers with no 5e basis: 5th rank (bonus to +2, damage-step increase to 2 steps), 7th rank (+2 Athletics, a free extra natural attack on crit once per round).
- 5e cast time "1 bonus action" → PF2e "1" action (no bonus-action concept in PF2e).
- 5e material component "a sharp tooth" is dropped entirely from the store — see Open flags.
- Traits: PF2e adds "gestalt" (school-as-trait pattern) while REMOVING the "primal" trait that jmnario's conversion had listed as both a trait and a tradition simultaneously — see Open flags.

## Converter's notes

- **Anchor:** "Haste (rank 3) — +1 action, 1 min, single target; Bestial Rage is narrower (wild shape only) but provides attack/damage boost rather than action"
- **Archetype:** buff (wild shape enhancer, morph)
- **Balance bullets:**
  - "The cast-simultaneously-with-wild-shape requirement is the primary balance restriction: this spell only functions as part of wild shaping, preventing it from being used outside that context."
  - "+1 status to melee attacks and one die-step damage increase for 1 minute matches a moderate rank-3 buff; the dual disadvantage (attackers +1 circumstance) is the cost, matching the 5e 'advantage both ways' tradeoff."
  - "Morph (not polymorph) is the correct trait: this layers on top of a wild shape without suppressing it, which is the intended design."
  - "Primal-only tradition is correct: this is druid/gestalt animal magic, not arcane or occult."
  - "The 'both sides benefit from the aggression' design creates a high-risk/high-reward dynamic appropriate for a battle-focused buff at rank 3."
- **Overridable:**
  - "Could be restricted to Druid or classes with Wild Shape class feat, rather than any primal caster — this would make it more like the intended focus-spell design."
  - "The +1 circumstance to attackers could be framed as a –1 status to AC instead (equivalent mechanically, simpler to track)."
- **Checklist failures:**
  - "The 5e spell requires expending a Wild Shape charge as part of casting. PF2e does not have a Wild Shape charge system — Wild Shape is a class feat, not a per-day ability. The requirement was softened to 'must be cast simultaneously with a wild shape polymorph spell.' This is a design departure that should be flagged for GM review."

## Similar official spells

- **Animal Form (rank 2)** — the actual PF2e wild-shape-granting spell (transforms the caster into a Medium battle form with fixed statistics). One rank below Bestial Rage, and the spell Bestial Rage is designed to layer on top of; useful as the baseline "what does a wild shape actually grant" reference.
- **Moon Frenzy (rank 5)** — a primal group buff that grants temporary HP, a Speed bonus, and natural weapon attacks (fangs/claws) using the target's own proficiency; a higher-rank official spell in similar "primal battle-frenzy" design space, useful for gauging how PF2e prices bonus natural-weapon damage at scale.
- **Heroism (rank 3)** — same-rank generic status buff (+1 to attacks, Perception, saves, skills) with a flat duration and no downside; a baseline for comparing Bestial Rage's narrower-but-double-edged (attackers also get +1) rank-3 buff design.
- **Enlarge (rank 2)** — grants a damage-die-step increase to a creature's Strikes (among other size-based effects) at a lower rank; a direct comparable for evaluating how much rank PF2e typically spends on a "bump your weapon/attack damage die by one step" effect in isolation.

**Scorer comparables (low-information):** rank range 1-9 — no named comparable spells were supplied by the scorer for this spell; it was routed to the manual comparables pool specifically because that range is too wide to be informative.

## Prior astra touches

None found in `revisions.md` — Bestial Rage matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.heightening.levels["5"]` and `["7"]` are both empty objects; both heighten tiers live only in the description HTML per the adapter warning.
- Material component drop: jmnario's conversion specifies `cost: "a sharp tooth"` (matching the 5e original's `m: "a sharp tooth"` material component), but the store's `system.cost.value` is an empty string and `system.requirements` is also empty — the sharp-tooth material component is not represented anywhere in the store (neither structured field nor description prose).
- Trait discrepancy: the store's traits list is `[concentrate, gestalt, manipulate, morph]`, traditions `[primal]`. jmnario's own conversion lists traits as `[concentrate, manipulate, morph, primal]` with traditions ALSO `[primal]` — i.e., jmnario's conversion listed "primal" redundantly as both a trait and the sole tradition. The store's traits list removes that redundant "primal" trait entry and adds "gestalt" (school-as-trait pattern) in its place. Note this differs from the abjuration/transmutation-displacement pattern seen elsewhere in this chunk (there, a real functional PF2e trait like "abjuration" is lost; here, the removed trait was a duplicate of the tradition already present).
- The 5e original's stated drawback for the wild shape ("also increase its bulk") is dropped without replacement in the PF2e version — the PF2e drawback ("+1 circumstance bonus to attackers") is a different kind of cost (to-hit vulnerability rather than size/bulk/encumbrance), and no bulk-related effect appears anywhere in the store's description.
- The added "natural attack damage dice increase by one step" mechanic (base effect) and the added "free extra natural attack on crit" (7th-rank heighten) both have no textual basis anywhere in the 5e original, which only ever grants advantage on attack rolls (to-hit), never a damage-die change.
- Per the converter's own checklist-failure note, the 5e "Wild Shape charge" gating mechanism has no PF2e equivalent (Wild Shape is a class feat, not a per-day resource pool) — the conversion substitutes a "must cast simultaneously with a wild shape polymorph spell" requirement, explicitly flagged by the converter as a design departure warranting GM review.
