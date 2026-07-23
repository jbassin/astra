# Do My Bidding

## Header block

- **Rank:** 7 (store: `system.level.value = 7`)
- **Routing:** ledger:long-cast — **Pool reason:** ledger
- **Current assay line:** none beyond routing/pool metadata supplied in the chunk brief (no verdict/range/residual given for this spell)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** auditory, concentrate, emotion, incapacitation, linguistic, manipulate, mental, mercuromancy
- **Traditions:** arcane, divine, occult
- **Cast:** time.value = "10 minutes" (no discrete action-count field)
- **Range:** "60 feet"
- **Area:** emanation, 60 ft
- **Target:** "" (empty — area-based)
- **Defense:** Will save (non-basic)
- **Duration:** 8 hours, not sustained
- **Heightening:** fixed, level "9" (empty object — appendix-only text, see adapter warning)

## The 5e original

- **Level:** 7th
- **School:** Mercuromancy
- **Casting time:** 10 minutes
- **Range:** Self (60-foot-radius sphere)
- **Components:** V, S (no material)
- **Duration:** 8 hours (not concentration)
- **Classes:** Bard, Druid, Seeker, Sorcerer, Warlock, Wizard

> You ask fate for the right words to rally a crowd to your cause. You can sway a large group of people toward accomplishing a specific goal. You must speak emphatically on the subject for 10 minutes, playing on the crowd's emotions and reason, to inflame their fervor for or against a cause or person. You must be clear about the specific goal you want to achieve. For example, shouting that "The Church of Reostadt is evil and corrupt!" might make people dislike the church, but it won't spur them to action because it doesn't tell them what to do. Adding "Follow me, and we'll burn it to the ground!" will send a crowd of torch-bearing arsonists to Xanathar himself.
>
> The spell affects all sentient creatures that are able to hear and understand you within 60 feet.
>
> When you finish casting the spell, all potential targets of the spell who fail a Wisdom saving throw are compelled to follow your instructions for the duration of the spell, as long as those orders are in keeping with the goal stated in the speech and you personally lead them. If these conditions aren't met, the spell ends and the crowd becomes hostile toward you. The spell also ends when the goal has been achieved. If the goal is achieved or the duration ends naturally, those under the affect of the spell do not realize they were charmed by you.

