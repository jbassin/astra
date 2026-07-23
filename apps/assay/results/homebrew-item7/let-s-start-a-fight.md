# Let's Start a Fight

## Header

- **Rank:** 5 · **Routing:** ledger:unpriced-modifier · **Pool reason:** ledger
- **Current assay line:** pooled to the manual-review ledger; routing distinguishes this as an incapacitation/status-effect spell whose true output is not dice-priced, rather than the plain "ledger" reason most of this chunk's other spells carry.
- **Adapter warnings:** `interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented`
- **Traits:** auditory, concentrate, emotion, incapacitation, linguistic, manipulate, mental, mercuromancy (rarity: common)
- **Traditions:** occult
- **Cast:** 2 actions
- **Range:** 60 feet · **Area:** 30-foot burst
- **Defense:** `save.basic = false`, `statistic = will`
- **Duration:** 1 minute, not sustained
- No structured `heightening` key exists in the store JSON at all (the interval +2 heighten is prose-only appendix text).

## The 5e original

- **Level** 5, **school** mercuromancy (homebrew)
- **Casting time** 1 action
- **Range** 60 feet
- **Components** V, S (no material)
- **Duration** 1 minute, no concentration
- **Classes** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> You ask fate for a word to incite violence and shout it into a crowd or group of at least 15 targets. The DM assigns a probability of success, taking into consideration the average Wisdom of the targets. For example, a tavern full of brigands and ruffians may have a 90% chance of success, while a group of nobles at a fancy dinner party may have only a 10% chance of success. If successful, the spell causes all of the targets to immediately attack the closest target to them with whatever non-weapon item they have available. These items include tankards, plates, chairs, stools, etc. The spell lasts for up to one minute, or until most of the targets are unconscious save one. The caster is unable to revoke the spell's effects before it has run its course.

No `entriesHigherLevel` — no upcast text in the 5e original.

## The conversion (canonical store)

> You channel fate's desire for chaos into a single provocative word or gesture, directing it at a crowd or group of at least 10 creatures within the burst. Each creature in the area must attempt a Will saving throw. The effect varies by how many targets critically fail their saves: if 3 or more critically fail, a general brawl erupts among all creatures that failed their saves.
>
> **Critical Success** The creature is unaffected and recognizes the magical attempt.
> **Success** The creature is briefly irritated and takes a –1 status penalty to Will saving throws against emotion effects for 1 round.
> **Failure** The creature is incited to aggression. For 1 minute, it must spend at least 1 action on its turn making a Strike against the nearest creature (other than the caster). If there is no valid target, this compulsion fades harmlessly that round.
> **Critical Failure** As failure, and the creature immediately uses its reaction (if available) to Stride toward the nearest creature other than the caster and make a Strike against it.
>
> **Heightened (+2)** The burst radius increases by 10 feet and the minimum group size decreases by 2.

## What changed, plain English

The provocation fiction and the crowd-scale gating are preserved, but the resolution mechanic is a wholesale replacement, and one meaningful restriction from the 5e text is dropped:

- **Resolution mechanic replaced:** 5e resolves the whole spell via **GM fiat** — "The DM assigns a probability of success" (with worked examples: 90% for brigands, 10% for nobles) — a single group-wide percentage roll with no PC-facing save at all. PF2e replaces this entirely with a **per-creature Will saving throw** and the standard four-degree structure (crit success/success/failure/crit failure). Every number in the PF2e effect chain (the −1 status penalty, the 1-minute Strike compulsion, the crit-failure Stride-and-Strike) is new content with no 5e numeric basis.
- **Binary → graduated:** 5e's outcome is binary (the whole crowd either brawls or nothing happens); PF2e's outcome is per-creature and graduated across four tiers.
- **Weapon restriction dropped:** the 5e text explicitly limits the resulting attacks to "non-weapon item[s] they have available... tankards, plates, chairs, stools, etc." — this restriction is **entirely absent** from the PF2e conversion; affected creatures now make ordinary Strikes with whatever they're wielding, a real change in expected damage output from the source material.
- **Minimum target count reframed as geometry:** 5e's "at least 15 targets" (a pure headcount floor, no spatial limit) becomes PF2e's "at least 10 creatures" within a **new 30-foot burst area** — 5e never specifies an area/range shape at all.
- **Non-Dismissable clause dropped:** 5e explicitly states "the caster is unable to revoke the spell's effects before it has run its course"; no such restriction (or its opposite) appears in the PF2e text.
- **"Until most are unconscious" end condition dropped:** the 5e original ends early "until most of the targets are unconscious save one"; the PF2e version has no equivalent early-termination clause — each creature's individual effect just runs its own clock.
- **incapacitation trait added:** no 5e equivalent concept; added per the converter's own reasoning ("compelling creatures to make Strikes against each other each turn is combat-removal-tier").
- **auditory + linguistic traits added:** an interpretive addition — 5e's text says "a word to incite violence" but does not mechanically tag it as auditory or linguistic.
- **Classes narrowed to a single tradition:** 5e's six classes collapse to occult only.

