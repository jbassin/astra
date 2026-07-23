# Zone of Minimization

## Header block

- **Rank:** 8
- **Routing:** `ledger:utility`
- **Pool reason:** ledger — `rawSkipReason`: "no-priceable-effect (no damage, no conditions,
  no modifiers)".
- **Current assay line (from `apps/assay/out/homebrew/scores.json`):** `kind: ledger`, no
  verdict/EV/residual (deliberately unpriced).
- **Adapter warnings (`flags.assay.adapterWarnings`):**
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage
    effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** antillurgy, concentrate, manipulate. Rarity: common.
- **Traditions:** arcane, occult.
- **Cast:** 2 actions (concentrate, manipulate).
- **Range:** 120 feet. **Target:** none (`target.value: ""`). **Area:** burst, 20 feet
  (structured — this one *does* parse cleanly, unlike Wall of Time/Worldweaver).
- **Defense:** none (`system.defense: null`).
- **Duration:** 1 minute, sustained.
- **Heightened:** fixed-rank, levels 9 and 10 (description appendix; no structured effect).

## The 5e original

- **Level/School:** 8th-level, school "antillurgy" (custom 5e school; source `tfc`).
- **Casting time:** 1 action.
- **Range:** 60 feet.
- **Components:** V, S (no material).
- **Duration:** Concentration, up to 1 minute.
- **Classes:** Sorcerer, Warlock, Wizard.

> You create a zone of antillurgic energy in a 20-foot-radius sphere around a point you can
> see. All damage caused by a creature within the zone is minimized; each damage die is
> treated as having rolled a 1.

No `entriesHigherLevel` field present (5e original has no upcast text).

## The conversion (canonical store)

