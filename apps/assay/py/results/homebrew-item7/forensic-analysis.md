# Forensic Analysis

## Header block

- **Rank:** 2 · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (scores.json: `kind: "ledger"`, `rawSkipReason: "no-priceable-effect (no damage, no conditions, no modifiers)"`, `reasonCode: "utility"`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, memetics, mental · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 1 action · **Range:** 60 feet · **Target:** 1 creature
- **Defense:** `save.statistic = "will"`, `save.basic = false`
- **Duration:** not sustained, "" (instantaneous — empty duration value)
- **Cost:** none (`cost.value` empty string)
- **Heightening scaffold:** `system.heightening = {"levels":{"4":{},"6":{}},"type":"fixed"}`

## The 5e original

- **Name:** Forensic Analysis · **Source:** tfc (homebrew) · **Level:** 2 · **School:** memetics
- **Casting time:** 1 bonus action
- **Range:** 60 feet (point)
- **Components:** none checked V/S; M — "a polished monocle"
- **Duration:** Instantaneous
- **Classes:** Bard, Seeker (SW), Wizard

> You translate a sliver of a creature's soul into readable text, giving you insight into their inner workings. The first time you cast this spell, you materialize a "Compendium of Statistics and Secrets." When it first materializes, the book has only one page, an empty table of contents. On subsequent castings of the spell, you may populate the book with both the statistics of a foe or the secrets of a creature.
>
> When you cast the spell to learn statistics, you may select a creature in range. A page is added to the Compendium with the species of the creature, its type, a picture, and one additional stat of your choosing. You may choose to learn about a creature's vitality, resistances, vulnerabilities, skill aptitudes, greatest ability, or weakest ability. On subsequent castings of the spell, you may choose to learn another statistic, this will automatically be added to the creature's original entry.
>
> When you cast the spell to learn secrets, you may select a creature in range. A page is added to the Compedium with their name, their race, a picture, and a one-word description of the their mood. While within range of the creature, the mood descriptor will update to match the their current status. Additionally, the creature must make a Wisdom saving throw. On a failure, you may ask their psyche one question and the answer (to the best of the creature's knowledge) will be recorded in the compendium. On a success, the creature knows you attempted to dig into its mind. Either way, you cannot cast the spell on the same creature in this fashion for another 24 hours.

No `entriesHigherLevel` block in the 5e source (this spell has no native 5e upcast text).

## The conversion (canonical store)

You translate a sliver of a creature's soul into readable text, inscribing it into a magical Compendium of Statistics and Secrets that you conjure on the first casting. The Compendium materializes as a small, floating tome visible only to you; it persists indefinitely but contains no information until you cast this spell. On subsequent castings you choose one of two modes.

Statistics Mode: You learn one of the following about the target: its creature type, one damage resistance or immunity, one damage weakness, its highest or lowest saving throw modifier (your choice), or the approximate level of its greatest or weakest ability score. The result is recorded in the Compendium under the creature's entry.

Secrets Mode: The target must attempt a Will saving throw.

**Critical Success** The target is unaffected and immediately knows you attempted to read its mind.

**Success** The target is unaffected and immediately knows you attempted to read its mind.

**Failure** You learn one secret (a single yes-or-no answer) from the target's psyche, recorded in the Compendium.

**Critical Failure** You learn two secrets (each a yes-or-no answer) from the target's psyche, recorded in the Compendium.

---

**Heightened (4th)** In Secrets Mode you may ask open-ended questions (not just yes/no); the target answers truthfully to the best of its knowledge. In Statistics Mode you learn two statistics per casting instead of one.

**Heightened (6th)** In Secrets Mode you may ask up to three open-ended questions. You may also cast the spell in Statistics Mode and Secrets Mode simultaneously in the same action, using only one casting.

No `@UUID` references. `successTiers` is present in the structured JSON and matches the prose degree-of-success text exactly. `system.defense.save = {statistic: "will", basic: false}` correctly reflects the Secrets Mode save (Statistics Mode has no save at all, per the prose — the structured field doesn't distinguish between the two modes, since PF2e's schema has one `defense` slot per spell). `system.heightening.levels."4"` and `."6"` are both empty objects — the heightened mode-unlock text lives only in the description.

## What changed, plain English

- **Save type:** 5e Wisdom saving throw → PF2e Will save (standard mind-affecting mapping).
- **Statistics Mode content list expanded/reworded:** 5e's list is vitality, resistances, vulnerabilities, skill aptitudes, greatest ability, weakest ability. The conversion's list is creature type, one resistance/immunity, one weakness, highest/lowest save modifier, approximate level of greatest/weakest ability score. "Vitality" (max HP, presumably) and generic "skill aptitudes" are dropped; "creature type" and "highest/lowest save modifier" are added with no 5e-text basis.
- **Secrets Mode answer count changed by save tier — new structure:** the 5e text has a flat two-outcome result (success = no info + target knows; failure = one yes/no answer). The conversion adds full four-degree PF2e structure: critical success/success are identical (both = target unaffected + aware), failure = 1 secret, **critical failure = 2 secrets** — the two-secrets-on-crit-fail outcome has no 5e-text equivalent at all (5e's failure state was always exactly one question, with no escalation for a worse roll, since 5e doesn't have degrees of failure on saves).
- **Secrets Mode target awareness changed:** 5e's version has the target become aware of the probe *only on a save success* ("On a success, the creature knows you attempted to dig into its mind"); on a failure the target is unaware ("The target does not know the question was asked" — per the jmnario conversion's `successTiers`, though this line is not present in the astra store's prose). The astra store's failure/critical-failure text says only "You learn one/two secret(s)... recorded in the Compendium," dropping the explicit "the target is unaware" clause that appears in the jmnario mid-stage conversion but was present in spirit in the 5e original.
- **Statistics Mode 24-hour lockout dropped:** the 5e text's "you cannot cast the spell on the same creature in this fashion for another 24 hours" (for Secrets Mode) is not restated anywhere in the astra store's prose — no cooldown language appears in either mode.
- **Compendium's persistent mood-tracking feature dropped:** the 5e original's Secrets Mode explicitly notes the book's per-target "mood descriptor" auto-updates "while within range of the creature." This live-updating narrative feature has no equivalent in the conversion at all — the astra store's Compendium is described as recording only the discrete cast-time results, not a persistent live status tracker.
- **Material component ("a polished monocle") dropped:** the 5e original requires this component (present in the jmnario mid-stage conversion as "consumed on first casting"); the astra store's `cost.value` is empty and the description makes no mention of a monocle at all.
- **Action cost:** 5e 1 bonus action → PF2e 1 action.
- **Heightening, wholly new content:** 5e has no upcast text. The conversion adds two heightened tiers (4th: open-ended questions + 2 statistics/cast; 6th: 3 open-ended questions + simultaneous dual-mode casting) with no 5e basis whatsoever.
- **Traditions:** 5e class list (Bard/Seeker/Wizard) → arcane + occult.

## Converter's notes

- **Anchor:** "See the Unseen (rank 2) — utility divination; no damage; 10-minute self-buff"
- **Archetype:** utility/divination
- **Balance bullets:**
  - "Anchored to See the Unseen (rank 2): both are utility divination spells with no damage and exploration-grade information gathering."
  - "Base is yes/no only in Secrets Mode — open questions unlocked at rank 4/6 heightening. This keeps the rank-2 slot from being a free interrogation tool."
  - "The Compendium is a persistent in-fiction object that accumulates — this is narrative gold but has zero mechanical power beyond the per-cast result, so it costs nothing extra."
  - "1-action cast preserves the 5e bonus-action speed; this is justified by the purely informational output (no attack, no condition, no damage)."
  - "Will save in Secrets Mode with success/crit-success detection fulfills the 'mind-probe always has a risk of revealing itself' social-game design."
- **Overridable:**
  - "Could widen to open questions at base rank if the GM is comfortable with a more powerful rank-2 interrogation tool — but this would eclipse Zone of Truth (which requires success to compel truth and is rank 3)."
  - "Traditions could include divine (spirit-based soul-reading) if the GM prefers a broader tradition access for the Compendium mechanic."
- **Checklist failures:** "Named-caster adjacent (Seeker/Laixa adjacent): PF2e-idiomatic conversion is a focus spell; kept as regular spell per plan directive."

## Similar official spells

- **Mind Probe (rank 5)** — sustained interrogation: access a target's memories/knowledge via Will save, then ask a new question each round (resisted per-question by Deception). Three ranks above Forensic Analysis's base rank; the clearest official comparable for the Secrets Mode axis, showing what a fully repeatable open-question mind-read costs at a much higher rank than where the homebrew's heightened (4th) open-question unlock sits.
- **See the Unseen (rank 2)** — the converter's own anchor: 10-minute self-buff granting the ability to see invisible/incorporeal creatures (Concealed clarity), no save, no target. Same rank; illustrates the "free, no-save, purely informational rank-2" budget the converter used as a baseline, though See the Unseen is a self-buff rather than a targeted probe.
- **Sudden Recollection (rank 3)** — Will-save memory manipulation (implant/suppress a memory), one rank above; a related memetics-school utility spell for comparing save-gated mental-access budgets at adjacent rank.
- **Ill Omen (rank 1, official)** — not a direct functional match, but shares the "target learns of the attempt only on certain outcomes" social-stealth pattern seen in Forensic Analysis's success/crit-success awareness clause; included for the awareness-mechanic comparison at a much lower rank.

## Prior astra touches

None. `revisions.md` has no entry for Forensic Analysis.

## Open flags

- **Content dropped, no 5e basis for the removal:** the 5e original's Secrets Mode live-updating "mood descriptor" for the Compendium's target entries is entirely absent from the conversion — no discussion of this drop appears in `balanceBullets`, `overridable`, or `checklistFailures`.
- **Content dropped:** the 5e original's explicit 24-hour-per-target cooldown on Secrets Mode casting is not present anywhere in the astra store's prose (the jmnario mid-stage conversion still states "You can't cast this spell on the same creature in Secrets Mode more than once per day," but this line does not appear in the astra store's final description at all).
- **Content added, no 5e basis:** the critical-failure tier granting *two* secrets (vs. one on a plain failure) is new PF2e-degree-of-success structure invented for this conversion — reasonable given PF2e's four-tier save requirement, but worth confirming it was an intentional escalation rather than an oversight, since the checklist-failures note only flags the reverse case (Gallows) as an intentional four-tier addition.
- **Material component dropped without discussion:** the 5e original's "polished monocle" component (called out as "consumed on first casting" in the jmnario intermediate conversion) is entirely absent from the astra store — no `cost.value`, no description mention.
- `system.heightening.levels."4"` and `."6"` are both empty objects; the entire two-tier heightened-mode-unlock (open questions, dual-mode single-cast) exists only as prose.
- The `checklistFailures` note flags that a "PF2e-idiomatic conversion is a focus spell" but the spell was "kept as regular spell per plan directive" — worth confirming this directive is still the intended design given the spell's persistent-Compendium, once-per-day-style mechanics that read as focus-spell-shaped.

## Options & staff lean (enrichment, 2026-07-23)

**Post-batch-0 note:** the target-unaware clause and the Compendium
mental-construct/destroyed-on-death text were RESTORED by `f91b2d6` — the dossier's
sections above predate that. Two 5e drops remain live:

1. **The 24-hour per-target Secrets-Mode cooldown** — jmnario's own mid-stage conversion
   still had it ("once per day"); the store has no cooldown at all. It's the anti-spam
   valve: without it a caster can re-probe every round until the failure lands. Balance-real.
2. **The live-updating mood descriptor** — the Compendium's per-target mood line that
   updates in range. Pure narrative gold, zero mechanical weight, and it's half the
   book's charm.

The invented crit-fail 2-secrets tier is good PF2e escalation (keep); the Statistics list
rework is PF2e-native (keep); focus-spell-shaped is a recorded plan directive (keep).

- **A. Restore both: the 24h Secrets cooldown + the mood-descriptor feature** — both are
  jmnario intent, one balance-real, one free flavor.
- **B. Cooldown only** — if the mood tracker feels like bookkeeping.
- **C. Keep as-is** — leaves the interrogation spammable at r2; not recommended.

**Lean: A.**
