# Connection

## Header

- **Rank:** 5
- **Routing:** ledger:long-cast
- **Pool reason:** ledger
- **Current assay line:** `kind: ledger`, `reasonCode: long-cast`, `rawSkipReason: "long-cast time ('1 minute')"`, `routing: ledger:long-cast`
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, memetics, mental, subtle — rarity common
- **Traditions:** arcane, divine, occult
- **Cast:** time value "1 minute"
- **Range:** planetary — **Target:** 1 willing creature you know personally
- **Defense:** none
- **Duration:** 10 minutes (not sustained)
- **Cost:** `""` (empty in the store — see "Prior astra touches")
- **Structured damage:** none (`{}`)
- **Heightening:** fixed levels 7/8/9 (empty structured payloads — text-only)

## The 5e original

**Sourcing note:** `flags.assay.seededFrom.originalName` is "Connection," but this spell is **not** found in `base_spells_5e/gen_homebrew.json` (the location specified for lookup). jmnario's own `convertedFromSpiritOf.originalSourceFile` and `_conversion_notes.json`'s `sourceFile` both say `"tfc.json"` — a sibling file in the same `base_spells_5e/` vendor directory. The real original was located there and verified by name match.

- **Level:** 5 (source file `base_spells_5e/tfc.json`)
- **School:** D (Divination)
- **Casting time:** 1 minute
- **Range:** special
- **Components:** V + S + M ("a conch shell and a pearl worth 500gp", cost 50000 cp)
- **Duration:** up to 1 hour, concentration
- **Classes:** Bard, Cleric, Wizard

> You open a connection to a willing creature with which you are familiar. Throughout the duration of the spell, you and the creature may communicate through telepathy. The creature hears the message in its mind, recognizes you as the sender if it knows you, and can answer in a like manner immediately.
>
> You can send the message across any distance and even to other planes of existence, but if the target is on a different plane than you, there is a 5 percent chance that the message doesn't arrive.
>
> While casting the spell, or while the spell is active, you may add additional willing creatures to the Connection. To do so expend a 3rd level or higher spell slot per creature.

No `entriesHigherLevel` section is present — the multi-creature scaling is handled entirely in-line via the 3rd-paragraph slot-expenditure clause rather than a separate "at higher levels" block.

## The conversion (canonical store)

> You raise a conch to your ear and speak the name of a creature you know well, opening a thread of telepathic contact between you. For the duration, you and the target can exchange thoughts at the speed of conversation; each side recognizes the other as the sender if you already know each other, and the exchange is silent and invisible to onlookers. The connection works at any distance on the same plane. If the target is on a different plane than you, each individual exchanged thought has a 5% chance of failing to arrive.
>
> **Heightened (7th)** You can include up to 3 willing creatures you know in the connection; any participant can communicate with any other.
> **Heightened (8th)** Duration becomes 1 hour and the planar miss chance drops to 1%.
> **Heightened (9th)** You can include up to 8 willing creatures.

This text is **not** byte-identical to jmnario's baseline — see "Prior astra touches" below; `revisions.md` records a description length delta of −98 chars vs. the freshly re-converted baseline. Notably, the rank-7 and rank-9 heightened tiers in the store no longer mention increased pearl material costs, whereas jmnario's baseline had "Material cost increases to a pearl worth 100 gp" (7th) and "...200 gp" (9th) — those cost-increase clauses were stripped along with the base `cost.value`.

## What changed, plain English

