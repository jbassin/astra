# Chrysalis

## Header

- **Rank:** 6
- **Routing:** buff
- **Pool reason:** wide-range (comparables rank range 2–8 — LOW-INFORMATION, hence the manual pool)
- **Current assay line:** `kind: buff-comparables`, `population: beneficial`, `rankRange: [2, 8]`, `routing: buff`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** chronomancy, concentrate, manipulate — rarity common
- **Traditions:** arcane, primal
- **Cast:** time value "10 minutes"
- **Range:** touch — **Target:** 1 willing creature
- **Defense:** none
- **Duration:** 1 hour (not sustained)
- **Cost:** "a silken cocoon, which is consumed"
- **Structured damage:** none (`{}`)
- **Heightening:** fixed level 8 (empty structured payload — text-only)

## The 5e original

- **Level:** 6 (source file `gen_homebrew.json`)
- **School:** chronomancy
- **Casting time:** 10 minutes
- **Range:** touch
- **Components:** S + V + M ("a cocoon")
- **Duration:** 1 hour, no concentration
- **Classes:** Bard, Druid, Wizard

> You drastically speed up the flow of time for a willing creature, allowing it to take a long rest in the span of one hour. The target of this spell becomes wrapped in a thick but fragile cocoon. While in the cocoon, the subject doesn't need to eat or drink. At the end of the hour, it emerges from the cocoon as if it had just completed a long rest. While within the cocoon, however, the creature is completely cut off from outside stimuli.
>
> The chrysalis has 1 hit point and AC 10. If it is destroyed, the spell ends and the creature is stunned until the end of its next turn. If the spell is ended in this fashion, the creature does not get the benefits of a long rest.

No `entriesHigherLevel` section is present — the 5e original has no upcast text.

## The conversion (canonical store)

> You dramatically accelerate the flow of time around a willing creature, allowing it to compress an 8-hour long rest into a single hour while you and other companions continue at normal speed. The target is wrapped in a thick, iridescent cocoon and does not need to eat or drink during this time. At the end of the hour, the target emerges as if it had just completed a full 8-hour rest (recovering HP per its normal rest rules, regaining daily abilities, clearing most conditions that rest removes, and so on).
>
> While within the cocoon, the target is completely cut off from external stimuli — it cannot perceive the outside world, cannot take actions, cannot speak or be spoken to, and is not aware of what happens outside. The cocoon is fragile: it has AC 10, Hardness 5, and 20 HP. If the cocoon is destroyed, the spell ends immediately and the target emerges Stunned 2 (until the end of its next turn) without having gained the benefits of the rest.
>
> This spell can only be cast outside of combat or when there is no active threat to the caster.
>
> **Heightened (8th)** The cocoon's HP increases to 40 and its Hardness increases to 10. The cast time remains 10 minutes but the cocoon is visually imperceptible to creatures that succeed at a DC 30 Perception check.

This description matches jmnario's baseline conversion (confirmed via `revisions.md` — 0 deviations for this spell). The one `@UUID` reference in the store — `@UUID[Compendium.pf2e.conditionitems.Item.Stunned]{Stunned 2}` — renders above as "Stunned 2"; it's a UUID link to the Stunned condition item.

## What changed, plain English

- **Cocoon durability buffed:** 5e's cocoon is trivial — 1 HP, AC 10, destroyed by essentially any hit. PF2e gives it AC 10, Hardness 5, and 20 HP (doubling to 40 HP/Hardness 10 at rank 8) — a meaningfully tougher object that can absorb multiple hits before failing.
- **Disruption penalty escalated:** 5e's failure state is "stunned until the end of its next turn" (a short, single-source stun with no numeric value in 5e's stun rules). PF2e's failure state is explicitly "Stunned 2" — a PF2e condition that eats a fixed 2 actions, a more codified and arguably harsher penalty than 5e's vaguer "stunned until end of next turn."
- **Combat restriction added:** PF2e adds an explicit hard restriction — "This spell can only be cast outside of combat or when there is no active threat to the caster" — with no 5e-side equivalent; 5e has no such clause.
- **Rest-length wording:** both versions compress an "8-hour long rest" into "1 hour," but 5e phrases it as "a long rest" (a defined 5e term) while PF2e spells out "8-hour long rest... recovering HP per its normal rest rules, regaining daily abilities, clearing most conditions that rest removes" — a PF2e-native paraphrase of the same underlying rest mechanic.
- **Heightening is new content:** 5e has no upcast text (chronomancy spells here are not tied to a slot-scaling mechanic in the source). The rank-8 heighten (tougher cocoon + DC 30 Perception-check invisibility) is entirely invented for the conversion.
- **Material cost:** 5e's material was simply "a cocoon" (no stated gp value). PF2e keeps "a silken cocoon, which is consumed" — same basic item, still uncosted in gp on both sides.

