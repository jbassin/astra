# Charming Memory

## Header

- **Rank:** 1
- **Routing:** buff
- **Pool reason:** wide-range (comparables rank range 1–7 — LOW-INFORMATION, hence the manual pool)
- **Current assay line:** `kind: buff-comparables`, `population: beneficial`, `rankRange: [1, 7]`, `routing: buff`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, emotion, illusion, manipulate, memetics, mental, subtle — rarity common
- **Traditions:** arcane, occult
- **Cast:** 2 actions
- **Range:** self — **Target:** you
- **Defense:** none
- **Duration:** 1 hour (not sustained)
- **Structured damage:** none (`{}`)
- **Heightening:** fixed levels 4/7 (empty structured payloads — text-only)

## The 5e original

- **Level:** 1 (source file `gen_homebrew.json`)
- **School:** memetics
- **Casting time:** 1 action
- **Range:** self
- **Components:** S only (no V, no M)
- **Duration:** 24 hours, no concentration
- **Classes:** Bard, Seeker (SW), Wizard

> You plant temporary, false, pleasant memories of yourself in another's mind. While the spell is active you may endear yourself to those around you and add 1d4 to any Charisma check or saving throw.

No `entriesHigherLevel` section is present — the 5e original has no upcast text.

## The conversion (canonical store)

> You plant a shimmering aura of warm false memory around yourself, seeding the ambient mental impressions of nearby creatures with pleasant recollections of you that feel genuine. For the duration, you gain a +1 status bonus to Deception, Diplomacy, and Performance checks. This spell has no effect in combat and cannot influence creatures in combat — it is a social lubricant only. The subtle trait means no perceptible sign of spellcasting is visible once the spell is cast.
>
> **Heightened (4th)** The status bonus increases to +2.
> **Heightened (7th)** The status bonus increases to +3 and also applies to Intimidation checks.

This description matches jmnario's baseline conversion (confirmed via `revisions.md` — 0 deviations for this spell).

## What changed, plain English

- **Numbers:** 5e grants a random +1d4 (avg +2.5) bonus to *any* Charisma check or saving throw. PF2e converts this to a flat +1 status bonus limited to three named skills (Deception, Diplomacy, Performance) — a substantial narrowing in both scope (all Cha checks/saves → 3 skills) and average magnitude (avg 2.5 → flat 1, though it does scale to +3 at rank 7).
- **Duration:** 5e's 24-hour duration is cut to a PF2e 1-hour "exploration tier" duration.
- **Scope narrowed structurally:** the 5e bonus applies to Charisma *saving throws* as well as checks; the PF2e version applies only to specific skill checks — saving-throw applicability is dropped entirely.
- **Content added with no 5e basis:** the subtle trait (no perceptible casting sign) and the explicit "has no effect in combat and cannot influence creatures in combat" restriction are both new — 5e's text has no combat exclusion clause and no subtlety language.
- **Heightening restructured:** 5e has no upcast text at all (flat 24-hour/1d4 effect regardless of slot). PF2e heightening (rank 4: +2; rank 7: +3, also gains Intimidation) is entirely invented, following what the converter notes describe as a Heroism-style status-bonus curve.
- **Target reframing:** 5e's text implies the false memories are planted in *others'* minds about the caster generally ("plant... false memories of yourself in another's mind... endear yourself to those around you"), while the PF2e version keeps it explicitly self-only/self-buff throughout, per its `range: self, target: you` fields.

## Converter's notes

- **Anchor:** "Charm (rank 1) — social enchantment with 1-hour exploration duration"
- **Archetype:** buff/social (exploration-tier social enhancement)
- **balanceBullets:**
  - "Anchored to Charm at rank 1: both are social enchantments with 1-hour duration."
  - "5e's '+1d4 to any Charisma check or saving throw' (avg +2.5 to everything) is above rank 1 budget — Heroism at rank 3 gives +1 status to everything including saves; a rank-1 spell with +1d4 avg 2.5 to Cha saves eclipses that."
  - "Reduced to +1 status on Deception/Diplomacy/Performance only (social skills) to stay comfortably within rank 1 bounds."
  - "Heightening follows the Heroism status-bonus curve: +1 at rank 1, +2 at rank 4, +3 at rank 7."
- **overridable:**
  - "Could include Intimidation in the base effect at rank 1 (all four social skills), at the cost of being slightly above the Charm anchor."
  - "Could be redesigned to target others rather than self (plant memories in one willing creature; that creature gains the social bonus when interacting with you) for stronger 5e fidelity."
- **checklistFailures:** none.

## Similar official spells

- **Heroism** (rank 3) — +1/+2/+3 status bonus to attack rolls, Perception, saving throws, *and all skill checks* (touch, targets another creature, 10-minute duration). Direct potency/breadth reference cited in the converter's own balance bullets: Charming Memory's rank-1 bonus is narrower in scope (3–4 social skills vs. everything) but is a self-only, non-combat-usable buff two ranks lower.
- **Musical Accompaniment** (cantrip, level 1 slot but functionally at-will) — a cantrip granting +1 status to Performance, and at GM discretion to Deception/Diplomacy/Intimidation in social situations. Notable comparison: this is an unlimited-use cantrip granting the same class of bonus (+1 status, social skills) that Charming Memory spends an actual rank-1 spell slot to guarantee unconditionally.
- **scorer comparables (low-information):** Thicket of Knives (rank 1), Aerial Form (rank 4), Angel Form (rank 7), Animal Form (rank 2), Ant Haul (rank 1) — the assay tool's auto-selected buff comparables for this spell's rank-1–7 range; several (battle-form transformations, carrying capacity) are functionally unrelated to a social-skill buff, which is why this spell sits in the manual/low-information pool rather than being auto-scored.

## Prior astra touches

None. `revisions.md` does not list Charming Memory among the 52 hand-edited spells — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations).

## Open flags

- No residual 5e-isms (no "bonus action," no death-save language, no material component — consistent with Remaster's no-materials norm).
- No curse-removal wording, no affliction text, not a reaction (no Trigger line to check).
- Structured damage field is empty, consistent with the prose.
- The scorer's auto-picked comparables (Aerial Form, Angel Form, Animal Form) are battle-form transformation spells with no functional overlap to a social-skill buff — factual note on why the wide rank range (1–7) makes this spell low-information for the automated buff-comparables routing.
