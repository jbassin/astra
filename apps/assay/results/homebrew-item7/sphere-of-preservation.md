# Sphere of Preservation

## Header block

- **Rank:** 6 (store `system.level.value` = 6)
- **Routing:** ledger:utility
- **Pool reason:** ledger
- **Adapter warnings:** "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** concentrate, manipulate, mercuromancy
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`time.value` = "2")
- **Range:** self
- **Targets:** (none — `target.value` = "")
- **Area:** 30-foot emanation
- **Defense:** none (`system.defense` = null)
- **Duration:** 1 minute, sustained
- **Rarity:** common
- **Publication:** "Homebrew (run_balance)", remaster = true, license OGL

## The 5e original

- **Level:** 6
- **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** Self (30-foot radius)
- **Components:** V, S (no material)
- **Duration:** Concentration, up to 1 minute
- **Classes:** Bard, Druid, Sorcerer, Warlock, Wizard (PHB), Seeker (SW)

> You remove luck and randomness to leave only order in a sphere around you. All ability checks, saving throws, attack rolls, and damage rolls that take place in a 30-foot-radius sphere around you automatically roll their average value, rounded down.

No `entriesHigherLevel`.

## The conversion (canonical store)

> You collapse probabilistic variance in a sphere around you, enforcing strict determinism. While this spell is sustained, all creatures inside the 30-foot emanation — ally and enemy alike — treat random rolls as if they had rolled the median value on each die (round down for half dice; for a d6 treat as 3, a d8 as 4, a d10 as 5, a d12 as 6, a d4 as 2). This affects all dice rolls that occur entirely within the emanation: attack rolls, damage rolls, and saving throw rolls. It does not affect flat checks or checks not involving dice. Fortune and misfortune effects that would cause rerolls do not apply within the sphere; only the median result stands. The sphere moves with you. Casting another spell while sustaining this one is permitted — the sustain cost is paid separately.
>
> ---
> **Heightened (8th)** The emanation expands to 60 feet.
>
> **Heightened (10th)** The emanation expands to 120 feet and also suppresses fortune/misfortune effects in the area.

