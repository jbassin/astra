# Temporal Discharge

## Header block

- **Rank:** 4
- **Routing:** `ledger:long-cast`
- **Pool reason:** ledger
- **Current assay line:** verdict = `null`, rankRange = `null`, residualRanks = `null` (unscored in `apps/assay/results/homebrew-item7/queue.json`)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "defense text has qualifiers beyond the base save/attack shape, not structurally represented (only the primary save/attack-roll mapped): 'basic Reflex save (when triggered)'"
  2. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** chronomancy, concentrate, manipulate — rarity: rare — traditions: arcane, occult
- **Cast:** 10 minutes
- **Range:** touch
- **Target:** 1 non-creature object
- **Defense:** basic Reflex save (structured: `defense.save = {basic: true, statistic: reflex}`)
- **Duration:** until discharged or until your next daily preparations (structured: `duration.sustained = false`)
- **Cost:** a gemstone worth at least 25 gp (consumed)
- **Structured `heightening` field:** absent (no `system.heightening` object at all)
- **Structured `damage` field:** empty (`system.damage = {}`)

## The 5e original

- **Level / School:** 4th-level chronomancy
- **Casting time:** 10 minutes
- **Range:** Touch (point)
- **Components:** V, S, M (material present, no descriptive text/cost given in the source entry — `"m": true`)
- **Duration:** Permanent
- **Classes:** Bard, Druid, Wizard
- **Source:** `tfc` (homebrew source tag), ritual: false

**Entries:**

> You funnel magical energy into an object, to be discharged at a later date. When casting the spell, you may select a damage type and a command word. The damage type may not be force damage. When a creature touches the object without speaking the command word, magical energy springs forth, dealing 10d6 damage in the type you chose, or half damage with a successful Dexterity saving throw.
>
> The presence of a charge on an object can be detected with a successful Intelligence (Investigation) check against your spell save DC.

**entriesHigherLevel:** none present in the 5e original — no upcast/higher-slot text at all.

## The conversion (canonical store)

You spend ten minutes channeling magical energy into a touched object, storing a temporal charge within it. When you cast the spell, choose one of the following damage types: acid, cold, electricity, fire, sonic, or void. Also speak a command word (a unique word or phrase) in a language you know. The charged object is otherwise unchanged in appearance; a successful Recall Knowledge or Seek check against your spell DC reveals the presence of a magical aura.

**Trigger:** The first time a creature touches the object without speaking the command word within 6 seconds of touching it, the stored energy discharges. The triggering creature must attempt a Reflex save against your spell DC.

The object is not destroyed by the discharge.

**Critical Success** The creature takes no damage.

**Success** The creature takes half damage (5d6 of the chosen type).

**Failure** The creature takes full damage: 10d6 of the chosen type.

**Critical Failure** The creature takes double damage: 20d6 of the chosen type.

---

