# Lucky Ward

## Header block

- **Rank:** 2 · **Routing:** `ledger:unpriced-modifier` · **Pool reason:** ledger (no quantitative/comparables verdict computed; sits in the manual ledger-review pool)
- **Current assay line:** verdict = none / rankRange = none / residualRanks = none (queue.json: `routing: "ledger:unpriced-modifier"`, `poolReason: "ledger"`, `verdict: null`)
- **Adapter warnings:**
  - "defense text has qualifiers beyond the base save/attack shape, not structurally represented (only the primary save/attack-roll mapped): 'Will save (enemies only)'"
  - "fixed-rank heightening text has no structurally-parseable damage bump (a non-damage effect, e.g. added targets/area) — kept as a description appendix only"
- **Traits:** aura, concentrate, emotion, manipulate, mental, mercuromancy · **Rarity:** common
- **Traditions:** arcane, occult
- **Cast:** 2 actions · **Range:** self · **Area:** 30-foot emanation · **Target:** none
- **Defense:** Will save (basic: false) — per the adapter warning, this structurally captures only the enemy-facing save; allies do not save
- **Duration:** sustained, "1 minute"
- **Cost:** none (`cost.value` empty string)

## The 5e original

- **Name:** Lucky Ward · **Source:** tfc (homebrew) · **Level:** 2 · **School:** mercuromancy
- **Casting time:** 1 action
- **Range:** self (point)
- **Components:** V, S (no material)
- **Duration:** Concentration, 1 minute
- **Classes:** Bard, Druid, Seeker (SW), Sorcerer, Warlock, Wizard

> You manipulate the threads of fate to your favor in the area around you. This creates a 30-foot-radius dome centered on you in which your allies are luckier and your enemies are disfavored. Each ally in the aura adds 1d4 to its attack rolls and saving throws. Enemies must subtract 1d4 from their attack rolls and saving throws while they are inside the aura.

No `entriesHigherLevel` block in the 5e source (no native 5e upcast text).

## The conversion (canonical store)

You twist the threads of fate in a dome around yourself so that fortune favors your companions and turns its back on your foes. Allies in the emanation gain a +1 status bonus to attack rolls. Each enemy in the area when you Cast the Spell — and each enemy that enters or starts its turn in the area afterward — must attempt a Will save; resolve the save separately for each enemy, and once an enemy has rolled, it doesn't roll again from this casting.

- **Critical Success** The enemy is unaffected and is temporarily immune for 10 minutes.
- **Success** The enemy is unaffected.
- **Failure** The enemy takes a -1 status penalty to attack rolls while inside the emanation.
- **Critical Failure** As failure, and the penalty also applies to the enemy's saving throws while inside the emanation.

---

**Heightened (6th)** The status bonus and penalty both increase to +2 / -2.

**Heightened (9th)** Both increase to +3 / -3.

No `@UUID` references. Structural note: `system.target.value` is an empty string (no discrete target — an area/aura effect), consistent with the prose. `heightening.levels = {"6": {}, "9": {}}` matches the two Heightened blocks, both text-only per the adapter warning.

## What changed, plain English

- **Numbers:** 5e's ±1d4 (avg ±2.5) to attack rolls **and** saving throws, for both allies and enemies, is reduced to a flat +1/-1 status bonus/penalty to attack rolls only (base rank). The save-side effect is not granted at all on a base success/failure — it only appears on an enemy's Critical Failure.
- **Structure:** 5e was a single flat, unconditional effect on both sides (no save for enemies at all — the debuff simply applied). The conversion adds a full four-degree Will save for enemies: Critical Success (unaffected + 10-minute immunity), Success (unaffected), Failure (-1 to attack), Critical Failure (-1 to attack AND saves). Allies get their +1 automatically, no save, matching 5e's ally-side "always applies" behavior.
- **Rank:** 5e level 2 → PF2e rank 2 (unchanged), but the converter's notes frame this as "combining Bless (rank 1) + Bane (rank 1) into one rank-2 spell," i.e., the rank was held at parity with the source level despite folding two rank-1-equivalent effects together.
- **Save added where 5e had none:** the entire enemy-side Will save structure (including the immunity clause and crit-fail escalation) has no 5e basis — 5e enemies simply always took the -1d4 penalty with no save to resist it.
- **Duration:** 5e Concentration 1 minute → PF2e sustained up to 1 minute (functionally equivalent combat-grade cap).
- **Action economy:** 5e 1 action → PF2e 2 actions to cast.
- **Heightening:** 5e had none. The conversion adds two fixed-rank heightened tiers (6th: ±2, 9th: ±3) with no 5e basis, following what the converter's notes call the "Heroism status-bonus curve."
- **Traits added with no 5e basis:** aura, emotion, mental, mercuromancy (school-derived), concentrate, manipulate.