No entriesHigherLevel; no heightening block in the 5e original at all (it's a single, non-scaling level-7 spell).

## The conversion (canonical store)

> You speak passionately for 10 minutes, rallying a crowd toward a specific, clearly articulated goal. All sentient creatures that can hear and understand you within 60 feet are potential targets. Each must attempt a Will save.
>
> **Critical Success** The creature is unaffected and knows it was targeted by a spell.
> **Success** The creature is unaffected.
> **Failure** The creature is compelled to pursue the stated goal for the duration, provided you personally lead them and the instructions remain consistent with the stated goal. If you cease leading or give contradictory orders, the effect ends for that creature. If the goal is achieved or the duration ends naturally, the creature does not realize it was subject to a magical compulsion.
> **Critical Failure** As failure, and the creature is fanatically devoted: it will take personal risk (but not suicidal action) to achieve the goal and will not question the caster's leadership. It still does not realize the source of its compulsion when the effect ends.
>
> ---
> **Heightened (9th)** The range and emanation increase to 120 feet, and you need not be present to maintain the compulsion — affected creatures pursue the goal autonomously for the duration.

No `@UUID` links present in this description.

**Structured-field notes:**
- `system.range.value = "60 feet"` is present *in addition to* `system.area = {emanation, 60}`. Every other emanation-area spell sampled from the official rank folders (Deathless March, Ghostly Tragedy, Luring Wail, Prying Survey, etc.) leaves `range.value` empty for a self-centered emanation — the area figure alone defines the radius.

## What changed, plain English

The core beat is preserved almost verbatim: a 10-minute speech, 60-foot radius, sentient-creature audience, Will/Wisdom save, compelled-to-follow-a-stated-goal-while-personally-led failure state, and the "doesn't realize it was charmed" clause at natural end. Numbers carried over 1:1 (60 ft, 8 hours, 10-minute cast).

Structure/mechanics:
- 5e single pass/fail save → PF2e four-degree structure (crit success/success/failure/crit failure) added. The crit-failure tier (fanatical devotion, takes personal risk) has no 5e basis — it's new content built to give the spell a meaningful critical band.
- 5e "if orders aren't followed, spell ends and the crowd becomes hostile toward you" → PF2e conversion **drops the hostility clause** entirely; in the store, the effect simply ends for that creature (no hostile-turn consequence).
- 5e ability score save (Wisdom) → PF2e Will (organ-mapped).
- 5e non-scaling (no upcast text) → PF2e heightened (9th): range/emanation 60→120 ft and removes the "you must personally lead them" requirement (autonomous pursuit). This heighten entry is wholly new — the 5e original has no upcast text at any level.
- 5e "crowd becomes hostile if conditions aren't met" content is gone; PF2e critical-success tier ("knows it was targeted by a spell") is new, not present in 5e.
- Traits added with no direct 5e basis: auditory, incapacitation, linguistic, mental, emotion, mercuromancy (school-as-trait), plus the arcane/divine/occult tradition set replacing the 5e class list.

## Converter's notes

- **Anchor:** "Dominate (rank 6) — incapacitation Will save, full control of one creature; Do My Bidding is mass-charm (not full control) at rank 7"
- **Archetype:** save-or-suck (mass charm / compulsion)
- **Balance bullets:**
  - "Dominate at rank 6 fully controls one creature on a failed Will save. Do My Bidding at rank 7 partially compels a crowd toward a goal with a Will save — less total control (goal-constrained, self-led), mass application."
  - "Incapacitation trait is mandatory: creatures under the effect are compelled to pursue dangerous goals, which is removal from autonomous decision-making."
  - "10-minute cast time is the primary balance lever — this cannot be used mid-combat and requires significant setup investment."
  - "8-hour duration is exploration-tier; not combat-grade."
  - "Will save (Wis→Will organ-map for mental enchantment) is correct; auditory and linguistic traits properly gate deaf/language-barrier creatures."
- **Overridable:**
  - "Duration could be reduced to 1 hour at base with heightening to 8 hours at rank 9 for cleaner progression."
  - "Could add uncommon rarity — mass crowd compulsion has significant social and political setting implications."
  - "The 'does not realize it was charmed' clause could be removed if the GM wants to preserve story tension of PC revelation."
- **Checklist failures:** none

## Similar official spells

- **Dominate (rank 6)** — single-creature Will save, full behavioral control (Controlled condition) on failure, stunned on success; the converter's own anchor. Single-target total control vs. Do My Bidding's mass but goal-limited/leader-dependent control.
- **Confusion (rank 4, heightened 8th targets up to 10 creatures)** — multi-target Will save, AoE-style compulsion at rank 8 (10 creatures) causing erratic/uncontrolled behavior rather than directed compulsion; a rank-8 mass-mental-effect data point adjacent to Do My Bidding's rank 7.
- **Warp Mind (rank 7)** — single-target Will save, incapacitation, permanently confuses on critical failure; a rank-7 exact-rank comparable for potency of a single-target mental incapacitation effect (Do My Bidding is mass but the crit-failure severity band is comparable in tone).

No scorer comparables were supplied for this spell in the routing brief (routed via ledger, not the comparables pool).

## Prior astra touches

None found in `revisions.md` — Do My Bidding matches the fresh in-memory re-conversion exactly (byte-faithful to the adapter baseline).

## Open flags

- `system.range.value = "60 feet"` sits alongside `system.area = {emanation, 60}`; every sampled official emanation-area spell leaves `range.value` empty since the emanation radius is self-centered and range-less.
- The 5e "crowd becomes hostile toward you" failure-condition consequence (if the caster gives contradictory orders / stops leading) is present in the 5e original but absent from the PF2e description — the PF2e text only says the effect "ends for that creature," with no narrated hostility.
- The crit-success tier text ("knows it was targeted by a spell") and crit-failure tier text (fanatical devotion / no-suicide clause) have no 5e basis; both are net-new content introduced to fill out the four-degree structure.
- `heightening.levels["9"]` is an empty object; the heighten text lives only in the description HTML (per the adapter warning, non-damage heighten effects aren't structurally represented).
