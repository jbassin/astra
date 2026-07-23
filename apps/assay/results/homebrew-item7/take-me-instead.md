# Take Me Instead

## Header block

- **Rank:** 2 (store `system.level.value` = 2)
- **Routing:** buff
- **Pool reason:** wide-range (manual pool) — scorer comparables span rank 1–7 (LOW-INFORMATION)
- **Adapter warnings:**
  - "excluded 1 self-directed damage dice from EV (2d8 void) — a cost paid by the caster, not the spell's output"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, healing, mercuromancy, vitality
- **Traditions:** divine, occult, primal
- **Cast:** 1 minute (`time.value` = "1 minute")
- **Range:** touch
- **Targets:** the corpse of 1 creature that died within the last hour
- **Defense:** none (`system.defense` = null)
- **Duration:** instantaneous (with 1-hour rider on caster), not sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 2
- **School:** mercuromancy
- **Casting time:** 1 minute
- **Range:** Touch
- **Components:** V only (no somatic, no material)
- **Duration:** Instantaneous
- **Classes:** Bard, Druid, Sorcerer, Warlock, Wizard (PHB), Seeker (SW)

> When you cast this spell, touch the corpse of a creature you knew well that died within the last hour. Make a DC 12 Charisma (Persuasion) ability check. You have advantage in this check if the target creature was a family member or a lover of yours. On a success, the creature is resurrected with 1 hit point and you are reduced to 0 hit points, making death saving throws as usual. For the next hour, you cannot be stabilized or healed, and if you die, you cannot be resurrected by any spell of level 4 or lower.

No `entriesHigherLevel`.

## The conversion (canonical store)

> You touch the corpse of a creature you knew well and make a solemn bargain with fate: you offer yourself in its place. This spell requires 1 minute of uninterrupted casting, during which you must remain in contact with the corpse.
>
> Attempt a DC 20 Charisma-based skill check (Diplomacy or Society, your choice). If the creature was a family member, a close companion, or a romantic partner, you gain a +4 circumstance bonus to this check.
>
> On a success, the creature is restored to 1 HP and can act normally. You immediately fall `Unconscious` and begin making recovery checks as if you had reached 0 HP and the `Dying` condition (you immediately gain `Dying 1`). For the next 1 hour, you cannot benefit from healing effects (including potions, spells with the healing trait, and natural recovery); you can still be stabilized and can make recovery checks normally. If you die while under this rider, no spell of rank 4 or lower can restore you to life.
>
> On a failure, the corpse is unaffected. You take 2d8 void damage (no save) from the strain of the attempt.
>
> ---
> **Heightened (4th)** The DC decreases to 15, and the creature returns with 25% of its maximum HP instead of 1 HP. The no-healing rider on the caster is reduced to 10 minutes.
>
> **Heightened (6th)** The DC decreases to 10. The creature returns with 50% of its maximum HP. You still fall to `Dying 1`, but the no-healing rider on the caster is removed.

(`Unconscious` and `Dying` are `@UUID[Compendium.pf2e.conditionitems.Item...]` links in the source HTML, rendered here as plain labels.)

**Structured field disagreement:** `system.damage` = `{}` (empty), despite the prose explicitly stating "You take 2d8 void damage (no save) from the strain of the attempt" on a failed check. The adapter warning explains this is deliberate — the 2d8 void damage is self-directed (a cost paid by the caster on failure, not damage the spell deals to a target), and the scoring model excludes self-directed damage dice from its EV calculation — but the structured `damage` object still contains no trace of this 2d8, so a reader relying only on structured fields would miss it entirely.

## What changed, plain English

The "trade your life-state for theirs" bargain, the DC-based Charisma check, the close-relationship bonus, the corpse/1-hour-window requirement, and the no-healing rider are all preserved. The biggest changes are in what "reduced to 0 HP" means mechanically and what happens on failure.

- **"Reduced to 0 HP" → "Dying 1":** 5e's "you are reduced to 0 hit points, making death saving throws as usual" has no direct PF2e equivalent (PF2e has no instant-reduce-to-0 mechanic), so the conversion maps it to falling Unconscious and immediately gaining `Dying 1`, then making recovery checks. This is a faithful mechanical re-derivation, not a literal translation, since PF2e's dying/recovery-check system works differently from 5e's death-saving-throw system.
- **Skill check DC raised substantially:** 5e's DC 12 Charisma (Persuasion) check becomes PF2e DC 20 (Diplomacy or Society) at base rank — nearly double the original difficulty. The conversion notes justify this explicitly (see Converter's notes) as compensating for 5e's DC 12 being "trivially easy... at rank 2."
- **Advantage → flat bonus:** 5e's "advantage on the check" for a close relationship becomes a flat "+4 circumstance bonus" in PF2e (PF2e has no advantage/disadvantage mechanic).
- **Added failure consequence — no 5e basis:** the 5e original has **no stated consequence for a failed check** — "on a failure" isn't addressed at all in the 5e text (only success is described). The PF2e conversion adds an entirely new failure clause: "the corpse is unaffected. You take 2d8 void damage (no save) from the strain of the attempt." This is invented content, not translated from anything in the 5e entry.
- **Rank cap on resurrecting the caster:** 5e's "you cannot be resurrected by any spell of level 4 or lower" becomes PF2e's "no spell of rank 4 or lower can restore you to life" — a direct level-to-rank translation, unchanged in magnitude.
- **Heighten:** entirely new — 5e has no upcast text. PF2e adds two heighten tiers (4th: DC 15, target returns at 25% max HP, rider shortened to 10 min; 6th: DC 10, target returns at 50% max HP, rider removed entirely) with no 5e basis.
- **Cast time:** unchanged (1 minute in both).