**5e → jmnario's conversion:**
- Duration shortened from 5e's up-to-1-hour (concentration) to a flat, non-concentration 10 minutes at base rank; rank-8 heightening restores the 1-hour duration.
- Multi-creature scaling rebuilt: 5e lets you pay *any* additional 3rd-level-or-higher slot per extra creature, uncapped, at cast time or mid-duration. PF2e replaces this with fixed heightened tiers — 3 creatures at rank 7, 8 creatures at rank 9 — removing the "pay more, get more, no ceiling" 5e structure.
- Material cost converted from 5e's 500 gp pearl to a PF2e 50 gp pearl (jmnario's baseline; see below for what happened to this in the store).
- Subtle trait added — no 5e equivalent trait exists, though the flavor ("silent and invisible to onlookers") is present in 5e's phrasing.
- Concentration requirement dropped (5e requires concentration for the full duration; the PF2e conversion's duration is not sustained).

**jmnario's conversion → the canonical store (this is the "prior astra touches" delta, described here for content completeness):**
- The `cost.value` field was emptied entirely (from "a pearl worth 50 gp (consumed)" to `""`), and the description's inline mentions of increasing pearl costs at ranks 7 and 9 were also removed from the prose.
- `memetics` was added to the traits list (jmnario's list had no memetics trait on this spell, unlike several others in this chunk such as Charming Memory and Compression, which already carried it).
- The description prose shrank by 98 characters overall, consistent with the removed cost-escalation sentences.
- The "conch to your ear" flavor line survives in the prose even though no structured material cost remains — the physical focus is now implied by flavor text only, not backed by any `cost` field.

## Converter's notes

- **Anchor:** "Sending (rank 5) — telepathic message any distance, 5% planar miss"
- **Archetype:** utility/divination (telepathic communication)
- **balanceBullets:**
  - "Anchored to Sending at rank 5: planetary range, mental, 5% planar miss preserved verbatim."
  - "Key delta from Sending: durative two-way conversation (10 min) vs Sending's one-shot 25-word exchange. The duration tier and the multi-creature heightened upgrades are the entire reason this sits at rank 5 doing more than Sending."
  - "Duration shortened from 5e's 1 hour to PF2e's 10-min exploration-utility tier (per plan rule: combat caps at 1 min/sustained, exploration steps at 10 min / 1 hr / 8 hr). Rank-8 heightened restores the 1 hour."
  - "Material cost converted from 5e 500 gp to PF2e 50 gp pearl — PF2e gp economy is roughly 10× cheaper than 5e at the same tier; matches the Talisman / focus-component economy."
  - "Subtle trait added: matches Sending; no visible sign once the 1-min cast completes."
- **overridable:**
  - "If you want it to be a true upgrade over Sending, drop the planar miss chance entirely instead of preserving 5%."
  - "Could be made a ritual (1 hour to cast, no slot) — the 1-minute cast already pushes it toward ritual feel."
  - "Heightened (7th/8th/9th) cadence could compress to a single Heightened (+2) granting +2 targets and +1 duration tier."
- **checklistFailures:** none.

## Similar official spells

- **Sending** (rank 5) — the explicit conversion anchor: a one-shot, planetary-range exchange of two 25-word messages (yours and their reply), 3-action cast, no ongoing duration. Key axis of comparison: Sending is a single instantaneous exchange; Connection is a durative two-way channel (10 minutes at base, up to 1 hour at rank 8) at the same rank — a meaningfully larger utility footprint for the same slot cost, per the converter's own balance bullet.
- **Telepathic Bond** (rank 5) — links you and up to 4 willing creatures touched in ongoing planetary-range telepathy for 8 hours, 1-minute cast, no material cost stated in the official version. This is arguably the closer functional analog to Connection's durative multi-party model — same rank, same "ongoing telepathic channel" shape — but has a far longer base duration (8 hours vs. 10 minutes) and a larger base party size (5 total vs. 1, scaling by touch rather than heightened tiers).

## Prior astra touches

`revisions.md` lists Connection among the 52 hand-edited spells, with three recorded deviations from a fresh in-memory re-conversion of the vendored baseline:

- `traits.value`: `['concentrate', 'manipulate', 'mental', 'subtle']` → `['concentrate', 'manipulate', 'memetics', 'mental', 'subtle']` (memetics trait added)
- `cost.value`: `'a pearl worth 50 gp (consumed)'` → `''` (materials-scrub sweep — cost field emptied)
- `description`: length delta −98 chars (store=884, baseline=982) — consistent with the pearl-cost-escalation sentences being removed from the rank-7/9 heightened text

## Open flags

- **Prose/field disagreement:** the description retains "You raise a conch to your ear" flavor text, but `system.cost.value` is now empty following the materials-scrub sweep — no structured cost remains even though the prose implies a physical focus object (the conch, at minimum).
- **Sourcing discrepancy vs. the given lookup path:** the 5e original for this spell is not in `base_spells_5e/gen_homebrew.json` as the standard lookup path specifies; it lives in the sibling `base_spells_5e/tfc.json` file instead. This matches what jmnario's own `sourceFile`/`originalSourceFile` fields say, so it is not a data-integrity problem, but it is a deviation from the expected lookup location worth flagging.
- **Converter-notes claim vs. actual official Sending spell (verified against the snapshot):** the balance bullets state "Subtle trait added: matches Sending" and imply Sending's cast completes in "1-min." The actual official Sending spell in the pf2e-8.3.0 snapshot has **no subtle trait** (`traits.value: [concentrate, manipulate, mental]`) and a cast time of **3 actions**, not 1 minute. The comparison claims in the converter's own notes do not match the real official spell data.
- No residual 5e-isms otherwise (no "bonus action" text, no death-save language).
- No curse-removal wording, no affliction text, not a reaction (no Trigger line to check).
- Structured damage field is empty, consistent with the prose.
