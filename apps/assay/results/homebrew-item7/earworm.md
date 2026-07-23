# Earworm

## Header block

- **Rank:** 3 (store: `system.level.value = 3`)
- **Routing:** ledger:utility — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** auditory, concentrate, manipulate, memetics
- **Traditions:** arcane, occult
- **Cast:** time.value = "2" (2-action spell)
- **Range:** touch
- **Target:** "1 creature"
- **Defense:** Fortitude save (non-basic)
- **Duration:** 8 hours, not sustained
- **Heightening:** fixed, levels "5" and "7" (both empty objects — appendix-only text)

## The 5e original

- **Level:** 3rd
- **School:** Memetics
- **Casting time:** 1 action
- **Range:** Touch
- **Components:** S (no verbal, no material)
- **Duration:** 8 hours (not concentration)
- **Classes:** Bard, Seeker, Wizard
- **Ritual:** No

> You implant a small worm made of arcane thread into the skin of another creature. The creature must make a Constitution saving throw. On a failure, the worm seats itself in a vantage point close to the creature's ears. You can hear any sounds the target hears as long as you and the target are on the same plane of existence. The worm safely dissolves once the spell ends.

No entriesHigherLevel; the 5e original has no upcast/heightening text at all — it's a flat pass/fail with no scaling.

## The conversion (canonical store)

> You implant a tiny worm woven from arcane thread beneath the skin of a creature, seating it near the creature's ear canal. The target must attempt a Fortitude saving throw.
>
> **Critical Success** The worm fails to seat itself and dissolves. The target senses the attempt.
> **Success** The worm dissolves harmlessly. The target feels a brief itching sensation but is unaware of the nature of the attempt.
> **Failure** The worm seats itself. You hear all sounds the target hears for the duration.
> **Critical Failure** As failure, and you can also see through the target's eyes. You can toggle between auditory-only and auditory-visual as a 1-action concentrate.
>
> ---
> **Heightened (5th)** The worm can also track the target's location; you know the target's current location as if you had cast status on it, as long as you are on the same plane.
> **Heightened (7th)** The duration increases to until your next daily preparation. The range to implant the worm increases to 30 feet.

No `@UUID` links present.

## What changed, plain English

The fiction is preserved exactly (arcane-thread worm implanted near the ear, eavesdropping on the target's hearing, dissolves at spell end, same-plane restriction). Duration (8 hours) and range (touch) carried over unchanged for the base spell.

Structure/mechanics:
- 5e single Constitution save (pass/fail) → PF2e four-degree Fortitude structure. Both the crit-success tier ("worm fails to seat, target senses the attempt") and the crit-failure tier (visual eavesdropping, togglable) are net-new — the 5e original only has a binary "worm seats or doesn't."
- 5e Constitution save → PF2e Fortitude (direct organ-map, no ambiguity — both track physical resilience).
- 5e cast time "1 action" → PF2e "2" actions.
- 5e non-scaling spell → PF2e adds two heighten tiers with no 5e basis: rank 5 grants location tracking (as *status*), rank 7 extends duration to "until next daily preparation" and range to 30 ft (implant range, not touch-only). Both heighten entries are wholly new content.
- The PF2e version adds an explicit counterplay clause not in the 5e text: "A creature that successfully uses the Seek action against your spell DC can feel the arcane thread" — this line appears in jmnario's conversion description but **is not present in the store's HTML at all** (the store's description ends after the critical-failure tier and the heighten block, dropping that sentence). See Open Flags.
- Traits added with no 5e basis: auditory, memetics (school-as-trait replacing 5e's "Memetics" school field), manipulate/concentrate (PF2e action-component vocabulary). Traditions arcane+occult replace the 5e Bard/Seeker/Wizard class list.

## Converter's notes

- **Anchor:** "Scrying (rank 6, divine/occult, 1 min, see/hear through sensor at any range); Earworm is rank 3, 8 hours, but requires touch, no visual at base, and Fort save"
- **Archetype:** utility/divination (remote eavesdropping)
- **Balance bullets:**
  - "Scrying (rank 6) gives both sight and sound at any range; Earworm (rank 3) is touch-range implant, audio only at base, 8 hours. The touch requirement and single-sense limitation justify 3 ranks below Scrying."
  - "Fortitude save is correct: a physical worm being implanted into body tissue is a physical intrusion resisted by the body's constitution, not the mind."
  - "8-hour duration is exploration-tier appropriate; the target is unaware, making this a surveillance asset rather than a combat tool."
  - "Crit-fail visual eavesdropping is the power-escalation tier — seeing through the target's eyes is Scrying-adjacent and appropriately gated to crit fail only."
  - "Auditory trait gates this against deaf creatures and deaf-immune monsters, which is thematically correct (no ears → no earworm)."
- **Overridable:**
  - "Could add a Perception check for the target each day to feel the arcane thread (currently only a Seek action by the target) — stricter if the GM wants the spell to have higher counterplay."
  - "The range to implant could increase to 10 feet at base (gentle somatic gesture) rather than touch, if the GM finds the touch requirement too restrictive for a spy spell."
- **Checklist failures:** none

## Similar official spells

- **Clairaudience (rank 3)** — exact-rank comparable: creates an invisible floating ear at a location within 500 ft, 10-minute duration, no save, no target-detection required. Earworm requires touching the specific target (harder to set up) but lasts 8 hours vs. 10 minutes and is undetectable to the target absent a Seek check.
- **Scrying (rank 6)** — the converter's own anchor; single named/touched-possession target, sight+sound, sustained 10 minutes, Will save with degrees (temporary immunity on crit success). Confirms the "3 ranks below Scrying, single-sense, touch-gated" positioning claimed in the balance bullets.
- **Clairvoyance (rank 4)** — sibling to Clairaudience; floating invisible eye (sight only) at a location within 500 ft, no target/save. Useful reference for the visual-sense half of Earworm's crit-failure tier.

No scorer comparables were supplied for this spell in the routing brief (routed via ledger, not the comparables pool).

## Prior astra touches

None found in `revisions.md` — Earworm matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- jmnario's conversion description includes a trailing sentence not present in the store's HTML: "The worm dissolves at the end of the spell's duration. A creature that successfully uses the Seek action against your spell DC can feel the arcane thread and is then aware of the worm's presence." The store's `description.value` ends after the heighten block and omits this sentence entirely — a prose difference between the vendor conversion and the canonical store's current text.
- jmnario's conversion also includes "You can end your auditory link as a free action at any time without ending the spell" in the failure-tier description, which is likewise absent from the store's failure-tier text ("The worm seats itself. You hear all sounds the target hears for the duration.").
- `heightening.levels["5"]` and `["7"]` are both empty objects; both heighten effects live only in the description HTML (per the adapter warning).

## Options & staff lean (enrichment, 2026-07-23)

**Post-batch-0 note:** every open flag above is RESOLVED — `f91b2d6` restored the
same-plane rider, the target-unaware clause, the free-action link end, and the Seek
counterplay sentence to the store. What remains is a well-anchored conversion: 3 ranks
below Scrying paid for by touch range + audio-only base + a Fort save with an
awareness-on-success risk; the crit-fail sight tier and the two heighten tiers are good
PF2e escalation.

- **A. Keep as-is** — effectively a fast-lane spell now.
- **B. Converter's stricter counterplay overridable** (daily Perception check to feel the
  thread) — extra bookkeeping with no motivating complaint; the restored Seek clause
  already provides counterplay.

**Lean: A.**
