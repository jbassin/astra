# Return Spell

## Header block

- **Rank:** 7 (store `system.level.value = 7`)
- **Routing:** `ledger:utility` — **pool reason:** ledger
- **Current assay line:** verdict/rankRange/residual not yet computed (queue.json shows `verdict: null`, `rankRange: null`, `residualRanks: null`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** antillurgy, concentrate, manipulate
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** touch
- **Targets:** 1 willing creature
- **Defense:** none (`system.defense = null`)
- **Duration:** 8 hours (not sustained)
- **Heightening:** fixed, level 9 only

## The 5e original

- **Name:** Return Spell (source: `tfc`)
- **Level:** 7th
- **School:** antillurgy
- **Casting time:** 1 action
- **Range:** touch
- **Components:** V, S, M ("a bent willow wrapped with strands of gut")
- **Duration:** 8 hours
- **Classes:** Sorcerer, Warlock, Wizard

**Entries:**

> You weave a ward of antimagic protection about one willing creature. That creature gains the ability to use its reaction to turn one spell that allows a saving throw back at the spell's caster.
>
> The target of the reflected spell makes a saving throw against it. If the save is successful, the spell rebounds again, back to the original target. That creature then makes its own saving throw, and if successful, the spell rebounds again. The spell continues to rebound between the original caster and the original target until one or the other fails its saving throw; at that point, the spell takes full effect and stops rebounding. If this hasn't happened by the time six saving throws have been made (three from each target), the spell dissipates harmlessly.
>
> In the case of an area effect spell, only that portion of the spell that would affect the warded creature is volleyed; the rest of it goes off and affects other creatures in the original target area as normal. If several creatures in the area of effect are warded by this spell, the original caster could take the effect of the spell several times over.

No `entriesHigherLevel` in the 5e original (no upcast text).

## The conversion (canonical store)

> You weave a ward of antimagic deflection around a willing creature. For the duration, when a spell that requires a saving throw targets the warded creature, the creature can use its reaction to attempt to reflect the spell. The warded creature rolls its saving throw against the reflected spell. On a success, the spell rebounds to the original caster, who must also attempt the saving throw against their own spell (using the same DC). On a failure, the spell takes full effect on the warded creature. Each time the spell rebounds, both parties have already made one save; after each has made three saving throws total (six between both parties), the spell dissipates harmlessly regardless of results. If the reflected spell has an area that partially covers the warded creature, only the portion targeting the warded creature is reflected; the rest functions normally on other targets in the area. The reaction to initiate reflection can be used once per round.
>
> **Heightened (9th)** The warded creature can use the reaction twice per round and the spell can rebound up to four times total per triggered spell.

No `@UUID[...]` links in this description. Structured fields agree with the prose: `duration.value = "8 hours"` matches; `heightening.levels.9` present but empty (`{}`, per the adapter warning — the "twice per round" / "up to four times" heighten text is prose-only); `defense = null` matches (the spell itself imposes no save — the *reflected* spell's own save is what's rolled).

## What changed, plain English

The mechanic is preserved almost word-for-word — willing creature gets a reaction to bounce a save-requiring spell back at its caster, both sides make the reflected spell's own save repeatedly until one side fails or six total saves are exhausted, area spells are only partially reflected. The changes are narrower than most spells in this batch:

- **Numbers/structure:** identical duration (8 hours), identical rebound cap (six total saves, three per side), identical partial-reflection-for-area-spells clause, near-identical prose for most of the mechanic.
- **Action cost:** 5e "1 action" → PF2e "2 actions" — this is a rare case in the batch where the PF2e cast time is *more* expensive than a literal 1-for-1 mapping of the 5e action economy would suggest (5e 1 action commonly maps to PF2e 2 actions, so this is the standard mapping rather than a deviation, but worth noting since it's the opposite direction from several sibling spells in this batch that went bonus-action→1-action).
- **Material component (DROPPED from the store, present in both source and jmnario's conversion):** the 5e original requires "a bent willow wrapped with strands of gut," and jmnario's own conversion preserved this as `cost: "a bent willow wrapped with strands of gut (material component)"`. The astra canonical store has `system.cost.value = ""` — the material component text has been dropped entirely from the store (no cost, no requirements text either). This is consistent with the campaign's no-material-components convention (see Open flags) but is a real content removal relative to both source documents.
- **Trigger clarified:** 5e says the target "gains the ability to use its reaction to turn one spell that allows a saving throw back" without stating a frequency limit beyond the natural one-reaction-per-round action economy. The conversion makes the once-per-round limit explicit in the closing sentence ("The reaction to initiate reflection can be used once per round") — this reads as a clarification of RAW 5e reaction rules rather than a new restriction, since 5e reactions are already naturally once-per-round.
- **Heighten (9th):** identical function in both jmnario's conversion and the store — reaction frequency doubles (once→twice/round) and the rebound cap for a single triggered spell quadruples (from the base six-total-saves cap to "up to four times total per triggered spell," i.e., an increase in how many times *one* incoming spell can ping back and forth). No 5e upcast text exists to compare against, since the 5e original has no `entriesHigherLevel`.
- **Nothing added** beyond the heighten tier, which both jmnario and astra treat identically.

## Converter's notes

- **Anchor:** "Spell Turning (5e rank 7) — no PF2e equivalent; closest is Reflect Projectile (ranger feat) or readied action with Counterspell"
- **Archetype:** buff (spell reflection / warding)
- **Balance bullets:**
  - "No PF2e canonical spell provides spell reflection; this is a unique design. The per-save ping-pong (up to 3 saves each) creates tension without guaranteeing infinite reflection."
  - "8-hour duration is exploration-tier — not combat-grade per se, but the reaction fires in combat. The long duration means this is cast before expected encounters, not mid-fight."
  - "Success-on-save-to-reflect (not automatic) means the warded creature still needs a strong save to bounce spells; a creature with a poor save may rarely trigger the effect."
  - "Area-spell partial reflection prevents trivially neutralizing Fireball by holding one warded character in the area."
  - "Once-per-round reaction limit prevents the warded creature from reflecting every targeting spell in a multi-caster encounter."
- **Overridable:**
  - "The reaction to reflect could be limited to 'once per 10 minutes' rather than 'once per round' if the once-per-round rate feels too frequent against multi-caster encounters."
  - "Could add an incapacitation tag if the reflection effect is ruled to be 'removing the enemy spell's effect on the warded creature' (incapacitation of the spell's effect)."
  - "The 'only save-requiring spells' limit could be extended to spell attacks as well — would be a power increase but more intuitive."
- **Checklist failures:** none listed.

## Similar official spells

- **Spell Turning** (rank 7) — the converter's own named anchor ("no PF2e equivalent"). Uses a **counteract check** (not the target's own saving throw) to attempt reflection when a spell targets the caster directly (self-only, not warding an ally); ends after one reflection attempt (success or fail) rather than allowing repeated rebounds; 1-hour duration. Comparison axis: same rank, same "reflect a targeted spell back at its caster" premise, but Spell Turning is self-only / single-shot / counteract-based, while Return Spell is ally-targetable / multi-rebound / save-based — a structurally different resolution mechanic at the same rank.
- **Energy Aegis** (rank 7) — grants flat energy resistance (5, or 10 at heighten 9th) across a broad damage-type list for a very long duration ("until your next daily preparations"). Comparison axis: shows the going rate for a rank-7 exploration-tier defensive ward with a *passive*, always-on effect, versus Return Spell's *reactive*, once-per-round, save-gated effect — different defensive design idioms at the same rank.
- **Mirror Image** (rank 2) — the low end of "make incoming targeted effects less likely to land," using randomized image-loss rather than reflection. Comparison axis: illustrates the rank gap between a cheap "avoid the hit" buff (rank 2) and a genuine "send the hit back at the caster" mechanic (rank 7, this spell and Spell Turning).

## Prior astra touches

None found. Not present in `apps/assay/homebrew/revisions.md`'s deviation list — the store currently matches a fresh re-conversion of the vendored jmnario baseline exactly (the material-component drop noted above happened somewhere in the adapter/store-seeding pipeline itself, not as a subsequent hand-edit — jmnario's conversion had the cost text; the current store does not, and revisions.md shows zero deviation for this spell against a fresh re-conversion of jmnario's baseline).

## Open flags

- **Material component silently dropped between jmnario's conversion and the astra store:** jmnario's `all_spells_pf2e.json` entry carries `cost: "a bent willow wrapped with strands of gut (material component)"`; the astra store has `system.cost.value = ""` with no requirements text either. Since `revisions.md` shows zero deviation for this spell against a *fresh* re-conversion of jmnario's baseline, the drop happened inside the `homebrew.convert_spell` adapter itself (a systematic/intentional no-material-components policy), not as a one-off hand edit — but it is a real content loss relative to both the 5e original and jmnario's own conversion, worth confirming is the intended house policy (Remaster has no material components as currency-cost items, which may be the rationale, but the descriptive/roleplay text "a bent willow wrapped with strands of gut" is lost too, not just a cost value).
- No `@UUID[...]` compendium links anywhere in this description.
- The "once per round" reaction-frequency clause reads as a clarification of standard reaction-economy rules rather than a new restriction — worth confirming it isn't intended as an *additional* limiter beyond what "it's a reaction" already implies.