**Heightened (+1)** The damage on failure increases by 2d6, and the duration extends by 1 day per additional rank (until the caster's next daily preparations plus 1 day at rank 5, etc., to a maximum of 1 week at rank 7).

**Structured/prose notes:**
- The "Trigger:" line is written as markdown `**Trigger:**` embedded inside an HTML `<p>` tag, unlike the rest of the description which uses proper HTML `<strong>` tags (Critical Success/Success/Failure/Critical Failure all use `<strong>`). See Open flags.
- No `@UUID` links in this description (nothing to cross-reference — no condition is applied).
- The interval heightening line ("Heightened (+1)") is prose-only; there is no `system.heightening` structured object at all for this spell (adapter warning #2 above).
- `system.damage = {}` — the degree-of-success damage progression (5d6/10d6/20d6) lives only in the description prose, not in a structured damage field.

## What changed, plain English

The 5e original is a single-effect item-trap spell: 10d6 damage of a chosen (non-force) type on touch, halved on a successful Dex save, permanent duration, no upcast text at all. The PF2e conversion keeps the core "charge an object, trigger on touch without the command word" fiction intact but restructures the numbers and duration around PF2e's four-degree save framework and daily-prep conventions.

- **Numbers:**
  - 5e: flat 10d6 on failed Dex save, half (5d6) on success, binary (no crit tiers).
  - PF2e: four-degree Reflex save — crit success = no damage (new tier, no 5e equivalent), success = half (5d6, matches 5e's success value), failure = full (10d6, matches 5e's failure value), critical failure = double (20d6, a new upper tier with no 5e equivalent since 5e was binary).
  - Casting time preserved exactly (10 minutes).
  - Save type: 5e Dexterity → PF2e Reflex (direct organ-map, dodging an energy burst).
- **Structure:**
  - 5e duration "Permanent" → PF2e "until discharged or until your next daily preparations" — the conversion notes flag this explicitly as a deliberate reduction from a truly permanent trap to a daily-cycle-bound one.
  - 5e had no upcast/higher-level text whatsoever; PF2e invents an entirely new heightening rider: +2d6 damage per rank AND a duration-extension mechanic (until daily prep +1 day at rank 5, scaling to a max of 1 week at rank 7). This heightening structure has no 5e basis at all — it is wholly new content.
  - PF2e adds explicit crit-success ("no damage") and crit-failure ("double damage, 20d6") tiers, both of which do not exist in the 5e binary pass/fail.
- **Content dropped from 5e:**
  - Detection is changed from "Intelligence (Investigation) check vs your spell save DC" to "Recall Knowledge or Seek check against your spell DC" — the specific ability score framing (Intelligence) is dropped, replaced with the PF2e skill-check idiom (this is an expected/necessary systemic translation, not a content loss, but is a change in what is detectable-by).
- **Content added with no 5e basis:**
  - The gemstone material cost ("worth at least 25 gp, consumed") — 5e only flagged `"m": true` with no cost or description. The conversion notes explicitly flag this as "a design addition not in the 5e text."
  - The entire heightening structure (damage scaling AND duration-extension scaling) — 5e had zero upcast text for this spell.
  - The "trap" trait present in the intermediate jmnario conversion (`convertedFromSpiritOf`/`all_spells_pf2e.json`) does not appear in the canonical store's traits list at all (store traits = chronomancy, concentrate, manipulate only). See Open flags.
  - The explicit "The object is not destroyed by the discharge" clause has no direct 5e textual counterpart (5e is silent on whether the object survives).

## Converter's notes

**Anchor:** "no clean analog — closest is Glyph of Warding (rank 3, trap-as-spell in 5e; PF2e has limited trap-spell precedent); Temporal Discharge is a unique stored-energy trap spell"

**Archetype:** utility/trap

**Balance bullets:**
- "10d6 damage on failure (avg 35) for a rank-4 trap spell is consistent with the rank-4 single-target save damage budget (8d6 ≈ 28; the trap context justifies slightly higher because the caster invested a 4th-rank slot to set it and it may be triggered much later)"
- "Basic Reflex save (5e Dex save → PF2e Reflex) correctly maps dodging an energy burst from a touched object"
- "Duration 'until discharged or next daily prep' caps the indefinite trap threat at daily prep cycles (not truly permanent per 5e); rare rarity reflects the unusual persistent-trap nature"
- "+2d6 per rank heightening for the trap is conservative (single-target save spells get +1-2 dice/rank; for a trap, +2d6 per rank keeps it competitive with freshly-cast damage spells)"

**Overridable:**
- "5e said 'permanent' — reduced to 'until next daily preparations'; GM may restore permanent duration for a rare spell if the table wants long-lasting magical traps"
- "The gemstone cost (25 gp consumed) is a design addition not in the 5e text; added to make the persistent trap have a material cost proportionate to the damage potential; GM may remove the cost"

**Checklist failures:** none listed.

## Similar official spells

- **Antlion Trap** (rank 3) — `apps/codex/.../spells/rank-3/antlion-trap.json`. Terrain-based hazard trap, basic Reflex save, 1-minute duration, forced-movement effect rather than direct damage. Comparable structural shape (basic-save trap-like effect) at one rank lower, but a battlefield-control trap rather than a triggered damage trap.
- **Temporary Glyph** (rank 5) — `apps/codex/.../spells/rank-5/temporary-glyph.json`. The closest functional match to Temporal Discharge's trigger mechanism: a hostile-spell glyph bound to a 5-foot square, triggered by entry, with an optional password to prevent triggering ("Speaking it when entering the spell's area prevents the glyph from triggering") — directly parallels Temporal Discharge's command-word safe-passage mechanic, at one rank higher and storing an arbitrary lower-rank spell rather than a fixed damage payload.
- **Antimagic Field** (rank 8) — not directly comparable in function, listed for the emanation/trap-adjacent zone-effect family (see Thaumaturgic dossiers for the real comparison).

## Prior astra touches

None. This spell does not appear in `apps/assay/homebrew/revisions.md` (0 deviations from the fresh adapter re-conversion of the vendored baseline — no hand edits since seeding).

## Open flags

- **Trigger-line markdown**: the "Trigger:" label is written as `**Trigger:**` (markdown bold) embedded directly inside an HTML `<p>` tag, while every other bolded label in the same description (Critical Success/Success/Failure/Critical Failure, Heightened) correctly uses HTML `<strong>` tags. In a renderer that only interprets HTML (Foundry/vellum), the asterisks will render as literal characters rather than bold text.
- **No structured heightening**: `system.heightening` is entirely absent despite the description containing a "Heightened (+1)" clause; both adapter warnings on this spell explain why (interval heightening + qualified defense text are description-appendix-only, per adapter policy).
- **Trait drop vs. jmnario's conversion**: the intermediate jmnario conversion (`all_spells_pf2e.json`) lists `"trap"` as a trait for this spell; the canonical store's `traits.value` is `["chronomancy", "concentrate", "manipulate"]` — no "trap" trait. Since revisions.md shows 0 deviations for this spell (the store matches a fresh adapter re-conversion exactly), this drop is adapter policy, not a hand edit.
- **Damage not structurally represented**: `system.damage = {}` despite the spell dealing typed, chosen-at-cast damage across four degrees of success — the numbers exist only in prose.
- **Detection wording**: "Recall Knowledge or Seek check against your spell DC" is plain prose, not formatted with PF2e's `@Check[...]` inline-roll syntax (unlike some official spells, e.g. Temporary Glyph's trigger-limiting language uses inline mechanics tags elsewhere in that family).
