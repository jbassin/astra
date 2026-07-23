# Mystic Negation

## Header block

- **Rank:** 5
- **Routing:** `ledger:utility`
- **Pool reason:** ledger
- **Current assay line:** verdict = null, rankRange = null, residualRanks = null (no quantitative score — pooled on the utility-ledger routing reason)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  - "area text not structurally parseable, left unmapped (effective-target classification falls back to the description's own target-count heuristic): 'fixed point in space'"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** antillurgy, concentrate, manipulate (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 2 actions
- **Range:** 60 feet
- **Targets:** (none — fixed point in space)
- **Defense:** none (`system.defense` is `null`)
- **Duration:** sustained, 1 minute

## The 5e original

- **Level:** 5 (Sorcerer, Warlock, Wizard)
- **School:** antillurgy (this batch's homebrew school label)
- **Casting time:** 1 action
- **Range:** 60 feet (point)
- **Components:** V, S (no material)
- **Duration:** 1 minute, Concentration

> You create a dark, pulsing, 1-foot-diameter sphere of antimagic that hangs in the air at a point you can see within 60 feet of you. It automatically negates every spell (including your own) of 3rd level or lower cast within 30 feet of the sphere. Spells of level 5 and higher are not affected. The sphere disappears after it counters three spells or when the spell's duration runs out.
>
> At the beginning of your turn, you can move the sphere up to 20 feet as a bonus action.

**At Higher Levels:** For each spell slot used higher than 5th level, the maximum spell level the sphere can negate increases by one.

## The conversion (canonical store)

> You create a hovering, 1-foot-diameter sphere of pulsing antimagic at a point you can see within range. The sphere automatically attempts to counteract any spell of rank 3 or lower cast within 30 feet of it; it uses your spell DC as the counteract modifier and your spell rank (5) as the counteract rank. Spells of rank 4 or higher are not affected. The sphere affects your own spells as well as enemies'.
>
> The sphere does not move on its own. On each of your turns, you may use a single action (which has the concentrate trait) to move the sphere up to 20 feet.
>
> **Heightened (7th)** The sphere automatically counteracts spells of rank 5 or lower, and the zone of effect expands to 40 feet.
> **Heightened (9th)** The sphere automatically counteracts spells of rank 7 or lower, and the zone of effect expands to 60 feet.

Structured fields agree with the prose (2-action cast, 60-foot range, sustained 1-minute duration, no defense/save field since it's a counteract effect not a save). The "counters three spells then disappears" clause from 5e is absent from both the store's description and its structured fields — see below.

## What changed, plain English

- **Mechanic swapped from binary negation to a counteract check:** 5e "automatically negates" (no check, no roll) → PF2e "automatically attempts to counteract... uses your spell DC as the counteract modifier and your spell rank (5) as the counteract rank." This is the single biggest mechanical change — it's no longer a guaranteed shutdown, it's a contested check.
- **Content dropped:** the 5e clause "The sphere disappears after it counters three spells or when the spell's duration runs out" has **no equivalent anywhere in the PF2e conversion** — the store version's sphere only ends when its sustained duration lapses, with no 3-counters cap.
- **Move mechanic changed:** 5e = free bonus action at the start of the caster's turn, up to 20 feet. PF2e = costs a full action (with the concentrate trait) on any of the caster's turns, still up to 20 feet — this is a real action-economy tightening (bonus action → full action), not a straight port.
- **Rank ceiling shifted:** 5e negates "3rd level or lower," ceiling explicitly "5th and higher not affected." PF2e counteracts "rank 3 or lower," ceiling "rank 4 or higher not affected" — the effective gap between the sphere's reach and its own casting rank narrowed from 2 levels (3 vs 5) to 2 ranks (3 vs 5, phrased as "4 or higher"), functionally the same band but phrased against a "rank 4" cutoff instead of "level 5."
- **Heightening restructured:** 5e's upcast text was open-ended ("for each slot higher than 5th, ceiling +1") with no area change. PF2e converts this to two fixed tiers (7th: ceiling rank 5 + area 30→40 ft; 9th: ceiling rank 7 + area 30→60 ft) — each heightened tier now also grows the effect radius, which the 5e original never did.
- **Duration wording:** 5e "1 minute, Concentration" → PF2e "sustained up to 1 minute" (standard PF2e phrasing, same functional duration).

## Converter's notes

**Anchor:** Wall of Force (rank 6, sustained zone) — Mystic Negation is a smaller, mobile antimagic zone

**Archetype:** utility / control (antimagic zone)

**Balance bullets:**
- "Counteracts rank 3 or lower automatically: this is a narrower effect than full Antimagic Field (which suppresses all magic); limiting to rank 3 or lower at rank 5 is appropriate"
- "The zone is 30-foot radius around the sphere — sizable but the caster must pay sustain action each round to keep and reposition it"
- "The sphere affects the caster's own spells: significant double-edged cost preserved from 5e; this prevents spam-abuse"
- "Heightening raises the ceiling (rank 5→7→9) giving the spell long-term relevance"

**Overridable:**
- "The counteract modifier (uses caster's spell DC) could instead use a flat +15 or the caster's spell attack roll — spell DC and counteract modifier are not the same in PF2e (counteract uses a check, not a save); flagged: the DM should set a specific counteract check bonus"
- "The sphere radius (30 feet) could be reduced to 20 feet to match a more conservative zone at rank 5"

**Checklist failures:**
- "Counteract mechanics in PF2e use a counteract check (caster's relevant ability + spell rank), not the spell DC. The description says 'uses your spell DC as the counteract modifier' — this is a simplification. A strict PF2e conversion would use the caster's key ability modifier + proficiency bonus + spell rank as the counteract check. Flagged for GM adjudication."

## Similar official spells

- **Dispel Magic** (rank 2) — Single-target, 120-foot range, one-shot counteract check against one spell effect or unattended item; the baseline PF2e counteract-check pattern this spell's mechanic is built on.
- **Dispelling Globe** (rank 4) — Immobile 10-foot burst around the caster, auto-counteracts any spell whose area/target crosses into the globe "as if it were Dispel Magic 1 rank lower than its actual rank," for 10 minutes. One rank lower; closest official analog to Mystic Negation's "standing automatic counteract zone" concept, though Dispelling Globe cannot move and doesn't hit the caster's own spells.
- **Antimagic Field** (rank 8) — 10-foot emanation on the caster, sustained 1 minute, fully suppresses (not counteracts) all magic inside it with no check at all — spells simply can't function. Three ranks higher; the "true negation, no roll" version of the 5e original's binary mechanic, vs. Mystic Negation's check-based rank-limited counteract.
- **Wall of Force** (rank 6) — Cited directly by the converter as the anchor; a sustained, mobile-ish barrier effect at one rank higher. Functionally different payload (physical blocking wall vs. antimagic sphere) but comparable "sustained zone effect, single rank-band higher" budget reference.

## Prior astra touches

Not in `revisions.md`'s deviations list — the store's fields match the fresh adapter re-conversion exactly (0 deviations recorded for this slug). No hand edits since seeding.

## Open flags

- The converter's own checklist-failure note flags the counteract mechanic as non-standard: it uses "your spell DC as the counteract modifier," where a strict PF2e counteract check would instead use the caster's key ability modifier + proficiency + spell rank. This simplification is present verbatim in both the vendor conversion and the canonical store's description.
- The 5e "disappears after countering three spells" cap is absent from the PF2e version entirely — the sphere's only stated end conditions in the store text are the sustained-duration lapsing (no counter-count cap).
- `system.area` is `null` and `system.target.value` is empty — the "fixed point in space" area concept is only present in prose, per the adapter warning; there is no structured area/target field backing it.
- `system.defense` is `null` (no save/defense block) — consistent with a counteract-check effect rather than a save effect, but worth noting since most other spells in this chunk populate `defense`.

## Options & staff lean (enrichment, 2026-07-23)

The binary-negation→counteract-check rework is the right conversion. Two items:

1. **The converter's own checklistFailure is real:** "uses your spell DC as the
   counteract modifier" isn't legal PF2e — counteracts use your counteract modifier
   (spellcasting ability + proficiency), not a DC. One-sentence fix: "the sphere attempts
   to counteract the triggering spell (counteract rank 5, using your spellcasting
   counteract modifier)."
2. **The dropped 3-counters burnout cap.** Official precedent cuts both ways: Dispelling
   Globe r4 runs 10 MINUTES with no counter cap (immobile, self-centered) — so an
   uncapped sustained-1-minute mobile sphere at r5 isn't out of line; but the burnout was
   5e's distinctive governor and flavor.

- **A. Fix the counteract wording only** — uncapped is defensible on the Dispelling
  Globe precedent.
- **B. A plus restore "the sphere winks out after its third counteract"** — faithful,
  and differentiates it from Dispelling Globe.
- **C. Keep the DC-as-modifier text** — ships a mechanic the converter himself flagged
  as non-functional PF2e; not recommended.

**Lean: A**, B if he wants the burnout texture back.