## Converter's notes

- **Anchor:** "no clean analog — PF2e has no rest-compression spell; Chrysalis is a unique exploration-utility spell at rank 6"
- **Archetype:** utility / buff (rest compression)
- **balanceBullets:**
  - "Rank 6 slot + 500 gp material component to give 1 ally a long rest in 1 hour: the recipient gains ~full HP recovery and ability refresh; powerful but strictly exploration-tier (cannot be used in combat)" — *(note: this bullet references a "500 gp material component" that does not match the store's actual `cost.value`, "a silken cocoon, which is consumed," which carries no stated gp figure)*
  - "The cocoon's AC 10, Hardness 5, 20 HP is fragile enough that enemies can interrupt it — built-in combat vulnerability prevents abuse"
  - "Stunned 2 on disruption: meaningful punishment for having the cocoon destroyed; the target loses their rest AND loses actions — appropriate deterrent for fragile rest windows"
  - "Cannot be cast while there is an active combat threat: hard combat restriction enforced in the description"
- **overridable:**
  - "The 'no combat threat' restriction could be removed if the author prefers to allow the spell in dangerous situations (e.g., a protected chamber behind a locked door) — removing this makes the spell potentially abusable"
  - "The cocoon HP could be increased to 40 (Hardness 10) at base rank if the author feels 20 HP is too fragile for a rank-6 spell"
- **checklistFailures:**
  - "The 'time' trait is a custom homebrew trait. See Jolt note for series-wide flag." *(note: the store's actual traits list is `[chronomancy, concentrate, manipulate]` — there is no `time` trait present in the canonical store, though `chronomancy` itself is the homebrew school-as-trait.)*
  - "Rest-compression spells have no precedent in PF2e Remaster. The converted version enforces a 'no active combat threat' restriction to prevent in-combat use, but this restriction is not a PF2e standard mechanic — it is a GM-enforced narrative constraint. Flagged for explicit table agreement."

## Similar official spells

- **Rope Trick** (rank 4) — creates a hidden extradimensional space reachable only by a rope, lasting 8 hours, for a party to safely rest. Closest functional analog for "spend a rank-4+ slot to secure safe resting conditions," though it doesn't compress time — it just protects a normal-length rest.
- **Peaceful Bubble** (rank 4) — a communal shielding bubble (perception/scrying blocked both ways) that also grants a bonus benefit to creatures who sleep 8 hours inside it (extra Doomed reduction); 24-hour duration. Another "protect a normal rest, don't compress it" comparable.
- **Dreaming Potential** (rank 5) — puts one willing sleeping creature into a lucid dream; if it sleeps the full 8 hours uninterrupted, it counts as a day of downtime retraining upon waking. Closest thing to "convert 8 hours of rest into something more" in the official pool, though it still requires the full 8 hours rather than compressing them.
- None of these three official spells actually compress time (8 hours → 1 hour); this reflects the converter's own "no clean analog" anchor note.

## Prior astra touches

None. `revisions.md` does not list Chrysalis among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations).

## Open flags

- **Converter-notes internal mismatch (checklistFailures):** the notes claim a custom `time` trait exists and flag it for a "series-wide" note, but the canonical store's actual `traits.value` is `[chronomancy, concentrate, manipulate]` — no `time` trait is present anywhere in the store.
- **Converter-notes internal mismatch (balanceBullets):** one bullet references "500 gp material component," but the store's `cost.value` is "a silken cocoon, which is consumed" with no gp figure stated anywhere in the store or the 5e original.
- The GM-enforced "cannot be cast in combat" restriction is explicitly flagged by the converter itself as a non-standard PF2e mechanic requiring table agreement (`checklistFailures`), i.e., it's a narrative rule embedded in spell text rather than an engine-enforced restriction.
- No residual 5e-isms otherwise (no "bonus action," no death-save language).
- No curse-removal wording, no reaction/Trigger line to check.
- Structured damage field is empty, consistent with the prose.
