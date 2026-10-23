# Arcane Interdiction

## Header block

- **Rank:** 4 (store: `system.level.value = 4`)
- **Routing:** ledger:utility — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** antillurgy, concentrate, manipulate
- **Traditions:** arcane
- **Cast:** time.value = "2" (2-action spell)
- **Range:** self
- **Area:** 60-foot emanation
- **Defense:** none structured (`system.defense = null`)
- **Duration:** sustained, "1 minute"
- **Heightening:** fixed, levels "6" and "8" (both empty objects — appendix-only text)

## The 5e original

- **Level:** 4th
- **School:** Antillurgy
- **Casting time:** 1 action
- **Range:** Self (60-foot-radius sphere)
- **Components:** V, S (no material)
- **Duration:** Concentration, 1 minute (not "up to" — a fixed 1 minute)
- **Classes:** Sorcerer, Warlock, Wizard
- **Ritual:** No

> You stress the Weave in a 60-foot-radius sphere around you, making it harder to cast spells. When you move, the sphere moves with you. Any creature in the area, including you, must make a Constitution saving throw against your spell save DC when they try to cast a spell; if the saving throw fails, the spell also fails (it has no effect) and the spell slot is expended. A creature concentrating on a spell while within the sphere must make a DC 10 Constitution saving throw or it loses concentration. You are exempt from this effect for the sake of maintaining this spell.

No `entriesHigherLevel` block in the 5e original — no upcast/higher-level text at all.

## The conversion (canonical store)

> You stress the threads of magical energy in a 60-foot emanation centered on you, making it harder for spells to manifest within the area. The emanation moves with you. Any creature that attempts to Cast a Spell while inside the emanation must succeed at a flat check (DC 5 + the spell's rank) or the spell is lost — the slot is expended and the spell has no effect. You are exempt from this effect for the purpose of sustaining Arcane Interdiction itself.
>
> Additionally, any creature inside the emanation that is concentrating on a spell must attempt a DC 10 flat check at the start of each of its turns inside the area, or lose concentration on that spell.
>
> This spell's emanation is centered on you and moves with you. Creatures entering the area mid-turn must attempt the flat check if they cast a spell on that same turn.
>
> ---
> **Heightened (6th)** The flat check DC to cast spells in the area increases by 2 (DC 7 + spell rank), and the concentration check DC increases to 12.
> **Heightened (8th)** The flat check DC increases to 10 + spell rank, and the concentration check DC increases to 15.

## What changed, plain English

The core fiction (a 60-foot emanation/sphere centered on and moving with the caster, taxing spellcasting inside it, the caster exempt for the purpose of maintaining the spell itself) is preserved, including the parallel "concentrating creatures must save or lose concentration" clause.

Structure/mechanics:
- 5e "Constitution saving throw against your spell save DC" (a save, scaling with the target's Con and the caster's DC) → PF2e "flat check (DC 5 + the spell's rank)" (no stat scaling at all — pure die roll vs. a DC keyed to the *cast spell's* rank, not the target's ability score). This is a genuine mechanical redesign, not a straight save-type remap.
- 5e concentration-loss check is a fixed "DC 10 Constitution saving throw" → PF2e keeps DC 10 but converts it to a flat check as well, and changes the trigger from a one-time check when concentrating inside the area to a repeating "at the start of each of its turns inside the area" check — the 5e text implies a check while concentrating in the area generally but doesn't specify a per-turn cadence; PF2e's per-turn phrasing is an added structural precision.
- 5e "Concentration, 1 minute" (fixed duration once cast) → PF2e "sustained up to 1 minute" (requires ongoing action spend to maintain past the first round). Both require attention while active, but PF2e's phrasing explicitly frames it as a sustain-gated maximum rather than a flat timer.
- 5e has NO higher-level text at all. PF2e ADDS two heighten tiers with no 5e basis: 6th rank raises the flat-check DC by 2 and the concentration DC to 12; 8th rank raises the flat-check DC to "10 + spell rank" and the concentration DC to 15.
- Traits: PF2e drops the 5e class list (Sorcerer/Warlock/Wizard) in favor of "arcane" only as the sole tradition (5e implies Warlock could suggest occult overlap; PF2e narrows to arcane-only per the converter's own notes). "Antillurgy" (the school-as-trait pattern) replaces jmnario's "abjuration" trait — see Open flags.

## Converter's notes

- **Anchor:** "Antimagic Field (rank 8, fully suppresses all magic in area) — Arcane Interdiction is a much weaker, rank-4 version that taxes rather than suppresses spellcasting"
- **Archetype:** control/debuff (spell-disruption aura)
- **Balance bullets:**
  - "The flat check mechanic (not a save) means the DC scales with the spell being cast, not with the target's saving throw modifier — this treats all casters equally regardless of Fortitude bonus."
  - "DC 5 + spell rank means rank-1 spells have an 80% success rate (flat checks); rank-8 spells have a 35% success rate in the aura. This creates strategic tension without being an automatic shutdown."
  - "The self-exemption for sustaining only (not for all spells the caster casts within the aura) is important: the caster still faces the check when casting other spells in their own aura."
  - "Arcane only tradition is a deliberate narrowing — this spell manipulates the Weave (arcane flavor); divine/primal casters draw from different power sources and could be granted immunity or partial immunity at the GM's discretion."
- **Overridable:**
  - "The self-exemption could be broadened to 'all spells cast by the caster' rather than only the sustaining check, making the caster a free actor within their own aura."
  - "Could be expanded to arcane + occult traditions if the Weave-manipulation flavor extends to occult metaphysics."
- **Checklist failures:**
  - "Checklist item 12 — tradition list: arcane-only is a narrowing from the 5e Sorcerer/Warlock/Wizard list (which could imply occult via Warlock). Logged as deliberate design choice; overridable above."

## Similar official spells

- **Antimagic Field (rank 8)** — the converter's own anchor; a full, no-check spell-suppression field (nothing can be cast or function inside it). Four ranks above Interdiction, useful as the "ceiling" of the anti-magic-zone design space.
- **Dispel Magic (rank 2)** — closest official counteract-based magic-negation spell, though single-target/single-effect rather than an area denial field.
- **Dispelling Globe (rank 4)** — same rank as Interdiction; an immobile globe that counteracts spells whose area/targets enter it (as Dispel Magic 1 rank lower than the intruding spell's rank). A same-rank comparison point for a different area-denial mechanism (counteract check vs. flat check).

## Prior astra touches

None found in `revisions.md` — Arcane Interdiction matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline; not listed among the 52 deviating spells).

## Open flags

- `system.heightening.levels["6"]` and `["8"]` are both empty objects; both heighten effects (DC increases) live only in the description HTML per the adapter warning.
- Trait discrepancy: the store's traits list is `[antillurgy, concentrate, manipulate]`. jmnario's own conversion (`all_spells_pf2e.json`) lists traits as `[abjuration, concentrate, manipulate]` — the store's "antillurgy" (the 5e homebrew school name, carried over verbatim) has **replaced** the "abjuration" trait that jmnario's own conversion notes explicitly justify adding ("Abjuration trait added matching the school effect (disrupts magic)"). This is the same pattern found on Almonk's Arcane Siphon.
- The 5e text's concentration-check trigger ("a creature concentrating on a spell while within the sphere must make a check") is not explicit about cadence; the store's description adds an explicit "at the start of each of its turns inside the area" cadence that is a PF2e-side clarification, not present verbatim in the 5e source.