Structured fields: `system.damage` = `{}` (no direct damage — correct, this is a pure control effect). `system.defense` = null (no save — matches the prose's explicit "no save required" design). `system.heightening` = `{type: "fixed", levels: {"8": {}, "10": {}}}` — both level objects are empty; the area-expansion deltas exist only in prose, per the adapter warning.

**Note on the 10th-rank heighten text specifically:** the base-rank description already states "Fortune and misfortune effects... do not apply within the sphere," but the 10th-rank heighten text says the area "also suppresses fortune/misfortune effects" — implying this suppression is a NEW effect added at rank 10, when it's actually already present at the base rank. This is an internal prose disagreement, not a structured-field issue (see Open flags).

## What changed, plain English

The core "everything in the sphere rolls the average" idea and its ally-and-enemy-alike symmetric downside are preserved. The main departures are in mechanical scope and added riders.

- **Scope of "average":** 5e explicitly says "ability checks, saving throws, attack rolls, and damage rolls... automatically roll their average value, rounded down" — a simple flat average. PF2e's conversion narrows this to a **median-per-die-type table** (d4→2, d6→3, d8→4, d10→5, d12→6) applied per individual die rather than a flat average of the whole roll, and explicitly excludes "flat checks or checks not involving dice." This is a more granular, more precisely defined mechanic than the 5e original, not merely a re-statement of it.
- **Added rider (no 5e basis):** the fortune/misfortune suppression clause ("Fortune and misfortune effects that would cause rerolls do not apply within the sphere") has no counterpart anywhere in the 5e entry — it's new content added to close what the converter's own notes call a "necessary adjunct" gap (see Converter's notes).
- **Added rider (no 5e basis):** "Casting another spell while sustaining this one is permitted — the sustain cost is paid separately" is new clarifying text with no 5e analog (5e's concentration rules already implicitly allow casting non-concentration spells while concentrating; this sentence spells out compatibility with PF2e's separate Sustain-cost economy).
- **Action cost:** 5e 1 action → PF2e 2 actions to cast.
- **Heighten:** entirely new — 5e has no upcast text; PF2e adds two heighten steps (8th: 60 ft, 10th: 120 ft + explicit fortune/misfortune suppression) with no 5e basis.
- **Nothing dropped:** the ally/enemy symmetry, the "sphere moves with you," and the round-down-for-half-dice rule are all preserved.

## Converter's notes

- **Anchor:** "no clean analog — unique determinism mechanic; closest is Foresight (rank 9 Fortune) but Sphere of Preservation is the inverse"
- **Archetype:** control/utility (probability field)
- **Balance bullets:**
  - "No canonical PF2e spell forces median-value rolls; this is a genuinely unique effect that could be extremely powerful in specific party compositions (eliminates natural 1s and natural 20s for all, friend and foe)."
  - "The spell affects allies and enemies equally — the harm is symmetric, which is the primary balance lever."
  - "Fortune and misfortune suppression is a necessary adjunct: without it the spell interacts badly with Inspire Courage, Hero's Defiance, and similar features that are balanced around the variance they modify."
  - "Paired with Sphere of Ruin (rank 7, other batch): Preservation enforces order (median values), Ruin presumably enforces chaos (maximum variance). The pairing is mechanically coherent."
  - "Sustained up to 1 minute is the correct combat-grade cap."
- **Overridable:** "The median-value mechanic has no PF2e precedent; a GM may prefer to replace it with a simpler 'no critical hits or critical failures in the area' effect to avoid per-die-type calculation overhead." / "Sphere could be enemy-only (not affect allies) — would be a significant power increase and would likely need to move to rank 7 or 8." / "Fortune/misfortune suppression could be removed and left to interpretation."
- **Checklist failures:** "No counteract-check mechanic is defined for dispelling the determinism field — the standard 'counteract rank = spell rank 6' applies but the GM should note that a successful Dispel Magic at rank 6 ends this field, which interacts oddly if the field suppresses fortune effects used in Dispel Magic itself."

## Similar official spells

- **Foresight** (rank 9) — the converter's own stated anchor; grants a warning-based defensive bonus (immune to being surprised, +2 circumstance to AC/Reflex/Perception for the target). Named as "the inverse" of Preservation's effect but is a single-target buff, not an area determinism field — the comparison is thematic (probability manipulation), not mechanical.
- **Slow** (rank 3) — a single-target save-based action-denial control spell; useful as a low-rank contrast for how much a rank-6 area-control effect should cost relative to single-target control.
- **Confusion** (rank 4) — area save-based randomization of ENEMY behavior only (no ally-harm symmetry); a useful contrast since Sphere of Preservation deliberately harms allies too.
- **Synesthesia** (rank 5) — an area/single-target sensory-disruption debuff imposing concentrate-action flat checks and reduced ranges; one rank below, illustrates a rank-5 "battlefield-wide friction" effect for comparison against Preservation's rank-6 friction effect.
- No official spell forces average/median die results — the converter's own anchor note ("no clean analog") is accurate; this is confirmed by the absence of any matching mechanic in the searched snapshot.

## Prior astra touches

Checked `apps/assay/homebrew/revisions.md`: **no entry** for "Sphere of Preservation" — 0 deviations from a fresh re-conversion of the vendored baseline (store matches adapter output exactly). The trait set (`concentrate, manipulate, mercuromancy`) replaces jmnario's "abjuration" trait with the custom "mercuromancy" school-trait tag (mapped from the 5e school field) — this is baked into the current adapter code, consistent with the repo-wide trait-hygiene/school-traits sweep, not a spell-specific hand edit.

## Open flags

- Internal prose inconsistency: the base-rank text already states fortune/misfortune effects "do not apply within the sphere," but the rank-10 heighten text says the area "also suppresses fortune/misfortune effects" as if this were new at rank 10. The rank-10 heighten's actual novel content is only the area increase to 120 feet; the fortune/misfortune clause reads as redundant or possibly meant to restate scope rather than add a new effect.
- The converter's own checklist-failure note flags an unresolved rules interaction: a rank-6 counteract check (e.g., Dispel Magic) targeting this field would itself be affected by the field's own fortune-suppression if cast from within it — recorded by the converter as unresolved, not addressed in the current description text.
- No standing curse-removal convention applies (spell has no curse trait). No affliction structure, no reaction trigger, no residual 5e condition names, and no material-component residue (5e had none) — clean on those axes.
- Traits include the custom homebrew school-trait tag "mercuromancy" (mapped from the 5e school field), which has no counterpart in the standard PF2e trait taxonomy.