## Converter's notes

- **Anchor:** Confusion (rank 4, incapacitation) — Let's Start a Fight is a crowd-targeting variant at rank 5
- **Archetype:** save-or-suck / control (incapacitation)
- **Balance bullets:**
  - "Incapacitation trait required: compelling creatures to make Strikes against each other each turn is combat-removal-tier for the affected creatures"
  - "30-foot burst is at the lower end of rank-5 area norms; justified by the strong effect"
  - "Will save (Wis→Will): the spell is a memetic/emotional incitement, clearly mind-affecting"
  - "Requires at least 10 creatures in the area — an unusual restriction that gates the spell to crowd scenarios; preserves the 5e flavor without creating a general-purpose incapacitation"
- **Overridable:**
  - "The minimum-creature restriction (10 creatures) could be removed; without it this is a standard confusion-like incapacitation that would need the area reduced or a damage component removed"
  - "Auditory + linguistic traits could be dropped if the GM rules the 'word' is magical rather than literally linguistic"
- **Checklist failures:** none.

## Similar official spells

- **Confusion** (rank 4) — the converter's own anchor: single-target, four-degree Will save, Stunned 1 on success / Confused (recurring save) on failure / Confused no-save on crit failure. Heightened 8th targets up to 10 creatures — notably that's the point at which Confusion itself becomes an area-ish spell, a rank-4 tier below Let's Start a Fight's native area design.
- **Confusing Cry** (rank 5) — an exact rank match and the closest structural analog found: 20-foot emanation, auditory + emotion + incapacitation + mental traits, Will save, failure = Confused (recurring save), critical failure = immediately attacks itself. Unlike Confusion, this one is natively an area spell like Let's Start a Fight.

## Prior astra touches

None recorded. `revisions.md` shows 0 deviations for this spell.

## Open flags

- The resolution mechanic is a wholesale replacement: the 5e original has no saving throw at all (pure DM-fiat percentage chance), so every mechanical number in the PF2e version — the four degrees of success, the Will save, the per-round penalty, the Strike compulsion — is new content with no 5e figure to check against.
- The 5e original's "non-weapon item" restriction on the resulting attacks (tankards/chairs/etc.) is dropped; affected creatures now make full Strikes rather than improvised-object attacks — a real change in expected damage output versus the source spell.
- The 5e original's explicit "the caster is unable to revoke the spell's effects" (non-Dismissable) clause and its "ends when most targets are unconscious" early-termination condition are both absent from the PF2e text.
- The "3+ critical failures triggers a general brawl" clause sits somewhat redundantly alongside the fact that each critical-failure creature is already individually compelled to Stride-and-Strike the nearest creature — worth checking whether the group-brawl sentence adds anything mechanically distinct from the per-creature failure/critical-failure effects already in force.

## Options & staff lean (enrichment, 2026-07-23)

The GM-fiat-percentage → per-creature Will save replacement is the RIGHT conversion —
5e's mechanic is unportable, and the four-tier structure against Confusing Cry r5 (the
exact-rank official analog) reads rank-fair with the crowd-size gate as the governor.
Keep the new resolution wholesale.

Two real items:
1. **The improvised-weapons restriction was dropped** — 5e's brawlers swing "tankards,
   plates, chairs, stools," never weapons. That clause was BOTH the spell's comedic
   identity and its damage governor (ordinary Strikes from an armed crowd are far
   deadlier than the source intends).
2. The "3+ critical failures → general brawl" sentence is mechanically redundant — every
   failed-save creature is already individually compelled; the sentence adds no distinct
   effect.

- **A. Restore improvised-only ("affected creatures attack with improvised objects or
  unarmed Strikes; they don't draw weapons") + delete the redundant brawl sentence** —
  optionally re-add the no-revoke line as flavor ("the provocation, once loosed, cannot
  be recalled").
- **B. Keep full Strikes** — a deadlier, more sinister spell; a legitimate redesign but
  a different spell than the source.
- **C. A plus the mass-unconscious early-end clause** — fiddly bookkeeping; skip unless
  fidelity wins.

**Lean: A.**