> You saturate an area with antillurgic energy that collapses all damage potential within it
> to its barest minimum. While you sustain this spell, creatures inside the burst deal
> minimum damage on all of their damage rolls (each die result counts as 1, flat bonuses are
> unaffected). This effect applies to all creatures inside the zone regardless of alliance,
> including you.
>
> A creature that leaves the zone is no longer affected. A creature that enters the zone is
> immediately subject to the effect. The zone does not affect damage from spells or abilities
> that originate entirely outside the zone (though creatures inside who cast spells deal
> minimum damage with those spells' damage rolls as well).
>
> ---
> **Heightened (9th)** Flat damage bonuses are also minimized (treat as 0 instead of their
> normal value).
>
> **Heightened (10th)** The burst radius increases to 30 feet.

No degree-of-success structure (no save, no attack roll — purely an environmental/zone
effect). Structured fields agree with the prose: `area = {type: burst, value: 20}` matches
"20-foot-radius sphere"/"the burst"; `duration.value` = "1 minute" + `sustained: true`
matches "While you sustain this spell"; `range.value` = "120 feet" (see What Changed for the
range discrepancy vs. 5e's 60 feet).

## What changed, plain English

The core mechanic — a symmetric zone that forces every damage die inside it to read as a 1,
affecting caster and allies equally — carries through unchanged in substance. The changes:

- **Action cost:** 5e 1 action → PF2e 2 actions to cast.
- **Concentration → Sustain:** 5e Concentration up to 1 minute → PF2e Sustained up to 1
  minute (structurally equivalent).
- **Range: 60 feet (5e) → 120 feet (PF2e), a straight numeric increase with no 5e basis.**
  jmnario's own notes state this plainly: "5e 60 ft is below rank-8 PF2e norms; 120 ft is
  canonical" — an explicit power-scaling decision independent of the 5e text.
- **Explicit clarification, not present in 5e text, added:** "flat bonuses are unaffected"
  at base rank. 5e's text is genuinely ambiguous here ("each damage die is treated as having
  rolled a 1" — silent on flat bonuses). The PF2e conversion resolves that ambiguity in the
  caster's favor (flat bonuses survive at base) and then treats *suppressing* flat bonuses as
  a new heightened-9th upgrade. This interpretation is called out directly in jmnario's
  `changedElements` as a design choice, not a strict reading of 5e.
- **Added, no 5e basis: 10th-rank heighten (burst radius 20 ft → 30 ft).** 5e has no upcast
  text at all for this spell; both heightening tiers (9th flat-bonus suppression, 10th area
  increase) are new PF2e-only content.
- **Added, no 5e basis: explicit enter/leave-the-zone rules and the "originates entirely
  outside the zone" carve-out.** 5e's one-sentence description never addresses zone
  boundary crossing or spells cast from outside the area; the PF2e version adds a full
  paragraph of boundary-condition rulings that have no antecedent in the 5e text.
- **Added, no 5e basis: the `abjuration` trait** (dropped again during trait-hygiene, see
  Prior astra touches) — jmnario's rationale: "antillurgic energy suppresses damage output —
  this is a defensive/suppressive abjuration."
- **Nothing was dropped** from the 5e mechanical text; the base rule (all damage dice inside
  the zone read as 1, applies to everyone) survives intact.

## Converter's notes

**Anchor:** Wall of Fire (rank 4, sustained zone) and Stinking Cloud (rank 3, zone debuff) —
designed as a symmetric damage-suppression zone at rank 8.

**Archetype:** area control — sustained damage-suppression zone

**balanceBullets:**
- "Zone of Minimization deals no damage itself; it suppresses all damage in the area —
  symmetric (affects caster too) which is the critical balance feature preventing this from
  being a free always-on debuff"
- "20-ft burst is standard for rank 8 area spells; forcing minimum rolls (~average of 1 per
  die, plus flat bonuses) is a powerful effect but the symmetric risk and sustained-action
  requirement are the counterweights"
- "No save: the zone is environmental (like Wall of Fire) — creatures choose to enter or
  not; the denial of space is the tactical mechanic"
- "Heightened 9th: flat bonus suppression is a qualitative upgrade that doesn't change the
  base design"

**overridable:**
- "Flat bonus inclusion: 5e text said 'each damage die is treated as 1' which technically
  leaves flat bonuses intact; the design preserves this at base with rank-9 flat suppression
  as an upgrade; GM may include flat bonuses at base if they prefer the stricter 5e reading"
- "Symmetric vs. one-sided: 5e implied zone affects any creature inside; GM may allow caster
  to exclude self/allies from the effect (would require a save or be rank 9 base)"

**checklistFailures:** none.

## Similar official spells

- **Antimagic Field (rank 8)** — sustained 1-minute, 10-ft emanation that shuts off *all*
  magic (spells, magic items, spellcasting) inside the area, including the caster's own —
  the closest structural match at the exact same rank: a symmetric, self-affecting,
  sustained suppression zone. Antimagic Field's radius (10 ft emanation, self-centered) is
  much smaller than Zone of Minimization's (20 ft burst, placed anywhere within 120 ft), but
  its "affects you too" design principle is the direct precedent jmnario's symmetric-risk
  argument echoes.
- **Wall of Fire (rank 4)** — jmnario's own anchor; a sustained 1-minute zone/wall that deals
  damage to anything crossing or standing in it. Four ranks below Zone of Minimization, a
  useful floor for how PF2e prices a persistent sustained-area effect.
- **Stinking Cloud (rank 3)** — jmnario's other anchor; a sustained-duration area debuff
  (sickened on ending turn inside) with concealment. Five ranks below, another low-rank zone
  data point.
- **Confusing Colors (rank 8)** — same rank, 20-ft burst, a one-time save-based debuff zone
  (not sustained) rather than an ongoing suppression effect; useful as a same-rank/same-area
  contrast between a save-gated burst and Zone of Minimization's no-save environmental
  design.
- **Punishing Winds (rank 8)** — same rank, 30-ft cylinder sustained zone that impedes
  movement/flight; another same-rank sustained-area comparison, though its axis (movement
  denial) differs from Zone of Minimization's (damage denial).

## Prior astra touches

None found. `revisions.md` has no `Zone of Minimization` entry (store matches a fresh
re-conversion of the vendored baseline exactly — 0 hand-edit deviations). Not named in the
voice-sweep (§8) or item-6 deep-COLD list (§10) of `homebrew-triage.md`. Note: the
`abjuration` trait present in jmnario's intermediate conversion (`all_spells_pf2e.json`) is
absent from the canonical store's `traits.value` (which instead carries `antillurgy`, the
custom school) — consistent with the 2026-07-22 trait-hygiene sweep's policy of stripping
standard 5e school traits, but since this spell shows 0 deviations in `revisions.md`, that
stripping happened at the adapter/seed level rather than as a tracked hand-edit.

## Open flags

- **Base-rank ambiguity resolved in the caster's favor without an explicit 5e citation.**
  The description states "flat bonuses are unaffected" as if this were the plain reading of
  the 5e text, but the 5e original is genuinely silent on flat bonuses — this is an added
  interpretive clarification, not a transcription.
- **Heighten text is prose-only:** both `heightening.levels["9"]` and `["10"]` are empty
  objects; the flat-bonus suppression and burst-radius increase exist only in the
  description's "Heightened" paragraphs, per the adapter warning.
- **"Spells cast from inside the zone" carve-out has no explicit interaction with
  spell-attack rolls vs. spell damage** — the text says creatures inside "deal minimum
  damage with those spells' damage rolls," but doesn't address whether an inside caster's
  outgoing spell that also inflicts a condition (not just damage) is affected differently.
  Purely descriptive gap, not a structured-field issue.
- **No save, no defense field** (`system.defense: null`) is consistent with the "environmental
  effect" design read (matches Wall of Fire precedent), not a mismatch — noted for
  completeness since it stands out relative to most rank-8 area spells, which do gate on a
  save.
