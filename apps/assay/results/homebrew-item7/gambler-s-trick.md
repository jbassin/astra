# Gambler's Trick

## Header block

- **Rank:** 1 (cantrip) · **Routing:** `ledger:utility` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (scores.json: `kind: "ledger"`, `isCantrip: true`, `rawSkipReason` not populated for this entry, `reasonCode: "utility"`)
- **Adapter warnings:** none (`flags.assay.adapterWarnings = []`)
- **Traits:** cantrip, concentrate, fortune, manipulate, mental, mercuromancy · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 1 action · **Range:** 30 feet · **Target:** 1 minor chance event within range
- **Defense:** none (`system.defense = null`)
- **Duration:** not sustained, "" (instantaneous — empty duration value)
- **Cost:** none (`cost.value` empty string)
- **Heightening:** no `system.heightening` key present at all (cantrips scale automatically by character level in PF2e and don't carry a heightening block)

## The 5e original

- **Name:** Gambler's Trick · **Source:** tfc (homebrew) · **Level:** 0 (cantrip) · **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** 5 feet (point)
- **Components:** S only (V: false, M: null)
- **Duration:** Instantaneous
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> Gently pulling on the threads of luck, you move a small act of chance in your favor. When a coin is flipped, a die is rolled, a card is pulled, or some other minor act that involves chance occurs, you can tweak the outcome to what you wish.

No `entriesHigherLevel` block in the 5e source (cantrips don't upcast in 5e).

## The conversion (canonical store)

You gently tug the threads of probability to nudge a single, minor act of chance in your favor. When you Cast this Spell, choose one of the following minor random events that is actively occurring within range: a coin flip, a die roll (a d4 through d20) used for a non-critical game of chance or minor contest, a card draw from a shuffled deck, or an equivalent petty act of fortune. You choose the result of the event from among the event's possible outcomes. This spell cannot affect attack rolls, skill checks, saving throws, initiative, or any other mechanical resolution, and it has no effect in combat. The fortune trait on this spell means that additional fortune effects cannot further alter the chosen result.

No `@UUID` references. No `successTiers`/degree-of-success structure — matches the 5e original's no-save, no-check design. No `heightening` key of any kind (correct for a cantrip; PF2e cantrips scale to the caster's level automatically and rarely carry a fixed-rank heightening block unless there's a special escalation).

## What changed, plain English

- **Range increased:** 5e's 5-foot range → PF2e's 30-foot range — a 6× increase with no explicit discussion tying the number itself to a design rationale beyond "to define the 'within range' trigger; 5e had no range (implied personal)" in the converter's notes. The 5e text technically specifies 5 feet as the numeric range (not "implied personal" — the 5e JSON range field is `{"type":"feet","amount":5}`), so the converter's note characterizing the 5e range as unspecified doesn't match the 5e source data exactly; see Open Flags.
- **Explicit exclusion list added, no 5e basis:** the 5e text is a single permissive sentence ("you can tweak the outcome to what you wish") with no explicit carve-outs. The conversion adds a detailed exclusion clause: "cannot affect attack rolls, skill checks, saving throws, initiative, or any other mechanical resolution, and it has no effect in combat" — new restrictive text with no 5e-text equivalent, though it's consistent with the spell's clear non-combat intent.
- **Die-size restriction added, no 5e basis:** the conversion specifies "a die roll (a d4 through d20)" — the 5e text says only "a die is rolled" with no size qualifier at all.
- **`fortune` trait and its anti-stacking clause added, no 5e basis:** the 5e original has no PF2e-style trait system; the conversion adds the `fortune` trait plus an explicit rules clause ("additional fortune effects cannot further alter the chosen result") that has no 5e-text equivalent, since 5e doesn't have a fortune-effect-stacking rule to translate from.
- **Components:** 5e S-only (no verbal) → PF2e `cast.components: ["manipulate"]` in the jmnario intermediate conversion (the astra store doesn't carry a separate components array, relying on the `manipulate` trait instead).
- **Traditions:** 5e class list (Bard/Druid/Seeker/Sorcerer/Warlock/Wizard) → arcane + occult (Druid's primal access explicitly dropped).
- **No heightening added:** unlike every other spell in this chunk, the converter deliberately added *no* heightening text at all, explicitly reasoned in the notes as "there is no meaningful stronger version of 'you choose the outcome of one petty act of chance.'"

## Converter's notes

- **Anchor:** "Prestidigitation (cantrip) — minor non-mechanical effects; no combat use"
- **Archetype:** cantrip-utility (non-combat luck manipulation)
- **Balance bullets:**
  - "Anchored to Prestidigitation: this is a social/flavor cantrip that does nothing in combat and cannot influence mechanical rolls (attack, saves, skill checks)."
  - "Fortune trait added to correctly key this into PF2e's luck subsystem, preventing stacking with other fortune effects."
  - "1-action cost (somatic only in 5e) preserved — the spell is trivial in mechanical impact and 1-action cost is appropriate."
  - "No heightening because there is no meaningful stronger version of 'you choose the outcome of one petty act of chance.'"
- **Overridable:**
  - "Could be given a very narrow in-combat use (e.g., once per encounter, choose the face of a rolled die that isn't a d20) — would need to be rated as a 'loaded cantrip' and gain the fortune trait's spell-attack interaction text."
  - "Range could be reduced to touch (the caster needs to physically intervene in the chance event) for tighter flavor."
- **Checklist failures:** none recorded.

## Similar official spells

- **Prestidigitation (cantrip)** — the converter's own anchor: a Sustain-based menu of minor non-mechanical effects (cook, lift, clean, flavor, etc.), no combat use, no save. Same rank tier; both are flavor-only cantrips with zero mechanical-resolution impact, though Prestidigitation is repeatable per-sustain while Gambler's Trick is a single instantaneous nudge.
- **Wash Your Luck (rank 1, official)** — a `fortune`-traited cantrip that cancels a misfortune effect on one roll once per duration. Same rank and shares the `fortune` trait directly; a useful contrast since Wash Your Luck *does* interact with real mechanical rolls (canceling a debuff), unlike Gambler's Trick's explicit no-combat/no-mechanical-resolution restriction.
- **Ill Omen (rank 1, official)** — a `misfortune`-traited attack/skill-check debuff spell (roll twice, take worse), Will-save gated. Not a functional match, but the natural fortune/misfortune-trait sibling for comparing how the `fortune`/`misfortune` trait pair behaves when it *does* touch mechanical resolution, versus Gambler's Trick's deliberate exclusion of that space.

## Prior astra touches

None. `revisions.md` has no entry for Gambler's Trick.

## Open flags

- The converter's notes describe the 5e original as having "no range (implied personal)," but the 5e source JSON explicitly specifies a 5-foot point range (`range.distance = {"type":"feet","amount":5}`) — the notes' characterization doesn't match the actual 5e data, though the conversion's chosen 30-foot range is a design decision regardless of this discrepancy.
- `system.traits.value` includes `mercuromancy` as a trait (matching the 5e school name, kept as a homebrew-schema trait tag) alongside the standard PF2e traits (`cantrip`, `concentrate`, `fortune`, `manipulate`, `mental`) — worth confirming `mercuromancy` is an intentionally-preserved custom trait category (as it is for several other spells in this chunk, e.g. Fumble, Flicker's `kosmoturgy`) rather than a leftover school label.
- No structural disagreement found between prose and structured fields for this spell — it is the cleanest of the eight in this batch (zero adapter warnings, exact match between `successTiers`-absence and the no-save prose, no empty heightening scaffolds since none is expected for a cantrip).
