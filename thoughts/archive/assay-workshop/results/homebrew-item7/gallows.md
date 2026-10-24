# Gallows

## Header block

- **Rank:** 4 · **Routing:** `ledger:long-cast` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (scores.json: `kind: "ledger"`, `rawSkipReason: "long-cast time ('10 minutes')"`, `reasonCode: "long-cast"`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, planara, teleportation · **Rarity:** rare
- **Traditions:** arcane, occult
- **Cast:** 10 minutes · **Range:** touch · **Target:** 1 creature
- **Defense:** `save.statistic = "will"`, `save.basic = false`
- **Duration:** not sustained, "1 year"
- **Cost:** none (`cost.value` empty string)
- **Heightening scaffold:** `system.heightening = {"levels":{"6":{}},"type":"fixed"}`

## The 5e original

- **Name:** Gallows · **Source:** tfc (homebrew) · **Level:** 4 · **School:** planara
- **Casting time:** 1 action
- **Range:** touch (point)
- **Components:** V, S (M: null)
- **Duration:** 1 year (not concentration; `concentration: false`)
- **Classes:** Ranger, Seeker (SW), Warlock, Wizard
- **Ritual flag:** `meta.ritual = true`

> One creature you can see must succeed on a Wisdom saving throw or else it becomes linked to a structure of your choosing in view. If the creature dies during the duration of the spell, its body is instantly teleported to the structure and bound to it by stout ropes.

No `entriesHigherLevel` block in the 5e source (this spell has no native 5e upcast text).

## The conversion (canonical store)

You press your palm to the creature and bind its death to a structure within your line of sight, weaving a planar tether that will drag the creature's body to the gallows-site upon its death. The target must attempt a Will save.

For the duration, if the target dies, its body is instantly teleported to the designated structure (which must be within 500 feet when you cast the spell and must be a fixed constructed object such as a wall, pillar, archway, or frame). The body arrives bound to the structure by shimmering planar cords. The soul and its fate are unaffected — only the physical body is relocated.

The designated structure must be within your line of sight when you cast the spell. You can only have one Gallows binding active at a time; casting it again automatically ends the previous binding.

This spell is a ritual in all but name — it carries significant weight and should be cast with solemn intent. Its rare rarity reflects that knowledge of such binding magic is not freely shared.

**Critical Success** The creature is unaffected and is temporarily immune to Gallows for 1 week.

**Success** The creature is unaffected.

**Failure** The Gallows binding takes hold for the duration.

**Critical Failure** As failure, and the creature is aware of the binding and is afflicted with a vague dread; it takes a -1 status penalty to Will saves for 1 week.

---

**Heightened (6th)** You can designate any structure you have visited personally within 100 miles, not just one in your line of sight. The spell's duration becomes until your next daily preparations.

`successTiers` present in structured data, matches prose exactly. `system.defense.save = {statistic: "will", basic: false}` matches. No `@UUID` references. `system.heightening.levels."6"` is an empty object — the heightened text (range/structure-selection expansion, duration change) lives only in the description.

## What changed, plain English

- **Save type:** 5e Wisdom saving throw → PF2e Will save.
- **Action cost:** 5e "1 action" cast time → PF2e "10 minutes" cast time — a dramatic increase (the 5e original is castable in combat as a normal spell; the conversion makes it explicitly a long-cast, out-of-combat-only spell). Explained in the converter's notes as translating the 5e ritual flag (`meta.ritual: true`) into cast-time weight rather than a distinct ritual subsystem, since (per the notes) "no PF2e ritual mechanic exactly" was used.
- **500-foot range cap on the designated structure — added, no 5e basis:** the 5e text says only "a structure of your choosing in view," with no distance cap. The conversion adds "must be within 500 feet when you cast the spell," a new numeric restriction with no 5e-text equivalent (line-of-sight in 5e is unbounded by explicit range).
- **One-binding-at-a-time limit — added, no 5e basis:** the 5e text has no restriction on how many creatures a caster can bind simultaneously. The conversion adds "You can only have one Gallows binding active at a time; casting it again automatically ends the previous binding" — new content with no 5e-text equivalent, explicitly acknowledged by the converter as addressing "multiple-binding shenanigans not addressed in 5e text."
- **Full four-degree save structure added, no 5e basis:** the 5e original is a flat pass/fail (no critical distinctions at all). The conversion adds a critical-success tier (1-week immunity) and a critical-failure tier (the target becomes aware of the binding + takes a -1 status penalty to Will saves for 1 week) — both entirely new content, explicitly flagged in `checklistFailures` as "a design addition not in the source text... flagged as intentional design to comply with PF2e's mandatory four-degree structure."
- **Rarity added, no 5e basis:** the 5e original has no rarity/access restriction language at all. The conversion sets `rarity: "rare"` and adds narrative framing ("knowledge of such binding magic is not freely shared") with no 5e-text equivalent.
- **Traits added, no 5e basis:** `teleportation` and the homebrew-schema `planara` trait are both new relative to the bare 5e text, which describes the body-teleport effect but assigns no PF2e-style trait tags (5e doesn't use PF2e's trait system at all, so these are necessary system translations rather than pure additions, but the `teleportation` trait specifically gates against dimensional-lock-style counters that have no 5e equivalent).
- **Heightening, wholly new content:** 5e has no upcast text. The conversion adds a rank-6 tier (structure selection expands from "in line of sight" to "any structure visited within 100 miles," and duration changes from a flat 1 year to "until your next daily preparations") — both entirely new, no 5e basis. Note the rank-6 duration change is a *reduction* in raw duration for most play patterns (daily-prep cycles are typically ~24 hours, versus the base rank's flat 1-year duration) in exchange for the much wider structure-selection range.
- **Traditions:** 5e class list (Ranger/Seeker/Warlock/Wizard) → arcane + occult (Ranger's implicit primal-adjacent access and Warlock's patron-based access both collapse into these two).

## Converter's notes

- **Anchor:** "no clean analog — designed from rank-4 narrative/tracking utility budget; closest is Grim Tendrils or Locate at lower ranks, but Gallows is unique as a death-triggered teleportation binding"
- **Archetype:** utility/narrative
- **Balance bullets:**
  - "Will save for the binding (non-basic, with all four tiers) is appropriate — binding someone's death to a location is a psychic/spirit effect."
  - "1-year duration is unusual but appropriate: this is a narrative tracking spell, not a combat tool; Gallows serves investigation plots (body recovery, bounty hunting) on a campaign timescale."
  - "Rare rarity reflects the unusual persistence and the setting impact of a spell that can redirect a body's final location across a year."
  - "One-binding-at-a-time limit prevents the caster from marking every NPC they meet over a campaign."
- **Overridable:**
  - "Rare rarity: if the table treats Gallows as a common tool of a criminal justice organization, GM may lower to Uncommon."
  - "500-foot range for the designated structure on cast is a GM-judgment call; it could be expanded to line-of-sight-at-any-range if the table wants more flexibility."
- **Checklist failures:** "5e had no four-degree save; crit-fail tier (dread penalty -1 status to Will for 1 week) is a design addition not in the source text — flagged as intentional design to comply with PF2e's mandatory four-degree structure."

## Similar official spells

- **Planar Tether (rank 4)** — same rank; a Will-save spell whose duration itself scales by save tier (1 minute/10 minutes/1 hour) and which resists teleportation/planar-transport effects on the target. Not a death-trigger spell, but the closest official same-rank comparable for "Will-save-gated planar binding with duration keyed to the save result" mechanics.
- **Locate (rank 3)** — one rank below; a long-cast (10-minute) tracking/detection utility spell, useful as a direct comparable for cast-time weight (both are 10-minute casts) in the narrative-utility tier Gallows occupies.
- **Sending (rank 5)** — one rank above; another long-duration, narrative-utility spell (cross-planar messaging) for contrast on what a rank-5 narrative/tracking-adjacent spell's power budget looks like versus Gallows' rank-4 death-trigger binding.

## Prior astra touches

None. `revisions.md` has no entry for Gallows.

## Open flags

- `system.heightening.levels."6"` is an empty object; the entire rank-6 upgrade (structure-selection range, duration change) exists only as prose.
- The critical-failure tier's -1 status penalty to Will saves for 1 week is explicitly self-flagged in `checklistFailures` as new content invented to satisfy PF2e's mandatory four-degree save structure — this is the converter's own acknowledgment that the crit-fail consequence has no 5e basis at all, worth weighing given the spell's already-unusual (1 year) duration.
- The 500-foot range cap on the designated structure and the one-binding-at-a-time limit are both new restrictions with no 5e-text basis; both are explicitly flagged as `overridable`/discussed in the converter's notes, so the stakeholder has visibility into these as deliberate additions rather than oversights.
- Cast time went from 1 action (5e) to 10 minutes (conversion) as the translation of the 5e `ritual: true` flag — worth confirming this is the intended mechanism versus using PF2e's actual ritual subsystem (with its own primary-check/secondary-caster structure), since the converter's notes acknowledge "no PF2e ritual mechanic exactly" was used.
- The 5e original's "1 year" duration carries `concentration: false` in the 5e schema (not a concentration spell at all) — this is preserved correctly in the conversion (`duration.sustained: false`), so no discrepancy here, but worth noting since several other spells in this chunk do carry a sustain requirement despite similarly-worded 5e originals.
