# Reduce Resistivity

## Header block

- **Rank:** 5
- **Routing:** ledger:unpriced-modifier
- **Pool reason:** ledger
- **Current assay line:** no verdict/range/residual supplied in the chunk-10 triage list (ledger-routed, not quantitatively scored)
- **Adapter warnings** (`flags.assay.adapterWarnings`):
  1. "interval ('+N') heightening text is not a pure damage bump — kept as a description appendix only, not structurally represented"
- **Traits:** antillurgy, concentrate, manipulate (rarity: common)
- **Traditions:** arcane, occult
- **Cast:** 2 actions (`system.time.value = "2"`)
- **Range:** 60 feet
- **Target:** 1 creature
- **Area:** none
- **Defense:** Fortitude save, non-basic (`system.defense.save.basic = false`)
- **Duration:** not sustained, "1 minute"
- **Damage:** none
- **Seeded from:** convertedName "Reduce Resistivity" / originalName "Reduce Resistivity" (run_balance commit `efc8e310210a2577411c62ee95f09a58ef79f164`)

## The 5e original

- **Level:** 5th
- **School:** Antillurgy (homebrew school)
- **Casting time:** 1 action
- **Range:** Point, 60 feet
- **Components:** V, S (no material)
- **Duration:** 1 minute, no concentration
- **Classes:** Sorcerer, Warlock, Wizard
- **Ritual:** No

> You wear down the magical defenses of a creature you can see. The creature must make a Constitution saving throw. If the saving throw fails, the creature has disadvantage on saving throws against magic for the duration of this spell.

No "At Higher Levels" entry in the 5e original — the base version has no explicit upcast text.

## The conversion (canonical store)

You tear at the magical defenses of a target creature, leaving its arcane shielding in tatters. The creature must attempt a Fortitude saving throw.

**Critical Success** The creature is unaffected.
**Success** The creature takes a –1 status penalty to saving throws against spells for 1 round.
**Failure** The creature takes a –2 status penalty to saving throws against spells for 1 minute. Additionally, the first time the creature benefits from its resistance to a damage type during this duration, that resistance is reduced by 5 until the end of its next turn.
**Critical Failure** As failure, but the penalty is –3 to saving throws against spells, and all of the creature's resistances to damage are reduced by 5 for the duration.

---

**Heightened (+2)** The status penalty to saving throws against spells on failure increases by 1 (to –3 on failure, –4 on critical failure), and the resistance reduction increases by 5.

No structured-field disagreements found — the non-basic Fortitude save in `system.defense` matches the four-degree prose structure, and there's no damage to cross-check.

## What changed, plain English

The core "wear down magical defenses, weaken saves against magic" concept, the single-target 60-foot range, and the 1-minute duration are all preserved.

- **Numbers/organ mapping:** 5e's Constitution saving throw becomes PF2e's Fortitude save (direct organ equivalent). Casting time is unchanged in spirit (5e 1 action) but the store records `system.time.value = "2"` — a 1-action → 2-action increase (see Open flags, same pattern noted on Rearrange Fate in this chunk).
- **Structure — degrees of success invented:** 5e's binary pass/fail ("if the saving throw fails, disadvantage on saving throws against magic for the duration") becomes a full four-degree PF2e structure with escalating penalties: crit success = unaffected (new, no 5e equivalent since 5e has no crit-success-on-saves), success = a *mild* –1 status penalty for just 1 round (this exists on a *success* in the store, where 5e's original grants **no effect at all** on a success), failure = –2 status penalty for the full 1-minute duration, critical failure = –3 penalty plus draining all resistances by 5. In other words, the store version does something even on a save the target passes, which the 5e mechanic never does.
- **"Disadvantage" mapped to a status penalty:** 5e's disadvantage-on-saves-vs-magic has no direct PF2e equivalent (PF2e doesn't have a disadvantage mechanic), so it's translated to a numeric status penalty (–2 to –4 depending on degree/heighten) rather than a roll-twice-take-worse mechanic — jmnario's notes call this "the closest PF2e equivalent" explicitly.
- **Content added — resistance reduction:** the "resistance to a damage type is reduced by 5" (failure) / "all resistances reduced by 5" (critical failure) clauses are entirely new; the 5e original only ever affects saving throws, never damage resistance. This is a wholly invented secondary effect layered onto the conversion.
- **Heightening:** the 5e original has no "At Higher Levels" text at all; the store's `+2`-interval heighten (bumping both the save penalty and the resistance-reduction amount) is entirely new content.
- **Save-vs-spells scope narrowed then reframed:** 5e's "disadvantage on saving throws against magic" (broad — any save vs. any magical effect) becomes the store's "status penalty to saving throws **against spells**" — narrower in name (spells specifically, vs. "magic" broadly) but functionally similar in most play, since most magical effects requiring a save are spells.

