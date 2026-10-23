# Mental Balance

## Header block

- **Rank:** 4 · **Routing:** `buff` · **Pool reason:** wide-range (LOW-INFORMATION — scorer's comparables span rank 1–8, hence manual-pool routing)
- **Current assay line:** verdict = none / rankRange = [1, 8] / residualRanks = none (queue.json: `routing: "buff"`, `poolReason: "wide-range"`, `verdict: null`, `rankRange: [1, 8]`)
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, emotion, manipulate, memetics, mental · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 10 minutes (no `cast.actions`, `time.value = "10 minutes"`) · **Range:** touch · **Target:** 1 willing creature
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "8 hours"
- **Cost:** "a blindfold and a set of scales (not consumed)" — the only spell in this chunk that retains a material-component cost string in the store

## The 5e original

- **Name:** Mental Balance · **Source:** tfc (homebrew) · **Level:** 4 · **School:** memetics
- **Casting time:** 10 minutes
- **Range:** touch (point)
- **Components:** V, S, M — "a blindfold and a set of scales"
- **Duration:** 8 hours, not concentration
- **Classes:** Bard, Seeker (SW), Wizard

> You temporarily remove all of a creature's emotional attachments or biases. While under the effect of this spell, the creature gains advantage on saving throws against illusion and memetic spells. All decisions the creature makes while under the spell's influence must follow the spirit and letter of the law, and the subject is incapable of showing favoritism.

No `entriesHigherLevel` block in the 5e source.

## The conversion (canonical store)

You carefully strip away all emotional attachments, cognitive biases, and memetic influence from the target's mind, leaving behind only cool reason. For the duration, the target gains the following benefits and restrictions:

**Benefits:** The target gains a +2 status bonus to saving throws against emotion, fear, and mental spells and effects. The target automatically succeeds at Perception checks to notice memetic effects or illusions that target its emotions (though it must still attempt Will saves normally). The target is temporarily immune to the Fascinated (`@UUID[Compendium.pf2e.conditionitems.Item.Fascinated]` — a UUID link to the Fascinated condition item) condition.

**Restrictions:** The target cannot show favoritism or make decisions based on personal loyalty, emotion, or preference. All decisions the target makes while under this spell must be logically consistent with the available evidence and any applicable laws or codes they are bound by (the GM adjudicates what constitutes an irrational decision). The target cannot lie, and cannot be compelled by magically-imposed emotion to act against its rational conclusions.

---

**Heightened (6th)** The status bonus increases to +3, and the target also gains a +2 status bonus to Perception for the duration. The restrictions on emotion-based decisions are somewhat relaxed — the target may acknowledge emotional context even if it cannot act solely on emotion.

Structural note: `heightening.levels = {"6": {}}` matches the single Heightened block (text-only per the adapter warning). `cost.value` retains the material text verbatim from 5e — the only spell in this batch where the store did not blank the `cost` field (see Open Flags).

## What changed, plain English

- **Save benefit, numbers:** 5e's "advantage on saving throws against illusion and memetic spells" becomes a flat +2 status bonus to saves against a **broader** category — "emotion, fear, and mental spells and effects" (illusion/memetic in 5e maps to a wider three-trait band in PF2e).
- **Added benefit with no 5e basis:** automatic success at Perception checks to notice memetic/illusion effects targeting emotions is new — 5e granted no Perception benefit at all, only the saving-throw advantage.
- **Added benefit with no 5e basis:** temporary immunity to the Fascinated condition is new — 5e never mentioned Fascinated (a PF2e-specific condition) or any equivalent immunity.
- **Restriction, added clause:** "The target cannot lie" is new phrasing not in the 5e text; the converter's notes describe it as an implied-but-made-explicit extension of "must follow the spirit and letter of the law."
- **Restriction, preserved:** "cannot show favoritism," "must follow the spirit and letter of the law" carry over from 5e nearly verbatim.
- **Casting time and duration:** both preserved 1:1 from 5e (10-minute cast, 8-hour duration) — the converter's notes frame this explicitly as an intentional pre-expedition/exploration-tier spell rather than a combat buff.
- **Heightening:** 5e had none. The conversion adds a 6th-rank tier (bonus +2→+3, new +2 status to Perception, and a relaxation of the "cannot act on emotion" restriction) with no 5e basis.
- **Material component:** preserved 1:1 as a `cost` value ("a blindfold and a set of scales (not consumed)") — notably NOT scrubbed, unlike every other spell in this chunk.
- **Traits added with no 5e basis:** emotion, mental, memetics (school-derived), concentrate, manipulate.
- **Traditions:** 5e class list (Bard, Seeker, Wizard) collapses to arcane + occult.

## Converter's notes

- **Anchor:** "no clean analog — closest is Calm (emotion control) or Heroism (buff) but Mental Balance is uniquely both a buff (save bonus) and a restriction (cannot act on emotion)"
- **Archetype:** utility/buff
- **Balance bullets:**
  - "+2 status bonus to saves vs emotion/fear/mental is appropriate for rank 4 (Heroism at rank 3 gives +1 to all saves; a focused +2 against one category at rank 4 is in range)"
  - "8-hour duration with 10-minute cast time positions this as a pre-expedition preparation, not a combat buff — this is intentional and correct per the plan's exploration-duration guidelines"
  - "The restriction (cannot act on emotion or favoritism) is a meaningful balancing factor that most players will experience as a roleplay constraint; the spell is genuinely double-edged"
  - "Fascinated immunity is a natural consequence of stripped emotional engagement — this is a logical extension not requiring explicit balancing"
- **Overridable:**
  - "FOCUS SPELL SUGGESTION: Mental Balance is strongly suited for a Memetics/Laixa practitioner as a ritual or focus ability; its 10-minute cast time and 8-hour duration are more ritual than spell"
  - "The 'cannot lie' restriction is a design addition not explicit in 5e text (implied by 'must follow the law'); GM may remove it if the table finds it too restrictive"
- **Checklist failures:** none recorded.

## Similar official spells

*(Note: the assay scorer's own comparables span rank 1–8 for this spell — flagged as low-information by the routing itself. The picks below are hand-selected on function, independent of that scorer output.)*

- **Heroism (rank 3)** — flat +1/+2/+3 status bonus (heightened at 6th/9th) to attack, Perception, saves, **and** skill checks, touch range, 10-minute duration, no restriction/drawback. Cited directly by the converter's notes as the ceiling Mental Balance's narrower +2 bonus is calibrated against; Heroism is broader-scope but one rank lower and carries no double-edged restriction.
- **Zealous Conviction (rank 6)** — touch/30-ft, up to 10 willing creatures, grants 12 temp HP + +2 status to Will saves vs. mental effects, but also imposes a compulsion ("must comply with your request") with its own Will-save escape clause. The closest official comparable for "a save-bonus buff bundled with a behavioral restriction/tradeoff on the target," two ranks above Mental Balance and multi-target rather than single-target.
- **Calm (rank 2)** — the converter's other cited anchor: forcibly suppresses emotion-driven hostile action in a 10-ft burst via a Will save with four degrees of success; an enemy-facing emotion-suppression spell (not a willing-ally buff) included here only because the converter names it as a reference point.
- **Fiery Body / Dragon Form** — appear in the Monstrous Copy: Claws dossier in this chunk; not functional comparables for Mental Balance's save/behavior-restriction shape, omitted here.

## Prior astra touches

None. `revisions.md` has no entry for Mental Balance — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- **Assay routing itself flags this spell as low-information:** `poolReason: "wide-range"` with a scorer-derived comparables rank range of 1–8 — an 8-rank spread at rank 4, recorded here per the task brief as the reason this spell sits in the manual pool.
- **Material-component text was not scrubbed** — `cost.value` = "a blindfold and a set of scales (not consumed)," carried through verbatim from the 5e original and jmnario's conversion. Every other spell in this chunk has an empty `cost.value`. This is the one outlier for materials handling across the batch.
- The description contains a live `@UUID[Compendium.pf2e.conditionitems.Item.Fascinated]{Fascinated}` crossref link — flagged per the dossier template's instruction to note UUID-link text, not a defect.
- Casting time is expressed via `time.value = "10 minutes"` with no `cast.actions` field (matches the 5e 10-minute cast and is structurally consistent, just noting the non-action-count cast-time shape for completeness).