## Converter's notes

- **Anchor:** "Bless (rank 1) + Bane (rank 1), combined into one rank-2 emanation"
- **Archetype:** buff/debuff (aura)
- **Balance bullets:**
  - "Anchored to Bless+Bane combined: rank-1 published spells doing one side each (ally +1 status to attacks / enemy −1 status to attacks). Combining both into one cast justifies the bump to rank 2."
  - "5e's ±1d4 to attacks AND saves was reduced to ±1 to attacks (saves only on crit fail). At rank 2, a flat status bonus to all saves would eclipse Heroism (rank 3, +1 status to everything)."
  - "Sustained up to 1 minute matches both Bless and Bane's published duration tier — combat-grade buff cap."
  - "Heightening follows the Heroism status-bonus curve (+1 at rank 1, +2 at rank 6, +3 at rank 9). Cap at +3 because status bonuses don't stack with themselves."
  - "30-ft emanation is larger than Bless/Bane's starting 5-ft because the rank bump and combined effect compensate — comparable footprint to Heroism's 30-ft variants."
- **Overridable:**
  - "Could be redesigned as a 1-action 5-ft-emanation cast with a sustain-to-grow scaling (Bless/Bane structure) for tighter fidelity to the anchors."
  - "Could keep ±1d4 (status bonus die instead of flat) at rank 2 — closer to 5e fidelity but breaks PF2e's no-stacking-status-die convention."
  - "Could lift the saves-only-on-crit-fail rider out entirely and stay rank 2; then heighten could add it back at rank 6."
- **Checklist failures:** none recorded.

## Similar official spells

- **Bless (rank 1)** — the converter's own anchor: +1 status to attack rolls in a 15-ft emanation, sustain-to-grow radius, no save required, no enemy-facing component. One-sided half of what Lucky Ward does.
- **Bane (rank 1)** — the converter's other anchor: -1 status to attack rolls for enemies in a 10-ft emanation, Will save (no degrees of success beyond pass/fail — a flat penalty on failure, no crit-fail escalation), sustain-to-grow radius. The other one-sided half.
- **Heroism (rank 3)** — flat +1/+2/+3 status bonus to attack, Perception, saves, and skill checks (heightened at 6th/9th) via touch, no save, no area, no enemy component. Cited by the converter as the ceiling that a rank-2 save bonus would "eclipse."
- **Warding Aggression (rank 3)** — single-target melee-Strike-gated ward granting +1/+2/+3 status to AC against one foe based on degree of success, ends if you stop attacking that foe. A same-tradition example of a status-bonus spell keyed to degree-of-success tiers, though single-target/AC rather than aura/attack.
- **Calm (rank 2)** — same rank, Will save, 10-ft burst, four-degree structure (unaffected / -1 status to attack / suppressed hostility / persistent suppression). A same-rank comparable for "Will save with an attack-roll penalty on a failure tier."

## Prior astra touches

None. `revisions.md` has no entry for Lucky Ward — the store matches a fresh in-memory re-conversion of the vendored baseline exactly (0 deviations); it has not been hand-edited since seeding.

## Open flags

- The `defense.save` field structurally represents only "Will save," losing the "(enemies only)" qualifier the adapter itself flags — allies never save, but the structured field doesn't distinguish that from a spell where everyone saves.
- 5e's save-side penalty (±1d4 to saving throws for both allies and enemies) survives in the conversion only as an enemy Critical-Failure rider ("the penalty also applies to the enemy's saving throws") — allies never gain any save bonus at any degree, a full drop of half of 5e's ally-side effect.
- Both fixed-rank Heightened entries (6th, 9th) are text-only in `system.heightening.levels` (empty `{}` objects), per the adapter's own warning.