## Converter's notes

- **Anchor:** "no clean analog — closest is Raise Dead (rank 6 ritual) but Take Me Instead is far weaker (1 HP, 1-hour lockout, caster pays with dying 1)"
- **Archetype:** utility (sacrifice resurrection)
- **Balance bullets:**
  - "The lowest-rank resurrection in PF2e is Breath of Life (rank 5, reaction, prevents death rather than reversing it). Take Me Instead reverses death at rank 2 by imposing dying 1 on the caster — a massive personal cost that justifies the low rank."
  - "DC 20 Diplomacy/Society check replaces 5e's DC 12 Charisma(Persuasion) — the trivial difficulty was raised to match the dramatic stakes of a rank-2 resurrection. The +4 for close relationships preserves the 5e advantage clause."
  - "1-minute cast time is the correct exploration-tier cost for a resurrection equivalent; the caster is exposed and fully committed during the ritual."
  - "No-healing-for-1-hour rider on the caster + rank cap on caster resurrection are pure fiction-driven mechanical stakes that make the spell feel dangerous without overpowering it."
  - "Failure consequence (2d8 void damage) is a non-obvious downside that rewards preparation and roleplay over pure optimization."
- **Overridable:** "The failure damage (2d8 void) could be removed if the GM prefers that failure is simply 'nothing happens' — the current design adds mechanical tension to the skill check." / "The 'no resurrection by rank 4 or lower' clause mirrors the 5e 'no level 4 or lower resurrection' but could be raised to rank 5 for stricter consequences."
- **Checklist failures:**
  - "Spell has no save and targets a corpse — the saving throw row is null, which is correct. The skill check (not a saving throw) is the resolution mechanic. This is unusual but not a rules violation — noted for GM review."
  - "The plan notes Take Me Instead under incapacitation-gated spells to verify. The caster's dying 1 state is self-imposed (not imposed on an enemy), so incapacitation trait does NOT apply here."

## Similar official spells

- **Breath of Life** (rank 5) — the converter's own explicit comparison point; a reaction that prevents a death (5d8 healing at the trigger moment) rather than reversing an already-completed death. Three ranks above Take Me Instead, and structurally different (trigger/prevention vs. touch/corpse/reversal), illustrating why the converter calls this "no clean analog."
- **Raise Dead** (rank 6) — the converter's stated closest anchor; returns a creature dead ≤3 days with 1 HP, no prepared spells, and requires a costly consumable material (not shown as a bare skill check). Four ranks above Take Me Instead — the rank gap is the converter's central justification for this spell's steep caster-side cost.
- **Resurrect** (ritual, rank 5) — the ritual-track version of raising the dead, requiring a Religion check with critical-success/success tiers rather than a bare pass/fail Charisma check; useful as a check-based-resurrection structural comparable.
- **Revival** (rank 10) — the top of the resurrection ladder (returns a creature dead any length of time, full HP); included for scale, showing how far above Take Me Instead's rank-2 partial-HP revival the ceiling actually sits.

## Prior astra touches

Checked `apps/assay/homebrew/revisions.md`: **no entry** for "Take Me Instead" — 0 deviations from a fresh re-conversion of the vendored baseline (store matches adapter output exactly, no hand edits recorded). The trait set (`concentrate, healing, mercuromancy, vitality`) adds the custom "mercuromancy" school-trait tag (mapped from the 5e school field) on top of jmnario's traits — baked into the current adapter, consistent with the repo-wide trait-hygiene/school-traits sweep.

## Open flags

- `system.damage` is empty despite the prose stating an explicit "2d8 void damage (no save)" failure consequence — deliberate per the adapter warning (self-directed cost, excluded from EV), but worth the reviewer's attention since it means the spell's only damage-dealing clause is invisible to any tooling that reads only the structured damage field.
- The 5e original has no stated failure consequence at all; the "2d8 void damage on failure" clause is wholly new content added during conversion (documented candidly in the converter's own balance bullets as an intentional design addition, not a translation).
- The converter's own checklist-failures note flags the null saving-throw row as "unusual but not a rules violation" — a skill check (not a saving throw) is this spell's resolution mechanic, which is atypical for a rank-2 spell in the store overall (worth the reviewer knowing this is a self-flagged unusual pattern, not an oversight).
- No residual 5e-isms in the mechanical language itself ("death saving throws" is fully replaced by "Dying 1" and recovery checks) — clean on that axis. No material-component residue (5e had none — verbal-only).
- Traits include the custom homebrew school-trait tag "mercuromancy" (mapped from the 5e school field), which has no counterpart in the standard PF2e trait taxonomy.