## Converter's notes

**Anchor:** "Slow (rank 3, non-basic Fortitude debuff) — Reduce Resistivity is a single-target anti-save debuff at rank 5"

**Archetype:** debuff / control

**Balance bullets:**
- "–2 status penalty to saves vs spells is meaningful but not dominant; status doesn't stack with itself, so it's wasted if another –2 status source is active"
- "Fortitude save (Con→Fort) is appropriate for a 'wear down magical defenses' effect targeting physical resilience"
- "Resistance reduction on failure/crit-fail adds a secondary layer that rewards targeting resistant enemies specifically"
- "1-minute duration at rank 5 is exactly right for a combat debuff"

**Overridable:**
- "The resistance reduction could be removed to simplify the spell to a pure saves-vs-spells debuff"
- "The save penalty could be applied to all saves (not just vs spells) to make the spell more generally useful at the cost of duplicating Ward saves-type effects"

**Checklist failures:** none.

## Similar official spells

- **Slow** (rank 3) — non-basic Fortitude save, target becomes Slowed 1 for 1 round (success) or 1 minute (failure), Slowed 2 for 1 minute (crit failure). The converter's own stated anchor; two ranks below Reduce Resistivity, shows the same "duration scales with degree of success, non-basic Fortitude" shape at a lower rank/lower-stakes debuff.
- **Chroma Leach** (rank 4) — Fortitude save (with a conditional circumstance penalty for gnomes), inflicts Enfeebled + Drained on failure, worse on critical failure. One rank below Reduce Resistivity; same "single-target Fortitude debuff with an escalating condition on worse outcomes" archetype, useful for comparing what a rank-4 non-basic-Fortitude debuff's failure tier looks like against Reduce Resistivity's rank-5 saves-vs-spells penalty.
- **Bane** (rank 1) — Will save, –1 status penalty to attack rolls while in a sustained emanation. Four ranks below Reduce Resistivity; illustrates the baseline cost of "a –1 status penalty debuff" at rank 1, useful scale reference against Reduce Resistivity's –2/–3 (heightened –3/–4) status penalty to saves at rank 5.

## Prior astra touches

None found — no `reduce-resistivity` entries in `revisions.md` (matches the fresh baseline re-conversion exactly).

## Open flags

- Action-cost mismatch: the 5e original is a 1-action cast; the store's `system.time.value` is "2" — a cost increase not discussed anywhere in jmnario's `changedElements` (which covers the save-type mapping, degree-of-success breakdown, resistance-reduction addition, and Constitution→Fortitude mapping, but not action cost). The same pattern (1-action 5e original → 2-action store) also appears on Rearrange Fate in this chunk, suggesting it may be a systematic conversion-pipeline default rather than a per-spell decision.
- The store grants a mild effect (–1 status penalty for 1 round) even on a **success**, where the 5e original explicitly does nothing at all on a successful save — this is a real functional expansion of the spell's floor, not just a degree-of-success reformatting.
- The damage-resistance-reduction mechanic has zero basis in the 5e source text — it's a wholly new secondary payload added during conversion, not adapted from any 5e upcast or base-effect language.
- Routing is "ledger:unpriced-modifier" — distinct from most of this chunk's other ledger-routed spells (which route as ledger:utility or ledger:long-cast); this spell's resistance-reduction-by-5 and stacking status-penalty mechanics are apparently flagged by the ledger as modifiers without an established pricing convention, consistent with jmnario's own "no clean analog" anchor framing.

## Options & staff lean (enrichment, 2026-07-23)

Two of the dossier's flags are FALSE POSITIVES: the effect-on-success tier is standard
PF2e non-basic-save idiom (Slow — the converter's own anchor — grants Slowed 1 for 1
round on a SUCCESS), and the 1A→2A cast is the documented systemic 5e-action→2-action
mapping, not a per-spell choice. The disadvantage→status-penalty translation is correct
(PF2e has no disadvantage).

The one real judgment call: the resistance-reduction payload (−5 on failure, all
resistances on crit fail) is wholly invented — no 5e basis. It's flavorful antillurgy
identity and situational in power; the converter offered removing it as an overridable.

- **A. Keep as-is** — the invented payload rewards targeting resistant enemies, fits the
  school, and nothing prices as over-budget at r5.
- **B. Trim the resistance-shred to a pure saves-vs-spells debuff** — simpler, more
  faithful; loses the spell's only distinctive texture.

**Lean: A.**
