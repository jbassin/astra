# Djura's Divine Protection

## Header block

- **Rank:** 9
- **Routing:** comparables
- **Pool reason:** wide-range (scorer comparables rank range 2–9 — LOW-INFORMATION, that is why it is in the manual pool)
- **Current assay line:** no quantitative verdict recorded for this spell in the chunk list (comparables routing, wide-range low-information)
- **Adapter warnings (flags.assay.adapterWarnings):**
  - "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** concentrate, kosmoturgy, manipulate (rarity: common)
- **Traditions:** divine
- **Cast:** 2 actions
- **Range:** 30 feet
- **Target:** up to 8 willing creatures
- **Defense:** none
- **Duration:** 10 minutes (not sustained; `duration.sustained=false`)

## The 5e original

- **Level:** 9
- **School:** kosmoturgy
- **Casting time:** 1 action
- **Range:** 30 feet
- **Components:** V, S, M (a piece of folded steel)
- **Duration:** 10 minutes (not concentration)
- **Classes:** Cleric, Paladin

> You grant up to eight willing creatures within range a hardened layer of air compressed to the point of becoming solid around their bodies. For the duration of the spell, the target creatures gain resistance to bludgeoning, piercing, slashing, and force damage. Additionally, all affected creatures have advantage on death saving throws.

No `entriesHigherLevel` block in the 5e original.

## The conversion (canonical store)

Djura's signature ward compresses a layer of air to the density of tempered steel around the bodies of your allies. For the duration, each target gains resistance 10 to bludgeoning, piercing, and slashing damage, as well as resistance 10 to force damage. Additionally, each target gains a +2 status bonus to recovery checks while `Dying` (`@UUID[Compendium.pf2e.conditionitems.Item.Dying]` — a link to the PF2e condition item, rendered here as plain text).

**Heightened (+1)** The resistance increases by 5.

No `@UUID[...]` references beyond the single `Dying` condition link. Structured fields agree with the prose: `duration.sustained=false, value="10 minutes"` matches, `range.value="30 feet"` matches, `target.value="up to 8 willing creatures"` matches.

## What changed, plain English

The core "mass physical-damage resistance + death protection" shape is preserved, with the death-protection mechanic re-mapped to PF2e's dying-recovery system and the flat resistance value calibrated up.

- **Numbers:** 5e grants **resistance** (effectively half damage) to bludgeoning/piercing/slashing/force with no numeric value (resistance is binary in 5e — you either have it or not). PF2e assigns a flat **resistance 10** to the same four damage types, heightening by +5 per rank above 9th. This is a genuine numeric addition/calibration, not present as a number in the 5e original at all.
- **Structure:** 5e's "advantage on death saving throws" became PF2e's **+2 status bonus to recovery checks while Dying** — the converter's own notes explain this as the closest PF2e-idiomatic translation (PF2e has no advantage mechanic; recovery/flat checks are PF2e's death-saving-throw analog).
- **Content dropped:** the 5e material component ("a piece of folded steel") was dropped, consistent with the Remaster's no-material-components convention.
- **Content added:** none beyond the numeric resistance value itself (5e's binary resistance had to be assigned *some* PF2e number; "10" and the "+5 per heighten" scaling are the converter's own calibration, anchored to Energy Aegis per the converter's notes).

## Converter's notes

**Anchor:** Energy Aegis (rank 7, resistance 5 to all 8 energy types) — mass physical resistance at rank 9 calibrated above Energy Aegis by 2 ranks = resistance 10

**Archetype:** buff — mass physical resistance

**balanceBullets:**
- "Resistance 10 to B/P/S and force for 8 targets at rank 9 — Energy Aegis (rank 7) gives resistance 5 to all 8 energy types for 1 creature; scaling up 2 ranks doubles the resistance and extends to 8 targets, which is calibrated at rank 9"
- "+2 status to dying flat checks (DC 11 → effectively DC 9) is a meaningful death-protection buff without being unkillable; 5e advantage is roughly a +5 effective bonus which would be too strong, so +2 status is the conservative conversion"
- "10-minute exploration-grade duration is appropriate for pre-combat warding; does not need to be sustained because it is a passive resistance layer"
- "8 targets at 30-ft range at rank 9: Haste heightened to rank 7 hits 6 targets; rank 9 for 8 targets is proportional"

**overridable:**
- "Resistance value: 5e was full resistance (half damage) which is effectively resistance equal to half incoming damage — a flat resistance 10 is more PF2e-idiomatic and avoids the 'scales with hit power' issue; GM may use resistance 15 to be closer to 5e feel"
- "Named focus-spell suggestion: Djura's Divine Protection fits the PF2e focus-spell template (class-specific, strong effect, single cast per recharge) — GM may convert to a focus spell for a Djura paladin archetype"

**checklistFailures:** none.

## Similar official spells

- **Energy Aegis (rank 7)** — the converter's own cited anchor. Single-target resistance 5 to eight energy types (acid, cold, electricity, fire, force, sonic, vitality, void), heightening to resistance 10 at 9th. Two ranks below Djura's Divine Protection, single-target rather than 8-target, and covers energy types rather than physical types — the direct anchor point cited for calibrating the resistance-10 value.
- **Prismatic Armor (rank 7)** — single-target resistance 5 to seven damage types (acid, electricity, fire, force, mental, poison, sonic), heightening to resistance 10 at 9th, plus a Blinded-instead-of-Dazzled rider on a critical-failure saving throw against the spell. Two ranks below; another single-target high-rank resistance-package comparable.
- **Scintillating Safeguard (rank 6)** — reaction, triggers when an effect would deal physical or energy damage; grants resistance 10 against one chosen damage type for that triggering effect only (to each target in range). Three ranks below; compares on the flat resistance-10 number but is reactive and single-effect rather than a standing multi-type ward.

## Prior astra touches

`revisions.md` lists one deviation for Djura's Divine Protection:

- `description`: length delta −165 chars (store=469, baseline=634)

Per `homebrew-triage.md` §8 (voice sweep, 2026-07-22, stakeholder-directed), this spell was one of 13 fixed for out-of-world/editor voice — specifically the "associated with X / conversion noted as unusual / see notes" catalog-paragraph pattern (grouped with Almonk's Retribution and Laixa's Expert Intuition). jmnario's raw conversion included a trailing paragraph — "This is a named spell in the Djura tradition. In PF2e, it is recommended as a focus spell for the Djura class archetype — see notes." — which was removed from the store's description. The same pass is also credited with a "bonus 5e-ism" fix: **"death-saving throws" → "recovery checks"** (jmnario's raw description used the phrase "+2 status bonus to death-saving throws (the flat checks made when dying)"; the store now reads "+2 status bonus to recovery checks while Dying").

## Open flags

- The adapter warning notes the heightened (+1) entry ("resistance increases by 5") is "kept as a description appendix only" — there is no `heightening` key at all in this spell's JSON (unlike some other item-7 spells that at least carry an empty `heightening.levels` object), so the heighten text lives solely in the prose.
- jmnario's raw (pre-astra) conversion recommended this spell be converted to a **focus spell** for a "Djura class archetype" — that suggestion is preserved in the converter's notes (`overridable`) but was removed from the live description text during the voice sweep; it survives only in the vendor notes file, not in the store or in any player-facing text.
