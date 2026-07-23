# Lyrr's Chronomantic Shell

## Header block

- **Rank:** 3 · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (queue.json: `routing: "ledger:utility"`, `poolReason: "ledger"`, `verdict: null`)
- **Adapter warnings:** "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** chronomancy, concentrate, manipulate · **Rarity:** uncommon
- **Traditions:** arcane, occult
- **Cast:** 2 actions · **Range:** 30 feet · **Area:** 100-foot emanation centered on an anchor point · **Target:** none
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "8 hours"
- **Cost:** none (`cost.value` empty string)

## The 5e original

- **Name:** Lyrr's Chronomantic Shell · **Source:** tfc (homebrew) · **Level:** 3 · **School:** chronomancy
- **Casting time:** 1 minute
- **Range:** 30 feet (point)
- **Components:** V, S, M — "a stopped pocket watch"
- **Duration:** 8 hours, not concentration
- **Classes:** Bard, Druid, Wizard

> Create a shell centered to a relative point (like a ship's mask). From this point, there is a sphere with a radius of 100 ft. Within this sphere, the climate is sent back in time to a climate of the caster's choice.
>
> For example, a caster can place this shell around a ship to give it calm waters for 8 hours, no matter the surrounding. However this spell has no effect on weather created through magic after the casting.

**At Higher Levels:** "The radius of the shell increases by 100ft for every spell slot used above 3rd."

## The conversion (canonical store)

You anchor a chronomantic shell to a relative point you designate within range — such as the hull of a ship, the center of a wagon, or the base of a tent. A sphere with a 100-foot radius radiates from that anchor point and moves with it. Within this sphere, environmental conditions are reset to a calm state of the caster's choosing at the moment of casting: wind stills to a gentle breeze, rain ceases, temperature moderates, and waves calm to a placid sea. The shell has no effect on weather conditions created by magic after the casting. Creatures and objects inside the sphere are unaffected by external mundane weather for the duration.

---

**Heightened (+1)** The radius of the shell increases by 100 feet.

No `@UUID` references. No `successTiers` — matches the 5e original (no save, no attack roll, purely environmental). Structural note: `system.heightening` is entirely **absent** from the store JSON, even though the description carries a "Heightened (+1)" appendix — same pattern as Lucky Stars (see Open Flags).

## What changed, plain English

- **Casting time:** 5e's 1-minute cast time is reduced to PF2e's standard 2-action cast — the converter's notes explicitly log this as a design choice, not a mechanical necessity ("no mechanical justification for the long cast given the effect").
- **Numbers/area:** the 100-ft base radius and the "+100 ft per level above 3rd" heightening curve are preserved 1:1 from 5e.
- **Duration:** preserved 1:1 (8 hours, not concentration in either version).
- **Material component:** 5e's "a stopped pocket watch" is dropped; `cost.value` is empty.
- **No content dropped or added mechanically** — the effect description (environmental reset: wind, rain, temperature, waves; no effect on magically-created weather) is a near-verbatim carryover of the 5e text, expanded with extra example anchor points ("the hull of a ship, the center of a wagon, or the base of a tent") that add flavor but no new mechanics.
- **Rarity:** set to uncommon — the converter's notes attribute this to the named "Lyrr's" prefix implying restricted lore access; 5e has no rarity concept.
- **Traditions:** 5e class list (Bard/Druid/Wizard) maps to arcane + occult; the converter's notes flag that Druid access was dropped in this mapping (Druid → primal in the plan's tradition rules, but "the chronomantic time-reversal flavor is arcane/occult" so primal was not added).
- **Trait added with no 5e basis:** chronomancy (school-derived), concentrate, manipulate.

## Converter's notes

- **Anchor:** "Control Weather (ritual, rank 8) and Wind Walk (rank 6) as rough analogs; Lyrr's is a lower-rank, shorter-radius, non-combat environmental stabilizer"
- **Archetype:** utility (environmental control, exploration)
- **Balance bullets:**
  - "This is a pure exploration/travel utility with no combat application — calibrated as an exploration-duration spell (8 hours) with no damage or condition effects."
  - "The 100-ft radius is generous for rank 3 but appropriate since the effect (calm weather) has no combat mechanical implications — it doesn't grant concealment, damage, or condition removal."
  - "Named-caster flag: Lyrr's Chronomantic Shell would be a PF2e focus spell in an idiomatic conversion; kept as a slotted spell per plan rules."
  - "Heightening preserves the 5e 100-ft-per-slot radius growth exactly."
- **Overridable:**
  - "Cast time could be restored to 1 minute (as in 5e) if the GM wants this to feel like a significant ritual-adjacent effect rather than a quick cast."
  - "Could be made a ritual (5 gp components, 10-minute cast) for even more appropriate thematic weight."
- **Checklist failures:**
  - "Checklist item 12 — tradition list: Bard/Druid/Wizard in 5e maps imperfectly to arcane+occult; Druid is primal, but the chronomantic time-reversal flavor is arcane/occult (Matter+Mind / Mind+Spirit). Druid access dropped per plan tradition-mapping rule. If primal access is desired for Druid players, add primal as third tradition."

## Similar official spells

- **Cozy Cabin (rank 3)** — same rank, similar exploration-comfort niche: shapes a 20-ft cabin with a magical fire/light, "climate inside is comfortable and allows creatures inside it to withstand most hostile weather conditions"; 12-hour duration, 30-ft range. Closest same-rank official analog for "magically shelter a group from bad weather," though Cozy Cabin also grants physical shelter/structure whereas Lyrr's Shell is climate-only.
- **Control Weather (ritual, rank 8)** — the converter's own anchor: actually changes real weather across a 2-mile radius (drizzle/downpour/hurricane/blizzard/etc. by season), with a skill check and four degrees of success. Five ranks above Lyrr's Shell and offensively/environmentally much more powerful (changes weather outright rather than locally negating it); illustrates the top of the "weather magic" power band this spell sits far below.
- **Fiery Body (rank 7)** — unrelated function but cited only as a general polymorph-tier reference point elsewhere in this batch; not a close comparable for Lyrr's Shell specifically (included in other dossiers, not repeated here).

## Prior astra touches

None. `revisions.md` has no entry for Lyrr's Chronomantic Shell — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- `system.heightening` is entirely absent (no key) despite the description carrying a "Heightened (+1)" appendix block — same pattern as Lucky Stars in this chunk; no structured heightening representation of any kind, only prose.
- The converter's own checklist-failure note records that Druid tradition access was deliberately dropped in the 5e→PF2e tradition mapping, a factual scope-narrowing from the 5e class list (Bard/Druid/Wizard) that is called out by the converter itself as an open tradeoff.
- Material component ("a stopped pocket watch") from the 5e original is fully dropped rather than retained as flavor text or a `cost` value.
- Cast time was shortened from 5e's 1 minute to PF2e's standard 2 actions; the converter's own notes flag this as a design choice without a stated mechanical justification tied to the spell's own text.
